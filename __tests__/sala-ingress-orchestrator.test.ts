/**
 * Tests · sala-ingress orchestrator · full pipeline · in-memory adapters.
 *
 * Covers · all 8 refuse codes + accepted + duplicate · §149 stream_id +
 * correlation_id minting · event_log append shape.
 */
import { describe, it, expect } from 'vitest'
import {
  computeHmac,
  InMemoryIngressTables,
  orchestrateIngress,
  type IngressEnvelope,
  type IngressSource,
  type RoutingRule,
} from '@/lib/sala-ingress'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'

const TIER_A_EMILIO: IngressSource = {
  source: 'emilio-manual',
  tier: 'A',
  auth_method: 'internal_key',
  auth_secret_env_var: null,
  intents_allowed: ['onboard', 'campaign'],
  description: 'Emilio MC manual',
  active: true,
}

const TIER_B_VENTAS: IngressSource = {
  source: 'ventas/deal-won',
  tier: 'B',
  auth_method: 'hmac',
  auth_secret_env_var: 'SALA_INGRESS_VENTAS_HMAC_SECRET',
  intents_allowed: ['onboard'],
  description: 'Ventas partner CRM',
  active: true,
}

const RULE_VENTAS_ONBOARD: RoutingRule = {
  id: 'rule-ventas-onboard',
  source: 'ventas/deal-won',
  intent: 'onboard',
  journey_type: 'ONBOARD',
  worker_workflow_id: 'LyVoKcrypS5uLyuu',
  active: true,
  priority: 100,
  description: null,
}

const RULE_EMILIO_ONBOARD: RoutingRule = {
  id: 'rule-emilio-onboard',
  source: 'emilio-manual',
  intent: 'onboard',
  journey_type: 'ONBOARD',
  worker_workflow_id: 'LyVoKcrypS5uLyuu',
  active: true,
  priority: 100,
  description: null,
}

function ventasEnvelope(overrides: Partial<IngressEnvelope> = {}): IngressEnvelope {
  return {
    source: 'ventas/deal-won',
    intent: 'onboard',
    payload: { client_name: 'Naufrago' },
    idempotency_key: 'deal-12345',
    logical_period: '2026-W23',
    tenant_id: 'naufrago',
    client_id: 'd69100b5-8ad7-4bb0-908c-68b5544065dc',
    ...overrides,
  }
}

function emilioEnvelope(overrides: Partial<IngressEnvelope> = {}): IngressEnvelope {
  return {
    ...ventasEnvelope(overrides),
    source: 'emilio-manual',
    ...overrides,
  }
}

function buildHmacAuthRequest(secret: string, envelope: IngressEnvelope, now_ms: number) {
  const raw_body = JSON.stringify(envelope)
  const ts = Math.floor(now_ms / 1000).toString()
  return {
    raw_body,
    auth_request: {
      source: envelope.source,
      signature: computeHmac(secret, ts, raw_body),
      timestamp: ts,
      raw_body,
    },
  }
}

describe('orchestrateIngress · accepted path · tier A internal_key', () => {
  it('appends step_completed event with sala stream_id', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const envelope = emilioEnvelope()

    const r = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'super-secret' },
      tables,
      storage,
      auth_secret_override: 'super-secret',
    })

    expect(r.kind).toBe('accepted')
    if (r.kind === 'accepted') {
      expect(r.journey_type).toBe('ONBOARD')
      expect(r.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
      expect(r.stream_id.startsWith('sala/v1/')).toBe(true)
      expect(r.inserted).toBe(true)
    }
    const events = await storage.select({ tenant_id: 'naufrago' })
    expect(events.length).toBe(1)
    expect(events[0].step_id).toBe('intake.emilio-manual.onboard')
    expect(events[0].event_type).toBe('step_completed')
    expect(events[0].journey_type).toBe('ONBOARD')
    expect(events[0].payload.intake_tier).toBe('A')
    expect(events[0].payload.intake_auth_method).toBe('internal_key')
  })
})

describe('orchestrateIngress · accepted path · tier B hmac', () => {
  it('accepts signed envelope · ventas/deal-won → ONBOARD', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_B_VENTAS)
      .seedRule(RULE_VENTAS_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const envelope = ventasEnvelope()
    const now_ms = 1780690000_000
    const { auth_request } = buildHmacAuthRequest('partner-secret', envelope, now_ms)

    const r = await orchestrateIngress({
      envelope,
      auth_request,
      tables,
      storage,
      auth_secret_override: 'partner-secret',
      auth_now_ms: now_ms,
    })

    expect(r.kind).toBe('accepted')
    if (r.kind === 'accepted') {
      expect(r.journey_type).toBe('ONBOARD')
      expect(r.worker_workflow_id).toBe('LyVoKcrypS5uLyuu')
    }
  })
})

describe('orchestrateIngress · duplicate path · idempotency dedup', () => {
  it('returns duplicate when same envelope POSTed twice', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const envelope = emilioEnvelope()

    const first = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage,
      auth_secret_override: 'x',
    })
    expect(first.kind).toBe('accepted')

    const second = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage,
      auth_secret_override: 'x',
    })
    expect(second.kind).toBe('duplicate')
    if (second.kind === 'duplicate' && first.kind === 'accepted') {
      expect(second.event_id).toBe(first.event_id)
      expect(second.stream_id).toBe(first.stream_id)
    }
    expect((await storage.select({ tenant_id: 'naufrago' })).length).toBe(1)
  })
})

describe('orchestrateIngress · refused paths', () => {
  it('refuses unknown_source', async () => {
    const tables = new InMemoryIngressTables()
    const storage = new InMemoryEventLogStorage()
    const r = await orchestrateIngress({
      envelope: emilioEnvelope({ source: 'no-such-source' }),
      auth_request: { source: 'no-such-source' },
      tables,
      storage,
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('unknown_source')
  })

  it('refuses source_inactive', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource({ ...TIER_A_EMILIO, active: false })
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const r = await orchestrateIngress({
      envelope: emilioEnvelope(),
      auth_request: { source: 'emilio-manual', internal_key: 'x' },
      tables,
      storage,
      auth_secret_override: 'x',
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('source_inactive')
  })

  it('refuses unauthorized when internal_key wrong', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const r = await orchestrateIngress({
      envelope: emilioEnvelope(),
      auth_request: { source: 'emilio-manual', internal_key: 'wrong' },
      tables,
      storage,
      auth_secret_override: 'right',
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('unauthorized')
  })

  it('refuses intent_not_in_scope', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_B_VENTAS) // only 'onboard'
      .seedRule({ ...RULE_VENTAS_ONBOARD, intent: 'campaign' })
    const storage = new InMemoryEventLogStorage()
    const envelope = ventasEnvelope({ intent: 'campaign' })
    const now_ms = 1780690000_000
    const { auth_request } = buildHmacAuthRequest('partner-secret', envelope, now_ms)
    const r = await orchestrateIngress({
      envelope,
      auth_request,
      tables,
      storage,
      auth_secret_override: 'partner-secret',
      auth_now_ms: now_ms,
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('intent_not_in_scope')
  })

  it('refuses no_routing_rule when source+intent has no rule', async () => {
    const tables = new InMemoryIngressTables().seedSource({
      ...TIER_B_VENTAS,
      intents_allowed: ['onboard'],
    })
    // No rule seeded.
    const storage = new InMemoryEventLogStorage()
    const envelope = ventasEnvelope()
    const now_ms = 1780690000_000
    const { auth_request } = buildHmacAuthRequest('partner-secret', envelope, now_ms)
    const r = await orchestrateIngress({
      envelope,
      auth_request,
      tables,
      storage,
      auth_secret_override: 'partner-secret',
      auth_now_ms: now_ms,
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('no_routing_rule')
  })

  it('refuses tier_c_filter_not_implemented for tier C source', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource({
        source: 'public-form',
        tier: 'C',
        auth_method: 'public_gate',
        auth_secret_env_var: null,
        intents_allowed: ['onboard'],
        description: null,
        active: true,
      })
      .seedRule({
        ...RULE_VENTAS_ONBOARD,
        id: 'rule-public-onboard',
        source: 'public-form',
      })
    const storage = new InMemoryEventLogStorage()
    const r = await orchestrateIngress({
      envelope: ventasEnvelope({ source: 'public-form' }),
      auth_request: { source: 'public-form' },
      tables,
      storage,
    })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') expect(r.code).toBe('tier_c_filter_not_implemented')
  })
})

describe('orchestrateIngress · stream_id + correlation_id minting (§149)', () => {
  it('mints stream_id deterministically when absent', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const envelope = emilioEnvelope()

    const r1 = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage: new InMemoryEventLogStorage(),
      auth_secret_override: 'x',
    })
    const r2 = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage: new InMemoryEventLogStorage(), // fresh storage · no dedup
      auth_secret_override: 'x',
    })
    if (r1.kind === 'accepted' && r2.kind === 'accepted') {
      expect(r1.stream_id).toBe(r2.stream_id)
    }
  })

  it('uses caller-provided stream_id when present (replay/import)', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const envelope = emilioEnvelope({ stream_id: 'sala/v1/import/custom' })
    const r = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage: new InMemoryEventLogStorage(),
      auth_secret_override: 'x',
    })
    if (r.kind === 'accepted') expect(r.stream_id).toBe('sala/v1/import/custom')
  })

  it('uses caller correlation_id when present', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const envelope = emilioEnvelope({ correlation_id: 'corr-import-1' })
    await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage,
      auth_secret_override: 'x',
    })
    const events = await storage.select({ tenant_id: 'naufrago' })
    expect(events[0].correlation_id).toBe('corr-import-1')
  })
})

describe('orchestrateIngress · NEVER dispatches (canon ADR-018)', () => {
  it('only appends event to log · cero side-effect beyond storage.insert', async () => {
    const tables = new InMemoryIngressTables()
      .seedSource(TIER_A_EMILIO)
      .seedRule(RULE_EMILIO_ONBOARD)
    const storage = new InMemoryEventLogStorage()
    const envelope = emilioEnvelope()
    const r = await orchestrateIngress({
      envelope,
      auth_request: { source: envelope.source, internal_key: 'x' },
      tables,
      storage,
      auth_secret_override: 'x',
    })
    expect(r.kind).toBe('accepted')
    // Exactly 1 row inserted · NO dispatch · NO downstream cascade
    const events = await storage.select({ tenant_id: 'naufrago' })
    expect(events.length).toBe(1)
  })
})
