import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler, argsSchema } from '../src/tools/ghl-create-contact.js'
import type { GHLClient } from '../src/client.js'

describe('ghl_create_contact · args validation', () => {
  it('accepts a minimum-viable contact with email', () => {
    expect(() => argsSchema.parse({ firstName: 'Jane', email: 'a@b.co' })).not.toThrow()
  })

  it('rejects empty firstName', () => {
    expect(() => argsSchema.parse({ firstName: '', email: 'a@b.co' })).toThrow()
  })

  it('rejects malformed email', () => {
    expect(() => argsSchema.parse({ firstName: 'X', email: 'not-an-email' })).toThrow()
  })

  it('caps tags array length', () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `t${i}`)
    expect(() => argsSchema.parse({ firstName: 'X', email: 'a@b.co', tags: tooMany })).toThrow()
  })
})

describe('ghl_create_contact · handler', () => {
  let client: GHLClient
  let postSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postSpy = vi.fn().mockResolvedValue({ contact: { id: 'c_new', firstName: 'Jane' } })
    client = { post: postSpy } as unknown as GHLClient
  })

  it('throws when both email and phone are missing', async () => {
    await expect(handler(client, { firstName: 'Jane' })).rejects.toThrow(/email or phone/)
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('accepts contact with only phone (no email)', async () => {
    await handler(client, { firstName: 'Jane', phone: '+593987654321' })
    expect(postSpy).toHaveBeenCalledOnce()
    const [path, body] = postSpy.mock.calls[0]
    expect(path).toBe('/contacts/')
    expect(body).toEqual({ firstName: 'Jane', phone: '+593987654321' })
  })

  it('passes the validated args through to POST /contacts/', async () => {
    await handler(client, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      tags: ['hot-lead'],
    })
    const [, body] = postSpy.mock.calls[0]
    expect(body).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      tags: ['hot-lead'],
    })
  })

  it('returns the response unchanged', async () => {
    const result = await handler(client, { firstName: 'Jane', email: 'a@b.co' })
    expect(result).toEqual({ contact: { id: 'c_new', firstName: 'Jane' } })
  })
})
