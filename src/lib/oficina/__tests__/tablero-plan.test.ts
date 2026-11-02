/**
 * Acciones del tablero, CICLO DEL PLAN (01-nov · tramo 2): plan-cambios · plan-aprobar + la ruta que despierta al flujo. US$ 0, sin red (fetch falso).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { N8N_POR_OMISION } from '../despertar'
import { ACCIONES } from '../tablero/acciones'
import { CAMINO_PLAN_APROBADO, CAMINO_PLANEACION, TOPE_DE_VUELTAS, TOPE_REESCRITURA_USD, versionDelPlan } from '../tablero/plan'
import { DbFalsa } from './dbfalsa'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const AHORA = new Date('2026-11-01T15:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const plan = (extra: Record<string, unknown> = {}) => ({ id: P1, client_id: C, output_type: 'campaign_plan_90d', status: 'draft', created_at: '2026-10-30T10:00:00Z', provenance_tag: { fuente: 'planeacion' }, ...extra })
const GASTO = { confirmo_gasto: true, tope_usd: 6 }
const TEXTO = 'Estamos en Guayaquil SOLO por delivery; el local abre en un mes. Quita la apuesta del embudo: esos 48 pagos fueron pruebas mías.'

describe('plan-cambios', () => {
  it('guarda el pedido en plan_cambios (vuelta 1), no toca el plan y despierta la planeación con plan_base_id + cambios_del_dueno', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ ok: true, plan_id: P1, vuelta: 1, version_nueva: 2, vueltas_restantes: TOPE_DE_VUELTAS - 1, tope_usd: 6, estado: 'pendiente' })
    const fila = db.tablas['plan_cambios'][0]
    expect(fila).toMatchObject({ client_id: C, plan_id: P1, vuelta: 1, texto: TEXTO, pedido_por: 'emilio', tope_usd: 6, estado: 'pendiente', creado_en: AHORA.toISOString() })
    expect(s.cuerpo.plan_cambio_id).toBe(fila.id)
    expect(s.toca).toMatchObject({ client_id: C, output_id: P1, comentario: TEXTO })
    expect(s.despertar_flujo).toEqual({
      camino: CAMINO_PLANEACION,
      cuerpo: { client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO, plan_cambio_id: fila.id, forzar: true, force_restart: true, con_analisis: false, con_mercado: false, tope_reescritura_usd: 6, origen: 'tablero/plan-cambios', pedido_por: 'emilio' },
      registrar: { tabla: 'plan_cambios', id: String(fila.id) },
    })
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_aprobaciones'] ?? []).toHaveLength(0)
  })
  it('la compuerta pendiente de esa versión queda «cambios_pedidos» con quién, cuándo y el texto', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'pendiente' }])
    expect((await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })).status).toBe(200)
    expect(db.tablas['plan_aprobaciones'][0]).toMatchObject({ estado: 'cambios_pedidos', decidido_por: 'emilio', decidido_en: AHORA.toISOString(), comentario: TEXTO })
  })
  it('un pedido de 100.000 caracteres pasa la puerta: el dueño no tiene un tope corto (encargo 01-nov)', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: 'x'.repeat(100_000), ...GASTO })
    expect(s.cuerpo.error).not.toBe('entrada_invalida')
  })
  it('entradas malas → 400 sin tocar la base: plan_id, texto corto o largo, sin confirmar el gasto, tope por encima del máximo', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    for (const [cuerpo, error] of [
      [{ plan_id: 'x', texto: TEXTO, ...GASTO }, 'entrada_invalida'],
      [{ plan_id: P1, texto: 'abc', ...GASTO }, 'entrada_invalida'],
      [{ plan_id: P1, texto: 'x'.repeat(100_001), ...GASTO }, 'entrada_invalida'],
      [{ plan_id: P1, texto: TEXTO, tope_usd: 6 }, 'falta_confirmar_el_gasto'],
      [{ plan_id: P1, texto: TEXTO, confirmo_gasto: true }, 'falta_el_tope'],
      [{ plan_id: P1, texto: TEXTO, confirmo_gasto: true, tope_usd: TOPE_REESCRITURA_USD + 0.01 }, 'tope_demasiado_alto'],
    ] as Array<[Record<string, unknown>, string]>) {
      const s = await llamar('plan-cambios', db, cuerpo)
      expect(s.status).toBe(400); expect(s.cuerpo.error).toBe(error)
    }
    expect(db.tablas['plan_cambios'] ?? []).toHaveLength(0)
  })
  it('EN REVISIÓN: el tag dice compuerta=true y aún no hay fila de compuerta (la jefatura sigue) → 409 plan_en_revision en las dos puertas y nada se escribe; compuerta=false (sin compuerta) se trata como plan de antes', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { version: 1, vigente: true, compuerta: true } })])
    for (const [accion, cuerpo] of [['plan-cambios', { plan_id: P1, texto: TEXTO, ...GASTO }], ['plan-aprobar', { plan_id: P1 }]] as const) {
      const s = await llamar(accion, db, cuerpo)
      expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('plan_en_revision')
    }
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_cambios'] ?? []).toHaveLength(0)
    const sin = await llamar('plan-aprobar', new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { version: 1, vigente: true, compuerta: false } })]), { plan_id: P1 })
    expect(sin.status).toBe(200); expect(sin.cuerpo.reanuda).toBe(false)
  })
  it('los botones viejos de la ficha del cliente (mandan campana_id, sin plan_id) → 400 y no tocan nada', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    expect((await llamar('plan-aprobar', db, { campana_id: P1 })).status).toBe(400)
    expect((await llamar('plan-cambios', db, { campana_id: P1, comentario: 'Menos días de promoción' })).status).toBe(400)
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
  })
  it('flujo que NO despertó (despertado=false): repetir reutiliza el MISMO pedido con el texto nuevo y lo vuelve a despertar; despertado=true o sin saber aún → sigue en curso', async () => {
    const colgado = { id: 'c0', plan_id: P1, client_id: C, estado: 'pendiente', despertado: false, despertar_detalle: 'HTTP 503', texto: 'viejo', tope_usd: 3 }
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_cambios', [colgado]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'cambios_pedidos' }])
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(s.status).toBe(200); expect(s.cuerpo).toMatchObject({ plan_cambio_id: 'c0', reintento: true })
    expect(db.tablas['plan_cambios']).toHaveLength(1)
    expect(db.tablas['plan_cambios'][0]).toMatchObject({ texto: TEXTO, tope_usd: 6, despertado: null, despertar_detalle: null, estado: 'pendiente' })
    expect((s.despertar_flujo?.cuerpo as Record<string, unknown>).plan_cambio_id).toBe('c0')
    expect(db.tablas['plan_aprobaciones'][0].comentario).toBe(TEXTO)
    for (const despertado of [true, null]) {
      const r = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_cambios', [{ ...colgado, despertado }]), { plan_id: P1, texto: TEXTO, ...GASTO })
      expect(r.status).toBe(409); expect(r.cuerpo.error).toBe('reescritura_en_curso')
    }
  })
  it('dos pedidos simultáneos: el índice único de la base (23505) sale como 409 reescritura_en_curso, no como 500', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    const from = db.from.bind(db)
    db.from = ((t: string) => {
      if (t !== 'plan_cambios') return from(t)
      return { select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: [], error: null }) }) }) }), insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }) }
    }) as typeof db.from
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('reescritura_en_curso')
  })
  it('inexistente o de otro tipo → 404', async () => {
    expect((await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', []), { plan_id: P1, texto: TEXTO, ...GASTO })).status).toBe(404)
    expect((await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan({ output_type: 'campaign_plan_90d_borrador' })]), { plan_id: P1, texto: TEXTO, ...GASTO })).status).toBe(404)
  })
  it('solo el VIGENTE: reemplazado por tag (superseded_por · vigente=false) o con un plan más nuevo del cliente → 409 no_es_el_vigente; el más nuevo sí pasa', async () => {
    for (const tag of [{ superseded_por: P2 }, { vigente: false }]) {
      const s = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: tag })]), { plan_id: P1, texto: TEXTO, ...GASTO })
      expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('no_es_el_vigente')
    }
    const db = new DbFalsa().semilla('client_historical_outputs', [plan(), plan({ id: P2, created_at: '2026-10-31T10:00:00Z', provenance_tag: { version: 2, reemplaza_a: P1 } })])
    const viejo = await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(viejo.status).toBe(409); expect(viejo.cuerpo.error).toBe('no_es_el_vigente')
    const nuevo = await llamar('plan-cambios', db, { plan_id: P2, texto: TEXTO, ...GASTO })
    expect(nuevo.status).toBe(200); expect(nuevo.cuerpo).toMatchObject({ vuelta: 2, version_nueva: 3 })
    // un plan RECHAZADO más nuevo no quita la vigencia al anterior
    const db2 = new DbFalsa().semilla('client_historical_outputs', [plan(), plan({ id: P2, status: 'rejected', created_at: '2026-10-31T10:00:00Z' })])
    expect((await llamar('plan-cambios', db2, { plan_id: P1, texto: TEXTO, ...GASTO })).status).toBe(200)
  })
  it('aprobado → 409 plan_ya_aprobado; rechazado → 409 plan_rechazado', async () => {
    const a = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan({ status: 'approved' })]), { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(a.status).toBe(409); expect(a.cuerpo.error).toBe('plan_ya_aprobado')
    const r = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan({ status: 'rejected' })]), { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(r.status).toBe(409); expect(r.cuerpo.error).toBe('plan_rechazado')
  })
  it(`tope de vueltas: la versión ${TOPE_DE_VUELTAS} todavía se reescribe (última vuelta); la ${TOPE_DE_VUELTAS + 1} → 409 tope_de_vueltas y nada se guarda`, async () => {
    const ok = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { version: TOPE_DE_VUELTAS } })]), { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(ok.status).toBe(200); expect(ok.cuerpo).toMatchObject({ vuelta: TOPE_DE_VUELTAS, vueltas_restantes: 0 })
    const db = new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { version: TOPE_DE_VUELTAS + 1 } })])
    const s = await llamar('plan-cambios', db, { plan_id: P1, texto: TEXTO, ...GASTO })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('tope_de_vueltas'); expect(db.tablas['plan_cambios'] ?? []).toHaveLength(0)
  })
  it('con un pedido pendiente o en reescritura sobre el plan → 409 reescritura_en_curso; uno aplicado, fallido o cancelado no estorba', async () => {
    for (const estado of ['pendiente', 'en_reescritura']) {
      const s = await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_cambios', [{ id: 'c0', plan_id: P1, client_id: C, estado }]), { plan_id: P1, texto: TEXTO, ...GASTO })
      expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('reescritura_en_curso')
    }
    for (const estado of ['aplicado', 'fallido', 'cancelado']) {
      expect((await llamar('plan-cambios', new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_cambios', [{ id: 'c0', plan_id: P1, client_id: C, estado }]), { plan_id: P1, texto: TEXTO, ...GASTO })).status).toBe(200)
    }
  })
  it('versionDelPlan: sin tag o sin número entero ≥ 1 → 1', () => {
    expect(versionDelPlan(undefined)).toBe(1); expect(versionDelPlan({})).toBe(1); expect(versionDelPlan({ version: 0 })).toBe(1)
    expect(versionDelPlan({ version: '2' })).toBe(1); expect(versionDelPlan({ version: 2.5 })).toBe(1); expect(versionDelPlan({ version: 3 })).toBe(3)
  })
})

describe('plan-aprobar', () => {
  it('🔴 aprobar la versión vigente resuelve los avisos anotados sobre la primera versión, y no los de otro cliente', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('hitl_queue', [{ id: 'h1', type: 'palabra_del_dueno', status: 'pending', output_id: P2, client_id: C }, { id: 'h2', type: 'palabra_del_dueno', status: 'pending', output_id: P2, client_id: 'otro' }, { id: 'h3', type: 'palabra_del_dueno', status: 'rejected', output_id: P2, client_id: C }])
    expect((await llamar('plan-aprobar', db, { plan_id: P1 })).status).toBe(200)
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'approved', decision: { origen: 'plan-aprobar' } })
    expect(db.tablas['hitl_queue'][1].status).toBe('pending')
    expect(db.tablas['hitl_queue'][2].status).toBe('rejected')
  })
  const SOBRE = { _journey_id: 'j1', _sala_correlation_id: 'corr-1', client_name: 'Cliente', con_pendientes: false, dry_run: false }
  it('con la compuerta pendiente: el plan pasa a approved, la compuerta a aprobado, la nota de la bandeja se resuelve y se despierta la segunda mitad con el sobre', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'pendiente', sobre_de_reanudacion: SOBRE }])
      .semilla('hitl_queue', [{ id: 'h1', type: 'plan_con_pendientes', status: 'pending', output_id: P1 }, { id: 'h2', type: 'plan_con_pendientes', status: 'pending', output_id: P2 }])
    const s = await llamar('plan-aprobar', db, { plan_id: P1, comentario: 'va' })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ ok: true, plan_id: P1, version: 1, estado: 'approved', aprobado_por: 'emilio', reanuda: true, aprobacion_id: 'a1' })
    expect(db.tablas['client_historical_outputs'][0]).toMatchObject({ status: 'approved', updated_at: AHORA.toISOString() })
    expect(db.tablas['plan_aprobaciones'][0]).toMatchObject({ estado: 'aprobado', decidido_por: 'emilio', decidido_en: AHORA.toISOString(), comentario: 'va' })
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ status: 'approved', reviewer: 'emilio', decision: { via: 'tablero', origen: 'plan-aprobar' } })
    expect(db.tablas['hitl_queue'][1].status).toBe('pending')
    expect(s.toca).toMatchObject({ client_id: C, output_id: P1, comentario: 'va' })
    expect(s.despertar_flujo).toEqual({ camino: CAMINO_PLAN_APROBADO, cuerpo: { ...SOBRE, aprobacion_id: 'a1', plan_id: P1, client_id: C, aprobado_por: 'emilio', origen: 'tablero/plan-aprobar' }, registrar: { tabla: 'plan_aprobaciones', id: 'a1' } })
  })
  it('un plan de ANTES de la compuerta se aprueba sin reanudar nada (su segunda mitad ya corrió sola)', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    const s = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(s.status).toBe(200); expect(s.cuerpo).toMatchObject({ ok: true, estado: 'approved', reanuda: false })
    expect(String(s.cuerpo.motivo)).toContain('antes de la compuerta')
    expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['client_historical_outputs'][0].status).toBe('approved')
  })
  it('compuerta en «cambios_pedidos» sin reescritura abierta (falló o se canceló): se aprueba ASÍ y se reanuda', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'cambios_pedidos', sobre_de_reanudacion: SOBRE }])
      .semilla('plan_cambios', [{ id: 'c0', plan_id: P1, client_id: C, estado: 'fallido' }])
    const s = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(s.status).toBe(200); expect(s.cuerpo.reanuda).toBe(true); expect(db.tablas['plan_aprobaciones'][0].estado).toBe('aprobado')
  })
  it('compuerta «reemplazado» → 409 no_es_el_vigente y el plan no cambia', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'reemplazado', sobre_de_reanudacion: SOBRE }])
    const s = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('no_es_el_vigente'); expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    expect(db.tablas['plan_aprobaciones'][0].estado).toBe('reemplazado')
  })
  it('aprobar con un pedido que nunca despertó al flujo lo CANCELA y reanuda; con uno vivo sigue siendo 409', async () => {
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'cambios_pedidos', sobre_de_reanudacion: SOBRE }])
      .semilla('plan_cambios', [{ id: 'c0', plan_id: P1, client_id: C, estado: 'pendiente', despertado: false }])
    const s = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(s.status).toBe(200); expect(s.cuerpo.reanuda).toBe(true)
    expect(db.tablas['plan_cambios'][0].estado).toBe('cancelado')
  })
  it('segunda mitad que NO arrancó: repetir aprobar la vuelve a despertar una sola vez (despertado=false o aprobación cortada a mitad); ya despertada o sin compuerta → 409 y no se reanuda', async () => {
    const semilla = (comp: Record<string, unknown>) => new DbFalsa().semilla('client_historical_outputs', [plan({ status: 'approved' })]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, version: 2, sobre_de_reanudacion: SOBRE, ...comp }])
    const sinDespertar = semilla({ estado: 'aprobado', despertado: false, despertar_detalle: 'HTTP 503' })
    const r = await llamar('plan-aprobar', sinDespertar, { plan_id: P1 })
    expect(r.status).toBe(200); expect(r.cuerpo).toMatchObject({ reanuda: true, reintento: true, version: 2, aprobacion_id: 'a1' })
    expect(r.despertar_flujo?.camino).toBe(CAMINO_PLAN_APROBADO)
    expect((r.despertar_flujo?.cuerpo as Record<string, unknown>)._journey_id).toBe('j1')
    expect(sinDespertar.tablas['plan_aprobaciones'][0]).toMatchObject({ despertado: null, despertar_detalle: null })
    // el segundo clic ya no encuentra despertado=false: no hay doble brief
    const otra = await llamar('plan-aprobar', sinDespertar, { plan_id: P1 })
    expect(otra.status).toBe(409); expect(otra.despertar_flujo).toBeUndefined()
    const cortada = semilla({ estado: 'pendiente' })
    const c = await llamar('plan-aprobar', cortada, { plan_id: P1 })
    expect(c.status).toBe(200); expect(c.cuerpo.reintento).toBe(true)
    expect(cortada.tablas['plan_aprobaciones'][0]).toMatchObject({ estado: 'aprobado', decidido_por: 'emilio' })
    for (const comp of [{ estado: 'aprobado', despertado: true }, { estado: 'aprobado', despertado: null }]) {
      const s = await llamar('plan-aprobar', semilla(comp), { plan_id: P1 })
      expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('plan_ya_aprobado'); expect(s.despertar_flujo).toBeUndefined()
    }
  })
  it('409: ya aprobado · reescritura en curso · no es el vigente; 400: plan_id malo o comentario largo; nada cambia', async () => {
    const ya = await llamar('plan-aprobar', new DbFalsa().semilla('client_historical_outputs', [plan({ status: 'approved' })]), { plan_id: P1 })
    expect(ya.status).toBe(409); expect(ya.cuerpo.error).toBe('plan_ya_aprobado')
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_cambios', [{ id: 'c0', plan_id: P1, client_id: C, estado: 'en_reescritura' }])
    const en = await llamar('plan-aprobar', db, { plan_id: P1 })
    expect(en.status).toBe(409); expect(en.cuerpo.error).toBe('reescritura_en_curso'); expect(db.tablas['client_historical_outputs'][0].status).toBe('draft')
    const viejo = await llamar('plan-aprobar', new DbFalsa().semilla('client_historical_outputs', [plan({ provenance_tag: { superseded_por: P2 } })]), { plan_id: P1 })
    expect(viejo.status).toBe(409); expect(viejo.cuerpo.error).toBe('no_es_el_vigente')
    expect((await llamar('plan-aprobar', new DbFalsa(), { plan_id: 'x' })).status).toBe(400)
    expect((await llamar('plan-aprobar', new DbFalsa().semilla('client_historical_outputs', [plan()]), { plan_id: P1, comentario: 'x'.repeat(1001) })).status).toBe(400)
  })
})

describe('POST /api/tablero/plan-* · la ruta despierta al flujo con la llave de despacho y deja constancia en la fila', () => {
  const previos = { int: process.env.INTERNAL_API_KEY, sala: process.env.SALA_DISPATCH_KEY, base: process.env.N8N_WEBHOOK_BASE }
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-int'; process.env.SALA_DISPATCH_KEY = 'k-sala'; delete process.env.N8N_WEBHOOK_BASE })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [['INTERNAL_API_KEY', previos.int], ['SALA_DISPATCH_KEY', previos.sala], ['N8N_WEBHOOK_BASE', previos.base]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  })
  const peticion = (cuerpo: unknown) => new Request('https://t.test/api/tablero/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k-int' }, body: JSON.stringify(cuerpo) })
  it('plan-cambios → POST a nuestro n8n /zero-risk/planeacion con x-sala-dispatch-key; despertado=true queda en plan_cambios y el rastro lleva el plan', async () => {
    const f = vi.fn(async () => new Response('{"message":"Workflow was started"}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    const { POST } = await import('@/app/api/tablero/[accion]/route')
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()])
    mocks.db = db
    const r = await POST(peticion({ plan_id: P1, texto: TEXTO, ...GASTO, reviewer: 'emilio', origen: 'dashboard' }), { params: { accion: 'plan-cambios' } })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, vuelta: 1, despertado: true })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${N8N_POR_OMISION}/zero-risk/planeacion`)
    expect((init.headers as Record<string, string>)['x-sala-dispatch-key']).toBe('k-sala')
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: C, plan_base_id: P1, cambios_del_dueno: TEXTO, plan_cambio_id: j.plan_cambio_id, forzar: true, con_analisis: false, con_mercado: false })
    expect(db.tablas['plan_cambios'][0]).toMatchObject({ despertado: true, despertar_detalle: 'HTTP 200' })
    expect(db.tablas['eventos_de_emilio'][0]).toMatchObject({ accion: 'tablero', decision: 'plan-cambios', client_id: C, output_id: P1 })
  })
  it('si n8n contesta mal o no hay llave de despacho: la acción queda guardada, despertado=false con el motivo (nadie gastó)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const { POST } = await import('@/app/api/tablero/[accion]/route')
    const db = new DbFalsa().semilla('client_historical_outputs', [plan()]).semilla('plan_aprobaciones', [{ id: 'a1', plan_id: P1, client_id: C, estado: 'pendiente', sobre_de_reanudacion: {} }])
    mocks.db = db
    const r = await POST(peticion({ plan_id: P1 }), { params: { accion: 'plan-aprobar' } })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, reanuda: true, despertado: false, motivo_sin_despertar: 'el flujo contestó HTTP 503' })
    expect(db.tablas['plan_aprobaciones'][0]).toMatchObject({ estado: 'aprobado', despertado: false, despertar_detalle: 'el flujo contestó HTTP 503' })
    delete process.env.SALA_DISPATCH_KEY
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const db2 = new DbFalsa().semilla('client_historical_outputs', [plan()])
    mocks.db = db2
    const r2 = await POST(peticion({ plan_id: P1, texto: TEXTO, ...GASTO }), { params: { accion: 'plan-cambios' } })
    expect((await r2.json()).motivo_sin_despertar).toContain('SALA_DISPATCH_KEY')
    expect(f).not.toHaveBeenCalled()
    expect(db2.tablas['plan_cambios'][0]).toMatchObject({ estado: 'pendiente', despertado: false })
  })
  it('un 409 no despierta a nadie', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const { POST } = await import('@/app/api/tablero/[accion]/route')
    mocks.db = new DbFalsa().semilla('client_historical_outputs', [plan({ status: 'approved' })])
    expect((await POST(peticion({ plan_id: P1 }), { params: { accion: 'plan-aprobar' } })).status).toBe(409)
    expect(f).not.toHaveBeenCalled()
  })
})
