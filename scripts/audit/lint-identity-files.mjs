#!/usr/bin/env node
/**
 * lint-identity-files.mjs
 * Wave 10 · Identity Files Linter
 *
 * Validates every identity file in docs/04-agentes/identidades/*.md against the canonical
 * schema in docs/04-agentes/IDENTITY_FILE_TEMPLATE.md.
 *
 * Hard fails (exit 1):
 *   1. filename ↔ name mismatch
 *   2. YAML frontmatter unparseable
 *   3. required field missing
 *   4. model not in canonical set
 *   5. peer_reviewer not bidirectional (unless peer_reviewer_note explains)
 *   6. reports_to target not found
 *   7. body missing ## Identity or ## Client Adaptation
 *   8. hitl_triggers count outside 4-7
 *   9. forbidden_actions count outside 3-6
 *
 * Soft warns (exit 0 con WARN log):
 *   1. HITL trigger sin umbral cuantitativo
 *   2. tools mencionados en body pero no en tools:
 *
 * Usage:
 *   node zero-risk-platform/scripts/audit/lint-identity-files.mjs            # default · solo identities root
 *   node zero-risk-platform/scripts/audit/lint-identity-files.mjs --strict   # warns elevan a fails
 *   node zero-risk-platform/scripts/audit/lint-identity-files.mjs --json     # machine-readable output
 *   node zero-risk-platform/scripts/audit/lint-identity-files.mjs --include-seo  # también escanea identidades/seo/
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT_PARENT = resolve(__dirname, '..', '..', '..')
const IDENTITIES_DIR = resolve(REPO_ROOT_PARENT, 'docs', '04-agentes', 'identidades')

const FLAG_STRICT = process.argv.includes('--strict')
const FLAG_JSON = process.argv.includes('--json')
const FLAG_INCLUDE_SEO = process.argv.includes('--include-seo')

const CANONICAL_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
])

const CANONICAL_DEPARTMENTS = new Set([
  'marketing',
  'client_success',
  'transversal',
  'operations',
])

const CANONICAL_PHASES = new Set([
  'orchestration',
  'planning',
  'onboarding',
  'creation',
  'qa',
  'activation',
  'optimization',
  'reporting',
  'success',
  'flagship-seo',  // Sub-agent phase used by SEO cluster (sub-agents under seo-specialist)
])

// Required for ALL identity files (root + sub-agents)
const REQUIRED_FIELDS_ROOT = [
  'name',
  'display_name',
  'role',
  'department',
  'model',
  'reports_to',
  'is_active',
  'phase',
  'client_brain_sections',
  'peer_reviewer',
  'hitl_triggers',
  'escalation_path',
  'tools',
  'forbidden_actions',
]

// Sub-agents (parent_agent declared) inherit these from parent · so they can be omitted
const PARENT_INHERITED_FIELDS = new Set([
  'peer_reviewer',
  'escalation_path',
])

// For sub-agents, required = root - inherited
const REQUIRED_FIELDS_SUB = REQUIRED_FIELDS_ROOT.filter(f => !PARENT_INHERITED_FIELDS.has(f))

const REQUIRED_HEADINGS = ['## Identity', '## Client Adaptation']

// Markers that suggest a quantitative threshold inside an HITL trigger string
const QUANT_REGEX = /(\$[\d,]+|\d+%|\d+\s*(?:hours?|days?|min(?:utes?)?|weeks?|months?)|>\d+|<\d+|>=\d+|<=\d+|tier\s*[12345]|p[01]|wcag\s*aa|>0\.\d+)/i

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) throw new Error('Frontmatter delimiters not found (expected leading and trailing ---)')
  return { yaml: m[1], body: m[2] }
}

function parseYaml(yamlText) {
  // Minimal YAML parser sufficient for our flat-with-lists schema.
  // Supports: key: value, key: |, lists ("- item"), nested maps for tools entries (key: "value"), quoted strings, booleans.
  const lines = yamlText.split(/\r?\n/)
  const result = {}
  let currentKey = null
  let currentList = null
  let pipeBuffer = null
  let pipeIndent = 0

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine

    if (pipeBuffer !== null) {
      const indent = line.match(/^(\s*)/)[1].length
      if (line.trim() === '' || indent >= pipeIndent) {
        pipeBuffer.push(line.slice(pipeIndent))
        continue
      }
      result[currentKey] = pipeBuffer.join('\n').trimEnd()
      pipeBuffer = null
      currentKey = null
    }

    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    // Top-level key: value
    const kvMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
    if (kvMatch && /^[a-z_]/i.test(line[0])) {
      const key = kvMatch[1]
      let value = kvMatch[2]
      if (value === '|') {
        currentKey = key
        pipeBuffer = []
        // Determine indent from next non-empty line
        for (let j = i + 1; j < lines.length; j++) {
          const peek = lines[j]
          if (peek.trim() === '') continue
          const ind = peek.match(/^(\s*)/)[1].length
          pipeIndent = ind
          break
        }
        continue
      }
      if (value === '') {
        // Could be a list or a nested map starting next line
        currentKey = key
        currentList = []
        result[key] = currentList
        continue
      }
      // Inline value
      result[key] = parseScalar(value)
      currentKey = null
      currentList = null
      continue
    }

    // List item under currentKey
    const listMatch = line.match(/^\s+-\s+(.*)$/)
    if (listMatch && currentList !== null) {
      const itemRaw = listMatch[1]
      const mapMatch = itemRaw.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i)
      if (mapMatch) {
        currentList.push({ [mapMatch[1]]: parseScalar(mapMatch[2]) })
      } else {
        currentList.push(parseScalar(itemRaw))
      }
      continue
    }
  }

  if (pipeBuffer !== null && currentKey) {
    result[currentKey] = pipeBuffer.join('\n').trimEnd()
  }

  return result
}

function parseScalar(value) {
  const v = value.trim()
  if (v === '') return ''
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  // quoted string
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  // number?
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

function listIdentityFiles() {
  const files = []
  const entries = readdirSync(IDENTITIES_DIR, { withFileTypes: true })
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md') && e.name !== 'MANIFEST.md') {
      files.push(resolve(IDENTITIES_DIR, e.name))
    }
    if (FLAG_INCLUDE_SEO && e.isDirectory() && e.name === 'seo') {
      const seoDir = resolve(IDENTITIES_DIR, e.name)
      for (const sub of readdirSync(seoDir)) {
        if (sub.endsWith('.md') && sub !== 'README.md') {
          files.push(resolve(seoDir, sub))
        }
      }
    }
  }
  return files.sort()
}

function lintFile(filePath, allNames) {
  const fails = []
  const warns = []
  const filename = basename(filePath, '.md')
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (e) {
    return { filePath, filename, fails: [`READ_ERROR: ${e.message}`], warns: [], data: null }
  }

  let frontmatter
  try {
    frontmatter = parseFrontmatter(raw)
  } catch (e) {
    return { filePath, filename, fails: [`FRONTMATTER: ${e.message}`], warns: [], data: null }
  }

  let data
  try {
    data = parseYaml(frontmatter.yaml)
  } catch (e) {
    return { filePath, filename, fails: [`YAML_PARSE: ${e.message}`], warns: [], data: null }
  }

  // Detect sub-agent: has parent_agent (preferred) or legacy parent field
  const isSubAgent = Boolean(data.parent_agent || data.parent)
  const parentRef = data.parent_agent || data.parent

  // Rule 1 · filename ↔ name
  // For sub-agents (parent_agent set), allow filename to be a slug variant of name:
  //   - exact match (e.g., name="seo-orchestrator" file="seo-orchestrator")
  //   - parent prefix stripped (e.g., name="seo-backlink-strategist" file="backlink-strategist")
  //   - same hyphen-words in any order (e.g., name="seo-technical" file="technical-seo")
  if (data.name !== filename) {
    if (isSubAgent) {
      const nameWords = (data.name || '').split('-').sort()
      const filenameWords = filename.split('-').sort()
      const wordsMatch = nameWords.length === filenameWords.length &&
        nameWords.every((w, i) => w === filenameWords[i])
      const parentPrefixStripped = parentRef && data.name.startsWith(`${parentRef}-`) &&
        data.name.slice(parentRef.length + 1) === filename
      const parentSlugFromPrefix = parentRef ? parentRef.split('-')[0] : null  // e.g., "seo" from "seo-specialist"
      const nameWithoutParentSlug = parentSlugFromPrefix && data.name.startsWith(`${parentSlugFromPrefix}-`)
        ? data.name.slice(parentSlugFromPrefix.length + 1)
        : null
      const slugMatch = nameWithoutParentSlug === filename
      if (!wordsMatch && !parentPrefixStripped && !slugMatch) {
        fails.push(
          `FILENAME_MISMATCH: name="${data.name}" but filename="${filename}" ` +
          `(sub-agent · expected hyphen-words to match in any order, parent-prefix stripped, ` +
          `or parent-slug stripped from name)`
        )
      }
    } else {
      fails.push(`FILENAME_MISMATCH: name="${data.name}" but filename="${filename}"`)
    }
  }

  // Rule 3 · required fields (relaxed for sub-agents · they inherit peer_reviewer + escalation_path from parent)
  const requiredFields = isSubAgent ? REQUIRED_FIELDS_SUB : REQUIRED_FIELDS_ROOT
  for (const f of requiredFields) {
    if (!(f in data) || data[f] === undefined || data[f] === null || data[f] === '') {
      fails.push(`MISSING_REQUIRED_FIELD: ${f}`)
    }
  }

  // For sub-agents · validate parent_agent exists in the registry
  if (isSubAgent && parentRef && !allNames.has(parentRef)) {
    fails.push(`PARENT_AGENT_NOT_FOUND: parent_agent="${parentRef}" no es un agente conocido`)
  }

  // Rule 4 · canonical model
  if (data.model && !CANONICAL_MODELS.has(data.model)) {
    fails.push(`NON_CANONICAL_MODEL: "${data.model}" not in {${[...CANONICAL_MODELS].join(', ')}}`)
  }

  // department + phase canonical
  if (data.department && !CANONICAL_DEPARTMENTS.has(data.department) && !data.department.includes('/')) {
    // Allow nested like "marketing/marketing_operations"
    const root = data.department.split('/')[0]
    if (!CANONICAL_DEPARTMENTS.has(root)) {
      fails.push(`NON_CANONICAL_DEPARTMENT: "${data.department}"`)
    }
  }
  if (data.phase && !CANONICAL_PHASES.has(data.phase)) {
    fails.push(`NON_CANONICAL_PHASE: "${data.phase}"`)
  }

  // Rule 6 · reports_to
  if (data.reports_to && data.reports_to !== 'mission-control' && !allNames.has(data.reports_to)) {
    fails.push(`REPORTS_TO_NOT_FOUND: "${data.reports_to}" no es un agente conocido`)
  }

  // Rule 7 · headings
  for (const h of REQUIRED_HEADINGS) {
    if (!frontmatter.body.includes(h)) {
      fails.push(`MISSING_HEADING: ${h}`)
    }
  }

  // Rule 8 · hitl_triggers count (relaxed range for sub-agents: 2-7)
  const hitlTriggers = Array.isArray(data.hitl_triggers) ? data.hitl_triggers : []
  const hitlMin = isSubAgent ? 2 : 4
  const hitlMax = 7
  if (hitlTriggers.length < hitlMin || hitlTriggers.length > hitlMax) {
    fails.push(`HITL_COUNT: ${hitlTriggers.length} (esperado ${hitlMin}-${hitlMax}${isSubAgent ? ' · sub-agent' : ''})`)
  }

  // Rule 9 · forbidden_actions count (relaxed for sub-agents: 2-6)
  const forbidden = Array.isArray(data.forbidden_actions) ? data.forbidden_actions : []
  const forbiddenMin = isSubAgent ? 2 : 3
  if (forbidden.length < forbiddenMin || forbidden.length > 6) {
    fails.push(`FORBIDDEN_COUNT: ${forbidden.length} (esperado ${forbiddenMin}-6${isSubAgent ? ' · sub-agent' : ''})`)
  }

  // Soft warn 1 · HITL triggers without quantitative threshold
  for (const trig of hitlTriggers) {
    const t = typeof trig === 'string' ? trig : String(trig)
    if (!QUANT_REGEX.test(t)) {
      warns.push(`HITL_NO_THRESHOLD: "${t.slice(0, 80)}${t.length > 80 ? '…' : ''}"`)
    }
  }

  // Soft warn 2 · tools mentioned in body but not declared
  const toolsDeclared = new Set()
  if (Array.isArray(data.tools)) {
    for (const t of data.tools) {
      if (typeof t === 'object' && t !== null) {
        for (const k of Object.keys(t)) toolsDeclared.add(k)
      } else if (typeof t === 'string') {
        toolsDeclared.add(t)
      }
    }
  }
  // Look for tool-like mentions in body (snake_case identifiers ending in _api, _key tools, etc.)
  const bodyToolMentions = new Set()
  const toolMentionRe = /\b([a-z][a-z0-9_]+_api)\b/g
  let mm
  while ((mm = toolMentionRe.exec(frontmatter.body)) !== null) {
    bodyToolMentions.add(mm[1])
  }
  for (const t of bodyToolMentions) {
    if (!toolsDeclared.has(t)) {
      warns.push(`TOOL_IN_BODY_NOT_DECLARED: "${t}" mencionado en body pero no en tools:`)
    }
  }

  return { filePath, filename, fails, warns, data }
}

function checkBidirectionalPeers(results) {
  // Build map name → { primary, secondary, tertiary, hasNote, isSubAgent }
  const map = new Map()
  for (const r of results) {
    if (!r.data) continue
    map.set(r.data.name, {
      primary: r.data.peer_reviewer || null,
      secondary: r.data.peer_reviewer_secondary || null,
      tertiary: r.data.peer_reviewer_tertiary || null,
      hasNote: Boolean(r.data.peer_reviewer_note),
      isSubAgent: Boolean(r.data.parent_agent || r.data.parent),
      filePath: r.filePath,
    })
  }

  for (const r of results) {
    if (!r.data) continue
    const me = r.data.name
    const meEntry = map.get(me)
    // Skip bidirectionality check for sub-agents · they share parent's peer_reviewer
    // (intra-cluster peer review is a different pattern · not symmetric across cluster)
    if (meEntry.isSubAgent) continue
    const peer = meEntry.primary
    if (!peer) continue
    const peerEntry = map.get(peer)
    if (!peerEntry) {
      r.fails.push(`PEER_NOT_FOUND: peer_reviewer="${peer}" no tiene identity file`)
      continue
    }
    const peerListsMe = [peerEntry.primary, peerEntry.secondary, peerEntry.tertiary].includes(me)
    if (!peerListsMe && !meEntry.hasNote) {
      r.fails.push(
        `PEER_NOT_BIDIRECTIONAL: ${me}.peer_reviewer=${peer} pero ${peer} no lista ${me}. ` +
        `Fix: agregar "${me}" como peer_reviewer/secondary/tertiary en ${peer}.md, o agregar peer_reviewer_note en ${me}.md explicando asimetría.`
      )
    }
  }
}

function colorize(s, c) {
  if (FLAG_JSON) return s
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 2 }
  return `\x1b[${codes[c] || 0}m${s}\x1b[0m`
}

function main() {
  const files = listIdentityFiles()
  if (files.length === 0) {
    console.error('No identity files found at', IDENTITIES_DIR)
    process.exit(2)
  }

  // First pass: parse all to collect names
  const initialResults = files.map(f => lintFile(f, new Set()))
  const allNames = new Set(initialResults.filter(r => r.data?.name).map(r => r.data.name))
  // Second pass: re-lint with allNames known
  const results = files.map(f => lintFile(f, allNames))

  checkBidirectionalPeers(results)

  let totalFails = 0
  let totalWarns = 0
  for (const r of results) {
    totalFails += r.fails.length
    totalWarns += r.warns.length
  }

  if (FLAG_JSON) {
    const payload = {
      summary: {
        files: results.length,
        clean: results.filter(r => r.fails.length === 0 && r.warns.length === 0).length,
        with_fails: results.filter(r => r.fails.length > 0).length,
        with_warns: results.filter(r => r.warns.length > 0).length,
        total_fails: totalFails,
        total_warns: totalWarns,
      },
      strict_mode: FLAG_STRICT,
      include_seo: FLAG_INCLUDE_SEO,
      files: results.map(r => ({
        filename: r.filename,
        fails: r.fails,
        warns: r.warns,
      })),
    }
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(colorize(`Identity Files Linter — Wave 10`, 'cyan'))
    console.log(colorize(`Scanned: ${results.length} files in ${IDENTITIES_DIR}`, 'dim'))
    console.log(colorize(`Strict: ${FLAG_STRICT ? 'on' : 'off'} · Include SEO sub-agents: ${FLAG_INCLUDE_SEO}`, 'dim'))
    console.log('')

    for (const r of results) {
      if (r.fails.length === 0 && r.warns.length === 0) continue
      console.log(`${r.filename}.md`)
      for (const f of r.fails) console.log(`  ${colorize('FAIL', 'red')} ${f}`)
      for (const w of r.warns) console.log(`  ${colorize('WARN', 'yellow')} ${w}`)
      console.log('')
    }

    console.log(colorize('—— Summary ——', 'cyan'))
    console.log(`Files scanned:   ${results.length}`)
    console.log(`Clean:           ${results.filter(r => r.fails.length === 0 && r.warns.length === 0).length}`)
    console.log(`With fails:      ${colorize(String(results.filter(r => r.fails.length > 0).length), 'red')}`)
    console.log(`With warns:      ${colorize(String(results.filter(r => r.warns.length > 0).length), 'yellow')}`)
    console.log(`Total fails:     ${colorize(String(totalFails), totalFails ? 'red' : 'green')}`)
    console.log(`Total warns:     ${colorize(String(totalWarns), totalWarns ? 'yellow' : 'green')}`)
  }

  const exitCode = (totalFails > 0 || (FLAG_STRICT && totalWarns > 0)) ? 1 : 0
  process.exit(exitCode)
}

main()
