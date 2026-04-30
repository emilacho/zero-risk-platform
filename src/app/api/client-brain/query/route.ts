/**
 * /api/client-brain/query
 * Convenience alias for the n8n workflows.
 *
 * Body: { client_id, query, sections?, match_count? }
 * Auth: x-api-key (INTERNAL_API_KEY).
 *
 * Returns: { results, guardrails, context_md }
 *  — combined response so a single workflow node grabs everything it needs
 *    to feed the next agent step.
 */
import { NextResponse } from 'next/server'
import { queryClientBrain, getClientGuardrails, buildAgentContext, type BrainSection } from '@/lib/client-brain'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { client_id, query, sections, match_count } = body as {
    client_id?: string
    query?: string
    sections?: BrainSection[]
    match_count?: number
  }
  if (!client_id || !query) {
    return NextResponse.json({ error: 'client_id and query are required' }, { status: 400 })
  }

  try {
    const [results, guardrails, context_md] = await Promise.all([
      queryClientBrain({ client_id, query, sections, match_count }),
      getClientGuardrails(client_id),
      buildAgentContext({ client_id, query, sections, match_count }),
    ])
    return NextResponse.json({ results, guardrails, context_md })
  } catch (err) {
    captureRouteError(err, request, {
      route: '/api/client-brain/query',
      source: 'route_handler',
    })
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
