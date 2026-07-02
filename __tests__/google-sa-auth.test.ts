/**
 * Tests · Google service-account JWT auth (google-sa-auth.ts).
 * Generates an ephemeral RSA keypair so buildAssertion actually signs.
 */
import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import {
  loadServiceAccount,
  buildAssertion,
  mintGoogleAccessToken,
} from '../src/lib/google-sa-auth'

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const sa = {
  client_email: 'zero-risk-slides@naufrago-auth.iam.gserviceaccount.com',
  private_key: privateKey,
  token_uri: 'https://oauth2.googleapis.com/token',
}
const saJson = JSON.stringify(sa)

describe('loadServiceAccount', () => {
  it('throws when absent / invalid / incomplete', () => {
    expect(() => loadServiceAccount(undefined)).toThrow(/not configured/)
    expect(() => loadServiceAccount('{bad json')).toThrow(/not valid JSON/)
    expect(() => loadServiceAccount('{}')).toThrow(/missing client_email/)
  })
  it('parses a valid service account', () => {
    expect(loadServiceAccount(saJson).client_email).toContain('zero-risk-slides')
  })
})

describe('buildAssertion', () => {
  it('produces a 3-part JWT with correct header + claim', () => {
    const jwt = buildAssertion(sa, 'scope-x', 1_000_000)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    const claim = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    expect(header.alg).toBe('RS256')
    expect(claim.iss).toBe(sa.client_email)
    expect(claim.scope).toBe('scope-x')
    expect(claim.iat).toBe(1_000_000)
    expect(claim.exp).toBe(1_000_000 + 3600)
    expect(parts[2].length).toBeGreaterThan(0)
  })
})

describe('mintGoogleAccessToken', () => {
  it('exchanges the JWT for an access token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'ya29.TEST', expires_in: 3600 }),
    })) as unknown as typeof fetch
    const tok = await mintGoogleAccessToken(saJson, { fetchImpl: fetchMock, nowSec: 1_000_000 })
    expect(tok).toBe('ya29.TEST')
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(String(init.body)).toContain('grant_type=urn')
  })

  it('throws on token error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant', error_description: 'bad' }),
    })) as unknown as typeof fetch
    await expect(
      mintGoogleAccessToken(saJson, { fetchImpl: fetchMock, nowSec: 1 }),
    ).rejects.toThrow(/token exchange failed/)
  })
})
