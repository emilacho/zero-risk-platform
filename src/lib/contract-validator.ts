/**
 * contract-validator.ts · Wave 11 T2 · CC#1
 *
 * Runtime contract validation para outputs de agentes Sprint #3.
 *
 * Source-of-truth: docs/05-orquestacion/contracts/*.json (design canonical)
 * Runtime mirror:  src/lib/contracts/*.json (deployable bundle · este módulo importa)
 * Wrapper expuesto: docs/05-orquestacion/contracts/validate.ts (re-exporta este lib)
 *
 * Diseño:
 * - Pure (sin Sentry/PostHog) · efectos quedan en route handler que la consume
 * - DI-friendly · validators compilados en cold-start singleton
 * - Error codes alineados con runbook E-WF-003 (contract violation post agent_run)
 *
 * API pública:
 *   validateAgentOutput(journey, stage, output) → ContractValidationResult
 *   validateAgentOutputEnvelope(envelope)       → ContractValidationResult
 *   listKnownStages()                           → string[] (registry keys)
 *   resolveStageKey(journey, stage)             → string | null (debug helper)
 */
// Ajv2020 instance (draft 2020-12) · los schemas declaran `$schema: draft/2020-12/schema`
// El default Ajv (draft-07) no compila esos schemas · ver
// https://ajv.js.org/json-schema.html#draft-2019-09-and-draft-2020-12
import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

// ────────────────────────────────────────────────────────────────────────────
// Schema imports · runtime mirror desde src/lib/contracts/
// ────────────────────────────────────────────────────────────────────────────

import agentOutputMaster from '@/lib/contracts/agent-output.schema.json'
import agentOutcome from '@/lib/contracts/agent-outcome.schema.json'
import agentRunResponse from '@/lib/contracts/agent-run-response.schema.json'
import mcInboxEvent from '@/lib/contracts/mc-inbox-event.schema.json'

// Journey A · ACQUIRE
import journeyAStage1 from '@/lib/contracts/journey-a-stage-1-lead-capture.schema.json'
import journeyAStage4 from '@/lib/contracts/journey-a-stage-4-discovery-call.schema.json'
import journeyAStage8 from '@/lib/contracts/journey-a-stage-8-proposal-generated.schema.json'

// Journey B · ONBOARD
import journeyBStage1 from '@/lib/contracts/journey-b-stage-1-intake-form.schema.json'
import journeyBStage3 from '@/lib/contracts/journey-b-stage-3-brand-book-v0.schema.json'
import journeyBStage4 from '@/lib/contracts/journey-b-stage-4-icp-doc.schema.json'
import journeyBStage5 from '@/lib/contracts/journey-b-stage-5-competitive-landscape.schema.json'
import journeyBStage6 from '@/lib/contracts/journey-b-stage-6-client-brain-populated.schema.json'

// Journey C · PRODUCE (NEXUS 7-Phase)
import journeyCPhase0 from '@/lib/contracts/journey-c-phase-0-campaign-brief.schema.json'
import journeyCPhase1 from '@/lib/contracts/journey-c-phase-1-discover-output.schema.json'
import journeyCPhase2 from '@/lib/contracts/journey-c-phase-2-strategize-output.schema.json'
import journeyCPhase3 from '@/lib/contracts/journey-c-phase-3-scaffold-output.schema.json'
import journeyCPhase4 from '@/lib/contracts/journey-c-phase-4-build-output.schema.json'
import journeyCPhase5 from '@/lib/contracts/journey-c-phase-5-harden-output.schema.json'
import journeyCPhase6 from '@/lib/contracts/journey-c-phase-6-launch-output.schema.json'
import journeyCPhase7 from '@/lib/contracts/journey-c-phase-7-optimize-output.schema.json'

// Journey D · ALWAYS_ON
import journeyDDailyAnomaly from '@/lib/contracts/journey-d-daily-anomaly.schema.json'
import journeyDWeeklyReport from '@/lib/contracts/journey-d-weekly-client-report.schema.json'
import journeyDCrisisEvent from '@/lib/contracts/journey-d-crisis-event.schema.json'

// Journey E · REVIEW
import journeyEStage2 from '@/lib/contracts/journey-e-stage-2-churn-prediction.schema.json'
import journeyEStage3 from '@/lib/contracts/journey-e-stage-3-expansion-readiness.schema.json'
import journeyEStage4 from '@/lib/contracts/journey-e-stage-4-qbr-deliverable.schema.json'

// ────────────────────────────────────────────────────────────────────────────
// Tipos canónicos
// ────────────────────────────────────────────────────────────────────────────

export type JourneyKey =
  | 'ACQUIRE' | 'ONBOARD' | 'PRODUCE' | 'ALWAYS_ON' | 'REVIEW'
  | 'A' | 'B' | 'C' | 'D' | 'E'

export type ContractErrorCode =
  | 'E-WF-003-REQUIRED'   // missing required property
  | 'E-WF-003-TYPE'       // type mismatch
  | 'E-WF-003-ENUM'       // value not in enum
  | 'E-WF-003-CONSTRAINT' // min/max/pattern violation
  | 'E-WF-003-SCHEMA'     // generic schema violation
  | 'E-WF-003-UNKNOWN_JOURNEY'
  | 'E-WF-003-UNKNOWN_STAGE'
  | 'E-WF-003-MASTER'     // agent-output envelope violation

export interface ContractValidationResult {
  valid: boolean
  errors: string[]
  error_code?: ContractErrorCode
  /** Stage key resuelto (e.g., 'a-stage-1') · null si journey/stage no mapean */
  resolved_stage_key?: string | null
  /** Errores raw de Ajv para debugging detallado · solo si !valid */
  raw_errors?: ErrorObject[]
}

export interface AgentOutputEnvelope {
  agent_slug: string
  stage: string
  output: Record<string, unknown>
  metadata: {
    execution_id: string
    timestamp: string
    [k: string]: unknown
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Ajv setup · singleton para evitar recompile en hot-path
// ────────────────────────────────────────────────────────────────────────────

let _ajv: Ajv2020 | null = null
function getAjv(): Ajv2020 {
  if (_ajv) return _ajv
  _ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    removeAdditional: false,
  })
  addFormats(_ajv)
  return _ajv
}

// ────────────────────────────────────────────────────────────────────────────
// Journey normalization
// ────────────────────────────────────────────────────────────────────────────

const JOURNEY_TO_LETTER: Record<string, 'a' | 'b' | 'c' | 'd' | 'e'> = {
  ACQUIRE: 'a',
  ONBOARD: 'b',
  PRODUCE: 'c',
  ALWAYS_ON: 'd',
  REVIEW: 'e',
  A: 'a',
  B: 'b',
  C: 'c',
  D: 'd',
  E: 'e',
}

// ────────────────────────────────────────────────────────────────────────────
// Stage registry · key = `<journey-letter>-<stage-suffix>`
// Stage suffix puede ser 'stage-N' o 'phase-N' o 'daily-anomaly' etc
// ────────────────────────────────────────────────────────────────────────────

interface SchemaRegistry {
  [stageKey: string]: ValidateFunction
}

let _registry: SchemaRegistry | null = null
let _envelopeValidator: ValidateFunction | null = null

function getRegistry(): SchemaRegistry {
  if (_registry) return _registry
  const ajv = getAjv()
  _registry = {
    // Journey A
    'a-stage-1': ajv.compile(journeyAStage1),
    'a-stage-4': ajv.compile(journeyAStage4),
    'a-stage-8': ajv.compile(journeyAStage8),

    // Journey B
    'b-stage-1': ajv.compile(journeyBStage1),
    'b-stage-3': ajv.compile(journeyBStage3),
    'b-stage-4': ajv.compile(journeyBStage4),
    'b-stage-5': ajv.compile(journeyBStage5),
    'b-stage-6': ajv.compile(journeyBStage6),

    // Journey C
    'c-phase-0': ajv.compile(journeyCPhase0),
    'c-phase-1': ajv.compile(journeyCPhase1),
    'c-phase-2': ajv.compile(journeyCPhase2),
    'c-phase-3': ajv.compile(journeyCPhase3),
    'c-phase-4': ajv.compile(journeyCPhase4),
    'c-phase-5': ajv.compile(journeyCPhase5),
    'c-phase-6': ajv.compile(journeyCPhase6),
    'c-phase-7': ajv.compile(journeyCPhase7),

    // Journey D
    'd-daily-anomaly': ajv.compile(journeyDDailyAnomaly),
    'd-weekly-report': ajv.compile(journeyDWeeklyReport),
    'd-crisis-event': ajv.compile(journeyDCrisisEvent),

    // Journey E
    'e-stage-2': ajv.compile(journeyEStage2),
    'e-stage-3': ajv.compile(journeyEStage3),
    'e-stage-4': ajv.compile(journeyEStage4),
  }
  return _registry
}

function getEnvelopeValidator(): ValidateFunction {
  if (_envelopeValidator) return _envelopeValidator
  _envelopeValidator = getAjv().compile(agentOutputMaster)
  return _envelopeValidator
}

// ────────────────────────────────────────────────────────────────────────────
// Public · resolveStageKey
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve canonical stage key from `(journey, stage)` pair. Returns null si
 * journey desconocido o stage no existe en el registro.
 *
 * Acepta stage strings con o sin prefix `journey-X-`:
 *   resolveStageKey('PRODUCE', 'phase-3')             → 'c-phase-3'
 *   resolveStageKey('A', 'stage-1')                   → 'a-stage-1'
 *   resolveStageKey('PRODUCE', 'journey-c-phase-3')   → 'c-phase-3' (strips prefix)
 *   resolveStageKey('D', 'daily-anomaly')             → 'd-daily-anomaly'
 */
export function resolveStageKey(journey: JourneyKey, stage: string): string | null {
  const letter = JOURNEY_TO_LETTER[journey]
  if (!letter) return null

  // Strip optional `journey-X-` prefix
  const cleaned = stage.replace(/^journey-[a-e]-/i, '')
  const key = `${letter}-${cleaned}`

  const registry = getRegistry()
  return key in registry ? key : null
}

// ────────────────────────────────────────────────────────────────────────────
// Public · listKnownStages
// ────────────────────────────────────────────────────────────────────────────

export function listKnownStages(): string[] {
  return Object.keys(getRegistry()).sort()
}

// ────────────────────────────────────────────────────────────────────────────
// Helper · format Ajv errors
// ────────────────────────────────────────────────────────────────────────────

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return ['unknown validation error']
  return errors.map((e) => {
    const path = e.instancePath || '/'
    const msg = e.message ?? 'invalid'
    const params = e.params ? ` ${JSON.stringify(e.params)}` : ''
    return `${path} ${msg}${params}`.trim()
  })
}

function classifyErrorCode(errors: ErrorObject[] | null | undefined): ContractErrorCode {
  if (!errors || errors.length === 0) return 'E-WF-003-SCHEMA'
  const first = errors[0]
  switch (first.keyword) {
    case 'required':
      return 'E-WF-003-REQUIRED'
    case 'type':
      return 'E-WF-003-TYPE'
    case 'enum':
    case 'const':
      return 'E-WF-003-ENUM'
    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
    case 'minLength':
    case 'maxLength':
    case 'pattern':
    case 'minProperties':
    case 'maxProperties':
    case 'minItems':
    case 'maxItems':
    case 'uniqueItems':
    case 'multipleOf':
    case 'format':
      return 'E-WF-003-CONSTRAINT'
    default:
      return 'E-WF-003-SCHEMA'
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public · validateAgentOutput
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valida `output` contra el schema correspondiente a `(journey, stage)`.
 *
 * Pure · sin side-effects. Caller decide qué hacer en caso de invalid (Sentry,
 * 422 response, etc.) — ver handler `/api/agents/validate-output/route.ts`.
 *
 * @example
 *   const r = validateAgentOutput('PRODUCE', 'phase-3', { ... })
 *   if (!r.valid) {
 *     Sentry.captureMessage(`Contract violation`, { extra: r })
 *     return NextResponse.json({ ...r }, { status: 422 })
 *   }
 */
export function validateAgentOutput(
  journey: JourneyKey,
  stage: string,
  output: unknown,
): ContractValidationResult {
  const stageKey = resolveStageKey(journey, stage)

  if (!JOURNEY_TO_LETTER[journey]) {
    return {
      valid: false,
      errors: [`Unknown journey: ${journey}. Expected one of: A,B,C,D,E or ACQUIRE,ONBOARD,PRODUCE,ALWAYS_ON,REVIEW`],
      error_code: 'E-WF-003-UNKNOWN_JOURNEY',
      resolved_stage_key: null,
    }
  }

  if (!stageKey) {
    return {
      valid: false,
      errors: [
        `Unknown stage '${stage}' for journey '${journey}'. Known stages: ${listKnownStages().join(', ')}`,
      ],
      error_code: 'E-WF-003-UNKNOWN_STAGE',
      resolved_stage_key: null,
    }
  }

  const validator = getRegistry()[stageKey]
  const isValid = validator(output)

  if (isValid) {
    return {
      valid: true,
      errors: [],
      resolved_stage_key: stageKey,
    }
  }

  return {
    valid: false,
    errors: formatErrors(validator.errors),
    error_code: classifyErrorCode(validator.errors),
    resolved_stage_key: stageKey,
    raw_errors: validator.errors ?? [],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public · validateAgentOutputEnvelope (master schema + nested stage)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Valida el envelope completo (`{agent_slug, stage, output, metadata}`) contra:
 *  1. agent-output master schema
 *  2. stage-specific schema según `envelope.stage` (intentando inferir el
 *     journey letter desde el prefijo `journey-X-` del stage string).
 *
 * Si `envelope.stage` no incluye el prefix journey-X-, no podemos inferir
 * journey · solo se valida master schema y se reporta resolved_stage_key=null.
 */
export function validateAgentOutputEnvelope(
  envelope: unknown,
): ContractValidationResult {
  const masterValidator = getEnvelopeValidator()
  if (!masterValidator(envelope)) {
    return {
      valid: false,
      errors: formatErrors(masterValidator.errors),
      error_code: 'E-WF-003-MASTER',
      resolved_stage_key: null,
      raw_errors: masterValidator.errors ?? [],
    }
  }

  const e = envelope as AgentOutputEnvelope
  const stageMatch = e.stage.match(/^journey-([a-e])-(.+)$/i)
  if (!stageMatch) {
    // Master schema OK pero no podemos inferir journey · valid pero sin nested check.
    return {
      valid: true,
      errors: [],
      resolved_stage_key: null,
    }
  }

  const letter = stageMatch[1].toLowerCase() as 'a' | 'b' | 'c' | 'd' | 'e'
  const stageKey = `${letter}-${stageMatch[2]}`
  const stageValidator = getRegistry()[stageKey]
  if (!stageValidator) {
    return {
      valid: true,
      errors: [],
      resolved_stage_key: null,
    }
  }

  const isValid = stageValidator(e.output)
  if (isValid) {
    return {
      valid: true,
      errors: [],
      resolved_stage_key: stageKey,
    }
  }

  return {
    valid: false,
    errors: formatErrors(stageValidator.errors),
    error_code: classifyErrorCode(stageValidator.errors),
    resolved_stage_key: stageKey,
    raw_errors: stageValidator.errors ?? [],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Auxiliary schemas (no expuestos por validateAgentOutput · disponibles si
// algún caller específico los necesita)
// ────────────────────────────────────────────────────────────────────────────

export const AUXILIARY_SCHEMAS = {
  agentOutcome,
  agentRunResponse,
  mcInboxEvent,
} as const
