/**
 * TOPE DE GASTO POR CAMPAÑA (CC1 · 10-nov · GO Lenovo 19:30Z · condiciones de CC7 · decisión de Emilio 19:40Z) · US$ 0, sin red.
 * Dos clientes REALES de rubros distintos (`__fixtures__/gasto-de-campanas-reales.json`, foto GET de la base del 10-nov):
 *   · Náufrago (restaurante) · campaña 28de888e · tope US$ 40 firmado por Emilio · planeación + concepto + brief = US$ 26,28 (la cifra de la pregunta de CC1);
 *   · Seguridad Industrial (industria) · campaña 31dc6aaf · SIN tope en la base · piezas reales ya producidas (encargos de la oficina).
 * La lectura de la base se ejerce con el ADAPTADOR REAL (`almacenDeSupabase().leerGastoDeCampana`) sobre una base falsa que aplica los filtros y guarda las consultas
 * (lo que pidieron CC7 y CC6 en #1010: que la lectura real tenga su prueba). Lo CONSTRUIDO (no sale de la base) lleva la marca «construido».
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
const valor = (r: Fila, col: string): unknown => { const m = col.match(/^(\w+)->>(\w+)$/); if (!m) return r[col]; const v = r[m[1]]?.[m[2]]; return v === undefined || v === null ? null : String(v) }
function consulta(tabla: string) {
  const filtros: Array<[string, string, unknown]> = []
  const reg = { tabla, filtros }
  consultas.push(reg)
  let tope = Infinity
  const q: any = {
    select: () => q, order: () => q,
    eq: (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q },
    in: (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q },
    limit: (n: number) => { tope = n; return q },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
      if (fallarTabla === tabla) return Promise.resolve({ data: null, error: { message: `falló ${tabla}` } }).then(ok, ko)
      const filas = (tablas[tabla] ?? []).filter((r) => filtros.every(([op, c, v]) => op === 'eq' ? valor(r, c) === v : (v as unknown[]).includes(valor(r, c)))).slice(0, tope)
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
import { decidirTope, filasPorVenir, medirGastoDeCampana, topeDeLaPieza, type Candidata, type LecturaDeGasto } from '../tope-de-campana'
import { familiaDeFila } from '../familia'
import type { FormatosPorRed } from '../tipos'
import { TABLAS_DE_GASTO } from '@/lib/oficina/gasto-de-encargos'

const ENC = TABLAS_DE_GASTO.encargos, PLANT = TABLAS_DE_GASTO.plantillas

/** las tablas tal como están en la base (foto del 10-nov) · `extra` agrega filas CONSTRUIDAS para los sabotajes */
function sembrar(extra: Record<string, Fila[]> = {}) {
  tablas = { cadena_corridas: [], cadena_conceptos: [], cadena_brief_creativo: [], client_historical_outputs: [], [ENC]: [], [PLANT]: F.tipos_de_grupo.map((t: Fila) => ({ ...t })) }
  for (const [id, c] of Object.entries<any>(F.campanas)) {
    tablas.cadena_corridas.push(...c.corridas.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.cadena_conceptos.push(...c.conceptos.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.cadena_brief_creativo.push(...c.briefs.map((x: Fila) => ({ ...x, campana_id: id })))
    tablas.client_historical_outputs.push(...c.partes.map((p: Fila) => ({ ...p, output_type: 'campaign_brief_pack' })))
    tablas[ENC].push(...c.encargos.map((e: Fila) => ({ ...e })))
  }
  for (const [t, filas] of Object.entries(extra)) (tablas[t] ??= []).push(...filas)
}
const leer = (campana: string, parte: string) => almacenDeSupabase().leerGastoDeCampana(campana, parte)
const formatos: FormatosPorRed = (() => { const o: FormatosPorRed = {}; for (const f of F.formatos_por_red) (o[f.red] ??= []).push(f); return o })()
const filasDe = (c: string) => (F.campanas[c].filas as Fila[]).map((f) => ({ id: f.id, fecha: f.fecha, hora: f.hora, estado: f.estado, familia: familiaDeFila(f as any, formatos) }))
const enSemana = (c: string, desde: string, hasta: string) => filasDe(c).filter((f) => f.estado === 'validada' && f.fecha >= desde && f.fecha <= hasta)
const candidatasDe = (filas: ReturnType<typeof filasDe>): Candidata[] => filas.map((f, i) => ({ brief_id: `B${String(i + 1).padStart(2, '0')}`, familia: f.familia, fecha: f.fecha, hora: f.hora, ya_tiene_encargo: false }))
const HOY = '2026-11-10'

beforeEach(() => { sembrar(); consultas.length = 0; fallarTabla = null })

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
    const q = consultas.find((c) => c.tabla === ENC)!
    expect(q.filtros).toContainEqual(['eq', 'dry_run', false])
    const ids = q.filtros.find(([op, c]) => op === 'in' && c === 'parte_id')![2] as string[]
    expect([...ids].sort()).toEqual([SEG, 'parte-actual', '2a93029a-d4e5-439e-87a8-4b67afdfec33'].sort())
    expect(consultas.find((c) => c.tabla === PLANT)!.filtros).toContainEqual(['eq', 'activo', true])
    for (const t of ['cadena_corridas', 'cadena_conceptos', 'cadena_brief_creativo']) expect(consultas.find((c) => c.tabla === t)!.filtros).toContainEqual(['eq', 'campana_id', SEG])
    expect(consultas.find((c) => c.tabla === 'client_historical_outputs')!.filtros).toEqual(expect.arrayContaining([['eq', 'output_type', 'campaign_brief_pack'], ['eq', 'provenance_tag->>campana_id', SEG]]))
  })
  it('sabotaje · un parte de ENSAYO de la campaña (construido) no compromete dinero ni trae sus encargos', async () => {
    sembrar({ client_historical_outputs: [{ id: 'parte-seco', output_type: 'campaign_brief_pack', provenance_tag: { campana_id: NAU, seco: true, prueba_seco: true, familias_por_brief: [{ brief_id: 'S1', familia: 'carrusel_mesa' }] } }] })
    const l = await leer(NAU, 'parte-nuevo')
    expect(l.partes.map((p) => p.id)).toEqual([])
    expect(medirGastoDeCampana(l, 'parte-nuevo').comprometido).toBe(0)
  })
  it('sabotaje · un parte REAL anterior con un brief sin encargo (construido) compromete el tope de su familia; uno que ya tiene encargo, no', async () => {
    sembrar({ client_historical_outputs: [{ id: 'parte-viejo', output_type: 'campaign_brief_pack', provenance_tag: { campana_id: NAU, familias_por_brief: [{ brief_id: 'V1', familia: 'carrusel_mesa' }, { brief_id: 'V2', familia: 'kit_historias' }] } }], [ENC]: [{ id: 'e-v2', parte_id: 'parte-viejo', brief_id: 'V2', estado: 'cerrado', tope_usd: 2.5, gasto_usd: 0.4, dry_run: false }] })
    const m = medirGastoDeCampana(await leer(NAU, 'parte-nuevo'), 'parte-nuevo')
    expect(m.comprometido).toBe(5) // V1 · carrusel_mesa
    expect(m.gastado).toBeCloseTo(26.28 + 0.4, 2) // V2 ya gastó lo suyo
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
    expect(medirGastoDeCampana(l, 'otro').comprometido).toBe(5)
  })
  it('sabotaje · una corrida caída sin costo cuenta su tope (la cota pesimista de siempre)', () => {
    const l: LecturaDeGasto = { corridas: [{ costo_usd: 0, estado: 'fallida', paso: 'estrategia' }], conceptos: [], briefs: [], encargos: [], partes: [], topes_de_familia: { post_img: 2.5 } }
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
  for (const t of ['cadena_corridas', 'cadena_conceptos', 'cadena_brief_creativo', 'client_historical_outputs', ENC, PLANT]) {
    it(`falla ${t} → lanza`, async () => { fallarTabla = t; await expect(leer(NAU, 'x')).rejects.toThrow() })
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
