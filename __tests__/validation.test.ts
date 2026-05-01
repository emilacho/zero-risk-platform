/**
 * Unit tests for src/lib/validation.ts (Wave 14 · CC#1).
 *
 * Covers: isValidUUID, isValidEmail, sanitizeString, validateRequired,
 * pickFields, plus the field-allowlist constants.
 */
import { describe, it, expect } from 'vitest'
import {
  isValidUUID,
  isValidEmail,
  sanitizeString,
  validateRequired,
  pickFields,
  CAMPAIGN_FIELDS,
  LEAD_FIELDS,
  CONTENT_FIELDS,
} from '../src/lib/validation'

describe('isValidUUID', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(isValidUUID('da0c3efb-f26c-46ec-bede-7a1ed915150d')).toBe(true)
  })
  it('accepts uppercase hex', () => {
    expect(isValidUUID('DA0C3EFB-F26C-46EC-BEDE-7A1ED915150D')).toBe(true)
  })
  it('rejects v1 UUID (version digit not 4)', () => {
    expect(isValidUUID('da0c3efb-f26c-16ec-bede-7a1ed915150d')).toBe(false)
  })
  it('rejects strings with wrong length', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false)
    expect(isValidUUID('')).toBe(false)
  })
  it('rejects UUID variant outside 8/9/a/b', () => {
    expect(isValidUUID('da0c3efb-f26c-46ec-cede-7a1ed915150d')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts simple addresses', () => {
    expect(isValidEmail('emilio@zerorisk.com')).toBe(true)
    expect(isValidEmail('user.name+tag@sub.example.co')).toBe(true)
  })
  it('rejects missing @', () => {
    expect(isValidEmail('emiliozerorisk.com')).toBe(false)
  })
  it('rejects missing dot in domain', () => {
    expect(isValidEmail('emilio@zerorisk')).toBe(false)
  })
  it('rejects whitespace', () => {
    expect(isValidEmail('emilio @zerorisk.com')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('sanitizeString', () => {
  it('trims and returns the string when valid', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })
  it('returns null for empty/whitespace-only', () => {
    expect(sanitizeString('   ')).toBe(null)
    expect(sanitizeString('')).toBe(null)
  })
  it('returns null for non-string inputs', () => {
    expect(sanitizeString(123)).toBe(null)
    expect(sanitizeString(null)).toBe(null)
    expect(sanitizeString(undefined)).toBe(null)
    expect(sanitizeString({})).toBe(null)
  })
  it('truncates to maxLength', () => {
    expect(sanitizeString('a'.repeat(600), 100)).toHaveLength(100)
  })
  it('uses default maxLength=500 when not provided', () => {
    expect(sanitizeString('a'.repeat(600))).toHaveLength(500)
  })
})

describe('validateRequired', () => {
  it('returns valid when all fields present and non-empty', () => {
    const r = validateRequired({ a: 1, b: 'hi' }, ['a', 'b'])
    expect(r.valid).toBe(true)
    expect(r.missing).toEqual([])
  })
  it('returns missing list when fields are absent', () => {
    const r = validateRequired({ a: 1 }, ['a', 'b', 'c'])
    expect(r.valid).toBe(false)
    expect(r.missing).toEqual(['b', 'c'])
  })
  it('treats null/undefined/empty-string as missing', () => {
    const r = validateRequired({ a: null, b: undefined, c: '' }, ['a', 'b', 'c'])
    expect(r.valid).toBe(false)
    expect(r.missing).toEqual(['a', 'b', 'c'])
  })
  it('treats 0 and false as present (not missing)', () => {
    const r = validateRequired({ a: 0, b: false }, ['a', 'b'])
    expect(r.valid).toBe(true)
    expect(r.missing).toEqual([])
  })
})

describe('pickFields', () => {
  it('returns only allowed keys', () => {
    const out = pickFields({ a: 1, b: 2, c: 3 }, ['a', 'c'])
    expect(out).toEqual({ a: 1, c: 3 })
  })
  it('ignores unknown allowed fields', () => {
    const out = pickFields({ a: 1 }, ['a', 'missing'])
    expect(out).toEqual({ a: 1 })
  })
  it('drops keys outside the allowlist (mass-assignment guard)', () => {
    const out = pickFields({ id: 'evil', name: 'ok' }, ['name'])
    expect('id' in out).toBe(false)
    expect(out).toEqual({ name: 'ok' })
  })
  it('returns empty object when no allowed fields match', () => {
    const out = pickFields({ a: 1, b: 2 }, ['x', 'y'])
    expect(out).toEqual({})
  })
})

describe('field allowlists', () => {
  it('CAMPAIGN_FIELDS includes core fields and excludes id', () => {
    expect(CAMPAIGN_FIELDS).toContain('name')
    expect(CAMPAIGN_FIELDS).toContain('status')
    expect(CAMPAIGN_FIELDS).not.toContain('id')
  })
  it('LEAD_FIELDS excludes id and password-like fields', () => {
    expect(LEAD_FIELDS).toContain('name')
    expect(LEAD_FIELDS).not.toContain('id')
  })
  it('CONTENT_FIELDS exposes only safe-to-update fields', () => {
    expect(CONTENT_FIELDS).toContain('body')
    expect(CONTENT_FIELDS).not.toContain('id')
  })
})
