#!/usr/bin/env node
/**
 * 05 · Cap-frena-live · G6 bucket atómico SEAM validation
 *
 * §148 honest · G6 atomic bucket (rate_limit_buckets · increment_bucket_atomic
 * RPC) NOT live wired yet · harness valida la SEAM BudgetHook → BudgetExhaustedError
 * → retry → dead-letter usando un mock bucket en-memoria que simula la semántica
 * canon-canonical · "primeros N pasan · resto bloqueados". Mitad 2 wire-up post-§144
 * reemplaza el mock por el RPC real · ESTE harness se re-corre con BUDGET_HOOK_MODE=
 * supabase_rpc para validar live (escalón 4 roadmap).
 *
 * Lo que valida ·
 *   - Bucket cap=3 · 5 invocations → primeros 3 succeed · últimos 2 BudgetExhaustedError
 *   - Errores cuentan como step failures · canon-respect retry policy
 *   - Dead-letter contains 2 entries (los bloqueados después de retries)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { assertSafety, report } from './_lib.mjs'

assertSafety()

const HARNESS = '05-budget-frena-live'
const failures = []

const driverTs = `
import { InngestExecutor } from '../../../src/lib/sala/executors/inngest-executor'
import type { BudgetHook } from '../../../src/lib/sala/budget-hook'
import { deriveIdempotencyKey } from '../../../src/lib/sala/idempotency-key'

const CAP = 3
const BURST = 5

function makeMockBucketHook(cap: number): BudgetHook {
  const counts = new Map<string, number>()
  return {
    async checkAndIncrement(bucketKey: string) {
      const prev = counts.get(bucketKey) ?? 0
      if (prev >= cap) {
        return { ok: false, bucketKey, reason: \`bucket_exhausted · cap=\${cap} · current=\${prev}\` }
      }
      counts.set(bucketKey, prev + 1)
      return { ok: true, bucketKey }
    },
  }
}

async function main() {
  const hook = makeMockBucketHook(CAP)
  const executor = new InngestExecutor({ budgetHook: hook, sleep: () => Promise.resolve() })

  executor.register(
    'X.work',
    async (input: { i: number }, step) => {
      return await step.run('do-work', async () => input.i * 2)
    },
    {
      retry: { maxAttempts: 2, initialBackoffMs: 0, maxBackoffMs: 0 },
      budget: { bucketKey: 'shared-cap' },
    },
  )

  const runIds: any[] = []
  for (let i = 0; i < BURST; i++) {
    const idem = deriveIdempotencyKey({
      operationType: 'X.work',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: \`2026-W\${10 + i}\` },
    })
    const r = await executor.enqueue({
      operationType: 'X.work',
      clientId: 'c1',
      logicalPeriod: { kind: 'iso_week', value: \`2026-W\${10 + i}\` },
      idempotencyKey: idem,
      payload: { i },
    })
    runIds.push(r)
  }

  // canon · drive each run via execute · executor calls budgetHook at step.run boundary
  for (const r of runIds) {
    await executor.execute(r)
  }

  const finals = await Promise.all(runIds.map((r) => executor.getStatus(r)))
  const succeeded = finals.filter((s) => s === 'completed').length
  const failed = finals.filter((s) => s === 'failed').length
  const dlq = executor.getDeadLetterQueue()

  const ok = succeeded === CAP && failed === BURST - CAP && dlq.length === BURST - CAP

  console.log(JSON.stringify({
    cap: CAP,
    burst: BURST,
    succeeded,
    failed,
    dlq_size: dlq.length,
    ok,
    statuses: finals,
  }))
}

main().catch((e) => {
  console.log(JSON.stringify({ uncaught: String(e?.stack ?? e) }))
  process.exit(1)
})
`

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = resolve(repoRoot, 'scripts/sprint12-foundation/.tmp')
mkdirSync(dir, { recursive: true })
const driver = resolve(dir, 'driver-05.mts')
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

if (parsed && !parsed.ok) {
  failures.push({ step: 'cap_seam', detail: parsed })
}

report(HARNESS, {
  pass: failures.length === 0,
  failures,
  ...(parsed ?? {}),
})
