#!/usr/bin/env node
/**
 * scripts/sala/synthetic-durability-smoke.mjs · Escalón 2 SHADOW.
 *
 * Sends 3 synthetic events to Inngest cloud · each tests a property
 * of the durable runtime in the real deploy (NOT the in-memory
 * spike) ·
 *
 *   1. happy-path     · runId='smoke-happy-001'  · single execution,
 *                       3 steps, terminal success
 *   2. retry-bajo-err · runId='smoke-retry-001'  · step-2 throws on
 *                       first attempt · Inngest retries with backoff
 *                       · step-1 memoised result returns instantly
 *                       on attempt 2 (durability primitive · the
 *                       caveat the spike could NOT prove in real
 *                       deploy)
 *   3. duplicate      · runId='smoke-dedup-001'  · sent twice
 *                       back-to-back · Inngest idempotency (24h TTL,
 *                       CEL key = event.data.runId) collapses to one
 *                       execution
 *
 * Usage ·
 *   node scripts/sala/synthetic-durability-smoke.mjs
 *
 * Env required ·
 *   INNGEST_EVENT_KEY · loaded automatically from .env.local
 *
 * After running, observe the Inngest dashboard runs view to verify ·
 *   - 3 events sent
 *   - 2 distinct function runs (happy + retry · dedup collapses)
 *   - retry run shows attempt=1 failed, attempt=2 succeeded
 *   - step-1 step-result memoised across the retry boundary
 *
 * §148 honest · this script only sends events. It does NOT assert
 * outcomes (that requires Inngest REST API observation which the
 * Mitad 2 follow-up step covers). The point here is to prove the
 * wire works end-to-end · events reach the deployed endpoint, the
 * runtime accepts them, retries fire, idempotency holds.
 */
import fs from 'node:fs'
import path from 'node:path'

function loadDotenv() {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ]
  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, 'utf8')
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
        }
      }
    } catch {
      // ignore missing files
    }
  }
}

async function main() {
  loadDotenv()
  if (!process.env.INNGEST_EVENT_KEY) {
    console.error(
      '[FATAL] INNGEST_EVENT_KEY missing · cannot send synthetic events',
    )
    process.exit(1)
  }
  // Lazy import so the env var is present before the SDK constructs.
  const { Inngest } = await import('inngest')
  const inngest = new Inngest({
    id: 'zero-risk-platform',
    eventKey: process.env.INNGEST_EVENT_KEY,
  })

  const trace = []

  async function send(name, data, label) {
    try {
      const res = await inngest.send({ name, data })
      const ids = Array.isArray(res?.ids) ? res.ids : (res?.eventId ? [res.eventId] : [])
      trace.push({ label, name, data, ids, ok: true })
      console.log(`[OK] ${label} · sent · runId=${data.runId} · ids=${JSON.stringify(ids)}`)
    } catch (e) {
      trace.push({ label, name, data, ok: false, error: String(e?.message || e) })
      console.error(`[FAIL] ${label} · ${String(e?.message || e)}`)
    }
  }

  console.log('Sending 3 synthetic durability events to Inngest cloud ·')
  console.log('  (observe results in Inngest dashboard · runs view)')
  console.log('')

  await send(
    'synthetic/durability.test',
    { runId: 'smoke-happy-001', simulate_failure: 'none' },
    'happy-path',
  )

  await send(
    'synthetic/durability.test',
    { runId: 'smoke-retry-001', simulate_failure: 'step-2' },
    'retry-bajo-error',
  )

  // Duplicate · same runId twice in quick succession.
  await send(
    'synthetic/durability.test',
    { runId: 'smoke-dedup-001', simulate_failure: 'none' },
    'duplicate-1st',
  )
  await send(
    'synthetic/durability.test',
    { runId: 'smoke-dedup-001', simulate_failure: 'none' },
    'duplicate-2nd',
  )

  console.log('')
  console.log('--- summary ---')
  console.log(JSON.stringify(trace, null, 2))
  console.log('')
  console.log('Next · open the Inngest dashboard · check the runs ·')
  console.log('  - 3 distinct runIds · smoke-happy-001 · smoke-retry-001 · smoke-dedup-001')
  console.log('  - smoke-retry-001 should show 2 attempts (1 failed, 2 succeeded)')
  console.log('  - smoke-dedup-001 should show ONE function run despite 2 events')
}

main().catch((e) => {
  console.error('[FATAL]', e?.stack || e?.message || e)
  process.exit(1)
})
