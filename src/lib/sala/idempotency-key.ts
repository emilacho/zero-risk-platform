/**
 * IdempotencyKeyDeriver · canonical pure implementation.
 *
 * SINGLE source of idempotency key computation for the Sala. Lives in
 * OUR layer — deliberately separated from any executor implementation
 * so that swapping the executor cannot change the hashing behaviour.
 * If this function changes, every caller is affected uniformly.
 *
 * Algorithm · SHA-256 of `"{operationType}|{clientId}|{kind}:{value}"`,
 * hex-encoded, branded as `IdempotencyKey`. The `logicalPeriod`
 * discriminated union (Opus #7 Q5 freeze) is serialised as
 * `"{kind}:{value}"` for hashing; the `note` field on the `custom`
 * variant is METADATA and is deliberately excluded from the canonical
 * string · two `custom` periods with the same value but different
 * notes collapse to the SAME key (notes are for review, not identity).
 *
 * Properties guaranteed ·
 * - Deterministic · same inputs → same key, across processes, deploys,
 *   machines, and node versions.
 * - Collision-resistant · 256-bit hash space.
 * - Business-identity collapsing · two triggers with the same logical
 *   operation on the same client in the same logical period (same
 *   kind + same value) collapse to the same key, even if they came
 *   from different execution_ids or wall-clock timestamps (this is
 *   the property that prevents the 24-may daemon-burst class of bug ·
 *   per-poll execution_id ids never collapsed; business-identity
 *   keys DO).
 * - Kind-discrimination · two periods with the same `value` but
 *   different `kind` produce DIFFERENT keys · so `iso_week "2026-W23"`
 *   does not accidentally collapse with `custom "2026-W23"`.
 * - Vendor-neutral · zero coupling to any durable runtime.
 *
 * Spec source ·
 *   ADR-009 Q2 ronda 1 (Opus 4.8 MAXX · "clave de NEGOCIO, no técnica")
 *   src/lib/sala/executor-contract.ts §1 (IdempotencyKey brand)
 *   src/lib/sala/executor-contract.ts §4 (LogicalPeriod union · Q5 freeze)
 *   src/lib/sala/executor-contract.ts §9 (IdempotencyKeyDeriver interface)
 */
import { createHash } from 'node:crypto'
import type {
  IdempotencyKey,
  IdempotencyKeyDeriver,
  LogicalPeriod,
} from './executor-contract'

/** Serialise a LogicalPeriod to its canonical hash segment.
 *
 *  Format · `"{kind}:{value}"` · the `note` field on `custom` is
 *  deliberately excluded · it is metadata-for-review, not part of the
 *  identity.
 *
 *  Exported for tests · production code uses `deriveIdempotencyKey`
 *  directly. */
export function serializeLogicalPeriod(p: LogicalPeriod): string {
  // The discriminated union is exhaustive · TypeScript verifies all
  // kinds are handled at compile time. We project ONLY kind + value
  // into the hashed string (note on custom is dropped).
  return `${p.kind}:${p.value}`
}

/** Pure derive function · zero IO, zero state. */
export function deriveIdempotencyKey(parts: {
  readonly operationType: string
  readonly clientId: string
  readonly logicalPeriod: LogicalPeriod
}): IdempotencyKey {
  const periodSegment = serializeLogicalPeriod(parts.logicalPeriod)
  const canonical = `${parts.operationType}|${parts.clientId}|${periodSegment}`
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return digest as IdempotencyKey
}

/** Canonical singleton implementation of the deriver interface.
 *  Production code binds this; tests may swap in a stub deriver that
 *  returns deterministic non-hash keys for readability in trace
 *  output. */
export const canonicalIdempotencyKeyDeriver: IdempotencyKeyDeriver = {
  derive: deriveIdempotencyKey,
}
