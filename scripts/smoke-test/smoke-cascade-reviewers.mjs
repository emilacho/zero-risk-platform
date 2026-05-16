#!/usr/bin/env node
/**
 * Gaps 4 + 5 cascade reviewer smoke test
 *
 * Invokes:
 *   - style-consistency-reviewer   (gap 4 · post-Camino-III cross-output)
 *   - delivery-coordinator         (gap 5 · final shippability gate)
 *
 * …against a Náufrago v1 cascade fixture (5 outputs · intentionally seeded
 * with vocabulary + POV + CTA-verb-family + register drift that Camino III
 * cannot catch by design — those reviewers see one output at a time).
 *
 * Usage:
 *   node scripts/smoke-test/smoke-cascade-reviewers.mjs
 *   node scripts/smoke-test/smoke-cascade-reviewers.mjs --dry-run
 *   node scripts/smoke-test/smoke-cascade-reviewers.mjs --fixture=path/to/cascade.json
 *   node scripts/smoke-test/smoke-cascade-reviewers.mjs --endpoint=https://...
 *
 * Requires (unless --dry-run):
 *   INTERNAL_API_KEY in .env.local · POST /api/agents/run auth
 *   VERCEL_URL (optional · defaults to https://zero-risk-platform.vercel.app)
 *
 * Exit code:
 *   0 · both agents PASS (non-empty response · valid JSON parsed)
 *   1 · either agent FAIL (network error · empty response · invalid JSON)
 *   2 · prerequisites missing (no .env.local · no fixture)
 *
 * Output: `scripts/smoke-test/out/cascade-reviewers-<timestamp>.md`
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

const args = process.argv.slice(2)
const FLAGS = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=')
      return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)]
    }),
)
const DRY = !!FLAGS['dry-run']
const FIXTURE_PATH = FLAGS.fixture
  ? resolve(process.cwd(), FLAGS.fixture)
  : resolve(__dirname, 'fixtures', 'naufrago-v1-cascade.json')

// ── Env loader (minimal · same shape as register-managed-agents.mjs) ────
function loadEnv() {
  const envPath = resolve(ROOT, '.env.local')
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

function endpointFromEnv(env) {
  if (FLAGS.endpoint) return FLAGS.endpoint
  return env.VERCEL_URL || env.NEXT_PUBLIC_APP_URL || 'https://zero-risk-platform.vercel.app'
}

async function invokeAgent({ endpoint, apiKey, slug, task, context, timeoutMs = 120000 }) {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${endpoint}/api/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ agent: slug, task, context }),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = { _parse_error: text.slice(0, 300) }
    }
    return {
      slug,
      ok: res.ok && !!(json?.success || json?.output || json?.response),
      http_status: res.status,
      duration_ms: Date.now() - t0,
      body: json,
    }
  } catch (err) {
    return {
      slug,
      ok: false,
      http_status: 0,
      duration_ms: Date.now() - t0,
      body: { _error: err?.message || String(err) },
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractFindings(body) {
  // The agents return strict JSON inside the `output` / `response` field.
  // We try to parse it · if it's prose, we return the raw string.
  const raw = body?.output || body?.response || body?.result || ''
  if (!raw) return { parsed: null, raw: '' }
  if (typeof raw === 'object') return { parsed: raw, raw: JSON.stringify(raw) }
  const match = raw.match(/```json\s*([\s\S]+?)\s*```/)
  const candidate = match ? match[1] : raw
  try {
    return { parsed: JSON.parse(candidate), raw }
  } catch {
    return { parsed: null, raw }
  }
}

function summarizeStyleVerdict(parsed) {
  if (!parsed) return '· verdict unparsable'
  const findings = Array.isArray(parsed.findings) ? parsed.findings.length : 0
  return `verdict=${parsed.verdict} severity=${parsed.severity} findings=${findings} register=${parsed.cascade_register || '?'}`
}

function summarizeDeliveryVerdict(parsed) {
  if (!parsed) return '· verdict unparsable'
  const blockers = Array.isArray(parsed.blocking_issues) ? parsed.blocking_issues.length : 0
  return `verdict=${parsed.verdict} severity=${parsed.severity} blockers=${blockers} next=${parsed.next_step || '?'}`
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(FIXTURE_PATH)) {
    console.error(`✗ Fixture not found: ${FIXTURE_PATH}`)
    process.exit(2)
  }
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'))
  console.log(`▶ Cascade fixture: ${FIXTURE_PATH}`)
  console.log(`  cascade_id  : ${fixture.cascade_id}`)
  console.log(`  client_id   : ${fixture.client_id}`)
  console.log(`  outputs     : ${fixture.outputs?.length ?? 0}`)
  console.log('')

  if (DRY) {
    console.log('— dry-run · not invoking agents —')
    process.exit(0)
  }

  const env = loadEnv()
  const apiKey = env.INTERNAL_API_KEY
  if (!apiKey) {
    console.error('✗ INTERNAL_API_KEY missing from .env.local. Run with --dry-run to inspect the fixture only.')
    process.exit(2)
  }
  const endpoint = endpointFromEnv(env)
  console.log(`  endpoint    : ${endpoint}`)
  console.log('')

  // Stage 1 · style-consistency-reviewer
  console.log('▶ Invoking style-consistency-reviewer (gap 4) …')
  const styleTask =
    'Review the following multi-output client cascade for cross-output coherence. ' +
    'Apply the 4-axis framework (tone_alignment, vocabulary_harmony, voice_fidelity, ' +
    'pov_consistency). Return strict JSON per your output contract.'
  const styleResult = await invokeAgent({
    endpoint,
    apiKey,
    slug: 'style-consistency-reviewer',
    task: styleTask,
    context: {
      cascade_id: fixture.cascade_id,
      client_id: fixture.client_id,
      outputs: fixture.outputs,
      brand_voice_summary: fixture.brand_voice_summary,
      _smoke_test: true,
    },
  })
  const styleParsed = extractFindings(styleResult.body)
  console.log(`  status=${styleResult.ok ? 'PASS' : 'FAIL'} http=${styleResult.http_status} ms=${styleResult.duration_ms}`)
  console.log(`  ${summarizeStyleVerdict(styleParsed.parsed)}`)
  console.log('')

  // Stage 2 · delivery-coordinator
  console.log('▶ Invoking delivery-coordinator (gap 5) …')
  const deliveryTask =
    'Run the 7-check final shippability audit on the following cascade. Return strict JSON ' +
    'per your output contract. Treat any high or critical fail as `escalated`.'
  const deliveryResult = await invokeAgent({
    endpoint,
    apiKey,
    slug: 'delivery-coordinator',
    task: deliveryTask,
    context: {
      cascade_id: fixture.cascade_id,
      client_id: fixture.client_id,
      outputs: fixture.outputs,
      camino_iii_verdict: fixture.camino_iii_verdict,
      style_consistency_verdict: styleParsed.parsed,
      delivery_context: fixture.delivery_context,
      _smoke_test: true,
    },
  })
  const deliveryParsed = extractFindings(deliveryResult.body)
  console.log(`  status=${deliveryResult.ok ? 'PASS' : 'FAIL'} http=${deliveryResult.http_status} ms=${deliveryResult.duration_ms}`)
  console.log(`  ${summarizeDeliveryVerdict(deliveryParsed.parsed)}`)
  console.log('')

  // ── Report ──
  const OUT_DIR = resolve(__dirname, 'out')
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const report = `# Cascade Reviewers Smoke · ${fixture.cascade_id} · ${stamp}

Fixture: \`${FIXTURE_PATH}\`
Endpoint: \`${endpoint}\`

## style-consistency-reviewer (gap 4)
- Status: **${styleResult.ok ? 'PASS' : 'FAIL'}**
- HTTP: \`${styleResult.http_status}\` · duration \`${styleResult.duration_ms}ms\`
- Verdict: \`${summarizeStyleVerdict(styleParsed.parsed)}\`
- Raw output (first 1000 chars):

\`\`\`
${(styleParsed.raw || '').slice(0, 1000)}
\`\`\`

## delivery-coordinator (gap 5)
- Status: **${deliveryResult.ok ? 'PASS' : 'FAIL'}**
- HTTP: \`${deliveryResult.http_status}\` · duration \`${deliveryResult.duration_ms}ms\`
- Verdict: \`${summarizeDeliveryVerdict(deliveryParsed.parsed)}\`
- Raw output (first 1000 chars):

\`\`\`
${(deliveryParsed.raw || '').slice(0, 1000)}
\`\`\`
`
  const outPath = resolve(OUT_DIR, `cascade-reviewers-${stamp}.md`)
  writeFileSync(outPath, report, 'utf-8')
  console.log(`📄 Report: ${outPath}`)

  const overallOk = styleResult.ok && deliveryResult.ok
  process.exit(overallOk ? 0 : 1)
}

main().catch((err) => {
  console.error('💥 Fatal:', err)
  process.exit(1)
})
