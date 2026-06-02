/**
 * Public surface · `src/lib/ingress-filter/` · ADR-012 anti-injection
 *
 * Spec · zr-vault/00-meta/opus-4-8-traspaso/ADR-012-anti-injection-ingress.md
 *       + spec-CC1-ADR-012-build.md
 *
 * Canon canonical · single library · N call-sites (Vercel handlers · n8n
 * recepción · cualquier ingress vector activo per §2.1 ADR-012).
 *
 * Build phase Sprint 12 · 80% self-contained · NO flip enforce · NO redefine
 * provenance_tag (consumed from ADR-009 esqueleto schema canon canonical).
 */

export type {
  ProvenanceTag,
  GateName,
  Severity,
  GateDecision,
  ClassifierOutput,
  IngressFilterInput,
  IngressFilterDecision,
  IngressRoutePolicy,
} from './types'

export {
  CLASSIFICATION_TYPES,
  ESCALATION_REASONS,
  DEFAULT_ROUTE_POLICY,
} from './types'

export { runIngressFilter, type IngressPipelineOptions } from './pipeline'

export {
  lengthCharsetGate,
  normalizeText,
  LENGTH_LIMITS,
  type LengthCharsetOptions,
} from './gates/length-charset'

export {
  schemaValidatorGate,
  type SchemaValidatorOptions,
} from './gates/schema-validator'

export { regexDenyGate, type RegexDenyOptions } from './gates/regex-deny'

export {
  classifierGate,
  parseClassifierResponse,
  classificationToSeverity,
  CLASSIFIER_SYSTEM_PROMPT,
  type ClassifierClient,
  type ClassifierOptions,
  type AnthropicMessageRequest,
  type AnthropicMessageResponse,
} from './gates/classifier'

export {
  provenanceTagGate,
  type ProvenanceTagOptions,
} from './gates/provenance-tag'

export {
  EN_PATTERNS,
  ES_PATTERNS,
  ALL_PATTERNS,
  patternsForLocale,
  type DenyPattern,
} from './deny-patterns'
