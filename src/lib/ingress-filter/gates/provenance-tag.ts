/**
 * Capa 1 · provenance tagging (structural isolation · spotlighting) · ADR-012 §4.1
 *
 * Wraps remaining payload con marcadores únicos session-randomized + emits
 * the canonical ProvenanceTag that downstream consumers (event log writer ·
 * Brain ingest · agent invocation) read.
 *
 * § COSTURA EXPLÍCITA (canon NO redefinir) ·
 *   - El shape canon canonical de `ProvenanceTag` está en `../types.ts` ·
 *     CONSUMED desde ADR-009 esqueleto schema (cuando ADR-009 ratifique ·
 *     este file canon canonical re-imports y stays compatible).
 *   - ESTA gate genera el tag canon canonical (Capa 1 emite el sello) ·
 *     PERO la PERSISTENCIA del tag (Brain · event log · agent invocations)
 *     la owns ADR-009 esqueleto · canon canonical CC#1 NO toca event log writer.
 *
 * Canon canonical pure function · cero IO · sub-ms latency.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { GateDecision, ProvenanceTag } from '../types'

export interface ProvenanceTagOptions {
  source: ProvenanceTag['source']
  ingress_route: string
  /** Canon canonical · default 'untrusted' for external sources. */
  trust_level?: ProvenanceTag['trust_level']
  /** Canon canonical · caller-supplied ingress_id (or generated). */
  ingress_id?: string
  /** Canon canonical · caller-supplied session_id (or generated). */
  session_id?: string
}

/** Canon canonical · 16-char hex session_id randomized. */
function generateSessionId(): string {
  return randomBytes(8).toString('hex')
}

/**
 * Canon canonical Capa 1 evaluation.
 *
 * Emits a fresh ProvenanceTag canon canonical + wraps cleanedText with
 * `<external-data ...>...</external-data>` markers. Returns canon canonical
 * gate decision (always pass · this gate doesn't block · structural only).
 *
 * Result canon canonical `taggedPayload` is the canonical string that
 * downstream agents see in their user/system prompts. Result `tag` is the
 * canonical metadata that downstream WRITES persist (consumed by ADR-009
 * event log + Brain ingest schema · §6.6 R3).
 */
export function provenanceTagGate(
  cleanedText: string,
  options: ProvenanceTagOptions,
): { decision: GateDecision; tag: ProvenanceTag; taggedPayload: string } {
  const t0 = Date.now()

  const tag: ProvenanceTag = {
    source: options.source,
    ingress_id: options.ingress_id ?? randomUUID(),
    session_id: options.session_id ?? generateSessionId(),
    trust_level: options.trust_level ?? 'untrusted',
    received_at: new Date().toISOString(),
    ingress_route: options.ingress_route,
  }

  // Canon canonical · structural isolation markers per ADR-012 §4.1.
  // Session_id randomized canon · impossible for attacker to guess.
  const taggedPayload = `<external-data source="${tag.source}" session="${tag.session_id}" trust="${tag.trust_level}">
${cleanedText}
</external-data>`

  const decision: GateDecision = {
    gate: 'provenance_tag',
    verdict: 'pass',
    severity: 'LOW',
    latency_ms: Date.now() - t0,
    metadata: {
      session_id: tag.session_id,
      source: tag.source,
      trust_level: tag.trust_level,
    },
  }

  return { decision, tag, taggedPayload }
}
