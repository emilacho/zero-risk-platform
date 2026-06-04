/**
 * Public surface · `src/lib/sala-blackboard/`
 *
 * Sprint 12 Fase 0 Ronda 2 Track D · CC#1.
 *
 * Blackboard compartido (campaign_lifecycle_artifacts) **derivado del event-log**
 * · proyección append-only · cierra gap #5 (NEXUS merge ad-hoc en JS).
 *
 * Build on top of canon canonical `src/lib/sala-event-log/` (Track A · PR #143).
 */

export type {
  ArtifactWrite,
  ArtifactWritePayload,
  CampaignArtifact,
  BlackboardState,
  WriteArtifactsInput,
  ReadBlackboardInput,
} from './types'

export { projectBlackboard } from './projection'
export type { ProjectBlackboardOptions } from './projection'

export { writeArtifacts } from './write'
export type { WriteArtifactsResult } from './write'

export { readBlackboard } from './read'
