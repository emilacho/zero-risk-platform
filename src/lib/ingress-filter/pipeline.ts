/**
 * Pipeline orchestrator · ADR-012 §4.6 canon canonical
 *
 * Canonical order canon canonical · cheap first · short-circuit con HIGH ·
 *   Capa 5 length+charset → Capa 4 schema → Capa 2 regex deny → Capa 3
 *   classifier (only if Capa 2 = MEDIUM/UNKNOWN) → Capa 1 provenance tag
 *
 * Canon canonical shadow_mode default · canon canonical pipeline NEVER
 * blocks production · per-route policy from `ingress_routes` table read
 * by caller and passed in.
 *
 * Pure function canon canonical · cero IO except optional classifier call
 * (Capa 3) · canon canonical lib stays canonical NO direct DB writes (the
 * caller persists cuarentena rows · canon canonical separation of concerns).
 */
import type {
  IngressFilterInput,
  IngressFilterDecision,
  IngressRoutePolicy,
  GateDecision,
  GateName,
  Severity,
} from './types'
import { DEFAULT_ROUTE_POLICY } from './types'
import { lengthCharsetGate, normalizeText } from './gates/length-charset'
import { schemaValidatorGate } from './gates/schema-validator'
import { regexDenyGate } from './gates/regex-deny'
import {
  classifierGate,
  type ClassifierClient,
  type ClassifierOptions,
} from './gates/classifier'
import { provenanceTagGate } from './gates/provenance-tag'
import { ALL_PATTERNS } from './deny-patterns'

export interface IngressPipelineOptions {
  /** Canon canonical · route policy from `ingress_routes` table. */
  route?: IngressRoutePolicy
  /** Canon canonical · classifier client (DI · undefined = Capa 3 fail-open). */
  classifier_client?: ClassifierClient
  /** Canon canonical · skip Capa 3 always (e.g., test mode · low-risk vector). */
  skip_classifier?: boolean
  /** Canon canonical · schema validator options per-vector. */
  schema_options?: Parameters<typeof schemaValidatorGate>[2]
  /** Canon canonical · extra regex patterns from DB load. */
  extra_regex_patterns?: typeof ALL_PATTERNS
}

/** Canon canonical severity rank · for comparison. */
const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
}

/** Canon canonical · aggregate worst severity across gates. */
function aggregateSeverity(gates: GateDecision[]): Severity {
  let worst: Severity = 'LOW'
  for (const g of gates) {
    if (SEVERITY_RANK[g.severity] > SEVERITY_RANK[worst]) {
      worst = g.severity
    }
  }
  return worst
}

/**
 * Canon canonical main pipeline entry point.
 *
 * Returns `IngressFilterDecision` consumed by call-sites. The decision
 * canon canonical contains the tagged payload for downstream agents +
 * provenance tag for event-log persistence + per-gate audit trail.
 *
 * Canon canonical shadow_mode semantics · `allow=true` always when
 * `route.shadow_mode=true` (canon canonical NUNCA blocks producción) ·
 * shadow_blocks array carries "what WOULD have blocked in enforce".
 */
export async function runIngressFilter(
  input: IngressFilterInput,
  options: IngressPipelineOptions = {},
): Promise<IngressFilterDecision> {
  const t0 = Date.now()
  const route = options.route ?? DEFAULT_ROUTE_POLICY
  const gates: GateDecision[] = []
  const shadowBlocks: GateName[] = []

  // Capa 5 · length + charset canon canonical (cheapest first).
  const g5 = lengthCharsetGate(input.raw_text)
  gates.push(g5)

  // If Capa 5 BLOCK canon canonical · record as shadow_block + short-circuit
  // to provenance + return.
  if (g5.verdict === 'block') {
    shadowBlocks.push('length_charset')
    return buildShortCircuitDecision({
      input,
      route,
      gates,
      shadowBlocks,
      blockingGate: g5,
      t0,
    })
  }

  // Canon canonical · normalize text NFKC post-Capa-5 pass.
  const cleanedText = normalizeText(input.raw_text)

  // Capa 4 · schema validator canon canonical (per-vector).
  const g4 = schemaValidatorGate(input.structured_data, input.source, options.schema_options)
  gates.push(g4)
  if (g4.verdict === 'block') {
    shadowBlocks.push('schema_validator')
    return buildShortCircuitDecision({
      input,
      route,
      gates,
      shadowBlocks,
      blockingGate: g4,
      t0,
      cleanedText,
    })
  }

  // Capa 2 · regex deny canon canonical EN + ES.
  const g2 = regexDenyGate(cleanedText, {
    locale: input.locale_hint ?? 'auto',
    extra_patterns: options.extra_regex_patterns,
  })
  gates.push(g2)
  if (g2.verdict === 'flag') {
    shadowBlocks.push('regex_deny')
  }

  // Capa 3 · classifier ONLY if Capa 2 = MEDIUM/UNKNOWN canon canonical (short-
  // circuit Capa 2 = HIGH or LOW). Canon canonical canon also skip if route
  // policy says no_classifier OR if Capa 2 already HIGH (enough evidence).
  const shouldCallClassifier =
    !options.skip_classifier &&
    (g2.severity === 'MEDIUM' || g2.severity === 'UNKNOWN')

  if (shouldCallClassifier) {
    const classifierOpts: ClassifierOptions = {
      client: options.classifier_client,
      session_id: '', // canon canonical · will be replaced with real session_id below
    }
    // Canon canonical · generate session_id early for classifier marker.
    // It will be re-used by Capa 1 provenance.
    const earlyTag = provenanceTagGate(cleanedText, {
      source: input.source,
      ingress_route: input.ingress_route,
    })
    classifierOpts.session_id = earlyTag.tag.session_id

    const g3 = await classifierGate(cleanedText, classifierOpts)
    gates.push(g3)
    if (g3.verdict === 'flag') {
      shadowBlocks.push('classifier')
    }

    // Canon canonical · use the canonical-already-generated tag from above.
    gates.push(earlyTag.decision)

    const severity = aggregateSeverity(gates)
    const blockingGate = pickBlocking(gates, route)

    return {
      allow: route.shadow_mode || !blockingGate,
      severity,
      gates,
      provenance_tag: earlyTag.tag,
      tagged_payload: earlyTag.taggedPayload,
      total_latency_ms: Date.now() - t0,
      block_gate: blockingGate?.gate,
      block_reason: blockingGate?.reason,
      block_severity: blockingGate?.severity,
      shadow_blocks: shadowBlocks,
      request_id: earlyTag.tag.ingress_id,
    }
  }

  // Capa 1 · provenance tagging canon canonical (always last canonical · wraps).
  const { decision: g1, tag, taggedPayload } = provenanceTagGate(cleanedText, {
    source: input.source,
    ingress_route: input.ingress_route,
  })
  gates.push(g1)

  const severity = aggregateSeverity(gates)
  const blockingGate = pickBlocking(gates, route)

  return {
    allow: route.shadow_mode || !blockingGate,
    severity,
    gates,
    provenance_tag: tag,
    tagged_payload: taggedPayload,
    total_latency_ms: Date.now() - t0,
    block_gate: blockingGate?.gate,
    block_reason: blockingGate?.reason,
    block_severity: blockingGate?.severity,
    shadow_blocks: shadowBlocks,
    request_id: tag.ingress_id,
  }
}

/**
 * Canon canonical helper · pick gate that triggers block under route policy.
 *
 * Returns canon canonical undefined if no gate triggers block per route's
 * `default_severity_min_reject` threshold. Used by orchestrator to populate
 * `block_gate` + `block_reason` fields.
 */
function pickBlocking(
  gates: GateDecision[],
  route: IngressRoutePolicy,
): GateDecision | undefined {
  const rejectMinRank = SEVERITY_RANK[route.default_severity_min_reject]
  for (const g of gates) {
    if (g.verdict === 'block') return g
    if (g.verdict === 'flag' && SEVERITY_RANK[g.severity] >= rejectMinRank) {
      return g
    }
  }
  return undefined
}

/**
 * Canon canonical helper · short-circuit when Capa 5/4 blocks · still emit
 * provenance tag canon canonical (canon canonical canonical-downstream consumer
 * may want trace even on early block).
 */
function buildShortCircuitDecision(args: {
  input: IngressFilterInput
  route: IngressRoutePolicy
  gates: GateDecision[]
  shadowBlocks: GateName[]
  blockingGate: GateDecision
  t0: number
  cleanedText?: string
}): IngressFilterDecision {
  const { input, route, gates, shadowBlocks, blockingGate, t0, cleanedText } = args
  const textForTag = cleanedText ?? input.raw_text
  const { decision: g1, tag, taggedPayload } = provenanceTagGate(textForTag, {
    source: input.source,
    ingress_route: input.ingress_route,
  })
  gates.push(g1)

  return {
    allow: route.shadow_mode,
    severity: blockingGate.severity,
    gates,
    provenance_tag: tag,
    tagged_payload: taggedPayload,
    total_latency_ms: Date.now() - t0,
    block_gate: blockingGate.gate,
    block_reason: blockingGate.reason,
    block_severity: blockingGate.severity,
    shadow_blocks: shadowBlocks,
    request_id: tag.ingress_id,
  }
}
