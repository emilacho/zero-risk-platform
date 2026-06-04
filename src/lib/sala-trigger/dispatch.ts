/**
 * Track Q · Sprint 12 Fase 0 · trigger dispatch core (SHADOW).
 *
 * canon canonical · `dispatchSalaTrigger` ·
 *   1. Evalúa los safety flags + source policy (refused → early return).
 *   2. Deriva `stream_id` (determinístico) + `correlation_id` (per call).
 *   3. Resuelve el libreto del journey + valida que el journey existe.
 *   4. Construye `idempotency_key` determinístico (canon-canon-canon-input_hash
 *      = source + external_id · canon-canon-canon-re-disparos del mismo
 *      formulario dedup naturalmente).
 *   5. Appendea un evento `step_completed` al `entry_step_id` del libreto
 *      (kickstart convention de Track L · router event-driven semantics).
 *      Si el append retorna `inserted: false` · canon-canonical-dedup hit
 *      · NO se invoca el router (canon-canon-ya se procesó).
 *   6. Lee la journey-state projection · llama `decide()` · LOGUEA cada
 *      Decision via el logger inyectable. NO se appendean eventos
 *      adicionales · NO se enqueua nada al executor · NO se invoca el
 *      bucket atómico real (canon-canon-allowAllBudgetStub canónico).
 *
 * §148 honest · canon canon-canon-cuando PR #154 merge ·
 *   `processSalaEventShadow(trigger_event, config)` se vuelve la fuente
 *   canónica del paso (6). Mientras tanto · Track Q usa el mismo
 *   `decide()` de Track H + la misma `readJourneyState` de Track F +
 *   el mismo log shape de #154 → cero schema drift cuando merge ocurra
 *   (canon-canonical-swap es 1-línea en el body de dispatchSalaTrigger).
 */
import { randomUUID, createHash } from 'node:crypto'
import {
  append,
  buildIdempotencyKey,
  InMemoryEventLogStorage,
  type EventAppendInput,
  type EventLogStorage,
  type PersistedEvent,
} from '@/lib/sala-event-log'
import {
  decide,
  allowAllBudgetStub,
  type BudgetCheckFn,
  type Decision,
  type LibretoLookup,
  type ResolveNextStepFn,
} from '@/lib/sala-router'
import { readJourneyState } from '@/lib/sala-journey-state'
import { CANONICAL_LIBRETOS, type JourneyType } from '@/lib/sala/libretos'
import { createInterpreterAdapter } from '@/lib/sala-integration'
import {
  consoleSalaTriggerLogger,
  type SalaTriggerInput,
  type SalaTriggerLogger,
  type SalaTriggerResult,
  type SalaTriggerShadowLog,
} from './types'
import { evaluateTriggerSafety, readEnvSafety } from './safety'

// canon · canon canonical UUID v5 namespace · arbitrario pero canon-canon-
// canon-stable per repo · canon-canonical-RFC 4122 v5 no está nativo en
// Node sin dep externa · canon-canon-derivamos con SHA1 + format manual.
// Equivalente funcional a `uuidv5(NAMESPACE, name)` · canon-canonical-no
// pisa la dep uuid del repo.
const STREAM_NAMESPACE = 'sala-trigger-v1'

function deterministicStreamId(parts: {
  tenant_id: string
  journey_type: string
  client_id: string
  logical_period: string
  external_id: string
}): string {
  const input = [
    STREAM_NAMESPACE,
    parts.tenant_id,
    parts.journey_type,
    parts.client_id,
    parts.logical_period,
    parts.external_id,
  ].join('|')
  const hash = createHash('sha1').update(input).digest()
  // canon · canon canonical RFC 4122 v5 uuid layout · canon-canonical
  // canon-name-based · canon-bytes 6 + 8 forced per spec.
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // canon · version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // canon · variant RFC 4122
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function inputHashFromSource(source: string, external_id: string): string {
  return createHash('sha256').update(`${source}::${external_id}`).digest('hex')
}

// =====================================================================
// canon · public config
// =====================================================================

export interface DispatchSalaTriggerConfig {
  /** Canon canonical · canon canon-canon-Supabase adapter en prod ·
   *  canon canon-InMemoryEventLogStorage en tests. */
  readonly storage: EventLogStorage
  /** Canon canonical · default `canonicalPredicateRegistry`. */
  readonly resolve_next_step?: ResolveNextStepFn
  /** Canon canonical · default `allowAllBudgetStub` · canon-canon-G6 real
   *  se wirea en escalón 4 (NOT this PR). */
  readonly budget_check?: BudgetCheckFn
  /** Canon canonical · default · `CANONICAL_LIBRETOS[journey_type]`. */
  readonly libreto_lookup?: LibretoLookup
  /** Canon canonical · default `consoleSalaTriggerLogger` · canon-tests
   *  inyectan `createInMemorySalaTriggerLogger().logger`. */
  readonly logger?: SalaTriggerLogger
  /** Canon canonical · override env reads (canon-canonical-tests + canon-
   *  canon-route handler con overrides explícitos). */
  readonly safety_override?: {
    readonly shadow_flag?: string
    readonly real_sources_flag?: string
  }
}

// =====================================================================
// canon · refused helper
// =====================================================================

function refused(
  reason: string,
  stream_id: string,
): SalaTriggerResult {
  return {
    mode: 'refused',
    inserted: null,
    stream_id,
    trigger_event: null,
    decisions: [],
    logs: [],
    refused_reason: reason,
  }
}

// =====================================================================
// canon · core dispatch
// =====================================================================

/**
 * Canon canonical · public · `dispatchSalaTrigger` · pure shadow trigger.
 *
 * canon · canon canon-canon-input validation · safety eval · libreto
 * lookup · stream_id derivation · idempotent append · decide() · log.
 */
export async function dispatchSalaTrigger(
  input: SalaTriggerInput,
  config: DispatchSalaTriggerConfig,
): Promise<SalaTriggerResult> {
  // canon · canon canon-derive stream_id early para que refused responses
  // canon canon-canon-tengan canonical trace info.
  const stream_id =
    input.stream_id ??
    deterministicStreamId({
      tenant_id: input.tenant_id,
      journey_type: input.journey_type,
      client_id: input.client_id,
      logical_period: input.logical_period,
      external_id: input.external_id,
    })

  // canon · canon canon-validate required fields
  if (!input.tenant_id || !input.client_id || !input.external_id || !input.logical_period) {
    return refused(
      'validation_error · canon-canon-tenant_id + client_id + external_id + logical_period required',
      stream_id,
    )
  }

  // canon · canon canon-safety gate
  const safety = config.safety_override
    ? evaluateTriggerSafety({
        source: input.source,
        shadowFlag: config.safety_override.shadow_flag,
        realSourcesFlag: config.safety_override.real_sources_flag,
      })
    : readEnvSafety(input.source)
  if (!safety.allowed) return refused(safety.reason, stream_id)

  // canon · canon canon-libreto lookup
  const libretoLookup: LibretoLookup =
    config.libreto_lookup ??
    ((j) => CANONICAL_LIBRETOS[j as JourneyType] ?? undefined)
  const libreto = libretoLookup(input.journey_type)
  if (!libreto) {
    return refused(
      `libreto_not_found · canon-canon-journey_type=${input.journey_type}`,
      stream_id,
    )
  }
  // canon · canon canon-Track Q ships Journey B only · canon-canon-otras
  // canon canon-journeys validan el libreto pero retornan refused hasta
  // canon canon-tener triggers propios. canon canon-evita que un misfire
  // canon canon-genere streams de ALWAYS_ON / REVIEW / ACQUIRE en shadow.
  if (input.journey_type !== 'ONBOARD') {
    return refused(
      `source_not_supported · canon-canon-Track Q ships ONBOARD only · canon-canon-${input.journey_type} pending`,
      stream_id,
    )
  }

  // canon · canon canon-build deterministic idempotency_key
  const idempotency_key = buildIdempotencyKey({
    operation_type: `${input.journey_type}.${libreto.entry_step_id}.trigger`,
    client_id: input.client_id,
    logical_period: input.logical_period,
    input_hash: inputHashFromSource(input.source, input.external_id),
  })

  const correlation_id = input.correlation_id ?? randomUUID()

  // canon · canon canon-append the trigger event · canon-canon-step_completed
  // canon-canon-at entry_step (Track L kickstart convention).
  const eventInput: EventAppendInput = {
    tenant_id: input.tenant_id,
    client_id: input.client_id,
    stream_id,
    correlation_id,
    causation_id: null,
    event_type: 'step_completed',
    journey_type: input.journey_type,
    operation_type: `${input.journey_type}.${libreto.entry_step_id}`,
    idempotency_key,
    logical_period: input.logical_period,
    step_id: libreto.entry_step_id,
    step_state: 'done',
    payload: {
      ...input.payload,
      __sala_trigger: {
        canon: 'sala-trigger-v1',
        source: input.source,
        external_id: input.external_id,
        mode: 'shadow',
      },
    },
    gate_type: null,
  }
  const appendResult = await append(config.storage, eventInput)
  const trigger_event: PersistedEvent = appendResult.event

  // canon · canon canon-dedup hit · canon-canon-NO re-run del router ·
  // canon-canon-el primer dispatch ya emitió + logueó las decisiones.
  if (!appendResult.inserted) {
    return {
      mode: 'shadow',
      inserted: false,
      stream_id,
      trigger_event,
      decisions: [],
      logs: [],
    }
  }

  // canon · canon canon-derive projection + decide + log
  const journey_state = await readJourneyState(config.storage, {
    tenant_id: input.tenant_id,
    stream_id,
  })

  const resolveNextStep: ResolveNextStepFn =
    config.resolve_next_step ?? createInterpreterAdapter()
  const budgetCheck: BudgetCheckFn = config.budget_check ?? allowAllBudgetStub

  const decisions: Decision[] = decide({
    event: trigger_event,
    journey_state,
    libreto_lookup: libretoLookup,
    resolve_next_step: resolveNextStep,
    budget_check: budgetCheck,
  })

  const logger: SalaTriggerLogger = config.logger ?? consoleSalaTriggerLogger
  const logged_at = new Date().toISOString()
  const logs: SalaTriggerShadowLog[] = decisions.map((decision, decision_index) => {
    const entry: SalaTriggerShadowLog = {
      canon: 'sala-shadow-router',
      mode: 'shadow',
      logged_at,
      trigger_event_id: trigger_event.event_id,
      trigger_event_type: trigger_event.event_type,
      stream_id,
      correlation_id,
      tenant_id: input.tenant_id,
      client_id: input.client_id,
      journey_type: input.journey_type,
      decision_kind: decision.kind,
      decision,
      decision_index,
      decision_count: decisions.length,
      trigger_source: input.source,
    }
    logger(entry)
    return entry
  })

  return {
    mode: 'shadow',
    inserted: true,
    stream_id,
    trigger_event,
    decisions,
    logs,
  }
}

// =====================================================================
// canon · test convenience · canon-canonical-NO prod use
// =====================================================================

/**
 * Canon canonical · build an in-memory dispatcher config · canon-canon
 * canon-test helper · canon-canon-route + cron use buildSupabaseConfig
 * (downstream · canon-canon-canon-not this PR).
 */
export function buildInMemoryDispatchConfig(
  partial: Partial<DispatchSalaTriggerConfig> = {},
): DispatchSalaTriggerConfig {
  return {
    storage: partial.storage ?? new InMemoryEventLogStorage(),
    resolve_next_step: partial.resolve_next_step,
    budget_check: partial.budget_check,
    libreto_lookup: partial.libreto_lookup,
    logger: partial.logger,
    safety_override: partial.safety_override ?? {
      shadow_flag: 'true',
      real_sources_flag: 'false',
    },
  }
}
