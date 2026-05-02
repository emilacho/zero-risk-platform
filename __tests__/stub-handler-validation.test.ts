/**
 * Integration test: stub-handler.ts schemaName option (Wave 14 · CC#1).
 *
 * Verifies that the schema-validation hook in handleStubPost correctly:
 *  - rejects rows with wrong types (400 + E-INPUT-INVALID)
 *  - accepts well-formed payloads
 *  - enforces validation per-element when body is an array
 *  - enforces validation per-element when body has a `rows` array
 *  - leaves the request flow unchanged when schemaName is omitted (back-compat)
 *
 * The DB layer is exercised via env-bypass: when getSupabaseAdmin() throws or
 * returns errors, the helper logs + returns ok:true with fallback_mode. Tests
 * here only check the validation gate, not the DB interaction.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { handleStubPost } from '../src/lib/stub-handler'
import { _resetValidatorCache } from '../src/lib/input-validator'

const VALID_KEY = 'test-internal-key'

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
  // Force getSupabaseAdmin path through fallback by clearing supabase env.
  delete process.env.SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

function authedRequest(body: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': VALID_KEY,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('handleStubPost · schemaName integration', () => {
  it('rejects bad row when schemaName is set', async () => {
    const req = authedRequest({ client_id: 12345 }) // wrong type — should be string|null
    const res = await handleStubPost(req, {
      table: 'test_table',
      schemaName: 'stub-row',
    })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-INPUT-INVALID')
  })

  it('accepts well-formed row when schemaName is set', async () => {
    const req = authedRequest({ client_id: 'acme-corp', task_id: 'task-1' })
    const res = await handleStubPost(req, {
      table: 'test_table',
      schemaName: 'stub-row',
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('validates each element of a top-level array', async () => {
    const req = authedRequest([
      { client_id: 'a' },
      { client_id: 999 }, // bad — should fail
    ])
    const res = await handleStubPost(req, {
      table: 'test_table',
      schemaName: 'stub-row',
    })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('E-INPUT-INVALID')
  })

  it('validates each element of a body.rows array', async () => {
    const req = authedRequest({
      rows: [
        { client_id: 'a' },
        { client_id: 'b', task_id: 42 }, // bad — task_id must be string|null
      ],
    })
    const res = await handleStubPost(req, {
      table: 'test_table',
      schemaName: 'stub-row',
    })
    expect(res.status).toBe(400)
  })

  it('back-compat: skips validation when schemaName is omitted', async () => {
    const req = authedRequest({ client_id: 12345 }) // would fail under stub-row
    const res = await handleStubPost(req, {
      table: 'test_table',
      // no schemaName
    })
    // No validation → flows through. Status 200 with fallback_mode (DB unavailable).
    expect(res.status).toBe(200)
  })

  it('returns 401 BEFORE running validation when auth missing', async () => {
    const req = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 12345 }), // would otherwise fail validation
    })
    const res = await handleStubPost(req, {
      table: 'test_table',
      schemaName: 'stub-row',
    })
    expect(res.status).toBe(401)
  })
})
