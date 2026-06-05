#!/usr/bin/env node
/**
 * scripts/sala/dlq-e2e-shadow-smoke.mjs · Sprint 12 Fase 0 escalón 5
 * pre-flip · DLQ Option A E2E shadow validation.
 *
 * Goal · close the last seam · prove the Inngest cloud onFailure path
 * → buildDeadLetterFailureHandler → writeDeadLetter actually fires
 * end-to-end when a function exhausts its retry budget. CC#1 already
 * verified the DB+alert side (manual INSERT dead_letter + Slack 200).
 * What was NOT proven · the cloud-side wiring of `onFailure` → handler.
 *
 * Flow ·
 *   1. Send 1 synthetic event with simulate_failure='always' + unique
 *      runId. The function body throws on step-2 every attempt (ignores
 *      attempt count · unlike 'step-2' mode which succeeds at attempt 2).
 *   2. Inngest cloud · 4 attempts (initial + 3 retries) · all fail.
 *   3. onFailure fires · writeDeadLetter writes a `dead_letter` row to
 *      sala_event_log + POSTs [DLQ] to #equipo via Slack.
 *   4. Poll sala_event_log via PostgREST until the row appears (or
 *      timeout at ~6 min · Inngest default backoff is ~30s/1m/2m).
 *   5. Print evidence · inngest_run_id, dead_lettered_at, attempts_made,
 *      final_error excerpt.
 *   6. Cleanup · DELETE the synthetic dead_letter row (idempotent).
 *
 * Guardrails ·
 *   - Synthetic · NO real client · tenant_id='synthetic' · client_id=runId
 *   - Shadow · synthetic function ONLY · no journey events
 *   - NO flip · NO enforce · NO canary
 *   - Cleanup · row deleted post-evidence
 *
 * Env required ·
 *   INNGEST_EVENT_KEY · to send the event
 *   NEXT_PUBLIC_SUPABASE_URL · for PostgREST polling
 *   SUPABASE_SERVICE_ROLE_KEY · service role for select + delete on sala_event_log
 *
 * Usage ·
 *   node scripts/sala/dlq-e2e-shadow-smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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
      // skip missing files
    }
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

function logHeader(t) {
  console.log('')
  console.log('───', t, '───')
}

const POLL_INTERVAL_MS = 15_000
const POLL_TIMEOUT_MS = 6 * 60_000 // 6 minutes · accommodates Inngest exponential backoff

async function main() {
  loadDotenv()
  if (!process.env.INNGEST_EVENT_KEY) {
    console.error('[FATAL] INNGEST_EVENT_KEY missing')
    process.exit(1)
  }
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !supaKey) {
    console.error('[FATAL] SUPABASE_URL or SERVICE_ROLE_KEY missing')
    process.exit(1)
  }

  const restHeaders = {
    apikey: supaKey,
    Authorization: 'Bearer ' + supaKey,
    'Content-Type': 'application/json',
  }

  // Unique runId per execution · prevents Inngest's idempotency
  // (event.data.runId · 24h TTL) from collapsing repeated smokes.
  const runId = 'dlq-e2e-shadow-' + Date.now()
  // tenant_id · client_id · stream_id · correlation_id are UUID columns
  // in sala_event_log (per ADR-009 schema). The writer hardens against
  // string identifiers (substitutes UUID + stashes original in payload)
  // but we pass valid UUIDs here so the canonical path is exercised
  // E2E without the substitution branch firing.
  const tenant_id = randomUUID()
  const client_id = randomUUID()
  const stream_id = randomUUID()
  const correlation_id = randomUUID()

  // ─── STEP 0 · pre-check · enum value applied ────────────────────
  logHeader('STEP 0 · pre-check · `dead_letter` enum value present')
  const enumProbe = await fetch(
    supaUrl +
      '/rest/v1/sala_event_log?select=event_type&event_type=eq.dead_letter&limit=1',
    { headers: restHeaders },
  )
  if (enumProbe.status !== 200) {
    console.error(
      '[FATAL] enum probe failed · status=' +
        enumProbe.status +
        ' body=' +
        (await enumProbe.text()),
    )
    process.exit(1)
  }
  console.log('[OK] sala_event_log queryable with event_type=dead_letter filter')

  // ─── STEP 1 · send synthetic event ──────────────────────────────
  logHeader('STEP 1 · send synthetic event · simulate_failure=always')
  const { Inngest } = await import('inngest')
  const inngest = new Inngest({
    id: 'zero-risk-platform',
    eventKey: process.env.INNGEST_EVENT_KEY,
  })
  const sendStartedAt = Date.now()
  const sendRes = await inngest.send({
    name: 'synthetic/durability.test',
    data: {
      runId,
      simulate_failure: 'always',
      tenant_id,
      client_id,
      stream_id,
      correlation_id,
      journey_type: 'SMOKE',
      logical_period: 'dlq-e2e',
    },
  })
  const eventIds = Array.isArray(sendRes?.ids)
    ? sendRes.ids
    : sendRes?.eventId
      ? [sendRes.eventId]
      : []
  console.log('[OK] event sent · runId=' + runId + ' · ids=' + JSON.stringify(eventIds))

  // ─── STEP 2 · poll sala_event_log for dead_letter row ──────────
  logHeader('STEP 2 · poll sala_event_log for dead_letter row')
  console.log(
    '(retries=3 + exponential backoff · expecting ~30s/1m/2m · timeout ' +
      POLL_TIMEOUT_MS / 1000 +
      's)',
  )

  let row = null
  const deadlineAt = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadlineAt) {
    await sleep(POLL_INTERVAL_MS)
    const elapsedS = Math.round((Date.now() - sendStartedAt) / 1000)
    // The writer unwraps the failure-event wrapper (since v3 unwrap fix)
    // so payload.original_event_name === 'synthetic/durability.test' and
    // trigger_payload IS the original synthetic event data (NOT the
    // inngest/function.failed wrapper). The runId we sent lives at
    // payload.trigger_payload.runId.
    const q =
      '/rest/v1/sala_event_log?select=*' +
      '&event_type=eq.dead_letter' +
      '&payload->>function_id=eq.synthetic-durability-test' +
      '&payload->>original_event_name=eq.synthetic/durability.test' +
      '&payload->trigger_payload->>runId=eq.' +
      encodeURIComponent(runId) +
      '&order=created_at.desc&limit=1'
    const res = await fetch(supaUrl + q, { headers: restHeaders })
    if (res.status !== 200) {
      console.warn(
        '[poll] status=' + res.status + ' body=' + (await res.text()),
      )
      continue
    }
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length > 0) {
      row = rows[0]
      console.log('[OK] dead_letter row found after ~' + elapsedS + 's')
      break
    }
    console.log('[poll +' + elapsedS + 's] no row yet · still waiting')
  }

  if (!row) {
    console.error('')
    console.error(
      '[FAIL] timeout · no dead_letter row appeared within ' +
        POLL_TIMEOUT_MS / 1000 +
        's',
    )
    console.error(
      '       check Inngest dashboard · was the function registered?',
    )
    console.error(
      '       was the onFailure handler attached? did all retries actually fail?',
    )
    process.exit(2)
  }

  // ─── STEP 3 · evidence dump ─────────────────────────────────────
  logHeader('STEP 3 · evidence')
  const payload = row.payload || {}
  console.log('event_id                 · ' + row.event_id)
  console.log('event_type               · ' + row.event_type)
  console.log('tenant_id                · ' + row.tenant_id)
  console.log('client_id                · ' + row.client_id)
  console.log('stream_id                · ' + row.stream_id)
  console.log('correlation_id           · ' + row.correlation_id)
  console.log('operation_type           · ' + row.operation_type)
  console.log('workflow_run_id          · ' + (row.workflow_run_id ?? '(null)'))
  console.log('payload.function_id      · ' + payload.function_id)
  console.log('payload.inngest_run_id   · ' + payload.inngest_run_id)
  console.log('payload.attempts_made    · ' + payload.attempts_made)
  console.log('payload.dead_lettered_at · ' + payload.dead_lettered_at)
  console.log('payload.original_event_id     · ' + payload.original_event_id)
  console.log('payload.original_event_name   · ' + payload.original_event_name)
  console.log(
    'payload.final_error      · ' +
      (typeof payload.final_error === 'string'
        ? payload.final_error.slice(0, 160)
        : payload.final_error),
  )

  const expectations = {
    'event_type === dead_letter': row.event_type === 'dead_letter',
    'tenant_id matches synthetic UUID': row.tenant_id === tenant_id,
    'client_id matches synthetic UUID': row.client_id === client_id,
    'stream_id matches synthetic UUID': row.stream_id === stream_id,
    'correlation_id matches synthetic UUID':
      row.correlation_id === correlation_id,
    'function_id === synthetic-durability-test':
      payload.function_id === 'synthetic-durability-test',
    'inngest_run_id is set (failure wrapper run_id)': Boolean(
      payload.inngest_run_id,
    ),
    'original_event_name === synthetic/durability.test':
      payload.original_event_name === 'synthetic/durability.test',
    'final_error mentions step-2':
      typeof payload.final_error === 'string' &&
      payload.final_error.includes('step-2'),
    'trigger_payload.runId matches':
      payload.trigger_payload &&
      payload.trigger_payload.runId === runId,
  }
  console.log('')
  let allOk = true
  for (const [k, v] of Object.entries(expectations)) {
    console.log((v ? '[OK] ' : '[FAIL] ') + k)
    if (!v) allOk = false
  }
  if (!allOk) {
    console.error('')
    console.error('[FAIL] one or more expectations did not match')
    process.exit(3)
  }

  // ─── STEP 4 · cleanup ───────────────────────────────────────────
  logHeader('STEP 4 · cleanup · DELETE the synthetic dead_letter row')
  const delRes = await fetch(
    supaUrl +
      '/rest/v1/sala_event_log?event_id=eq.' +
      encodeURIComponent(row.event_id),
    {
      method: 'DELETE',
      headers: { ...restHeaders, Prefer: 'return=minimal' },
    },
  )
  if (delRes.status >= 200 && delRes.status < 300) {
    console.log('[OK] row deleted · event_id=' + row.event_id)
  } else {
    console.warn(
      '[WARN] delete failed · status=' +
        delRes.status +
        ' · body=' +
        (await delRes.text()),
    )
    console.warn(
      '       row left in DB · safe to delete manually · event_id=' +
        row.event_id,
    )
  }

  // ─── SUMMARY ────────────────────────────────────────────────────
  logHeader('SUMMARY · DLQ E2E shadow validation PASS')
  console.log('runId            · ' + runId)
  console.log('inngest_run_id   · ' + payload.inngest_run_id)
  console.log('attempts_made    · ' + payload.attempts_made)
  console.log('dead_letter row  · written + verified + cleaned up')
  console.log('Slack alert      · check #equipo for [DLQ] ' + client_id)
  console.log('')
  console.log(
    'NOTE · Slack delivery is best-effort + side-effect · not asserted here.',
  )
  console.log(
    '       Visual check #equipo for "[DLQ] ' +
      client_id +
      ' · synthetic-durability-test · ..."',
  )
}

main().catch((e) => {
  console.error('[FATAL]', e?.stack || e?.message || e)
  process.exit(1)
})
