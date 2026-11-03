/**
 * 03-nov · el reloj del barrido de corridas del plan (RESPUESTA Lenovo a CC#2). US$ 0, sin red. Se ejecuta el CÓDIGO REAL del cierre y del cierre del incidente.
 * Fija los 6 guardarraíles de la agencia + la regla de Emilio «una alarma por incidente»: un fallo avisa UNA vez, mientras siga fallando no repite, y al volver sale un aviso.
 */
import { describe, expect, it } from 'vitest'
import {
  AVISO_DE_ERROR, CODIGO_CIERRE, CODIGO_LIMPIA, CRON, N_AVISO_VOLVIO, N_BARRER, N_CIERRE, N_LIMPIA, N_RELOJ, N_SI_VOLVIO, RUTA, construir,
} from '../scripts/ops/reloj-barrido-del-plan.mjs'

const f = construir() as any
const nodo = (n: string) => f.nodes.find((x: any) => x.name === n)
type Mem = { incidente_desde?: string | null }
/** corre el código de un nodo con una memoria compartida (la del flujo) */
const correr = (codigo: string, json: unknown, mem: Mem) =>
  new Function('$input', '$getWorkflowStaticData', 'console', codigo)({ first: () => ({ json }) }, () => mem, { log: () => {} })
const MAL = [{ statusCode: 404, body: { error: 'x' } }, { statusCode: 401, body: {} }, { statusCode: 500, body: { error: 'plan_corridas_error' } }, {}, { statusCode: 200, body: { accion: 'dry_run' } }, { statusCode: 200, body: 'texto' }]
const BIEN = { statusCode: 200, body: { accion: 'barrido', vencidas: 1, fallidas: 1 } }

describe('el reloj del barrido', () => {
  it('cadencia definida: cada 15 minutos, un solo disparador, cadena reloj → barrer → cierre', () => {
    expect(CRON).toBe('*/15 * * * *')
    expect(nodo(N_RELOJ).parameters.rule.interval[0].expression).toBe(CRON)
    expect(f.nodes.filter((n: any) => n.type.includes('Trigger') || n.type.includes('webhook'))).toHaveLength(1)
    expect(f.connections[N_RELOJ].main[0][0].node).toBe(N_BARRER)
    expect(f.connections[N_BARRER].main[0][0].node).toBe(N_CIERRE)
    expect(f.connections[N_CIERRE].main[0][0].node).toBe(N_SI_VOLVIO)
    expect(f.connections[N_SI_VOLVIO].main[0][0].node).toBe(N_AVISO_VOLVIO)
    expect(f.connections[N_SI_VOLVIO].main[1]).toEqual([]) // sin «volvió»: no hace nada más
    expect(f.connections[N_AVISO_VOLVIO].main[0][0].node).toBe(N_LIMPIA)
  })
  it('llama a la ruta del barrido con la llave interna, sin dry_run, para cualquier cliente (sin client_id)', () => {
    const p = nodo(N_BARRER).parameters
    expect(p.url).toContain(RUTA)
    expect(p.method).toBe('POST')
    expect(JSON.stringify(p.headerParameters)).toContain('$env.INTERNAL_API_KEY')
    expect(p.jsonBody).toContain('"dry_run": false')
    expect(JSON.stringify(p)).not.toMatch(/client_id/)
  })
  it('reintentos con tope: 3 intentos y espera fija; nunca reintento infinito', () => {
    const n = nodo(N_BARRER)
    expect(n.retryOnFail).toBe(true)
    expect(n.maxTries).toBe(3)
    expect(n.waitBetweenTries).toBeGreaterThan(0)
  })
  it('un fallo NO queda mudo: el flujo enlaza el aviso de errores que ya usan otros (E73 → #alertas)', () => {
    expect(f.settings.errorWorkflow).toBe(AVISO_DE_ERROR)
    expect(AVISO_DE_ERROR).toBe('5fkPLbZvQsQa1bcd')
  })
  it('sin costo: ningún nodo llama a agentes, a modelos ni a la sala', () => {
    expect(JSON.stringify(f)).not.toMatch(/agents\/run|sala\/intake|anthropic|openai/i)
  })
})

describe('una alarma por incidente', () => {
  it('🔴 el PRIMER fallo (404, 401, 500, vacío o forma distinta) lanza: avisa el flujo de errores', () => {
    for (const r of MAL) {
      const mem: Mem = {}
      expect(() => correr(CODIGO_CIERRE, r, mem)).toThrow(/BARRIDO_SIN_RESPUESTA/)
      expect(mem.incidente_desde, 'el incidente queda abierto').toBeTruthy()
    }
  })
  it('🔴 mientras siga fallando NO repite: 96 tics malos seguidos = un solo aviso', () => {
    const mem: Mem = {}
    let avisos = 0
    for (let tic = 0; tic < 96; tic++) {
      try { correr(CODIGO_CIERRE, MAL[tic % MAL.length], mem) } catch { avisos++ }
    }
    expect(avisos).toBe(1)
  })
  it('los tics que no repiten dejan rastro (sigue_fallando) y no disparan el aviso de recuperación', () => {
    const mem: Mem = { incidente_desde: '2026-11-03T16:00:00.000Z' }
    const r = correr(CODIGO_CIERRE, MAL[0], mem) as any[]
    expect(r[0].json).toEqual({ ok: false, sigue_fallando: true, volvio: false })
    expect(mem.incidente_desde).toBe('2026-11-03T16:00:00.000Z')
  })
  it('con 200 «barrido» y sin incidente: pasa, no avisa nada', () => {
    const r = correr(CODIGO_CIERRE, BIEN, {}) as any[]
    expect(r[0].json).toEqual({ ok: true, volvio: false, desde: null, barrido: BIEN.body })
  })
  it('al volver a funcionar tras un incidente: marca «volvió» con desde cuándo fallaba (sale UN aviso)', () => {
    const mem: Mem = { incidente_desde: '2026-11-03T16:00:00.000Z' }
    const r = correr(CODIGO_CIERRE, BIEN, mem) as any[]
    expect(r[0].json).toMatchObject({ ok: true, volvio: true, desde: '2026-11-03T16:00:00.000Z' })
    expect(mem.incidente_desde, 'aún no se borra: lo borra el cierre del incidente cuando el aviso llegó').toBe('2026-11-03T16:00:00.000Z')
  })
  it('el incidente se cierra SOLO si Slack confirmó el aviso; si no, queda abierto y el siguiente tic reintenta', () => {
    const mem: Mem = { incidente_desde: '2026-11-03T16:00:00.000Z' }
    correr(CODIGO_LIMPIA, { ok: false, error: 'channel_not_found' }, mem)
    expect(mem.incidente_desde).toBe('2026-11-03T16:00:00.000Z')
    correr(CODIGO_LIMPIA, {}, mem)
    expect(mem.incidente_desde).toBe('2026-11-03T16:00:00.000Z')
    correr(CODIGO_LIMPIA, { ok: true, ts: '1' }, mem)
    expect(mem.incidente_desde).toBeNull()
  })
  it('ciclo completo: falla → avisa una vez → sigue fallando sin repetir → vuelve → un aviso → nuevo incidente avisa de nuevo', () => {
    const mem: Mem = {}
    const lanza = (r: unknown) => { try { correr(CODIGO_CIERRE, r, mem); return false } catch { return true } }
    expect(lanza(MAL[0])).toBe(true)
    expect(lanza(MAL[2])).toBe(false)
    const v = correr(CODIGO_CIERRE, BIEN, mem) as any[]
    expect(v[0].json.volvio).toBe(true)
    correr(CODIGO_LIMPIA, { ok: true }, mem)
    expect(correr(CODIGO_CIERRE, BIEN, mem) as any[]).toHaveLength(1)
    expect((correr(CODIGO_CIERRE, BIEN, mem) as any[])[0].json.volvio).toBe(false)
    expect(lanza(MAL[1])).toBe(true) // incidente nuevo → avisa otra vez
  })
  it('el aviso de recuperación va a #alertas con la llave de Slack del entorno y no rompe la corrida si Slack falla', () => {
    const n = nodo(N_AVISO_VOLVIO)
    expect(n.parameters.url).toBe('https://slack.com/api/chat.postMessage')
    expect(JSON.stringify(n.parameters)).toContain('$env.SLACK_BOT_TOKEN')
    expect(JSON.stringify(n.parameters)).toContain('C0B7XUUEBHA')
    expect(n.onError).toBe('continueRegularOutput')
  })
  it('🔴 mutantes: sin la memoria del incidente se repite el aviso; sin esperar a Slack se pierde el aviso de recuperación', () => {
    const sinMemoria = CODIGO_CIERRE.replace('if (mem.incidente_desde) {', 'if (false) {')
    let avisos = 0
    const mem: Mem = {}
    for (let i = 0; i < 5; i++) { try { correr(sinMemoria, MAL[0], mem) } catch { avisos++ } }
    expect(avisos).toBe(5) // la prueba de «un solo aviso» lo ve: 5 ≠ 1
    const limpiaSiempre = CODIGO_LIMPIA.replace('if (respuesta.ok !== true) {', 'if (false) {')
    const m2: Mem = { incidente_desde: 'x' }
    correr(limpiaSiempre, { ok: false }, m2)
    expect(m2.incidente_desde).toBeNull() // con el mutante se borra aunque Slack haya fallado; la prueba de arriba lo atrapa
  })
})
