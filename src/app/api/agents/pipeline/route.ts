import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Agent Pipeline — Async Trigger
 *
 * 1. Generate a pipeline_id (UUID)
 * 2. INSERT a `pending` row in `pipeline_results`
 * 3. Fire-and-forget POST to the n8n webhook (no awaiting the chain)
 * 4. Return the pipeline_id immediately to the client
 *
 * The client then polls /api/agents/pipeline/status/[id] until status is
 * terminal. n8n calls /api/agents/pipeline/callback when the chain finishes.
 *
 * This pattern bypasses the Cloudflare 100s hard limit on n8n Cloud webhooks
 * because no single HTTP request needs to stay open longer than ~1s.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const N8N_WEBHOOK_URL =
  process.env.N8N_AGENT_PIPELINE_WEBHOOK ||
  'https://zerorisk.app.n8n.cloud/webhook/agent-pipeline'

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.VERCEL_URL ||
  'http://localhost:3000'

function getCallbackUrl(): string {
  const base = APP_BASE_URL.startsWith('http')
    ? APP_BASE_URL
    : `https://${APP_BASE_URL}`
  return `${base}/api/agents/pipeline/callback`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const task = typeof body?.task === 'string' ? body.task.trim() : ''

    if (!task) {
      return NextResponse.json(
        { error: 'Campo "task" es requerido y debe ser un string no vacío.' },
        { status: 400 }
      )
    }

    if (task.length > 2000) {
      return NextResponse.json(
        { error: 'La tarea no puede exceder 2000 caracteres.' },
        { status: 400 }
      )
    }

    // 1. Insert pending row in Supabase
    const supabase = getSupabaseAdmin()
    const pipelineId = randomUUID()

    const { error: insertError } = await supabase
      .from('pipeline_results')
      .insert({
        id: pipelineId,
        task,
        status: 'pending',
      })

    if (insertError) {
      console.error('[pipeline trigger] insert error:', insertError)
      return NextResponse.json(
        { error: 'No se pudo registrar la tarea en la base de datos.' },
        { status: 500 }
      )
    }

    // 2. Fire-and-forget POST to n8n. We do not await the response — the
    //    chain takes ~2 minutes and Cloudflare would cut us off at 100s.
    //    n8n's Webhook node should be configured to "Respond Immediately".
    const callbackUrl = getCallbackUrl()
    const callbackSecret = process.env.PIPELINE_CALLBACK_SECRET || ''

    fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task,
        pipeline_id: pipelineId,
        callback_url: callbackUrl,
        callback_secret: callbackSecret,
      }),
    }).catch((err) => {
      // Best-effort: mark the row as error if we couldn't even reach n8n.
      console.error('[pipeline trigger] n8n fetch error:', err)
      supabase
        .from('pipeline_results')
        .update({
          status: 'error',
          error: `No se pudo contactar a n8n: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pipelineId)
        .then(() => {})
    })

    // 3. Mark as running and return immediately
    await supabase
      .from('pipeline_results')
      .update({ status: 'running' })
      .eq('id', pipelineId)

    return NextResponse.json({
      ok: true,
      pipeline_id: pipelineId,
      status: 'running',
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido en el proxy.'
    console.error('[pipeline trigger] error:', error)
    return NextResponse.json(
      { error: 'Error al disparar el Agent Pipeline', details: message },
      { status: 500 }
    )
  }
}
