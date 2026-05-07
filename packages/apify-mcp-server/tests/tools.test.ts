import { describe, it, expect } from 'vitest'
import { ApifyClient } from '../src/client.js'

describe('ApifyClient · constructor', () => {
  it('throws without token', () => {
    expect(() => new ApifyClient({ token: '' })).toThrow(/token/)
  })
  it('accepts a valid token', () => {
    expect(() => new ApifyClient({ token: 'abc123' })).not.toThrow()
  })
})
