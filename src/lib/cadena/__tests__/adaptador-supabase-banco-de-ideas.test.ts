/**
 * 17-nov · banco de ideas (CC1) · el ADAPTADOR real escribe SOLO si nada cambió entre la lectura y la escritura (medida 3 de CC6) y reasigna una fila
 * SOLO si sigue citando la idea vieja y sin brief. Base simulada en memoria que aplica los filtros eq/in como Postgres: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tablas: Record<string, Array<Record<string, unknown>>> = { cadena_conceptos: [], cadena_calendario_filas: [] }
/** se corre UNA vez después de la primera lectura (sin update): simula otra vía que escribe entre la lectura y la escritura */
let trasLeer: (() => void) | null = null

function consulta(nombre: string) {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = []
  let cambio: Record<string, unknown> | null = null
  let unaSola = false
  const q: any = {}
  q.select = () => q
  q.limit = () => q
  q.eq = (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q }
  q.in = (col: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[col])); return q }
  q.update = (p: Record<string, unknown>) => { cambio = p; return q }
  q.maybeSingle = () => { unaSola = true; return q }
  q.then = (ok: (v: unknown) => unknown) => {
    const filas = tablas[nombre].filter((r) => filtros.every((f) => f(r)))
    if (cambio) for (const r of filas) Object.assign(r, structuredClone(cambio))
    const data = filas.map((r) => structuredClone(r))
    if (!cambio && trasLeer) { const h = trasLeer; trasLeer = null; h() }
    return ok({ data: unaSola ? (data[0] ?? null) : data, error: null })
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

const SELLO = '2026-11-10T14:03:30.921+00:00'
beforeEach(() => {
  trasLeer = null
  tablas.cadena_conceptos = [{ campana_id: 'camp', version: 4, estado: 'lista', aprobacion: 'aprobado', texto_md: 't', leido: { banco: [] }, actualizada_en: SELLO }]
  tablas.cadena_calendario_filas = [
    { campana_id: 'camp', calendario_version: 1, id: 'f-validada', estado: 'validada', idea_ref: 'C1-I07', concepto: { idea: 'vieja' }, avisos: ['antes'] },
    { campana_id: 'camp', calendario_version: 1, id: 'f-briefeada', estado: 'briefeada', idea_ref: 'C1-I07', concepto: null, avisos: [] },
  ]
})

describe('adaptador · concepto con sello', () => {
  it('lee la versión con su sello (sin la columna dentro del concepto)', async () => {
    const r = await almacenDeSupabase().conceptoConSello('camp', 4)
    expect(r?.sello).toBe(SELLO)
    expect(r?.concepto).not.toHaveProperty('actualizada_en')
    expect(r?.concepto.aprobacion).toBe('aprobado')
    expect(await almacenDeSupabase().conceptoConSello('camp', 9)).toBeNull()
  })
  it('escribe con el sello leído y lo renueva; con un sello viejo NO escribe', async () => {
    const al = almacenDeSupabase()
    expect(await al.actualizarConceptoSiSello('camp', 4, SELLO, { texto_md: 'nuevo' })).toBe(true)
    expect(tablas.cadena_conceptos[0].texto_md).toBe('nuevo')
    expect(tablas.cadena_conceptos[0].actualizada_en).not.toBe(SELLO)
    expect(await al.actualizarConceptoSiSello('camp', 4, SELLO, { texto_md: 'pisado' })).toBe(false)
    expect(tablas.cadena_conceptos[0].texto_md).toBe('nuevo')
  })
})

describe('adaptador · reasignar la idea de una fila', () => {
  const DESDE = ['validada', 'lista_para_brief'] as const
  it('la fila sin brief que cita la idea vieja pasa a la nueva, borra su concepto propio y suma el aviso', async () => {
    expect(await almacenDeSupabase().reasignarIdeaDeFila('camp', 1, 'f-validada', 'C1-I07', 'C1-I21', 'aviso', DESDE)).toBe(true)
    expect(tablas.cadena_calendario_filas[0]).toMatchObject({ idea_ref: 'C1-I21', concepto: null, avisos: ['antes', 'aviso'] })
  })
  it('si otra vía le cambia la idea (o la briefea) entre la lectura y la escritura, NO la pisa', async () => {
    trasLeer = () => { tablas.cadena_calendario_filas[0].idea_ref = 'C1-I30' }
    expect(await almacenDeSupabase().reasignarIdeaDeFila('camp', 1, 'f-validada', 'C1-I07', 'C1-I21', 'aviso', DESDE)).toBe(false)
    expect(tablas.cadena_calendario_filas[0]).toMatchObject({ idea_ref: 'C1-I30', avisos: ['antes'] })
    trasLeer = () => { tablas.cadena_calendario_filas[0].estado = 'briefeada' }
    expect(await almacenDeSupabase().reasignarIdeaDeFila('camp', 1, 'f-validada', 'C1-I30', 'C1-I21', 'aviso', DESDE)).toBe(false)
    expect(tablas.cadena_calendario_filas[0]).toMatchObject({ idea_ref: 'C1-I30', estado: 'briefeada', avisos: ['antes'] })
  })
  it('la fila con brief, o que ya cita otra idea, no se toca', async () => {
    const al = almacenDeSupabase()
    expect(await al.reasignarIdeaDeFila('camp', 1, 'f-briefeada', 'C1-I07', 'C1-I21', 'aviso', DESDE)).toBe(false)
    expect(tablas.cadena_calendario_filas[1]).toMatchObject({ idea_ref: 'C1-I07', avisos: [] })
    expect(await al.reasignarIdeaDeFila('camp', 1, 'f-validada', 'C1-I99', 'C1-I21', 'aviso', DESDE)).toBe(false)
    expect(tablas.cadena_calendario_filas[0]).toMatchObject({ idea_ref: 'C1-I07', avisos: ['antes'] })
  })
})
