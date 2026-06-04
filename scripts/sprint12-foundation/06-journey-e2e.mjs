#!/usr/bin/env node
/**
 * 06 · Journey E2E · cliente sintético · canon-canon-shadow
 *
 * Run RealSalaIntegration con InMemoryEventLogStorage · simula el LOOP del
 * router event-driven para canon-cada uno de los 5 libretos listos (ONBOARD ·
 * PRODUCE · ALWAYS_ON · REVIEW · ACQUIRE) + GROWTH pending_144.
 *
 * §148 honest · shadow only · cero DB touch en este modo. Post-§144 + #141
 * applied · re-run con SupabaseEventLogStorage (env mode=supabase) para validar
 * E2E real.
 *
 * Lo que valida ·
 *   - kickstart funciona en canon-cada journey (step_completed en entry)
 *   - runUntilHalt termina en estado canónico (gate_pending · terminal ·
 *     needs_judgment · budget_blocked) dentro del max_ticks cap
 *   - GROWTH halt at needs_judgment (libreto pending §144)
 *   - tenant isolation · cross-tenant streams NUNCA comparten state
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { assertSafety, report } from './_lib.mjs'

assertSafety()

const HARNESS = '06-journey-e2e'
const failures = []

const driverTs = `
import { InMemoryEventLogStorage } from '../../../src/lib/sala-event-log'
import { RealSalaIntegration } from '../../../src/lib/sala-integration'
import { CANONICAL_LIBRETOS } from '../../../src/lib/sala/libretos'

async function main() {
  const T = '11111111-1111-1111-1111-111111111111'
  const T2 = '99999999-9999-9999-9999-999999999999'
  const C = '22222222-2222-2222-2222-222222222222'

  const results: Record<string, any> = {}

  // ─── canon · canon canon-canon-5 libretos listos ────────────────────
  for (const journey of ['ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW', 'ACQUIRE'] as const) {
    const storage = new InMemoryEventLogStorage()
    const integration = new RealSalaIntegration({ storage })
    const result = await integration.runUntilHalt({
      tenant_id: T,
      client_id: C,
      stream_id: \`smoke-\${journey}-\${Date.now()}\`,
      journey_type: journey,
      logical_period: '2026-W23',
      max_ticks: 40,
    } as any)
    results[journey] = {
      ticks: result.ticks,
      halted_by: result.halted_by,
      total_events: result.total_events,
      storage_size: storage.size,
      ok: result.ticks > 0 && ['gate_pending', 'terminal', 'needs_judgment', 'budget_blocked', 'no_dispatch_emitted'].includes(result.halted_by),
    }
  }

  // ─── canon · GROWTH pending_144 ─────────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const integration = new RealSalaIntegration({ storage })
    const result = await integration.runUntilHalt({
      tenant_id: T,
      client_id: C,
      stream_id: \`smoke-GROWTH-\${Date.now()}\`,
      journey_type: 'GROWTH',
      logical_period: '2026-W23',
      max_ticks: 5,
    } as any)
    results.GROWTH = {
      halted_by: result.halted_by,
      ok: result.halted_by === 'needs_judgment',
    }
  }

  // ─── canon · tenant isolation ───────────────────────────────────────
  {
    const storage = new InMemoryEventLogStorage()
    const integration = new RealSalaIntegration({ storage })
    await integration.kickstart({
      tenant_id: T,
      client_id: C,
      stream_id: 'iso-stream-A',
      journey_type: 'PRODUCE',
      logical_period: '2026-W23',
    } as any)
    await integration.kickstart({
      tenant_id: T2,
      client_id: C,
      stream_id: 'iso-stream-B',
      journey_type: 'PRODUCE',
      logical_period: '2026-W23',
    } as any)
    results.isolation = {
      storage_size: storage.size,
      ok: storage.size === 2,
    }
  }

  console.log(JSON.stringify(results))
}

main().catch((e) => {
  console.log(JSON.stringify({ uncaught: String(e?.stack ?? e) }))
  process.exit(1)
})
`

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = resolve(repoRoot, 'scripts/sprint12-foundation/.tmp')
mkdirSync(dir, { recursive: true })
const driver = resolve(dir, 'driver-06.mts')
writeFileSync(driver, driverTs, 'utf8')
const isWin = process.platform === 'win32'
const tsxBin = resolve(repoRoot, isWin ? 'node_modules/tsx/dist/cli.mjs' : 'node_modules/tsx/dist/cli.mjs')
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

if (parsed) {
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === 'object' && 'ok' in v && !v.ok)
      failures.push({ step: `journey_${k}`, detail: v })
  }
}

report(HARNESS, {
  pass: failures.length === 0,
  failures,
  journeys: parsed ?? null,
})
