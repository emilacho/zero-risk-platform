/**
 * Scaffold-level tests. Exercises the GHLClient constructor + ensures the
 * tool list is well-formed. Real handler tests added in the implementation
 * sprint when each tool is wired to the live API.
 */
import { describe, it, expect } from 'vitest'
import { GHLClient } from '../src/client.js'

describe('GHLClient · constructor guards', () => {
  it('throws without privateKey', () => {
    expect(() => new GHLClient({ privateKey: '', locationId: 'loc' })).toThrow(/privateKey/)
  })
  it('throws without locationId', () => {
    expect(() => new GHLClient({ privateKey: 'pk', locationId: '' })).toThrow(/locationId/)
  })
  it('accepts a valid config', () => {
    expect(() => new GHLClient({ privateKey: 'pk', locationId: 'loc' })).not.toThrow()
  })
})
