/**
 * Canon canonical · sala-hitl-bridge · Sprint 12 Fase 0 escalón 5 prep.
 *
 * Pure helpers that bridge between the n8n MC inbox surface and the
 * sala-canon `RealSalaIntegration.resolveGate()` method (PR #161 Track T).
 *
 * §148 honest · this lib is PURE · cero IO · cero side effects. The
 * endpoint `/api/sala/hitl/resolve` composes these helpers with the
 * Supabase storage + RealSalaIntegration instance. Tests cover the
 * pure helpers directly · the endpoint exercises the composition.
 *
 * Default-OFF · `isHitlResolveEnabled()` reads `SALA_HITL_RESOLVE_ENABLED`
 * which must be explicitly set to `"true"` for the endpoint to accept
 * requests (canon §144 · shadow gate). Tests inject the flag value.
 */

// =====================================================================
// Feature flag canon · SALA_HITL_RESOLVE_ENABLED
// =====================================================================

export interface HitlResolveFlagInput {
  /** Force the enabled flag · overrides env. Tests use this. */
  readonly enabled?: boolean
}

/** Canon canonical · whether the `/api/sala/hitl/resolve` endpoint is
 *  enabled in the current process. Default-OFF (canon §144 shadow gate).
 *  Tests pass `{enabled: true}` to short-circuit env reading. */
export function isHitlResolveEnabled(input: HitlResolveFlagInput = {}): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_HITL_RESOLVE_ENABLED === 'true'
}

// =====================================================================
// Body shapes · sala-native + n8n MC inbox bridge
// =====================================================================

/**
 * Canon canonical · sala-native body shape · the direct surface a
 * sala-aware caller (dashboard UI · sala-side workflow) POSTs to the
 * endpoint. Maps 1:1 to `ResolveGateInput` (the dominio method on
 * `RealSalaIntegration`).
 */
export interface SalaNativeResolveBody {
  readonly source: 'sala'
  readonly tenant_id: string
  readonly stream_id: string
  readonly gate_event_id: string
  readonly outcome: 'approved' | 'rejected'
  readonly resolved_by?: string
  readonly payload?: Record<string, unknown>
}

/**
 * Canon canonical · n8n MC inbox bridge body shape · matches the
 * existing `/api/hitl/resolve` legacy contract (used by MC inbox
 * dashboard "Approve/Reject" button + n8n HITL workflow), extended with
 * `gate_event_id` so the bridge can route to sala without depending on
 * the legacy `pipeline_steps.id → gate_event_id` lookup table that does
 * not exist yet.
 *
 * The bridge accepts `decision: "approved" | "rejected" | "edited"`
 * for parity with legacy MC inbox (which has an "edited" path · we
 * normalize "edited" → "approved" because in the sala model the edit
 * happens via a separate artifact write, NOT via the gate resolution).
 */
export interface N8nMCInboxResolveBody {
  readonly source: 'n8n-mc-inbox'
  readonly tenant_id: string
  readonly stream_id: string
  readonly gate_event_id: string
  readonly decision: 'approved' | 'rejected' | 'edited'
  readonly feedback?: string
  readonly edited_content?: string
  readonly reviewer?: string
}

/** Canon canonical · discriminated union of accepted body shapes. */
export type HitlResolveBody = SalaNativeResolveBody | N8nMCInboxResolveBody

/**
 * Canon canonical · validate + normalize the incoming body into the
 * sala-domain `ResolveGateInput` shape (1:1 with the resolveGate
 * argument). Returns either a normalized payload OR a typed error
 * the route can map to a 400 response.
 *
 * §148 honest · NO side effects · pure validator + mapper. The
 * endpoint composes this with the actual Supabase storage + harness
 * call.
 */
export type NormalizedResolveInput = {
  readonly tenant_id: string
  readonly stream_id: string
  readonly gate_event_id: string
  readonly outcome: 'approved' | 'rejected'
  readonly resolved_by: string
  readonly payload: Record<string, unknown>
}

export type ParseResult =
  | { readonly ok: true; readonly value: NormalizedResolveInput }
  | { readonly ok: false; readonly reason: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}
function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0
}

export function parseHitlResolveBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'body must be a JSON object' }
  }
  const body = raw as Record<string, unknown>
  const source = body.source
  if (source !== 'sala' && source !== 'n8n-mc-inbox') {
    return {
      ok: false,
      reason: `field "source" must be "sala" or "n8n-mc-inbox" (got ${JSON.stringify(source)})`,
    }
  }

  if (!isUUID(body.tenant_id)) {
    return { ok: false, reason: 'field "tenant_id" must be a UUID' }
  }
  if (!isNonEmptyString(body.stream_id)) {
    return { ok: false, reason: 'field "stream_id" must be a non-empty string' }
  }
  if (!isUUID(body.gate_event_id)) {
    return { ok: false, reason: 'field "gate_event_id" must be a UUID' }
  }

  if (source === 'sala') {
    const outcome = body.outcome
    if (outcome !== 'approved' && outcome !== 'rejected') {
      return {
        ok: false,
        reason: 'field "outcome" must be "approved" or "rejected"',
      }
    }
    const resolved_by =
      typeof body.resolved_by === 'string' && body.resolved_by.length > 0
        ? body.resolved_by
        : 'sala:unknown'
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : {}
    return {
      ok: true,
      value: {
        tenant_id: body.tenant_id,
        stream_id: body.stream_id,
        gate_event_id: body.gate_event_id,
        outcome,
        resolved_by,
        payload,
      },
    }
  }

  // source === 'n8n-mc-inbox'
  const decision = body.decision
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'edited') {
    return {
      ok: false,
      reason: 'field "decision" must be "approved" · "rejected" · or "edited"',
    }
  }
  // Canon canonical · n8n "edited" maps to approved in the sala model.
  // The edit lives in a separate artifact write · NOT in the gate
  // resolution. The reviewer's edit is carried in the payload so the
  // audit trail is preserved.
  const outcome: 'approved' | 'rejected' = decision === 'rejected' ? 'rejected' : 'approved'
  const resolved_by =
    typeof body.reviewer === 'string' && body.reviewer.length > 0
      ? body.reviewer
      : 'mc-inbox:unknown'
  const payload: Record<string, unknown> = {
    source: 'n8n-mc-inbox',
    decision,
    ...(typeof body.feedback === 'string' && body.feedback.length > 0
      ? { feedback: body.feedback }
      : {}),
    ...(typeof body.edited_content === 'string' && body.edited_content.length > 0
      ? { edited_content: body.edited_content }
      : {}),
  }
  return {
    ok: true,
    value: {
      tenant_id: body.tenant_id,
      stream_id: body.stream_id,
      gate_event_id: body.gate_event_id,
      outcome,
      resolved_by,
      payload,
    },
  }
}
