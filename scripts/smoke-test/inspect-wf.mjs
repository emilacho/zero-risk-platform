#!/usr/bin/env node
// Quick one-shot inspector: for each n8n workflow id arg, print webhook path + first Code node code.
// Usage: node scripts/smoke-test/inspect-wf.mjs <id1> <id2> ...
import { endpoints } from './lib/env.mjs'
import { fetchJson } from './lib/fetch.mjs'

const ep = endpoints()
const H = { 'X-N8N-API-KEY': ep.N8N_API_KEY }
const ids = process.argv.slice(2)
if (!ids.length) { console.error('Usage: inspect-wf.mjs <workflow_id>...'); process.exit(1) }

for (const id of ids) {
  const r = await fetchJson(ep.n8n + '/api/v1/workflows/' + id, { headers: H })
  const wf = r.json
  if (!wf || !wf.nodes) { console.log(`\n=== ${id}: fetch failed (${r.status})`); continue }
  const wh = wf.nodes.find(n => n.type === 'n8n-nodes-base.webhook')
  console.log(`\n=== ${wf.name}`)
  console.log('  id:', id, '  active:', wf.active, '  nodes:', wf.nodes.length)
  if (wh) console.log('  webhook path:', wh.parameters?.path, '  method:', wh.parameters?.httpMethod)
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      const code = (n.parameters?.jsCode || '').slice(0, 600)
      console.log(`\n  [code] ${n.name}:\n${code.split('\n').map(l => '    ' + l).join('\n')}`)
    }
    if (n.type === 'n8n-nodes-base.httpRequest') {
      const body = (n.parameters?.jsonBody || '').slice(0, 300)
      console.log(`\n  [http] ${n.name} ${n.parameters?.method || 'GET'} ${(n.parameters?.url || '').slice(0, 80)}`)
      if (body) console.log(`    body: ${body.replace(/\n/g, ' | ').slice(0, 200)}`)
    }
  }
}
