/**
 * contract-validator.test.ts · Wave 11 T2 · CC#1
 *
 * Tests para `validateAgentOutput()` y `validateAgentOutputEnvelope()` en
 * `@/lib/contract-validator`.
 *
 * Cubre:
 *   - 5 happy por journey (A,B,C,D,E) + 1 happy envelope master = 6 happy
 *   - 5 violations por journey (1 each) + 1 unknown_stage = 6 violations
 *   - Edge cases: unknown journey · stage prefix con/sin journey-X-
 *
 * Run: npm run test
 */
import { describe, it, expect } from 'vitest'
import {
  validateAgentOutput,
  validateAgentOutputEnvelope,
  resolveStageKey,
  listKnownStages,
} from '@/lib/contract-validator'

// ────────────────────────────────────────────────────────────────────────────
// Happy path samples · output válido por journey
// ────────────────────────────────────────────────────────────────────────────

const VALID_A_STAGE_1 = {
  qualified: true,
  score: 75,
  reasoning: 'Strong ICP fit · adequate budget signaled · Q2 timeline confirmed',
  next_action: 'schedule_discovery',
  schema_version: '1.0',
}

const VALID_B_STAGE_1 = {
  client_name: 'Acme Industrial Corp',
  industry: 'Industrial Safety Equipment',
  website_url: 'https://acme.example.com',
  company_size: '51-200',
  primary_contact: {
    name: 'María González',
    email: 'maria@acme.example.com',
  },
  schema_version: '1.0',
}

const VALID_C_PHASE_3 = {
  sub_tasks: [
    {
      agent: 'jefe-creative',
      task_description: 'Design 5 ad creative variations targeting Quito segment with safety messaging',
      dependencies: [],
      estimated_effort_hours: 8,
    },
    {
      agent: 'media-buyer',
      task_description: 'Set up Meta + Google campaigns with Black Friday targeting and lead-gen objective',
      dependencies: ['jefe-creative'],
      estimated_effort_hours: 6,
    },
    {
      agent: 'seo-specialist',
      task_description: 'Optimize landing page meta tags for industrial-safety keyword cluster + schema markup',
      dependencies: [],
      estimated_effort_hours: 4,
    },
    {
      agent: 'content-writer',
      task_description: 'Write 10 ad headlines + 3 long-form blog posts targeting decision-stage queries',
      dependencies: [],
      estimated_effort_hours: 8,
    },
    {
      agent: 'qa-reviewer',
      task_description: 'Camino III dual-reviewer pass on creative + landing copy + ad targeting fit',
      dependencies: ['jefe-creative', 'content-writer', 'media-buyer'],
      estimated_effort_hours: 4,
    },
  ],
  task_sequence: ['jefe-creative', 'content-writer', 'seo-specialist', 'media-buyer', 'qa-reviewer'],
  schema_version: '1.0',
}

const VALID_D_DAILY_ANOMALY = {
  anomalies: [
    {
      type: 'roas_drop',
      metric_value: 1.4,
      threshold: 2.5,
      severity: 'high',
    },
  ],
  severity: 'high',
  recommendations: [
    'Pause campaign-x · ROAS below floor for 3 consecutive days',
    'Reallocate budget to top performer campaign-y until creative refresh ships',
  ],
  timestamp: '2026-04-29T14:30:00Z',
  schema_version: '1.0',
}

const VALID_E_STAGE_2 = {
  churn_score: 78,
  churn_signals: [
    {
      signal: 'Engagement dropped 60% MoM · last login 14 days ago',
      strength: 'strong',
    },
    {
      signal: 'Skipped quarterly review meeting · no reschedule',
      strength: 'medium',
    },
  ],
  retention_recommendations: [
    {
      action: 'Schedule executive sponsor call this week · CSM + AE joint',
      priority: 'p0',
      effort: 'low',
    },
    {
      action: 'Offer pilot extension on adjacent module to reset value perception',
      priority: 'p1',
      effort: 'medium',
    },
  ],
  schema_version: '1.0',
}

// ────────────────────────────────────────────────────────────────────────────
// Happy path · validateAgentOutput por journey
// ────────────────────────────────────────────────────────────────────────────

describe('validateAgentOutput() · happy path · 1 per journey', () => {
  it('Journey A (ACQUIRE) stage-1 lead-capture · valid', () => {
    const r = validateAgentOutput('ACQUIRE', 'stage-1', VALID_A_STAGE_1)
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.resolved_stage_key).toBe('a-stage-1')
  })

  it('Journey B (ONBOARD) stage-1 intake · valid (using letter B)', () => {
    const r = validateAgentOutput('B', 'stage-1', VALID_B_STAGE_1)
    expect(r.valid).toBe(true)
    expect(r.resolved_stage_key).toBe('b-stage-1')
  })

  it('Journey C (PRODUCE) phase-3 scaffold · valid (with full prefix)', () => {
    const r = validateAgentOutput('PRODUCE', 'journey-c-phase-3', VALID_C_PHASE_3)
    expect(r.valid).toBe(true)
    expect(r.resolved_stage_key).toBe('c-phase-3')
  })

  it('Journey D (ALWAYS_ON) daily-anomaly · valid', () => {
    const r = validateAgentOutput('ALWAYS_ON', 'daily-anomaly', VALID_D_DAILY_ANOMALY)
    expect(r.valid).toBe(true)
    expect(r.resolved_stage_key).toBe('d-daily-anomaly')
  })

  it('Journey E (REVIEW) stage-2 churn · valid', () => {
    const r = validateAgentOutput('REVIEW', 'stage-2', VALID_E_STAGE_2)
    expect(r.valid).toBe(true)
    expect(r.resolved_stage_key).toBe('e-stage-2')
  })
})

describe('validateAgentOutputEnvelope() · happy path · master schema', () => {
  it('full agent_output envelope con stage A-1 · valid both layers', () => {
    const envelope = {
      agent_slug: 'lead-qualifier',
      stage: 'journey-a-stage-1',
      output: VALID_A_STAGE_1,
      metadata: {
        execution_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-04-29T14:30:00Z',
      },
    }
    const r = validateAgentOutputEnvelope(envelope)
    expect(r.valid).toBe(true)
    expect(r.resolved_stage_key).toBe('a-stage-1')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Violations · 1 per journey + edge cases
// ────────────────────────────────────────────────────────────────────────────

describe('validateAgentOutput() · violations · 1 per journey', () => {
  it('Journey A · missing required `reasoning` field → E-WF-003-REQUIRED', () => {
    const bad = { ...VALID_A_STAGE_1 } as Record<string, unknown>
    delete bad.reasoning
    const r = validateAgentOutput('A', 'stage-1', bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-REQUIRED')
    expect(r.errors.join(' ')).toMatch(/reasoning/)
  })

  it('Journey B · invalid enum for `company_size` → E-WF-003-ENUM', () => {
    const bad = { ...VALID_B_STAGE_1, company_size: 'small-company' }
    const r = validateAgentOutput('ONBOARD', 'stage-1', bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-ENUM')
  })

  it('Journey C · only 3 sub_tasks (minItems=5) → E-WF-003-CONSTRAINT', () => {
    const bad = {
      ...VALID_C_PHASE_3,
      sub_tasks: VALID_C_PHASE_3.sub_tasks.slice(0, 3),
    }
    const r = validateAgentOutput('C', 'phase-3', bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-CONSTRAINT')
    expect(r.errors.join(' ')).toMatch(/sub_tasks|fewer|minItems/i)
  })

  it("Journey D · severity='critical' not in enum → E-WF-003-ENUM", () => {
    const bad = { ...VALID_D_DAILY_ANOMALY, severity: 'critical' }
    const r = validateAgentOutput('D', 'daily-anomaly', bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-ENUM')
  })

  it('Journey E · churn_score outside 0-100 range → E-WF-003-CONSTRAINT', () => {
    const bad = { ...VALID_E_STAGE_2, churn_score: 150 }
    const r = validateAgentOutput('E', 'stage-2', bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-CONSTRAINT')
  })

  it('unknown stage `ghost-99` → E-WF-003-UNKNOWN_STAGE', () => {
    const r = validateAgentOutput('A', 'ghost-99', VALID_A_STAGE_1)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-UNKNOWN_STAGE')
    expect(r.resolved_stage_key).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Edge cases · unknown journey + helper functions
// ────────────────────────────────────────────────────────────────────────────

describe('validateAgentOutput() · edge cases', () => {
  it('unknown journey → E-WF-003-UNKNOWN_JOURNEY', () => {
    const r = validateAgentOutput('NEXUS' as never, 'stage-1', {})
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-UNKNOWN_JOURNEY')
  })

  it('resolveStageKey strips full journey-X- prefix', () => {
    expect(resolveStageKey('PRODUCE', 'journey-c-phase-3')).toBe('c-phase-3')
    expect(resolveStageKey('A', 'stage-1')).toBe('a-stage-1')
    expect(resolveStageKey('D', 'daily-anomaly')).toBe('d-daily-anomaly')
  })

  it('listKnownStages returns 22 stages (A:3 + B:5 + C:8 + D:3 + E:3)', () => {
    const stages = listKnownStages()
    expect(stages).toHaveLength(22)
    expect(stages).toContain('c-phase-7')
    expect(stages).toContain('a-stage-1')
  })
})

describe('validateAgentOutputEnvelope() · violations', () => {
  it('envelope missing required `metadata` field → E-WF-003-MASTER', () => {
    const bad = {
      agent_slug: 'lead-qualifier',
      stage: 'journey-a-stage-1',
      output: VALID_A_STAGE_1,
      // metadata missing
    }
    const r = validateAgentOutputEnvelope(bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-MASTER')
  })

  it('envelope master OK pero nested output viola schema → propaga error_code', () => {
    const bad = {
      agent_slug: 'lead-qualifier',
      stage: 'journey-a-stage-1',
      output: { ...VALID_A_STAGE_1, score: 999 }, // out of range
      metadata: {
        execution_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-04-29T14:30:00Z',
      },
    }
    const r = validateAgentOutputEnvelope(bad)
    expect(r.valid).toBe(false)
    expect(r.error_code).toBe('E-WF-003-CONSTRAINT')
    expect(r.resolved_stage_key).toBe('a-stage-1')
  })
})
