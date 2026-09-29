/**
 * EL RECONCILIADOR DE DESPACHOS HUÉRFANOS · pruebas a costo cero · CC#1 · 2026-09-30 · GO de Emilio.
 * Mira el SÍNTOMA («aceptado, sin recibo, sin vuelta») y distingue «terminó y no pudo entregar» de «nunca arrancó» (regla 8 de la
 * evaluación). Los casos vienen de los despachos REALES del 29-sep (`fixtures/2026-09-30-reconciliador/`, firmas de las direcciones
 * de vuelta anuladas): ahí está la corrida 157555, el caso que motivó todo.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'reconciliador')
const { clasificarDespacho, reconciliar, invocacionDe, intentoDeLaEjecucion, PARAMETROS } = require(join(DIR, 'clasificar.js'))
const { construirFlujo, N, codigoDeNodo } = await import(pathToFileURL(join(DIR, 'construir-reconciliador.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const FX = join(process.cwd(), '__tests__', 'fixtures', '2026-09-30-reconciliador')
const cargar = (f: string) => JSON.parse(readFileSync(join(FX, f), 'utf8'))

const AHORA = new Date('2026-09-29T19:30:00Z').getTime()
const min = (n: number) => new Date(AHORA - n * 60000).toISOString()
const desp = (extra: Record<string, unknown> = {}) => ({ id: 'id-1', dispatch_key: 'dispatch:WF:agente:900', workflow_execution_id: '900', agent_name: 'agente', client_id: 'c1', status: 'running', created_at: min(10), ...extra })
const inv = (extra: Record<string, unknown> = {}) => ({ id: 'inv-1', workflow_execution_id: '900', agent_name: 'agente', created_at: min(5), duration_ms: 240000, cost_usd: 0.5, status: 'completed', ...extra })
const intento = (status: string, http: number | null = null) => ({ callback_url: 'https://n8n.test/webhook-waiting/900?signature=x', attempt_number: 1, status, http_status_code: http, attempted_at: min(4) })
const clase = (d: object, i: object | null, ints: object[], ahora = AHORA) => clasificarDespacho(d, i, ints, ahora)

describe('la regla 8 · «terminó y no pudo entregar» ≠ «nunca arrancó»', () => {
  it('ROJO · el caso 157555: despacho `running`, la invocación EXISTE (terminó) y la vuelta no se entregó ⇒ termino_y_no_entrego (alta) con la evidencia del resultado', () => {
    const c = clase(desp({ created_at: min(60) }), inv({ created_at: min(30), duration_ms: 1923131, cost_usd: 1.985556 }), [])
    expect(c.clasificacion).toBe('termino_y_no_entrego')
    expect(c.severidad).toBe('alta')
    expect(c.evidencia.invocacion).toMatchObject({ duracion_ms: 1923131, costo_usd: 1.985556 })
    expect(c.evidencia.desde_que_termino_s).toBe(30 * 60)
  })
  it('ROJO · despacho `accepted` que no arrancó en 3 min y SIN invocación ⇒ nunca_arranco (alta) · y NO se confunde con el anterior', () => {
    const c = clase(desp({ status: 'accepted', created_at: min(10) }), null, [])
    expect(c.clasificacion).toBe('nunca_arranco')
    expect(c.clasificacion).not.toBe('termino_y_no_entrego')
    expect(c.severidad).toBe('alta')
  })
  it('ROJO · `running` más de 1 h sin invocación ni vuelta ⇒ sin_senales_de_vida (alta) · pero un agente que lleva 40 min NO se da por muerto (medido: 32 min es legítimo)', () => {
    expect(clase(desp({ created_at: min(61) }), null, []).clasificacion).toBe('sin_senales_de_vida')
    expect(clase(desp({ created_at: min(40) }), null, []).clasificacion).toBe('en_curso')
  })
  it('un trabajo joven no molesta: aceptado hace 1 min ⇒ en_curso · terminó hace 1 min (el callback tarda segundos) ⇒ en_curso (gracia de 3 min)', () => {
    expect(clase(desp({ status: 'accepted', created_at: min(1) }), null, []).clasificacion).toBe('en_curso')
    expect(clase(desp({ created_at: min(6) }), inv({ created_at: min(1) }), []).clasificacion).toBe('en_curso')
  })
  it('si la vuelta SÍ se entregó (intento ok) el resultado no está huérfano: en_curso al principio, entregado_ledger_abierto pasada la gracia (solo informativo)', () => {
    expect(clase(desp({ created_at: min(1) }), inv(), [intento('ok', 200)]).clasificacion).toBe('en_curso')
    const c = clase(desp({ created_at: min(20) }), inv({ created_at: min(15) }), [intento('ok', 200)])
    expect(c.clasificacion).toBe('entregado_ledger_abierto')
    expect(c.severidad).toBe('info')
  })
})

describe('los despachos que fallaron (saldo agotado, tope de gasto…)', () => {
  it('error y el error LLEGÓ al que esperaba (intento ok) ⇒ error_entregado (info · no es huérfano)', () => {
    expect(clase(desp({ status: 'error' }), null, [intento('ok', 200)])).toMatchObject({ clasificacion: 'error_entregado', severidad: 'info' })
  })
  it('error y el que llamó no espera por callback (todos los intentos dan 409: el alta lo sondea) ⇒ error_callback_409 (info)', () => {
    expect(clase(desp({ status: 'error' }), null, [intento('non_2xx', 409), intento('non_2xx', 409)])).toMatchObject({ clasificacion: 'error_callback_409', severidad: 'info' })
  })
  it('ROJO · error y NINGÚN intento de vuelta (o todos fallaron distinto de 409) ⇒ error_sin_entrega (alta: su espera puede estar colgada)', () => {
    expect(clase(desp({ status: 'error' }), null, [])).toMatchObject({ clasificacion: 'error_sin_entrega', severidad: 'alta' })
    expect(clase(desp({ status: 'error' }), null, [intento('timeout'), intento('fetch_threw')])).toMatchObject({ clasificacion: 'error_sin_entrega', severidad: 'alta' })
  })
  it('completed ⇒ ok, con o sin invocación', () => {
    expect(clase(desp({ status: 'completed' }), null, []).clasificacion).toBe('ok')
    expect(clase(desp({ status: 'completed' }), inv(), []).severidad).toBe('ok')
  })
})

describe('el emparejamiento de datos', () => {
  it('la invocación se empareja por ejecución + agente y debe ser POSTERIOR al despacho (una anterior de la misma ejecución no cuenta)', () => {
    const d = desp({ created_at: min(10) })
    expect(invocacionDe(d, [inv({ created_at: min(30) })])).toBeNull()
    expect(invocacionDe(d, [inv({ workflow_execution_id: '901' })])).toBeNull()
    expect(invocacionDe(d, [inv({ agent_name: 'otro' })])).toBeNull()
    expect(invocacionDe(d, [inv({ created_at: min(3), id: 'tarde' }), inv({ created_at: min(6), id: 'primera' })]).id).toBe('primera')
  })
  it('los intentos se emparejan por la ejecución en la dirección de vuelta (sin `URL`), y no confunden 9000 con 900', () => {
    expect(intentoDeLaEjecucion('https://n8n.test/webhook-waiting/900?signature=x', '900')).toBe(true)
    expect(intentoDeLaEjecucion('https://n8n.test/webhook-waiting/9000?signature=x', '900')).toBe(false)
    expect(intentoDeLaEjecucion('https://n8n.test/webhook-waiting/900', '900')).toBe(true)
    expect(intentoDeLaEjecucion(null, '900')).toBe(false)
  })
})

describe('🔴 contra los despachos REALES del 29-sep (la corrida 157555 y sus hermanas)', () => {
  const r = reconciliar(cargar('despachos.json'), cargar('invocaciones.json'), cargar('intentos.json'), AHORA)
  const de = (exec: string) => r.filter((x: { despacho: { workflow_execution_id: string } }) => String(x.despacho.workflow_execution_id) === exec)
  it('de 14 despachos: 7 ok · 6 informativos (errores del tope de gasto que SÍ llegaron) · 1 ALTA', () => {
    const por = (s: string) => r.filter((x: { resultado: { severidad: string } }) => x.resultado.severidad === s).length
    expect(r).toHaveLength(14)
    expect(por('ok')).toBe(7)
    expect(por('info')).toBe(6)
    expect(por('alta')).toBe(1)
  })
  it('la ÚNICA alta es la 157555, y es «terminó y no entregó» con su invocación de 32 min y US$ 1,99', () => {
    const alta = r.filter((x: { resultado: { severidad: string } }) => x.resultado.severidad === 'alta')
    expect(alta).toHaveLength(1)
    expect(String(alta[0].despacho.workflow_execution_id)).toBe('157555')
    expect(alta[0].resultado.clasificacion).toBe('termino_y_no_entrego')
    expect(alta[0].resultado.evidencia.invocacion).toMatchObject({ duracion_ms: 1923131, costo_usd: 1.985556 })
    expect(alta[0].resultado.evidencia.intentos_de_vuelta).toBe(0)
  })
  it('las del alta (callbacks 409 pero despacho completed) NO molestan; las del tope de gasto son informativas (el error sí llegó)', () => {
    for (const e of ['156428', '156501']) de(e).forEach((x: { resultado: { clasificacion: string } }) => expect(x.resultado.clasificacion).toBe('ok'))
    for (const e of ['157619', '157622', '157624', '157627', '157629', '157631']) expect(de(e)[0].resultado.clasificacion).toBe('error_entregado')
  })
})

describe('el nodo del reloj (código exacto) con la base simulada', () => {
  type Llamada = { metodo: string; url: string; cuerpo?: unknown }
  async function correr(soloLectura: boolean, datos: { despachos: object[]; invocaciones: object[]; intentos: object[]; existentes: object[] }, opciones: { falla?: string } = {}) {
    const llamadas: Llamada[] = []
    const httpRequest = async (o: { url: string; method: string; body?: unknown }) => {
      llamadas.push({ metodo: o.method, url: o.url, cuerpo: o.body })
      if (o.method === 'GET') {
        if (o.url.includes('/agent_dispatches?')) return datos.despachos
        if (o.url.includes('/agent_invocations?')) return datos.invocaciones
        if (o.url.includes('/agent_callback_attempts?')) return datos.intentos
        if (o.url.includes('/agent_dispatch_reconciliations?')) return datos.existentes
      }
      if (opciones.falla && o.url.includes(opciones.falla)) return { statusCode: 500, body: { message: 'boom' } }
      return { statusCode: 204, body: null }
    }
    const codigo = codigoDeNodo('reconciliar', soloLectura)
    const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo)
    const salida = await fn.call({ helpers: { httpRequest } }, { first: () => ({ json: {} }) }, () => ({}), { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'W' }, { id: '1' })
    return { salida: salida[0].json, llamadas }
  }
  // «ahora» del nodo es Date.now(): se usa un despacho de hace 2 h para que la 157555 sea alta hoy también
  const ahoraReal = Date.now()
  const hace = (m: number) => new Date(ahoraReal - m * 60000).toISOString()
  const huerfano = { id: 'a1', dispatch_key: 'dispatch:WF:cba:1', workflow_execution_id: '1', agent_name: 'cba', client_id: 'c', status: 'running', created_at: hace(120) }
  const suInv = { id: 'i1', workflow_execution_id: '1', agent_name: 'cba', created_at: hace(60), duration_ms: 1923131, cost_usd: 1.98, status: 'completed' }

  it('SOLO_LECTURA (la copia de prueba) clasifica y devuelve, sin escribir NADA y sin avisar', async () => {
    const { salida, llamadas } = await correr(true, { despachos: [huerfano], invocaciones: [suInv], intentos: [], existentes: [] })
    expect(salida).toMatchObject({ modo: 'solo_lectura', escribio: false, avisos: [] })
    expect(salida.resumen.alta).toBe(1)
    expect(llamadas.every((l) => l.metodo === 'GET')).toBe(true)
  })
  it('🔴 el modo real NO toca agent_dispatches ni ninguna tabla que no sea la suya: solo GET a las tres de origen y escritura a agent_dispatch_reconciliations', async () => {
    const { llamadas } = await correr(false, { despachos: [huerfano], invocaciones: [suInv], intentos: [], existentes: [] })
    for (const l of llamadas.filter((x) => x.metodo !== 'GET')) expect(l.url).toContain('/agent_dispatch_reconciliations')
    expect(llamadas.some((l) => l.metodo !== 'GET' && l.url.includes('/agent_dispatches'))).toBe(false)
    expect(llamadas.some((l) => l.url.includes('run-sdk') || l.url.includes('vercel'))).toBe(false)
  })
  it('un hallazgo nuevo de severidad alta se registra (merge-duplicates: no pisa primera_vez ni avisado_el) y sale como aviso UNA vez', async () => {
    const { salida, llamadas } = await correr(false, { despachos: [huerfano], invocaciones: [suInv], intentos: [], existentes: [] })
    const post = llamadas.find((l) => l.metodo === 'POST')!
    expect(post.url).toContain('on_conflict=dispatch_key')
    const fila = (post.cuerpo as Array<Record<string, unknown>>)[0]
    expect(fila).toMatchObject({ dispatch_key: 'dispatch:WF:cba:1', clasificacion: 'termino_y_no_entrego', severidad: 'alta', resuelta_el: null })
    expect(fila).not.toHaveProperty('primera_vez')
    expect(fila).not.toHaveProperty('avisado_el')
    expect(salida.avisos).toHaveLength(1)
    expect(salida.avisos[0]).toMatchObject({ clasificacion: 'termino_y_no_entrego', ejecucion: '1', agente: 'cba' })
  })
  it('un hallazgo YA avisado no se avisa otra vez (pero se sigue actualizando)', async () => {
    const { salida, llamadas } = await correr(false, { despachos: [huerfano], invocaciones: [suInv], intentos: [], existentes: [{ dispatch_key: 'dispatch:WF:cba:1', avisado_el: new Date().toISOString(), clasificacion: 'termino_y_no_entrego' }] })
    expect(salida.avisos).toHaveLength(0)
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true)
  })
  it('lo que ya no es problema se marca resuelto (PATCH resuelta_el) y no se avisa', async () => {
    const cerrado = { ...huerfano, status: 'completed' }
    const { salida, llamadas } = await correr(false, { despachos: [cerrado], invocaciones: [suInv], intentos: [], existentes: [{ dispatch_key: 'dispatch:WF:cba:1', avisado_el: null, clasificacion: 'termino_y_no_entrego' }] })
    const patch = llamadas.find((l) => l.metodo === 'PATCH')!
    expect(patch.url).toContain('dispatch_key=in.(')
    expect(patch.cuerpo).toHaveProperty('resuelta_el')
    expect(salida.resueltos).toBe(1)
    expect(salida.avisos).toHaveLength(0)
  })
  it('ROJO · si la tabla no acepta la escritura el reloj FALLA RUIDOSO (no se queda «verde» sin haber anotado)', async () => {
    await expect(correr(false, { despachos: [huerfano], invocaciones: [suInv], intentos: [], existentes: [] }, { falla: '/agent_dispatch_reconciliations?on_conflict' })).rejects.toThrow(/RECONCILIADOR_SIN_ANOTAR/)
  })
  it('los informativos se registran pero NO generan aviso (severidad info)', async () => {
    const fallo = { id: 'a2', dispatch_key: 'dispatch:WF:cba:2', workflow_execution_id: '2', agent_name: 'cba', client_id: 'c', status: 'error', created_at: hace(30) }
    const ok = { callback_url: 'https://n8n.test/webhook-waiting/2?signature=x', attempt_number: 1, status: 'ok', http_status_code: 200, attempted_at: hace(29) }
    const { salida } = await correr(false, { despachos: [fallo], invocaciones: [], intentos: [ok], existentes: [] })
    expect(salida.avisos).toHaveLength(0)
    expect(salida.resumen.info).toBe(1)
  })
})

describe('«Armar el aviso» y «Marcar avisados» (Slack)', () => {
  const avisos = [{ dispatch_key: 'dispatch:WF:cba:1', clasificacion: 'termino_y_no_entrego', que: 'TERMINÓ…', agente: 'cba', ejecucion: '157555', edad_s: 7200, invocacion: { id: 'abcdef123456', duracion_ms: 1923131, costo_usd: 1.98 }, intentos: 0, ultimo_intento: null }]
  it('el aviso nombra clasificación, agente, ejecución, la invocación con su costo y QUÉ HACER', async () => {
    const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo('armar'))
    const [{ json }] = await fn({ first: () => ({ json: { avisos } }) }, () => ({}), {}, {}, {}, {})
    expect(json.titulo).toContain('1 nuevo')
    expect(json.texto).toContain('termino_y_no_entrego')
    expect(json.texto).toContain('157555')
    expect(json.texto).toContain('US$ 1.98')
    expect(json.texto).toMatch(/el resultado EXISTE/)
    expect(json.claves).toEqual(['dispatch:WF:cba:1'])
  })
  const marcar = async (slack: unknown, statusCode = 204) => {
    const llamadas: Array<{ url: string; body: unknown }> = []
    const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo('marcar'))
    const r = await fn.call({ helpers: { httpRequest: async (o: { url: string; body: unknown }) => { llamadas.push({ url: o.url, body: o.body }); return { statusCode } } } }, { first: () => ({ json: slack }) }, () => ({ first: () => ({ json: { claves: ['dispatch:WF:cba:1'] } }) }), { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, {}, {})
    return { r, llamadas }
  }
  it('ROJO · Slack NO confirmó ok:true ⇒ NO se marca avisado (se reintenta) y el nodo FALLA RUIDOSO (lección E81)', async () => {
    await expect(marcar({ ok: false, error: 'channel_not_found' })).rejects.toThrow(/AVISO_NO_LLEGO/)
    await expect(marcar({ body: { ok: false } })).rejects.toThrow(/AVISO_NO_LLEGO/)
  })
  it('Slack confirmó ok:true ⇒ se marca avisado_el SOLO de esos hallazgos', async () => {
    const { r, llamadas } = await marcar({ ok: true, ts: '1' })
    expect(r[0].json.avisados).toBe(1)
    expect(llamadas[0].url).toContain('dispatch_key=in.("dispatch:WF:cba:1")')
    expect(llamadas[0].body).toHaveProperty('avisado_el')
  })
})

describe('el flujo del reloj', () => {
  const real = construirFlujo()
  const prueba = construirFlujo({ prueba: true })
  it('el real corre cada 5 minutos y sigue: reconciliar → ¿hay hallazgos? → aviso → marcar (Slack a #alertas)', () => {
    const reloj = real.nodes.find((n: { name: string }) => n.name === N.reloj)
    expect(reloj.type).toBe('n8n-nodes-base.scheduleTrigger')
    expect(reloj.parameters.rule.interval[0]).toMatchObject({ field: 'minutes', minutesInterval: 5 })
    const sig = (n: string, i = 0) => real.connections[n].main[i].map((t: { node: string }) => t.node)
    expect(sig(N.reloj)).toEqual([N.reconciliar])
    expect(sig(N.reconciliar)).toEqual([N.hayAvisos])
    expect(sig(N.hayAvisos, 0)).toEqual([N.armar])
    expect(sig(N.armar)).toEqual([N.slack])
    expect(sig(N.slack)).toEqual([N.marcar])
    expect(real.nodes.find((n: { name: string }) => n.name === N.slack).parameters.jsonBody).toContain('C0B7XUUEBHA')
  })
  it('la copia de prueba es de SOLO LECTURA (webhook · sin Slack · SOLO_LECTURA = true)', () => {
    expect(prueba.nodes.map((n: { name: string }) => n.name)).toEqual([N.webhook, N.reconciliar])
    expect(prueba.nodes[1].parameters.jsCode.startsWith('const SOLO_LECTURA = true')).toBe(true)
    expect(real.nodes.find((n: { name: string }) => n.name === N.reconciliar).parameters.jsCode.startsWith('const SOLO_LECTURA = false')).toBe(true)
  })
  it('NO toca el camino crítico: ningún nodo llama a run-sdk, al corredor ni a otro flujo; el único destino externo es Slack', () => {
    const texto = JSON.stringify(real.nodes.map((n: { parameters: unknown }) => n.parameters))
    for (const prohibido of ['run-sdk', 'agent-runner', 'zero-risk-platform.vercel', '/webhook/', 'executeWorkflow']) expect(texto.includes(prohibido), prohibido).toBe(false)
    expect(texto).toContain('slack.com/api/chat.postMessage')
  })
  it('todos los nodos de código compilan (sin `URL`, sin `require`)', () => {
    for (const n of real.nodes.filter((x: { type: string }) => x.type.endsWith('.code'))) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode)).not.toThrow()
      expect(n.parameters.jsCode).not.toMatch(/new URL\(/)
    }
    expect(PARAMETROS).toMatchObject({ ACEPTADO_MAX_S: 180, CORRIENDO_MAX_S: 3600, GRACIA_ENTREGA_S: 180 })
  })
  it('la migración crea SOLO su tabla, con GRANT + RLS (lección client_web_pages)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '202609300100_agent_dispatch_reconciliations.sql'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.agent_dispatch_reconciliations')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_dispatch_reconciliations TO service_role')
    expect((sql.match(/CREATE TABLE/g) || []).length).toBe(1)
    expect(sql).not.toMatch(/ALTER TABLE public\.agent_dispatches/)
    expect(sql).not.toMatch(/DROP /)
  })
})
