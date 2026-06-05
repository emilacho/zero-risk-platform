#!/usr/bin/env node
/**
 * scripts/sala/synthetic-canary-smoke.mjs · Track S finale prep.
 *
 * Sends a `synthetic/canary.run` event to Inngest cloud + observes
 * the resulting function run via the Inngest REST API. Proves the
 * wire E2E shape works: event → handler → buildSalaIntegration →
 * runUntilHalt → trace.
 *
 * Pre-req · `SALA_CANARY_ENABLED=true` set in Vercel Production +
 * deploy ran + Inngest cloud synced (PUT /api/inngest after deploy).
 * Without the flag flipped, the canary is NOT registered with serve()
 * and Inngest will reject events for the unknown function.
 *
 * Usage ·
 *   node scripts/sala/synthetic-canary-smoke.mjs
 *
 * §148 honest · the canary uses in-memory storage and synthetic
 * tenant/client. NO real data, NO real agents, NO real dispatch.
 * The router emits decisions to an in-memory event log inside the
 * function · those decisions go NOWHERE downstream.
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
      // skip missing file
    }
  }
}

async function main() {
  loadDotenv()
  if (!process.env.INNGEST_EVENT_KEY) {
    console.error('[FATAL] INNGEST_EVENT_KEY missing')
    process.exit(1)
  }
  if (!process.env.INNGEST_SIGNING_KEY) {
    console.error('[FATAL] INNGEST_SIGNING_KEY missing (needed for REST observation)')
    process.exit(1)
  }

  const { Inngest } = await import('inngest')
  const inngest = new Inngest({
    id: 'zero-risk-platform',
    eventKey: process.env.INNGEST_EVENT_KEY,
  })

  const correlation_id = `canary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  console.log('Synthetic canary smoke · sending event to Inngest cloud:')
  console.log('  event_name      · synthetic/canary.run')
  console.log('  correlation_id  · ' + correlation_id)
  console.log('  tenant_id       · synthetic')
  console.log('  client_id       · c-canary')
  console.log('  journey_type    · ONBOARD')
  console.log('')

  const sendRes = await inngest.send({
    name: 'synthetic/canary.run',
    data: {
      correlation_id,
      tenant_id: 'synthetic',
      client_id: 'c-canary',
      journey_type: 'ONBOARD',
    },
  })
  const ids = Array.isArray(sendRes?.ids)
    ? sendRes.ids
    : sendRes?.eventId
      ? [sendRes.eventId]
      : []
  console.log('[OK] event sent · event_ids=' + JSON.stringify(ids))
  console.log('')

  // Poll Inngest REST events API for the function.finished signal.
  console.log('Polling Inngest REST · waiting for function.finished signal (up to 90s)')
  const deadline = Date.now() + 90_000
  let observed = null
  while (Date.now() < deadline) {
    const restRes = await fetch(
      'https://api.inngest.com/v1/events?limit=50',
      {
        headers: {
          Authorization: 'Bearer ' + process.env.INNGEST_SIGNING_KEY,
        },
      },
    )
    if (!restRes.ok) {
      console.warn('  REST poll status ' + restRes.status + ' · retrying in 5s')
      await new Promise((r) => setTimeout(r, 5000))
      continue
    }
    const body = await restRes.json()
    const list = body?.data ?? []
    // Look for a function.finished event whose event payload carries
    // our correlation_id.
    for (const ev of list) {
      if (ev.name !== 'inngest/function.finished') continue
      const triggerEvt = ev.data?.event
      if (triggerEvt?.data?.correlation_id === correlation_id) {
        observed = ev
        break
      }
    }
    if (observed) break
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, 4000))
  }
  console.log('')

  if (!observed) {
    console.error('[TIMEOUT] no function.finished observed in 90s')
    console.error('  · check Inngest dashboard for the run · the function may have not been registered (SALA_CANARY_ENABLED=true required)')
    process.exit(1)
  }

  console.log('[OK] function.finished observed:')
  console.log('  function_id  · ' + observed.data?.function_id)
  console.log('  status       · ' + (observed.data?._inngest?.status ?? '?'))
  console.log('  run_id       · ' + observed.data?.run_id)
  const result = observed.data?.result
  if (result) {
    console.log('  trace summary ·')
    console.log('    halted_by             · ' + result.halted_by)
    console.log('    ticks                 · ' + result.ticks)
    console.log('    total_events          · ' + result.total_events)
    console.log('    last_decisions_count  · ' + result.last_decisions_count)
    console.log('    elapsed_ms            · ' + result.elapsed_ms)
    if (Array.isArray(result.events)) {
      console.log('    events (first 10) ·')
      for (const e of result.events.slice(0, 10)) {
        console.log('      seq=' + e.sequence + ' · type=' + e.event_type + (e.step_id ? ' · step=' + e.step_id : ''))
      }
    }
  }
}

main().catch((e) => {
  console.error('[FATAL]', e?.stack || e?.message || e)
  process.exit(1)
})
