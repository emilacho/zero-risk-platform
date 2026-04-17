import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { MissionControlBridge } from '@/lib/mc-bridge'

/**
 * POST /api/mc-sync/agents
 * Sync Zero Risk agents from Supabase → Mission Control agents.json
 *
 * Maps our 53 agents into MC's agent format:
 * - Built-in MC roles: leader, researcher, developer, marketer, analyst, tester
 * - Each ZR agent becomes a custom MC agent with its identity_content as instructions
 *
 * MC Agent format (POST /api/agents):
 * { name, role, instructions, capabilities[], linkedSkills[] }
 */

// Infer MC role from agent name patterns
function inferMCRole(agentName: string): string {
  const name = agentName.toLowerCase()
  // Leadership
  if (name.includes('jefe') || name.includes('ruflo') || name.includes('director') || name.includes('gerente')) return 'leader'
  // Research
  if (name.includes('research') || name.includes('intelligence') || name.includes('investigaci')) return 'researcher'
  // QA / Testing
  if (name.includes('editor') || name.includes('qa') || name.includes('review')) return 'tester'
  // Development / Technical
  if (name.includes('web-design') || name.includes('video') || name.includes('developer') || name.includes('tracking')) return 'developer'
  // Analytics
  if (name.includes('optimi') || name.includes('report') || name.includes('analyt') || name.includes('cro') || name.includes('seo') || name.includes('growth')) return 'analyst'
  // Default: marketer
  return 'marketer'
}

export async function POST() {
  try {
    const supabase = getSupabaseAdmin()
    const mc = new MissionControlBridge()

    // Check MC is online
    const mcOnline = await mc.isAvailable()
    if (!mcOnline) {
      return NextResponse.json(
        { error: 'Mission Control is offline', hint: 'Check MC_BASE_URL env var or Railway deployment' },
        { status: 503 }
      )
    }

    // Fetch all agents from Supabase (V3 schema)
    const { data: agents, error } = await supabase
      .from('agents')
      .select('name, display_name, role, identity_content, status')
      .eq('status', 'active')
      .order('name')

    if (error || !agents) {
      return NextResponse.json(
        { error: `Failed to fetch agents: ${error?.message}` },
        { status: 500 }
      )
    }

    // Build MC agent payloads
    const results: { agent: string; status: string; mcId?: string; error?: string }[] = []

    for (const agent of agents) {
      // Infer MC role from agent name patterns
      const mcRole = inferMCRole(agent.name)

      const capabilities: string[] = []

      // Truncate identity to keep MC JSON manageable
      const instructions = agent.identity_content
        ? agent.identity_content.substring(0, 2000)
        : `Zero Risk agent: ${agent.display_name || agent.name}. Role: ${agent.role || mcRole}.`

      // MC requires lowercase alphanumeric with hyphens only
      const mcId = agent.name.replace(/_/g, '-')

      const mcAgent = {
        id: mcId,
        name: agent.display_name || agent.name,
        role: mcRole,
        instructions: [
          `## ${agent.display_name || agent.name}`,
          agent.role ? `**Rol:** ${agent.role}` : '',
          `**MC Role:** ${mcRole}`,
          `\n${instructions}`,
        ].filter(Boolean).join('\n'),
        capabilities,
        linkedSkills: [],
        masterPassword: process.env.MC_MASTER_PASSWORD || '',
      }

      try {
        const mcBaseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:3001'
        const response = await fetch(`${mcBaseUrl}/api/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mcAgent),
        })

        if (response.ok) {
          const data = await response.json()
          results.push({ agent: agent.name, status: 'created', mcId: data.id })
        } else {
          const errText = await response.text()
          results.push({ agent: agent.name, status: 'failed', error: `${response.status}: ${errText.substring(0, 200)}` })
        }
      } catch (e) {
        results.push({ agent: agent.name, status: 'failed', error: e instanceof Error ? e.message : 'fetch failed' })
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: failed === 0,
      total_agents: agents.length,
      created,
      failed,
      details: results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/mc-sync/agents — info
 */
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  return NextResponse.json({
    endpoint: '/api/mc-sync/agents',
    method: 'POST',
    description: 'Sync all active Zero Risk agents from Supabase to Mission Control.',
    agents_in_supabase: count || 0,
    mc_url: process.env.MC_BASE_URL || 'http://localhost:3001',
  })
}
