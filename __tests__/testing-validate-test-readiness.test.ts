/**
 * Integration tests · POST /api/testing/validate-test-readiness (W18-T1 · W15-D-32).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { _resetValidatorCache } from '../src/lib/input-validator'
import { POST } from '../src/app/api/testing/validate-test-readiness/route'

const VALID_KEY = 'validate-readiness-test-key-1234567890'
const ORIG_KEY = process.env.INTERNAL_API_KEY

beforeEach(() => {
  _resetValidatorCache()
  process.env.INTERNAL_API_KEY = VALID_KEY
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.INTERNAL_API_KEY
  else process.env.INTERNAL_API_KEY = ORIG_KEY
})

function req(body: unknown, withKey = true): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withKey) headers['x-api-key'] = VALID_KEY
  return new Request('http://localhost/api/testing/validate-test-readiness', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/testing/validate-test-readiness', () => {
  it('happy path · returns 200 + ready boolean + checks + reasons', async () => {
    const res = await POST(req({ experiment_id: 'exp-001' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.experiment_id).toBe('exp-001')
    expect(typeof body.ready).toBe('boolean')
    expect(body.checks).toHaveProperty('sample_size_met')
    expect(body.checks).toHaveProperty('baseline_traffic_met')
    expect(body.checks).toHaveProperty('creatives_count_met')
    expect(Array.isArray(body.reasons)).toBe(true)
  })

  it('400 + E-INPUT-INVALID · missing experiment_id', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('400 + E-INPUT-INVALID · empty experiment_id', async () => {
    const res = await POST(req({ experiment_id: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('E-INPUT-INVALID')
  })

  it('401 + E-AUTH-001 · x-api-key missing', async () => {
    const res = await POST(req({ experiment_id: 'exp-001' }, false))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('E-AUTH-001')
  })

  it('reasons is empty when ready is true (consistency)', async () => {
    // Deterministic stub: an experiment_id whose length hits all 3 mod conditions.
    // length=8 → 8%2===0 (sample met) · 8%3!==0 (baseline met) · 8%5!==0 (creatives met) → ready=true
    const res = await POST(req({ experiment_id: 'exp-aaaa' })) // length 8
    const body = await res.json()
    if (body.ready) {
      expect(body.reasons.length).toBe(0)
    } else {
      expect(body.reasons.length).toBeGreaterThan(0)
    }
  })
})
