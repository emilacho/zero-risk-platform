/**
 * Live Inngest function registry · Sprint 12 Fase 0 Inngest binding · §144.
 *
 * Real journey/gate functions that touch the production durable-wait path.
 * Registered with the serve handler ONLY when `SALA_INNGEST_MODE=live`
 * (default 'shadow' keeps this set DARK · encendido = lote §144). Kept SEPARATE
 * from `SYNTHETIC_FUNCTIONS` (always-on $0 probes) so the live/shadow boundary
 * is one explicit list, not a per-function flag scattered around.
 *
 * §148 honest · today this holds the editorial gate (Camino III 24h HITL wait).
 * As more durable journeys land they register here · the flip stays one gate.
 */
import { editorialGateFn } from './editorial-gate'

/** The set of LIVE functions · registered only in `SALA_INNGEST_MODE=live`. */
export const LIVE_FUNCTIONS = [editorialGateFn] as const
