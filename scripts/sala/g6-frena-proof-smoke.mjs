#!/usr/bin/env node
/**
 * scripts/sala/g6-frena-proof-smoke.mjs · Sprint 12 Fase 0 Escalón 4.
 *
 * FRENA-PROOF LIVE · burst sintético contra un bucket de prueba con
 * cap bajo · confirma que el RPC `increment_bucket_atomic` bloquea
 * dispatches cuando el bucket exhauste.
 *
 * Reversible · no dispatch real · NO journeys reales · NO clientes
 * reales. El bucket sintético es `t:synthetic:c:smoke:j:SMOKE:o:cap-low`
 * con `max_count=2` · al 3er, 4to, 5to call esperamos exhausted=true.
 *
 * Steps ·
 *   1. Seed/upsert el bucket sintético con cap=2 (cleanup previo · current=0).
 *   2. Llamar el RPC 5 veces consecutivas.
 *   3. Verificar · 2× ok=true (cap libre) + 3× ok=false (exhausted).
 *   4. Cleanup · DELETE el bucket post-smoke (idempotente).
 *
 * §148 honest · evidencia REAL · cada call retorna el RPC raw + el
 * adapter mapped result. La aserción FALLA si la cuenta no cuadra.
 *
 * Pre-req · migration `202606040001_g6_rate_limit_buckets.sql` APPLIED
 * en Supabase live · verificado via PostgREST count antes de empezar.
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
      // skip missing files
    }
  }
}

const SYNTHETIC_BUCKET_KEY = 't:synthetic:c:smoke:j:SMOKE:o:cap-low'
const CAP_COUNT = 2
const TOTAL_CALLS = 5

async function main() {
  loadDotenv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[FATAL] missing SUPABASE_URL or SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  }

  function logHeader(t) {
    console.log('')
    console.log('───', t, '───')
  }

  // STEP 0 · pre-check · migration applied.
  logHeader('STEP 0 · pre-check · rate_limit_buckets table exists')
  const preRes = await fetch(
    url + '/rest/v1/rate_limit_buckets?select=bucket_key&limit=1',
    { headers: { ...headers, Prefer: 'count=exact' } },
  )
  if (preRes.status !== 200) {
    console.error('[FATAL] table missing or denied · status=' + preRes.status)
    process.exit(1)
  }
  console.log('  ✅ table present · count header =', preRes.headers.get('content-range'))

  // STEP 1 · seed/upsert synthetic bucket (cap=2).
  logHeader('STEP 1 · seed synthetic bucket cap=2 (cleanup if exists)')
  // DELETE first · idempotent reset.
  const delRes = await fetch(
    url +
      '/rest/v1/rate_limit_buckets?bucket_key=eq.' +
      encodeURIComponent(SYNTHETIC_BUCKET_KEY),
    { method: 'DELETE', headers },
  )
  console.log('  cleanup delete · status=' + delRes.status)

  const seedBody = {
    bucket_key: SYNTHETIC_BUCKET_KEY,
    scope: 'per_operation',
    max_count: CAP_COUNT,
    max_cost_usd: null,
    window_seconds: null,
    shadow_mode: false, // live · so we can prove enforce
  }
  const seedRes = await fetch(url + '/rest/v1/rate_limit_buckets', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(seedBody),
  })
  if (seedRes.status >= 300) {
    console.error('[FATAL] seed failed · status=' + seedRes.status)
    console.error(await seedRes.text())
    process.exit(1)
  }
  console.log('  ✅ seeded · cap_count=' + CAP_COUNT + ' · shadow_mode=false')

  // STEP 2 · burst · 5 calls.
  logHeader('STEP 2 · burst · ' + TOTAL_CALLS + ' calls vs cap=' + CAP_COUNT)
  const trace = []
  for (let i = 1; i <= TOTAL_CALLS; i++) {
    const t0 = Date.now()
    const rpcRes = await fetch(
      url + '/rest/v1/rpc/increment_bucket_atomic',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_bucket_key: SYNTHETIC_BUCKET_KEY,
          p_cost_usd: 0,
        }),
      },
    )
    const t1 = Date.now()
    const body = await rpcRes.json()
    const row = Array.isArray(body) ? body[0] : body
    const entry = {
      call: i,
      status: rpcRes.status,
      latency_ms: t1 - t0,
      exhausted: row?.exhausted ?? null,
      remaining_steps: row?.remaining_steps ?? null,
      remaining_cost_usd: row?.remaining_cost_usd ?? null,
      shadow_mode_db: row?.shadow_mode_db ?? null,
    }
    trace.push(entry)
    console.log(
      '  call=' + i,
      '· exhausted=' + entry.exhausted,
      '· remaining_steps=' + entry.remaining_steps,
      '· latency_ms=' + entry.latency_ms,
    )
  }

  // STEP 3 · assertions.
  logHeader('STEP 3 · assertions')
  const allowed = trace.filter((t) => t.exhausted === false).length
  const blocked = trace.filter((t) => t.exhausted === true).length
  console.log('  allowed (exhausted=false) =', allowed)
  console.log('  blocked (exhausted=true)  =', blocked)
  const expectedAllowed = CAP_COUNT
  const expectedBlocked = TOTAL_CALLS - CAP_COUNT

  let pass = true
  if (allowed !== expectedAllowed) {
    console.error('  ✘ allowed count ≠ ' + expectedAllowed + ' · got ' + allowed)
    pass = false
  } else {
    console.log('  ✅ allowed === ' + expectedAllowed)
  }
  if (blocked !== expectedBlocked) {
    console.error('  ✘ blocked count ≠ ' + expectedBlocked + ' · got ' + blocked)
    pass = false
  } else {
    console.log('  ✅ blocked === ' + expectedBlocked)
  }
  if (trace[0].exhausted !== false || trace[1].exhausted !== false) {
    console.error('  ✘ first 2 calls should be allowed (exhausted=false)')
    pass = false
  } else {
    console.log('  ✅ first 2 calls allowed in order')
  }
  if (
    trace[2].exhausted !== true ||
    trace[3].exhausted !== true ||
    trace[4].exhausted !== true
  ) {
    console.error('  ✘ calls 3-5 should be blocked (exhausted=true)')
    pass = false
  } else {
    console.log('  ✅ calls 3-5 blocked in order')
  }

  // STEP 4 · cleanup.
  logHeader('STEP 4 · cleanup synthetic bucket')
  const cleanupRes = await fetch(
    url +
      '/rest/v1/rate_limit_buckets?bucket_key=eq.' +
      encodeURIComponent(SYNTHETIC_BUCKET_KEY),
    { method: 'DELETE', headers },
  )
  console.log('  cleanup delete · status=' + cleanupRes.status)

  logHeader('SUMMARY')
  console.log(JSON.stringify({ allowed, blocked, trace }, null, 2))
  if (!pass) {
    console.error('')
    console.error('[FAIL] frena-proof DID NOT pass · investigate before claim done')
    process.exit(1)
  }
  console.log('')
  console.log('[OK] frena-proof LIVE verified · G6 cap atomic enforce works against real Supabase')
}

main().catch((e) => {
  console.error('[FATAL]', e?.stack || e?.message || e)
  process.exit(1)
})
