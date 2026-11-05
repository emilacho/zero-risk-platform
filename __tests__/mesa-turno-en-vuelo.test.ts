/**
 * 05-nov · el adaptador pide latido y entiende lo que llega con él; el punto de control dice si un turno sigue en vuelo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { armarPedidoRunSdk, esCortePorTope, esFallaPasajera, modeloRunSdk } from '../src/lib/finanzas/conversa/modelo-run-sdk'
import { mensajeDeCorte } from '../services/agent-runner/src/lib/tope-por-corrida'
import { turnoEnVueloEnElCorredor, VENCE_EL_TURNO_EN_VUELO_MS } from '../src/lib/planeacion/mesa/turno-en-vuelo'

const BASE = { agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', paso: 'p', tope_usd: 1, dry_run: false }
const llamar = async (status: number, cuerpo: string) => {
  const vistos: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = []
  const f = (async (_u: string, i: { headers: Record<string, string>; body: string }) => { vistos.push({ headers: i.headers, body: JSON.parse(i.body) }); return new Response(cuerpo, { status }) }) as never
  const r = await modeloRunSdk({ base: 'https://x.invalid', llave: 'k', fetch: f, workflow_id: 'wf' }).invocar(BASE)
  return { r, vistos }
}

describe('lo pasajero', () => {
  it('es un corte, la red o un 5xx', () => { for (const e of ['red:x', 'red:cuerpo_cortado', 'run_sdk_500', 'run_sdk_502', 'run_sdk_599']) expect(esFallaPasajera(e)).toBe(true) })
  it('no es un 4xx, ni lo demás', () => { for (const e of ['run_sdk_429', 'run_sdk_400', 'run_sdk_5000', 'x_run_sdk_500', 'respuesta_sin_texto', 'modelo_no_configurado', '', null, undefined]) expect(esFallaPasajera(e)).toBe(false) })
})

describe('el pedido', () => {
  it('sin clave ni reanudar, igual que siempre: la oficina de finanzas no cambia', () => {
    const p = armarPedidoRunSdk(BASE, 'wf')
    expect(p.force_restart).toBe(true)
    expect(p).not.toHaveProperty('step_name')
  })
  it('con clave la manda; reanudar deja recoger lo hecho', () => {
    expect(armarPedidoRunSdk({ ...BASE, clave_de_turno: 'k1', reanudar: true }, 'wf')).toMatchObject({ step_name: 'k1', force_restart: false })
    expect(armarPedidoRunSdk({ ...BASE, clave_de_turno: 'k1', reanudar: false }, 'wf')).toMatchObject({ step_name: 'k1', force_restart: true })
  })
})

describe('el latido', () => {
  it('se pide siempre', async () => { expect((await llamar(200, '{"output":"x"}')).vistos[0].headers['x-zr-latido']).toBe('1') })
  it('los saltos de línea delante no estorban', async () => { expect((await llamar(200, '\n\n{"output":"x","cost_usd":0.5}')).r).toEqual({ ok: true, salida: 'x', costo_usd: 0.5 }) })
  it('el código verdadero viaja en el cuerpo', async () => {
    expect((await llamar(200, '\n{"success":false,"estado_http":502,"cost_usd":0.2}')).r).toEqual({ ok: false, error: 'run_sdk_502', costo_usd: 0.2 })
    expect((await llamar(200, '\n{"estado_http":429}')).r).toMatchObject({ ok: false, error: 'run_sdk_429' })
  })
  it('un 200 sin cuerpo entero es una conexión que murió, no una respuesta rara', async () => {
    for (const c of ['', '\n\n', '\n{"output":"cor']) expect((await llamar(200, c)).r).toEqual({ ok: false, error: 'red:cuerpo_cortado', costo_usd: 0 })
  })
  it('cualquier 2xx es una respuesta buena, también dentro del cuerpo', async () => {
    expect((await llamar(201, '{"output":"x"}')).r).toMatchObject({ ok: true, salida: 'x' })
    expect((await llamar(200, '\n{"output":"x","estado_http":201}')).r).toMatchObject({ ok: true, salida: 'x' })
  })
  it('el fallo que declara el corredor se distingue de un corte del camino', async () => {
    const declarado = '{"success":false,"error":"el modelo falló"}'
    expect((await llamar(500, declarado)).r).toEqual({ ok: false, error: 'run_sdk_500', costo_usd: 0, fallo_del_empleado: 'el modelo falló' })
    expect((await llamar(200, '\n{"success":false,"error":"el modelo falló","estado_http":500}')).r).toMatchObject({ fallo_del_empleado: 'el modelo falló' })
    expect((await llamar(502, '{"error":"agent-runner upstream failed","upstream_status":503}')).r).not.toHaveProperty('fallo_del_empleado')
    expect((await llamar(504, '{"error":"agent-runner timeout"}')).r).not.toHaveProperty('fallo_del_empleado')
    expect((await llamar(429, declarado)).r).not.toHaveProperty('fallo_del_empleado')
  })
  it('reconoce el corte por tope con el mensaje real del corredor', () => {
    expect(esCortePorTope(mensajeDeCorte(0.4, 0.41))).toBe(true)
    // solo el corte del corredor: otro error que nombre un tope (de tokens, de tiempo) sí se repite
    for (const x of ['el modelo falló', 'se pasó el tope de tokens de salida', 'x · error_max_budget_usd', '', null, undefined]) expect(esCortePorTope(x)).toBe(false)
  })
  it('lo demás sigue igual', async () => {
    expect((await llamar(503, '{}')).r).toMatchObject({ ok: false, error: 'run_sdk_503' })
    expect((await llamar(200, '{"nada":1}')).r).toMatchObject({ ok: false, error: 'respuesta_sin_texto' })
  })
})

describe('¿sigue en vuelo?', () => {
  const AHORA = new Date('2026-11-05T12:00:00Z')
  const db = (data: unknown, error: unknown = null) => { const vistos: unknown[][] = []; const q = { select: () => q, eq: (...a: unknown[]) => { vistos.push(a); return q }, limit: async () => ({ data, error }) }; return { vistos, from: (t: string) => { vistos.push([t]); return q } } as never }
  const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString()
  const Q = { workflow_id: 'wf', client_id: 'c', clave: 'k' }
  it('busca su fila exacta', async () => {
    const d = db([]) as { vistos: unknown[][] }
    await turnoEnVueloEnElCorredor(d as never, Q, AHORA)
    expect(d.vistos).toEqual([['workflow_checkpoints'], ['workflow_id', 'wf'], ['client_id', 'c'], ['step_name', 'k']])
  })
  it('en curso y reciente: sí', async () => { expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: hace(1000) }]), Q, AHORA)).toBe(true) })
  it('en curso pero viejo: el empleado murió', async () => {
    expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: hace(VENCE_EL_TURNO_EN_VUELO_MS - 1) }]), Q, AHORA)).toBe(true)
    expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: hace(VENCE_EL_TURNO_EN_VUELO_MS) }]), Q, AHORA)).toBe(false)
  })
  it('el plazo es más largo que el empleado más largo medido (32 min)', async () => {
    const hace2 = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString()
    expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: hace2(34) }]), Q, AHORA)).toBe(true)
    expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: hace2(36) }]), Q, AHORA)).toBe(false)
  })
  it('terminado, fallido o sin fila: no', async () => { for (const d of [[], [{ step_status: 'completed', updated_at: hace(1) }], [{ step_status: 'failed', updated_at: hace(1) }]]) expect(await turnoEnVueloEnElCorredor(db(d), Q, AHORA)).toBe(false) })
  it('sin poder leer, o sin fecha: no se sabe', async () => {
    expect(await turnoEnVueloEnElCorredor(db(null, { message: 'x' }), Q, AHORA)).toBeNull()
    expect(await turnoEnVueloEnElCorredor(db(null), Q, AHORA)).toBeNull()
    expect(await turnoEnVueloEnElCorredor(db([{ step_status: 'in_progress', updated_at: 'nada' }]), Q, AHORA)).toBeNull()
  })
})

describe('la ruta de la mesa', () => {
  const s = readFileSync('src/app/api/planeacion/mesa/route.ts', 'utf8')
  it('atiende con latido solo si se lo piden, y el turno sobrevive a quien se fue', () => {
    expect(s).toContain('if (!pideLatido(request)) return atender(request)')
    expect(s).toContain('responderConLatido(() => atender(request), { mantenerVivo: waitUntil })')
  })
  it('pregunta al corredor con el flujo que llama', () => { expect(s).toContain('turnoEnVueloEnElCorredor(db, { workflow_id: c.workflow_id, client_id, clave }, new Date())') })
})
