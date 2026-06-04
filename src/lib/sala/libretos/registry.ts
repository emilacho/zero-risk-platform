/**
 * Libretos registry · canonical map JourneyType → Libreto.
 *
 * Single source of truth for "which libreto handles which journey".
 * The router (Mitad 2 · §144) consumes this to find the libreto for
 * an incoming event's journey_type.
 *
 * GROWTH is included but flagged `pending_144` in its metadata · the
 * router renders an explicit §144 gate as the first step until Emilio
 * approves the 6-journey taxonomy adoption.
 */
import type { JourneyType, Libreto } from './types'
import { onboardLibreto } from './journeys/onboard'
import { produceLibreto } from './journeys/produce'
import { alwaysOnLibreto } from './journeys/always-on'
import { reviewLibreto } from './journeys/review'
import { acquireLibreto } from './journeys/acquire'
import { growthLibreto } from './journeys/growth'

/** Canonical map · ordered by lifecycle (ACQUIRE → ONBOARD → PRODUCE
 *  → REVIEW + ALWAYS_ON in parallel · GROWTH as add-on tier). */
export const CANONICAL_LIBRETOS: Readonly<Record<JourneyType, Libreto>> = {
  ACQUIRE: acquireLibreto,
  ONBOARD: onboardLibreto,
  PRODUCE: produceLibreto,
  REVIEW: reviewLibreto,
  ALWAYS_ON: alwaysOnLibreto,
  GROWTH: growthLibreto,
}

/** Look up the libreto for a journey type. Returns `null` if the
 *  journey type is not in the canonical set (defensive · the type
 *  system should prevent this). */
export function getLibreto(type: JourneyType): Libreto | null {
  return CANONICAL_LIBRETOS[type] ?? null
}

/** Return the list of canonical journey types in lifecycle order. */
export function listJourneys(): ReadonlyArray<JourneyType> {
  return Object.keys(CANONICAL_LIBRETOS) as JourneyType[]
}

/** Return only the libretos that are ready to be enforced by the
 *  router (status === 'ready'). Useful for the router to decide
 *  which journeys can dispatch versus which still wait on §144 or
 *  shadow validation. */
export function listEnforceableLibretos(): ReadonlyArray<Libreto> {
  return Object.values(CANONICAL_LIBRETOS).filter(
    (l) => l.metadata.status === 'ready',
  )
}

/** Return libretos awaiting §144 (status === 'pending_144'). The
 *  router surfaces these to the operator dashboard for awareness. */
export function listPending144Libretos(): ReadonlyArray<Libreto> {
  return Object.values(CANONICAL_LIBRETOS).filter(
    (l) => l.metadata.status === 'pending_144',
  )
}
