/**
 * Camino III · lazo de corrección · orquestación (SPEC 2026-06-27 §5/§7) · §144.
 *
 * Cierra el lazo vía la sala (cero worker→worker directo · ADR-018) ·
 *   REJECT + correcciones → persist editorial_decisions (revision_count) →
 *   evento LIGERO `correction_required` al sala_event_log (item_id · NO el
 *   texto) → router re-despacha "corregir" al creador → re-voto.
 *
 * Tope §150 · 3 ciclos · al 4º REJECT → ESCALATE → humano. Evita loop infinito
 * + costo runaway. Idempotencia por (item_type,item_id) en editorial_decisions.
 *
 * §148 honest · persist NEVER throws (fail-open · tagged result) · requiere
 * migración 202606271200 aplicada (corrections + revision_count) · degrada a
 * error tagged hasta entonces.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsolidatedCorrection } from './corrections'

/** Canon · tope de ciclos de corrección (§150 guardrail #2). */
export const CORRECTION_CYCLE_CAP = 3

/** Canon · el event_type del lazo (migración 202606271200 · enum). */
export const CORRECTION_REQUIRED_EVENT = 'correction_required'

/** Decisión del cap · qué hacer ante un REJECT dado el revision_count actual. */
export type CorrectionCapAction = 're_dispatch' | 'escalate_human'

export interface CorrectionCapDecision {
  readonly action: CorrectionCapAction
  /** revision_count que queda persistido tras esta decisión. */
  readonly next_revision_count: number
  readonly reason: string
}

/**
 * Evaluate the 3-cycle cap on a REJECT. `current_revision_count` is how many
 * correction cycles the piece has ALREADY been through (0 = first review).
 *
 * - already did `CAP` (3) cycles and still rejected → ESCALATE to human.
 * - otherwise → re-dispatch a correction cycle · revision_count++.
 */
export function evaluateCorrectionCap(
  current_revision_count: number,
): CorrectionCapDecision {
  const current = Math.max(0, Math.floor(current_revision_count))
  if (current >= CORRECTION_CYCLE_CAP) {
    return {
      action: 'escalate_human',
      next_revision_count: current,
      reason: `revision_count ${current} reached cap ${CORRECTION_CYCLE_CAP} · escalate to human (§150)`,
    }
  }
  return {
    action: 're_dispatch',
    next_revision_count: current + 1,
    reason: `revision cycle ${current + 1}/${CORRECTION_CYCLE_CAP} · re-dispatch to creator`,
  }
}

/** Payload LIGERO del evento `correction_required` · referencia, NO el texto.
 *  El worker lee el detalle de editorial_decisions por item_id (1 fuente). */
export interface CorrectionRequiredEvent {
  readonly event_type: typeof CORRECTION_REQUIRED_EVENT
  readonly item_type: string
  readonly item_id: string
  readonly verdict: 'REJECT'
  readonly revision_count: number
  /** = stream_id de la sala · §149 (_journey_id). */
  readonly journey_id: string
  readonly client_id: string | null
  /** Operation label · usa el nombre dotted del SPEC §5 para trazabilidad. */
  readonly operation_type: 'camino_iii.rejected_with_corrections'
}

export interface BuildCorrectionEventInput {
  readonly item_type: string
  readonly item_id: string
  readonly revision_count: number
  readonly journey_id: string
  readonly client_id?: string | null
}

/** Build the light event the router consumes to re-dispatch the creator. */
export function buildCorrectionRequiredEvent(
  input: BuildCorrectionEventInput,
): CorrectionRequiredEvent {
  return {
    event_type: CORRECTION_REQUIRED_EVENT,
    item_type: input.item_type,
    item_id: input.item_id,
    verdict: 'REJECT',
    revision_count: input.revision_count,
    journey_id: input.journey_id,
    client_id: input.client_id ?? null,
    operation_type: 'camino_iii.rejected_with_corrections',
  }
}

export interface PersistCorrectionInput {
  readonly review_id: string
  readonly item_type: string
  readonly item_id: string
  readonly client_id?: string | null
  readonly corrections: ReadonlyArray<ConsolidatedCorrection>
  /** revision_count to persist (post-cap-decision · the next value). */
  readonly revision_count: number
  /** terminal status · REJECT keeps the loop open · ESCALATE goes to human. */
  readonly status: 'REJECT' | 'ESCALATE'
  readonly rationale?: string | null
}

export interface PersistCorrectionResult {
  readonly ok: boolean
  readonly written: boolean
  readonly reason?: string
}

export interface PersistCorrectionDeps {
  readonly now?: () => number
  readonly logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void
    info(msg: string, ctx?: Record<string, unknown>): void
  }
}

const defaultLogger = {
  warn(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[camino-iii/correction-loop] ${msg}`, ctx ?? {})
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.log(`[camino-iii/correction-loop] ${msg}`, ctx ?? {})
  },
}

/**
 * UPSERT the editorial_decisions row for this piece with the consolidated
 * correction package + the new revision_count. Anchored by (item_type,item_id)
 * (UNIQUE · migración 202606271200) so re-entry updates the SAME expediente.
 * Status REJECT keeps the loop open · ESCALATE marks it for human review.
 *
 * NEVER throws · fail-open tagged result.
 */
export async function persistCorrectionDecision(
  supabase: Pick<SupabaseClient, 'from'>,
  input: PersistCorrectionInput,
  deps: PersistCorrectionDeps = {},
): Promise<PersistCorrectionResult> {
  const logger = deps.logger ?? defaultLogger
  const now = deps.now ?? Date.now
  try {
    const { data, error } = await supabase
      .from('editorial_decisions')
      .upsert(
        {
          review_id: input.review_id,
          item_type: input.item_type,
          item_id: input.item_id,
          client_id: input.client_id ?? null,
          status: input.status === 'ESCALATE' ? 'RESOLVED' : 'PENDING',
          final_verdict: input.status === 'ESCALATE' ? 'ESCALATE' : null,
          corrections: input.corrections,
          revision_count: input.revision_count,
          rationale: input.rationale ?? null,
          resolved_at:
            input.status === 'ESCALATE' ? new Date(now()).toISOString() : null,
        },
        { onConflict: 'item_type,item_id' },
      )
      .select('id')

    if (error) {
      logger.warn('upsert failed (migration applied?) · fail_open', {
        item_id: input.item_id,
        error: error.message,
      })
      return { ok: false, written: false, reason: error.message }
    }
    logger.info('correction decision persisted', {
      item_id: input.item_id,
      revision_count: input.revision_count,
      status: input.status,
      corrections: input.corrections.length,
    })
    return { ok: true, written: !!data && data.length > 0 }
  } catch (e) {
    logger.warn('upsert threw · fail_open', {
      item_id: input.item_id,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      ok: false,
      written: false,
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}
