/**
 * Canon canonical · envelope validation · pure functions · sala-ingress.
 *
 * §148 honest · this module is pure · cero IO · cero side effects.
 * Tests pass synthetic envelopes · no fixtures.
 */
import type { IngressEnvelope } from './types'

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly detail: string }

const SOURCE_RE = /^[a-z][a-z0-9_-]*(\/[a-z][a-z0-9_-]*)*$/i
const INTENT_RE = /^[a-z][a-z0-9_-]*$/i

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Canon canonical · parse the typed envelope from a raw POST body ·
 * returns either a validated envelope or a typed refuse code.
 */
export function parseIngressEnvelope(raw: unknown): ParseResult<IngressEnvelope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'body must be a JSON object',
    }
  }
  const r = raw as Record<string, unknown>

  if (!isNonEmptyString(r.source) || !SOURCE_RE.test(r.source)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail:
        'field "source" required · must match /^[a-z][a-z0-9_-]*(\\/[a-z][a-z0-9_-]*)*$/i',
    }
  }
  if (!isNonEmptyString(r.intent) || !INTENT_RE.test(r.intent)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "intent" required · must match /^[a-z][a-z0-9_-]*$/i',
    }
  }
  if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "payload" required · must be a JSON object',
    }
  }
  if (!isNonEmptyString(r.idempotency_key)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "idempotency_key" required · non-empty string',
    }
  }
  if (!isNonEmptyString(r.logical_period)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "logical_period" required · non-empty string',
    }
  }
  if (!isNonEmptyString(r.tenant_id)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "tenant_id" required · non-empty string',
    }
  }
  if (!isNonEmptyString(r.client_id)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "client_id" required · non-empty string',
    }
  }
  if (
    r.correlation_id !== undefined &&
    !isNonEmptyString(r.correlation_id)
  ) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "correlation_id" optional · MUST be non-empty string if present',
    }
  }
  if (r.stream_id !== undefined && !isNonEmptyString(r.stream_id)) {
    return {
      ok: false,
      code: 'invalid_envelope',
      detail: 'field "stream_id" optional · MUST be non-empty string if present',
    }
  }

  return {
    ok: true,
    value: {
      source: r.source,
      intent: r.intent,
      payload: r.payload as Record<string, unknown>,
      idempotency_key: r.idempotency_key,
      logical_period: r.logical_period,
      tenant_id: r.tenant_id,
      client_id: r.client_id,
      ...(isNonEmptyString(r.correlation_id) ? { correlation_id: r.correlation_id } : {}),
      ...(isNonEmptyString(r.stream_id) ? { stream_id: r.stream_id } : {}),
    },
  }
}
