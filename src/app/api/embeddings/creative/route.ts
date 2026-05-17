/**
 * Sprint #8 Workstream D · POST /api/embeddings/creative
 *
 * Embeds a Meta Ads creative (image_url + copy + context) via OpenAI
 * text-embedding-3-small (1536 dims) and UPSERTs into creative_embeddings.
 *
 * Body:
 *   {
 *     creative_id: string,           // required · FK Meta Graph creative
 *     client_id?: string,
 *     campaign_id?: string,
 *     content: {                     // at least one field required
 *       title?: string,
 *       body?: string,
 *       call_to_action?: string,
 *       link_url?: string,
 *       image_url?: string,
 *       industry?: string,
 *       campaign_objective?: string,
 *       diferenciador?: string,
 *     },
 *     performance_score?: number,    // optional · fed back by insights-sync pipeline later
 *   }
 *
 * Returns { ok, creative_id, dimensions, model, input_tokens, truncated }.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { embedText, buildCreativeContentText } from '@/lib/openai-embed'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type EmbedCreativeBody = {
  creative_id?: string
  client_id?: string
  campaign_id?: string
  content?: Parameters<typeof buildCreativeContentText>[0]
  performance_score?: number
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'not_configured', missing: ['OPENAI_API_KEY'] },
      { status: 503 }
    )
  }

  let body: EmbedCreativeBody
  try {
    body = (await request.json()) as EmbedCreativeBody
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-EMBED-JSON' }, { status: 400 })
  }

  if (!body.creative_id) {
    return NextResponse.json(
      { error: 'creative_id required', code: 'E-EMBED-CREATIVE-ID' },
      { status: 400 }
    )
  }
  if (!body.content || typeof body.content !== 'object') {
    return NextResponse.json(
      { error: 'content object required (at least one field)', code: 'E-EMBED-CONTENT' },
      { status: 400 }
    )
  }
  const contentText = buildCreativeContentText(body.content)
  if (!contentText) {
    return NextResponse.json(
      { error: 'content has no embeddable fields', code: 'E-EMBED-EMPTY' },
      { status: 400 }
    )
  }

  let embedRes: Awaited<ReturnType<typeof embedText>>
  try {
    embedRes = await embedText(contentText)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json(
      { error: 'openai_embed_failed', detail: msg.slice(0, 500) },
      { status: 502 }
    )
  }

  const supabase = getSupabaseAdmin()
  const { error: upsertErr } = await supabase
    .from('creative_embeddings')
    .upsert(
      {
        creative_id: body.creative_id,
        client_id: body.client_id || null,
        campaign_id: body.campaign_id || null,
        content_text: contentText,
        embedding: embedRes.embedding,
        model: embedRes.model,
        dimensions: embedRes.dimensions,
        performance_score: body.performance_score ?? null,
        raw_meta: body.content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'creative_id' }
    )

  if (upsertErr) {
    return NextResponse.json(
      { error: 'supabase_upsert_failed', detail: upsertErr.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    creative_id: body.creative_id,
    model: embedRes.model,
    dimensions: embedRes.dimensions,
    input_tokens: embedRes.input_tokens,
    truncated: embedRes.truncated,
  })
}
