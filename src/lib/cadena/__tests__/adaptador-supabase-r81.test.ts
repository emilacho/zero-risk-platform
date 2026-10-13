/**
 * r81 · las 3 mutaciones que dejaron vivas las pruebas de memoria de la r79 (CC#3): el ADAPTADOR de la base.
 *  (a) `autoproducir` pide el despacho inmediato de cada sobre aceptado  (b) el parte de seco se guarda con la llave `seco:<lote>`  (c) y con `prueba_seco`.
 * Base y sala simuladas: US$ 0, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const escrituras: Array<{ op: 'insert' | 'update'; tabla: string; fila: Record<string, any> }> = []
let existente: { id: string } | null = null
const programadas: Array<Record<string, any>> = []
let resultadoIngreso: Record<string, unknown> = { kind: 'accepted', event_id: 'ev-1', stream_id: 'st-1', inserted: true }

function consulta(tabla: string) {
  const q: any = {
    select: () => q, eq: () => q, lt: () => q, limit: () => q, in: () => q,
    maybeSingle: async () => ({ data: existente, error: null }),
    single: async () => ({ data: { id: 'uuid-nuevo' }, error: null }),
    insert: (fila: Record<string, any>) => { escrituras.push({ op: 'insert', tabla, fila }); return q },
    update: (fila: Record<string, any>) => { escrituras.push({ op: 'update', tabla, fila }); return q },
    then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => consulta(t) }) }))
vi.mock('@/lib/sala-recados/almacen-supabase', () => ({ almacenDeSupabase: () => ({}) }))
vi.mock('@/lib/run-sdk-spend-gate', () => ({ checkRunSdkSpendCap: async () => ({ blocked: false }) }))
vi.mock('@/lib/sala-event-log', () => ({ SupabaseEventLogStorage: class { constructor(public db: unknown) {} } }))
vi.mock('@/lib/sala-ingress', () => ({ isIntakeEnabled: () => true, orchestrateIngress: async () => resultadoIngreso, SupabaseIngressTables: class {} }))
vi.mock('@/lib/sala-router-consumer/inmediato-supabase', () => ({ programarDespachoInmediato: (a: Record<string, any>) => { programadas.push(a); return 'programado' } }))

import { almacenDeSupabase } from '../almacen-supabase'

const sobre = { source: 'brief/parte-listo', intent: 'producir', payload: { parte_id: 'p', brief_id: 'b', dry_run: true }, idempotency_key: 'p:b:producir', logical_period: 'parte:p', tenant_id: 'tenant-x', client_id: 'cli-x' } as never
const parte = { client_id: 'cli-x', lote: '2026-W43', vence_en: '2026-10-14T00:00:00.000Z', fila: { title: 'Parte', content: 'c', provenance_tag: { valido: true, lote_key: 'cli:2026-W43:1', plan_id: 'pl' } } }

beforeEach(() => { escrituras.length = 0; programadas.length = 0; existente = null; resultadoIngreso = { kind: 'accepted', event_id: 'ev-1', stream_id: 'st-1', inserted: true }; process.env.INTERNAL_API_KEY = 'k' })

describe('adaptador de la base · parte de seco (mutaciones b y c)', () => {
  it('guarda el parte con la llave de lote `seco:<lote>` (nunca la del lote real) y la marca seco + prueba_seco + vencimiento', async () => {
    const id = await almacenDeSupabase().guardarParteSeco(parte)
    expect(id).toBe('uuid-nuevo')
    const ins = escrituras.find((e) => e.op === 'insert' && e.tabla === 'client_historical_outputs')!
    const tag = ins.fila.provenance_tag
    expect(tag.lote_key).toBe('seco:2026-W43'); expect(tag.lote_key).not.toBe('cli:2026-W43:1')
    expect(tag.seco).toBe(true); expect(tag.prueba_seco).toBe(true); expect(tag.vence_en).toBe(parte.vence_en)
    expect(ins.fila.output_type).toBe('campaign_brief_pack'); expect(ins.fila.status).toBe('draft'); expect(String(ins.fila.title)).toMatch(/^\[ENSAYO EN SECO\]/)
    expect(tag.plan_id).toBe('pl') // lo demás de la ficha se conserva
  })
  it('repetir el ensayo ACTUALIZA el mismo parte (no inserta otro) y conserva las marcas', async () => {
    existente = { id: 'uuid-previo' }
    const id = await almacenDeSupabase().guardarParteSeco(parte)
    expect(id).toBe('uuid-previo')
    expect(escrituras.some((e) => e.op === 'insert')).toBe(false)
    const up = escrituras.find((e) => e.op === 'update')!
    expect(up.fila.provenance_tag).toMatchObject({ seco: true, prueba_seco: true, lote_key: 'seco:2026-W43' })
  })
})

describe('adaptador de la base · autoproducir pide el despacho inmediato (mutación a)', () => {
  it('sobre aceptado y NUEVO: se pide el inmediato con SU evento, su hilo y su tenant', async () => {
    const r = await almacenDeSupabase().emitirSobre(sobre)
    expect(r).toMatchObject({ resultado: 'aceptado', event_id: 'ev-1' })
    expect(programadas).toHaveLength(1)
    expect(programadas[0]).toMatchObject({ tenant_id: 'tenant-x', event_id: 'ev-1', stream_id: 'st-1', origen: 'cadena/autoproducir' })
  })
  it('sobre duplicado o rechazado: NO se pide nada (no hay nada que despachar)', async () => {
    resultadoIngreso = { kind: 'duplicate', event_id: 'ev-1', stream_id: 'st-1' }
    expect((await almacenDeSupabase().emitirSobre(sobre)).resultado).toBe('duplicado')
    resultadoIngreso = { kind: 'accepted', event_id: 'ev-2', stream_id: 'st-2', inserted: false }
    await almacenDeSupabase().emitirSobre(sobre)
    resultadoIngreso = { kind: 'refused', code: 'x', detail: 'y' }
    expect((await almacenDeSupabase().emitirSobre(sobre)).resultado).toBe('rechazado')
    expect(programadas).toHaveLength(0)
  })
})
