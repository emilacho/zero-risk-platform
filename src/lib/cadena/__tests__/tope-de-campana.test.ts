/**
 * TOPE DE GASTO POR CAMPAÑA (CC1 · 10-nov · GO Lenovo 19:30Z · condiciones de CC7 · decisión de Emilio 19:40Z) · US$ 0, sin red.
 * Dos clientes REALES de rubros distintos (`__fixtures__/gasto-de-campanas-reales.json`, foto GET de la base del 10-nov):
 *   · Náufrago (restaurante) · campaña 28de888e · tope US$ 40 firmado por Emilio · planeación + concepto + brief = US$ 26,28 (la cifra de la pregunta de CC1);
 *   · Seguridad Industrial (industria) · campaña 31dc6aaf · SIN tope en la base · piezas reales ya producidas (encargos de la oficina).
 * La lectura de la base se ejerce con el ADAPTADOR REAL (`almacenDeSupabase().leerGastoDeCampana`) sobre una base falsa que aplica los filtros y guarda las consultas
 * (lo que pidieron CC7 y CC6 en #1010: que la lectura real tenga su prueba). Lo CONSTRUIDO (no sale de la base) lleva la marca «construido».
 * Pedido de CC7 y CC6 sobre df8619a: la base falsa devuelve SOLO las columnas que pide cada `select` (como la de verdad). Si una lectura deja de pedir una columna
 * (por ejemplo el `payload` de la sala), el dato llega vacío y alguna prueba falla.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../__fixtures__/gasto-de-campanas-reales.json'

type Fila = Record<string, any>
const NAU = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
const SEG = '31dc6aaf-2e9c-426e-81c5-1645c500283e'
const F = fixture as any

// ── la base falsa: tablas sembradas con las filas reales + las consultas que recibe
let tablas: Record<string, Fila[]> = {}
const consultas: Array<{ tabla: string; filtros: Array<[string, string, unknown]> }> = []
let fallarTabla: string | null = null
/** 11-nov · falla SOLO la lectura de la historia (la tabla de encargos filtrada por `estado`): las demás lecturas contestan */
let fallarHistoria = false
const valor = (r: Fila, col: string): unknown => { const m = col.match(/^(\w+)->>(\w+)$/); if (!m) return r[col]; const v = r[m[1]]?.[m[2]]; return v === undefined || v === null ? null : String(v) }
/** `like` de la base: `%` = cualquier cosa; lo demás literal */
const comoLike = (patron: string): RegExp => new RegExp(`^${patron.split('%').map((x) => [...x].map((ch) => (/[\w:-]/.test(ch) ? ch : `\\${ch}`)).join('')).join('.*')}$`)
function consulta(tabla: string) {
  const filtros: Array<[string, string, unknown]> = []
  const reg = { tabla, filtros }
  consultas.push(reg)
  let tope = Infinity
  let columnas: string[] | null = null
  const q: any = {
    select: (c: string) => { columnas = c === '*' ? null : c.split(',').map((x) => x.trim()); return q },
    order: () => q,
    eq: (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q },
    in: (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q },
    like: (c: string, v: string) => { filtros.push(['like', c, v]); return q },
    limit: (n: number) => { tope = n; return q },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (fallarTabla === tabla || (fallarHistoria && tabla === ENC && filtros.some(([, c]) => c === 'estado'))) return Promise.resolve({ data: null, error: { message: `falló ${tabla}` } }).then(ok, ko)
      const filas = (tablas[tabla] ?? []).filter((r) => filtros.every(([op, c, v]) => op === 'eq' ? valor(r, c) === v : op === 'like' ? comoLike(String(v)).test(String(valor(r, c) ?? '')) : (v as unknown[]).includes(valor(r, c)))).slice(0, tope)
        .map((r) => (columnas ? Object.fromEntries(columnas.map((c) => [c, r[c]])) : r))
      return Promise.resolve({ data: filas, error: null }).then(ok, ko)
    },
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => ({ kind: 'accepted' }), SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: () => 'programado' }))

import { almacenDeSupabase } from '../almacen-supabase'
import { avisoDelTope, costoEsperadoDeLaPieza, decidirTope, esperandoPorVenir, filasPorVenir, medirGastoDeCampana, OPERACION_DE_PRODUCIR, topeDeLaPieza, type Candidata, type LecturaDeGasto } from '../tope-de-campana'
import { FUENTE_DEL_SOBRE, INTENCION_DEL_SOBRE } from '../autoproducir'
import { familiaDeFila } from '../familia'
import type { FormatosPorRed } from '../tipos'
import { ESTADOS_TERMINADOS, HISTORIA_POR_FAMILIA, MIN_HISTORIA, reservasDesdeLaHistoria, TABLAS_DE_GASTO } from '@/lib/oficina/gasto-de-encargos'

const ENC = TABLAS_DE_GASTO.encargos, PLANT = TABLAS_DE_GASTO.plantillas

/** las tablas tal como están en la base (foto del 10-nov) · `extra` agrega filas CONSTRUIDAS para los sabotajes */
function sembrar(extra: Record<string, Fila[]> = {}) {
  tablas = { cadena_corridas: [], cadena_conceptos: [], cadena_brief_creativo: [], client_historical_outputs: [], sala_event_log: [], [ENC]: [], [PLANT]: F.tipos_de_grupo.map((t: Fila) => ({ ...t })) }
  for (const [id, c] of Object.entries<any>(F.campanas)) {
    tablas.cadena_corridas.push(...c.corridas.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.cadena_conceptos.push(...c.conceptos.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.cadena_brief_creativo.push(...c.briefs.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.client_historical_outputs.push(...c.partes.map((p: Fila) => ({ ...p, output_type: 'campaign_brief_pack' })))
    tablas[ENC].push(...c.encargos.map((e: Fila) => ({ ...e })))
    tablas.sala_event_log.push(...(c.sala_producir ?? []).map((x: Fila) => ({ ...x })))
  }
  for (const [t, filas] of Object.entries(extra)) (tablas[t] ??= []).push(...filas)
}
const leer = (campana: string, parte: string) => almacenDeSupabase().leerGastoDeCampana(campana, parte)
const formatos: FormatosPorRed = (() => { const o: FormatosPorRed = {}; for (const f of F.formatos_por_red) (o[f.red] ??= []).push(f); return o })()
const filasDe = (c: string) => (F.campanas[c].filas as Fila[]).map((f) => ({ id: f.id, fecha: f.fecha, hora: f.hora, estado: f.estado, familia: familiaDeFila(f as any, formatos) }))
const enSemana = (c: string, desde: string, hasta: string) => filasDe(c).filter((f) => f.estado === 'validada' && f.fecha >= desde && f.fecha <= hasta)
const candidatasDe = (filas: ReturnType<typeof filasDe>): Candidata[] => filas.map((f, i) => ({ brief_id: `B${String(i + 1).padStart(2, '0')}`, familia: f.familia, fecha: f.fecha, hora: f.hora, ya_tiene_encargo: false }))
const HOY = '2026-11-10'

beforeEach(() => { sembrar(); consultas.length = 0; fallarTabla = null; fallarHistoria = false })

describe('lo gastado · la MISMA fuente que los US$ 26,28 (condición 1 de CC7) · adaptador real sobre las filas reales', () => {
  it('Náufrago (restaurante): planeación 3,41 + concepto 20,30 + brief 2,57 = 26,28 · los encargos de mesa ya están dentro de concepto y brief: no se cuentan dos veces', async () => {
    const l = await leer(NAU, 'parte-nuevo')
    expect(l.encargos).toHaveLength(8) // los 8 de mesa (parte_id = la campaña) llegan…
    const m = medirGastoDeCampana(l, 'parte-nuevo')
    expect(m.gastado).toBeCloseTo(26.28, 2) // …pero no suman: sin la deduplicación daría 48,85
    expect(m.comprometido).toBe(0)
  })
  it('Seguridad Industrial (industria): planeación 0,72 + piezas reales 9,54 = 10,26 · los encargos de ENSAYO (dry_run) no cuentan', async () => {
    const l = await leer(SEG, 'parte-nuevo')
    expect(l.encargos.length).toBe(12) // 18 en la base, 6 de ensayo fuera
    const m = medirGastoDeCampana(l, 'parte-nuevo')
    expect(m.gastado).toBeCloseTo(0.7209 + 9.539091, 4)
    expect(m.comprometido).toBe(0) // los 3 briefs de su parte ya tienen encargo
  })
  it('la consulta de encargos pide SOLO lo real y SOLO la campaña, sus partes reales y el parte actual', async () => {
    await leer(SEG, 'parte-actual')
    const q = consultas.find((c) => c.tabla === ENC && c.filtros.some(([, col]) => col === 'parte_id'))!
    expect(q.filtros).toContainEqual(['eq', 'dry_run', false])
    const ids = q.filtros.find(([op, c]) => op === 'in' && c === 'parte_id')![2] as string[]
    expect([...ids].sort()).toEqual([SEG, 'parte-actual', '2a93029a-d4e5-439e-87a8-4b67afdfec33'].sort())
    expect(consultas.find((c) => c.tabla === PLANT)!.filtros).toContainEqual(['eq', 'activo', true])
    for (const t of ['cadena_corridas', 'cadena_conceptos', 'cadena_brief_creativo']) expect(consultas.find((c) => c.tabla === t)!.filtros).toContainEqual(['eq', 'campana_id', SEG])
    expect(consultas.find((c) => c.tabla === 'client_historical_outputs')!.filtros).toEqual(expect.arrayContaining([['eq', 'output_type', 'campaign_brief_pack'], ['eq', 'provenance_tag->>campana_id', SEG]]))
  })
  it('pedido de CC7/CC6 sobre df8619a · cada columna leída cuenta (construido sobre Seguridad Industrial): una corrida caída sin costo suma el tope de su paso; un concepto y un brief sin encargo suman su costo', async () => {
    sembrar({
      cadena_corridas: [{ campana_id: SEG, costo_usd: 0, estado: 'fallida', paso: 'calendario' }],
      cadena_conceptos: [{ campana_id: SEG, costo_usd: 0.4, encargo_id: null }],
      cadena_brief_creativo: [{ campana_id: SEG, costo_usd: 0.3, encargo_id: null }],
    })
    const m = medirGastoDeCampana(await leer(SEG, 'parte-nuevo'), 'parte-nuevo')
    expect(m.gastado).toBeCloseTo(10.26 + 1 + 0.4 + 0.3, 2)
  })
  it('sabotaje · un parte de ENSAYO de la campaña (construido) no compromete dinero ni trae sus encargos', async () => {
    sembrar({ client_historical_outputs: [{ id: 'parte-seco', output_type: 'campaign_brief_pack', provenance_tag: { campana_id: NAU, seco: true, prueba_seco: true, familias_por_brief: [{ brief_id: 'S1', familia: 'carrusel_mesa' }] } }] })
    const l = await leer(NAU, 'parte-nuevo')
    expect(l.partes.map((p) => p.id)).toEqual([])
    expect(medirGastoDeCampana(l, 'parte-nuevo').comprometido).toBe(0)
  })
  it('sabotaje · otro parte REAL (construido): un brief sin encargo que la sala YA recibió compromete el tope de su familia; uno RETENIDO no compromete (guarda lugar por fecha); uno con encargo cuenta lo gastado', async () => {
    const tag = { campana_id: NAU, familias_por_brief: [{ brief_id: 'V1', familia: 'carrusel_mesa', fila_id: 'f-v1' }, { brief_id: 'V2', familia: 'kit_historias' }, { brief_id: 'V3', familia: 'post_img', fila_id: 'f-v3' }] }
    const sobre = (brief: string, dry_run = false) => ({ client_id: 'x', logical_period: 'parte:parte-viejo', operation_type: 'PIEZAS.intake.brief/parte-listo.producir', created_at: '2026-11-10T20:00:00Z', payload: { envelope_payload: { parte_id: 'parte-viejo', brief_id: brief, dry_run } } })
    sembrar({ client_historical_outputs: [{ id: 'parte-viejo', output_type: 'campaign_brief_pack', provenance_tag: tag }], [ENC]: [{ id: 'e-v2', parte_id: 'parte-viejo', brief_id: 'V2', estado: 'cerrado', tope_usd: 2.5, gasto_usd: 0.4, dry_run: false }],
      sala_event_log: [sobre('V1'), sobre('V3', true), { ...sobre('V3'), operation_type: 'PIEZAS.router.dispatch.brief/parte-listo.producir' }] })
    const m = medirGastoDeCampana(await leer(NAU, 'parte-nuevo'), 'parte-nuevo')
    // V1 · carrusel_mesa, ya en la sala: compromete lo ESPERADO de su familia (opción b), el promedio real de la foto (1,69 · 0,98 · 2,05), no su tope de 5
    expect(m.comprometido).toBeCloseTo((1.690998 + 0.984574 + 2.051572) / 3, 4)
    expect(m.gastado).toBeCloseTo(26.28 + 0.4, 2) // V2 ya gastó lo suyo
    // V3: su único sobre real es de OTRA operación y el de entrada es de ensayo → no está en camino: espera, guarda lugar por fecha
    expect(m.esperando).toEqual([{ parte_id: 'parte-viejo', brief_id: 'V3', familia: 'post_img', fila_id: 'f-v3' }])
  })
  it('la sala de Seguridad Industrial (real): sus 3 briefs llegaron a la sala; la consulta pide SOLO la entrada de producir de SUS partes', async () => {
    const l = await leer(SEG, 'x')
    expect(new Set(l.soltados.map((x) => x.brief_id))).toEqual(new Set(['BRF-0001', 'BRF-0002', 'BRF-0004']))
    const q = consultas.find((c) => c.tabla === 'sala_event_log')!
    expect(q.filtros).toEqual([['eq', 'operation_type', OPERACION_DE_PRODUCIR], ['in', 'logical_period', ['parte:2a93029a-d4e5-439e-87a8-4b67afdfec33']]])
    expect(OPERACION_DE_PRODUCIR).toBe(`PIEZAS.intake.${FUENTE_DEL_SOBRE}.${INTENCION_DEL_SOBRE}`)
    expect(F.campanas[SEG].sala_producir.every((x: Fila) => x.operation_type === OPERACION_DE_PRODUCIR)).toBe(true)
  })
  it('sabotaje · un encargo ABIERTO (construido) cuenta lo mayor entre lo gastado y su tope · uno cerrado por tope, lo gastado real', async () => {
    sembrar({ client_historical_outputs: [{ id: 'p2', output_type: 'campaign_brief_pack', provenance_tag: { campana_id: SEG, familias_por_brief: [{ brief_id: 'A', familia: 'post_img' }, { brief_id: 'B', familia: 'post_img' }] } }],
      [ENC]: [{ id: 'ea', parte_id: 'p2', brief_id: 'A', estado: 'en_paso', tope_usd: 2.5, gasto_usd: 0.3, dry_run: false }, { id: 'eb', parte_id: 'p2', brief_id: 'B', estado: 'cerrado_por_tope', tope_usd: 1, gasto_usd: 1.4, dry_run: false }] })
    expect(medirGastoDeCampana(await leer(SEG, 'x'), 'x').gastado).toBeCloseTo(10.259991 + 2.5 + 1.4, 4)
  })
  it('sabotaje · el parte ACTUAL (ya guardado, sus briefs sin encargo) no se compromete a sí mismo: sus piezas son lo que se va a soltar (construido)', async () => {
    sembrar({ client_historical_outputs: [{ id: 'p-actual', output_type: 'campaign_brief_pack', provenance_tag: { campana_id: NAU, familias_por_brief: [{ brief_id: 'A1', familia: 'carrusel_mesa' }] } }] })
    const l = await leer(NAU, 'p-actual')
    expect(l.partes.map((p) => p.id)).toEqual(['p-actual'])
    expect(medirGastoDeCampana(l, 'p-actual').comprometido).toBe(0)
    expect(medirGastoDeCampana(l, 'otro')).toMatchObject({ comprometido: 0, esperando: [{ parte_id: 'p-actual', brief_id: 'A1' }] }) // visto desde otro parte: no llegó a la sala → espera
  })
  it('sabotaje · una corrida caída sin costo cuenta su tope (la cota pesimista de siempre)', () => {
    const l: LecturaDeGasto = { corridas: [{ costo_usd: 0, estado: 'fallida', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes: [], soltados: [], topes_de_familia: { post_img: 2.5 }, revisiones: [] }
    expect(medirGastoDeCampana(l, 'x').gastado).toBeGreaterThan(0)
  })
  it('sin familia (o una desconocida) cuenta el MAYOR tope de las familias ACTIVAS: 5, no el 10 de video_mesa que está apagada', async () => {
    const l = await leer(NAU, 'x')
    expect(topeDeLaPieza(l.topes_de_familia, null)).toBe(5)
    expect(topeDeLaPieza(l.topes_de_familia, 'no_existe')).toBe(5)
    expect(topeDeLaPieza(l.topes_de_familia, 'kit_historias')).toBe(2.5)
    expect(() => topeDeLaPieza({}, 'post_img')).toThrow()
  })
})

describe('el gasto ilegible DETIENE (condición 2 de CC7): cualquier lectura que falla lanza, no es «cero gastado»', () => {
  for (const t of ['cadena_corridas', 'cadena_conceptos', 'cadena_brief_creativo', 'client_historical_outputs', ENC, PLANT, 'sala_event_log']) {
    it(`falla ${t} → lanza`, async () => { fallarTabla = t; await expect(leer(SEG, 'x')).rejects.toThrow() })
  }
})

describe('lo gastado + lo que se va a soltar (condición 3 de CC7) · lo más cercano primero (decisión de Emilio 19:40Z) · con el calendario real de Náufrago', () => {
  // W46 desde hoy, como el reloj (las filas ya pasadas no salen)
  const W46 = enSemana(NAU, HOY, '2026-11-15'), W47 = enSemana(NAU, '2026-11-16', '2026-11-22')
  const medido = { gastado: 26.28, comprometido: 0 }
  it('el calendario real: W46 tiene 12 filas desde hoy y W47 14 (los 12 del sobre de W46 que midió CC6; si esto cambia, la foto ya no es la del 10-nov)', () => { expect(W46.length).toBe(12); expect(W47.length).toBe(14) })
  it('W46 sola, tope 40: salen las más cercanas que caben en los 13,72 que quedan, en orden de fecha y hora, y se corta en la primera que no cabe', () => {
    const cand = candidatasDe(W46)
    const porVenir = filasPorVenir(filasDe(NAU), HOY, [], W46.map((f) => f.id))
    const d = decidirTope(40, medido, cand, F.tipos_de_grupo.reduce((o: any, t: any) => (t.activo ? { ...o, [t.familia]: t.tope_encargo_usd } : o), {}), porVenir)
    expect(d.tipo).toBe('corta')
    if (d.tipo !== 'corta') return
    expect(d.sueltan.length).toBeGreaterThan(0)
    expect(26.28 + d.estimado).toBeLessThanOrEqual(40)
    // las que salen son las PRIMERAS del calendario; ninguna retenida va antes que una que sale
    const orden = [...cand].sort((a, b) => `${a.fecha} ${a.hora ?? '99:99'}`.localeCompare(`${b.fecha} ${b.hora ?? '99:99'}`)).map((c) => c.brief_id)
    expect(orden.slice(0, d.sueltan.length)).toEqual(d.sueltan)
    expect(d.retenidas).toEqual(orden.slice(d.sueltan.length))
  })
  it('sabotaje · el parte de W47 llega ANTES que el de W46: no se lleva el dinero de W46 (las filas de W46 aún sin parte tienen su lugar guardado) → sale 0', () => {
    const topes = { post_img: 2.5, carrusel_ig_v1: 2.5, carrusel_mesa: 5, kit_historias: 2.5, brief_mesa: 1.6, concepto_mesa: 5 }
    const porVenir = filasPorVenir(filasDe(NAU), HOY, [], W47.map((f) => f.id))
    const d = decidirTope(40, medido, candidatasDe(W47), topes, porVenir)
    expect(d.tipo).toBe('corta'); if (d.tipo === 'corta') expect(d.sueltan).toEqual([])
    // control: sin las filas por venir (la regla vieja) W47 SÍ se llevaría dinero
    const sinReserva = decidirTope(40, medido, candidatasDe(W47), topes, [])
    expect(sinReserva.tipo === 'corta' ? sinReserva.sueltan.length : 99).toBeGreaterThan(0)
  })
  it('las filas por venir: solo desde hoy, solo `validada`/`lista_para_brief`, y fuera las que ya están en un parte real o en este (construido sobre el calendario real)', () => {
    const filas = filasDe(NAU)
    const pasada = filas.find((f) => f.estado === 'validada' && f.fecha < HOY)!
    expect(pasada).toBeDefined() // el calendario real tiene filas validadas del 9-nov que ya pasaron
    const [a, b, c] = W47
    const pv = filasPorVenir(filas, HOY, [{ id: 'p-real', briefs: [{ brief_id: 'X', familia: null, fila_id: a.id }] }], [b.id])
    const ids = new Set(pv.map((f) => f.fila_id))
    expect(ids.has(pasada.id)).toBe(false)
    expect(ids.has(a.id)).toBe(false) // en un parte real
    expect(ids.has(b.id)).toBe(false) // en este parte
    expect(ids.has(c.id)).toBe(true)
    expect(pv.every((f) => f.fecha >= HOY)).toBe(true)
    expect(filas.some((f) => f.estado === 'esquema' && f.fecha >= HOY && ids.has(f.id))).toBe(false)
  })
  it('W46 real con tope 40: salen exactamente las 3 primeras del 12-nov (foto 2,50 + historia 2,50 + anuncio sin familia 5,00 = 10,00); la 4.ª (5,00) ya no cabe en 13,72', () => {
    const topes = { post_img: 2.5, carrusel_ig_v1: 2.5, carrusel_mesa: 5, kit_historias: 2.5, brief_mesa: 1.6, concepto_mesa: 5 }
    const d = decidirTope(40, medido, candidatasDe(W46), topes, filasPorVenir(filasDe(NAU), HOY, [], W46.map((f) => f.id)))
    expect(d).toMatchObject({ tipo: 'corta', estimado: 10 })
    if (d.tipo === 'corta') { expect(d.sueltan).toHaveLength(3); expect(d.retenidas).toHaveLength(9) }
  })
  it('sabotaje · cortar, no saltar: tras la primera que no cabe, una más barata del final tampoco sale (construido)', () => {
    const cand: Candidata[] = [
      { brief_id: 'cara-1', familia: 'carrusel_mesa', fecha: '2026-11-12', hora: '09:00', ya_tiene_encargo: false },
      { brief_id: 'cara-2', familia: 'carrusel_mesa', fecha: '2026-11-12', hora: '12:00', ya_tiene_encargo: false },
      { brief_id: 'barata', familia: 'kit_historias', fecha: '2026-11-15', hora: null, ya_tiene_encargo: false },
    ]
    const d = decidirTope(36, medido, cand, { carrusel_mesa: 5, kit_historias: 2.5 })
    expect(d).toMatchObject({ tipo: 'corta', sueltan: ['cara-1'], retenidas: ['cara-2', 'barata'] })
  })
  it('sabotaje · una pieza que YA tiene encargo no vuelve a sumar (su gasto ya está en lo gastado) y no se retiene', () => {
    const cand: Candidata[] = [{ brief_id: 'hecha', familia: 'carrusel_mesa', fecha: '2026-11-12', hora: null, ya_tiene_encargo: true }, { brief_id: 'nueva', familia: 'kit_historias', fecha: '2026-11-13', hora: null, ya_tiene_encargo: false }]
    expect(decidirTope(26.28 + 2.5, medido, cand, { carrusel_mesa: 5, kit_historias: 2.5 })).toMatchObject({ tipo: 'cabe', sueltan: ['hecha', 'nueva'], estimado: 2.5 })
  })
  it('el borde: lo que cabe EXACTO sale; un centavo más, no', () => {
    const cand: Candidata[] = [{ brief_id: 'a', familia: 'kit_historias', fecha: '2026-11-12', hora: null, ya_tiene_encargo: false }]
    expect(decidirTope(28.78, medido, cand, { kit_historias: 2.5 }).tipo).toBe('cabe')
    expect(decidirTope(28.77, medido, cand, { kit_historias: 2.5 }).tipo).toBe('corta')
  })
})

describe('los DOS órdenes (CC7 🟡 · CC6 🔴): la semana 46 recibe primero lo que cabe, llegue antes o después que la 47 · calendario real de Náufrago', () => {
  const TOPES = { post_img: 2.5, carrusel_ig_v1: 2.5, carrusel_mesa: 5, kit_historias: 2.5, brief_mesa: 1.6, concepto_mesa: 5 }
  const filas = filasDe(NAU)
  const cuando = new Map(filas.map((f) => [f.id, { fecha: f.fecha, hora: f.hora }]))
  const W46 = enSemana(NAU, HOY, '2026-11-15'), W47 = enSemana(NAU, '2026-11-16', '2026-11-22')
  const parteDe = (id: string, fs: typeof W46) => ({ id, briefs: fs.map((f, i) => ({ brief_id: `${id}-B${i + 1}`, familia: f.familia, fila_id: f.id })) })
  const P46 = parteDe('p46', W46), P47 = parteDe('p47', W47)
  /** la cadena, construida en memoria: los partes guardados y lo que la sala ya recibió; `pasar` hace lo que hace autoproducir con el freno */
  function escena(viejo = false) {
    const partes: Array<typeof P46> = [], soltados: Array<{ parte_id: string; brief_id: string }> = []
    const decidir = (p: typeof P46) => {
      const l: LecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes, soltados, topes_de_familia: TOPES, revisiones: [] }
      const m = medirGastoDeCampana(l, p.id)
      // `viejo` = la regla de e05a646: todo brief de otro parte sin encargo comprometía, sin importar su fecha (el sabotaje)
      const medido = viejo ? { ...m, comprometido: m.comprometido + m.esperando.reduce((x, b) => x + topeDeLaPieza(TOPES, b.familia), 0), esperando: [] } : m
      const porVenir = [...filasPorVenir(filas, HOY, partes, p.briefs.map((b) => b.fila_id)), ...esperandoPorVenir(medido.esperando, cuando)]
      const cand: Candidata[] = p.briefs.map((b) => ({ brief_id: b.brief_id, familia: b.familia, fecha: cuando.get(b.fila_id)!.fecha, hora: cuando.get(b.fila_id)!.hora, ya_tiene_encargo: false }))
      return decidirTope(40, medido, cand, TOPES, porVenir)
    }
    const pasar = (p: typeof P46) => {
      if (!partes.includes(p)) partes.push(p)
      const d = decidir(p)
      const sueltan = d.tipo === 'sin_tope' ? [] : d.sueltan
      for (const b of sueltan) if (!soltados.some((x) => x.parte_id === p.id && x.brief_id === b)) soltados.push({ parte_id: p.id, brief_id: b })
      return sueltan
    }
    return { pasar, decidir, partes, soltados }
  }
  /** las 3 primeras de la 46 en el orden del calendario (fecha y hora) */
  const TRES = [...P46.briefs].sort((a, b) => `${cuando.get(a.fila_id)!.fecha} ${cuando.get(a.fila_id)!.hora ?? '99:99'}`.localeCompare(`${cuando.get(b.fila_id)!.fecha} ${cuando.get(b.fila_id)!.hora ?? '99:99'}`)).slice(0, 3).map((b) => b.brief_id)
  const costo = (ids: string[], p: typeof P46) => ids.reduce((x, id) => x + topeDeLaPieza(TOPES, p.briefs.find((b) => b.brief_id === id)!.familia), 0)
  it('un retenido de otro parte cuya fila no aparece en el calendario va AL FINAL: no le guarda lugar a una pieza con fecha (construido)', () => {
    const pv = esperandoPorVenir([{ parte_id: 'p-x', brief_id: 'X', familia: 'carrusel_mesa', fila_id: 'no-existe' }, { parte_id: 'p-x', brief_id: 'Y', familia: 'carrusel_mesa', fila_id: null }], cuando)
    expect(pv.map((f) => f.fecha)).toEqual(['9999-99-99', '9999-99-99'])
    const cand: Candidata[] = [{ brief_id: 'A', familia: 'kit_historias', fecha: '2026-11-12', hora: '09:00', ya_tiene_encargo: false }]
    expect(decidirTope(26.28 + 2.5, { gastado: 26.28, comprometido: 0 }, cand, TOPES, pv).tipo).toBe('cabe')
  })
  it('46 → 47: salen las 3 más cercanas de la 46 (US$ 10) y la 47 no se lleva nada', () => {
    expect(costo(TRES, P46)).toBe(10)
    const e = escena()
    expect(e.pasar(P46)).toEqual(TRES)
    expect(e.pasar(P47)).toEqual([])
  })
  it('47 → 46: la 47 llega primero y queda retenida; la 46 después recibe LO MISMO que en el otro orden', () => {
    const e = escena()
    const de47 = e.pasar(P47)
    expect(de47).toEqual([]) // las filas de la 46 (aún sin parte) tienen su lugar guardado
    expect(e.pasar(P46)).toEqual(TRES)
    expect(26.28 + costo(e.soltados.filter((x) => x.parte_id === 'p46').map((x) => x.brief_id), P46) + costo(de47, P47)).toBeLessThanOrEqual(40)
  })
  it('sabotaje · con la regla de e05a646 (lo retenido de la 47 compromete) la 46 se queda sin nada si la 47 llega primero', () => {
    const e = escena(true)
    e.pasar(P47)
    expect(e.pasar(P46)).toEqual([])
  })
  it('46 primero y lo retenido de la 46 SÍ frena a la 47 (va antes en el calendario)', () => {
    const e = escena()
    e.pasar(P46)
    const d = e.decidir(P47)
    expect(d.tipo === 'corta' ? d.sueltan : ['no cortó']).toEqual([])
  })
  it('dos partes que deciden A LA VEZ (ninguno ve lo que soltó el otro) no pasan juntos del tope', () => {
    const e = escena()
    e.partes.push(P46, P47)
    const a = e.decidir(P46), b = e.decidir(P47)
    const s46 = a.tipo === 'sin_tope' ? [] : a.sueltan, s47 = b.tipo === 'sin_tope' ? [] : b.sueltan
    expect(26.28 + costo(s46, P46) + costo(s47, P47)).toBeLessThanOrEqual(40)
    expect(s46).toEqual(TRES)
  })
  describe('pedido de CC7 sobre aa7ff83 · los ids de brief se REPITEN entre partes (el paquete real numera BRF-0001… desde 1 en cada parte)', () => {
    const conIdsReales = (id: string, fs: typeof W46) => ({ id, briefs: fs.map((f, i) => ({ brief_id: `BRF-${String(i + 1).padStart(4, '0')}`, familia: f.familia, fila_id: f.id })) })
    const R46 = conIdsReales('p46', W46), R47 = conIdsReales('p47', W47)
    const TRES_R = TRES.map((b) => R46.briefs[P46.briefs.findIndex((x) => x.brief_id === b)].brief_id)
    it('los dos partes tienen BRF-0001, BRF-0002… (el choque que pasa con datos reales)', () => {
      expect(R46.briefs[0].brief_id).toBe('BRF-0001'); expect(R47.briefs[0].brief_id).toBe('BRF-0001')
    })
    it('46 → 47 y 47 → 46 con ids repetidos: la 46 recibe lo mismo (sus 3 más cercanas) y la 47 nada', () => {
      for (const orden of [[R46, R47], [R47, R46]]) {
        const e = escena()
        const sale: Record<string, string[]> = {}
        for (const p of orden) sale[p.id] = e.pasar(p)
        expect(sale.p46).toEqual(TRES_R)
        expect(sale.p47).toEqual([])
      }
    })
    it('sabotaje · «ya en la sala» por el brief SIN el parte: el BRF-0001 retenido de la 47 contaría como soltado porque el de la 46 sí salió · la 46, al volver a decidir, NO pierde dinero', () => {
      const e = escena()
      e.pasar(R46); e.pasar(R47)
      const l: LecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes: e.partes, soltados: e.soltados, topes_de_familia: TOPES, revisiones: [] }
      const m = medirGastoDeCampana(l, 'p46')
      expect(m.comprometido).toBe(0) // lo de la 47 está retenido: no compromete
      expect(m.esperando.filter((b) => b.parte_id === 'p47').map((b) => b.brief_id)).toEqual(R47.briefs.map((b) => b.brief_id))
      const d = e.decidir(R46)
      expect(d.tipo === 'sin_tope' ? [] : d.sueltan).toEqual(TRES_R)
    })
  })

  it('pedido de CC7 sobre aa7ff83 · lo que espera de otro parte guarda lugar con el tope de SU familia (una barata: 2,50), no con el más caro (5,00)', () => {
    // construido sobre el calendario real: la 1.ª fila de la 46 la espera OTRO parte (retenida) con familia kit_historias; la pieza que se quiere soltar va después
    const [antes, despues] = [...W46].sort((a, b) => `${a.fecha} ${a.hora ?? '99:99'}`.localeCompare(`${b.fecha} ${b.hora ?? '99:99'}`))
    expect(antes.fecha <= despues.fecha).toBe(true)
    const otro = { id: 'p-otro', briefs: [{ brief_id: 'BRF-0001', familia: 'kit_historias', fila_id: antes.id }] }
    const l: LecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes: [otro, { id: 'p-hoy', briefs: [] }], soltados: [], topes_de_familia: TOPES, revisiones: [] }
    const m = medirGastoDeCampana(l, 'p-hoy')
    expect(m.esperando).toEqual([{ parte_id: 'p-otro', brief_id: 'BRF-0001', familia: 'kit_historias', fila_id: antes.id }])
    const pv = esperandoPorVenir(m.esperando, cuando)
    expect(pv.map((f) => f.familia)).toEqual(['kit_historias'])
    const cand: Candidata[] = [{ brief_id: 'BRF-0001', familia: 'kit_historias', fecha: despues.fecha, hora: despues.hora, ya_tiene_encargo: false }]
    // queda 2,50 + 2,50: cabe si lo que espera reserva 2,50 (su familia); con el tope más caro (5,00) ya no cabría
    const d = decidirTope(26.28 + 2.5 + 2.5, m, cand, TOPES, pv)
    expect(d.tipo).toBe('cabe')
    expect(decidirTope(26.28 + 2.5 + 2.49, m, cand, TOPES, pv).tipo).toBe('corta') // el borde: un centavo menos y no cabe
  })

  it('con un tope CONSTRUIDO de US$ 60: 47 → 46 da el mismo reparto que 46 → 47 (la 46 entera antes que la 47)', () => {
    const corrida = (orden: Array<typeof P46>) => {
      const partes: Array<typeof P46> = [], soltados: Array<{ parte_id: string; brief_id: string }> = []
      for (const p of orden) {
        if (!partes.includes(p)) partes.push(p)
        const l: LecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes, soltados, topes_de_familia: TOPES, revisiones: [] }
        const m = medirGastoDeCampana(l, p.id)
        const cand: Candidata[] = p.briefs.map((b) => ({ brief_id: b.brief_id, familia: b.familia, fecha: cuando.get(b.fila_id)!.fecha, hora: cuando.get(b.fila_id)!.hora, ya_tiene_encargo: false }))
        const d = decidirTope(60, m, cand, TOPES, [...filasPorVenir(filas, HOY, partes, p.briefs.map((b) => b.fila_id)), ...esperandoPorVenir(m.esperando, cuando)])
        for (const x of d.tipo === 'sin_tope' ? [] : d.sueltan) soltados.push({ parte_id: p.id, brief_id: x })
      }
      return soltados.filter((x) => x.parte_id === 'p46').map((x) => x.brief_id).sort()
    }
    expect(corrida([P47, P46])).toEqual(corrida([P46, P47]))
    expect(corrida([P46, P47]).length).toBeGreaterThan(3)
  })
})

describe('Seguridad Industrial (industria) · campaña SIN tope en la base', () => {
  it('sin tope no sale ninguna pieza real; y el tope «0», negativo o texto basura también es «sin tope»', () => {
    const cand = candidatasDe(enSemana(SEG, '2026-11-10', '2026-11-16'))
    expect(cand.length).toBeGreaterThan(0)
    for (const t of [null, undefined, 0, -5, 'cuarenta', Number.NaN]) expect(decidirTope(t, { gastado: 10.26, comprometido: 0 }, cand, { post_img: 2.5 }).tipo).toBe('sin_tope')
    expect(decidirTope('40', { gastado: 10.26, comprometido: 0 }, cand, { post_img: 2.5, carrusel_ig_v1: 2.5, kit_historias: 2.5, carrusel_mesa: 5 }).tipo).not.toBe('sin_tope') // un número guardado como texto vale
  })
  it('con un tope CONSTRUIDO de US$ 12 (no existe en la base): de lo que queda (1,74) no cabe ni una pieza de 2,50 → 0 salen', () => {
    const cand = candidatasDe(enSemana(SEG, '2026-11-10', '2026-11-16'))
    const d = decidirTope(12, { gastado: 10.26, comprometido: 0 }, cand, { post_img: 2.5, carrusel_ig_v1: 2.5, kit_historias: 2.5, carrusel_mesa: 5 })
    expect(d).toMatchObject({ tipo: 'corta', sueltan: [] })
  })
})

// ── 11-nov · condición 1 de CC7 para encender el registro: el gasto de las revisiones de registro de la campaña entra en el freno
describe('las revisiones de REGISTRO de la campaña cuentan en el freno (adaptador real)', () => {
  const BASE_SEG = 0.7209 + 9.539091
  const rev = (artifact_id: string, o: Fila = {}) => ({ id: `r-${artifact_id}`, artifact_type: 'registro', artifact_id, estado: 'cerrada', gasto_usd: 0, tope_usd: 1.5, dry_run: false, ...o })
  it('una cerrada cuenta su gasto; una abierta, lo mayor entre gasto y tope · no cuentan las de ensayo, las de otra campaña ni las que no son de registro', async () => {
    sembrar({ jefatura_revisiones: [
      rev(`registro:brief:${SEG}:v1`, { gasto_usd: 0.9 }),
      rev(`registro:calendario:${SEG}:t2`, { estado: 'abierta', gasto_usd: 0.2, tope_usd: 1.5 }),
      rev(`registro:concepto:${SEG}:v1`, { estado: 'en_paso', gasto_usd: 0.4, tope_usd: 1.5 }),
      rev(`registro:brief:otra:${SEG}:v1`, { gasto_usd: 13 }),
      rev(`registro:brief:${SEG}:v2`, { gasto_usd: 5, dry_run: true }),
      rev(`registro:brief:${NAU}:v1`, { gasto_usd: 7 }),
      rev(`registro:brief:${SEG}-otra:v1`, { gasto_usd: 11 }),
      { ...rev(`registro:brief:${SEG}:v3`, { gasto_usd: 3 }), artifact_type: 'pieza' },
    ] })
    const l = await leer(SEG, 'parte-nuevo')
    expect(l.revisiones).toHaveLength(3)
    expect(medirGastoDeCampana(l, 'parte-nuevo').gastado).toBeCloseTo(BASE_SEG + 0.9 + 1.5 + 1.5, 4)
    const q = consultas.find((c) => c.tabla === 'jefatura_revisiones')!
    expect(q.filtros).toEqual(expect.arrayContaining([['eq', 'artifact_type', 'registro'], ['like', 'artifact_id', `registro:%:${SEG}:%`]]))
  })
  it('🔴 una revisión de registro que hace pasar del tope corta la pieza que sin ella cabía', async () => {
    const cand: Candidata[] = [{ brief_id: 'B1', familia: 'post_img', fecha: '2026-11-12', hora: '10:00', ya_tiene_encargo: false }]
    const topes = { post_img: 1.5 }
    const sin = medirGastoDeCampana(await leer(SEG, 'p'), 'p')
    expect(decidirTope(12, sin, cand, topes).tipo).toBe('cabe')
    sembrar({ jefatura_revisiones: [rev(`registro:calendario:${SEG}:t1`, { gasto_usd: 0.6 })] })
    const con = medirGastoDeCampana(await leer(SEG, 'p'), 'p')
    expect(decidirTope(12, con, cand, topes)).toMatchObject({ tipo: 'corta', retenidas: ['B1'] })
  })
  it('🔴 si no se pueden leer las revisiones, la lectura del gasto falla (nunca «cero gastado»)', async () => {
    fallarTabla = 'jefatura_revisiones'
    await expect(leer(SEG, 'p')).rejects.toThrow()
  })
  it('🔴 un id de campaña raro no arma una consulta comodín: falla', async () => {
    await expect(leer('%', 'p')).rejects.toThrow(/no es legible/)
    expect(consultas.some((c) => c.tabla === 'jefatura_revisiones')).toBe(false)
  })
})

// ───────────────────────── 11-nov · OPCIÓN (b) de Lenovo 19:07 · el freno reserva lo ESPERADO por pieza, no el tope máximo (el tope sigue siendo el techo del encargo)
describe('opción (b) · lo esperado por pieza sale de la historia real de cada familia (cualquier cliente) · adaptador real sobre la foto de dos rubros', () => {
  it('🔴 con la foto real: carrusel_mesa = promedio de sus 3 encargos REALES terminados (Seguridad Industrial); brief_mesa = sus 4 (Náufrago); concepto_mesa no pasa su tope; con menos de 3, sin reserva', async () => {
    const l = await leer(NAU, 'parte-nuevo')
    expect(l.reservas_de_familia!.carrusel_mesa).toBeCloseTo((1.690998 + 0.984574 + 2.051572) / 3, 4) // fuera: los de ensayo (dry_run) y los fallidos
    expect(l.reservas_de_familia!.brief_mesa).toBeCloseTo((0.532374 + 0.514141 + 0.795175 + 0.730452) / 4, 4)
    expect(l.reservas_de_familia!.concepto_mesa).toBe(5) // promedio 5,34 (sin el cerrado por tope) > tope 5 → el tope
    expect(l.reservas_de_familia!.carrusel_ig_v1).toBeUndefined() // 2 terminados < MIN_HISTORIA
    expect(l.reservas_de_familia!.kit_historias).toBeUndefined() // solo fallidos
    expect(l.reservas_de_familia!.video_mesa).toBeUndefined() // plantilla apagada en la foto
    expect(MIN_HISTORIA).toBe(3)
  })
  it('🔴 la consulta de la historia pide SOLO lo real, SOLO lo terminado (cerrado · aprobada) y de cualquier cliente (sin filtro de campaña ni de cliente)', async () => {
    await leer(SEG, 'x')
    const h = consultas.find((c) => c.tabla === ENC && c.filtros.some(([, col]) => col === 'estado'))!
    expect(h.filtros).toContainEqual(['eq', 'dry_run', false])
    expect(h.filtros).toContainEqual(['in', 'estado', ['cerrado', 'aprobada']])
    expect(h.filtros.some(([, col]) => col === 'parte_id' || col === 'client_id' || col === 'campana_id')).toBe(false)
    expect([...ESTADOS_TERMINADOS]).toEqual(['cerrado', 'aprobada'])
  })
  it('🔴 si la historia no se puede leer, es gasto ilegible: LANZA (no es «sin reserva»)', async () => {
    await expect(leer(NAU, 'p')).resolves.toBeTruthy() // control: sin falla, se lee
    fallarHistoria = true
    await expect(leer(NAU, 'p')).rejects.toThrow(/oficina no contestó/)
  })
})

describe('opción (b) · la cuenta pura de lo esperado', () => {
  const P = (familia: string, tope: number, limites: unknown = {}) => ({ familia, tope_encargo_usd: tope, limites })
  it('🔴 sin historia suficiente usa el dato `reserva_por_pieza_usd` de la plantilla; sin dato, la familia no aparece (cuenta su tope)', () => {
    expect(reservasDesdeLaHistoria([P('video_mesa', 35, { reserva_por_pieza_usd: 12 })], [{ familia: 'video_mesa', gasto_usd: 5.7 }, { familia: 'video_mesa', gasto_usd: 5.1 }])).toEqual({ video_mesa: 12 })
    expect(reservasDesdeLaHistoria([P('video_mesa', 35)], [{ familia: 'video_mesa', gasto_usd: 5.7 }])).toEqual({})
    expect(reservasDesdeLaHistoria([P('video_mesa', 35, { reserva_por_pieza_usd: 'x' })], [])).toEqual({})
  })
  it('🔴 con historia, el promedio de los ÚLTIMOS `HISTORIA_POR_FAMILIA` con gasto (el orden llega del más reciente); los de gasto 0 y los de otra familia no cuentan; el dato no pisa la historia', () => {
    const recientes = Array.from({ length: HISTORIA_POR_FAMILIA }, () => ({ familia: 'post_img', gasto_usd: 1 }))
    const viejos = Array.from({ length: 10 }, () => ({ familia: 'post_img', gasto_usd: 2.4 }))
    expect(reservasDesdeLaHistoria([P('post_img', 2.5, { reserva_por_pieza_usd: 2 })], [{ familia: 'post_img', gasto_usd: 0 }, { familia: 'otra', gasto_usd: 9 }, ...recientes, ...viejos])).toEqual({ post_img: 1 })
    expect(reservasDesdeLaHistoria([P('post_img', 2.5)], [{ familia: 'post_img', gasto_usd: 1 }, { familia: 'post_img', gasto_usd: 2 }, { familia: 'post_img', gasto_usd: '1.5' }])).toEqual({ post_img: 1.5 })
  })
  it('🔴 nunca pasa del tope de la familia (ni por historia ni por dato); una plantilla sin tope válido no da reserva', () => {
    expect(reservasDesdeLaHistoria([P('a', 2.5, { reserva_por_pieza_usd: 9 })], [])).toEqual({ a: 2.5 })
    expect(reservasDesdeLaHistoria([P('a', 2.5)], [3, 4, 5].map((g) => ({ familia: 'a', gasto_usd: g })))).toEqual({ a: 2.5 })
    expect(reservasDesdeLaHistoria([P('a', 0, { reserva_por_pieza_usd: 1 }), { familia: null, tope_encargo_usd: 3, limites: {} }], [])).toEqual({})
  })
  it('🔴 lo que se le reserva a una pieza: su esperado si hay (sin pasar del tope); sin reserva, su tope; sin familia, el mayor tope (del lado seguro)', () => {
    const topes = { video_mesa: 35, post_img: 2.5 }
    expect(costoEsperadoDeLaPieza(topes, { video_mesa: 12 }, 'video_mesa')).toBe(12)
    expect(costoEsperadoDeLaPieza(topes, { video_mesa: 50 }, 'video_mesa')).toBe(35)
    expect(costoEsperadoDeLaPieza(topes, { video_mesa: 12 }, 'post_img')).toBe(2.5)
    expect(costoEsperadoDeLaPieza(topes, undefined, 'video_mesa')).toBe(35)
    expect(costoEsperadoDeLaPieza(topes, { video_mesa: 12 }, null)).toBe(35)
    expect(costoEsperadoDeLaPieza(topes, { video_mesa: 0 }, 'video_mesa')).toBe(35)
  })
})

describe('opción (b) · el caso de CC7: video a US$ 35 por encargo y la campaña en US$ 100 (construido sobre el calendario de Náufrago: 3 reels seguidos)', () => {
  const topes = { video_mesa: 35, post_img: 2.5 }
  const reel = (brief_id: string, fecha: string): Candidata => ({ brief_id, familia: 'video_mesa', fecha, hora: '09:00', ya_tiene_encargo: false })
  const antes = [{ fila_id: 'r14', fecha: '2026-11-14', hora: '09:00', familia: 'video_mesa' }, { fila_id: 'r16', fecha: '2026-11-16', hora: '09:00', familia: 'video_mesa' }]
  it('🔴 con el TOPE (como antes) el reel del 21-nov no sale: 3 × 35 = 105 > 100 · con lo ESPERADO (12) sale', () => {
    expect(decidirTope(100, { gastado: 0, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, antes)).toMatchObject({ tipo: 'corta', retenidas: ['R21'] })
    expect(decidirTope(100, { gastado: 0, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, antes, { video_mesa: 12 })).toMatchObject({ tipo: 'cabe', sueltan: ['R21'], estimado: 12 })
  })
  it('🔴 el borde con lo esperado: cabe EXACTO; un centavo más, no (y sigue cortando, sin saltar piezas)', () => {
    const r = { video_mesa: 12 }
    expect(decidirTope(100, { gastado: 64, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, antes, r).tipo).toBe('cabe') // 64 + 24 + 12 = 100
    expect(decidirTope(100, { gastado: 64.01, comprometido: 0 }, [reel('R21', '2026-11-21'), { brief_id: 'P', familia: 'post_img', fecha: '2026-11-22', hora: '09:00', ya_tiene_encargo: false }], topes, antes, r)).toMatchObject({ tipo: 'corta', retenidas: ['R21', 'P'] })
  })
  it('🔴 un encargo de video ABIERTO cuenta lo mayor entre lo gastado y lo esperado, sin pasar de SU tope · sin familia (filas viejas), su tope como antes', () => {
    const base: LecturaDeGasto = { corridas: [], conceptos: [], briefs: [], partes: [], soltados: [], revisiones: [], topes_de_familia: topes, reservas_de_familia: { video_mesa: 12 }, encargos: [] }
    const abierto = (gasto: number, tope: number, familia: string | null = 'video_mesa') => ({ ...base, encargos: [{ id: 'e', parte_id: 'p', brief_id: 'b', estado: 'en_paso', tope_usd: tope, gasto_usd: gasto, familia }] })
    expect(medirGastoDeCampana(abierto(0.43, 35), 'otro').gastado).toBe(12)
    expect(medirGastoDeCampana(abierto(20, 35), 'otro').gastado).toBe(20)
    expect(medirGastoDeCampana(abierto(0.43, 10), 'otro').gastado).toBe(10) // su tope (10) es menor que lo esperado (12)
    expect(medirGastoDeCampana(abierto(0.43, 35, null), 'otro').gastado).toBe(35)
    expect(medirGastoDeCampana({ ...abierto(0.43, 35), reservas_de_familia: undefined }, 'otro').gastado).toBe(35)
    expect(medirGastoDeCampana({ ...abierto(0.43, 0), }, 'otro').gastado).toBe(12) // sin tope legible, lo esperado
    // uno CERRADO cuenta solo lo gastado (sin cambios)
    expect(medirGastoDeCampana({ ...base, encargos: [{ id: 'e', parte_id: 'p', brief_id: 'b', estado: 'cerrado', tope_usd: 35, gasto_usd: 5.1, familia: 'video_mesa' }] }, 'otro').gastado).toBe(5.1)
  })
  it('🔴 lo comprometido (en la sala sin encargo) y el lugar guardado por fecha también usan lo esperado', () => {
    const l: LecturaDeGasto = { corridas: [], conceptos: [], briefs: [], encargos: [], revisiones: [], topes_de_familia: topes, reservas_de_familia: { video_mesa: 12 },
      partes: [{ id: 'p1', briefs: [{ brief_id: 'V', familia: 'video_mesa', fila_id: null }] }], soltados: [{ parte_id: 'p1', brief_id: 'V' }] }
    expect(medirGastoDeCampana(l, 'p-actual').comprometido).toBe(12)
    expect(decidirTope(100, { gastado: 75, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, antes.slice(0, 1), { video_mesa: 12 })).toMatchObject({ tipo: 'cabe' }) // 75 + 12 + 12 = 99
    expect(decidirTope(100, { gastado: 77, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, antes.slice(0, 1), { video_mesa: 12 })).toMatchObject({ tipo: 'corta' }) // 77 + 12 + 12 = 101
  })
  it('el aviso ya no dice «como máximo»: dice que es lo que suelen costar y que el tope de cada familia es el techo', () => {
    const d = decidirTope(10, { gastado: 0, comprometido: 0 }, [reel('R21', '2026-11-21')], topes, [], { video_mesa: 12 })
    const a = avisoDelTope({ id: NAU, client_id: 'c' }, d as Exclude<typeof d, { tipo: 'cabe' }>)
    expect(a.detalle).toContain('según lo que suelen costar; cada una con el tope de su familia como techo')
    expect(a.detalle).not.toContain('como máximo')
  })
})
