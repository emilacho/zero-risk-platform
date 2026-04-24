#!/usr/bin/env node
/**
 * BATCH PATCHER — agrega fallback al stub de Slack en todos los workflows.
 *
 * Problema: muchos workflows usan `={{ $env.SLACK_WEBHOOK_URL }}` en el url
 * del Slack HTTP Request. Si la env var no está set en n8n Railway, se
 * interpola a empty string → n8n falla con URL inválida o 404.
 *
 * Fix: reescribir a `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`
 *
 * También: agrega `response.neverError: true` para que el workflow no se
 * aborte si Slack tira error transient.
 *
 * Uso: node patch-slack-url-fallback.mjs [--dry-run] [--name <filter>]
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null

const SLACK_FALLBACK = `={{ $env.SLACK_WEBHOOK_URL || 'https://zero-risk-platform.vercel.app/api/stubs/slack-webhook' }}`

// Heuristic: a node is a Slack node if:
//   - its url contains SLACK_WEBHOOK_URL
//   - or url contains 'hooks.slack.com'
function isSlackUrlNode(node) {
  if (node.type !== 'n8n-nodes-base.httpRequest') return false
  const url = (node.parameters || {}).url || ''
  return url.includes('SLACK_WEBHOOK_URL') || url.includes('hooks.slack.com')
}

function needsFallback(url) {
  // Already has fallback via || or ??
  if (/\|\||\?\?/.test(url)) return false
  return true
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => {
  if (!w.active) return false
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`\nScanning ${targets.length} workflows${DRY ? ' (dry-run)' : ''}\n`)

let totalFixed = 0
let totalNodesFixed = 0

for (const w of targets) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let workflowChanges = 0
  for (const node of wf.nodes) {
    if (!isSlackUrlNode(node)) continue
    const url = node.parameters.url
    if (!needsFallback(url)) continue
    node.parameters.url = SLACK_FALLBACK
    // Also set neverError so a Slack hiccup doesn't kill the workflow
    node.parameters.options = {
      ...(node.parameters.options || {}),
      response: { response: { neverError: true } },
      timeout: 10000,
    }
    workflowChanges++
  }
  if (!workflowChanges) continue

  console.log(`=== ${w.name}: ${workflowChanges} Slack node(s) updated`)
  if (DRY) { totalFixed++; totalNodesFixed += workflowChanges; continue }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200`)
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
    await new Promise(r => setTimeout(r, 600))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
    console.log(`   ✓ reactivated`)
    totalFixed++
    totalNodesFixed += workflowChanges
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300)}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows fixed: ${totalFixed}`)
console.log(`Slack nodes updated: ${totalNodesFixed}`)
