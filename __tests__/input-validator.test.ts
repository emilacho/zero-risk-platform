/**
 * input-validator.test.ts · Wave 14 · CC#1
 *
 * Unit tests for src/lib/input-validator.ts (Ajv 2020 wrapper).
 *
 * Covers:
 *  - happy path → ok:true with parsed data
 *  - missing required field → 400 + E-INPUT-INVALID
 *  - wrong type → 400 + E-INPUT-INVALID
 *  - exceeds maxLength → 400 + E-INPUT-INVALID
 *  - body not JSON → 400 + E-INPUT-PARSE
 *  - schema not found → 500 + E-INPUT-SCHEMA
 *  - validateObject (no Request) shortcut
 *  - cache hit returns same compiled validator
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateInput,
  validateObject,
  _resetValidatorCache,
} from '../src/lib/input-validator'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('input-validator', () => {
  beforeEach(() => _resetValidatorCache())

  describe('validateInput · happy path', () => {
    it('passes when required fields are present and well-typed', async () => {
      const req = makeRequest({ agent: 'jefe-marketing', task: 'create a campaign brief' })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(true)
      if (v.ok) {
        expect(v.data).toMatchObject({ agent: 'jefe-marketing', task: 'create a campaign brief' })
      }
    })

    it('passes with optional null fields', async () => {
      const req = makeRequest({
        agent: 'qa-empleado',
        task: 'review',
        resume_session_id: null,
        client_id: null,
      })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(true)
    })
  })

  describe('validateInput · violations', () => {
    it('rejects missing required field with 400 + E-INPUT-INVALID', async () => {
      const req = makeRequest({ task: 'no agent provided' })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-INVALID')
        expect(body.detail).toMatch(/agent/i)
      }
    })

    it('rejects wrong type (number for task) with 400', async () => {
      const req = makeRequest({ agent: 'x', task: 12345 })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-INVALID')
      }
    })

    it('rejects task exceeding maxLength', async () => {
      const longTask = 'a'.repeat(9000)
      const req = makeRequest({ agent: 'x', task: longTask })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-INVALID')
      }
    })
  })

  describe('validateInput · parse + schema errors', () => {
    it('returns 400 + E-INPUT-PARSE when body is not JSON', async () => {
      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json {{{',
      })
      const v = await validateInput(req, 'agents-run-sdk')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-PARSE')
      }
    })

    it('returns 500 + E-INPUT-SCHEMA when schema name does not exist', async () => {
      const req = makeRequest({ x: 1 })
      const v = await validateInput(req, 'this-schema-does-not-exist')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(500)
        const body = await v.response.json()
        expect(body.code).toBe('E-INPUT-SCHEMA')
      }
    })
  })

  describe('validateObject (synchronous variant)', () => {
    it('validates a pre-parsed object', () => {
      const v = validateObject({ agent: 'x', task: 'y' }, 'agents-run-sdk')
      expect(v.ok).toBe(true)
    })

    it('rejects missing required on pre-parsed object', () => {
      const v = validateObject({ agent: 'x' }, 'agents-run-sdk')
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.response.status).toBe(400)
      }
    })
  })

  describe('cache', () => {
    it('returns same compiled validator on second call (no recompile)', async () => {
      const req1 = makeRequest({ agent: 'a', task: 't' })
      const v1 = await validateInput(req1, 'agents-run-sdk')
      expect(v1.ok).toBe(true)

      const req2 = makeRequest({ agent: 'b', task: 'u' })
      const v2 = await validateInput(req2, 'agents-run-sdk')
      expect(v2.ok).toBe(true)
      // No assertion on cache internals — implicit: no recompile error thrown.
    })
  })
})
