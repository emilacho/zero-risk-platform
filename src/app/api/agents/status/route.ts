import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/agents/status
// Returns the current status of all agents and recent execution logs
// Now reads from Supabase `agents` table with fallback to hardcoded list

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

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

    // Try to load agents from Supabase DB
    let agents: Array<{
      name: string
      display_name: string
      model: string
      role: string
      status: string
      description: string
      department?: string
    }> = []

    try {
      const { data: dbAgents } = await supabase
        .from('agents')
        .select(`
          name,
          display_name,
          model,
          role,
          status,
          identity_source,
          departments (
            display_name
          )
        `)
        .order('role', { ascending: true })

      if (dbAgents && dbAgents.length > 0) {
        agents = dbAgents.map((a: Record<string, unknown>) => ({
          name: a.name as string,
          display_name: a.display_name as string,
          model: a.model as string,
          role: a.role as string,
          status: a.status as string,
          description: `${a.role} — source: ${a.identity_source}`,
          department: (a.departments as Record<string, string>)?.display_name || undefined,
        }))
      }
    } catch {
      // DB table might not exist yet
    }

    // Fallback to hardcoded if DB is empty
    if (agents.length === 0) {
      agents = [
        {
          name: 'gerente-general',
          display_name: 'Gerente General',
          model: 'claude-haiku',
          role: 'gerente_general',
          status: 'pending',
          description: 'Router — agents-orchestrator.md',
        },
        {
          name: 'jefe-marketing',
          display_name: 'Jefe de Marketing',
          model: 'claude-sonnet',
          role: 'jefe_departamento',
          status: 'pending',
          description: 'Coordinador Dept. Marketing — nexus-strategy.md',
          department: 'Marketing',
        },
        {
          name: 'content-creator',
          display_name: 'Content Creator',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'active',
          description: 'Copy, emails, sequences',
          department: 'Marketing',
        },
        {
          name: 'seo-specialist',
          display_name: 'SEO Specialist',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Audits, AI SEO, programmatic',
          department: 'Marketing',
        },
        {
          name: 'media-buyer',
          display_name: 'Media Buyer',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Paid ads, A/B tests, tracking',
          department: 'Marketing',
        },
        {
          name: 'growth-hacker',
          display_name: 'Growth Hacker',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Funnels, referrals, lead magnets',
          department: 'Marketing',
        },
        {
          name: 'social-media-strategist',
          display_name: 'Social Media Strategist',
          model: 'claude-haiku',
          role: 'empleado',
          status: 'pending',
          description: 'Social content, customer research',
          department: 'Marketing',
        },
        {
          name: 'cro-specialist',
          display_name: 'CRO Specialist',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Conversion rate optimization',
          department: 'Marketing',
        },
        {
          name: 'sales-enablement',
          display_name: 'Sales Enablement',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Outbound, RevOps, churn prevention',
          department: 'Marketing',
        },
        {
          name: 'creative-director',
          display_name: 'Creative Director',
          model: 'claude-sonnet',
          role: 'empleado',
          status: 'pending',
          description: 'Images (GPT Image · gpt-image-1), video (Higgsfield)',
          department: 'Marketing',
        },
        {
          name: 'tracking-specialist',
          display_name: 'Tracking Specialist',
          model: 'claude-haiku',
          role: 'empleado',
          status: 'pending',
          description: 'GA4, PostHog, Meta Pixel',
          department: 'Marketing',
        },
      ]
    }

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
      openai: !!process.env.OPENAI_API_KEY,
      n8n_webhook: !!process.env.N8N_WEBHOOK_URL,
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    }

    return NextResponse.json({
      agents: agentsWithStats,
      services,
      total_agents: agents.length,
      total_executions_24h: recentLogs?.length || 0,
      source: agents.length > 0 ? 'database' : 'fallback',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
