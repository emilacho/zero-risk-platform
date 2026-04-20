#!/usr/bin/env node
// Scan every HTTP node's URL for paths hitting our Vercel domain and group
// the distinct routes. Used to identify missing backend routes that workflows
// depend on (fix direction: create routes OR redirect to existing ones).

import { endpoints } from './lib/env.mjs'
import { listN8nWorkflows, fetchWorkflowDetail } from './lib/workflows.mjs'

const ep = endpoints()
const { workflows } = await listN8nWorkflows()
console.log(`Scanning ${workflows.length} workflows for Vercel route usage...\n`)

// route → Set of workflow names
const routes = {}
for (const w of workflows) {
  const detail = await fetchWorkflowDetail(w.id)
  if (!detail.ok || !detail.json?.nodes) continue
  for (const n of detail.json.nodes) {
    const url = n.parameters?.url
    if (!url || typeof url !== 'string') continue
    // Match vercel paths — anything after /api/
    const m = url.match(/\/api\/[a-zA-Z0-9/_-]+/g) || []
    for (const path of m) {
      const key = (n.parameters?.method || 'POST') + ' ' + path
      if (!routes[key]) routes[key] = new Set()
      routes[key].add(w.name)
    }
  }
  await new Promise(r => setTimeout(r, 300))
}

console.log('Route usage (method + path):\n')
const entries = Object.entries(routes).sort((a, b) => b[1].size - a[1].size)
for (const [route, users] of entries) {
  console.log(`  ${route}  (${users.size})`)
  for (const u of [...users].slice(0, 5)) console.log(`     - ${u}`)
  if (users.size > 5) console.log(`     ... +${users.size - 5} more`)
}
