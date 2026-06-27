#!/usr/bin/env node
/**
 * Add the 7 missing phase-boundary emit nodes to worker LyVoKcrypS5uLyuu
 * (dispatch 2026-06-27 · §144 · NO PUT sin aprobación).
 *
 * The worker already has 1 emit (deal_won_received). This adds the other 7 of
 * the 8 canonical boundaries · each a LATERAL fire-and-forget httpRequest to
 * /api/sala/ingress (clone of the existing emit · only phase_name + name +
 * position + id change). Each is wired as a SIDE branch off its anchor node
 * (the anchor fans out to its existing main-next AND the emit · both run · the
 * emit is dangling + neverError).
 *
 * Output · staged-worker-8emits.json (clean PUT payload). Run ·
 *   node scripts/worker-staging/LyVoKcrypS5uLyuu/build-7-phase-emits.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const wf = JSON.parse(readFileSync(join(DIR, 'live-snapshot-post-multisource.json'), 'utf8'))

// Canonical boundary → anchor node (verified against live connections 2026-06-28).
// deal_won_received already exists (anchor Validate Deal Data) · NOT re-added.
const BOUNDARIES = [
  { phase: 'onboarding_specialist_done', anchor: 'Call Onboarding Specialist: Auto-Discovery' }, // code node post-Wait (agent done)
  { phase: 'notion_workspace_created', anchor: 'Create Notion Client Workspace' },
  { phase: 'success_plan_built', anchor: 'Create Success Plan in Notion' },
  { phase: 'kickoff_scheduled', anchor: 'Schedule Kickoff Call (Cal.com)' },
  { phase: 'cliente_persisted', anchor: 'Persist Client to Supabase' },
  { phase: 'mc_inbox_notified', anchor: 'Notify MC Inbox' },
  { phase: 'journey_completed', anchor: '[MODELB] Write-back Callback · run terminal' },
]

// Find the existing emit to clone its params verbatim.
const template = wf.nodes.find((n) => n.name.includes('Phase-boundary Emit'))
if (!template) throw new Error('existing phase-boundary emit not found')

// Resolve an anchor node by exact-or-substring match · onboarding uses the
// CODE node (post-Wait), NOT the fire+forget dispatch node.
function findAnchor(name) {
  if (name === 'Call Onboarding Specialist: Auto-Discovery') {
    return wf.nodes.find((n) => n.name === 'Call Onboarding Specialist: Auto-Discovery')
  }
  return wf.nodes.find((n) => n.name === name) || wf.nodes.find((n) => n.name.includes(name))
}

const added = []
for (let i = 0; i < BOUNDARIES.length; i++) {
  const { phase, anchor } = BOUNDARIES[i]
  const anchorNode = findAnchor(anchor)
  if (!anchorNode) throw new Error(`anchor not found: ${anchor}`)

  // Clone template params · swap phase_name only.
  const params = JSON.parse(JSON.stringify(template.parameters))
  params.jsonBody = params.jsonBody.replace(
    /"phase_name":\s*"[^"]*"/,
    `"phase_name": "${phase}"`,
  )

  const newName = `[MODELB] Phase-boundary Emit · ${phase}`
  const newNode = {
    id: randomUUID(),
    name: newName,
    type: template.type,
    typeVersion: template.typeVersion,
    position: [anchorNode.position[0] + 40, anchorNode.position[1] + 220],
    parameters: params,
  }
  wf.nodes.push(newNode)

  // Wire anchor → emit as a SIDE branch (append to existing main[0] output).
  wf.connections[anchorNode.name] = wf.connections[anchorNode.name] || { main: [[]] }
  const c = wf.connections[anchorNode.name]
  if (!c.main) c.main = [[]]
  if (!c.main[0]) c.main[0] = []
  c.main[0].push({ node: newName, type: 'main', index: 0 })

  added.push({ phase, anchor: anchorNode.name, node: newName })
}

// ─── Clean PUT payload ──────────────────────────────────────────────
const putPayload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings ?? {},
}

// ─── Validation ─────────────────────────────────────────────────────
const errs = []
const emits = putPayload.nodes.filter((n) => n.name.includes('Phase-boundary Emit'))
const phases = emits.map((n) => n.parameters.jsonBody.match(/"phase_name":\s*"([^"]*)"/)[1])
const EXPECTED = [
  'deal_won_received', 'onboarding_specialist_done', 'notion_workspace_created',
  'success_plan_built', 'kickoff_scheduled', 'cliente_persisted',
  'mc_inbox_notified', 'journey_completed',
]
if (emits.length !== 8) errs.push(`expected 8 emit nodes · got ${emits.length}`)
for (const p of EXPECTED) if (!phases.includes(p)) errs.push(`missing phase: ${p}`)
if (new Set(phases).size !== phases.length) errs.push('duplicate phase_name')
if (JSON.stringify(putPayload).includes('SET PER CALL SITE')) errs.push('placeholder present')
if (/hooks\.slack\.com\/services\/T/.test(JSON.stringify(putPayload))) errs.push('slack secret present')

writeFileSync(join(DIR, 'staged-worker-8emits.json'), JSON.stringify(putPayload, null, 2))

console.log('=== build-7-phase-emits ===')
console.log('nodes:', wf.nodes.length, '(was 42 · +7 emits = 49)')
console.log('emit nodes:', emits.length, '· phases:', phases.sort().join(', '))
console.log('added:')
for (const a of added) console.log(`  + ${a.node}  (anchor: ${a.anchor})`)
if (errs.length) { console.error('VALIDATION FAILED:', errs.join(' · ')); process.exit(1) }
console.log('VALIDATION OK · staged-worker-8emits.json ready for §144 PUT (NOT applied)')
