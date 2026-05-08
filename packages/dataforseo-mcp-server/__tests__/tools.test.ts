import { describe, it, expect } from 'vitest'
import { DFSClient } from '../src/client.js'

describe('DFSClient · constructor + cost estimator', () => {
  it('throws without login/password', () => {
    expect(() => new DFSClient({ login: '', password: 'x' })).toThrow()
    expect(() => new DFSClient({ login: 'x', password: '' })).toThrow()
  })
  it('estimates known operations', () => {
    const c = new DFSClient({ login: 'x', password: 'y' })
    expect(c.estimateCost('serp.google')).toBeGreaterThan(0)
    expect(c.estimateCost('search_volume')).toBeGreaterThan(0)
  })
  it('returns 0 for unknown operations', () => {
    const c = new DFSClient({ login: 'x', password: 'y' })
    expect(c.estimateCost('does.not.exist')).toBe(0)
  })
})
