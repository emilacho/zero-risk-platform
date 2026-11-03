/**
 * 03-nov · el reloj del barrido de corridas del plan (RESPUESTA Lenovo a CC#2). US$ 0, sin red. Se ejecuta el CÓDIGO REAL del cierre.
 * Fija los 6 guardarraíles de la agencia: cadencia definida, reintentos con tope, sin costo ni agentes, rastro, y que un rechazo de la ruta HAGA FALLAR la corrida.
 */
import { describe, expect, it } from 'vitest'
import { AVISO_DE_ERROR, CODIGO_CIERRE, CRON, N_BARRER, N_CIERRE, N_RELOJ, RUTA, construir } from '../scripts/ops/reloj-barrido-del-plan.mjs'

const f = construir() as any
const nodo = (n: string) => f.nodes.find((x: any) => x.name === n)
const cerrar = (json: unknown, codigo = CODIGO_CIERRE) => new Function('$input', 'console', codigo)({ first: () => ({ json }) }, { log: () => {} })

describe('el reloj del barrido', () => {
  it('cadencia definida: cada 15 minutos, un solo disparador, cadena reloj → barrer → cierre', () => {
    expect(CRON).toBe('*/15 * * * *')
    expect(nodo(N_RELOJ).parameters.rule.interval[0].expression).toBe(CRON)
    expect(f.nodes.filter((n: any) => n.type.includes('Trigger') || n.type.includes('webhook'))).toHaveLength(1)
    expect(f.connections[N_RELOJ].main[0][0].node).toBe(N_BARRER)
    expect(f.connections[N_BARRER].main[0][0].node).toBe(N_CIERRE)
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
  it('CERT CC3 reserva 1 · un fallo NO queda mudo: el flujo enlaza el aviso de errores que ya usan otros (E73 → #alertas)', () => {
    expect(f.settings.errorWorkflow).toBe(AVISO_DE_ERROR)
    expect(AVISO_DE_ERROR).toBe('5fkPLbZvQsQa1bcd')
  })
  it('sin costo: ningún nodo llama a agentes, a modelos ni a la sala', () => {
    expect(JSON.stringify(f)).not.toMatch(/agents\/run|sala\/intake|anthropic|openai/i)
  })
  it('🔴 el cierre FALLA con 404, 401, 500, sin respuesta o con una forma que no es «barrido»', () => {
    for (const r of [{ statusCode: 404, body: { error: 'x' } }, { statusCode: 401, body: {} }, { statusCode: 500, body: { error: 'plan_corridas_error' } }, {}, { statusCode: 200, body: { accion: 'dry_run' } }, { statusCode: 200, body: 'texto' }]) {
      expect(() => cerrar(r)).toThrow(/BARRIDO_SIN_RESPUESTA/)
    }
  })
  it('el cierre pasa con 200 «barrido» y deja el resultado', () => {
    const r = cerrar({ statusCode: 200, body: { accion: 'barrido', vencidas: 1, fallidas: 1 } }) as any[]
    expect(r[0].json).toEqual({ ok: true, barrido: { accion: 'barrido', vencidas: 1, fallidas: 1 } })
  })
  it('🔴 mutante: un cierre que no lanza deja pasar el 404 en silencio (la prueba lo ve)', () => {
    const sinLanzar = CODIGO_CIERRE.replace(/throw new Error\([^\n]*\);/, '')
    expect(() => cerrar({ statusCode: 404, body: {} }, sinLanzar)).not.toThrow()
    expect(sinLanzar).not.toBe(CODIGO_CIERRE)
  })
})
