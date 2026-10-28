#!/usr/bin/env node
// =============================================================
// LA MESA · conector de herramientas del equipo creativo (28-oct).
// Tres herramientas que escriben en el tablero compartido de UNA pieza (el libro de aportes) llamando a la plataforma:
//   mesa_pedir(a, que, para_que)     · le anota un pedido a un compañero (responde en SU turno; no se espera)
//   mesa_devolver(a, comentarios)    · le devuelve su aporte con comentarios
//   pedir_material(que, para_que)    · le pide al portero material del cerebro del cliente (lo que trae vuelve al tablero)
// Reglas de oficio:
//   · NUNCA informa éxito si la plataforma no lo confirmó: una respuesta vacía, no autorizada o con error vuelve como ERROR a quien llamó
//     (lección del portero: «Authorization data is wrong!» se tomó como éxito y se perdió un turno entero);
//   · el encargo y el agente salen del ENTORNO que fija el corredor, no de lo que diga el modelo (nadie pide «en nombre de» otro);
//   · una sola copia del contrato: la plataforma valida (compañero activo, profundidad, idas y vueltas, duplicados).
// Sibling package.json {"type":"commonjs"} fuerza CJS aunque el servicio sea ESM.
// =============================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')

const PLATFORM_URL = (process.env.ZR_PLATFORM_URL || '').replace(/\/+$/, '')
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || ''
const ENCARGO_ID = process.env.ZR_ENCARGO_ID || ''
const AGENTE = process.env.ZR_AGENTE || ''
const TIMEOUT_MS = 20000

const fallo = (mensaje) => ({ isError: true, content: [{ type: 'text', text: mensaje }] })
const bien = (cuerpo) => ({ content: [{ type: 'text', text: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }] })

/** una llamada a la plataforma; devuelve {ok, cuerpo} o {ok:false, error} — nunca lanza */
async function llamar(herramienta, args) {
  if (!PLATFORM_URL || !INTERNAL_KEY || !ENCARGO_ID || !AGENTE) return { ok: false, error: 'la herramienta no está configurada en este turno (falta la dirección de la plataforma, la llave o el encargo)' }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`${PLATFORM_URL}/api/oficina/mesa/herramienta`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': INTERNAL_KEY },
      body: JSON.stringify({ encargo_id: ENCARGO_ID, de: AGENTE, herramienta, ...args }),
    })
    const texto = await r.text()
    let cuerpo = null
    try { cuerpo = texto ? JSON.parse(texto) : null } catch { /* no era JSON */ }
    if (!r.ok) return { ok: false, error: `la plataforma contestó ${r.status}: ${(cuerpo && (cuerpo.detalle || cuerpo.error)) || texto.slice(0, 200) || 'sin cuerpo'}` }
    if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'la plataforma contestó vacío: el pedido NO quedó anotado' }
    if (cuerpo.ok !== true) return { ok: false, error: String(cuerpo.motivo || cuerpo.error || 'la plataforma no confirmó el pedido') }
    return { ok: true, cuerpo }
  } catch (e) {
    return { ok: false, error: `no se pudo hablar con la plataforma: ${e && e.name === 'AbortError' ? 'tiempo agotado' : (e && e.message) || String(e)}` }
  } finally {
    clearTimeout(t)
  }
}

const servidor = new McpServer({ name: 'mesa', version: '1.0.0' })

servidor.tool(
  'mesa_pedir',
  'Le anotas un pedido a un compañero del equipo en el tablero de la pieza. Responde en SU turno; tú no esperas: sigue con tu aporte.',
  { a: z.string().min(1).describe('el compañero (tal como aparece en el directorio)'), que: z.string().min(3).describe('qué le pides, concreto'), para_que: z.string().optional().describe('para qué lo necesitas') },
  async ({ a, que, para_que }) => {
    const r = await llamar('mesa_pedir', { a, que, para_que })
    return r.ok ? bien(r.cuerpo) : fallo(r.error)
  },
)

servidor.tool(
  'mesa_devolver',
  'Le devuelves a un compañero su aporte con comentarios para que lo ajuste. Úsalo solo si de verdad cambia la pieza.',
  { a: z.string().min(1).describe('el compañero cuyo aporte devuelves'), comentarios: z.string().min(3).describe('qué debe cambiar y por qué') },
  async ({ a, comentarios }) => {
    const r = await llamar('mesa_devolver', { a, comentarios })
    return r.ok ? bien(r.cuerpo) : fallo(r.error)
  },
)

servidor.tool(
  'pedir_material',
  'Si te falta un dato, una foto o un hecho del cliente, se lo pides al portero del cerebro. Lo que trae vuelve al tablero. Úsalo solo si de verdad lo necesitas.',
  { que: z.string().min(3).describe('qué material necesitas'), para_que: z.string().optional().describe('para qué lo necesitas') },
  async ({ que, para_que }) => {
    const r = await llamar('pedir_material', { que, para_que })
    return r.ok ? bien(r.cuerpo) : fallo(r.error)
  },
)

servidor.connect(new StdioServerTransport()).catch((e) => {
  process.stderr.write(`mesa-server: ${(e && e.message) || e}\n`)
  process.exit(1)
})
