/**
 * Canon canonical · Discovery output → brain PUSH (Lenovo SPEC 2026-06-05).
 *
 * Closes gap D · the agent-runner has been READ-ONLY (push-enrichment pulls
 * chunks for prompt context · `services/agent-runner/src/lib/brain-enrichment.ts`).
 * This module is the WRITE side · the Auto-Discovery agent's structured
 * output PERSISTS to the 2 relevant source tables + indexes to
 * `client_brain_chunks` · subsequent invocations retrieve the chunks via
 * the existing RAG path.
 *
 * Write surface ·
 *   - `client_competitive_landscape` · 1 row per discovered competitor ·
 *      stored with `analysis_source='auto_discovery'` · UPSERT on
 *      (client_id, competitor_name) so re-discovery refreshes the row
 *   - `client_icp_documents` · 1 row per discovered segment · UPSERT on
 *      (client_id, audience_segment)
 *   - `client_brain_chunks` · indexed via `persistChunks()` from existing
 *      `src/lib/brain/persist-chunks.ts` · per-row chunks per section_label
 *
 * §148 honest · NEVER throws · partial writes accumulate in `errors` array
 * for surface debugging · caller decides logging/Sentry.
 *
 * Default-OFF · activate via `SALA_DISCOVERY_BRAIN_PUSH_ENABLED=true`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { persistChunks } from '@/lib/brain/persist-chunks'
import type {
  DiscoveredCompetitor,
  DiscoveredIcpSegment,
  DiscoveryOutput,
  DiscoveryPersistOutcome,
} from './types'

/** Canon canonical · default-OFF gate · per spec §guardrails. */
export function isDiscoveryBrainPushEnabled(
  input: { enabled?: boolean } = {},
): boolean {
  if (input.enabled !== undefined) return input.enabled
  return process.env.SALA_DISCOVERY_BRAIN_PUSH_ENABLED === 'true'
}

export interface PersistDiscoveryToBrainInput {
  readonly supabase: SupabaseClient
  readonly discovery: DiscoveryOutput
  /** Optional override · skips env flag. Used by tests + targeted smoke. */
  readonly enabled?: boolean
}

/**
 * Canon canonical · entry point · pure orchestrator over per-row UPSERTs.
 * Returns a structured outcome · never throws.
 */
export async function persistDiscoveryToBrain(
  input: PersistDiscoveryToBrainInput,
): Promise<DiscoveryPersistOutcome> {
  const startedAt = Date.now()
  const empty: DiscoveryPersistOutcome = {
    client_id: input.discovery.client_id,
    competitor_landscape_rows: 0,
    icp_document_rows: 0,
    brain_chunks_upserted: 0,
    config_handles_written: 0,
    config_competitors_written: 0,
    errors: [],
    duration_ms: 0,
  }
  if (!isDiscoveryBrainPushEnabled({ enabled: input.enabled })) {
    return { ...empty, errors: ['flag_off'], duration_ms: Date.now() - startedAt }
  }

  const errors: string[] = []
  let competitorRows = 0
  let icpRows = 0
  let chunksTotal = 0

  // ─── Step 1 · competitors → client_competitive_landscape + chunks ───
  for (const c of input.discovery.competitors) {
    try {
      const sourceId = await upsertCompetitorRow(input.supabase, input.discovery.client_id, c)
      if (sourceId) {
        competitorRows++
        const chunks = competitorChunks(c)
        if (chunks.length > 0) {
          const r = await persistChunks(input.supabase, {
            clientId: input.discovery.client_id,
            sourceTable: 'client_competitive_landscape',
            sourceId,
            chunks,
            // FASE C · provenance per competidor (taxonomía discovery · PR #199).
            // F1.1 · data de competidores viene del scrape Apify → default
            // 'apify_scrape' (antes 'onboarding_discovery' genérico) · respeta
            // c.source si el discovery output lo especifica. Aditivo · reversible.
            source: c.source ?? 'apify_scrape',
            trustLevel: c.trust_level ?? 'untrusted',
          })
          if (r.ok) chunksTotal += r.chunks_upserted
          else errors.push(`competitor_chunks_${c.name}: ${r.code}`)
        }
      }
    } catch (e) {
      errors.push(`competitor_${c.name}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  // ─── Step 2 · ICP segments → client_icp_documents + chunks ───
  const icpSegments: readonly DiscoveredIcpSegment[] = Array.isArray(input.discovery.icp)
    ? input.discovery.icp
    : input.discovery.icp
      ? [input.discovery.icp]
      : []
  for (const seg of icpSegments) {
    try {
      const sourceId = await upsertIcpRow(input.supabase, input.discovery.client_id, seg)
      if (sourceId) {
        icpRows++
        const chunks = icpChunks(seg)
        if (chunks.length > 0) {
          const r = await persistChunks(input.supabase, {
            clientId: input.discovery.client_id,
            sourceTable: 'client_icp_documents',
            sourceId,
            chunks,
          })
          if (r.ok) chunksTotal += r.chunks_upserted
          else errors.push(`icp_chunks_${seg.audience_segment}: ${r.code}`)
        }
      }
    } catch (e) {
      errors.push(`icp_${seg.audience_segment}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  // ─── Step 3 · competitive_landscape_summary → standalone chunk indexed
  //              against a synthetic landscape row · so the RAG retrieval
  //              surfaces the macro view alongside per-competitor chunks ───
  if (
    input.discovery.competitive_landscape_summary &&
    input.discovery.competitive_landscape_summary.trim().length > 0
  ) {
    try {
      const summarySourceId = await upsertLandscapeSummaryRow(
        input.supabase,
        input.discovery.client_id,
        input.discovery.competitive_landscape_summary,
      )
      if (summarySourceId) {
        const r = await persistChunks(input.supabase, {
          clientId: input.discovery.client_id,
          sourceTable: 'client_competitive_landscape',
          sourceId: summarySourceId,
          // F1.1 · el resumen de landscape se sintetiza de scrapes Apify → apify_scrape.
          source: 'apify_scrape',
          chunks: [
            {
              section_label: 'landscape_summary',
              chunk_text: input.discovery.competitive_landscape_summary,
              metadata: { kind: 'discovery_summary' },
            },
          ],
        })
        if (r.ok) chunksTotal += r.chunks_upserted
        else errors.push(`summary_chunks: ${r.code}`)
      }
    } catch (e) {
      errors.push(`summary: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return {
    client_id: input.discovery.client_id,
    competitor_landscape_rows: competitorRows,
    icp_document_rows: icpRows,
    brain_chunks_upserted: chunksTotal,
    config_handles_written: 0, // populated by populate-config caller
    config_competitors_written: 0,
    errors,
    duration_ms: Date.now() - startedAt,
  }
}

/**
 * Canon canonical · UPSERT one competitor row · returns its UUID for the
 * subsequent chunk persist step. Idempotent via (client_id, competitor_name)
 * onConflict.
 */
async function upsertCompetitorRow(
  supabase: SupabaseClient,
  clientId: string,
  c: DiscoveredCompetitor,
): Promise<string | null> {
  const row: Record<string, unknown> = {
    client_id: clientId,
    competitor_name: c.name,
    competitor_type: c.competitor_type ?? 'direct',
    last_analyzed_at: new Date().toISOString(),
    analysis_source: 'auto_discovery',
    updated_at: new Date().toISOString(),
  }
  if (c.website) row.competitor_website = c.website
  if (c.positioning) row.value_proposition = c.positioning
  if (c.handles && Object.keys(c.handles).length > 0) {
    row.recent_moves = [{ kind: 'discovered_handles', handles: c.handles }]
  }
  // Build content_text for embedding (the persist-chunks layer also embeds
  // per-section but having a content_text is useful for legacy callers).
  const parts: string[] = [`Competitor: ${c.name}`]
  if (c.website) parts.push(`Website: ${c.website}`)
  if (c.positioning) parts.push(`Positioning: ${c.positioning}`)
  if (c.why) parts.push(`Why discovered: ${c.why}`)
  if (c.handles) {
    const h = Object.entries(c.handles)
      .filter(([, v]) => v && (v as string).length > 0)
      .map(([k, v]) => `${k}=${v as string}`)
      .join(' · ')
    if (h) parts.push(`Handles: ${h}`)
  }
  row.content_text = parts.join('\n')

  const { data, error } = await supabase
    .from('client_competitive_landscape')
    .upsert(row, { onConflict: 'client_id,competitor_name' })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

async function upsertIcpRow(
  supabase: SupabaseClient,
  clientId: string,
  seg: DiscoveredIcpSegment,
): Promise<string | null> {
  const row: Record<string, unknown> = {
    client_id: clientId,
    audience_segment: seg.audience_segment,
    segment_priority: seg.segment_priority ?? 1,
    updated_at: new Date().toISOString(),
  }
  if (seg.job_titles && seg.job_titles.length > 0) row.job_titles = seg.job_titles
  if (seg.company_size) row.company_size = seg.company_size
  if (seg.industries && seg.industries.length > 0) row.industries = seg.industries
  if (seg.geography) row.geography = seg.geography
  if (seg.goals && seg.goals.length > 0) row.goals = seg.goals
  if (seg.pain_points && seg.pain_points.length > 0) row.pain_points = seg.pain_points
  if (seg.jobs_to_be_done && seg.jobs_to_be_done.length > 0)
    row.jobs_to_be_done = seg.jobs_to_be_done
  if (seg.objections && seg.objections.length > 0) row.objections = seg.objections
  if (seg.buying_process) row.buying_process = seg.buying_process
  if (seg.decision_criteria && seg.decision_criteria.length > 0)
    row.decision_criteria = seg.decision_criteria
  if (seg.budget_range) row.budget_range = seg.budget_range
  if (seg.preferred_channels && seg.preferred_channels.length > 0)
    row.preferred_channels = seg.preferred_channels
  if (seg.content_preferences) row.content_preferences = seg.content_preferences

  const parts: string[] = [`Segment: ${seg.audience_segment}`]
  if (seg.job_titles?.length) parts.push(`Titles: ${seg.job_titles.join(', ')}`)
  if (seg.pain_points?.length) parts.push(`Pains: ${seg.pain_points.join(' · ')}`)
  if (seg.goals?.length) parts.push(`Goals: ${seg.goals.join(' · ')}`)
  row.content_text = parts.join('\n')

  const { data, error } = await supabase
    .from('client_icp_documents')
    .upsert(row, { onConflict: 'client_id,audience_segment' })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

/**
 * Canon canonical · summary row · uses competitor_name='_landscape_summary'
 * as a sentinel so re-runs UPSERT instead of insert-on-insert. Keeps the
 * RAG retrievable alongside per-competitor rows.
 */
async function upsertLandscapeSummaryRow(
  supabase: SupabaseClient,
  clientId: string,
  summary: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('client_competitive_landscape')
    .upsert(
      {
        client_id: clientId,
        competitor_name: '_landscape_summary',
        competitor_type: 'direct',
        analysis_source: 'auto_discovery',
        content_text: summary,
        last_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,competitor_name' },
    )
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

/**
 * Canon canonical · per-competitor chunks. Each section_label generates a
 * separate chunk in `client_brain_chunks` · UNIQUE(client_id, source_table,
 * source_id, section_label) drives idempotency.
 */
export function competitorChunks(c: DiscoveredCompetitor): Array<{
  section_label: string
  chunk_text: string
  metadata?: Record<string, unknown>
}> {
  const chunks: Array<{ section_label: string; chunk_text: string; metadata?: Record<string, unknown> }> = []
  chunks.push({
    section_label: 'name',
    chunk_text: c.name,
    metadata: { competitor_type: c.competitor_type ?? 'direct' },
  })
  if (c.positioning) chunks.push({ section_label: 'positioning', chunk_text: c.positioning })
  if (c.why) chunks.push({ section_label: 'why_competitor', chunk_text: c.why })
  if (c.handles) {
    const handlesText = Object.entries(c.handles)
      .filter(([, v]) => v && (v as string).length > 0)
      .map(([k, v]) => `${k}: ${v as string}`)
      .join('\n')
    if (handlesText.length > 0) {
      chunks.push({ section_label: 'social_handles', chunk_text: handlesText })
    }
  }
  return chunks
}

/**
 * Canon canonical · per-ICP-segment chunks · one per logical field cluster.
 */
export function icpChunks(seg: DiscoveredIcpSegment): Array<{
  section_label: string
  chunk_text: string
}> {
  const chunks: Array<{ section_label: string; chunk_text: string }> = []
  chunks.push({ section_label: 'segment_name', chunk_text: seg.audience_segment })
  if (seg.pain_points?.length)
    chunks.push({ section_label: 'pain_points', chunk_text: seg.pain_points.join('\n') })
  if (seg.goals?.length)
    chunks.push({ section_label: 'goals', chunk_text: seg.goals.join('\n') })
  if (seg.jobs_to_be_done?.length)
    chunks.push({ section_label: 'jtbd', chunk_text: seg.jobs_to_be_done.join('\n') })
  if (seg.objections?.length)
    chunks.push({ section_label: 'objections', chunk_text: seg.objections.join('\n') })
  if (seg.decision_criteria?.length)
    chunks.push({ section_label: 'decision_criteria', chunk_text: seg.decision_criteria.join('\n') })
  if (seg.preferred_channels?.length)
    chunks.push({ section_label: 'preferred_channels', chunk_text: seg.preferred_channels.join('\n') })
  if (seg.content_preferences)
    chunks.push({ section_label: 'content_preferences', chunk_text: seg.content_preferences })
  return chunks
}
