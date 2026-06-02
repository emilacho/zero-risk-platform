/**
 * Capa 2 · regex deny-list (EN + ES post-R6) · ADR-012 §4.2
 *
 * Canon canonical patterns hard-coded (canon canonical from `deny-patterns.ts`).
 * Caller MAY pass additional `extra_patterns` canon canonical (e.g., loaded
 * from `public.ingress_deny_patterns` DB table at runtime).
 *
 * Pure function · no IO · sub-ms latency for typical payload <10KB.
 *
 * §148 honest caveat · FP rate UNKNOWN until PoC §7.3 item 1 (R5 gate).
 * v1 baseline · canon canonical expandible v2 post-shadow.
 */
import type { GateDecision, Severity } from '../types'
import { ALL_PATTERNS, type DenyPattern, patternsForLocale } from '../deny-patterns'

export interface RegexDenyOptions {
  /** Canon canonical locale hint · default 'auto' = all patterns. */
  locale?: 'en' | 'es' | 'auto'
  /** Canon canonical extra patterns from DB or per-customer · merged with canon. */
  extra_patterns?: DenyPattern[]
}

/** Canon canonical severity aggregation · HIGH > MEDIUM > LOW. */
function aggregateSeverity(hits: DenyPattern[]): Severity {
  if (hits.some((h) => h.severity === 'HIGH')) return 'HIGH'
  if (hits.some((h) => h.severity === 'MEDIUM')) return 'MEDIUM'
  return 'LOW'
}

/**
 * Canon canonical Capa 2 evaluation.
 *
 * verdict canon canonical · 'pass' if 0 hits · 'flag' if any hit (severity
 * aggregated). Pipeline orchestrator decides block vs continue per route
 * policy (`default_severity_min_reject` from ingress_routes).
 *
 * Short-circuit canon canonical · returns on first HIGH hit (canon · faster
 * + canonical-still-correct since severity aggregation is monotone).
 */
export function regexDenyGate(
  cleanedText: string,
  options: RegexDenyOptions = {},
): GateDecision {
  const t0 = Date.now()
  const locale = options.locale ?? 'auto'
  const patterns = [
    ...patternsForLocale(locale),
    ...(options.extra_patterns ?? []),
  ]

  const hits: DenyPattern[] = []

  for (const pattern of patterns) {
    if (pattern.pattern.test(cleanedText)) {
      hits.push(pattern)
      // Short-circuit canon canonical · HIGH found · still aggregate higher.
      if (pattern.severity === 'HIGH' && hits.length >= 3) {
        // Multiple HIGH hits canon canonical · enough evidence.
        break
      }
    }
  }

  if (hits.length === 0) {
    return {
      gate: 'regex_deny',
      verdict: 'pass',
      severity: 'LOW',
      latency_ms: Date.now() - t0,
      metadata: {
        patterns_checked: patterns.length,
        hits_count: 0,
        locale,
      },
    }
  }

  const severity = aggregateSeverity(hits)

  return {
    gate: 'regex_deny',
    verdict: 'flag',
    severity,
    latency_ms: Date.now() - t0,
    reason: hits[0]!.pattern_id,
    metadata: {
      patterns_checked: patterns.length,
      hits_count: hits.length,
      hit_ids: hits.map((h) => h.pattern_id),
      locale,
    },
  }
}
