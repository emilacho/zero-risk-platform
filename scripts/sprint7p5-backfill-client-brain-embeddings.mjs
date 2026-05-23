#!/usr/bin/env node
/**
 * Sprint 7.5 A4 · backfill client_brain_chunks embeddings.
 *
 * Iterates · client_brand_books · client_icp_documents · client_voc_library
 * · client_competitive_landscape · serializes each row into one or more
 * canonical "sections" (logical chunks) · generates 1536d embedding via
 * text-embedding-3-small · UPSERTs to client_brain_chunks.
 *
 * Idempotent · ON CONFLICT (client_id, source_table, source_id, section_label)
 * DO UPDATE so re-runs just refresh embeddings.
 *
 * Usage ·
 *   node scripts/sprint7p5-backfill-client-brain-embeddings.mjs
 *   node scripts/sprint7p5-backfill-client-brain-embeddings.mjs --dry-run
 *   node scripts/sprint7p5-backfill-client-brain-embeddings.mjs --client-id <uuid>
 *
 * Env required · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · OPENAI_API_KEY
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const clientIdFilter = (() => {
  const idx = args.indexOf('--client-id')
  return idx >= 0 ? args[idx + 1] : null
})()

const env = fs
  .readFileSync('../zero-risk-platform/.env.local', 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) acc[m[1]] = m[2].replace(/^"|"$/g, '')
    return acc
  }, {})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SR = env.SUPABASE_SERVICE_ROLE_KEY
process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
if (!SUPABASE_URL || !SR || !env.OPENAI_API_KEY) {
  console.error('FAIL · missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY)')
  process.exit(2)
}

// Inline embed function · mirrors src/lib/brain/embed.ts (Track A3)
// Kept inline so backfill works without TS compilation step.
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
async function generateEmbedding(text) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, code: 'ServiceUnconfigured', detail: 'OPENAI_API_KEY missing' }
  }
  const input = (text ?? '').trim()
  if (!input) return { ok: false, code: 'InvalidInput', detail: 'empty_text' }
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    })
    const body = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, code: 'ProviderError', detail: `HTTP ${res.status} · ${body.slice(0, 300)}` }
    }
    const parsed = JSON.parse(body)
    const emb = parsed.data?.[0]?.embedding
    if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIMENSIONS) {
      return { ok: false, code: 'ProviderError', detail: 'unexpected_shape' }
    }
    return { ok: true, embedding: emb, tokens: parsed.usage?.total_tokens ?? 0 }
  } catch (e) {
    return { ok: false, code: 'NetworkError', detail: e?.message ?? 'unknown' }
  }
}
const estimateCost = (tokens) => (tokens / 1000) * 0.00002

async function supabase(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
}

// ── Chunk extractors per source table ────────────────────────────────────
// Each returns an array of { section_label, chunk_text, metadata }.

function chunksFromBrandBook(row) {
  const out = []
  if (row.brand_purpose) out.push({ section_label: 'brand_purpose', chunk_text: row.brand_purpose })
  if (row.brand_vision) out.push({ section_label: 'brand_vision', chunk_text: row.brand_vision })
  if (row.brand_mission) out.push({ section_label: 'brand_mission', chunk_text: row.brand_mission })
  if (row.brand_personality)
    out.push({ section_label: 'brand_personality', chunk_text: row.brand_personality })
  if (row.voice_description)
    out.push({ section_label: 'voice_description', chunk_text: row.voice_description })
  if (row.writing_style)
    out.push({ section_label: 'writing_style', chunk_text: row.writing_style })
  if (row.tagline) out.push({ section_label: 'tagline', chunk_text: row.tagline })
  if (row.elevator_pitch)
    out.push({ section_label: 'elevator_pitch', chunk_text: row.elevator_pitch })
  if (row.imagery_style)
    out.push({ section_label: 'imagery_style', chunk_text: row.imagery_style })
  if (row.competitor_mentions_policy)
    out.push({
      section_label: 'competitor_mentions_policy',
      chunk_text: row.competitor_mentions_policy,
    })
  if (row.compliance_notes)
    out.push({ section_label: 'compliance_notes', chunk_text: row.compliance_notes })
  // jsonb fields · stringify
  const jsonFields = [
    'brand_values',
    'tone_guidelines',
    'key_messages',
    'value_propositions',
    'forbidden_words',
    'required_terminology',
  ]
  for (const f of jsonFields) {
    const v = row[f]
    if (!v) continue
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    if (text.length > 2) out.push({ section_label: f, chunk_text: text })
  }
  return out
}

function chunksFromIcp(row) {
  const out = []
  // ICP rows vary · serialize all non-null text + jsonb columns
  const fields = [
    'persona_name',
    'demographics',
    'pain_points',
    'jobs_to_be_done',
    'goals',
    'buying_triggers',
    'objections',
    'preferred_channels',
    'budget_range',
    'decision_criteria',
    'industries',
    'role_titles',
    'company_size_range',
  ]
  for (const f of fields) {
    const v = row[f]
    if (!v) continue
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    if (text.length > 2) out.push({ section_label: f, chunk_text: text })
  }
  return out
}

function chunksFromVoc(row) {
  const out = []
  // VOC library rows · quotes + themes
  if (row.quote_text) out.push({ section_label: 'voc_quote', chunk_text: row.quote_text })
  if (row.theme) out.push({ section_label: 'voc_theme', chunk_text: row.theme })
  if (row.sentiment_summary)
    out.push({ section_label: 'voc_sentiment', chunk_text: row.sentiment_summary })
  if (row.source_url) out.push({ section_label: 'voc_source', chunk_text: row.source_url })
  return out
}

function chunksFromCompetitor(row) {
  const out = []
  if (row.competitor_name)
    out.push({
      section_label: `competitor:${row.competitor_name}:name`,
      chunk_text: row.competitor_name,
    })
  if (row.tagline)
    out.push({
      section_label: `competitor:${row.competitor_name}:tagline`,
      chunk_text: row.tagline,
    })
  if (row.value_proposition)
    out.push({
      section_label: `competitor:${row.competitor_name}:value_proposition`,
      chunk_text: row.value_proposition,
    })
  if (row.target_audience)
    out.push({
      section_label: `competitor:${row.competitor_name}:target_audience`,
      chunk_text: row.target_audience,
    })
  if (row.content_strategy_summary)
    out.push({
      section_label: `competitor:${row.competitor_name}:content_strategy`,
      chunk_text: row.content_strategy_summary,
    })
  if (row.ad_strategy_summary)
    out.push({
      section_label: `competitor:${row.competitor_name}:ad_strategy`,
      chunk_text: row.ad_strategy_summary,
    })
  const jsonFields = ['key_differentiators', 'weaknesses', 'recent_moves']
  for (const f of jsonFields) {
    const v = row[f]
    if (!v) continue
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    if (text.length > 2)
      out.push({
        section_label: `competitor:${row.competitor_name}:${f}`,
        chunk_text: text,
      })
  }
  return out
}

const SOURCES = [
  { table: 'client_brand_books', extractor: chunksFromBrandBook },
  { table: 'client_icp_documents', extractor: chunksFromIcp },
  { table: 'client_voc_library', extractor: chunksFromVoc },
  { table: 'client_competitive_landscape', extractor: chunksFromCompetitor },
]

const stats = {
  rows_scanned: 0,
  chunks_generated: 0,
  embeddings_called: 0,
  embeddings_failed: 0,
  chunks_upserted: 0,
  total_tokens: 0,
  total_cost_usd: 0,
}

for (const src of SOURCES) {
  const q = clientIdFilter ? `?client_id=eq.${clientIdFilter}` : '?select=*'
  const r = await supabase(`/${src.table}${q}`)
  if (!r.ok) {
    console.error(`[${src.table}] fetch failed · HTTP ${r.status}`)
    continue
  }
  const rows = await r.json()
  console.log(`[${src.table}] · ${rows.length} rows`)
  for (const row of rows) {
    stats.rows_scanned++
    const chunks = src.extractor(row)
    stats.chunks_generated += chunks.length
    for (const chunk of chunks) {
      if (chunk.chunk_text.length < 3) continue
      const text = chunk.chunk_text.slice(0, 6000) // cap input size
      if (DRY_RUN) {
        console.log(`  [DRY] would embed · ${src.table}/${row.id}/${chunk.section_label} · ${text.length}c`)
        continue
      }
      const e = await generateEmbedding(text)
      stats.embeddings_called++
      if (!e.ok) {
        stats.embeddings_failed++
        console.error(`  [embed-fail] ${src.table}/${row.id}/${chunk.section_label} · ${e.code} · ${e.detail.slice(0, 80)}`)
        continue
      }
      stats.total_tokens += e.tokens
      stats.total_cost_usd += estimateCost(e.tokens)
      // UPSERT chunk
      const upsertRes = await supabase('/client_brain_chunks?on_conflict=client_id,source_table,source_id,section_label', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          client_id: row.client_id,
          source_table: src.table,
          source_id: row.id,
          section_label: chunk.section_label,
          chunk_text: text,
          embedding: e.embedding,
          metadata: chunk.metadata ?? {},
          updated_at: new Date().toISOString(),
        }),
      })
      if (upsertRes.ok || upsertRes.status === 201 || upsertRes.status === 200) {
        stats.chunks_upserted++
      } else {
        const body = await upsertRes.text().catch(() => '')
        console.error(`  [upsert-fail] ${src.table}/${row.id}/${chunk.section_label} · HTTP ${upsertRes.status} · ${body.slice(0, 200)}`)
      }
    }
  }
}

console.log('\n[backfill] complete')
console.log(JSON.stringify(stats, null, 2))
