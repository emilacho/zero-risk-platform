/**
 * Inngest wire · public re-exports · Escalón 2 SHADOW.
 *
 * Consumers (smoke scripts, future router wire) import from here so
 * the internal module layout can move without touching callers.
 */
export {
  INNGEST_APP_ID,
  inngestClient,
  getSalaInngestMode,
  type SalaInngestMode,
} from './client'
export {
  SYNTHETIC_DURABILITY_EVENT,
  SYNTHETIC_FUNCTIONS,
  syntheticDurabilityTest,
} from './synthetic-functions'
