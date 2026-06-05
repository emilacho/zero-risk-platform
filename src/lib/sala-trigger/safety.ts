/**
 * Track Q · Sprint 12 Fase 0 · safety gates para el trigger wire.
 *
 * Dos flags · canon canonical-belt-and-suspenders ·
 *
 * - `SALA_SHADOW_TRIGGERS_ENABLED` · master gate. Default OFF · canon-
 *   canon-canon-cualquier trigger es rechazado con `flag_disabled`.
 *   Habilitar manualmente en deploy de testing (Vercel preview / dev).
 *
 * - `SALA_TRIGGERS_REAL_SOURCES_ENABLED` · sub-gate. Default OFF · canon-
 *   canon-canon-`webhook_onboarding_form` rechazado con
 *   `real_source_blocked`. `synthetic` + `cron_new_clients_scan` siempre
 *   permitidos cuando el master gate está ON. Se enciende explicitamente
 *   en el §144 del escalón 5 (junto al flip enforce del executor).
 *
 * §148 honest · canon canon-canon-environment-based feature flags · canon
 * canon-canon-NO DB-backed flag table · canon-canon-más simple + canon-
 * canon-igualmente reversible (Vercel env var redeploy).
 */
import type { TriggerSource } from './types'

export interface TriggerSafetyDecision {
  readonly allowed: boolean
  readonly reason: string
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on'])

function flagOn(envVar: string | undefined): boolean {
  if (!envVar) return false
  return TRUE_VALUES.has(envVar.toLowerCase().trim())
}

/**
 * Canon canonical · evalúa los flags + la source taxonomy. Pure ·
 * inspectable · canon-canon-tests pasan env mocks.
 */
export function evaluateTriggerSafety(opts: {
  source: TriggerSource
  shadowFlag?: string
  realSourcesFlag?: string
}): TriggerSafetyDecision {
  // canon · master gate
  if (!flagOn(opts.shadowFlag)) {
    return {
      allowed: false,
      reason:
        'flag_disabled · SALA_SHADOW_TRIGGERS_ENABLED!=true · canon-canonical-master gate OFF (default · escalón 5 prep)',
    }
  }
  // canon · synthetic + cron-scan siempre permitidos cuando master ON
  if (opts.source === 'synthetic') return { allowed: true, reason: 'synthetic_always_allowed' }
  if (opts.source === 'cron_new_clients_scan') {
    return { allowed: true, reason: 'cron_scan_always_allowed_in_shadow' }
  }
  // canon · real webhook · sub-gate
  if (!flagOn(opts.realSourcesFlag)) {
    return {
      allowed: false,
      reason:
        'real_source_blocked · SALA_TRIGGERS_REAL_SOURCES_ENABLED!=true · canon-canonical-§144 del escalón 5 antes de flip',
    }
  }
  return { allowed: true, reason: 'real_source_explicitly_enabled' }
}

/**
 * Canon canonical · default reader from `process.env` · canon-canon-route
 * + tests pueden pasar overrides directos.
 */
export function readEnvSafety(source: TriggerSource): TriggerSafetyDecision {
  return evaluateTriggerSafety({
    source,
    shadowFlag: process.env.SALA_SHADOW_TRIGGERS_ENABLED,
    realSourcesFlag: process.env.SALA_TRIGGERS_REAL_SOURCES_ENABLED,
  })
}
