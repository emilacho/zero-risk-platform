/**
 * Google service-account auth · mint an OAuth2 access token from a service
 * account JSON using a signed JWT (RS256). Zero external deps · node crypto.
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_JSON (the full service-account key JSON string).
 * Credential path verified 2026-07-02 (CC#3): JWT → token → Drive GET Cuentas
 * 200 · canAddChildren+canEdit true.
 */
import crypto from 'node:crypto'

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

export const GOOGLE_SLIDES_SCOPES =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/presentations'

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** Parse GOOGLE_SERVICE_ACCOUNT_JSON · throws a clear error if absent/invalid. */
export function loadServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  let sa: ServiceAccount
  try {
    sa = JSON.parse(raw) as ServiceAccount
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (!sa.client_email || !sa.private_key)
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key')
  return sa
}

/** Build the signed JWT assertion for the token exchange. */
export function buildAssertion(
  sa: ServiceAccount,
  scope: string,
  nowSec: number,
): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  )
  const signingInput = `${header}.${claim}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${signingInput}.${signature}`
}

/**
 * Exchange the service account for an OAuth2 access token.
 * `fetchImpl` + `nowSec` are injectable for tests.
 */
export async function mintGoogleAccessToken(
  saRaw: string | undefined,
  opts: { scope?: string; fetchImpl?: typeof fetch; nowSec?: number } = {},
): Promise<string> {
  const sa = loadServiceAccount(saRaw)
  const scope = opts.scope ?? GOOGLE_SLIDES_SCOPES
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const fetchImpl = opts.fetchImpl ?? fetch
  const assertion = buildAssertion(sa, scope, nowSec)
  const res = await fetchImpl(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token)
    throw new Error(
      `google token exchange failed (${res.status}): ${json.error ?? ''} ${json.error_description ?? ''}`.trim(),
    )
  return json.access_token
}
