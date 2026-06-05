/**
 * Canon canonical · Model B webhook receiver helpers · Costura A closure 2026-06-05.
 *
 * Shared logic for `/api/sala/ingress` (phase_boundary events) and
 * `/api/sala/callback` (run_completed events) · these endpoints
 * receive CC#4's n8n worker callbacks. Per MODELB-ADAPTER contract
 * §3.1 · both endpoints MUST ·
 *   - validate `x-api-key` against per-endpoint env var
 *     (SALA_INGRESS_API_KEY · SALA_CALLBACK_API_KEY) with fallback
 *     to INTERNAL_API_KEY (canon dual-auth pattern)
 *   - return 200 ALWAYS · `{ok: true, event_id}` or `{ok: false, code}`
 *   - dedup based on the endpoint-specific key set
 *   - never throw 5xx · the worker treats non-2xx as failure but
 *     CC#4 set `neverError: true` so the worker doesn't break
 *
 * §148 honest · this module is PURE helpers · cero IO direct ·
 * compose with `SupabaseEventLogStorage` + `postReconciliationAlert`
 * at the route level. Tests mock storage + auth as usual.
 */
import crypto from 'node:crypto'

/** Canon canonical · auth result for the receiver endpoints. */
export type SalaWebhookAuthResult =
  | { readonly ok: true; readonly via: 'dedicated' | 'fallback' }
  | { readonly ok: false; readonly reason: string }

/** Canon canonical · validate `x-api-key` header against the named env
 *  var with fallback to `INTERNAL_API_KEY`. Timing-safe comparison.
 *  Tests inject `dedicated_key_value` to bypass env reading. */
export interface SalaWebhookAuthInput {
  readonly request: Request
  readonly dedicated_env_var: string
  /** Tests inject explicit values to skip env lookup. */
  readonly dedicated_key_value?: string
  readonly internal_key_value?: string
}

export function checkSalaWebhookAuth(input: SalaWebhookAuthInput): SalaWebhookAuthResult {
  const got = input.request.headers.get('x-api-key') ?? ''
  if (!got) return { ok: false, reason: 'missing x-api-key header' }

  const dedicated =
    input.dedicated_key_value ?? process.env[input.dedicated_env_var] ?? ''
  if (dedicated) {
    if (timingSafeEqual(got, dedicated)) return { ok: true, via: 'dedicated' }
  }
  const internal = input.internal_key_value ?? process.env.INTERNAL_API_KEY ?? ''
  if (internal) {
    if (timingSafeEqual(got, internal)) return { ok: true, via: 'fallback' }
  }
  return { ok: false, reason: 'invalid x-api-key' }
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// =====================================================================
// Body shapes per CC#4 contract spec §2.2 + §2.3
// =====================================================================

/** Canon canonical · ingress body shape per contract §2.2. */
export interface IngressBody {
  readonly event_type: 'phase_boundary'
  readonly _sala_correlation_id: string
  readonly _journey_id: string
  readonly phase_name: string
  readonly phase_state: 'started' | 'completed'
  readonly worker_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly ts: string
}

/** Canon canonical · callback body shape per contract §2.3. */
export interface CallbackBody {
  readonly event_type: 'run_completed'
  readonly _sala_correlation_id: string
  readonly _journey_id: string
  readonly worker_id: string
  readonly worker_name?: string
  readonly tenant_id: string
  readonly client_id: string
  readonly summary?: Record<string, unknown>
  readonly ts: string
}

/** Canon canonical · parsed body OR typed error. */
export type ParsedBody<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly detail: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0
}
function isUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

export function parseIngressBody(raw: unknown): ParsedBody<IngressBody> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'invalid_body', detail: 'body must be JSON object' }
  }
  const r = raw as Record<string, unknown>
  if (r.event_type !== 'phase_boundary') {
    return {
      ok: false,
      code: 'invalid_event_type',
      detail: `event_type must be "phase_boundary" (got ${JSON.stringify(r.event_type)})`,
    }
  }
  if (!isNonEmptyString(r._sala_correlation_id)) {
    return { ok: false, code: 'invalid_body', detail: '_sala_correlation_id required' }
  }
  if (!isNonEmptyString(r._journey_id)) {
    return { ok: false, code: 'invalid_body', detail: '_journey_id required' }
  }
  if (!isNonEmptyString(r.phase_name)) {
    return { ok: false, code: 'invalid_body', detail: 'phase_name required' }
  }
  if (r.phase_state !== 'started' && r.phase_state !== 'completed') {
    return {
      ok: false,
      code: 'invalid_body',
      detail: 'phase_state must be "started" or "completed"',
    }
  }
  if (!isNonEmptyString(r.worker_id)) {
    return { ok: false, code: 'invalid_body', detail: 'worker_id required' }
  }
  if (!isUUID(r.tenant_id)) {
    return { ok: false, code: 'invalid_body', detail: 'tenant_id must be UUID' }
  }
  if (!isNonEmptyString(r.client_id)) {
    return { ok: false, code: 'invalid_body', detail: 'client_id required' }
  }
  if (!isNonEmptyString(r.ts)) {
    return { ok: false, code: 'invalid_body', detail: 'ts required' }
  }
  return {
    ok: true,
    value: {
      event_type: 'phase_boundary',
      _sala_correlation_id: r._sala_correlation_id,
      _journey_id: r._journey_id,
      phase_name: r.phase_name,
      phase_state: r.phase_state,
      worker_id: r.worker_id,
      tenant_id: r.tenant_id,
      client_id: r.client_id,
      ts: r.ts,
    },
  }
}

export function parseCallbackBody(raw: unknown): ParsedBody<CallbackBody> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'invalid_body', detail: 'body must be JSON object' }
  }
  const r = raw as Record<string, unknown>
  if (r.event_type !== 'run_completed') {
    return {
      ok: false,
      code: 'invalid_event_type',
      detail: `event_type must be "run_completed" (got ${JSON.stringify(r.event_type)})`,
    }
  }
  if (!isNonEmptyString(r._sala_correlation_id)) {
    return { ok: false, code: 'invalid_body', detail: '_sala_correlation_id required' }
  }
  if (!isNonEmptyString(r._journey_id)) {
    return { ok: false, code: 'invalid_body', detail: '_journey_id required' }
  }
  if (!isNonEmptyString(r.worker_id)) {
    return { ok: false, code: 'invalid_body', detail: 'worker_id required' }
  }
  if (!isUUID(r.tenant_id)) {
    return { ok: false, code: 'invalid_body', detail: 'tenant_id must be UUID' }
  }
  if (!isNonEmptyString(r.client_id)) {
    return { ok: false, code: 'invalid_body', detail: 'client_id required' }
  }
  if (!isNonEmptyString(r.ts)) {
    return { ok: false, code: 'invalid_body', detail: 'ts required' }
  }
  return {
    ok: true,
    value: {
      event_type: 'run_completed',
      _sala_correlation_id: r._sala_correlation_id,
      _journey_id: r._journey_id,
      worker_id: r.worker_id,
      worker_name: isNonEmptyString(r.worker_name) ? r.worker_name : undefined,
      tenant_id: r.tenant_id,
      client_id: r.client_id,
      summary:
        r.summary && typeof r.summary === 'object'
          ? (r.summary as Record<string, unknown>)
          : undefined,
      ts: r.ts,
    },
  }
}

// =====================================================================
// Idempotency keys per contract §3.1 dedup
// =====================================================================

/** Canon canonical · ingress dedup key per contract §3.1.a ·
 *  `(correlation_id, phase_name, phase_state)`. */
export function buildIngressIdempotencyOperationType(body: {
  phase_name: string
  phase_state: string
}): string {
  return `sala-ingress.${body.phase_name}.${body.phase_state}`
}

/** Canon canonical · callback dedup key per contract §3.1.b ·
 *  `_sala_correlation_id` unique · 1 run completed = 1 callback ever. */
export function buildCallbackIdempotencyOperationType(): string {
  return 'sala-callback.run_completed'
}
