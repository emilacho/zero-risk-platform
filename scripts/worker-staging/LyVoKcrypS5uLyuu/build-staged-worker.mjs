#!/usr/bin/env node
/**
 * Build the STAGED worker LyVoKcrypS5uLyuu (dispatch multi-source 2026-06-27).
 * §144 · builds staged-worker.json from live-snapshot.json · does NOT PUT to n8n.
 *
 * Applies 4 deterministic edits ·
 *   T1+T2 · node "[APIFY-WIRE] Discovery Parser" jsCode ← node16-discovery-parser.js
 *   T3    · node "[APIFY-WIRE] Aggregate Service responses" jsCode ← aggregate-service-responses.js
 *   T4    · node "[MODELB] Phase-boundary Emit" phase_name placeholder → "deal_won_received"
 *
 * Validates · JSON parses · node count unchanged · placeholder gone · phase set.
 * Run · node scripts/worker-staging/LyVoKcrypS5uLyuu/build-staged-worker.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const snap = JSON.parse(readFileSync(join(DIR, 'live-snapshot.json'), 'utf8'))
const node16Code = readFileSync(join(DIR, 'node16-discovery-parser.js'), 'utf8')
const aggCode = readFileSync(join(DIR, 'aggregate-service-responses.js'), 'utf8')

const before = (snap.nodes || []).length
let edited = { node16: false, agg: false, phase: false }

for (const n of snap.nodes || []) {
  if (n.name.includes('Discovery Parser')) {
    n.parameters.jsCode = node16Code
    edited.node16 = true
  } else if (n.name.includes('Aggregate Service responses')) {
    n.parameters.jsCode = aggCode
    edited.agg = true
  } else if (n.name.includes('Phase-boundary Emit')) {
    const body = n.parameters.jsonBody || ''
    if (body.includes('SET PER CALL SITE')) {
      // Replace the whole placeholder value (between the phase_name quotes) with
      // the canonical first boundary. The placeholder spans to the next \".
      n.parameters.jsonBody = body.replace(
        /"phase_name":\s*"[^]*?<<SET PER CALL SITE[^]*?>>"/,
        '"phase_name": "deal_won_received"',
      )
      edited.phase = !n.parameters.jsonBody.includes('SET PER CALL SITE')
    }
  }
}

// ─── Clean PUT payload ──────────────────────────────────────────────
// n8n `PUT /api/v1/workflows/:id` takes {name, nodes, connections, settings}.
// Read-only fields returned by GET (activeVersion · shared · versionId ·
// triggerCount · pinData · etc.) are NOT sent · activeVersion in particular
// carries a stale nested COPY (with the old placeholder) that must not leak.
const putPayload = {
  name: snap.name,
  nodes: snap.nodes,
  connections: snap.connections,
  settings: snap.settings ?? {},
}

// ─── Validation (against the CLEAN payload that will actually be PUT) ─
const after = putPayload.nodes.length
const errs = []
if (after !== before) errs.push(`node count changed ${before}→${after}`)
if (!edited.node16) errs.push('node16 not edited')
if (!edited.agg) errs.push('aggregate node not edited')
if (!edited.phase) errs.push('phase-boundary not fixed')
const stillPlaceholder = JSON.stringify(putPayload).includes('SET PER CALL SITE')
if (stillPlaceholder) errs.push('placeholder still present in PUT payload')

const out = join(DIR, 'staged-worker.json')
writeFileSync(out, JSON.stringify(putPayload, null, 2))

console.log('=== build-staged-worker ===')
console.log('nodes:', before, '→', after)
console.log('edited:', JSON.stringify(edited))
console.log('placeholder gone (PUT payload):', !stillPlaceholder)
console.log('output:', out, '· (clean PUT payload · name/nodes/connections/settings)')
if (errs.length) {
  console.error('VALIDATION FAILED:', errs.join(' · '))
  process.exit(1)
}
console.log('VALIDATION OK · staged-worker.json ready for §144 PUT (NOT applied)')
