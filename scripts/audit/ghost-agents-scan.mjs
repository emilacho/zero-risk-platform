#!/usr/bin/env node
/**
 * ghost-agents-scan.mjs · Block 9 · CC#1 sprint 2026-05-07
 *
 * Scans audit-output/workflows/*.json for agent slug references and bucket them:
 *   - canonical (in MANIFEST_31_SLUGS)
 *   - alias (in AGENT_ALIAS_MAP)
 *   - ghost (unknown to either)
 * Writes JSON summary to scripts/audit/out/ghost-agents-<ts>.json
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const WF_DIR = resolve(REPO_ROOT, 'audit-output', 'workflows')
const OUT_DIR = resolve(__dirname, 'out')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const aliasMapSrc = readFileSync(resolve(REPO_ROOT, 'src', 'lib', 'agent-alias-map.ts'), 'utf8')
const aliasKeys = new Set()
const manifest = new Set()
for (const m of aliasMapSrc.matchAll(/^\s*['"]?([a-z][a-z0-9_-]*)['"]?\s*:\s*['"][a-z][a-z0-9-]*['"]/gm)) {
  aliasKeys.add(m[1])
}
for (const m of aliasMapSrc.matchAll(/['"]([a-z][a-z0-9-]+)['"],?\s*$/gm)) {
  // crude: any kebab slug literal in MANIFEST_31_SLUGS Set block. Filter later.
}
// Better: pull MANIFEST_31_SLUGS literal block
const manifestBlock = aliasMapSrc.match(/MANIFEST_31_SLUGS[^\[]*\[([\s\S]*?)\]/)
if (manifestBlock) {
  for (const m of manifestBlock[1].matchAll(/['"]([a-z][a-z0-9-]+)['"]/g)) manifest.add(m[1])
}

const KNOWN_FIELDS = ['agent', 'agent_slug', 'agentSlug', 'slug', 'agent_name', 'agentName']
const RESERVED_PATHS = new Set(['run', 'run-sdk', 'generate-content', 'list', 'health'])

const slugSources = new Map() // slug → workflows[]

function record(slug, wfId) {
  if (!slug || slug.length < 3) return
  if (slug.startsWith('http')) return
  if (!slugSources.has(slug)) slugSources.set(slug, [])
  if (!slugSources.get(slug).includes(wfId)) slugSources.get(slug).push(wfId)
}

const files = readdirSync(WF_DIR).filter((f) => f.endsWith('.json'))
for (const f of files) {
  const wfId = f.replace(/\.json$/, '')
  const blob = readFileSync(resolve(WF_DIR, f), 'utf8')
  // Pattern A: "agent": "value" (also escaped \"agent\": \"value\")
  const fieldRe = new RegExp(
    String.raw`\\?["'](?:` + KNOWN_FIELDS.join('|') + String.raw`)\\?["']\s*:\s*\\?["']([a-zA-Z][a-zA-Z0-9_-]{2,})\\?["']`,
    'g',
  )
  for (const m of blob.matchAll(fieldRe)) record(m[1].toLowerCase(), wfId)
  // Pattern B: /api/agents/<slug>
  for (const m of blob.matchAll(/\/api\/agents\/([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
    if (!RESERVED_PATHS.has(m[1])) record(m[1].toLowerCase(), wfId)
  }
}

const buckets = { canonical: [], alias: [], ghost: [] }
for (const [slug, wfs] of [...slugSources.entries()].sort()) {
  const entry = { slug, workflows: wfs.length, sample: wfs.slice(0, 3) }
  if (manifest.has(slug)) buckets.canonical.push(entry)
  else if (aliasKeys.has(slug)) buckets.alias.push(entry)
  else buckets.ghost.push(entry)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = resolve(OUT_DIR, `ghost-agents-${stamp}.json`)
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), totalFiles: files.length, buckets }, null, 2))

console.log(`Scanned ${files.length} workflows`)
console.log(`Canonical: ${buckets.canonical.length}`)
console.log(`Alias-mapped: ${buckets.alias.length}`)
console.log(`GHOST (unmapped): ${buckets.ghost.length}`)
if (buckets.ghost.length) {
  console.log('\nGhost slugs:')
  for (const g of buckets.ghost) console.log(`  - ${g.slug} (in ${g.workflows} workflow(s))`)
}
console.log(`\nReport: ${outPath}`)
