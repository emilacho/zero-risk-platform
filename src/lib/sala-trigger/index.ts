/**
 * Track Q · Sprint 12 Fase 0 · ENCENDIDO escalón 5 prep · public surface.
 *
 * Plan · `zr-vault/00-meta/opus-4-8-traspaso/ENCENDIDO-escalon5-prep-y-pilot-2026-06-04.md`.
 */

export {
  dispatchSalaTrigger,
  buildInMemoryDispatchConfig,
  type DispatchSalaTriggerConfig,
} from './dispatch'

export {
  evaluateTriggerSafety,
  readEnvSafety,
  type TriggerSafetyDecision,
} from './safety'

export {
  consoleSalaTriggerLogger,
  createInMemorySalaTriggerLogger,
  type SalaTriggerInput,
  type SalaTriggerLogger,
  type SalaTriggerResult,
  type SalaTriggerShadowLog,
  type TriggerSource,
} from './types'
