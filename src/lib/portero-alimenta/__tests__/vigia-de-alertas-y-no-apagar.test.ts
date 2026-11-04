/**
 * 04-nov (firma de Emilio): (1) el despertar y el vigilante NUNCA apagan el flujo diario por un cliente: pausan SOLO a ese cliente y avisan UNA vez;
 * (2) la vigía cierra SOLA toda alerta del portero cuando su causa se resuelve. US$ 0 · base falsa · los 10 clientes de práctica.
 */
import { describe, expect, it } from 'vitest'
import { rutaDespertar } from '../despertar'
import { vigiarAlertasDelPortero } from '../vigia-de-alertas'
import { crearBaseFalsa } from './base-falsa'
import { CASOS, REAL, montar, tablas } from './fixtures-despertar'

type T = Record<string, Array<Record<string, unknown>>>
const AHORA = new Date('2026-11-04T14:00:00Z')
const P1 = '11111111-aaaa-4aaa-8aaa-000000000001'
const C1 = '22222222-aaaa-4aaa-8aaa-000000000002'
const alerta = (clave: string, extra: Record<string, unknown> = {}) => ({ clave, canal: 'C', thread_ts: '1.1', titulo: 't', ultimo_detalle: 't', repeticiones: 0, abierto_en: '2026-11-03T12:00:00Z', ultima_en: '2026-11-03T12:00:00Z', cerrado_en: null, ...extra })
function vigia(t: T, flujo: 'activo' | 'apagado' | 'no_se_sabe' = 'activo') {
  const base = crearBaseFalsa(t as never)
  const resueltas: Array<[string, string]> = []
  const r = vigiarAlertasDelPortero({
    db: base.db as never, ahora: AHORA,
    estadoDelFlujo: async () => (flujo === 'no_se_sabe' ? { ok: false as const, detalle: 'n8n respondió 500' } : { ok: true as const, activo: flujo === 'activo' }),
    resolver: async (clave, nota) => { resueltas.push([clave, nota]); const f = t.cerebro_alertas.find((x) => x.clave === clave); if (f) f.cerrado_en = AHORA.toISOString(); return { ok: true, detalle: 'ok' } },
  })
  return { r, resueltas }
}

describe('el despertar nunca apaga el flujo diario', () => {
  it('con un problema de UN cliente: pausa solo a ese cliente, avisa UNA vez, apagados = 0', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t, { puenteFalla: true })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(m.apagados).toEqual([])
    expect(r.body.pausado).toMatchObject({ ok: true, ya_estaba: false })
    expect(t.cerebro_portero_pausas).toHaveLength(1)
    expect(m.avisos).toHaveLength(1)
    // otra pasada con la pausa ya abierta: ni segunda pausa ni segundo aviso
    const m2 = montar(t, { puenteFalla: true })
    const r2 = await rutaDespertar(m2.deps, { client_id: c.id, ...REAL })
    expect(m2.avisos).toEqual([])
    expect(t.cerebro_portero_pausas).toHaveLength(1)
    expect(r2.body.pausado).toMatchObject({ ya_estaba: true })
  })
  it('si no se puede registrar la pausa: se DICE (502 + aviso) y tampoco se apaga el flujo', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t, { puenteFalla: true, fallaEn: 'cerebro_portero_pausas' })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.status).toBe(502)
    expect(m.apagados).toEqual([])
    expect(m.avisos).toHaveLength(1); expect(m.avisos[0]).toMatch(/NO pude pausarlo/)
  })
  it.each(CASOS.map((x, i) => [i, x.nombre]))('cliente de práctica #%i «%s»: el problema de uno no apaga a nadie y queda pausado solo él', async (i) => {
    const c = CASOS[Number(i)]
    const t = tablas(c)
    const m = montar(t, { puenteFalla: true })
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(m.apagados).toEqual([])
    expect(t.cerebro_portero_pausas).toHaveLength(1); expect(t.cerebro_portero_pausas[0].client_id).toBe(c.id)
  })
})

describe('la vigía cierra sola las alertas cuya causa se resolvió', () => {
  it('pausa-alta: se cierra cuando la pausa tiene levantada_en; si sigue abierta, queda (y se dice por qué)', async () => {
    const t: T = { cerebro_portero_pausas: [{ id: P1, client_id: C1, desde: '2026-11-03T14:00:00Z', levantada_en: '2026-11-03T15:03:42Z' }], cerebro_alertas: [alerta(`pausa-alta:${P1}:3h`)] }
    const a = vigia(t); const r = await a.r
    expect(r.cerradas).toEqual([`pausa-alta:${P1}:3h`]); expect(a.resueltas[0][1]).toMatch(/2026-11-04T14:00Z · causa resuelta: la pausa se cerró el 2026-11-03T15:03/)
    t.cerebro_portero_pausas[0].levantada_en = null; t.cerebro_alertas[0].cerrado_en = null
    const b = await vigia(t).r
    expect(b.cerradas).toEqual([]); expect(b.sostenidas[0]).toMatchObject({ porque: 'la pausa sigue abierta' })
  })
  it('pausa:<cliente>: se cierra cuando el cliente ya no tiene pausa abierta', async () => {
    const t: T = { cerebro_portero_pausas: [{ id: P1, client_id: C1, levantada_en: '2026-11-02T00:00:00Z' }], cerebro_alertas: [alerta(`pausa:${C1}`)] }
    expect((await vigia(t).r).cerradas).toEqual([`pausa:${C1}`])
    const u: T = { cerebro_portero_pausas: [{ id: P1, client_id: C1, levantada_en: null }], cerebro_alertas: [alerta(`pausa:${C1}`)] }
    expect((await vigia(u).r).sostenidas).toHaveLength(1)
  })
  it('despertar-apagado y apagado: se cierran cuando el flujo está ENCENDIDO; apagado o sin poder preguntar → quedan abiertas', async () => {
    const mk = (): T => ({ cerebro_alertas: [alerta('despertar-apagado:ogfq56oIEoHufFPM'), alerta('apagado:ogfq56oIEoHufFPM')] })
    expect((await vigia(mk(), 'activo').r).cerradas).toHaveLength(2)
    const ap = await vigia(mk(), 'apagado').r
    expect(ap.cerradas).toEqual([]); expect(ap.sostenidas).toHaveLength(2)
    const ns = await vigia(mk(), 'no_se_sabe').r
    expect(ns.cerradas).toEqual([]); expect(ns.errores[0]).toMatch(/queda abierta/)
  })
  it('despertar-sin-pausa: se cierra cuando la última corrida del cliente tiene el vigilante en paz', async () => {
    const t: T = { cerebro_portero_corridas: [{ client_id: C1, creado_en: '2026-11-04T12:30:00Z', resumen: { vigilante: { ok: true } } }], cerebro_alertas: [alerta(`despertar-sin-pausa:${C1}`)] }
    expect((await vigia(t).r).cerradas).toHaveLength(1)
    t.cerebro_portero_corridas[0].resumen = { vigilante: { ok: false } }; t.cerebro_alertas[0].cerrado_en = null
    expect((await vigia(t).r).sostenidas).toHaveLength(1)
  })
  it('no toca alertas de otras reglas ni las ya cerradas', async () => {
    const t: T = { cerebro_alertas: [alerta('indice-rechazos:x:2026-11-03'), alerta('raspador:y:cambio'), alerta('apagado:ogfq56oIEoHufFPM', { cerrado_en: '2026-11-03T00:00:00Z' })] }
    const r = await vigia(t).r
    expect(r.abiertas).toBe(0); expect(r.cerradas).toEqual([])
  })
})
