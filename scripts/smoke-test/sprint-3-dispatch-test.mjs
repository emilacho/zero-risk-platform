#!/usr/bin/env node
/**
 * sprint-3-dispatch-test.mjs · Wave 10 CP2 · CC#1
 *
 * Validates 6 mock fixtures against /api/journey/dispatch:
 *  Phase 1 — Schema validation (Ajv) on each fixture as-is
 *  Phase 2 — Wrap fixture as `params` of dispatch envelope · re-validate
 *  Phase 3 (optional · --http) — POST to local server + verify row + cleanup
 *
 * Run modes:
 *   node scripts/smoke-test/sprint-3-dispatch-test.mjs              # validation only (no HTTP)
 *   node scripts/smoke-test/sprint-3-dispatch-test.mjs --http       # full integration: spawn npm run dev + POST + verify + cleanup
 *   node scripts/smoke-test/sprint-3-dispatch-test.mjs --http --base=https://zero-risk-platform.vercel.app
 *
 * NOTE: Fixtures `journey-{a,b,c,e,f}-mock-input.json` están escritas como
 * INPUTS DE WORKFLOW (lead_email, campaign_brief, etc.) NO como payloads
 * directos de dispatch. La fixture `journey-d-mock-input.json` SÍ es shape
 * dispatch (CC#1 wrote it). El script soporta ambas estilos: si detecta
 * top-level `journey`, usa la fixture directo; si no, la wrappea como
 * `params` y deriva `journey` del nombre del archivo.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

// ─────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const FIXTURES_DIR = resolve(
  REPO_ROOT,
  '..',
  'docs',
  '05-orquestacion',
  'fixtures',
)

const FILENAME_TO_JOURNEY = {
  'journey-a-mock-input.json': 'ACQUIRE',
  'journey-b-mock-input.json': 'ONBOARD',
  'journey-c-mock-input.json': 'PRODUCE',
  'journey-d-mock-input.json': 'ALWAYS_ON',
  'journey-e-mock-input.json': 'REVIEW',
  'journey-f-mock-input.json': 'PRODUCE', // F = chained PRODUCE iteration with force_new
}

const PILOT_CLIENT_UUID = '07f88bef-8054-4d09-9102-46bc36177c2f'

const DISPATCH_INPUT_SCHEMA = {
  type: 'object',
  required: ['journey'],
  additionalProperties: true,
  properties: {
    client_id: { type: 'string', format: 'uuid' },
    journey: {
      type: 'string',
      enum: ['ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW'],
    },
    trigger_type: {
      type: 'string',
      enum: ['manual', 'webhook', 'cron', 'callback'],
    },
    trigger_source: { type: 'string', maxLength: 200 },
    params: { type: 'object' },
    parent_journey_id: { type: 'string', format: 'uuid' },
    force_new: { type: 'boolean' },
  },
}

// ─────────────────────────────────────────────────────────────────────
// Ajv setup
// ─────────────────────────────────────────────────────────────────────
const ajv = new Ajv({ strict: false, allErrors: true, useDefaults: false })
addFormats(ajv)
const validate = ajv.compile(DISPATCH_INPUT_SCHEMA)

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function loadFixture(filename) {
  const path = resolve(FIXTURES_DIR, filename)
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw)
}

function looksLikeDispatchPayload(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.journey === 'string' &&
    ['ACQUIRE', 'ONBOARD', 'PRODUCE', 'ALWAYS_ON', 'REVIEW'].includes(obj.journey)
  )
}

function wrapAsDispatchPayload(filename, fixtureContent) {
  const journey = FILENAME_TO_JOURNEY[filename]
  // Para ACQUIRE no se requiere client_id (cliente aún no existe).
  // Para los demás, derivamos del fixture si tiene un UUID, sino usamos pilot.
  let client_id = null
  if (journey !== 'ACQUIRE') {
    client_id =
      typeof fixtureContent.client_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        fixtureContent.client_id,
      )
        ? fixtureContent.client_id
        : PILOT_CLIENT_UUID
  }

  // Build params · stripped del client_id raw para evitar duplicado
  const { client_id: _drop, _meta, _description, ...rest } = fixtureContent
  const params = rest

  const payload = {
    journey,
    trigger_type: 'manual',
    trigger_source: 'wave10_smoke_dispatch_test',
    params,
  }
  if (client_id) payload.client_id = client_id
  // Journey F (force_new chained PRODUCE) usa flag explícito
  if (filename === 'journey-f-mock-input.json') payload.force_new = true

  return payload
}

function validatePayload(payload) {
  const ok = validate(payload)
  return {
    valid: ok,
    errors: ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`),
  }
}

function fmtTable(rows, columns) {
  const widths = columns.map((c) =>
    Math.max(
      c.label.length,
      ...rows.map((r) => String(r[c.key] ?? '').length),
    ),
  )
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
  const fmtRow = (r) =>
    '| ' +
    columns
      .map((c, i) => String(r[c.key] ?? '').padEnd(widths[i]))
      .join(' | ') +
    ' |'
  const lines = [
    sep,
    fmtRow(Object.fromEntries(columns.map((c) => [c.key, c.label]))),
    sep,
    ...rows.map(fmtRow),
    sep,
  ]
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 1 + 2 · validation only
// ─────────────────────────────────────────────────────────────────────
function runValidationPhases() {
  const filenames = Object.keys(FILENAME_TO_JOURNEY)
  const results = []

  console.log('\n=== Phase 1 · Raw fixture validation against DISPATCH schema ===')
  for (const fn of filenames) {
    let fixture
    try {
      fixture = loadFixture(fn)
    } catch (e) {
      results.push({
        fixture: fn,
        phase: 'P1',
        outcome: 'LOAD_FAIL',
        detail: e.message.slice(0, 60),
      })
      continue
    }
    const looksDispatch = looksLikeDispatchPayload(fixture)
    const v = validatePayload(fixture)
    results.push({
      fixture: fn,
      phase: 'P1',
      outcome: v.valid ? 'PASS' : 'FAIL',
      shape: looksDispatch ? 'dispatch' : 'workflow_input',
      detail: v.valid ? '' : (v.errors[0] ?? '').slice(0, 60),
    })
  }

  console.log('\n=== Phase 2 · Wrap as dispatch envelope and re-validate ===')
  const wrappedPayloads = {}
  for (const fn of filenames) {
    let fixture
    try {
      fixture = loadFixture(fn)
    } catch (e) {
      results.push({
        fixture: fn,
        phase: 'P2',
        outcome: 'LOAD_FAIL',
        detail: e.message.slice(0, 60),
      })
      continue
    }
    const payload = looksLikeDispatchPayload(fixture)
      ? fixture
      : wrapAsDispatchPayload(fn, fixture)
    wrappedPayloads[fn] = payload
    const v = validatePayload(payload)
    results.push({
      fixture: fn,
      phase: 'P2',
      outcome: v.valid ? 'PASS' : 'FAIL',
      shape: 'dispatch',
      detail: v.valid
        ? `journey=${payload.journey}, client_id=${(payload.client_id ?? '∅').slice(0, 12)}`
        : (v.errors[0] ?? '').slice(0, 60),
    })
  }

  return { results, wrappedPayloads }
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3 · HTTP integration (optional)
// ─────────────────────────────────────────────────────────────────────
async function waitForServer(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { method: 'GET' })
      if (res.ok || res.status === 404) return true // 404 fine si no existe /api/health
    } catch {}
    await sleep(2_000)
  }
  return false
}

async function startLocalDevServer() {
  console.log('\n[HTTP] Spawning `npm run dev` background...')
  const child = spawn('npm', ['run', 'dev'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000' },
    shell: process.platform === 'win32',
  })
  child.unref()
  // Drain stdio para que no se bloquee el buffer
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

async function cleanupRow(baseUrl, journeyId, internalKey) {
  // Delete via admin endpoint (creado en CP4 callback) o via Supabase REST.
  // Por ahora · best-effort no-op + log.
  console.log(`  [cleanup] would DELETE row ${journeyId} (manual cleanup TBD post-CP4)`)
}

async function runHttpPhase(wrappedPayloads, baseUrl) {
  const internalKey = process.env.INTERNAL_API_KEY
  if (!internalKey) {
    console.log(
      '\n[HTTP] SKIP · INTERNAL_API_KEY env var not set (export it from .env.local first)',
    )
    return []
  }

  console.log(`\n=== Phase 3 · HTTP integration · POST to ${baseUrl}/api/journey/dispatch ===`)
  const ready = await waitForServer(baseUrl, 60_000)
  if (!ready) {
    console.log('[HTTP] SKIP · server not reachable within 60s')
    return []
  }

  const httpResults = []
  for (const [fn, payload] of Object.entries(wrappedPayloads)) {
    let status, body
    try {
      const res = await fetch(`${baseUrl}/api/journey/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': internalKey,
        },
        body: JSON.stringify(payload),
      })
      status = res.status
      body = await res.json().catch(() => ({}))
    } catch (e) {
      httpResults.push({
        fixture: fn,
        phase: 'P3',
        outcome: 'FETCH_FAIL',
        detail: e.message.slice(0, 60),
      })
      continue
    }

    const journeyId = body?.journey_id
    httpResults.push({
      fixture: fn,
      phase: 'P3',
      outcome: status === 201 ? 'PASS' : `STATUS_${status}`,
      detail: journeyId
        ? `journey_id=${journeyId.slice(0, 8)}`
        : (body?.detail ?? body?.error ?? '').toString().slice(0, 60),
    })

    if (journeyId) {
      await cleanupRow(baseUrl, journeyId, internalKey)
    }
  }

  return httpResults
}

// ─────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const httpMode = args.includes('--http')
  const baseArg = args.find((a) => a.startsWith('--base='))
  const baseUrl = baseArg
    ? baseArg.slice('--base='.length)
    : 'http://localhost:3000'

  // Verify fixtures exist
  let allFixturesPresent = true
  for (const fn of Object.keys(FILENAME_TO_JOURNEY)) {
    try {
      readFileSync(resolve(FIXTURES_DIR, fn), 'utf-8')
    } catch {
      console.error(`[FATAL] Missing fixture: ${fn}`)
      allFixturesPresent = false
    }
  }
  if (!allFixturesPresent) process.exit(1)

  const { results, wrappedPayloads } = runValidationPhases()

  console.log('\n--- Validation results ---')
  console.log(
    fmtTable(results, [
      { key: 'fixture', label: 'fixture' },
      { key: 'phase', label: 'phase' },
      { key: 'outcome', label: 'outcome' },
      { key: 'shape', label: 'shape' },
      { key: 'detail', label: 'detail' },
    ]),
  )

  let allResults = [...results]

  if (httpMode) {
    let serverChild = null
    if (baseUrl.startsWith('http://localhost')) {
      serverChild = await startLocalDevServer()
    }
    try {
      const httpResults = await runHttpPhase(wrappedPayloads, baseUrl)
      if (httpResults.length > 0) {
        console.log('\n--- HTTP phase results ---')
        console.log(
          fmtTable(httpResults, [
            { key: 'fixture', label: 'fixture' },
            { key: 'phase', label: 'phase' },
            { key: 'outcome', label: 'outcome' },
            { key: 'detail', label: 'detail' },
          ]),
        )
      }
      allResults = allResults.concat(httpResults)
    } finally {
      if (serverChild) {
        try {
          serverChild.kill()
        } catch {}
      }
    }
  } else {
    console.log('\n[HTTP] skipped · pass --http to enable POST + verify + cleanup')
  }

  const failures = allResults.filter((r) => r.outcome !== 'PASS')
  console.log(`\nSummary: ${allResults.length - failures.length}/${allResults.length} PASS`)
  if (failures.length > 0) {
    console.log(`Failures: ${failures.map((f) => `${f.fixture} (${f.phase})`).join(', ')}`)
  }
  process.exit(failures.length > 0 && httpMode ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
