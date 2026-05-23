/**
 * Sprint 7.6 Track C4/C6 · Brain chunks ingestion hook.
 *
 * Post-discoverClient · fire-and-forget upload de scraped page content como
 * chunks a `client_brain_chunks` (table creada en Sprint 7.5 PR #76 · CC#1
 * Brain wire-in). Cuando esa migration esté merged · esta función chunks +
 * embeds + upserts. Hasta entonces · graceful skip + logs advisory.
 *
 * Canonical chunk shape per Sprint 7.5 spec ·
 *   - client_id (FK)
 *   - source_type · "web-discovery-page"
 *   - source_url
 *   - content_text (chunk ≤ 1500 chars)
 *   - metadata jsonb · { page_title, page_url, scraped_at, sprint }
 *   - embedding vector(1536) · openai text-embedding-3-small (Sprint 7.5 canon)
 *
 * Errors swallowed · NEVER throw upstream a discoverClient.
 */
import { SupabaseClient } from "@supabase/supabase-js"
import type { DiscoveryResult, ScrapedPage } from "./web-discovery"

export interface BrainIngestResult {
  attempted: boolean
  table_exists: boolean
  chunks_total: number
  chunks_inserted: number
  errors: string[]
}

/** Approx chunking · split body_text en chunks de ~1500 chars con overlap 200. */
function chunkText(text: string, maxLen = 1500, overlap = 200): string[] {
  if (!text || text.length <= maxLen) return text && text.length > 50 ? [text] : []
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxLen, text.length)
    // Try to break on sentence/whitespace boundary near `end`
    let breakAt = end
    if (end < text.length) {
      const slice = text.slice(start, end)
      const lastBreak = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! "),
      )
      if (lastBreak > maxLen / 2) {
        breakAt = start + lastBreak + 1
      }
    }
    chunks.push(text.slice(start, breakAt).trim())
    start = Math.max(breakAt - overlap, breakAt)
  }
  return chunks.filter((c) => c.length > 50)
}

/**
 * Build canonical chunk rows from scraped pages. Embedding generation deferred
 * to Sprint 7.5 RPC `generate_client_brain_embeddings` (post-merge PR #76)
 * OR to caller que tiene OPENAI_API_KEY. Esta función SOLO produce chunk rows
 * + metadata · embedding=NULL inicial.
 */
export function buildChunksFromDiscovery(
  clientId: string,
  discovery: DiscoveryResult,
): Array<{
  client_id: string
  source_type: string
  source_url: string
  content_text: string
  metadata: Record<string, unknown>
  embedding: null
}> {
  const rows: Array<{
    client_id: string
    source_type: string
    source_url: string
    content_text: string
    metadata: Record<string, unknown>
    embedding: null
  }> = []

  for (const page of discovery.pages) {
    const baseMeta = {
      page_title: page.title,
      page_url: page.url,
      headings: page.headings.slice(0, 10),
      scraped_at: discovery.scrapedAt,
      sprint: "7p6-track-c",
      company_name: discovery.companyName,
    }

    // 1. Title + meta description as first chunk (high-signal)
    const headerText = [page.title, page.metaDescription]
      .filter((s) => s && s.length > 0)
      .join(" · ")
    if (headerText.length > 30) {
      rows.push({
        client_id: clientId,
        source_type: "web-discovery-header",
        source_url: page.url,
        content_text: headerText,
        metadata: { ...baseMeta, chunk_type: "header" },
        embedding: null,
      })
    }

    // 2. Body text chunks
    const bodyChunks = chunkText(page.bodyText, 1500, 200)
    bodyChunks.forEach((chunk, i) => {
      rows.push({
        client_id: clientId,
        source_type: "web-discovery-page",
        source_url: page.url,
        content_text: chunk,
        metadata: {
          ...baseMeta,
          chunk_type: "body",
          chunk_index: i,
          chunk_total: bodyChunks.length,
        },
        embedding: null,
      })
    })
  }

  return rows
}

/**
 * Push chunks to `client_brain_chunks` table. Graceful skip si table NO existe
 * (PR #76 not merged) · logs advisory · NEVER throws.
 */
export async function ingestDiscoveryToBrain(
  supabase: SupabaseClient,
  clientId: string,
  discovery: DiscoveryResult,
): Promise<BrainIngestResult> {
  const result: BrainIngestResult = {
    attempted: true,
    table_exists: false,
    chunks_total: 0,
    chunks_inserted: 0,
    errors: [],
  }

  // Probe table existence · single-row select con LIMIT 0
  try {
    const { error } = await supabase
      .from("client_brain_chunks")
      .select("client_id", { count: "exact", head: true })
      .limit(0)
    if (error) {
      result.errors.push(`table_probe_failed · ${error.message}`)
      // Table missing or RLS denies · graceful exit
      console.log(
        `[brain-ingest] client_brain_chunks not available · ${error.message} · skip`,
      )
      return result
    }
    result.table_exists = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    result.errors.push(`table_probe_exception · ${msg}`)
    return result
  }

  const rows = buildChunksFromDiscovery(clientId, discovery)
  result.chunks_total = rows.length

  if (rows.length === 0) {
    console.log(`[brain-ingest] no chunks to insert · client_id=${clientId.slice(0, 8)}`)
    return result
  }

  // Batch insert · 50 rows per call · canonical Supabase chunked-upsert
  const batchSize = 50
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    try {
      const { error } = await supabase.from("client_brain_chunks").insert(batch)
      if (error) {
        result.errors.push(`batch_${i}_insert · ${error.message}`)
      } else {
        result.chunks_inserted += batch.length
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown"
      result.errors.push(`batch_${i}_exception · ${msg}`)
    }
  }

  console.log(
    `[brain-ingest] client_id=${clientId.slice(0, 8)} · ` +
      `chunks_inserted=${result.chunks_inserted}/${result.chunks_total} · ` +
      `errors=${result.errors.length}`,
  )
  return result
}
