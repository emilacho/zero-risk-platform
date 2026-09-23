/**
 * 🔴 E112 · EL LECTOR DEL CEREBRO TOMA LA VERSIÓN VIGENTE DEL MANUAL.
 *
 * `GET /api/client-brain/[client_id]` traía cada sección con `.limit(20)` SIN orden. Desde E111 el manual se
 * versiona (una fila por versión, la mayor queda vigente): este lector habría mezclado la vieja con la nueva
 * para sus cinco consumidores (RUFLO · RSA · Video Pipeline · Content Repurposing · Master Orchestrator).
 *
 * Fija: para `client_brand_books` se pide `order('version', desc)` + `limit(1)`; las demás secciones siguen
 * exactamente igual (`limit(20)`, sin orden). Sin red · Supabase simulado registrando cada llamada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Llamada = { table: string; select: string; eq: [string, string] | null; order: [string, { ascending: boolean }] | null; limit: number | null }
const llamadas: Llamada[] = []
const respuestas: Record<string, unknown[]> = {}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const l: Llamada = { table, select: '', eq: null, order: null, limit: null }
      llamadas.push(l)
      const fin = () => Promise.resolve({ data: respuestas[table] ?? [], error: null })
      const cadena: Record<string, unknown> = {}
      cadena.select = (s: string) => { l.select = s; return cadena }
      cadena.eq = (k: string, v: string) => { l.eq = [k, v]; return cadena }
      cadena.order = (k: string, o: { ascending: boolean }) => { l.order = [k, o]; return cadena }
      cadena.limit = (n: number) => { l.limit = n; return fin() }
      return cadena
    },
  }),
}))
vi.mock('@/lib/client-brain', () => ({ getClientGuardrails: async () => ({ ok: true }) }))

const { GET } = await import('../src/app/api/client-brain/[client_id]/route')
const CID = '0736401b-8a9c-4e57-9ab0-e4bad25cb630'
const ctx = { params: Promise.resolve({ client_id: CID }) }
const req = (sections: string) => {
  const { NextRequest } = require('next/server') as typeof import('next/server')
  return new NextRequest(`http://x/api/client-brain/${CID}?sections=${sections}`, { headers: { 'x-api-key': 'test-key' } })
}

beforeEach(() => { llamadas.length = 0; for (const k of Object.keys(respuestas)) delete respuestas[k]; process.env.INTERNAL_API_KEY = 'test-key' })
afterEach(() => { delete process.env.INTERNAL_API_KEY })

describe('E112 · client_brand_books · sólo la vigente', () => {
  it('pide order(version desc) + limit(1) · y devuelve esa única fila', async () => {
    respuestas.client_brand_books = [{ brand_values: ['v2'], brand_personality: ['nueva'] }]
    const res = await GET(req('client_brand_books'), ctx)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.client_brand_books).toEqual([{ brand_values: ['v2'], brand_personality: ['nueva'] }])
    const l = llamadas.find((x) => x.table === 'client_brand_books')!
    expect(l.eq).toEqual(['client_id', CID])
    expect(l.order).toEqual(['version', { ascending: false }])
    expect(l.limit).toBe(1)
  })
  it('rojo que ya no pasa: con dos versiones en la base el lector NO puede traer las dos (limit 1 ordenado)', async () => {
    respuestas.client_brand_books = [{ brand_values: ['v2'] }] // lo que la base devuelve con limit(1) · la v1 queda fuera
    const j = await (await GET(req('client_brand_books'), ctx)).json()
    expect(j.client_brand_books).toHaveLength(1)
  })
})

describe('E112 · nada más cambió', () => {
  it('las otras secciones siguen con limit(20) y sin orden', async () => {
    await GET(req('client_icp_documents,client_voc_library,client_competitive_landscape,client_historical_outputs,client_service_capabilities'), ctx)
    const otras = llamadas.filter((x) => x.table !== 'client_brand_books')
    expect(otras.map((x) => x.table).sort()).toEqual(['client_competitive_landscape', 'client_historical_outputs', 'client_icp_documents', 'client_service_capabilities', 'client_voc_library'])
    for (const l of otras) { expect(l.limit).toBe(20); expect(l.order).toBeNull(); expect(l.eq).toEqual(['client_id', CID]) }
  })
  it('sin secciones pide todas (brand books con la vigente · el resto como antes) · sección desconocida se declara', async () => {
    await GET(req(''), ctx)
    expect(llamadas).toHaveLength(6)
    expect(llamadas.find((x) => x.table === 'client_brand_books')!.limit).toBe(1)
    const j = await (await GET(req('cosa_rara'), ctx)).json()
    expect(j.cosa_rara).toEqual({ error: 'unknown_section' })
  })
  it('sin llave → 401 (igual que antes)', async () => {
    const { NextRequest } = require('next/server') as typeof import('next/server')
    const res = await GET(new NextRequest(`http://x/api/client-brain/${CID}`), ctx)
    expect(res.status).toBe(401)
  })
})
