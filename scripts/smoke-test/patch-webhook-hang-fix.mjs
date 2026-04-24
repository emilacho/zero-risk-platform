#!/usr/bin/env node
/**
 * BATCH PATCHER — fix webhook-will-hang bug.
 *
 * Pattern: workflow tiene webhook node con `responseMode: responseNode` PERO
 * no tiene ningún n8n-nodes-base.respondToWebhook node en el graph. En ese
 * caso, n8n se queda esperando a que algún nodo responda... pero nada nunca lo
 * hace → webhook cuelga hasta timeout → smoke test falla con TIMEOUT.
 *
 * Fix: cambiar `responseMode` a `onReceived` (la webhook responde con 200
 * inmediatamente y deja la workflow corriendo en background).
 *
 * Workflows afectados (detectados en análisis S33):
 *  - Creative Fatigue Auto-Refresh Loop (Every 6h)
 *  - Social Multi-Platform Publisher v2 (Hourly + Webhook)
 *
 * Uso: node patch-webhook-hang-fix.mjs [--dry-run]
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

const { workflows } = await listN8nWorkflows()

console.log(`\nScanning ${workflows.length} workflows for webhook-hang bug${DRY ? ' (dry-run)' : ''}\n`)

let totalFixed = 0

for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json

  const webhookNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.webhook')
  const hasRespondNode = wf.nodes.some(n => n.type === 'n8n-nodes-base.respondToWebhook')

  let changed = false
  for (const wh of webhookNodes) {
    const mode = wh.parameters?.responseMode
    if (mode === 'responseNode' && !hasRespondNode) {
      console.log(`=== ${w.name}`)
      console.log(`   Webhook "${wh.name}" has responseMode=responseNode but NO respondToWebhook node`)
      console.log(`   → changing to responseMode=onReceived`)
      wh.parameters = { ...(wh.parameters || {}), responseMode: 'onReceived' }
      changed = true
    }
  }

  if (!changed) continue

  if (DRY) {
    console.log(`   [DRY] would PUT + reactivate`)
    totalFixed++
    continue
  }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`   ✓ PUT 200`)
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method: 'POST', headers: H, body: '{}' })
      await new Promise(r => setTimeout(r, 600))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method: 'POST', headers: H, body: '{}' })
      console.log(`   ✓ reactivated`)
    }
    totalFixed++
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text?.slice(0, 300)}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows scanned: ${workflows.length}`)
console.log(`Workflows fixed:   ${totalFixed}`)
