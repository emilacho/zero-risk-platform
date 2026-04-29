/**
 * POST /api/agents/validate-output · Wave 11 T2 · CC#1
 *
 * Validación runtime de outputs de agentes contra contract schemas.
 * Llamado por cada skeleton n8n post-agent_run para enforcement E-WF-003.
 *
 * Spec: docs/05-orquestacion/contracts/README.md
 * Lib:  src/lib/contract-validator.ts
 *
 * Auth: x-api-key (INTERNAL_API_KEY)
 *
 * Request body:
 *   { journey, stage, output }
 *   - journey: 'ACQUIRE'|'ONBOARD'|'PRODUCE'|'ALWAYS_ON'|'REVIEW' (or short letters A-E)
 *   - stage:   stage suffix (ej. 'phase-3', 'stage-1', 'daily-anomaly')
 *              acepta también el full key 'journey-c-phase-3'
 *   - output:  el objeto a validar (output del agente)
 *
 * Returns:
 *   200 OK    → { valid: true, errors: [], resolved_stage_key }
 *   422       → { valid: false, errors, error_code, resolved_stage_key }   ← spec
 *   400       → { valid: false, error: 'validation_error', detail }        ← bad body shape
 *   401       → unauthorized
 *
 * Side-effects:
 *   - Sentry: captureMessage cuando invalid (level=warning · breadcrumb E-WF-003)
 *   - PostHog: 'contract_violation' event con journey + stage + error_code
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { checkInternalKey } from '@/lib/internal-auth'
import { capture } from '@/lib/posthog'
import {
  validateAgentOutput,
  type JourneyKey,
} from '@/lib/contract-validator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface RequestBody {
  journey?: unknown
  stage?: unknown
  output?: unknown
}

const VALID_JOURNEY_KEYS = new Set([
  'ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW',
  'A', 'B', 'C', 'D', 'E',
])

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { valid: false, error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { valid: false, error: 'validation_error', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  // Shape validation (request envelope · NOT contract validation yet)
  if (typeof body.journey !== 'string' || !VALID_JOURNEY_KEYS.has(body.journey)) {
    return NextResponse.json(
      {
        valid: false,
        error: 'validation_error',
        detail: `Invalid 'journey' field. Expected one of: ${[...VALID_JOURNEY_KEYS].join(', ')}`,
      },
      { status: 400 },
    )
  }
  if (typeof body.stage !== 'string' || body.stage.length < 2) {
    return NextResponse.json(
      { valid: false, error: 'validation_error', detail: "Missing or invalid 'stage' field" },
      { status: 400 },
    )
  }
  if (!body.output || typeof body.output !== 'object') {
    return NextResponse.json(
      { valid: false, error: 'validation_error', detail: "Missing or invalid 'output' field (must be object)" },
      { status: 400 },
    )
  }

  // Run contract validator
  const result = validateAgentOutput(
    body.journey as JourneyKey,
    body.stage,
    body.output,
  )

  if (result.valid) {
    return NextResponse.json(
      {
        valid: true,
        errors: [],
        resolved_stage_key: result.resolved_stage_key,
      },
      { status: 200 },
    )
  }

  // Side-effects on invalid · fail-open (no break la response si telemetry falla)
  try {
    Sentry.captureMessage(
      `[${result.error_code ?? 'E-WF-003-SCHEMA'}] Contract violation · ${body.journey}/${body.stage}`,
      {
        level: 'warning',
        tags: {
          source: 'contract-validator',
          error_code: result.error_code ?? 'E-WF-003-SCHEMA',
          journey: String(body.journey),
          stage: body.stage,
        },
        extra: {
          resolved_stage_key: result.resolved_stage_key,
          errors: result.errors.slice(0, 10),
          raw_errors: result.raw_errors?.slice(0, 5),
        },
      },
    )
  } catch {
    // Sentry failure must not affect contract validation result
  }

  try {
    capture('contract_violation', 'system', {
      journey: body.journey,
      stage: body.stage,
      error_code: result.error_code,
      resolved_stage_key: result.resolved_stage_key,
      error_count: result.errors.length,
      first_error: result.errors[0]?.slice(0, 200),
    })
  } catch {
    // PostHog fail-open
  }

  return NextResponse.json(
    {
      valid: false,
      errors: result.errors,
      error_code: result.error_code ?? 'E-WF-003-SCHEMA',
      resolved_stage_key: result.resolved_stage_key,
    },
    { status: 422 },
  )
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/validate-output',
    method: 'POST',
    auth: 'x-api-key (INTERNAL_API_KEY)',
    request_body: {
      journey: "'ACQUIRE'|'ONBOARD'|'PRODUCE'|'ALWAYS_ON'|'REVIEW' or letter A-E",
      stage: "'stage-N' | 'phase-N' | 'daily-anomaly' | full 'journey-X-...'",
      output: 'object to validate against contract',
    },
    returns: {
      '200': "{ valid: true, errors: [] }",
      '422': "{ valid: false, errors, error_code: 'E-WF-003-...' }",
      '400': "{ error: 'validation_error', detail }",
      '401': 'unauthorized',
    },
    spec: 'docs/05-orquestacion/contracts/README.md',
  })
}
