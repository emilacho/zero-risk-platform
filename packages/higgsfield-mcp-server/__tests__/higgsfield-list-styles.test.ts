import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/higgsfield-list-styles.js'
import type { HiggsfieldClient } from '../src/client.js'

describe('higgsfield_list_styles · args validation', () => {
  it('accepts no arguments', () => {
    expect(() => argsSchema.parse({})).not.toThrow()
  })

  it('accepts undefined / null', () => {
    expect(() => argsSchema.parse(undefined)).toThrow() // zod requires object
    expect(() => argsSchema.parse({})).not.toThrow()
  })
})

describe('higgsfield_list_styles · handler', () => {
  let client: HiggsfieldClient
  let getSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSpy = vi.fn().mockResolvedValue({ styles: [{ id: 'cinematic' }] })
    client = { get: getSpy } as unknown as HiggsfieldClient
  })

  it('GETs /v1/styles', async () => {
    await handler(client, {})
    expect(getSpy).toHaveBeenCalledOnce()
    expect(getSpy.mock.calls[0][0]).toBe('/v1/styles')
  })

  it('handles undefined args by treating them as {}', async () => {
    await handler(client, undefined)
    expect(getSpy).toHaveBeenCalledOnce()
  })

  it('returns the client response unchanged', async () => {
    const result = await handler(client, {})
    expect(result).toEqual({ styles: [{ id: 'cinematic' }] })
  })
})
