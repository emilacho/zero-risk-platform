#!/usr/bin/env node
/**
 * HITL Gate patcher — upgrades MC inbox notifications from type:'report' to
 * type:'approval' in RSA and Ad Creative workflows so Mission Control shows
 * them as approval-pending items instead of plain reports.
 *
 * What it changes:
 *   RSA workflow   — rewrites "Notify MC Inbox" body: type report → approval,
 *                    improved subject + headline preview in body
 *   Ad Creative    — adds "Notify MC Inbox" node after Slack if missing
 *
 * Gap addressed: HITL_FINDINGS_S33 GAP #1
 * Commit: f07cefd (pipeline-orchestrator fixes) + this patcher
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const MC = `$env.MC_BASE_URL || 'https://zero-risk-mission-control-production.up.railway.app'`
const MC_TOKEN = `$env.MC_API_TOKEN || 'zerorisk2026'`
const VB = `$('Code: Validate Brief').item.json`
const VM = `$('Code: Validate RSA Matrix').item.json`

// ─── RSA workflow ─────────────────────────────────────────────────────────────

const RSA_FIXED = {
  'Notify MC Inbox': {
    method: 'POST',
    url: `={{ ${MC} }}/api/inbox?masterPassword={{ ${MC_TOKEN} }}`,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={"from":"rsa-generator","to":"leader","type":"approval","taskId":"{{ ${VB}.task_id }}","subject":"RSA Pendiente Aprobacion: {{ ${VB}.keyword }}","body":"Cliente: {{ ${VB}.client_id }} | Keyword: {{ ${VB}.keyword }} | Headlines: {{ ${VM}.headline_count }} generadas. Ver en plataforma para aprobar o rechazar. Task: {{ ${VB}.task_id }}"}`,
    options: { timeout: 10000, response: { response: { neverError: true } } },
  },
}

// ─── Ad Creative → Message Match Validator ───────────────────────────────────

const VI = `$('Validate Input').item.json`
const ED = `$('Editor en Jefe (Sonnet) - Schwartz Audit').item.json`

const AD_MC_NODE = {
  parameters: {
    method: 'POST',
    url: `={{ ${MC} }}/api/inbox?masterPassword={{ ${MC_TOKEN} }}`,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={"from":"ad-creative-validator","to":"leader","type":"approval","taskId":"{{ ${VI}.audit_id }}","subject":"⏳ Ad Creative Validado — Revisar {{ ${VI}.campaign_id }}","body":"Message match audit completado.\\n\\nCliente: {{ ${VI}.client_id }}\\nCampaign: {{ ${VI}.campaign_id }}\\nMatch Score: {{ Number(${ED}.match_score) || 100 }}/100\\nChange Type: {{ ${VI}.change_type }}\\n\\nResult: match score >= 70 → APROBADO para lanzamiento.\\nVerificar en Mission Control si requiere revisión manual."}`,
    options: { timeout: 10000, response: { response: { neverError: true } } },
  },
  id: 'notify-mc-inbox-ad',
  name: 'Notify MC Inbox',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1900, 300],
}

async function patchWorkflow(wf, detail, fixedParams, addNode) {
  let changed = 0
  const missing = []

  // Rewrite existing nodes
  for (const node of detail.nodes) {
    const fix = fixedParams[node.name]
    if (!fix) continue
    const before = JSON.stringify(node.parameters)
    const base = { ...(node.parameters || {}) }
    for (const k of ['formData', 'bodyParameters', 'queryParameters', 'authentication']) delete base[k]
    node.parameters = { ...base, ...fix }
    if (JSON.stringify(node.parameters) !== before) { changed++; console.log(`   rewrote: ${node.name}`) }
  }

  // Check for missing
  for (const name of Object.keys(fixedParams)) {
    if (!detail.nodes.some(n => n.name === name)) missing.push(name)
  }
  if (missing.length) console.log('   ⚠ nodes not found (no change applied):', missing)

  // Optionally add a new node
  if (addNode && !detail.nodes.some(n => n.name === addNode.name)) {
    console.log(`   + adding node: ${addNode.name}`)
    detail.nodes.push(addNode)

    // Wire: Respond (Approved) → Notify MC Inbox (add to connections)
    const connKey = 'Respond (Approved)'
    if (!detail.connections[connKey]) detail.connections[connKey] = { main: [[]] }
    if (!detail.connections[connKey].main) detail.connections[connKey].main = [[]]
    if (!detail.connections[connKey].main[0]) detail.connections[connKey].main[0] = []
    detail.connections[connKey].main[0].push({ node: addNode.name, type: 'main', index: 0 })
    changed++
  }

  if (!changed) { console.log('   (no changes needed)'); return }
  if (DRY) { console.log(`   [DRY] would PUT ${changed} changes`); return }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + wf.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: detail.name, nodes: detail.nodes, connections: detail.connections,
      settings: detail.settings || { executionOrder: 'v1' },
    }),
  })

  if (put.ok) {
    console.log(`   ✓ PUT 200 — ${changed} change(s) applied`)
    if (wf.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + wf.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + wf.id + '/activate', { method: 'POST', headers: H, body: '{}' })
      console.log(`   ✓ reactivated`)
    }
  } else {
    console.log(`   ✗ PUT ${put.status}: ${(put.text || put.error || '').slice(0, 400)}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { workflows } = await listN8nWorkflows()

// RSA
const rsaWfs = workflows.filter(w => /RSA/i.test(w.name) && /Headline/i.test(w.name))
for (const w of rsaWfs) {
  console.log(`\n=== RSA: ${w.name} (${w.id})`)
  const r = await fetchWorkflowDetail(w.id)
  if (!r.ok || !r.json?.nodes) { console.error(`   ✗ fetch failed: ${r.status}`); continue }
  await patchWorkflow(w, r.json, RSA_FIXED, null)
}

// Ad Creative Message Match Validator
const adWfs = workflows.filter(w => /Ad Creative/i.test(w.name) && /Message Match/i.test(w.name))
const AD_FIXED = {
  'Notify MC Inbox': {
    method: 'POST',
    url: `={{ ${MC} }}/api/inbox?masterPassword={{ ${MC_TOKEN} }}`,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={"from":"ad-creative-validator","to":"leader","type":"approval","taskId":"{{ ${VI}.audit_id }}","subject":"Ad Creative Validado: Revisar {{ ${VI}.campaign_id }}","body":"Cliente: {{ ${VI}.client_id }} | Campaign: {{ ${VI}.campaign_id }} | Match Score: {{ Number(${ED}.match_score) || 100 }}/100 | Change: {{ ${VI}.change_type }} | Score >= 70 = APROBADO. Ver Mission Control para revision."}`,
    options: { timeout: 10000, response: { response: { neverError: true } } },
  },
}
for (const w of adWfs) {
  console.log(`\n=== AdCreative: ${w.name} (${w.id})`)
  const r = await fetchWorkflowDetail(w.id)
  if (!r.ok || !r.json?.nodes) { console.error(`   ✗ fetch failed: ${r.status}`); continue }
  // Update existing Notify MC Inbox if present, otherwise add new node
  const hasNode = r.json.nodes.some(n => n.name === 'Notify MC Inbox')
  await patchWorkflow(w, r.json, AD_FIXED, hasNode ? null : AD_MC_NODE)
}

if (!rsaWfs.length && !adWfs.length) {
  console.error('No target workflows found.')
  process.exit(1)
}
console.log('\nDone.')
