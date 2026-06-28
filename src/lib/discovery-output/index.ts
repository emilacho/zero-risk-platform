/**
 * Canon canonical · public surface · src/lib/discovery-output/
 *
 * Closes the agéntico loop (Lenovo SPEC 2026-06-05) ·
 *   1. parse Discovery output from agent text → typed DiscoveryOutput
 *   2. persist to brain (competitive_landscape + icp_documents + chunks)
 *   3. populate clients.config.apify (own_handles + competitor_list)
 *
 * Default-OFF via `SALA_DISCOVERY_BRAIN_PUSH_ENABLED` · reversible (flag off
 * → all calls noop · zero side effects) · idempotent (re-run with same input
 * = same DB state).
 */

export type {
  DiscoveredCompetitor,
  DiscoveredIcpSegment,
  DiscoveryOutput,
  DiscoveryParseResult,
  DiscoveryPersistOutcome,
  DiscoverySocialHandles,
} from './types'

export {
  extractJsonCandidates,
  parseDiscoveryOutput,
  validateDiscoveryShape,
} from './parse'

export {
  competitorChunks,
  icpChunks,
  isDiscoveryBrainPushEnabled,
  persistDiscoveryToBrain,
  type PersistDiscoveryToBrainInput,
} from './persist-brain'

export {
  populateClientConfigFromDiscovery,
  type PopulateConfigInput,
  type PopulateConfigResult,
} from './populate-config'

export {
  resolveDiscoverySource,
  type DiscoveryResolveResult,
  type ResolveDiscoverySourceInput,
} from './resolve-source'

export {
  ensureClientExists,
  parseClientIdentityFromTask,
  type EnsureClientInput,
  type EnsureClientResult,
  type ParsedClientIdentity,
} from './ensure-client'
