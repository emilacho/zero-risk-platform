#!/usr/bin/env node
// Ensure every HTTP node that calls zero-risk-platform.vercel.app / $env.ZERO_RISK_API_URL
// has the x-api-key header. Some research-generated nodes omit it, causing
// "Authorization failed" at runtime.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '..', '.env.local')
const envRaw = readFileSync(envPath, 'utf-8')
const INTERNAL_API_KEY = (envRaw.match(/^INTERNAL_API_KEY=(.+)$/m) || [,''])[1].trim()

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')

if (!INTERNAL_API_KEY) { console.error('INTERNAL_API_KEY not found in .env.local'); process.exit(1) }

const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows for HTTP nodes missing x-api-key...\n`)

let wfTouched = 0, nodesTouched = 0, failed = 0
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json

  let changes = 0
  for (const n of wf.nodes) {
    if (n.type !== 'n8n-nodes-base.httpRequest') continue
    const url = n.parameters?.url || ''
    if (!url || typeof url !== 'string') continue
    // Only patch nodes calling our Vercel API (not Slack, Stripe, external APIs etc)
    if (!url.includes('zero-risk-platform.vercel.app') && !url.includes('ZERO_RISK_API_URL')) continue

    const hdrs = n.parameters?.headerParameters?.parameters || []
    const hasApiKey = hdrs.some(h => h && h.name && h.name.toLowerCase() === 'x-api-key')
    if (hasApiKey) continue

    const hasContentType = hdrs.some(h => h && h.name && h.name.toLowerCase() === 'content-type')
    const newParams = [...hdrs]
    if (!hasContentType) newParams.push({ name: 'Content-Type', value: 'application/json' })
    newParams.push({ name: 'x-api-key', value: INTERNAL_API_KEY })

    n.parameters = {
      ...n.parameters,
      sendHeaders: true,
      headerParameters: { parameters: newParams },
    }
    changes++
  }

  if (!changes) continue
  console.log(`${w.name}  (+${changes} x-api-key headers)`)
  if (DRY) { wfTouched++; nodesTouched += changes; continue }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || { executionOrder: 'v1' } }),
  })
  if (put.ok) {
    wfTouched++
    nodesTouched += changes
    if (w.active) {
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
      await new Promise(r => setTimeout(r, 800))
      await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    }
    console.log(`   ✓ PUT 200`)
  } else {
    console.log(`   ✗ PUT ${put.status}: ${put.text || put.error}`)
    failed++
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log(`\nSummary: workflows=${wfTouched}  headers_added=${nodesTouched}  failed=${failed}${DRY ? '  (DRY)' : ''}`)
