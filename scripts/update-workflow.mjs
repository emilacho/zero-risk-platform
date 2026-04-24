#!/usr/bin/env node
/**
 * Zero Risk — Update single workflow in n8n by ID (PUT /api/v1/workflows/{id})
 *
 * Usage:
 *   node scripts/update-workflow.mjs --file=n8n-workflows/.../foo.json --id=abc123
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const FILE = args.find(a => a.startsWith('--file='))?.slice(7)
const ID = args.find(a => a.startsWith('--id='))?.slice(5)
if (!FILE || !ID) { console.error('Usage: --file=<path> --id=<workflow_id>'); process.exit(1) }

let N8N_API_KEY = '', N8N_BASE_URL = 'https://n8n-production-72be.up.railway.app'
try {
  const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k === 'N8N_API_KEY') N8N_API_KEY = v
    if (k === 'N8N_BASE_URL') N8N_BASE_URL = v
  }
} catch {}

const wf = JSON.parse(readFileSync(resolve(__dirname, '..', FILE), 'utf-8'))

// Apply same patches as import-all-workflows
for (const node of wf.nodes || []) {
  if (node.type === 'n8n-nodes-base.webhook') {
    if (!node.parameters) node.parameters = {}
    if (!node.parameters.httpMethod) node.parameters.httpMethod = 'POST'
    if (node.parameters.responseMode === 'immediately') node.parameters.responseMode = 'onReceived'
  }
  if (node.type === 'n8n-nodes-base.httpRequest' && node.parameters?.url?.includes?.('posthog.com')) node.disabled = true
  if (node.type === 'n8n-nodes-base.httpRequest' &&
      (node.parameters?.url?.includes?.('$env.SLACK_WEBHOOK_URL') || node.parameters?.url?.includes?.('hooks.slack.com')))
    node.disabled = true
  if (node.webhookId) delete node.webhookId
}

const payload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || { executionOrder: 'v1' },
}

const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(payload),
})
const text = await res.text()
console.log(res.ok ? `✅ Updated: ${payload.name}` : `❌ Failed (${res.status}): ${text.slice(0, 400)}`)
process.exit(res.ok ? 0 : 1)
