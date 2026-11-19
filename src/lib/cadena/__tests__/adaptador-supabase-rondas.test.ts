/**
 * 19-nov · grupo C1 · 🟡 m1 de CC6 · el ADAPTADOR real (Supabase), no la memoria:
 *   · `hallazgosQueBloquean` con varias rondas de corrección guardadas en el MISMO intento (2): cuentan solo los bloqueos del ÚLTIMO guardado (la `creada_en` más nueva);
 *   · las rondas de la estrategia se escriben con la llave única (campaña, versión, ronda) y sin duplicar, y se leen en orden.
 * Base simulada en memoria que aplica eq/order como Postgres: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tablas: Record<string, Array<Record<string, unknown>>> = { cadena_validaciones: [], cadena_estrategia_rondas: [] }
const upserts: Array<{ tabla: string; fila: Record<string, unknown>; opciones: Record<string, unknown> }> = []

function consulta(nombre: string) {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = []
  let orden: { col: string; asc: boolean } | null = null
  let escribir: { fila: Record<string, unknown>; opciones: Record<string, unknown> } | null = null
  const q: any = {}
  q.select = () => q
  q.limit = () => q
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.order = (col: string, o?: { ascending?: boolean }) => { orden = { col, asc: o?.ascending !== false }; return q }
  q.upsert = (fila: Record<string, unknown>, opciones: Record<string, unknown>) => { escribir = { fila, opciones }; return q }
  q.then = (ok: (v: unknown) => unknown) => {
    if (escribir) {
      const { fila, opciones } = escribir
      upserts.push({ tabla: nombre, fila: structuredClone(fila), opciones })
      const llave = String(opciones.onConflict).split(',')
      const ya = tablas[nombre].some((r) => llave.every((k) => r[k] === fila[k]))
      if (!ya) tablas[nombre].push(structuredClone(fila))
      else if (!opciones.ignoreDuplicates) return ok({ data: null, error: { message: 'duplicate key value violates unique constraint' } })
      return ok({ data: null, error: null })
    }
    let filas = tablas[nombre].filter((r) => filtros.every((f) => f(r)))
    if (orden) { const { col, asc } = orden; filas = [...filas].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1)) }
    return ok({ data: filas.map((r) => structuredClone(r)), error: null })
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

const ficha = (que: string) => ({ que, donde: 'x', contra_que: 'x', gravedad: 'bloquea', propuesta: 'x' })
const val = (intento: number, creada_en: string, fila_id: string | null, severidad: 'bloquea' | 'aviso', que: string, tanda = 1) =>
  ({ campana_id: 'camp', objeto: 'calendario', objeto_version: 1, tanda, intento, chequeo: 'V02', severidad, fila_id, ficha: ficha(que), creada_en })

beforeEach(() => {
  upserts.length = 0
  tablas.cadena_estrategia_rondas = []
  tablas.cadena_validaciones = [
    val(1, '2026-11-19T05:00:00.000+00:00', 's1-d1-a', 'bloquea', 'primera pasada'),
    // ronda 1 y ronda 2: dos guardados del intento 2, cada uno con su `creada_en` (un insert = una transacción = una sola hora)
    val(2, '2026-11-19T05:01:00.000+00:00', 's1-d1-a', 'bloquea', 'ronda 1 · a'),
    val(2, '2026-11-19T05:01:00.000+00:00', 's2-d1-b', 'bloquea', 'ronda 1 · b'),
    val(2, '2026-11-19T05:02:00.000+00:00', 's3-d1-c', 'bloquea', 'ronda 2 · c'),
    val(2, '2026-11-19T05:02:00.000+00:00', 's3-d1-d', 'aviso', 'ronda 2 · aviso'),
    // otra tanda: no se mezcla
    val(2, '2026-11-19T05:03:00.000+00:00', 's5-d1-a', 'bloquea', 'otra tanda', 2),
  ]
})

describe('hallazgosQueBloquean en la base real: con varias rondas, solo el ÚLTIMO guardado del intento más alto', () => {
  it('🔴 los bloqueos de la ronda 1 ya no cuentan cuando la ronda 2 guardó después', async () => {
    const r = await almacenDeSupabase().hallazgosQueBloquean('camp', 1)
    expect(r.map((x) => x.ficha.que)).toEqual(['ronda 2 · c'])
    expect(r[0].fila_id).toBe('s3-d1-c')
  })
  it('el último guardado cuenta ENTERO (todos sus bloqueos, ninguno de sus avisos)', async () => {
    tablas.cadena_validaciones.push(val(2, '2026-11-19T05:02:00.000+00:00', 's4-d2-a', 'bloquea', 'ronda 2 · otro'))
    const r = await almacenDeSupabase().hallazgosQueBloquean('camp', 1)
    expect(r.map((x) => x.ficha.que).sort()).toEqual(['ronda 2 · c', 'ronda 2 · otro'])
  })
  it('compara la hora como hora, no como texto (la más nueva gana aunque su texto ordene antes)', async () => {
    tablas.cadena_validaciones.push(val(2, '2026-11-19T06:02:00.000+01:00', 's9-d1-z', 'bloquea', 'texto mayor, misma hora que la ronda 2'))
    tablas.cadena_validaciones.push(val(2, '2026-11-19T05:30:00+00:00', 's8-d1-y', 'bloquea', 'ronda 3'))
    const r = await almacenDeSupabase().hallazgosQueBloquean('camp', 1)
    expect(r.map((x) => x.ficha.que)).toEqual(['ronda 3'])
  })
  it('sin rondas (solo la primera pasada): sus bloqueos, como siempre', async () => {
    tablas.cadena_validaciones = tablas.cadena_validaciones.filter((x) => x.intento === 1)
    expect((await almacenDeSupabase().hallazgosQueBloquean('camp', 1)).map((x) => x.ficha.que)).toEqual(['primera pasada'])
  })
})

describe('las rondas de la estrategia en la base real', () => {
  const ronda = (n: number, bloqueos: number) => ({ campana_id: 'camp', version: 1, ronda: n, contenido: { n } as never, bloqueos, fichas: [], seco: false })
  it('se escriben con la llave única (campaña, versión, ronda) y un reenvío no duplica ni falla', async () => {
    const al = almacenDeSupabase()
    await al.guardarRondaDeEstrategia(ronda(0, 3))
    await al.guardarRondaDeEstrategia(ronda(0, 9)) // el mismo sobre reenviado: no pisa ni duplica
    await al.guardarRondaDeEstrategia(ronda(1, 1))
    expect(upserts.every((u) => u.tabla === 'cadena_estrategia_rondas' && u.opciones.onConflict === 'campana_id,version,ronda' && u.opciones.ignoreDuplicates === true)).toBe(true)
    expect(tablas.cadena_estrategia_rondas.map((x) => [x.ronda, x.bloqueos])).toEqual([[0, 3], [1, 1]])
  })
  it('se leen solo las de esa versión, en orden de ronda', async () => {
    tablas.cadena_estrategia_rondas = [ronda(2, 1), ronda(0, 3), { ...ronda(1, 2), version: 2 }, ronda(1, 2)]
    const r = await almacenDeSupabase().rondasDeEstrategia('camp', 1)
    expect(r.map((x) => x.ronda)).toEqual([0, 1, 2])
  })
})
