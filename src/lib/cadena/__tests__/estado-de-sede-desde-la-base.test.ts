/**
 * El estado de la sede llega desde la base al contexto de quien planea: el almacén real sobre una base falsa. US$ 0, sin red. Lo más nuevo manda y nada se deduce de otro campo.
 */
import { describe, expect, it, vi } from 'vitest'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mocks.db }))

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P = '11111111-1111-4111-8111-111111111111'
const dato = (id: string, sede_id: string, campo: string, valor_texto: string, observado_en: string) => ({ id, client_id: C, sede_id, campo, valor_texto, valor_norm: null, fuente: 'dueno', observado_en })
const base = (datos: Array<Record<string, unknown>>, config: Record<string, unknown> = {}) => new DbFalsa()
  .semilla('client_historical_outputs', [{ id: P, client_id: C, content_text: 'plan', content: null, created_at: '2026-10-30T00:00:00Z', output_type: 'campaign_plan_90d' }])
  .semilla('clients', [{ id: C, name: 'Cliente', country: 'Ecuador', config }])
  .semilla('client_sedes', [{ id: 's1', client_id: C, clave: 'norte', ciudad: 'Ciudad Norte' }, { id: 's2', client_id: C, clave: 'sur', ciudad: 'Ciudad Sur' }])
  .semilla('client_sede_datos', datos)

async function sedes(db: DbFalsa) {
  mocks.db = db
  const { almacenDeSupabase } = await import('../almacen-supabase')
  const ctx = await almacenDeSupabase().cargarContexto(C, P)
  return Object.fromEntries((ctx?.sedes ?? []).map((s) => [s.clave, s.estado]))
}

describe('el contexto del cliente', () => {
  it('cada sede lleva su estado; sin dato, ninguno', async () => {
    expect(await sedes(base([dato('d1', 's1', 'estado_de_la_sede', 'por abrir', '2026-10-15T00:00:00Z')]))).toEqual({ norte: 'por_abrir', sur: undefined })
  })
  it('lo más nuevo manda', async () => {
    expect(await sedes(base([dato('d1', 's1', 'estado_de_la_sede', 'por abrir', '2026-10-15T00:00:00Z'), dato('d2', 's1', 'estado_de_la_sede', 'abierta', '2026-11-01T00:00:00Z')]))).toEqual({ norte: 'abierta', sur: undefined })
  })
  it('🔴 nada se deduce de otro campo: «solo domicilio» no es un estado', async () => {
    expect(await sedes(base([dato('d1', 's2', 'tipo_de_atencion', 'solo domicilio (sin local)', '2026-10-15T00:00:00Z')]))).toEqual({ norte: undefined, sur: undefined })
  })
  it('la ficha del cliente también lo dice, y manda', async () => {
    expect(await sedes(base([dato('d1', 's2', 'estado_de_la_sede', 'abierta', '2026-11-01T00:00:00Z')], { apify: { sedes_estado: { sur: 'por_abrir' } } }))).toEqual({ norte: undefined, sur: 'por_abrir' })
  })
})
