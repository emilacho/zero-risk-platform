/**
 * Sprint #8 Workstream D · GET /api/embeddings/recommend
 *
 * Top-K cosine-similarity search over creative_embeddings for the recommender
 * pipeline. Either embeds an ad-hoc query (?q=...) on the fly, or accepts a
 * precomputed creative_id as the query anchor.
 *
 * Query params:
 *   q              — text to embed + search (optional · mutually exclusive with from_creative_id)
 *   from_creative_id — existing row's embedding used as query anchor
 *   client_id      — when set + cross_cliente=false → scope to this client
 *                    when cross_cliente=true → EXCLUDE this client from results
 *   cross_cliente  — '1' to enable cross-cliente recommend (default: false)
 *   limit          — top-K · default 5 · max 50
 *   min_performance — keep only rows with performance_score >= this (default null → no filter)
 *   campaign_objective — included in built query text when q is omitted (advisory hint)
 *   industry       — same as above
 *
 * Returns { ok, matches: [...], count, query_source }.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { embedText, buildCreativeContentText } from '@/lib/openai-embed'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() || null
  const fromCreativeId = url.searchParams.get('from_creative_id')?.trim() || null
  const clientId = url.searchParams.get('client_id')?.trim() || null
  const crossCliente = url.searchParams.get('cross_cliente') === '1'
  const campaignObjective = url.searchParams.get('campaign_objective') || null
  const industry = url.searchParams.get('industry') || null
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '5'), 1), 50)
  const minPerf = url.searchParams.get('min_performance')
  const minPerformance = minPerf !== null && minPerf !== '' ? Number(minPerf) : null

  if (!q && !fromCreativeId) {
    return NextResponse.json(
      { error: 'q or from_creative_id required', code: 'E-RECOMMEND-QUERY' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()
  let queryEmbedding: number[]
  let querySource: string

  if (fromCreativeId) {
    const { data, error } = await supabase
      .from('creative_embeddings')
      .select('embedding')
      .eq('creative_id', fromCreativeId)
      .maybeSingle()
    if (error) {
      return NextResponse.json(
        { error: 'supabase_lookup_failed', detail: error.message },
        { status: 500 }
      )
    }
    if (!data?.embedding) {
      return NextResponse.json(
        { error: 'creative not found or missing embedding', creative_id: fromCreativeId },
        { status: 404 }
      )
    }
    queryEmbedding = data.embedding as number[]
    querySource = `from_creative_id:${fromCreativeId}`
  } else {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'not_configured', missing: ['OPENAI_API_KEY'] },
        { status: 503 }
      )
    }
    const built = buildCreativeContentText({
      body: q!,
      industry,
      campaign_objective: campaignObjective,
    })
    try {
      const embedRes = await embedText(built)
      queryEmbedding = embedRes.embedding
      querySource = 'embed_on_the_fly'
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      return NextResponse.json(
        { error: 'openai_embed_failed', detail: msg.slice(0, 500) },
        { status: 502 }
      )
    }
  }

  const rpcArgs: Record<string, unknown> = {
    query_embedding: queryEmbedding,
    match_count: limit,
  }
  if (minPerformance !== null) rpcArgs.min_performance_score = minPerformance
  if (crossCliente && clientId) {
    rpcArgs.exclude_client_id = clientId
  } else if (!crossCliente && clientId) {
    rpcArgs.filter_client_id = clientId
  }

  const { data: matches, error: rpcErr } = await supabase
    .rpc('match_creative_embeddings', rpcArgs)

  if (rpcErr) {
    return NextResponse.json(
      { error: 'rpc_failed', detail: rpcErr.message, fn: 'match_creative_embeddings' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    query_source: querySource,
    cross_cliente: crossCliente,
    limit,
    min_performance: minPerformance,
    count: (matches || []).length,
    matches: matches || [],
  })
}
