/**
 * Tests · sala-ingress routing · scope + rule interpretation.
 */
import { describe, it, expect } from 'vitest'
import {
  checkIntentScope,
  interpretRoutingRule,
  type IngressSource,
  type RoutingRule,
} from '@/lib/sala-ingress'

const SOURCE_VENTAS: IngressSource = {
  source: 'ventas/deal-won',
  tier: 'B',
  auth_method: 'hmac',
  auth_secret_env_var: 'X',
  intents_allowed: ['onboard'],
  description: null,
  active: true,
}

const RULE_ONBOARD: RoutingRule = {
  id: 'rule-1',
  source: 'ventas/deal-won',
  intent: 'onboard',
  journey_type: 'ONBOARD',
  worker_workflow_id: 'LyVoKcrypS5uLyuu',
  active: true,
  priority: 100,
  description: null,
}

describe('checkIntentScope', () => {
  it('accepts intent in allowed list', () => {
    expect(checkIntentScope({ source: SOURCE_VENTAS, intent: 'onboard' }).ok).toBe(true)
  })

  it('rejects intent not in allowed list', () => {
    const r = checkIntentScope({ source: SOURCE_VENTAS, intent: 'campaign' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/intent_not_in_scope/)
  })

  it('rejects inactive source', () => {
    const r = checkIntentScope({
      source: { ...SOURCE_VENTAS, active: false },
      intent: 'onboard',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source_inactive')
  })
})

describe('interpretRoutingRule', () => {
  it('returns journey_type + worker_workflow_id on active rule', () => {
    const r = interpretRoutingRule(RULE_ONBOARD)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.journey_type).toBe('ONBOARD')
      expect(r.value.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
    }
  })

  it('accepts worker_workflow_id null for legacy agent path', () => {
    const r = interpretRoutingRule({
      ...RULE_ONBOARD,
      worker_workflow_id: null,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.worker_workflow_id).toBeNull()
  })

  it('refuses inactive rule', () => {
    const r = interpretRoutingRule({ ...RULE_ONBOARD, active: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('routing_rule_inactive')
  })

  it('refuses missing journey_type', () => {
    const r = interpretRoutingRule({ ...RULE_ONBOARD, journey_type: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('routing_rule_missing_journey_type')
  })
})
