/**
 * Tests · kill-switch orchestrator · frena-proof canon canonical (Ola 1 cierre #1)
 *
 * Spec · spec-CC1-killswitch-frena-proof.md (2026-06-01)
 *
 * Closes the half of criterio Q3 #1 pending: detection is proven (G5 LIVE) ·
 * this proves the orchestrator's DECISION OF CUT is captured (audit trail
 * evidence · not just passive log) and that flipping enforce ON converts
 * `would_reject=true` into `allow=false` for the same input · without
 * affecting legitimate traffic baseline.
 *
 * Honest §148 · checkIdempotency + checkRateLimit are still STUBS in main
 * (always return would_reject=false) · so the frena-evidence here exercises
 * the validateWorkflowId gate (§149 · the gate that flips FIRST per the
 * 2026-05-31 ratified secuenciacion orden). When G3/G6 bodies land, this
 * suite gains parallel FASE B/C blocks for those gates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { killSwitch } from '../src/lib/agent-safety/kill-switch'
import type { InvocationContext, SafetyDecision } from '../src/lib/agent-safety/types'

const ORIG_ENABLED = process.env.AGENT_SAFETY_ENABLED
const ORIG_ENFORCE = process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE

beforeEach(() => {
  delete process.env.AGENT_SAFETY_ENABLED
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
})

afterEach(() => {
  if (ORIG_ENABLED === undefined) delete process.env.AGENT_SAFETY_ENABLED
  else process.env.AGENT_SAFETY_ENABLED = ORIG_ENABLED
  if (ORIG_ENFORCE === undefined) delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  else process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = ORIG_ENFORCE
})

const fakeSupabase = {} as SupabaseClient

const legitCtx = (i: number): InvocationContext => ({
  workflow_id: `wf_legit_${i}`,
  workflow_execution_id: `exec_${i}`,
  client_id: 'client_test',
  agent_id: 'jefe-marketing',
  task: `legitimate task ${i}`,
  caller: 'n8n',
})

const runawayCtx = (i: number): InvocationContext => ({
  workflow_id: null, // §149 violation · the NEXUS-incident pattern
  workflow_execution_id: null,
  client_id: 'client_test',
  agent_id: 'jefe-marketing',
  task: `runaway burst ${i}`,
  caller: 'api',
})

describe('killSwitch · FASE A · BASELINE no-false-positive (canon canonical)', () => {
  it('10 legitimate invocations · all allow=true · zero shadow_blocks', async () => {
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 10; i++) {
      decisions.push(await killSwitch(legitCtx(i), fakeSupabase))
    }
    expect(decisions.every((d) => d.allow === true)).toBe(true)
    expect(decisions.every((d) => d.shadow_blocks.length === 0)).toBe(true)
    expect(decisions.every((d) => d.block_gate === undefined)).toBe(true)
    expect(decisions.every((d) => d.block_reason === undefined)).toBe(true)
  })

  it('100 legitimate invocations (burst-scale baseline) · 0 false-positive across all gates', async () => {
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 100; i++) {
      decisions.push(await killSwitch(legitCtx(i), fakeSupabase))
    }
    const anyBlocked = decisions.some((d) => !d.allow)
    const anyShadowBlock = decisions.some((d) => d.shadow_blocks.length > 0)
    expect(anyBlocked).toBe(false)
    expect(anyShadowBlock).toBe(false)
    // Every decision must have request_id populated (audit trail prereq · §150 G4)
    expect(decisions.every((d) => typeof d.request_id === 'string' && d.request_id.length > 0)).toBe(true)
  })

  it('legit smoke caller (workflow_id starts smoke-) · allow=true · is_smoke_caller=true in metadata', async () => {
    const d = await killSwitch(
      { ...legitCtx(0), workflow_id: 'smoke-killswitch-test', caller: 'smoke' },
      fakeSupabase,
    )
    expect(d.allow).toBe(true)
    expect(d.shadow_blocks).toEqual([])
    const g1 = d.gates.find((g) => g.gate === 'validate_workflow_id')
    expect(g1?.metadata?.is_smoke_caller).toBe(true)
  })
})

describe('killSwitch · FASE B · FRENA-evidence (decisión-de-corte registrada)', () => {
  it('10 runaway invocations (workflow_id=null) · allow=true (shadow) · BUT shadow_blocks includes validate_workflow_id', async () => {
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 10; i++) {
      decisions.push(await killSwitch(runawayCtx(i), fakeSupabase))
    }
    // Shadow mode default · NO production block (allow=true canon §148 fail-open)
    expect(decisions.every((d) => d.allow === true)).toBe(true)
    // BUT every decision has shadow_blocks populated · this IS the evidence
    expect(decisions.every((d) => d.shadow_blocks.includes('validate_workflow_id'))).toBe(true)
    // The gate decision record itself shows would_reject=true · enforced=false
    decisions.forEach((d) => {
      const g1 = d.gates.find((g) => g.gate === 'validate_workflow_id')
      expect(g1?.would_reject).toBe(true)
      expect(g1?.enforced).toBe(false)
      expect(g1?.shadow_mode).toBe(true)
      expect(g1?.reason).toMatch(/§149/)
    })
  })

  it('NEXUS-counterfactual canon · 100 runaway invocations · all shadow_blocks evidence captured', async () => {
    // 24-may incident pattern · 659 calls without workflow_id · we run 100 same-shape.
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 100; i++) {
      decisions.push(await killSwitch(runawayCtx(i), fakeSupabase))
    }
    const evidenceCount = decisions.filter((d) =>
      d.shadow_blocks.includes('validate_workflow_id'),
    ).length
    expect(evidenceCount).toBe(100) // canon · 100% evidence capture
    // canon canonical · no production blocks (shadow) · zero customer impact
    expect(decisions.every((d) => d.allow === true)).toBe(true)
  })
})

describe('killSwitch · FASE C · FRENA-de-verdad post-flip enforce (validation only · NO flip)', () => {
  // canon §144 · ESTE TEST NO FLIPEA PROD · solo demuestra que el toggle
  // funciona en proceso de test isolation (process.env scoped por vitest).

  it('AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1 · 10 runaway invocations · all allow=false · block_gate=validate_workflow_id', async () => {
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 10; i++) {
      decisions.push(await killSwitch(runawayCtx(i), fakeSupabase))
    }
    expect(decisions.every((d) => d.allow === false)).toBe(true)
    expect(decisions.every((d) => d.block_gate === 'validate_workflow_id')).toBe(true)
    expect(decisions.every((d) => typeof d.block_reason === 'string' && d.block_reason!.includes('§149'))).toBe(true)
    decisions.forEach((d) => {
      const g1 = d.gates.find((g) => g.gate === 'validate_workflow_id')
      expect(g1?.enforced).toBe(true)
      expect(g1?.shadow_mode).toBe(false)
    })
  })

  it('AGENT_SAFETY_WORKFLOW_ID_ENFORCE=1 · legit traffic unaffected · allow=true (NO false-positive)', async () => {
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
    const decisions: SafetyDecision[] = []
    for (let i = 0; i < 20; i++) {
      decisions.push(await killSwitch(legitCtx(i), fakeSupabase))
    }
    expect(decisions.every((d) => d.allow === true)).toBe(true)
    expect(decisions.every((d) => d.shadow_blocks.length === 0)).toBe(true)
  })
})

describe('killSwitch · FASE D · fail-open global short-circuit (§148 honest)', () => {
  it('AGENT_SAFETY_ENABLED=false · returns allow=true even for runaway invocations', async () => {
    process.env.AGENT_SAFETY_ENABLED = 'false'
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1' // canon · enabled overrides enforce
    const d = await killSwitch(runawayCtx(0), fakeSupabase)
    expect(d.allow).toBe(true)
    expect(d.gates).toEqual([])
    expect(d.shadow_blocks).toEqual([])
    expect(typeof d.request_id).toBe('string')
  })
})

describe('killSwitch · audit trail prereq · request_id uniqueness', () => {
  it('each invocation gets a unique request_id (canon §150 G4 audit row key)', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const d = await killSwitch(legitCtx(i), fakeSupabase)
      ids.add(d.request_id)
    }
    expect(ids.size).toBe(50)
  })
})
