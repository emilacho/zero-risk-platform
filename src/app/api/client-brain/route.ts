// =============================================================
// Zero Risk V3 — Client Brain API Route
// POST /api/client-brain
//
// Handles tool calls from Managed Agents:
//   - query_client_brain → semantic RAG search
//   - get_client_guardrails → pre-generation constraints
//   - build_agent_context → combined (guardrails + brain search)
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  queryClientBrain,
  getClientGuardrails,
  buildAgentContext,
  type BrainSection,
} from '@/lib/client-brain'

interface ToolRequest {
  tool: 'query_client_brain' | 'get_client_guardrails' | 'build_agent_context'
  params: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  try {
    // Validate auth — Managed Agents send the service key as Bearer token
    const authHeader = req.headers.get('authorization')
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as ToolRequest

    switch (body.tool) {
      case 'query_client_brain': {
        const { client_id, query, sections, match_count } = body.params as {
          client_id: string
          query: string
          sections?: BrainSection[]
          match_count?: number
        }
        if (!client_id || !query) {
          return NextResponse.json(
            { error: 'client_id and query are required' },
            { status: 400 }
          )
        }
        const results = await queryClientBrain({
          client_id,
          query,
          sections,
          match_count,
        })
        return NextResponse.json({ results })
      }

      case 'get_client_guardrails': {
        const { client_id } = body.params as { client_id: string }
        if (!client_id) {
          return NextResponse.json(
            { error: 'client_id is required' },
            { status: 400 }
          )
        }
        const guardrails = await getClientGuardrails(client_id)
        return NextResponse.json({ guardrails })
      }

      case 'build_agent_context': {
        const { client_id, query, sections, match_count } = body.params as {
          client_id: string
          query: string
          sections?: BrainSection[]
          match_count?: number
        }
        if (!client_id || !query) {
          return NextResponse.json(
            { error: 'client_id and query are required' },
            { status: 400 }
          )
        }
        const context = await buildAgentContext({
          client_id,
          query,
          sections,
          match_count,
        })
        return NextResponse.json({ context })
      }

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${body.tool}` },
          { status: 400 }
        )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[client-brain]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
