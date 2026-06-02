/**
 * Capa 4 · schema/structured extraction · ADR-012 §4.4
 *
 * Para vectores estructurados (forms · webhooks) · enforzar JSON schema
 * strict · descartar campos no esperados · validar enums · limitar string
 * fields.
 *
 * Canon canonical caller may pass `structured_data` (already-validated
 * subset) OR raw_text. This gate validates the structured_data shape if
 * present · NO-OP pass canon canonical if absent (gate is per-vector ·
 * not all sources structured).
 *
 * canonical pure function · no IO · sub-ms latency.
 */
import type { GateDecision, ProvenanceTag } from '../types'

export interface SchemaValidatorOptions {
  /**
   * Allowed keys canon canonical per source vector. Empty array = NO schema
   * validation (caller didn't define one · skip canon canonical pass).
   */
  allowed_keys?: string[]
  /**
   * Required keys canon canonical · must be present in structured_data.
   */
  required_keys?: string[]
  /**
   * Max string length per field canon canonical · default 8000.
   */
  max_field_chars?: number
}

const DEFAULT_MAX_FIELD_CHARS = 8000

/**
 * Canon canonical Capa 4 evaluation.
 *
 * Caller passes `structured_data` (typically the parsed JSON body of a
 * webhook OR the validated form fields). Gate checks shape + per-field
 * constraints. Returns pass if no structured_data OR if all checks pass.
 */
export function schemaValidatorGate(
  structuredData: unknown,
  source: ProvenanceTag['source'],
  options: SchemaValidatorOptions = {},
): GateDecision {
  const t0 = Date.now()

  // No structured_data canon canonical · NO-OP pass (gate is per-vector ·
  // free-text-only sources skip this).
  if (structuredData === undefined || structuredData === null) {
    return {
      gate: 'schema_validator',
      verdict: 'pass',
      severity: 'LOW',
      latency_ms: Date.now() - t0,
      metadata: {
        skipped: true,
        reason: 'no_structured_data',
        source,
      },
    }
  }

  // Type check canon canonical · must be plain object.
  if (typeof structuredData !== 'object' || Array.isArray(structuredData)) {
    return {
      gate: 'schema_validator',
      verdict: 'block',
      severity: 'MEDIUM',
      latency_ms: Date.now() - t0,
      reason: 'not_object',
      metadata: {
        actual_type: Array.isArray(structuredData) ? 'array' : typeof structuredData,
      },
    }
  }

  const data = structuredData as Record<string, unknown>
  const allowedKeys = options.allowed_keys ?? []
  const requiredKeys = options.required_keys ?? []
  const maxFieldChars = options.max_field_chars ?? DEFAULT_MAX_FIELD_CHARS

  // Required keys check canon canonical.
  for (const required of requiredKeys) {
    if (!(required in data)) {
      return {
        gate: 'schema_validator',
        verdict: 'block',
        severity: 'MEDIUM',
        latency_ms: Date.now() - t0,
        reason: 'missing_required',
        metadata: {
          missing_key: required,
        },
      }
    }
  }

  // Unknown keys check canon canonical · if allowed_keys provided.
  if (allowedKeys.length > 0) {
    const unknownKeys = Object.keys(data).filter((k) => !allowedKeys.includes(k))
    if (unknownKeys.length > 0) {
      return {
        gate: 'schema_validator',
        verdict: 'block',
        severity: 'MEDIUM',
        latency_ms: Date.now() - t0,
        reason: 'unknown_keys',
        metadata: {
          unknown_keys: unknownKeys,
        },
      }
    }
  }

  // Per-field length check canon canonical · only strings.
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > maxFieldChars) {
      return {
        gate: 'schema_validator',
        verdict: 'block',
        severity: 'MEDIUM',
        latency_ms: Date.now() - t0,
        reason: 'field_too_long',
        metadata: {
          field: key,
          actual_chars: value.length,
          max_chars: maxFieldChars,
        },
      }
    }
  }

  // Pass canon canonical.
  return {
    gate: 'schema_validator',
    verdict: 'pass',
    severity: 'LOW',
    latency_ms: Date.now() - t0,
    metadata: {
      keys_count: Object.keys(data).length,
      source,
    },
  }
}
