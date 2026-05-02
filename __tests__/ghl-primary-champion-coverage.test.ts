/**
 * Coverage gap-fill · GET /api/ghl/primary-champion (W17-T2/T3).
 *
 * Endpoint has a 3-tier champion-resolution fallback:
 *   1. ghl_client_champions (explicit role='champion')
 *   2. ghl_contacts (heuristic: engagement_score > 70)
 *   3. clients.primary_contact_email
 *   4. final stub
 *
 * Base test only hits tier-4 (all queries return null). This file targets
 * uncovered branches at lines 91 (tier-1 hit), 116 (tier-2 hit),
 * 139 (tier-3 hit).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Per-table mock dispatcher. Each test programs the response for the
// table it expects to be queried; un-set tables return null/no-data.
type TableResult = { data: unknown; error?: unknown } | { throws: true }

const tableResponses: Record<string, TableResult> = {}

function setTable(name: string, result: TableResult) {
  tableResponses[name] = result
}

function makeChain(tableName: string) {
  const respond = () => {
    const r = tableResponses[tableName]
    if (!r) return Promise.resolve({ data: null, error: null })
    if ('throws' in r) throw new Error(`mock: ${tableName} threw`)
    return Promise.resolve({ data: r.data, error: r.error ?? null })
  }
  // Build a chain that supports the 3 different shapes used by the route:
  //   1. .select.eq.eq.order.limit.maybeSingle()
  //   2. .select.eq.gt.order.limit.maybeSingle()
  //   3. .select.eq.maybeSingle()
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.gt = () => chain
  chain.order = () => chain
  chain.limit = () => chain
  chain.maybeSingle = respond
  return chain
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (name: string) => makeChain(name),
  }),
}))

import { GET } from '../src/app/api/ghl/primary-champion/route'

const VALID_KEY = 'gap-fill-ghl-primary-champion-key'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  process.env.INTERNAL_API_KEY = VALID_KEY
  for (const k of Object.keys(tableResponses)) delete tableResponses[k]
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(qs: string): Request {
  return new Request(`http://localhost/api/ghl/primary-champion${qs}`, {
    method: 'GET',
    headers: { 'x-api-key': VALID_KEY },
  })
}

describe('GET /api/ghl/primary-champion · gap-fill (W17-T2/T3)', () => {
  it('tier-1 · ghl_client_champions hit · returns champion with source=ghl_client_champions', async () => {
    setTable('ghl_client_champions', {
      data: {
        contact_name: 'Alice CEO',
        contact_email: 'alice@acme.com',
        role: 'champion',
        engagement_score: 92,
      },
    })
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.champion).toMatchObject({
      name: 'Alice CEO',
      email: 'alice@acme.com',
      role: 'champion',
      engagement_score: 92,
      source: 'ghl_client_champions',
    })
    expect(body.fallback_mode).toBeUndefined()
  })

  it('tier-1 · row present but contact_email missing → falls through to tier-2', async () => {
    setTable('ghl_client_champions', {
      data: { contact_name: 'No Email', contact_email: null, role: 'champion' },
    })
    setTable('ghl_contacts', {
      data: { contact_name: 'Heuristic Bob', email: 'bob@acme.com', engagement_score: 85 },
    })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.champion.source).toBe('ghl_contacts.heuristic')
    expect(body.champion.email).toBe('bob@acme.com')
    expect(body.champion.engagement_score).toBe(85)
  })

  it('tier-2 · heuristic hit when tier-1 empty', async () => {
    setTable('ghl_contacts', {
      data: { contact_name: null, email: 'fallback@acme.com', engagement_score: 75 },
    })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.champion).toMatchObject({
      name: 'fallback@acme.com', // contact_name was null → uses email as fallback
      email: 'fallback@acme.com',
      role: 'inferred_champion',
      engagement_score: 75,
      source: 'ghl_contacts.heuristic',
    })
  })

  it('tier-3 · clients.primary_contact_email hit when tiers 1+2 empty', async () => {
    setTable('clients', {
      data: {
        client_id: 'acme',
        primary_contact_email: 'primary@acme.com',
        primary_contact_name: 'Primary Pat',
      },
    })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.champion).toMatchObject({
      name: 'Primary Pat',
      email: 'primary@acme.com',
      role: 'primary_contact',
      source: 'clients.primary_contact_email',
    })
    expect(body.fallback_mode).toBeUndefined() // not stub mode
  })

  it('tier-3 · row exists but primary_contact_email empty → falls through to stub', async () => {
    setTable('clients', { data: { client_id: 'acme', primary_contact_email: null, primary_contact_name: 'Pat' } })
    const res = await GET(req('?client_id=acme'))
    const body = await res.json()
    expect(body.fallback_mode).toBe(true)
    expect(body.champion.source).toMatch(/stub/i)
  })

  it('tier-1 throws → falls through silently to tier-2 hit', async () => {
    setTable('ghl_client_champions', { throws: true })
    setTable('ghl_contacts', {
      data: { contact_name: 'Recovery', email: 'recovery@acme.com', engagement_score: 80 },
    })
    const res = await GET(req('?client_id=acme'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.champion.source).toBe('ghl_contacts.heuristic')
  })
})
