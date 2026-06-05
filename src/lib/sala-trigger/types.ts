/**
 * Track Q · Sprint 12 Fase 0 · ENCENDIDO escalón 5 prep · trigger wire types
 *
 * Owner · CC#1 · integración. Plan ·
 *   zr-vault/00-meta/opus-4-8-traspaso/ENCENDIDO-escalon5-prep-y-pilot-2026-06-04.md
 *
 * Conecta el trigger real de Journey B (webhook de onboarding + cron de
 * detección de nuevos clientes) → handler en SOMBRA → router decide. NO
 * despacha · NO ejecuta · NO flip enforce · NO journeys reales. Solo se
 * activa con el flag explícito + bloquea fuentes reales hasta §144 del
 * escalón 5 (canon canonical-belt-and-suspenders).
 */
import type { Decision } from '@/lib/sala-router'
import type { PersistedEvent } from '@/lib/sala-event-log'
import type { JourneyType } from '@/lib/sala/libretos'

// =====================================================================
// canon · trigger source taxonomy
// =====================================================================

/**
 * Canon canonical · de dónde viene el evento. Decide la política de
 * seguridad (synthetic + cron-scan están permitidos en shadow · real-
 * webhook está bloqueado hasta el §144 del escalón 5).
 *
 * - `synthetic` · canon canon-canon-vitest + smoke harness · canon
 *   canon-cliente sintético · `client_id` empieza con `smoke-` o
 *   `synthetic-`. Siempre permitido en shadow.
 * - `cron_new_clients_scan` · canon canonical-cron interno que detecta
 *   nuevos `clients` rows con `status='pending_onboarding'` · canon
 *   canon-permitido en shadow (canon-canon-NO dispatch real · solo log).
 * - `webhook_onboarding_form` · canon canonical-form Tally / handler real
 *   externo. Bloqueado por defecto hasta §144 del escalón 5 (canon-canon-
 *   `SALA_TRIGGERS_REAL_SOURCES_ENABLED=true` para activarlo manualmente
 *   en deploys de testing).
 */
export type TriggerSource =
  | 'synthetic'
  | 'cron_new_clients_scan'
  | 'webhook_onboarding_form'

// =====================================================================
// canon · input shape · canon-canonical aceptado por dispatchSalaTrigger()
// =====================================================================

/**
 * Canon canonical · input de un trigger de onboarding (Journey B). El
 * shape es source-agnostic · el webhook + el cron + los tests producen
 * el mismo struct.
 */
export interface SalaTriggerInput {
  /** Canon canonical · multi-tenant scope · UUID. */
  readonly tenant_id: string
  /** Canon canonical · entidad de negocio · UUID o slug. */
  readonly client_id: string
  /** Canon canonical · libreto seleccionado · canon-canon-Track Q ships
   *  Journey B (`ONBOARD`) only · canon-canon-otras journeys validan
   *  pero retornan canon canonical-`source_not_supported` hasta tener
   *  triggers propios. */
  readonly journey_type: JourneyType
  /** Canon canonical · de dónde llega · controla policy + telemetry. */
  readonly source: TriggerSource
  /** Canon canonical · ID de la fuente externa (Tally submission_id ·
   *  clients.id del cron · canon-canon-test fixture id) · canon canon-
   *  canon-input_hash component · canon canonical-makes re-disparos del
   *  mismo formulario dedup naturalmente. */
  readonly external_id: string
  /** Canon canonical · período lógico bajo el que se agrupa el journey
   *  · canon canonical "2026-W23" · canon-canon-canon-cliente puede
   *  re-onboard en otra semana → nuevo stream. */
  readonly logical_period: string
  /** Canon canonical · payload de negocio · brief · website · industry
   *  · canon-canon-opaque al router · canon-canon-vive en el evento
   *  para que Mitad 2 + downstream handlers tengan contexto. */
  readonly payload?: Record<string, unknown>
  /** Canon canonical · stream_id explícito · canon-canon-replay/test ·
   *  canon-canonical-si se omite se deriva determinístico de
   *  `tenant::journey::client::logical_period`. */
  readonly stream_id?: string
  /** Canon canonical · correlation_id explícito · canon-canonical-default
   *  random UUID por trigger (canon-canon-canon-distinct correlation
   *  trace per dispatch). */
  readonly correlation_id?: string
}

// =====================================================================
// canon · output shape · canon-NO side-effect beyond the trigger event
// =====================================================================

/**
 * Canon canonical · resultado de un trigger procesado en SOMBRA.
 *
 * §148 honest · canon-canon-`decisions` son lo que el router HARÍA si
 * estuviéramos en enforce. En shadow se loguean canon canonical-NO se
 * traduce a eventos appended (canon canonical-trigger_event es el único
 * row que aterriza en el log).
 */
export interface SalaTriggerResult {
  /** Canon canonical · canon-canonical-shadow until escalón 5 §144. */
  readonly mode: 'shadow' | 'refused'
  /** Canon canonical · `true` si esta llamada appendeó el trigger event
   *  · `false` si la idempotency dedup ya tenía la fila · `null` si la
   *  llamada fue rechazada antes de tocar el log. */
  readonly inserted: boolean | null
  /** Canon canonical · stream_id usado · derivado o pasado · útil para
   *  forensics + correlation cross-call. */
  readonly stream_id: string
  /** Canon canonical · el evento que aterrizó en el log · canon-canon-
   *  null si refused o si dedup hizo no-op + caller no quería el row. */
  readonly trigger_event: PersistedEvent | null
  /** Canon canonical · canon-canonical-Decisions emitidas por el router ·
   *  canon-canon-empty si la llamada fue rechazada. */
  readonly decisions: ReadonlyArray<Decision>
  /** Canon canonical · structured log entries · 1 per decision · misma
   *  shape que canon-canon-PR #154 ShadowDecisionLog para que el wire-up
   *  futuro a `processSalaEventShadow` no requiera cambios de schema. */
  readonly logs: ReadonlyArray<SalaTriggerShadowLog>
  /** Canon canonical · razón si `mode='refused'` · canon-canon-flag OFF ·
   *  canon-canon-real-source blocked · canon-canon-auth fail · canon-
   *  canon-validation fail. */
  readonly refused_reason?: string
}

/**
 * Canon canonical · structured log entry · 1 entry per emitted Decision.
 * Compatible canon-canonical-PR #154 `ShadowDecisionLog` shape · canon-
 * canon-NO drift cuando merge.
 */
export interface SalaTriggerShadowLog {
  readonly canon: 'sala-shadow-router'
  readonly mode: 'shadow'
  readonly logged_at: string
  readonly trigger_event_id: string
  readonly trigger_event_type: string
  readonly stream_id: string
  readonly correlation_id: string
  readonly tenant_id: string
  readonly client_id: string
  readonly journey_type: string
  readonly decision_kind: Decision['kind']
  readonly decision: Decision
  readonly decision_index: number
  readonly decision_count: number
  /** Canon canonical · canon-source taxonomy · canon-canon-PR #154 NO
   *  tiene este campo · canon-canon-Track Q canon-extra-info útil para
   *  filtrar synthetic vs real en log scrapers. */
  readonly trigger_source: TriggerSource
}

// =====================================================================
// canon · injectable logger · canon-canon-tests capturan in-memory
// =====================================================================

export type SalaTriggerLogger = (entry: SalaTriggerShadowLog) => void

/**
 * Canon canonical · default · canon canonical canon-stdout JSON line ·
 * canon-canon-Vercel + Sentry breadcrumbs pick up sin adapter code.
 */
export const consoleSalaTriggerLogger: SalaTriggerLogger = (entry) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry))
}

/**
 * Canon canonical · in-memory logger · canon-canon-test helper · captura
 * decisions para assertions.
 */
export function createInMemorySalaTriggerLogger(): {
  logger: SalaTriggerLogger
  entries: SalaTriggerShadowLog[]
} {
  const entries: SalaTriggerShadowLog[] = []
  const logger: SalaTriggerLogger = (entry) => entries.push(entry)
  return { logger, entries }
}
