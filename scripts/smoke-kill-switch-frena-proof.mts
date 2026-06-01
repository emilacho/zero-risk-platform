#!/usr/bin/env node
/**
 * Smoke · kill-switch frena-proof · canon canonical Ola 1 cierre #1
 *
 * Spec · zr-vault/00-meta/opus-4-8-traspaso/spec-CC1-killswitch-frena-proof.md
 *
 * Objective canon · prove that ADR-008-EXTENDED safety lib (today SHADOW · PR
 * #124 merged main) FRENA a runaway in a way that's evidentiable (decision-
 * of-cut captured, not just passive log) · without triggering false-positives
 * on legitimate baseline traffic. Does NOT flip enforce in prod · only
 * exercises the orchestrator in-process with process.env scoping.
 *
 * Honest §148 · checkIdempotency + checkRateLimit are STUBS in main today
 * (always would_reject=false) · so the FRENA-evidence here exercises the
 * `validate_workflow_id` gate (§149 · the gate that flips FIRST per the
 * 2026-05-31 ratified secuenciacion · identidad antes que acción). When
 * G3/G6 bodies land in a future build phase, this smoke extends with
 * parallel FASE blocks for those gates.
 *
 * FASES canon canonical ·
 *   A · BASELINE no-false-positive · 100 legit invocations · 0 shadow_blocks
 *   B · FRENA-evidence shadow · 100 runaway invocations · 100% shadow_blocks
 *       captured · 100% allow=true (canon §148 fail-open)
 *   C · ENFORCE-flip simulation · 100 runaway invocations · 100% allow=false
 *       with toggle scoped to process · proves the toggle works in isolation
 *   D · cleanup canon · zero residue (smoke does not write DB · pure in-proc)
 *
 * Exit codes canon canonical ·
 *   0 = PASS · ready for flip-prereqs review
 *   2 = FRENA-evidence missing · CRITICAL · shadow_blocks not populated
 *   3 = BASELINE false-positive · CRITICAL · legitimate traffic flagged
 *   4 = ENFORCE flip simulation failed · CRITICAL · toggle does not block
 *   5 = unexpected exception
 *
 * Usage canon ·
 *   node scripts/smoke-kill-switch-frena-proof.mts
 *   node scripts/smoke-kill-switch-frena-proof.mts --burst 500   (override count)
 *   node scripts/smoke-kill-switch-frena-proof.mts --json > out.json
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { killSwitch } from '../src/lib/agent-safety/kill-switch'
import type { InvocationContext, SafetyDecision } from '../src/lib/agent-safety/types'

// =====================================================================
// CLI args
// =====================================================================

const burstIdx = process.argv.findIndex((a) => a === '--burst')
const BURST = burstIdx > 0 && process.argv[burstIdx + 1] ? Number.parseInt(process.argv[burstIdx + 1]!, 10) : 100
const JSON_OUT = process.argv.includes('--json')

if (Number.isNaN(BURST) || BURST < 1) {
  console.error(`[smoke-killswitch] invalid --burst value · got "${process.argv[burstIdx + 1]}"`)
  process.exit(5)
}

// =====================================================================
// Mocks · canon canonical NO DB · stubs ignore supabase param today
// =====================================================================

const fakeSupabase = {} as SupabaseClient

const legitCtx = (i: number): InvocationContext => ({
  workflow_id: `wf_legit_${i.toString().padStart(4, '0')}`,
  workflow_execution_id: `exec_legit_${i}`,
  client_id: 'client_smoke',
  agent_id: 'jefe-marketing',
  task: `legitimate baseline task ${i}`,
  caller: 'n8n',
})

const runawayCtx = (i: number): InvocationContext => ({
  workflow_id: null, // §149 violation · canon canonical NEXUS-incident pattern
  workflow_execution_id: null,
  client_id: 'client_smoke',
  agent_id: 'jefe-marketing',
  task: `runaway burst ${i}`,
  caller: 'api',
})

// =====================================================================
// FASES
// =====================================================================

interface PhaseResult {
  phase: 'A' | 'B' | 'C' | 'D'
  label: string
  pass: boolean
  ms: number
  stats: Record<string, number | string | boolean>
  sample_decision: Partial<SafetyDecision> | null
  fail_reason?: string
}

async function faseA_baseline(): Promise<PhaseResult> {
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  delete process.env.AGENT_SAFETY_ENABLED

  const t0 = Date.now()
  const decisions: SafetyDecision[] = []
  for (let i = 0; i < BURST; i++) {
    decisions.push(await killSwitch(legitCtx(i), fakeSupabase))
  }
  const ms = Date.now() - t0

  const blockedCount = decisions.filter((d) => !d.allow).length
  const shadowFlaggedCount = decisions.filter((d) => d.shadow_blocks.length > 0).length
  const uniqueRequestIds = new Set(decisions.map((d) => d.request_id)).size

  const pass = blockedCount === 0 && shadowFlaggedCount === 0 && uniqueRequestIds === BURST

  return {
    phase: 'A',
    label: 'BASELINE no-false-positive · canon canonical legit traffic',
    pass,
    ms,
    stats: {
      invocations: BURST,
      blocked: blockedCount,
      shadow_flagged: shadowFlaggedCount,
      unique_request_ids: uniqueRequestIds,
      allow_rate_pct: ((BURST - blockedCount) / BURST) * 100,
    },
    sample_decision: {
      allow: decisions[0]?.allow,
      shadow_blocks: decisions[0]?.shadow_blocks,
      request_id: decisions[0]?.request_id,
    },
    fail_reason: pass
      ? undefined
      : `expected 0 blocked + 0 shadow_flagged + ${BURST} unique request_ids · got ${blockedCount}/${shadowFlaggedCount}/${uniqueRequestIds}`,
  }
}

async function faseB_frenaEvidence(): Promise<PhaseResult> {
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  delete process.env.AGENT_SAFETY_ENABLED

  const t0 = Date.now()
  const decisions: SafetyDecision[] = []
  for (let i = 0; i < BURST; i++) {
    decisions.push(await killSwitch(runawayCtx(i), fakeSupabase))
  }
  const ms = Date.now() - t0

  const allowCount = decisions.filter((d) => d.allow).length
  const shadowBlockedCount = decisions.filter((d) => d.shadow_blocks.includes('validate_workflow_id')).length
  const productionBlockedCount = decisions.filter((d) => !d.allow).length
  const sampleG1 = decisions[0]?.gates.find((g) => g.gate === 'validate_workflow_id')

  // Canon canonical pass criteria · shadow mode default · canon §148 fail-open ·
  //   1. ALL invocations get allow=true (canon · NO prod block in shadow)
  //   2. ALL invocations have shadow_blocks.includes('validate_workflow_id')
  //   3. ZERO production blocks (would be a §148 violation · breaking shadow contract)
  const pass = allowCount === BURST && shadowBlockedCount === BURST && productionBlockedCount === 0

  return {
    phase: 'B',
    label: 'FRENA-evidence shadow · canon decisión-de-corte registrada (NEXUS pattern)',
    pass,
    ms,
    stats: {
      invocations: BURST,
      allow_count: allowCount,
      shadow_blocked_validate_workflow_id: shadowBlockedCount,
      production_blocked: productionBlockedCount,
      evidence_capture_pct: (shadowBlockedCount / BURST) * 100,
      sample_g1_would_reject: sampleG1?.would_reject ?? null,
      sample_g1_enforced: sampleG1?.enforced ?? null,
      sample_g1_shadow_mode: sampleG1?.shadow_mode ?? null,
    },
    sample_decision: {
      allow: decisions[0]?.allow,
      shadow_blocks: decisions[0]?.shadow_blocks,
      request_id: decisions[0]?.request_id,
      block_gate: decisions[0]?.block_gate,
    },
    fail_reason: pass
      ? undefined
      : `expected ${BURST} allow + ${BURST} shadow_blocked + 0 prod_blocked · got ${allowCount}/${shadowBlockedCount}/${productionBlockedCount}`,
  }
}

async function faseC_enforceFlipSim(): Promise<PhaseResult> {
  process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE = '1'
  delete process.env.AGENT_SAFETY_ENABLED

  const t0 = Date.now()
  // Runaway invocations canon canonical
  const runawayDecisions: SafetyDecision[] = []
  for (let i = 0; i < BURST; i++) {
    runawayDecisions.push(await killSwitch(runawayCtx(i), fakeSupabase))
  }
  // Legit invocations · MUST NOT be blocked (canon canonical no-false-positive under enforce)
  const legitDecisions: SafetyDecision[] = []
  for (let i = 0; i < Math.min(20, BURST); i++) {
    legitDecisions.push(await killSwitch(legitCtx(i), fakeSupabase))
  }
  const ms = Date.now() - t0

  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE

  const runawayBlocked = runawayDecisions.filter((d) => d.allow === false).length
  const runawayBlockGateCorrect = runawayDecisions.filter((d) => d.block_gate === 'validate_workflow_id').length
  const legitAllowed = legitDecisions.filter((d) => d.allow).length

  const pass =
    runawayBlocked === BURST &&
    runawayBlockGateCorrect === BURST &&
    legitAllowed === legitDecisions.length

  return {
    phase: 'C',
    label: 'ENFORCE-flip simulation (process-scoped · NO prod toggle)',
    pass,
    ms,
    stats: {
      runaway_invocations: BURST,
      runaway_blocked: runawayBlocked,
      runaway_block_gate_correct: runawayBlockGateCorrect,
      legit_invocations: legitDecisions.length,
      legit_allowed: legitAllowed,
      block_rate_pct: (runawayBlocked / BURST) * 100,
    },
    sample_decision: {
      allow: runawayDecisions[0]?.allow,
      block_gate: runawayDecisions[0]?.block_gate,
      block_reason: runawayDecisions[0]?.block_reason,
      request_id: runawayDecisions[0]?.request_id,
    },
    fail_reason: pass
      ? undefined
      : `expected ${BURST}/${BURST} runaway blocked + ${legitDecisions.length}/${legitDecisions.length} legit allowed · got ${runawayBlocked}/${BURST} blocked + ${legitAllowed}/${legitDecisions.length} allowed`,
  }
}

async function faseD_cleanup(): Promise<PhaseResult> {
  // Smoke does not write DB · cleanup is in-proc env restore + assertion that
  // no env toggles leaked outside their scope.
  const t0 = Date.now()
  delete process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE
  delete process.env.AGENT_SAFETY_ENABLED
  const ms = Date.now() - t0

  const envClean =
    process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE === undefined &&
    process.env.AGENT_SAFETY_ENABLED === undefined

  return {
    phase: 'D',
    label: 'cleanup canon · env restore · zero residue',
    pass: envClean,
    ms,
    stats: {
      env_workflow_id_enforce: process.env.AGENT_SAFETY_WORKFLOW_ID_ENFORCE ?? 'unset',
      env_safety_enabled: process.env.AGENT_SAFETY_ENABLED ?? 'unset',
    },
    sample_decision: null,
    fail_reason: envClean ? undefined : 'env toggles leaked outside test scope',
  }
}

// =====================================================================
// Main canon canonical
// =====================================================================

async function main(): Promise<void> {
  const startedAt = new Date().toISOString()
  const results: PhaseResult[] = []

  if (!JSON_OUT) {
    console.log(`[smoke-killswitch] canon canonical · spec-CC1-killswitch-frena-proof · burst=${BURST}`)
    console.log(`[smoke-killswitch] started_at=${startedAt}`)
    console.log('')
  }

  try {
    const a = await faseA_baseline()
    results.push(a)
    if (!JSON_OUT) printPhase(a)

    const b = await faseB_frenaEvidence()
    results.push(b)
    if (!JSON_OUT) printPhase(b)

    const c = await faseC_enforceFlipSim()
    results.push(c)
    if (!JSON_OUT) printPhase(c)

    const d = await faseD_cleanup()
    results.push(d)
    if (!JSON_OUT) printPhase(d)
  } catch (e) {
    console.error(`[smoke-killswitch] unexpected exception · ${e instanceof Error ? e.message : String(e)}`)
    process.exit(5)
  }

  // Aggregate canon canonical
  const allPass = results.every((r) => r.pass)
  const totalMs = results.reduce((acc, r) => acc + r.ms, 0)

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          started_at: startedAt,
          burst: BURST,
          phases: results,
          summary: {
            all_pass: allPass,
            total_ms: totalMs,
            phases_passed: results.filter((r) => r.pass).length,
            phases_total: results.length,
          },
        },
        null,
        2,
      ),
    )
  } else {
    console.log('')
    console.log(`[smoke-killswitch] summary · ${results.filter((r) => r.pass).length}/${results.length} phases pass · ${totalMs}ms total`)
    console.log(`[smoke-killswitch] ALL_PASS=${allPass}`)
  }

  if (allPass) {
    process.exit(0)
  } else {
    // Canon canonical exit codes per spec
    const aFail = !results[0]?.pass
    const bFail = !results[1]?.pass
    const cFail = !results[2]?.pass
    if (bFail) process.exit(2) // FRENA-evidence missing canon canonical
    if (aFail) process.exit(3) // BASELINE false-positive canon canonical
    if (cFail) process.exit(4) // ENFORCE flip canon canonical
    process.exit(5)
  }
}

function printPhase(r: PhaseResult): void {
  const icon = r.pass ? '✅ PASS' : '❌ FAIL'
  console.log(`[smoke-killswitch] FASE ${r.phase} · ${r.label} · ${icon} · ${r.ms}ms`)
  for (const [k, v] of Object.entries(r.stats)) {
    console.log(`  · ${k}: ${v}`)
  }
  if (r.fail_reason) console.log(`  · fail_reason: ${r.fail_reason}`)
  if (r.sample_decision) {
    console.log(`  · sample_decision: ${JSON.stringify(r.sample_decision)}`)
  }
  console.log('')
}

main().catch((e) => {
  console.error(`[smoke-killswitch] main rejected · ${e instanceof Error ? e.message : String(e)}`)
  process.exit(5)
})
