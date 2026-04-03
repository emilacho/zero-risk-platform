import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// GET /api/agents/status
// Returns the current status of all agents and recent execution logs

export async function GET() {
  try {
    const supabase = getSupabase()

    // Get recent agent logs (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: recentLogs, error: logsError } = await supabase
      .from('agents_log')
      .select('*')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50)

    if (logsError) {
      return NextResponse.json({ error: logsError.message }, { status: 500 })
    }

    // Aggregate stats per agent
    const agentStats: Record<string, {
      total_executions: number
      successful: number
      failed: number
      total_tokens: number
      last_execution: string | null
    }> = {}

    for (const log of recentLogs || []) {
      const name = log.agent_name || 'unknown'
      if (!agentStats[name]) {
        agentStats[name] = {
          total_executions: 0,
          successful: 0,
          failed: 0,
          total_tokens: 0,
          last_execution: null,
        }
      }
      agentStats[name].total_executions++
      if (log.status === 'success') agentStats[name].successful++
      else agentStats[name].failed++
      agentStats[name].total_tokens += log.tokens_used || 0
      if (!agentStats[name].last_execution) {
        agentStats[name].last_execution = log.created_at
      }
    }

    // Define all agents and their current status
    const agents = [
      {
        name: 'ruflo',
        display_name: 'RUFLO — Gatekeeper',
        model: 'claude-haiku',
        type: 'advisory',
        status: 'active',
        description: 'Pre-procesa requests, clasifica y estima complejidad',
      },
      {
        name: 'content_creator',
        display_name: 'Content Creator',
        model: 'claude-sonnet',
        type: 'advisory',
        status: 'active',
        description: 'Genera copy para ads, posts, emails, landing pages',
      },
      {
        name: 'ad_creative_strategist',
        display_name: 'Ad Creative Strategist',
        model: 'claude-sonnet + ideogram-v3',
        type: 'execution',
        status: process.env.COMPOSIO_API_KEY ? 'active' : 'pending_setup',
        description: 'Genera prompts de imagen + estructura de campaña en Meta Ads',
      },
      {
        name: 'lead_manager',
        display_name: 'Lead Manager',
        model: 'claude-haiku',
        type: 'advisory',
        status: 'active',
        description: 'Califica leads, asigna score, notifica a Xavier',
      },
      {
        name: 'chief_of_staff',
        display_name: 'Chief of Staff',
        model: 'claude-sonnet',
        type: 'advisory',
        status: 'pending',
        description: 'Supervisor general, reportes diarios, monitoreo de salud',
      },
    ]

    // Merge agent definitions with stats
    const agentsWithStats = agents.map((agent) => ({
      ...agent,
      stats_24h: agentStats[agent.name] || {
        total_executions: 0,
        successful: 0,
        failed: 0,
        total_tokens: 0,
        last_execution: null,
      },
    }))

    // Check service connections
    const services = {
      composio: !!process.env.COMPOSIO_API_KEY,
      claude_api: !!process.env.CLAUDE_API_KEY,
      ideogram: !!process.env.IDEOGRAM_API_KEY,
      n8n_webhook: !!process.env.N8N_WEBHOOK_URL,
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    }

    return NextResponse.json({
      agents: agentsWithStats,
      services,
      total_executions_24h: recentLogs?.length || 0,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
