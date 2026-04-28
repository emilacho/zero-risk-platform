/**
 * journey-orchestrator.ts
 *
 * Pure business logic del Master Journey Orchestrator (Sprint #3 Fase 1).
 * Extracted del route handler `/api/journey/dispatch` para que sea testable
 * sin tener que mockear módulos Next.js (route + auth + posthog) — los tests
 * llaman directo a `dispatchJourney()` con dependencias inyectadas.
 *
 * El route handler (route.ts) sigue siendo la "shell" que:
 *  - Hace `checkInternalKey(request)` antes de delegar
 *  - Parse `request.json()` antes de pasar el body
 *  - Construye `NextResponse` desde `{ status, body }`
 *
 * Toda la lógica de negocio (Ajv validation, conflict check, insert, posthog)
 * vive aquí.
 */

import Ajv, { type ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

// ────────────────────────────────────────────────────────────────────────────
// Tipos canónicos
// ────────────────────────────────────────────────────────────────────────────

export type JourneyType = 'ACQUIRE' | 'ONBOARD' | 'PRODUCE' | 'ALWAYS_ON' | 'REVIEW'
export type TriggerType = 'manual' | 'webhook' | 'cron' | 'callback'

export interface DispatchInput {
  client_id?: string
  journey: JourneyType
  trigger_type?: TriggerType
  trigger_source?: string
  params?: Record<string, unknown>
  parent_journey_id?: string
  force_new?: boolean
}

/** Subset minimo de la API Supabase que el orchestrator necesita. */
export interface SupabaseLike {
  from: (table: string) => SupabaseQueryBuilder
}

interface SupabaseQueryBuilder {
  select: (cols: string) => SupabaseQueryBuilder
  insert: (row: Record<string, unknown>) => SupabaseQueryBuilder
  eq: (col: string, val: unknown) => SupabaseQueryBuilder
  in: (col: string, vals: unknown[]) => SupabaseQueryBuilder
  limit: (n: number) => SupabaseQueryBuilder
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: SupabaseError | null }>
  single: () => Promise<{ data: Record<string, unknown> | null; error: SupabaseError | null }>
}

export interface SupabaseError {
  code?: string
  message: string
}

export type CaptureFn = (
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
) => void

export interface DispatchDeps {
  supabase: SupabaseLike
  capture?: CaptureFn
}

export interface DispatchResult {
  status: number
  body: Record<string, unknown>
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

export const DISPATCH_INPUT_SCHEMA = {
  type: 'object',
  required: ['journey'],
  additionalProperties: true,
  properties: {
    client_id: { type: 'string', format: 'uuid' },
    journey: {
      type: 'string',
      enum: ['ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW'],
    },
    trigger_type: {
      type: 'string',
      enum: ['manual', 'webhook', 'cron', 'callback'],
      default: 'manual',
    },
    trigger_source: { type: 'string', maxLength: 200 },
    params: { type: 'object' },
    parent_journey_id: { type: 'string', format: 'uuid' },
    force_new: { type: 'boolean', default: false },
  },
} as const

export const DISPATCH_TARGET: Record<JourneyType, string> = {
  ACQUIRE: 'journey-a-acquire-pipeline',
  ONBOARD: 'journey-b-onboard-pipeline',
  PRODUCE: 'nexus-7phase-orchestrator',
  ALWAYS_ON: 'journey-d-always-on-dispatcher',
  REVIEW: 'journey-e-review-pipeline',
}

// PostgREST devuelve PGRST205 si la tabla no existe en el schema cache;
// Postgres nativo `42P01` (undefined_table).
const TABLE_MISSING_CODES = new Set(['PGRST205', '42P01'])

// Singleton Ajv (instanciar una sola vez por cold start).
let _ajv: Ajv | null = null
export function getAjv(): Ajv {
  if (_ajv) return _ajv
  const ajv = new Ajv({ strict: false, allErrors: true, useDefaults: true })
  addFormats(ajv)
  _ajv = ajv
  return ajv
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'unknown validation error'
  return errors
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
    .join('; ')
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch a new journey. Pure function · no I/O directo a Next.js
 * (NextResponse, request) · todo el side-effect pasa por `deps.supabase`.
 *
 * Returns `{ status, body }` para que el caller (route handler) lo envuelva
 * en NextResponse.
 *
 * Casos de retorno:
 *  - 201: row creado · body incluye journey_id + status='initiated'
 *  - 400: schema validation OR cross-field rule (client_id required for non-ACQUIRE)
 *  - 404: client_id no existe
 *  - 409: cliente ya tiene journey activo del mismo type (sin force_new)
 *  - 503: tabla `client_journey_state` no aplicada todavía (migration pending)
 *  - 500: error genérico de DB
 */
export async function dispatchJourney(
  body: unknown,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { supabase, capture } = deps

  // 1. Schema validation
  const ajv = getAjv()
  const validate = ajv.compile(DISPATCH_INPUT_SCHEMA)
  if (!validate(body)) {
    return {
      status: 400,
      body: { error: 'validation_error', detail: formatAjvErrors(validate.errors) },
    }
  }
  const input = body as DispatchInput

  // 2. Cross-field: client_id required salvo ACQUIRE
  if (input.journey !== 'ACQUIRE' && !input.client_id) {
    return {
      status: 400,
      body: {
        error: 'validation_error',
        detail: 'client_id required for journey != ACQUIRE',
      },
    }
  }

  // 3. Verificar que el client existe
  if (input.client_id) {
    const clientLookup = await supabase
      .from('clients')
      .select('id')
      .eq('id', input.client_id)
      .maybeSingle()

    if (clientLookup.error) {
      return {
        status: 500,
        body: {
          error: 'internal_error',
          detail: `clients lookup failed: ${clientLookup.error.message.slice(0, 200)}`,
        },
      }
    }
    if (!clientLookup.data) {
      return {
        status: 404,
        body: { error: 'not_found', detail: `client_id ${input.client_id} does not exist` },
      }
    }
  }

  // 4. Conflict check · misma combinación client + journey con status no-terminal
  if (input.client_id && !input.force_new) {
    const conflictLookup = await supabase
      .from('client_journey_state')
      .select('id, status')
      .eq('client_id', input.client_id)
      .eq('journey', input.journey)
      .in('status', ['initiated', 'active', 'paused_hitl'])
      .limit(1)
      .maybeSingle()

    if (conflictLookup.error) {
      const code = conflictLookup.error.code
      if (code && TABLE_MISSING_CODES.has(code)) {
        return {
          status: 503,
          body: {
            error: 'service_unavailable',
            detail:
              'client_journey_state table not yet applied. Run migration 202604280001_client_journey_state.sql',
          },
        }
      }
      return {
        status: 500,
        body: {
          error: 'internal_error',
          detail: `conflict check failed: ${conflictLookup.error.message.slice(0, 200)}`,
        },
      }
    }
    if (conflictLookup.data) {
      return {
        status: 409,
        body: {
          error: 'conflict',
          detail: `client already has active ${input.journey} journey`,
          existing_journey_id: conflictLookup.data.id,
        },
      }
    }
  }

  // 5. Insert row · status='initiated'
  const triggerType: TriggerType = input.trigger_type ?? 'manual'
  const insertRow = {
    client_id: input.client_id ?? null,
    journey: input.journey,
    status: 'initiated',
    trigger_type: triggerType,
    trigger_source: input.trigger_source ?? null,
    trigger_payload: input as unknown as Record<string, unknown>,
    metadata: {
      params: input.params ?? {},
      dispatch_target: DISPATCH_TARGET[input.journey],
    },
    parent_journey_id: input.parent_journey_id ?? null,
  }

  const insertResult = await supabase
    .from('client_journey_state')
    .insert(insertRow)
    .select('id, started_at')
    .single()

  if (insertResult.error) {
    const code = insertResult.error.code
    if (code && TABLE_MISSING_CODES.has(code)) {
      return {
        status: 503,
        body: {
          error: 'service_unavailable',
          detail:
            'client_journey_state table not yet applied. Run migration 202604280001_client_journey_state.sql',
        },
      }
    }
    return {
      status: 500,
      body: {
        error: 'internal_error',
        detail: `insert failed: ${insertResult.error.message.slice(0, 200)}`,
      },
    }
  }

  const journeyId = insertResult.data?.id as string
  const startedAt = insertResult.data?.started_at as string

  // 6. PostHog event (fail-open)
  if (capture) {
    try {
      capture('journey_dispatched', String(input.client_id ?? 'system'), {
        journey_id: journeyId,
        client_id: input.client_id ?? null,
        journey: input.journey,
        trigger_type: triggerType,
        dispatch_target: DISPATCH_TARGET[input.journey],
      })
    } catch {
      // PostHog failure no debe romper el dispatch
    }
  }

  // 7. 201 Created
  return {
    status: 201,
    body: {
      journey_id: journeyId,
      client_id: input.client_id ?? null,
      journey: input.journey,
      status: 'initiated',
      started_at: startedAt,
      dispatch_target: DISPATCH_TARGET[input.journey],
    },
  }
}
