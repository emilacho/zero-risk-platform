#!/usr/bin/env node
/**
 * BATCH PATCHER — agrega `neverError: true` a todos los HTTP nodes que llaman
 * APIs externas (Apollo, Serper, PostHog, Firecrawl, Apify, Google APIs, etc).
 *
 * Razón: en smoke tests no tenemos las API keys reales. Si una llamada externa
 * tira 401/404/500, el workflow entero se detiene. Con `neverError: true`,
 * n8n trata la respuesta de error como success y deja continuar. Downstream
 * nodes pueden manejar el caso (ej. Score Lead usa `$node['Apollo'].json?.person || {}`).
 *
 * Hosts que se consideran "externos" (no son nuestra Vercel app):
 *   - api.apollo.io
 *   - api.apify.com
 *   - api.firecrawl.dev
 *   - api.dataforseo.com
 *   - api.posthog.com
 *   - google.serper.dev
 *   - graph.facebook.com
 *   - www.googleapis.com / analyticsdata.googleapis.com / searchconsole.googleapis.com
 *   - api.hypeauditor.com
 *   - api.trustpilot.com
 *   - api.twitter.com
 *   - api.ideogram.ai
 *   - api.higgsfield.ai
 *   - services.leadconnectorhq.com
 *   - api.mailgun.net
 *   - hooks.slack.com (ya cubierto por patch-slack-url-fallback)
 *
 * Uso: node patch-external-apis-neverror.mjs [--dry-run] [--name <filter>]
 */
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' }
const DRY = process.argv.includes('--dry-run')
const nameFilterIdx = process.argv.indexOf('--name')
const NAME_FILTER = nameFilterIdx >= 0 ? process.argv[nameFilterIdx + 1] : null

const EXTERNAL_HOSTS = [
  'apollo.io', 'apify.com', 'firecrawl.dev', 'dataforseo.com', 'posthog.com',
  'serper.dev', 'facebook.com', 'googleapis.com', 'hypeauditor.com',
  'trustpilot.com', 'twitter.com', 'x.com', 'ideogram.ai', 'higgsfield.ai',
  'leadconnectorhq.com', 'mailgun.net', 'linkedin.com',
]

function isExternalUrl(url) {
  if (!url) return false
  if (url.includes('zero-risk-platform.vercel.app')) return false
  if (url.includes('localhost')) return false
  return EXTERNAL_HOSTS.some(h => url.includes(h))
}

const { workflows } = await listN8nWorkflows()
const targets = workflows.filter(w => {
  if (!w.active) return false
  if (NAME_FILTER && !w.name.toLowerCase().includes(NAME_FILTER.toLowerCase())) return false
  return true
})

console.log(`\nScanning ${targets.length} workflow(s)${DRY ? ' (dry-run)' : ''}\n`)

let totalFixed = 0
let totalNodesFixed = 0

for (const w of targets) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  const wf = detail.json
  let changes = 0
  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.httpRequest') continue
    const url = (node.parameters || {}).url || ''
    if (!isExternalUrl(url)) continue
    const options = (node.parameters || {}).options || {}
    const existingResp = options.response || {}
    const existingResp2 = existingResp.response || {}
    if (existingResp2.neverError === true) continue
    node.parameters = {
      ...node.parameters,
      options: {
        ...options,
        response: {
          ...existingResp,
          response: { ...existingResp2, neverError: true },
        },
      },
    }
    changes++
    console.log(`  [${w.name}] ${node.name} (${new URL(url.replace(/^=/,'').replace(/\{\{[^}]+\}\}/g, 'x')).hostname || 'unknown'})`)
  }
  if (!changes) continue

  if (DRY) { totalFixed++; totalNodesFixed += changes; continue }

  const put = await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' },
    }),
  })
  if (put.ok) {
    console.log(`  ✓ ${w.name}: PUT 200 (${changes} node(s))`)
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/deactivate', { method:'POST', headers:H, body:'{}' })
    await new Promise(r => setTimeout(r, 500))
    await fetchJson(ep.n8n + '/api/v1/workflows/' + w.id + '/activate', { method:'POST', headers:H, body:'{}' })
    totalFixed++
    totalNodesFixed += changes
  } else {
    console.log(`  ✗ ${w.name}: PUT ${put.status}`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Workflows fixed: ${totalFixed}`)
console.log(`External nodes with neverError added: ${totalNodesFixed}`)
