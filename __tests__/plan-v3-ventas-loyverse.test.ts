/**
 * PLAN v3 · LAS VENTAS DEL PUNTO DE VENTA COMO DATO (CC#1 · 16-oct) · US$ 0: lecturas sobre una base en memoria con las 10 fichas REALES de Náufrago (15-oct; sin el detalle diario del mes en curso).
 * Base: LISTO-CC-CEREBRO-ventas-loyverse («Cómo lo leen…», vía 3). Solo LEE lo que ya está en el cerebro: no toca el `portero` ni el cerebro.
 *  · 3 filas de catálogo (`ventas_mes`, `tickets_mes`, `ticket_promedio`) por la vía oficial `catalogo-agregar`;
 *  · el lector arma `periodo = ventana(desde, hasta)` con `provenance_tag.datos`;
 *  · la semilla de la oficina financiera recibe las cifras y `sanearProcedencia` las acepta;
 *  · SIN las filas (hoy) o sin plan_v3: todo igual que antes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarAlta } from '../scripts/ops/catalogo-agregar/nucleo.mjs'
import { cargarJs, FILAS, fichasOroPiloto } from '../scripts/ops/plan-v3-seco/corredor'
import { crearSnapshot, type FilaDeTipo } from '../src/lib/planeacion/dato-v1/catalogo'
import { armarDatoV1 } from '../src/lib/planeacion/dato-v1/armar'
import { fichasAEntradas } from '../src/lib/planeacion/dato-v1/lector-cerebro'
import { sanearProcedencia, validarProcedencia } from '../src/lib/finanzas/conversa/esquemas'

type Json = Record<string, any>
const DIR = path.join(__dirname, '..', 'scripts', 'ops', 'catalogo-agregar', 'altas-ventas-loyverse')
const ALTAS = ['ventas_mes', 'tickets_mes', 'ticket_promedio'].map((n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), 'utf8')) as Json)
const FICHAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ventas-loyverse', 'fichas-reales-2026-10-15.json'), 'utf8')) as Json[]
const AHORA = new Date('2026-10-16T03:00:00Z')
const ID = 'cliente-practica-ventas'

const conAltas = (): Json[] => [...FILAS.tipos, ...ALTAS.map((a, i) => ({ ...a, version: 1, vigente: true, _i: i }))] as Json[]
function baseEnMemoria(o: { tipos?: Json[]; fichas?: Json[]; config?: Json } = {}) {
  const tablas: Record<string, unknown[]> = {
    plan_catalogo_fuentes: FILAS.fuentes, plan_catalogo_tipos: o.tipos ?? FILAS.tipos, plan_catalogo_reglas: FILAS.reglas, plan_catalogo_lexico: FILAS.lexico, plan_catalogo_topes: FILAS.topes,
    cerebro_fichas: o.fichas ?? FICHAS,
    clients: [{ id: ID, name: 'Negocio de práctica', website_url: 'https://practica.test', industry: 'restaurante', country: 'Ecuador', config: o.config ?? { moneda: 'USD' }, canonical_client_id: null }],
    client_sedes: [], apify_raw: [],
  }
  return { from(t: string) { const q: any = new Proxy({}, { get: (_o, k) => (k === 'then' ? (res: (v: unknown) => void) => res({ data: tablas[t] ?? [], error: null }) : () => q) }); return q } }
}
const ventas = (r: any) => (r.ok ? r.datos.filter((d: Json) => ['ventas_mes', 'tickets_mes', 'ticket_promedio'].includes(d.tipo_id)) : [])

describe('las filas de catálogo (vía oficial `catalogo-agregar`)', () => {
  it('las 3 altas son válidas y no traen columnas de control', () => {
    for (const a of ALTAS) {
      const r = validarAlta('tipos', a)
      expect(r.errores, a.tipo_id).toEqual([])
      expect(r.ok).toBe(true)
    }
  })
  it('lo que el diseño pide: prefijo `:*`, unidad y moneda, rango ≥ 0, frescura 1080 h, período requerido', () => {
    expect(ALTAS.map((a) => a.atributo_cerebro)).toEqual(['metrica:loyverse:ingreso:*', 'metrica:loyverse:tickets:*', 'metrica:loyverse:ticket_promedio:*'])
    for (const a of ALTAS) { expect(a.frescura_limite_h).toBe(1080); expect(a.periodo_requerido).toBe(true); expect(a.rango).toEqual({ min: 0 }) }
    expect(ALTAS.filter((a) => a.moneda_requerida).map((a) => a.tipo_id).sort()).toEqual(['ticket_promedio', 'ventas_mes'])
    // no chocan con ninguna fila del catálogo de hoy
    const hoy = new Set(FILAS.tipos.map((t) => t.tipo_id))
    for (const a of ALTAS) expect(hoy.has(a.tipo_id), a.tipo_id).toBe(false)
  })
})

describe('el lector: período de la ventana y mapeo', () => {
  const snap = crearSnapshot({ ...FILAS, tipos: conAltas() as unknown as FilaDeTipo[] })
  it('con las filas: 6 de las 10 fichas quedan mapeadas; las 4 de texto siguen «sin tipo» y se cuentan', () => {
    const r = fichasAEntradas(FICHAS, snap)
    expect(r.resumen.mapeadas).toBe(6)
    expect(Object.values(r.resumen.sin_tipo).reduce((a, b) => a + b, 0)).toBe(4)
    for (const e of r.entradas) {
      expect(['ventas_mes', 'tickets_mes', 'ticket_promedio']).toContain(e.tipo_id)
      expect(e.periodo?.tipo).toBe('ventana')
      expect(e.periodo?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.periodo?.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof e.contenido).toBe('number')
    }
  })
  it('SIN las filas (hoy): nada se mapea y ninguna entrada trae período (idéntico a antes)', () => {
    const r = fichasAEntradas(FICHAS, crearSnapshot(FILAS))
    expect(r.resumen.mapeadas).toBe(0)
    expect(r.entradas).toEqual([])
    // y las fichas que no declaran ventana no ganan `periodo` (las del piloto de siempre)
    const oro = fichasAEntradas(fichasOroPiloto(), snap)
    expect(oro.entradas.length).toBeGreaterThan(0)
    expect(oro.entradas.every((e) => e.periodo === undefined)).toBe(true)
  })
  it('una ficha con `datos.desde/hasta` mal formados NO inventa período', () => {
    const rota = FICHAS.filter((f) => /ingreso:ultimos_30_dias/.test(String(f.atributo))).map((f) => ({ ...f, provenance_tag: { ...f.provenance_tag, datos: { ...f.provenance_tag.datos, desde: 'ayer', hasta: null } } }))
    const r = fichasAEntradas(rota, snap)
    expect(r.entradas).toHaveLength(1)
    expect(r.entradas[0].periodo).toBeUndefined()
  })
})

describe('el dato v1 de punta a punta (ruta real sobre las 10 fichas reales)', () => {
  it('las cifras entran como `medido` (plataforma propia) y trajo, con moneda de `clients.config.moneda` y su ventana', async () => {
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas() }) as never, { client_id: ID }, AHORA)
    expect(r.ok).toBe(true)
    const v = ventas(r)
    expect(v).toHaveLength(6)
    const por = (t: string, a: RegExp) => v.find((d: Json) => d.tipo_id === t && a.test(String(d.atributo)))
    expect(por('ventas_mes', /2026-10$/)?.valor.numero).toBe(2649.75)
    expect(por('ventas_mes', /ultimos_30_dias$/)?.valor.numero).toBe(4998.5)
    expect(por('tickets_mes', /2026-10$/)?.valor.numero).toBe(252)
    expect(por('tickets_mes', /ultimos_30_dias$/)?.valor.numero).toBe(460)
    expect(por('ticket_promedio', /2026-10$/)?.valor.numero).toBe(10.51)
    expect(por('ticket_promedio', /ultimos_30_dias$/)?.valor.numero).toBe(10.87)
    for (const d of v) {
      expect(d.estado).toBe('trajo')
      expect(d.origen).not.toBe('hueco')
      expect(d.periodo.tipo).toBe('ventana')
      expect(d.alcance).toBe('cliente')
    }
    for (const d of v.filter((x: Json) => x.tipo_id !== 'tickets_mes')) expect(d.valor.moneda).toBe('USD')
    expect(por('ventas_mes', /2026-10$/)?.periodo).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-15' })
    expect(por('ventas_mes', /ultimos_30_dias$/)?.periodo).toMatchObject({ desde: '2026-09-15', hasta: '2026-10-15' })
  })
  it('sin moneda declarada: el dato en dinero NO queda como medido con una moneda inventada', async () => {
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas(), config: {} }) as never, { client_id: ID }, AHORA)
    expect(r.ok).toBe(true)
    const dinero = ventas(r).filter((d: Json) => d.tipo_id === 'ventas_mes')
    expect(dinero).toHaveLength(2)
    for (const d of dinero) {
      // o la moneda sale rotulada supuesto (fila de país) o el dato queda sin moneda y marcado; nunca «medido en USD» por omisión
      expect(d.valor.moneda === undefined || d.rotulo !== undefined || d.origen === 'supuesto' || (d.marcas ?? []).length > 0).toBe(true)
    }
  })
  it('SIN las filas (hoy): ningún dato de ventas y el resto del dato v1 no cambia', async () => {
    const sin = await armarDatoV1(baseEnMemoria() as never, { client_id: ID }, AHORA)
    expect(sin.ok).toBe(true)
    expect(ventas(sin)).toEqual([])
    const con = await armarDatoV1(baseEnMemoria({ tipos: conAltas() }) as never, { client_id: ID }, AHORA)
    if (!sin.ok || !con.ok) throw new Error('lectura')
    const sinVentas = con.datos.filter((d) => !['ventas_mes', 'tickets_mes', 'ticket_promedio'].includes(d.tipo_id))
    expect(JSON.stringify(sinVentas.map((d) => ({ ...d, id: undefined })))).toBe(JSON.stringify(sin.datos.map((d) => ({ ...d, id: undefined }))))
  })
  it('la tienda viaja en el atributo: total y tienda son datos distintos y no se suman', async () => {
    const base = FICHAS.find((f) => f.atributo === 'metrica:loyverse:ingreso:2026-10')!
    const tienda = { ...base, id: 'ficha-tienda-1', atributo: 'metrica:loyverse:ingreso:2026-10:tienda-centro', huella: 'h-tienda', provenance_tag: { ...base.provenance_tag, datos: { ...base.provenance_tag.datos, tienda: 'centro' }, metrica: { ...base.provenance_tag.metrica, valor: 1000 } } }
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas(), fichas: [...FICHAS, tienda] }) as never, { client_id: ID }, AHORA)
    const v = ventas(r).filter((d: Json) => d.tipo_id === 'ventas_mes' && /2026-10/.test(String(d.atributo)))
    expect(v.map((d: Json) => d.valor.numero).sort()).toEqual([1000, 2649.75])
    expect(v.some((d: Json) => /tienda-centro/.test(String(d.atributo)))).toBe(true)
    expect(v.every((d: Json) => d.derivado.si === false)).toBe(true)
  })
})

describe('la semilla de la oficina financiera y la red de seguridad', () => {
  it('las 6 cifras llegan a la semilla compacta, pasan la validación de F8 y caben', async () => {
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas() }) as never, { client_id: ID }, AHORA)
    if (!r.ok) throw new Error('lectura')
    const enSemilla = r.semilla.datos.filter((d) => ['ventas_mes', 'tickets_mes', 'ticket_promedio'].includes(String(d.tipo_id)))
    expect(enSemilla).toHaveLength(6)
    expect(validarProcedencia(r.semilla.datos).ok).toBe(true)
    expect(JSON.stringify(r.semilla.datos).length).toBeLessThanOrEqual(40_000)
    for (const d of enSemilla) { expect(d.periodo?.tipo).toBe('ventana'); expect(d.procedencia).toBe('medido') }
  })
  it('`sanearProcedencia` las acepta en real y las rebaja a «supuesto» en un ensayo (nunca «medido»)', async () => {
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas() }) as never, { client_id: ID }, AHORA)
    if (!r.ok) throw new Error('lectura')
    const mias = r.semilla.datos.filter((d) => ['ventas_mes', 'tickets_mes', 'ticket_promedio'].includes(String(d.tipo_id)))
    const real = sanearProcedencia(mias, false)
    expect(real.every((d) => d.procedencia === 'medido' && d.valor !== null)).toBe(true)
    const ensayo = sanearProcedencia(mias, true)
    expect(ensayo.every((d) => d.procedencia === 'supuesto')).toBe(true)
  })
  it('el dato con identidad que no coincide NO pasa como cerebro (la red de seguridad sigue)', () => {
    const malo = sanearProcedencia([{ clave: 'D1·ventas_mes', fuente: 'cerebro_vivo', procedencia: 'cerebro', identidad: 'no_coincide', valor: 100, tipo_id: 'ventas_mes' } as never], false)
    expect(malo[0].procedencia).toBe('hueco')
    expect(malo[0].valor).toBeNull()
  })
  it('el pedido v3 trae las ventas en la tabla con su cita [D#]', async () => {
    const r = await armarDatoV1(baseEnMemoria({ tipos: conAltas() }) as never, { client_id: ID }, AHORA)
    if (!r.ok) throw new Error('lectura')
    const js = cargarJs()
    const p = js.pedidoV3Lineas({ plan_version: 'v3', datos: r.datos, catalogo_version: r.catalogo_version, catalogo_huella: r.catalogo_huella, criticos: r.criticos })
    const t = p.lineas.join('\n')
    expect(t).toContain('ventas_mes')
    expect(t).toMatch(/^D\d+ \| ventas_mes/m)
    expect(t).toContain('2649.75')
  })
})
