#!/usr/bin/env node
/**
 * 04 · Durabilidad ejecutor · canon-shadow · in-memory Inngest motor (Mitad 1)
 *
 * §148 honest · valida la SEMÁNTICA del executor contract (retry · memoisation ·
 * dead-letter · idempotencia OUR-layer) CON el motor in-memory · canon-canonical
 * shadow phase. Mitad 2 wire-up al real Inngest SDK + persistence post-§144
 * (próximo escalón roadmap).
 *
 * Lo que valida ·
 *   - register + enqueue · runId returned · status = queued
 *   - execute con retry-bajo-error · 1st attempt falla · 2nd succeeds
 *   - step.run memoisation · steps completados NO se re-corren al retry
 *   - dead-letter cuando maxAttempts agota
 *   - idempotencia OUR-layer · misma key 2× → mismo runId (NO duplicate)
 *
 * Carga el motor via tsx · canon-NO toca DB · canon-NO requiere migración.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { assertSafety, report } from './_lib.mjs'

assertSafety()

const HARNESS = '04-executor-durability'
const failures = []

// canon · TS test driver · canon-runs against compiled executor via tsx
const driverTs = `
import {
  InngestExecutor,
  type DurableRunId,
} from '../../../src/lib/sala/executors/inngest-executor'
import { deriveIdempotencyKey } from '../../../src/lib/sala/idempotency-key'

async function runToCompletion(executor: InngestExecutor, runId: DurableRunId) {
  await executor.execute(runId)
  return await executor.getStatus(runId)
}

async function main() {
  const out: any = { steps: {} }

  // ─── A · retry-bajo-error · 1st fails · 2nd succeeds ────────────────
  {
    const executor = new InngestExecutor({ sleep: () => Promise.resolve() })
    let attempts = 0
    executor.register(
      'A.flaky',
      async (input: { x: number }, step) => {
        const memo = await step.run('compute', async () => input.x * 2)
        attempts++
        if (attempts === 1) throw new Error('first attempt fails')
        return { memo, attempts }
      },
      { retry: { maxAttempts: 3, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    const idem = deriveIdempotencyKey({
      operationType: 'A.flaky',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    const runId = await executor.enqueue({
      operationType: 'A.flaky',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
      idempotencyKey: idem,
      payload: { x: 21 },
    })
    const status = await runToCompletion(executor, runId)
    out.steps.A = { status, attempts, ok: status === 'completed' && attempts === 2 }
  }

  // ─── B · step.run memoisation across retries ────────────────────────
  {
    const executor = new InngestExecutor({ sleep: () => Promise.resolve() })
    let memoCalls = 0
    let attempts = 0
    executor.register(
      'B.memo',
      async (_input: { x: number }, step) => {
        const r = await step.run('expensive', async () => {
          memoCalls++
          return 42
        })
        attempts++
        if (attempts < 3) throw new Error('retry me')
        return r
      },
      { retry: { maxAttempts: 5, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    const idem = deriveIdempotencyKey({
      operationType: 'B.memo',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    const runId = await executor.enqueue({
      operationType: 'B.memo',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
      idempotencyKey: idem,
      payload: { x: 1 },
    })
    const status = await runToCompletion(executor, runId)
    // canon canonical · step memoisation · expensive runs ONCE across all 3 attempts
    out.steps.B = { status, attempts, memoCalls, ok: status === 'completed' && memoCalls === 1 && attempts === 3 }
  }

  // ─── C · dead-letter cuando maxAttempts agota ───────────────────────
  {
    const executor = new InngestExecutor({ sleep: () => Promise.resolve() })
    executor.register(
      'C.dead',
      async () => { throw new Error('always fails') },
      { retry: { maxAttempts: 2, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    const idem = deriveIdempotencyKey({
      operationType: 'C.dead',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    const runId = await executor.enqueue({
      operationType: 'C.dead',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
      idempotencyKey: idem,
      payload: {},
    })
    const status = await runToCompletion(executor, runId)
    const dlq = executor.getDeadLetterQueue()
    out.steps.C = {
      status,
      dlq_size: dlq.length,
      ok: status === 'failed' && dlq.length === 1,
    }
  }

  // ─── D · idempotencia OUR-layer · same key 2× → same runId ──────────
  {
    const executor = new InngestExecutor({ sleep: () => Promise.resolve() })
    executor.register(
      'D.dedup',
      async () => 'ok',
      { retry: { maxAttempts: 1, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    const idem = deriveIdempotencyKey({
      operationType: 'D.dedup',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
    })
    const r1 = await executor.enqueue({
      operationType: 'D.dedup',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
      idempotencyKey: idem,
      payload: {},
    })
    await runToCompletion(executor, r1)
    const r2 = await executor.enqueue({
      operationType: 'D.dedup',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: '2026-W23' },
      idempotencyKey: idem,
      payload: {},
    })
    out.steps.D = { runId_1: r1, runId_2: r2, ok: r1 === r2 }
  }

  console.log(JSON.stringify(out))
}

main().catch((e) => {
  console.log(JSON.stringify({ uncaught: String(e?.stack ?? e) }))
  process.exit(1)
})
`

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = resolve(repoRoot, 'scripts/sprint12-foundation/.tmp')
mkdirSync(dir, { recursive: true })
const driver = resolve(dir, 'driver-04.mts')
writeFileSync(driver, driverTs, 'utf8')

const tsxBin = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')
const r = spawnSync(process.execPath, [tsxBin, driver], {
  cwd: repoRoot,
  env: { ...process.env, NODE_OPTIONS: '--no-warnings' },
  encoding: 'utf8',
})
try { rmSync(dir, { recursive: true, force: true }) } catch {}

if (r.status !== 0) {
  failures.push({ step: 'driver_exit', code: r.status, stderr: r.stderr?.slice(0, 500) })
}

let parsed = null
try {
  const lastLine = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop()
  parsed = JSON.parse(lastLine ?? '{}')
} catch (e) {
  failures.push({ step: 'parse', error: String(e), stdout: r.stdout?.slice(0, 500) })
}

if (parsed && parsed.steps) {
  for (const [k, v] of Object.entries(parsed.steps)) {
    if (!v.ok) failures.push({ step: `case_${k}`, detail: v })
  }
} else if (!failures.length) {
  failures.push({ step: 'no_results', got: parsed })
}

report(HARNESS, {
  pass: failures.length === 0,
  failures,
  cases: parsed?.steps ?? null,
})
