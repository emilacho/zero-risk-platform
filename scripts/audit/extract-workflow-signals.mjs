#!/usr/bin/env node
/**
 * extract-workflow-signals.mjs
 * Reads every audit-output/workflows/*.json
 * Outputs audit-output/signals.md with high-signal summary per workflow:
 *   - id · name · active
 *   - trigger details (webhook path · cron expression)
 *   - node list (one line per node: type + name)
 *   - all HTTP URLs called
 *   - all Supabase table refs
 *   - all agent slug refs (from /api/agents/run bodies or 'agent_slug' fields)
 *   - any obvious bug signals (broken expressions · undefined references · empty bodies)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const WORKFLOWS_DIR = resolve(REPO_ROOT, 'audit-output', 'workflows')
const OUT_PATH = resolve(REPO_ROOT, 'audit-output', 'signals.md')

function extractWebhookPaths(nodes) {
  const paths = []
  for (const n of nodes) {
    if ((n.type || '').toLowerCase().includes('webhook')) {
      const p = n.parameters || {}
      if (p.path) paths.push(p.path)
    }
  }
  return paths
}

function extractCronExpressions(nodes) {
  const out = []
  for (const n of nodes) {
    const t = (n.type || '').toLowerCase()
    if (t.includes('schedule') || t.includes('cron')) {
      const p = n.parameters || {}
      const rule = p.rule?.interval?.[0] || p.cronExpression || p.triggerTimes
      if (rule) out.push(JSON.stringify(rule))
    }
  }
  return out
}

function extractHttpUrls(nodes) {
  const urls = new Set()
  for (const n of nodes) {
    if ((n.type || '').toLowerCase().includes('httprequest')) {
      const p = n.parameters || {}
      if (p.url) urls.add(p.url)
    }
  }
  return [...urls]
}

function extractSupabaseTables(blob) {
  const tables = new Set()
  // Common patterns: from('table_name'), .table('xxx'), supabase.from("xxx"), insertInto('xxx')
  const re = /(?:from|table|insertInto|update|delete\s+from)\s*\(?\s*['"`]([a-z_][a-z0-9_]*)['"`]/gi
  let m
  while ((m = re.exec(blob)) !== null) tables.add(m[1])
  return [...tables]
}

function extractAgentSlugs(blob) {
  const slugs = new Set()
  // patterns: agent_slug: "xxx", "/api/agents/run" + body with slug
  const re1 = /agent[_-]?slug\s*[:=]\s*['"]([a-z][a-z0-9-]*)['"]/gi
  const re2 = /['"]?slug['"]?\s*:\s*['"]([a-z][a-z0-9-]*)['"]/gi
  let m
  while ((m = re1.exec(blob)) !== null) slugs.add(m[1])
  while ((m = re2.exec(blob)) !== null) slugs.add(m[1])
  return [...slugs].sort()
}

function detectBugSignals(nodes, blob) {
  const signals = []
  // Empty JSON body in HTTP node
  for (const n of nodes) {
    if ((n.type || '').toLowerCase().includes('httprequest')) {
      const p = n.parameters || {}
      if (p.bodyParameters?.parameters?.some(pp => pp.value === '' || pp.value === '{{}}' || pp.value === undefined)) {
        signals.push(`empty body in node "${n.name}"`)
      }
      if (p.jsonBody === '' || p.jsonBody === '{}') signals.push(`possibly empty jsonBody in "${n.name}"`)
    }
  }
  // Undefined .env var references
  if (/\$env\.[A-Z_]+\b/.test(blob)) {
    const matches = blob.match(/\$env\.[A-Z_]+/g) || []
    const unique = [...new Set(matches)]
    if (unique.length > 0) signals.push(`uses env vars: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '...' : ''}`)
  }
  // step_definitions reference (B-003 pattern)
  if (/step_definitions/.test(blob)) signals.push('REF: step_definitions (B-003 schema drift pattern)')
  // hardcoded URLs to localhost
  if (/localhost|127\.0\.0\.1/.test(blob)) signals.push('hardcoded localhost URL')
  return signals
}

function main() {
  const files = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json')).sort()
  const lines = ['# Workflow Signals — Wave 10 Deep Triage', '', `Generated: ${new Date().toISOString()}`, `Total workflows: ${files.length}`, '']

  for (const file of files) {
    const path = resolve(WORKFLOWS_DIR, file)
    const wf = JSON.parse(readFileSync(path, 'utf8'))
    const blob = JSON.stringify(wf)
    const nodes = wf.nodes || []
    const id = basename(file, '.json')

    lines.push(`---`)
    lines.push(``)
    lines.push(`## ${wf.name || id}`)
    lines.push(`- **id:** \`${id}\``)
    lines.push(`- **active:** ${wf.active}`)
    lines.push(`- **nodes:** ${nodes.length}`)
    lines.push(`- **updated:** ${wf.updatedAt || ''}`)

    const webhookPaths = extractWebhookPaths(nodes)
    if (webhookPaths.length) lines.push(`- **webhook paths:** ${webhookPaths.map(p => `\`${p}\``).join(' · ')}`)
    const crons = extractCronExpressions(nodes)
    if (crons.length) lines.push(`- **cron:** ${crons.join(' · ')}`)

    const urls = extractHttpUrls(nodes)
    if (urls.length) {
      lines.push(`- **http urls (${urls.length}):**`)
      for (const u of urls) lines.push(`    - ${u}`)
    }

    const tables = extractSupabaseTables(blob)
    if (tables.length) lines.push(`- **supabase tables:** ${tables.join(', ')}`)

    const agents = extractAgentSlugs(blob)
    if (agents.length) lines.push(`- **agent slugs:** ${agents.join(', ')}`)

    const bugs = detectBugSignals(nodes, blob)
    if (bugs.length) {
      lines.push(`- **bug signals:**`)
      for (const b of bugs) lines.push(`    - ${b}`)
    }

    lines.push(`- **node sequence:**`)
    for (const n of nodes) {
      const tShort = (n.type || '').replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-/, '')
      lines.push(`    - \`${tShort}\` · ${n.name}`)
    }

    lines.push('')
  }

  writeFileSync(OUT_PATH, lines.join('\n'))
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`Lines: ${lines.length}`)
}

main()
