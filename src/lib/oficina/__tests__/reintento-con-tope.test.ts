/**
 * GO Lenovo 11-nov 03:02Z · EL REINTENTO DE PIEZAS PASA POR EL TOPE DE CAMPAÑA (CC4). US$ 0 · sin red.
 * Antes: el reintento automático solo miraba el freno del cliente (24 h); la vía normal (`autoproducir`) además decide con el tope de la campaña. Ahora el reintento usa LA MISMA
 * función (`decidirTopeDelParte`) y el MISMO aviso al buzón. Se prueba de punta a punta con los puertos REALES del reintento (`reintento-adaptador.ts`) sobre una base falsa
 * y un almacén de la cadena falso con la forma de la lectura real del gasto. Dos clientes de rubros distintos.
 *   · Restaurante: la foto del 12-nov (encargo fallido, sin gasto, que la puerta reabre) — cuenta SU tope aunque su encargo no haya gastado.
 *   · Consultora B2B de práctica: dos piezas de dos partes en la MISMA pasada — la segunda ve a la primera.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from './dbfalsa'
import type { SobreDeProducir } from '@/lib/cadena/autoproducir'
import type { LecturaDeGasto } from '@/lib/cadena/tope-de-campana'

const T0 = Date.parse('2026-11-11T02:30:00Z')
const reloj = () => new Date(T0 + 20 * 60_000)

const cad = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  campanas: [] as Array<Record<string, unknown>>,
  emitidos: [] as SobreDeProducir[],
  buzon: [] as Array<Record<string, unknown>>,
  gasto: null as null | (() => unknown),
  filas: [] as Array<Record<string, unknown>> | 'falla',
}))
vi.mock('@/lib/cadena/almacen-supabase', () => ({
  almacenDeSupabase: () => ({
    leerConfig: async (k: string) => cad.config[k],
    escribirConfig: async (k: string, v: unknown) => { cad.config[k] = v },
    campanasActivas: async () => cad.campanas,
    campana: async (id: string) => cad.campanas.find((c) => c.id === id) ?? null,
    ultimaVersionDeCalendario: async () => 1,
    filas: async () => { if (cad.filas === 'falla') throw new Error('calendario caído'); return cad.filas },
    frenoDeGasto: async () => ({ bloqueado: false }),
    emitirSobre: async (s: SobreDeProducir) => { cad.emitidos.push(s); return { resultado: 'aceptado' } },
    leerGastoDeCampana: async () => cad.gasto!(),
    formatos: async () => ({}),
    avisarAlBuzon: async (a: Record<string, unknown>) => { cad.buzon.push(a); return { ok: true, accion: 'nuevo' } },
  }),
}))
import { reintentoDeLaCadena } from '../reintento-adaptador'

const TOPES = { post_img: 1.5, carrusel_ig_v1: 1.5 }
const lectura = (o: Partial<LecturaDeGasto> = {}): LecturaDeGasto => ({ corridas: [], conceptos: [], briefs: [], encargos: [], partes: [], topes_de_familia: TOPES, soltados: [], ...o })
const parte = (id: string, client_id: string, campana: string, briefs: Array<{ brief_id: string; fila_id: string; familia: string }>, creado = T0) => ({
  id, client_id, output_type: 'campaign_brief_pack', created_at: new Date(creado).toISOString(), provenance_tag: { lote_key: `${campana}:2026-W46:1`, valido: true, familias_por_brief: briefs },
})
const mundo = (clientId: string, partes: Array<Record<string, unknown>>, encargos: Array<Record<string, unknown>> = []) => new DbFalsa()
  .semilla('client_historical_outputs', partes)
  .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img', 'carrusel_ig_v1'], clientes_ensayo: [] }])
  .semilla('oficina_tipos_de_grupo', [
    { tipo: 'post_img', familia: 'post_img', pasos: [], indicaciones: {}, limites: { tope_encargo_usd: 1.5 }, activo: true },
    { tipo: 'carrusel_ig_v1', familia: 'carrusel_ig_v1', pasos: [], indicaciones: {}, limites: { tope_encargo_usd: 1.5 }, activo: true },
  ])
  .semilla('clients', [{ id: clientId, slug: 'cliente', config: {} }])
  .semilla('client_brand_books', [{ client_id: clientId, version: 1, primary_colors: ['#112233'] }])
  .semilla('oficina_encargos', encargos)
const pasada = (db: DbFalsa, ejecutar = true) => reintentoDeLaCadena(db as never, { slackToken: 'xoxb-falso' }, { ejecutar }, reloj) as Promise<{ accion: string; emitidos: number; plan: Array<{ brief_id: string; accion: string; detalle?: string }> }>
const acciones = (r: Awaited<ReturnType<typeof pasada>>) => r.plan.map((l) => `${l.brief_id}:${l.accion}`)

beforeEach(() => { cad.config = { estado_cadena: 'encendida', reintento_piezas: true }; cad.emitidos = []; cad.buzon = []; cad.gasto = null; cad.filas = [] })

describe('restaurante · la foto con su encargo fallido sin gasto cuenta SU tope', () => {
  const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
  const CAMPANA = 'aaaaaaaa-0000-4000-8000-000000000001'
  const PARTE = 'aaaaaaaa-0000-4000-8000-0000000000p1'
  const FOTO = { brief_id: 'BRF-0007', fila_id: 's2-d4-jue_foto_olon', familia: 'post_img' }
  // el encargo de la foto falló a los 4 s («no es un post de imagen»), sin gasto ni pasos: la puerta lo reabre como v2 → el reintento lo ve como «no llegó»
  const ENCARGO = { id: '7c6f365a-0000-4000-8000-000000000000', parte_id: PARTE, brief_id: FOTO.brief_id, version_encargo: 1, estado: 'fallido', gasto_usd: 0, tope_usd: 1.5, dry_run: false, estado_del_motor: { pasos_ejecutados: 0 } }
  // lo que lee la cadena: US$ 30 ya gastados en la campaña, el encargo fallido (gasto 0) y el sobre original que la sala recibió
  const gasto = () => lectura({ conceptos: [{ costo_usd: 30, encargo_id: null }], encargos: [{ id: ENCARGO.id, parte_id: PARTE, brief_id: FOTO.brief_id, estado: 'fallido', tope_usd: 1.5, gasto_usd: 0 }], partes: [{ id: PARTE, briefs: [FOTO] }], soltados: [{ parte_id: PARTE, brief_id: FOTO.brief_id }] })
  const db = () => mundo(CLIENTE, [parte(PARTE, CLIENTE, CAMPANA, [FOTO])], [ENCARGO])
  const conTope = (tope: unknown) => { cad.campanas = [{ id: CAMPANA, client_id: CLIENTE, estado: 'activa', autoproducir: true, seco: false, tope_gasto_usd: tope, zona_horaria: 'America/Guayaquil', sala_ref: {} }]; cad.gasto = gasto }

  it('cabe (30 + 1,50 ≤ 40): sale el reintento r1 y se anota el intento', async () => {
    conTope(40)
    const r = await pasada(db())
    expect(acciones(r)).toEqual([`${FOTO.brief_id}:reintentar`])
    expect(cad.emitidos.map((s) => s.idempotency_key)).toEqual([`${PARTE}:${FOTO.brief_id}:producir:r1`])
    expect(cad.buzon).toEqual([])
  })
  it('no cabe (30 + 1,50 > 31): no sale, NO gasta un intento y avisa al buzón con el MISMO aviso que la vía normal', async () => {
    conTope(31)
    const r = await pasada(db())
    expect(acciones(r)).toEqual([`${FOTO.brief_id}:tope`])
    expect(r.plan[0].detalle).toMatch(/no cabe en el tope de la campaña \(US\$ 31\.00/)
    expect(cad.emitidos).toEqual([])
    expect(cad.config.reintentos_piezas).toBeUndefined()
    expect(cad.buzon).toHaveLength(1)
    expect(cad.buzon[0]).toMatchObject({ clave: `cadena:tope-de-campana:${CAMPANA}:31`, tipo: 'pregunta', client_id: CLIENTE, origen: 'cadena/reintento-de-piezas · tope de campaña' })
  })
  it('justo en el borde (30 + 1,50 = 31,50): sale (la misma regla «≤» de la vía normal)', async () => {
    conTope(31.5)
    expect(acciones(await pasada(db()))).toEqual([`${FOTO.brief_id}:reintentar`])
  })
  it('campaña sin tope: no sale nada y se pregunta (una campaña sin tope no gasta)', async () => {
    for (const t of [null, 0, 'abc']) {
      cad.emitidos = []; cad.buzon = []; conTope(t)
      const r = await pasada(db())
      expect(acciones(r)).toEqual([`${FOTO.brief_id}:tope`]); expect(cad.emitidos).toEqual([])
      expect(cad.buzon[0]).toMatchObject({ clave: `cadena:tope-de-campana:${CAMPANA}:sin-tope` })
    }
  })
  it('gasto ilegible: no sale nada, no gasta un intento y se avisa como alarma (un error no es «cero gastado»)', async () => {
    conTope(40); cad.gasto = () => { throw new Error('base caída') }
    const r = await pasada(db())
    expect(acciones(r)).toEqual([`${FOTO.brief_id}:tope`]); expect(r.plan[0].detalle).toMatch(/ilegible: base caída/)
    expect(cad.emitidos).toEqual([]); expect(cad.config.reintentos_piezas).toBeUndefined()
    expect(cad.buzon[0]).toMatchObject({ clave: `cadena:gasto-de-campana-ilegible:${CAMPANA}`, tipo: 'alarma' })
  })
  it('certificación CC7 · calendario ilegible: con el puerto real, la lectura del calendario falla → la pieza queda en «tope» (no se toma como calendario vacío)', async () => {
    conTope(40); cad.filas = 'falla'
    const r = await pasada(db())
    expect(acciones(r)).toEqual([`${FOTO.brief_id}:tope`]); expect(r.plan[0].detalle).toMatch(/ilegible: no se pudo leer el calendario/)
    expect(cad.emitidos).toEqual([]); expect(cad.config.reintentos_piezas).toBeUndefined()
  })
  it('en seco: el plan dice «tope» y no se avisa ni se emite nada', async () => {
    conTope(31)
    const r = await pasada(db(), false)
    expect(r.accion).toBe('en_seco'); expect(acciones(r)).toEqual([`${FOTO.brief_id}:tope`])
    expect(cad.buzon).toEqual([]); expect(cad.emitidos).toEqual([])
  })
})

describe('consultora B2B de práctica · dos partes en la MISMA pasada: la segunda ve a la primera', () => {
  const CLIENTE = 'bbbbbbbb-0000-4000-8000-00000000c11e'
  const CAMPANA = 'bbbbbbbb-0000-4000-8000-000000000001'
  const P1 = 'bbbbbbbb-0000-4000-8000-0000000000p1', P2 = 'bbbbbbbb-0000-4000-8000-0000000000p2'
  const B1 = { brief_id: 'BRF-0001', fila_id: 's1-d2-mar_carrusel_linkedin', familia: 'carrusel_ig_v1' }
  const B2 = { brief_id: 'BRF-0002', fila_id: 's2-d2-mar_carrusel_linkedin', familia: 'carrusel_ig_v1' }
  // ninguna de las dos llegó a encargo y la sala nunca recibió sus sobres (la sala los rechazó antes de anotarlos): nada gastado, nada comprometido
  const db = () => mundo(CLIENTE, [parte(P1, CLIENTE, CAMPANA, [B1]), parte(P2, CLIENTE, CAMPANA, [B2])])
  const conTope = (tope: number, o: Partial<LecturaDeGasto> = {}) => {
    cad.campanas = [{ id: CAMPANA, client_id: CLIENTE, estado: 'activa', autoproducir: true, seco: false, tope_gasto_usd: tope, zona_horaria: 'America/Bogota', sala_ref: {} }]
    cad.gasto = () => lectura({ partes: [{ id: P1, briefs: [B1] }, { id: P2, briefs: [B2] }], ...o })
  }
  it('tope US$ 2: sale una (1,50) y la otra queda por tope (1,50 + 1,50 > 2)', async () => {
    conTope(2)
    const r = await pasada(db())
    expect(r.plan.map((l) => l.accion).sort()).toEqual(['reintentar', 'tope'])
    expect(cad.emitidos).toHaveLength(1)
  })
  it('tope US$ 3: salen las dos', async () => {
    conTope(3)
    expect((await pasada(db())).plan.map((l) => l.accion)).toEqual(['reintentar', 'reintentar']); expect(cad.emitidos).toHaveLength(2)
  })
  it('si la sala YA recibió el sobre de la primera, ya está en lo comprometido y no se cuenta dos veces (tope US$ 3 · salen las dos)', async () => {
    conTope(3, { soltados: [{ parte_id: P1, brief_id: B1.brief_id }, { parte_id: P2, brief_id: B2.brief_id }] })
    expect((await pasada(db())).plan.map((l) => l.accion)).toEqual(['reintentar', 'reintentar'])
  })
})

describe('certificación CC7 · lo soltado en la pasada en OTRO parte, en sus dos formas', () => {
  const CLIENTE = 'cccccccc-0000-4000-8000-00000000c11e'
  const CAMPANA = 'cccccccc-0000-4000-8000-000000000001'
  const P1 = 'cccccccc-0000-4000-8000-0000000000p1', P2 = 'cccccccc-0000-4000-8000-0000000000p2'
  const A = { brief_id: 'BRF-0001', fila_id: 's1-d4-jue_foto', familia: 'post_img' }
  const B = { brief_id: 'BRF-0002', fila_id: 's2-d6-sab_foto', familia: 'post_img' }
  const conTope = (tope: number, l: Partial<LecturaDeGasto>) => {
    cad.campanas = [{ id: CAMPANA, client_id: CLIENTE, estado: 'activa', autoproducir: true, seco: false, tope_gasto_usd: tope, zona_horaria: 'America/Guayaquil', sala_ref: {} }]
    cad.gasto = () => lectura({ partes: [{ id: P1, briefs: [A] }, { id: P2, briefs: [B] }], ...l })
  }
  it('dos partes, cada uno con una pieza FALLIDA a US$ 0 cuyo sobre la sala ya recibió, y un tope que alcanza para una (US$ 2) → sale una sola', async () => {
    const fallido = (parte_id: string, brief_id: string) => ({ id: `e-${brief_id}`, parte_id, brief_id, version_encargo: 1, estado: 'fallido', gasto_usd: 0, tope_usd: 1.5, dry_run: false, estado_del_motor: { pasos_ejecutados: 0 } })
    conTope(2, {
      encargos: [{ id: 'e-BRF-0001', parte_id: P1, brief_id: A.brief_id, estado: 'fallido', tope_usd: 1.5, gasto_usd: 0 }, { id: 'e-BRF-0002', parte_id: P2, brief_id: B.brief_id, estado: 'fallido', tope_usd: 1.5, gasto_usd: 0 }],
      soltados: [{ parte_id: P1, brief_id: A.brief_id }, { parte_id: P2, brief_id: B.brief_id }],
    })
    const r = await pasada(mundo(CLIENTE, [parte(P1, CLIENTE, CAMPANA, [A]), parte(P2, CLIENTE, CAMPANA, [B])], [fallido(P1, A.brief_id), fallido(P2, B.brief_id)]))
    expect(r.plan.map((l) => l.accion).sort()).toEqual(['reintentar', 'tope'])
    expect(cad.emitidos).toHaveLength(1)
  })
  it('una pieza retenida de otro parte (sin encargo, la sala nunca la recibió) que la pasada suelta no se cuenta dos veces: con tope justo (US$ 3) la siguiente también cabe', async () => {
    // A (jueves 12) es anterior a B (sábado 14): mientras A esté retenida, guarda lugar ANTES de B. Cuando la pasada la suelta, cuenta como comprometida y deja de guardar lugar.
    cad.filas = [{ id: A.fila_id, fecha: '2026-11-12', hora: '12:00', estado: 'briefeada' }, { id: B.fila_id, fecha: '2026-11-14', hora: '12:00', estado: 'briefeada' }]
    conTope(3, {})
    // el parte de A es el más nuevo: la pasada lo ve primero (los partes se leen del más nuevo al más viejo)
    const r = await pasada(mundo(CLIENTE, [parte(P1, CLIENTE, CAMPANA, [A], T0 + 60_000), parte(P2, CLIENTE, CAMPANA, [B])]))
    expect(acciones(r)).toEqual([`${A.brief_id}:reintentar`, `${B.brief_id}:reintentar`])
    expect(cad.emitidos).toHaveLength(2)
  })
})
