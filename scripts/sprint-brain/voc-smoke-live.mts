/**
 * VOC ingest live E2E smoke · runs the REAL lib against prod · then cleans up.
 * §144 GO · §148 evidence. Synthetic entry · deleted after verification.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// 1 · load .env.local
const REPO = process.argv[2]
for (const line of readFileSync(`${REPO}/.env.local`, 'utf8').split('\n')) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue
  const i = line.indexOf('=')
  const k = line.slice(0, i).trim()
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim()
}

const NAUF = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

// 2 · import the REAL lib (relative path · tsx resolves TS)
const { ingestVocEntries } = await import("../../src/lib/brain/voc-ingest.ts")

const MARK = 'SMOKE-§144-VOC-2026-06-27'
const entry = {
  quote_text: `[${MARK}] El ceviche de Náufrago llegó fresco y bien empacado, lo pido cada semana.`,
  source: 'google_review',
  customer_name: 'Cliente Smoke',
  customer_segment: 'B2C Guayaquil',
  sentiment: 'positive' as const,
  category: 'product_quality',
  themes: ['frescura', 'empaque'],
}

let vocId: string | undefined
try {
  console.log('=== RUN ingestVocEntries (real lib) ===')
  const res = await ingestVocEntries(supabase, { clientId: NAUF, entries: [entry] })
  console.log(JSON.stringify(res, null, 1))
  vocId = res.results?.[0]?.voc_id

  // 3 · verify structured row
  console.log('\n=== VERIFY client_voc_library row ===')
  const { data: vocRows } = await supabase
    .from('client_voc_library')
    .select('id, sentiment, provenance_tag, dedup_hash, content_text')
    .eq('id', vocId)
  console.log(JSON.stringify(vocRows, null, 1))

  // 4 · verify chunk row (embedding present · provenance)
  console.log('\n=== VERIFY client_brain_chunks row ===')
  const { data: chunkRows } = await supabase
    .from('client_brain_chunks')
    .select('id, source_table, source_id, section_label, provenance_tag, metadata')
    .eq('source_id', vocId)
    .eq('source_table', 'client_voc_library')
  console.log(JSON.stringify(chunkRows, null, 1))

  // embedding present? (separate query · embedding is huge · just check not null)
  const { count: embCount } = await supabase
    .from('client_brain_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', vocId)
    .not('embedding', 'is', null)
  console.log(`chunks with embedding for this voc_id: ${embCount}`)

  // 5 · idempotency · re-run · should NOT duplicate
  console.log('\n=== RE-RUN (idempotency check) ===')
  const res2 = await ingestVocEntries(supabase, { clientId: NAUF, entries: [entry] })
  const { count: vocCount } = await supabase
    .from('client_voc_library')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', NAUF)
    .eq('source', 'google_review')
  console.log(`re-run ok=${res2.ok} · voc rows for (NAUF, google_review) after 2 runs: ${vocCount} (expect 1)`)
} finally {
  // 6 · CLEANUP · delete chunk + voc row (synthetic)
  console.log('\n=== CLEANUP ===')
  if (vocId) {
    const c = await supabase.from('client_brain_chunks').delete().eq('source_id', vocId)
    const v = await supabase.from('client_voc_library').delete().eq('id', vocId)
    console.log(`deleted chunk err=${c.error?.message ?? 'none'} · voc err=${v.error?.message ?? 'none'}`)
  }
  // belt-and-suspenders · purge anything carrying the smoke mark
  await supabase.from('client_voc_library').delete().ilike('quote_text', `%${MARK}%`)
  const { count: leftVoc } = await supabase
    .from('client_voc_library').select('id', { count: 'exact', head: true }).ilike('quote_text', `%${MARK}%`)
  console.log(`residual smoke voc rows after cleanup: ${leftVoc} (expect 0)`)
}
