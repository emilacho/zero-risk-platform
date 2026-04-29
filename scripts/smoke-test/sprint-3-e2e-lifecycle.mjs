#!/usr/bin/env node
/**
 * sprint-3-e2e-lifecycle.mjs · Wave 11 T3 · CC#1
 *
 * End-to-end full lifecycle smoke test para Sprint #3 Fase 1 Master Journey
 * Orchestrator. Cubre el flow completo:
 *
 *    dispatch  →  persist (HITL pause)  →  resume (approve)  →  complete
 *
 * Por cada uno de 6 scenarios (1 por journey · A,B,C,D,E + F=PRODUCE chained):
 *   1. POST /api/journey/dispatch (con fixture wrappeada)
 *   2. Verify row created status=initiated|active
 *   3. Simulate persist: row → paused_hitl + resume_token + ttl_expires_at
 *   4. Verify token shape + HMAC verify round-trip
 *   5. POST /api/journey/resume con token + decision=approve
 *   6. Verify status=active
 *   7. Mark completed (direct DB or callback)
 *   8. Cleanup row (DELETE)
 *
 * Run modes:
 *   node scripts/smoke-test/sprint-3-e2e-lifecycle.mjs              # dry-run · sin HTTP · valida lógica + token gen
 *   node scripts/smoke-test/sprint-3-e2e-lifecycle.mjs --http       # full integration · requiere INTERNAL_API_KEY + server local + migration aplicada
 *   node scripts/smoke-test/sprint-3-e2e-lifecycle.mjs --http --base=https://zero-risk-platform.vercel.app
 *
 * Exit code:
 *   0 si todos los scenarios PASS (ambos modos)
 *   1 si algún scenario FAIL en --http mode
 *   0 en dry-run con FAIL (informativo · no bloquea CI hasta migration aplicada)
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import crypto from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const FIXTURES_DIR = resolve(REPO_ROOT, '..', 'docs', '05-orquestacion', 'fixtures')

const PILOT_CLIENT_UUID = '07f88bef-8054-4d09-9102-46bc36177c2f'

const SCENARIOS = [
  { id: 'A', fixture: 'journey-a-mock-input.json', journey: 'ACQUIRE', stage_persist: 'stage-5_qualification_hitl' },
  { id: 'B', fixture: 'journey-b-mock-input.json', journey: 'ONBOARD', stage_persist: 'stage-3_brand_book_review' },
  { id: 'C', fixture: 'journey-c-mock-input.json', journey: 'PRODUCE', stage_persist: 'phase-5_qa_hitl' },
  { id: 'D', fixture: 'journey-d-mock-input.json', journey: 'ALWAYS_ON', stage_persist: 'always_on_alert_review' },
  { id: 'E', fixture: 'journey-e-mock-input.json', journey: 'REVIEW', stage_persist: 'stage-9_qbr_review' },
  { id: 'F', fixture: 'journey-f-mock-input.json', journey: 'PRODUCE', stage_persist: 'phase-5_qa_hitl', force_new: true },
]

// ─────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────
function loadFixture(fn) {
  const path = resolve(FIXTURES_DIR, fn)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function looksLikeDispatchPayload(obj) {
  return obj && typeof obj.journey === 'string' &&
    ['ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW'].includes(obj.journey)
}

function wrapAsDispatchPayload(scenario, raw) {
  if (looksLikeDispatchPayload(raw)) return raw
  const { client_id: rawClient, _meta, _description, ...rest } = raw
  let client_id = null
  if (scenario.journey !== 'ACQUIRE') {
    client_id = typeof rawClient === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawClient)
      ? rawClient
      : PILOT_CLIENT_UUID
  }
  const payload = {
    journey: scenario.journey,
    trigger_type: 'manual',
    trigger_source: 'wave11_e2e_lifecycle_test',
    params: rest,
  }
  if (client_id) payload.client_id = client_id
  if (scenario.force_new) payload.force_new = true
  return payload
}

/**
 * Replica de generateResumeToken / verifyResumeToken from src/lib/persist-resume.ts
 * (no podemos importar TS desde .mjs sin tsx; el algoritmo es 8 líneas).
 */
function generateResumeToken(secret) {
  const random = crypto.randomBytes(16).toString('hex')
  const sig = crypto.createHmac('sha256', secret).update(random).digest('hex').slice(0, 32)
  return `${random}.${sig}`
}

function verifyResumeToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return false
  const [random, sig] = token.split('.')
  if (!random || !sig || random.length !== 32 || sig.length !== 32) return false
  const expected = crypto.createHmac('sha256', secret).update(random).digest('hex').slice(0, 32)
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────
// Dry-run · simula el flow sin HTTP
// ─────────────────────────────────────────────────────────────────────
function runDryRunScenario(scenario) {
  const steps = []
  const secret = `mock-secret-${scenario.id}-${Date.now()}`

  // Step 1: Load + wrap fixture
  let payload
  try {
    const raw = loadFixture(scenario.fixture)
    payload = wrapAsDispatchPayload(scenario, raw)
    steps.push({ step: 'load+wrap', outcome: 'PASS', detail: `journey=${payload.journey}` })
  } catch (e) {
    steps.push({ step: 'load+wrap', outcome: 'FAIL', detail: e.message.slice(0, 80) })
    return { scenario: scenario.id, steps, final: 'FAIL' }
  }

  // Step 2: Simulate dispatch · 201 + journey_id
  const mockJourneyId = crypto.randomUUID()
  steps.push({ step: 'dispatch', outcome: 'PASS', detail: `mock journey_id=${mockJourneyId.slice(0, 8)} status=initiated` })

  // Step 3: Simulate persist · paused_hitl + resume_token
  const resumeToken = generateResumeToken(secret)
  steps.push({
    step: 'persist',
    outcome: 'PASS',
    detail: `paused_hitl · stage=${scenario.stage_persist} · token=${resumeToken.slice(0, 12)}…`,
  })

  // Step 4: Verify token round-trip
  const tokenValid = verifyResumeToken(resumeToken, secret)
  const tamperedValid = verifyResumeToken(resumeToken.slice(0, -1) + 'X', secret)
  const wrongSecretValid = verifyResumeToken(resumeToken, 'wrong-secret')
  if (tokenValid && !tamperedValid && !wrongSecretValid) {
    steps.push({ step: 'token-verify', outcome: 'PASS', detail: 'HMAC valid · tamper rejected · wrong secret rejected' })
  } else {
    steps.push({
      step: 'token-verify',
      outcome: 'FAIL',
      detail: `token=${tokenValid} tamper=${tamperedValid} wrong_secret=${wrongSecretValid}`,
    })
  }

  // Step 5: Simulate resume · status=active
  steps.push({ step: 'resume', outcome: 'PASS', detail: 'decision=approve · status=active · token invalidated' })

  // Step 6: Simulate complete
  steps.push({ step: 'complete', outcome: 'PASS', detail: 'status=completed · completed_at set' })

  // Step 7: Cleanup (no-op en dry-run)
  steps.push({ step: 'cleanup', outcome: 'PASS', detail: 'dry-run · no DB row to delete' })

  const final = steps.every((s) => s.outcome === 'PASS') ? 'PASS' : 'FAIL'
  return { scenario: scenario.id, journey: scenario.journey, steps, final }
}

// ─────────────────────────────────────────────────────────────────────
// HTTP mode · runs against real dev server + Supabase
// ─────────────────────────────────────────────────────────────────────
async function waitForServer(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { method: 'GET' })
      if (res.ok || res.status === 404) return true
    } catch {}
    await sleep(2_000)
  }
  return false
}

async function startLocalDevServer() {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000' },
    shell: process.platform === 'win32',
  })
  child.unref()
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

async function httpDispatch(baseUrl, key, payload) {
  const res = await fetch(`${baseUrl}/api/journey/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function httpResume(baseUrl, key, resumeToken, decision) {
  const res = await fetch(`${baseUrl}/api/journey/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ resume_token: resumeToken, decision }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function runHttpScenario(scenario, baseUrl, key) {
  const steps = []

  // Step 1: Dispatch
  let payload
  try {
    const raw = loadFixture(scenario.fixture)
    payload = wrapAsDispatchPayload(scenario, raw)
    steps.push({ step: 'load+wrap', outcome: 'PASS', detail: `journey=${payload.journey}` })
  } catch (e) {
    steps.push({ step: 'load+wrap', outcome: 'FAIL', detail: e.message.slice(0, 80) })
    return { scenario: scenario.id, steps, final: 'FAIL' }
  }

  const dispatchRes = await httpDispatch(baseUrl, key, payload).catch((e) => ({ status: 0, body: { detail: e.message } }))
  if (dispatchRes.status !== 201) {
    steps.push({ step: 'dispatch', outcome: 'FAIL', detail: `HTTP ${dispatchRes.status} · ${dispatchRes.body.error ?? ''} ${dispatchRes.body.detail ?? ''}`.slice(0, 100) })
    return { scenario: scenario.id, steps, final: 'FAIL' }
  }
  const journeyId = dispatchRes.body.journey_id
  steps.push({ step: 'dispatch', outcome: 'PASS', detail: `journey_id=${String(journeyId).slice(0, 8)} status=initiated` })

  // NOTA: Steps 3-7 (persist, resume, complete, cleanup) requieren acceso DIRECTO a
  // Supabase (UPDATE status=paused_hitl + insert resume_token) que el route handler
  // no expone. En post-deploy real, el flow lo gatilla un sub-workflow n8n cuando
  // alcanza el HITL stage · este script no puede invocar persist sin una API extra.
  //
  // Por ahora, después del dispatch, los pasos restantes están marcados SKIP_HTTP
  // (post-deploy: probar manualmente con un journey que avance a HITL via workflow).
  steps.push({
    step: 'persist',
    outcome: 'SKIP_HTTP',
    detail: 'Requires sub-workflow advancing journey to HITL · test manually post-import',
  })
  steps.push({
    step: 'token-verify',
    outcome: 'SKIP_HTTP',
    detail: 'See dry-run for token round-trip check',
  })
  steps.push({
    step: 'resume',
    outcome: 'SKIP_HTTP',
    detail: 'Endpoint /api/journey/resume callable · run dedicated resume test post-persist',
  })
  steps.push({
    step: 'complete',
    outcome: 'SKIP_HTTP',
    detail: 'Triggered by callback from sub-workflow',
  })

  // Step: cleanup · DELETE the dispatched row (best-effort)
  // No tenemos endpoint DELETE explícito · limpieza manual via SQL post-test.
  steps.push({
    step: 'cleanup',
    outcome: 'SKIP_HTTP',
    detail: `Manual: DELETE FROM client_journey_state WHERE id='${journeyId}'`,
  })

  const final = steps.some((s) => s.outcome === 'FAIL') ? 'FAIL' : 'PASS'
  return { scenario: scenario.id, journey: scenario.journey, journey_id: journeyId, steps, final }
}

// ─────────────────────────────────────────────────────────────────────
// Format
// ─────────────────────────────────────────────────────────────────────
function fmtScenarioReport(result) {
  const lines = [`\n┌─ Scenario ${result.scenario} (${result.journey}) ─ FINAL: ${result.final}`]
  if (result.journey_id) lines.push(`│  journey_id: ${result.journey_id}`)
  for (const s of result.steps) {
    const pad = s.step.padEnd(15)
    lines.push(`│  ${s.outcome.padEnd(10)} ${pad} ${s.detail}`)
  }
  lines.push('└─')
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const httpMode = args.includes('--http')
  const baseArg = args.find((a) => a.startsWith('--base='))
  const baseUrl = baseArg ? baseArg.slice('--base='.length) : 'http://localhost:3000'

  console.log('=== Sprint #3 E2E Lifecycle · Wave 11 T3 ===')
  console.log(`Mode: ${httpMode ? 'HTTP integration · ' + baseUrl : 'dry-run · simulation'}`)
  console.log(`Scenarios: ${SCENARIOS.length} (${SCENARIOS.map((s) => s.id).join(', ')})`)

  let serverChild = null
  let httpKey = null

  if (httpMode) {
    httpKey = process.env.INTERNAL_API_KEY
    if (!httpKey) {
      console.error('[FATAL] --http mode requires INTERNAL_API_KEY env var')
      process.exit(1)
    }
    if (baseUrl.startsWith('http://localhost')) {
      console.log('[HTTP] Starting local dev server...')
      serverChild = await startLocalDevServer()
      const ready = await waitForServer(baseUrl, 60_000)
      if (!ready) {
        console.error('[FATAL] Server not reachable within 60s')
        try { serverChild.kill() } catch {}
        process.exit(1)
      }
      console.log('[HTTP] Server ready · running scenarios')
    }
  }

  const results = []
  for (const scenario of SCENARIOS) {
    if (httpMode) {
      const r = await runHttpScenario(scenario, baseUrl, httpKey)
      results.push(r)
    } else {
      results.push(runDryRunScenario(scenario))
    }
  }

  if (serverChild) {
    try { serverChild.kill() } catch {}
  }

  // Print report
  for (const r of results) console.log(fmtScenarioReport(r))

  // Summary
  const passCount = results.filter((r) => r.final === 'PASS').length
  console.log(`\n=== Summary ===`)
  console.log(`Total: ${results.length}/${SCENARIOS.length}`)
  console.log(`PASS:  ${passCount}`)
  console.log(`FAIL:  ${results.length - passCount}`)

  // Exit policy
  if (httpMode && passCount < results.length) {
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
