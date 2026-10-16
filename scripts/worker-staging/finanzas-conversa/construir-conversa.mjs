// F8 · EL FLUJO `finanzas · conversa` (CC#1 · 2026-10-14) · NACE INACTIVO, NUEVO (no toca ningún flujo vivo) · NO SE IMPORTA NI SE ACTIVA (lo hace CC#3 con respaldo y n8n 0/0).
//   node construir-conversa.mjs [--salida=<carpeta>]   → escribe NUEVO-finanzas-conversa-2026-10-14.json · NO toca n8n
// Mismo molde que F3 (`finanzas · bloque`): la llave INTERNA se exige antes de mirar nada, `dry_run` obligatorio y booleano, sin reintentos (cada paso PAGA), nunca lanza.
// Qué hace: una llamada = UN paso. Recibe `{ accion: 'abrir'|'avanzar'|'leer', client_id?, semilla?, encargo_id?, dry_run (booleano) }`, llama UNA vez a `/api/finanzas/conversa`
// pasando SU `workflow_id` REAL (`$workflow.id`, el del propio flujo) y su `workflow_execution_id` (`$execution.id`): así run-sdk acepta el turno y el libro lo ata a este flujo.
// El bucle `avanzar` + espera lo hace quien llame (el plan, con el mismo patrón que J7); este flujo NO itera.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const NOMBRE = 'Zero Risk — finanzas · conversa (oficina financiera · F8 · INACTIVO)'
export const N = { webhook: 'Webhook · finanzas conversa', validar: 'FIN · validar el sobre', llamarSi: 'FIN · ¿se llama a la ruta?', llamar: 'FIN · un paso de la conversación', resultado: 'FIN · resultado' }
export const RUTA_WEBHOOK = 'zero-risk/finanzas-conversa'
export const ACCIONES = ['abrir', 'avanzar', 'leer']
// un paso con un turno de agente puede durar minutos; el techo de la espera es el de la función de la plataforma, no el de n8n
// intento 4: el jefe tarda 115–260 s por llamada; con 300 s el flujo cortaba (502) un paso que la ruta seguía ejecutando y cobrando
export const TIMEOUT_MS = 600000
const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"

const VALIDAR = [
  '// F8 · valida el sobre ANTES de llamar a la ruta. `dry_run` OBLIGATORIO y booleano. Nunca lanza.',
  '// la llave interna se exige ANTES de mirar nada (cabecera `x-api-key` = la variable del propio n8n); sin ella, equivocada o sin variable: no se llama a la ruta.',
  'const entrada = $input.first().json || {}',
  "const cab = entrada.headers && typeof entrada.headers === 'object' ? entrada.headers : {}",
  "const dada = String(cab['x-api-key'] || '')",
  "const esperada = String($env.INTERNAL_API_KEY || '')",
  'let autorizado = esperada.length > 0 && dada.length === esperada.length',
  'if (autorizado) { let d = 0; for (let i = 0; i < esperada.length; i++) d |= dada.charCodeAt(i) ^ esperada.charCodeAt(i); autorizado = d === 0 }',
  'if (!autorizado) return [{ json: { llamar: false, no_autorizado: true, errores: [] } }]',
  'const b = entrada.body || entrada',
  'const errores = []',
  "const acciones = ['abrir', 'avanzar', 'leer']",
  "if (acciones.indexOf(b.accion) < 0) errores.push('`accion` debe ser abrir, avanzar o leer')",
  "if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser booleano')",
  "if (b.accion === 'abrir' && (typeof b.client_id !== 'string' || !b.client_id.trim())) errores.push('`client_id` es obligatorio para abrir')",
  "if (b.accion === 'abrir' && (!b.semilla || typeof b.semilla !== 'object' || Array.isArray(b.semilla))) errores.push('`semilla` es obligatoria para abrir y debe ser un objeto')",
  "if ((b.accion === 'avanzar' || b.accion === 'leer') && (typeof b.encargo_id !== 'string' || !b.encargo_id.trim())) errores.push('`encargo_id` es obligatorio para avanzar y leer')",
  'if (errores.length) return [{ json: { llamar: false, errores } }]',
  "const cuerpo = { accion: b.accion, dry_run: b.dry_run, workflow_id: String($workflow.id), workflow_execution_id: typeof b.workflow_execution_id === 'string' && b.workflow_execution_id ? b.workflow_execution_id : String($execution.id) }",
  "if (b.accion === 'abrir') { cuerpo.client_id = b.client_id.trim(); cuerpo.semilla = b.semilla } else { cuerpo.encargo_id = b.encargo_id.trim() }",
  'return [{ json: { llamar: true, accion: b.accion, cuerpo } }]',
].join('\n')

const RESULTADO = [
  '// F8 · normaliza lo que contestó la ruta. NUNCA lanza: cualquier cosa que no sea una respuesta válida devuelve `ok:false` con el motivo; quien llama decide (el plan sigue como hoy).',
  'let v = null',
  "try { v = $('" + N.validar + "').first().json } catch (x) { v = null }",
  "if (v && v.no_autorizado === true) return [{ json: { ok: false, motivo: 'no_autorizado' } }]",
  "if (!v || v.llamar !== true) return [{ json: { ok: false, motivo: 'sobre_invalido', errores: (v && v.errores) || [] } }]",
  'const r = $input.first().json || {}',
  'const status = Number(r.statusCode)',
  "const b = r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? r.body : {}",
  "if (status === 409) return [{ json: { ok: false, accion: v.accion, motivo: b.error || 'conversa_apagada' } }]",
  "if (status === 200) return [{ json: { ok: true, accion: v.accion, respuesta: b } }]",
  "return [{ json: { ok: false, accion: v.accion, motivo: b.error || ('http_' + (isFinite(status) ? status : 'sin_respuesta')), errores: b.errores || [] } }]",
].join('\n')

export function construirFlujo() {
  const nodes = [
    { parameters: { httpMethod: 'POST', path: RUTA_WEBHOOK, responseMode: 'lastNode' }, name: N.webhook, type: 'n8n-nodes-base.webhook', typeVersion: 1.1, position: [0, 0], webhookId: 'finanzas-conversa-0001' },
    { parameters: { jsCode: VALIDAR }, name: N.validar, type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0] },
    {
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.llamar === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
      name: N.llamarSi, type: 'n8n-nodes-base.if', typeVersion: 2, position: [480, 0],
    },
    {
      parameters: {
        method: 'POST', url: `={{ ${VERCEL} + '/api/finanzas/conversa' }}`, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify($json.cuerpo || {}) }}`,
        options: { timeout: TIMEOUT_MS, response: { response: { fullResponse: true, neverError: true } } },
      },
      // sin reintentos: un paso PAGA (un turno de agente); un fallo se dice y quien llama decide
      name: N.llamar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 0], onError: 'continueRegularOutput',
    },
    { parameters: { jsCode: RESULTADO }, name: N.resultado, type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, 0] },
  ]
  const connections = {
    [N.webhook]: { main: [[{ node: N.validar, type: 'main', index: 0 }]] },
    [N.validar]: { main: [[{ node: N.llamarSi, type: 'main', index: 0 }]] },
    [N.llamarSi]: { main: [[{ node: N.llamar, type: 'main', index: 0 }], [{ node: N.resultado, type: 'main', index: 0 }]] },
    [N.llamar]: { main: [[{ node: N.resultado, type: 'main', index: 0 }]] },
  }
  return { name: NOMBRE, active: false, nodes, connections, settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const ruta = join(arg ? arg.slice('--salida='.length) : aqui, 'NUEVO-finanzas-conversa-2026-10-14.json')
  fs.writeFileSync(ruta, JSON.stringify(construirFlujo(), null, 2))
  console.log('escrito', ruta)
}
