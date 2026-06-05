/**
 * Canon canonical · per-source auth · sala-ingress · 3 tiers.
 *
 * Opus VEREDICTO §4 · 3 tiers + scope · ADR-012 auto-enable por-tier ·
 *   - tier A · internal_key (Emilio MC · cron · trusted internal)
 *   - tier B · hmac signature (partner CRM · medium ADR-012 enabled · future)
 *   - tier C · public_gate (full ADR-012 + rate-limit · NOT implemented in this PR · refused)
 *
 * §148 honest · pure functions · cero IO · tests inject explicit secrets.
 */
import crypto from 'node:crypto'
import type { IngressAuthRequest, IngressSource } from './types'

export type AuthDecision =
  | { readonly ok: true; readonly tier: IngressSource['tier']; readonly method: IngressSource['auth_method'] }
  | { readonly ok: false; readonly reason: string }

export interface AuthCheckInput {
  readonly source: IngressSource
  readonly request: IngressAuthRequest
  /** Optional · override the secret value (tests use this). Production
   *  reads from process.env[source.auth_secret_env_var]. */
  readonly secret_value?: string
  /** Optional · clock for HMAC timestamp window check (tests inject). */
  readonly now_ms?: number
  /** Optional · timestamp window (ms) · default 5 minutes · matches Slack/
   *  GitHub HMAC conventions. */
  readonly window_ms?: number
}

/**
 * Canon canonical · per-source auth check · returns typed decision.
 * Each tier's branch handles its own auth shape independently · cero
 * fall-through · cero implicit accept.
 */
export function checkSourceAuth(input: AuthCheckInput): AuthDecision {
  const { source, request } = input

  if (source.tier === 'A' && source.auth_method === 'internal_key') {
    const expected =
      input.secret_value ?? process.env.INTERNAL_API_KEY ?? ''
    if (!expected) {
      return { ok: false, reason: 'internal_key tier · server INTERNAL_API_KEY not set' }
    }
    const got = request.internal_key ?? ''
    if (!got) {
      return { ok: false, reason: 'internal_key tier · missing x-api-key header' }
    }
    if (!timingSafeEqualStr(got, expected)) {
      return { ok: false, reason: 'internal_key tier · invalid x-api-key' }
    }
    return { ok: true, tier: 'A', method: 'internal_key' }
  }

  if (source.tier === 'B' && source.auth_method === 'hmac') {
    const envVar = source.auth_secret_env_var
    if (!envVar) {
      return { ok: false, reason: 'hmac tier · source has no auth_secret_env_var · misconfig' }
    }
    const secret = input.secret_value ?? process.env[envVar] ?? ''
    if (!secret) {
      return { ok: false, reason: `hmac tier · server secret ${envVar} not set` }
    }
    const signature = request.signature ?? ''
    if (!signature) {
      return { ok: false, reason: 'hmac tier · missing x-source-signature header' }
    }
    const timestamp = request.timestamp ?? ''
    if (!timestamp) {
      return { ok: false, reason: 'hmac tier · missing x-source-timestamp header' }
    }
    const tsMs = Number.parseInt(timestamp, 10) * 1000
    if (!Number.isFinite(tsMs)) {
      return { ok: false, reason: 'hmac tier · x-source-timestamp must be unix seconds integer' }
    }
    const now = input.now_ms ?? Date.now()
    const window = input.window_ms ?? 5 * 60 * 1000
    if (Math.abs(now - tsMs) > window) {
      return { ok: false, reason: `hmac tier · timestamp outside ${window / 1000}s window` }
    }
    if (!request.raw_body) {
      return { ok: false, reason: 'hmac tier · raw_body required for signature recompute' }
    }
    const expected = computeHmac(secret, timestamp, request.raw_body)
    if (!timingSafeEqualStr(signature, expected)) {
      return { ok: false, reason: 'hmac tier · invalid signature' }
    }
    return { ok: true, tier: 'B', method: 'hmac' }
  }

  if (source.tier === 'C' && source.auth_method === 'public_gate') {
    // Canon canonical · tier C requires ADR-012 full filter · rate-limit ·
    // captcha/gate · NOT IMPLEMENTED in this PR (Opus VEREDICTO §5 build
    // mínimo · solo 1 regla seed Náufrago tier B). The endpoint refuses
    // tier C with this code so the gap is visible.
    return {
      ok: false,
      reason: 'tier_c_filter_not_implemented · ADR-012 full gate pending · canon §144',
    }
  }

  return { ok: false, reason: `unsupported tier/method combination · ${source.tier}/${source.auth_method}` }
}

/**
 * Canon canonical · HMAC SHA-256 over `timestamp.raw_body` · `sha256=<hex>`
 * prefix matches the Slack convention. Constant function · easy to mirror
 * in shell scripts + n8n nodes that produce the signature.
 */
export function computeHmac(secret: string, timestamp: string, raw_body: string): string {
  const base = `${timestamp}.${raw_body}`
  const h = crypto.createHmac('sha256', secret)
  h.update(base)
  return `sha256=${h.digest('hex')}`
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
