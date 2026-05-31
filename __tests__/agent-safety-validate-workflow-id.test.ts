/**
 * Tests for src/lib/agent-safety/validate-workflow-id.ts · §149 gate.
 *
 * Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §8.2
 *
 * The other 2 gates (idempotency · rate-limit) are stubs · their tests land
 * with their real implementations in the build-phase PR. This file lands now
 * because `validateWorkflowId` is a pure function with locked behavior · it
 * can be fully implemented and tested before the rest of the lib.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateWorkflowId } from '../src/lib/agent-safety/validate-workflow-id'
import type { InvocationContext } from '../src/lib/agent-safety/types'

const baseCtx: InvocationContext = {
  workflow_id: 'wf_test',
  workflow_execution_id: 'exec_test',
  client_id: 'client_test',
  agent_id: 'jefe-marketing',
  task: 'test task',
  caller: 'n8n',
}

const ORIG = process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE

beforeEach(() => {
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
})

afterEach(() => {
  if (ORIG === undefined) delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  else process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = ORIG
})

describe('validateWorkflowId · §149 gate', () => {
  describe('reject conditions', () => {
    it('would_reject=true when workflow_id is null', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null })
      expect(d.would_reject).toBe(true)
      expect(d.reason).toMatch(/§149/)
      expect(d.metadata?.workflow_id_present).toBe(false)
    })

    it('would_reject=true when workflow_id is empty string', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: '' })
      expect(d.would_reject).toBe(true)
    })

    it('would_reject=true when workflow_id is whitespace only', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: '   ' })
      expect(d.would_reject).toBe(true)
    })

    it('would_reject=true when workflow_id is tab/newline whitespace', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: '\t\n  ' })
      expect(d.would_reject).toBe(true)
    })
  })

  describe('accept conditions', () => {
    it('would_reject=false for normal workflow_id', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: 'RT1tcru9mysEwKkf' })
      expect(d.would_reject).toBe(false)
      expect(d.reason).toBeUndefined()
      expect(d.metadata?.workflow_id_present).toBe(true)
      expect(d.metadata?.is_smoke_caller).toBe(false)
    })

    it('would_reject=false for smoke caller prefix · is_smoke_caller=true', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: 'smoke-test-123', caller: 'smoke' })
      expect(d.would_reject).toBe(false)
      expect(d.metadata?.is_smoke_caller).toBe(true)
    })

    it('would_reject=false for whitespace-padded valid id (trim allowed)', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: '  abc123  ' })
      expect(d.would_reject).toBe(false)
    })
  })

  describe('shadow vs enforce mode', () => {
    it('default · enforce=undefined → shadow_mode=true · enforced=false even when reject', () => {
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null })
      expect(d.shadow_mode).toBe(true)
      expect(d.would_reject).toBe(true)
      expect(d.enforced).toBe(false)
    })

    it('AGENT_SAFETY_WORKFLOW_ID_ENFORCE=0 → shadow_mode=true', () => {
      process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '0'
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null })
      expect(d.shadow_mode).toBe(true)
      expect(d.enforced).toBe(false)
    })

    it('AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1 · valid id → enforced=false (nothing to enforce)', () => {
      process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
      const d = validateWorkflowId({ ...baseCtx, workflow_id: 'wf_valid' })
      expect(d.shadow_mode).toBe(false)
      expect(d.would_reject).toBe(false)
      expect(d.enforced).toBe(false)
    })

    it('AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1 · null id → enforced=true (the canonical block)', () => {
      process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null })
      expect(d.shadow_mode).toBe(false)
      expect(d.would_reject).toBe(true)
      expect(d.enforced).toBe(true)
    })

    it('arbitrary value other than "1" → still shadow', () => {
      process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = 'yes'
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null })
      expect(d.shadow_mode).toBe(true)
      expect(d.enforced).toBe(false)
    })
  })

  describe('24-may NEXUS counterfactual', () => {
    it('all 659 incident-style invocations (workflow_id=NULL) would_reject in shadow mode', () => {
      // Simulate the incident pattern · 100 calls (we use 100 instead of 659
      // to keep the test fast · same shape).
      const decisions = Array.from({ length: 100 }, () =>
        validateWorkflowId({
          ...baseCtx,
          workflow_id: null,
          agent_id: 'jefe-marketing',
        }),
      )
      const wouldRejectAll = decisions.every((d) => d.would_reject)
      const enforcedNone = decisions.every((d) => !d.enforced)
      expect(wouldRejectAll).toBe(true)
      expect(enforcedNone).toBe(true) // shadow default · audit-log-only baseline
    })

    it('after enforce flip · first NEXUS-style call enforced=true (subsequent 658 never happen)', () => {
      process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
      const d = validateWorkflowId({ ...baseCtx, workflow_id: null, agent_id: 'jefe-marketing' })
      expect(d.enforced).toBe(true)
      expect(d.reason).toMatch(/§149/)
    })
  })

  describe('metadata shape', () => {
    it('always includes workflow_id_present + is_smoke_caller + caller', () => {
      const d = validateWorkflowId(baseCtx)
      expect(d.metadata).toHaveProperty('workflow_id_present')
      expect(d.metadata).toHaveProperty('is_smoke_caller')
      expect(d.metadata).toHaveProperty('caller', 'n8n')
    })
  })
})
