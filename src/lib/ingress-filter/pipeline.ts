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
import { LENGTH_LIMITS, lengthCharsetGate, normalizeText } from './gates/length-charset'
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

  // Encargo 11 · Capa 5 BLOCK se anota pero NO corta camino: antes, un texto de más de 8000 caracteres
  // saltaba la revisión de patrones y el clasificador (y en modo sombra entraba SIN revisar). Ahora todo
  // texto pasa por todas las capas, entero; el bloqueo por largo sigue valiendo según la política de la ruta.
  if (g5.verdict === 'block') {
    shadowBlocks.push('length_charset')
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

    // Encargo 11 · el clasificador revisa TODOS los trozos (de hasta max_field_chars, seguidos, sin
    // solaparse ni saltarse nada) y cuenta el más grave; un texto corto es un solo trozo, como antes.
    const g3 = await clasificarPorTrozos(cleanedText, classifierOpts)
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
  // Encargo 11 · como Capa 5 ya no corta camino, puede haber varias capas que bloqueen: manda la MÁS
  // grave (un patrón HIGH en un texto largo no queda escondido tras «demasiado largo»); empate → la primera.
  let elegida: GateDecision | undefined
  for (const g of gates) {
    const bloquea = g.verdict === 'block' || (g.verdict === 'flag' && SEVERITY_RANK[g.severity] >= rejectMinRank)
    if (bloquea && (!elegida || SEVERITY_RANK[g.severity] > SEVERITY_RANK[elegida.severity])) elegida = g
  }
  return elegida
}

/** Encargo 11 · trozos seguidos de hasta `tamano` caracteres que juntos son el texto ENTERO (no se pierde ni se repite nada). */
export function trozosParaRevisar(texto: string, tamano: number = LENGTH_LIMITS.max_field_chars): string[] {
  if (texto.length <= tamano) return [texto]
  return texto.match(new RegExp(`[\\s\\S]{1,${tamano}}`, 'g')) ?? [texto]
}

/** Encargo 11 · qué trozo manda: lo MARCADO (el más grave) > un trozo que NO se pudo revisar (UNKNOWN: no se esconde tras los limpios) > lo limpio. */
const pesoDelTrozo = (d: GateDecision): number => (d.verdict === 'flag' ? 10 + SEVERITY_RANK[d.severity] : d.severity === 'UNKNOWN' ? 5 : SEVERITY_RANK[d.severity])

/** Encargo 11 · el clasificador sobre cada trozo; vale el que más pesa (ver `pesoDelTrozo`); empate → el primero. */
async function clasificarPorTrozos(texto: string, opciones: ClassifierOptions): Promise<GateDecision> {
  const trozos = trozosParaRevisar(texto)
  if (trozos.length === 1) return classifierGate(texto, opciones)
  const t0 = Date.now()
  let peor: GateDecision | undefined
  let peorTrozo = 0
  for (const [n, trozo] of trozos.entries()) {
    const d = await classifierGate(trozo, opciones)
    if (!peor || pesoDelTrozo(d) > pesoDelTrozo(peor)) { peor = d; peorTrozo = n }
  }
  return { ...peor!, latency_ms: Date.now() - t0, metadata: { ...(peor!.metadata ?? {}), trozos_revisados: trozos.length, trozo_mas_grave: peorTrozo } }
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
