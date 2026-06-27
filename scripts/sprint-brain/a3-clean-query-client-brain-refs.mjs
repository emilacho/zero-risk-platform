#!/usr/bin/env node
/**
 * Sprint-brain §144 · FASE A · A3 · limpiar referencias a `query_client_brain`
 * en identidades de agentes (el MCP on-demand está deprecado · el canon es
 * push-enrichment · el cerebro se PRE-inyecta antes del primer turno).
 *
 * 2026-06-27 · CC#1 · branch/shadow.
 *
 * DECISIÓN §144 (decisión #3 del plan) · "MCP deprecado → confirmar pasar todo
 * a push-enrichment". Este script implementa la limpieza · pero por DEFECTO es
 * DRY-RUN y NO escribe nada. Requiere `--apply` Y la ratificación §144 + el
 * protocolo identity_content WRITE (sync script + admin endpoint + PR). NO correr
 * `--apply` contra prod sin §144.
 *
 * Fuentes ·
 *   - `agents.identity_content`              (23 rows · audit 2026-06-27)
 *   - `managed_agents_registry.identity_md`  (36 rows · audit 2026-06-27)
 *
 * Transformación · elimina la línea del tool en el bloque YAML `tools:` ·
 *   `  - query_client_brain: "…"`
 * Si quedan menciones en prosa (no la línea de tool) · NO las toca · las reporta
 * para revisión manual (no borrado ciego de texto de identidad · §147).
 *
 * Uso ·
 *   node scripts/sprint-brain/a3-clean-query-client-brain-refs.mjs            # dry-run (default)
 *   node scripts/sprint-brain/a3-clean-query-client-brain-refs.mjs --apply    # GATED §144 · escribe
 *
 * Env · SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *       (lee de .env.local si está presente).
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')

// ── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const out = { ...process.env }
  try {
    const txt = readFileSync('.env.local', 'utf8')
    for (const line of txt.split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      if (!out[k]) out[k] = line.slice(i + 1).trim()
    }
  } catch {}
  return out
}
const env = loadEnv()
const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// ── transform ────────────────────────────────────────────────────────────
const TOOL_LINE = /^[ \t]*-[ \t]*query_client_brain:.*$/gm

/** Returns { cleaned, removedLines, residualMentions }. */
function clean(text) {
  if (typeof text !== 'string') return { cleaned: text, removedLines: 0, residualMentions: 0 }
  const removedLines = (text.match(TOOL_LINE) || []).length
  const cleaned = text.replace(TOOL_LINE, '').replace(/\n{3,}/g, '\n\n')
  const residualMentions = (cleaned.match(/query_client_brain/g) || []).length
  return { cleaned, removedLines, residualMentions }
}

// ── supabase REST ──────────────────────────────────────────────────────────
async function fetchRows(table, idCol, contentCol) {
  const r = await fetch(
    `${URL}/rest/v1/${table}?select=${idCol},${contentCol}&${contentCol}=ilike.*query_client_brain*`,
    { headers: H },
  )
  if (!r.ok) throw new Error(`${table} fetch ${r.status}: ${await r.text()}`)
  return r.json()
}

async function patchRow(table, idCol, idVal, contentCol, value) {
  const r = await fetch(`${URL}/rest/v1/${table}?${idCol}=eq.${encodeURIComponent(idVal)}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ [contentCol]: value }),
  })
  if (!r.ok) throw new Error(`${table} patch ${idVal} ${r.status}: ${await r.text()}`)
}

async function processTable(table, idCol, contentCol) {
  const rows = await fetchRows(table, idCol, contentCol)
  let totalRemoved = 0
  const residuals = []
  console.log(`\n=== ${table}.${contentCol} · ${rows.length} rows con referencia ===`)
  for (const row of rows) {
    const { cleaned, removedLines, residualMentions } = clean(row[contentCol])
    totalRemoved += removedLines
    const tag = residualMentions > 0 ? ` · ⚠ ${residualMentions} mención(es) en prosa (revisar manual)` : ''
    console.log(`  · ${row[idCol]} · -${removedLines} tool-line(s)${tag}`)
    if (residualMentions > 0) residuals.push({ table, id: row[idCol], residualMentions })
    if (APPLY && removedLines > 0) {
      await patchRow(table, idCol, row[idCol], contentCol, cleaned)
    }
  }
  return { rows: rows.length, totalRemoved, residuals }
}

// ── main ───────────────────────────────────────────────────────────────────
const mode = APPLY ? '⚠ APPLY (escribe · GATED §144)' : 'DRY-RUN (no escribe · default)'
console.log(`Sprint-brain A3 · limpiar query_client_brain · modo · ${mode}`)
if (APPLY && env.A3_CONFIRM_SS144 !== 'yes') {
  console.error('\n✋ --apply requiere env A3_CONFIRM_SS144=yes (ratificación §144). Abortado.')
  process.exit(2)
}

const a = await processTable('agents', 'name', 'identity_content')
const b = await processTable('managed_agents_registry', 'slug', 'identity_md')

const allResiduals = [...a.residuals, ...b.residuals]
console.log('\n=== RESUMEN ===')
console.log(`agents · ${a.rows} rows · ${a.totalRemoved} líneas tool removidas`)
console.log(`registry · ${b.rows} rows · ${b.totalRemoved} líneas tool removidas`)
console.log(`menciones residuales en prosa (revisar manual) · ${allResiduals.length}`)
if (allResiduals.length) console.log(JSON.stringify(allResiduals, null, 1))
console.log(APPLY ? '\n✅ aplicado' : '\nℹ️ dry-run · re-correr con --apply (post §144) para escribir')
