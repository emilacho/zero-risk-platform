/**
 * Canonical idempotency key builder · ADR-009 §flag #1
 *
 * Canon canonical · hash of {operation_type + client_id + logical_period
 * [+ input_hash]}. The daemon $19 case (mismo trabajo, distintos
 * execution_id) collapses to the same key via this canonical builder ·
 * UNIQUE(idempotency_key) en DB = the actual dedup.
 *
 * Per ADR-009 ronda 3 spec §flag #1:
 *   - `input_hash` is OPTIONAL (operations canon canonical-identified by
 *     {op + client + period} are sufficient · canon canonical-explicit
 *     content-aware ops add input_hash for content-level dedup)
 *   - logical_period is the period/cause that scopes the operation ·
 *     canon canonical canonical "weekly_report_2026-W23" or "campaign_X_phase_1"
 *
 * Hash · SHA-256 hex · canon canonical 64-char output · canonical canon canon
 * cryptographic strength is canon canonical-overkill for dedup but matches
 * existing canon canonical-repo patterns (canon canonical canon-pglib uses
 * sha256 for content hashing).
 */
import { createHash } from 'node:crypto'

/**
 * Canon canonical input for the idempotency key builder · 3 required + 1 optional.
 */
export interface IdempotencyKeyInput {
  /** Canon canonical · business operation · canon canonical "weekly_report" · "send_email" */
  operation_type: string
  /** Canon canonical · business entity · canon canonical UUID o slug */
  client_id: string
  /** Canon canonical · period/cause scoping the op · canon canonical "2026-W23" · "campaign_X_phase_1" */
  logical_period: string
  /** Canon canonical · optional content-hash · canon canonical content-level dedup ON TOP of {op+client+period} */
  input_hash?: string | null
}

/**
 * Canon canonical · build a stable idempotency key.
 *
 * Format · `<operation_type>::<client_id>::<logical_period>[::<input_hash>]`
 * then SHA-256 hex. Stable, sortable, reproducible. Two callers passing
 * the same inputs canon canonical-always produce the same key.
 *
 * Canon canonical NULL or empty `input_hash` is omitted (NOT included as
 * literal "null" string) · canon canonical-keeps op-level dedup stable even
 * as some callers later add content awareness.
 *
 * Throws on missing required fields (canon canonical canon-safety · the
 * key is a DB UNIQUE constraint · canon canonical-an empty key would
 * collapse all events that omit it · canon canonical-explicit failure
 * better than silent collision).
 */
export function buildIdempotencyKey(input: IdempotencyKeyInput): string {
  if (!input.operation_type || typeof input.operation_type !== 'string') {
    throw new Error('buildIdempotencyKey · operation_type required')
  }
  if (!input.client_id || typeof input.client_id !== 'string') {
    throw new Error('buildIdempotencyKey · client_id required')
  }
  if (!input.logical_period || typeof input.logical_period !== 'string') {
    throw new Error('buildIdempotencyKey · logical_period required')
  }

  const parts = [input.operation_type, input.client_id, input.logical_period]
  if (input.input_hash && typeof input.input_hash === 'string' && input.input_hash.length > 0) {
    parts.push(input.input_hash)
  }

  const joined = parts.join('::')
  return createHash('sha256').update(joined).digest('hex')
}

/**
 * Canon canonical · hash arbitrary input content into a stable `input_hash`
 * suitable for `buildIdempotencyKey({input_hash})`. Canon canonical
 * canonical-stringified-deterministic JSON · then SHA-256 hex.
 *
 * Pass any serializable value (object · array · string · number).
 */
export function hashInputContent(content: unknown): string {
  const canonical = canonicalStringify(content)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Canon canonical · deterministic JSON.stringify (canon canonical sorted keys)
 * so {a:1, b:2} and {b:2, a:1} produce the same hash. Required for stable
 * `input_hash` across callers that may serialize in different orders.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']'
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  const parts = sorted.map(
    (k) => JSON.stringify(k) + ':' + canonicalStringify((value as Record<string, unknown>)[k]),
  )
  return '{' + parts.join(',') + '}'
}
