import { describe, it, expect } from 'vitest'
import { HiggsfieldClient } from '../src/client.js'

describe('HiggsfieldClient · constructor', () => {
  it('throws without apiKey', () => {
    expect(() => new HiggsfieldClient({ apiKey: '' })).toThrow(/apiKey/)
  })
  it('accepts a valid apiKey', () => {
    const c = new HiggsfieldClient({ apiKey: 'k' })
    expect(c.webhookUrl).toBeNull()
  })
  it('captures webhookUrl when supplied', () => {
    const c = new HiggsfieldClient({ apiKey: 'k', webhookUrl: 'https://example.com/hook' })
    expect(c.webhookUrl).toBe('https://example.com/hook')
  })
})
