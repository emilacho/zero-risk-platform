#!/usr/bin/env node
/**
 * Sprint 9 cleanup A2 · backfill canonical script · Notion sub-pages → brain RAG
 *
 * Enumera sub-pages canonical de Notion workspace por cliente · transforma + push
 * canonical a brain RAG via /api/brain/ingest-source. Idempotency canon §150 G3 ·
 * skip si client_brain_chunks.source_id = subpage_id ya existe.
 *
 * Modes canonical ·
 *   --client-id <uuid> --workspace-id <hex>   · single-client canonical (explicit pair)
 *   --all                                       · enumerate clients.config->notion->workspace_id
 *                                                 NO populated actualmente · canon §148 gap
 *                                                 declarado Sprint 9 P1 follow-up
 *
 * Flags canonical ·
 *   --dry-run    (default ON · canonical safety) · imprime sin POST
 *   --apply      activates real POST canonical · cap 50 clientes
 *   --limit <n>  cap per cliente sub-pages procesadas (default 100)
 *   --rate-ms <n> wait between POSTs (default 500ms · canonical avoid throttle)
 *
 * Auth · NOTION_API_KEY + INTERNAL_API_KEY + SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * Usage ·
 *   node scripts/brain-rag-subpages-backfill.mjs --dry-run \
 *     --client-id 5470bdf9-697d-4fed-a81d-54172e2235e6 \
 *     --workspace-id 36bbacee94af815e8106cb3d4360eb8a
 *
 *   node scripts/brain-rag-subpages-backfill.mjs --apply \
 *     --client-id 5470bdf9-697d-4fed-a81d-54172e2235e6 \
 *     --workspace-id 36bbacee94af815e8106cb3d4360eb8a
 */
import fs from 'node:fs'
import path from 'node:path'

// ─── env canonical ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const NOTION_API_KEY = process.env.NOTION_API_KEY
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SR = process.env.SUPABASE_SERVICE_ROLE_KEY
const ZR_API_URL = process.env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app'

for (const [k, v] of Object.entries({ NOTION_API_KEY, INTERNAL_API_KEY, SUPA_URL, SUPA_SR })) {
  if (!v) { console.error(`[backfill] missing env var ${k}`); process.exit(1) }
}

// ─── args canonical ──────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {
    dryRun: true,
    apply: false,
    clientId: null,
    workspaceId: null,
    all: false,
    limit: 100,
    rateMs: 500,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--apply') { out.apply = true; out.dryRun = false }
    else if (a === '--client-id') out.clientId = args[++i]
    else if (a === '--workspace-id') out.workspaceId = args[++i]
    else if (a === '--all') out.all = true
    else if (a === '--limit') out.limit = parseInt(args[++i], 10)
    else if (a === '--rate-ms') out.rateMs = parseInt(args[++i], 10)
  }
  return out
}

const ARGS = parseArgs()
console.log('[backfill] args canonical ·', JSON.stringify(ARGS, null, 2))

// ─── helpers canonical ───────────────────────────────────────────────────

function mapSectionLabelToBrainTable(label) {
  const normalized = (label ?? '').trim().toLowerCase()
  if (['brand_book_v1', 'brand_book_v0', 'brand_book'].includes(normalized)) return 'client_brand_books'
  if (['icp_v1', 'icp_v0', 'icp', 'icp_document'].includes(normalized)) return 'client_icp_documents'
  if (['competitive_v2', 'competitive_v1', 'competitive_v0', 'competitive', 'competitive_landscape'].includes(normalized)) return 'client_competitive_landscape'
  return 'client_historical_outputs'
}

/** Infiere section_label canonical desde Notion sub-page title (heuristic). */
function inferSectionLabelFromTitle(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('brand book')) return 'brand_book_v1'
  if (t.includes('icp')) return 'icp_v1'
  if (t.includes('competitivo') || t.includes('competitive')) return 'competitive_v2'
  if (t.includes('kickoff')) return 'kickoff_deck'
  if (t.includes('sprint') || t.includes('plan primer')) return 'first_sprint_plan'
  if (t.includes('intake') || t.includes('onboarding')) return 'onboarding'
  if (t.includes('layout') || t.includes('workspace')) return 'layout'
  return 'unknown_subpage'
}

/** Convierte bloques Notion a markdown canónico simple (best-effort). */
function blocksToMarkdown(blocks) {
  if (!Array.isArray(blocks)) return ''
  const lines = []
  for (const b of blocks) {
    const type = b.type
    const data = b[type] || {}
    const rich = data.rich_text || []
    const text = rich.map((r) => r.plain_text || r.text?.content || '').join('')
    if (type === 'heading_1' || type === 'heading_2') lines.push('## ' + text)
    else if (type === 'heading_3') lines.push('### ' + text)
    else if (type === 'bulleted_list_item' || type === 'numbered_list_item') lines.push('- ' + text)
    else if (type === 'divider') lines.push('---')
    else if (type === 'paragraph' && text) lines.push(text)
    else if (text) lines.push(text)
  }
  return lines.join('\n\n')
}

async function notionGet(pathSuffix) {
  const res = await fetch(`https://api.notion.com/v1${pathSuffix}`, {
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)')
    throw new Error(`Notion GET ${pathSuffix} · ${res.status} · ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function supabaseGet(query) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPA_SR, Authorization: `Bearer ${SUPA_SR}` },
  })
  return res.json()
}

async function ingestBrainRag(body) {
  const res = await fetch(`${ZR_API_URL}/api/brain/ingest-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': INTERNAL_API_KEY },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body: json }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── enumeration canonical ───────────────────────────────────────────────

async function enumerateClients() {
  if (ARGS.clientId && ARGS.workspaceId) {
    // Single-client canonical mode (explicit pair)
    return [{ id: ARGS.clientId, workspace_id: ARGS.workspaceId, name: '(explicit)' }]
  }
  if (ARGS.all) {
    // Enumerate via clients.config->notion->workspace_id
    const rows = await supabaseGet(
      `clients?status=eq.active&select=id,name,config&config->notion->>workspace_id=not.is.null`,
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn('[backfill] WARN · --all mode returned 0 clients · canon §148 gap canonical')
      console.warn('  clients.config.notion.workspace_id NO populated · Sprint 9 P1 follow-up identified')
      console.warn('  ver wiki/postmortems/2026-05-25-sprint8d-fase1-cuenta1-notion-postmortem.md §6 candidate')
      console.warn('  workaround canonical · usar --client-id <uuid> --workspace-id <hex> explicit pair')
      return []
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      workspace_id: r.config?.notion?.workspace_id,
    })).filter((c) => c.workspace_id)
  }
  console.error('[backfill] error · requires --client-id + --workspace-id OR --all')
  process.exit(2)
}

// ─── main canonical ──────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`[backfill] started canonical · ${startedAt}`)
  console.log(`[backfill] mode canonical · ${ARGS.dryRun ? 'DRY-RUN (default safety)' : 'APPLY (real ingest)'}`)

  const clients = await enumerateClients()
  console.log(`[backfill] clients enumerados canonical · ${clients.length}`)

  if (clients.length > 50 && ARGS.apply) {
    console.error('[backfill] cap canonical excedido · > 50 clients · pause + report Emilio antes de proceder')
    process.exit(3)
  }

  const summary = {
    started_at: startedAt,
    mode: ARGS.dryRun ? 'dry-run' : 'apply',
    clients_total: clients.length,
    subpages_total: 0,
    subpages_ingested: 0,
    subpages_skipped_existing: 0,
    subpages_skipped_short: 0,
    subpages_failed: 0,
    total_cost_usd: 0,
    per_client: [],
  }

  for (const client of clients) {
    console.log(`\n[backfill] cliente canonical · ${client.id} (${client.name}) workspace ${client.workspace_id}`)
    const perClient = {
      client_id: client.id,
      workspace_id: client.workspace_id,
      subpages_total: 0,
      ingested: 0,
      skipped_existing: 0,
      skipped_short: 0,
      failed: 0,
      details: [],
    }

    // Get workspace children canonical
    let children
    try {
      children = await notionGet(`/blocks/${client.workspace_id}/children?page_size=${ARGS.limit}`)
    } catch (err) {
      console.error(`[backfill] ❌ Notion GET children failed · ${err.message}`)
      perClient.failed++
      summary.per_client.push(perClient)
      continue
    }
    const subpages = (children.results || []).filter((b) => b.type === 'child_page')
    perClient.subpages_total = subpages.length
    summary.subpages_total += subpages.length
    console.log(`[backfill]   ${subpages.length} sub-pages canonical encontrados`)

    for (const sp of subpages) {
      const title = sp.child_page?.title || '(untitled)'
      const sectionLabel = inferSectionLabelFromTitle(title)
      const sourceTable = mapSectionLabelToBrainTable(sectionLabel)

      // Idempotency canonical · check existing
      const existing = await supabaseGet(
        `client_brain_chunks?client_id=eq.${client.id}&source_id=eq.${sp.id}&select=id`,
      )
      if (Array.isArray(existing) && existing.length > 0) {
        console.log(`[backfill]   ⏭ SKIP-ALREADY-INGESTED · ${title} (id=${sp.id})`)
        perClient.skipped_existing++
        summary.subpages_skipped_existing++
        perClient.details.push({ subpage_id: sp.id, title, status: 'skipped_existing' })
        continue
      }

      // Fetch full content canonical
      let blocks
      try {
        const childRes = await notionGet(`/blocks/${sp.id}/children?page_size=100`)
        blocks = childRes.results || []
      } catch (err) {
        console.error(`[backfill]   ❌ Notion GET subpage content failed · ${title} · ${err.message}`)
        perClient.failed++
        summary.subpages_failed++
        perClient.details.push({ subpage_id: sp.id, title, status: 'fetch_failed', error: err.message })
        continue
      }
      const markdownContent = blocksToMarkdown(blocks)
      if (markdownContent.trim().length <= 10) {
        console.log(`[backfill]   ⏭ SKIP-CONTENT-TOO-SHORT · ${title} (${markdownContent.length} chars)`)
        perClient.skipped_short++
        summary.subpages_skipped_short++
        perClient.details.push({ subpage_id: sp.id, title, status: 'skipped_short' })
        continue
      }

      // Dry-run vs apply canonical
      if (ARGS.dryRun) {
        console.log(`[backfill]   🟡 DRY-RUN · would ingest · ${title} → ${sourceTable} (${markdownContent.length} chars)`)
        perClient.details.push({
          subpage_id: sp.id,
          title,
          status: 'dry_run_planned',
          source_table: sourceTable,
          section_label: sectionLabel,
          content_length: markdownContent.length,
        })
        continue
      }

      // Apply canonical
      const ingestRes = await ingestBrainRag({
        client_id: client.id,
        source_table: sourceTable,
        source_id: sp.id,
        sections: [{ section_label: sectionLabel, text: markdownContent }],
        metadata: {
          notion_subpage_id: sp.id,
          notion_subpage_url: sp.url || `https://www.notion.so/${sp.id.replace(/-/g, '')}`,
          notion_workspace_id: client.workspace_id,
          notion_subpage_title: title,
          canonical_pattern: 'backfill-sprint-9-cleanup-a2',
          backfill_timestamp: new Date().toISOString(),
        },
      })

      if (ingestRes.ok) {
        const cost = ingestRes.body?.cost_usd || 0
        summary.total_cost_usd += cost
        console.log(`[backfill]   ✅ INGESTED · ${title} → ${sourceTable} · $${cost.toFixed(8)} · chunks=${ingestRes.body?.chunks_upserted}`)
        perClient.ingested++
        summary.subpages_ingested++
        perClient.details.push({
          subpage_id: sp.id,
          title,
          status: 'ingested',
          source_table: sourceTable,
          cost_usd: cost,
        })
      } else {
        console.error(`[backfill]   ❌ INGEST FAILED · ${title} · status=${ingestRes.status} · ${JSON.stringify(ingestRes.body).slice(0, 300)}`)
        perClient.failed++
        summary.subpages_failed++
        perClient.details.push({
          subpage_id: sp.id,
          title,
          status: 'ingest_failed',
          error: ingestRes.body?.detail || ingestRes.body?.error || `http_${ingestRes.status}`,
        })
      }

      await sleep(ARGS.rateMs)
    }

    summary.per_client.push(perClient)
  }

  summary.finished_at = new Date().toISOString()

  // Persist canonical report
  const outDir = path.resolve(process.cwd(), 'outputs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const reportPath = path.resolve(outDir, `brain-rag-backfill-${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2))
  console.log(`\n[backfill] report canonical saved · ${reportPath}`)

  console.log('\n=== SUMMARY canonical ===')
  console.log(`  mode · ${summary.mode}`)
  console.log(`  clients · ${summary.clients_total}`)
  console.log(`  sub-pages total · ${summary.subpages_total}`)
  console.log(`  ingested · ${summary.subpages_ingested}`)
  console.log(`  skipped (already ingested) · ${summary.subpages_skipped_existing}`)
  console.log(`  skipped (content too short) · ${summary.subpages_skipped_short}`)
  console.log(`  failed · ${summary.subpages_failed}`)
  console.log(`  total cost · $${summary.total_cost_usd.toFixed(8)}`)
}

main().catch((err) => {
  console.error('[backfill] FATAL canonical ·', err)
  process.exit(99)
})
