#!/usr/bin/env node
/**
 * Peniche L1 smoke · sprint 1 dispatch acceptance test
 *
 * Reproduces the dispatch line 117 smoke ·
 *   client Peniche Surf Escape stuck at Phase 2 send_intake_form ·
 *   dispatch L1 with trigger_type=resume_stuck ·
 *   verify client_journey_state row created/updated ·
 *   verify L2 route resolution to /api/onboarding · DOES NOT actually
 *   invoke L2 (uses stub fetch) to avoid triggering a real onboarding run.
 *
 * Usage · `node scripts/smoke-peniche-l1-resume.mjs`
 *
 * Requires · .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_
 * SUPABASE_URL (already present in zr-platform repo for local dev).
 */
// Run with: node --env-file=.env.local scripts/smoke-peniche-l1-resume.mjs
import { dispatchJourney } from '../src/lib/journey-orchestrator/index.js'
import { createClient } from '@supabase/supabase-js'

const PENICHE_CLIENT_ID = '8802635f-9b9e-4b69-9371-24d33dd63f3c'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_* env vars · cannot run smoke')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Stub fetch · captures invocation + returns canned 200 (avoids triggering
// a real /api/onboarding run · spike-safe)
const fetchCalls = []
const stubFetch = async (url, init) => {
  fetchCalls.push({ url, method: init?.method, headers: init?.headers, body: init?.body?.slice(0, 200) })
  return new Response(
    JSON.stringify({
      session_id: 'onb-smoke-peniche',
      status: 'simulated · stub fetch · no real onboarding run',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

console.log('=== Peniche L1 resume_stuck smoke ===')
console.log('Pre-state · check existing journey rows for Peniche')
const pre = await supabase
  .from('client_journey_state')
  .select('id, journey, current_stage, status, started_at')
  .eq('client_id', PENICHE_CLIENT_ID)
  .order('started_at', { ascending: false })
  .limit(5)
console.log('Pre rows:', JSON.stringify(pre.data ?? [], null, 2))

console.log('\n=== dispatchJourney call ===')
const result = await dispatchJourney(
  {
    client_id: PENICHE_CLIENT_ID,
    journey: 'ONBOARD',
    trigger_type: 'resume_stuck',
    stage: 'send_intake_form',
    trigger_source: 'cc1_smoke_2026_05_20',
    params: { stuck_at_stage: 2, next_step: 'send_intake_form' },
  },
  { supabase, fetchImpl: stubFetch },
)
console.log('Result:', JSON.stringify(result, null, 2))

console.log('\n=== L2 invocations captured ===')
console.log('Total calls:', fetchCalls.length)
fetchCalls.forEach((c, i) => {
  console.log(`Call ${i + 1}:`, c.method, c.url)
  console.log('  body:', c.body)
})

console.log('\n=== Post-state · journey row after dispatch ===')
const post = await supabase
  .from('client_journey_state')
  .select('id, journey, current_stage, status, trigger_type, trigger_source, started_at, updated_at')
  .eq('client_id', PENICHE_CLIENT_ID)
  .order('updated_at', { ascending: false })
  .limit(5)
console.log('Post rows:', JSON.stringify(post.data ?? [], null, 2))

console.log('\n=== SMOKE OUTCOME ===')
const dispatched = result.dispatch_status === 'dispatched' && result.l2_target?.includes('/api/onboarding')
const persisted = post.data?.[0]?.current_stage === 'send_intake_form' && post.data?.[0]?.journey === 'ONBOARD'
const l2_called = fetchCalls.length === 1 && fetchCalls[0].url.includes('/api/onboarding')

console.log({
  dispatched,
  persisted,
  l2_called,
  ok: dispatched && persisted && l2_called,
})
process.exit(dispatched && persisted && l2_called ? 0 : 1)
