import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'

// POST /api/agents/run
// Ejecutor de UN agente. n8n orquesta la cadena completa.
//
// Body: {
//   agent: "content-creator" | "jefe-marketing" | etc.
//   task: "Instrucción para el agente"
//   context?: {
//     chain?: Array<{ agent: string, output: string }>  // outputs previos en la pipeline
//     skills_filter?: string[]  // solo cargar estos skills (reduce tokens)
//     client_industry?: string  // industria del cliente actual
//     extra?: Record<string, unknown>
//   }
//   caller?: "n8n" | "jarvis" | "api"
// }

// Model mapping
const MODEL_MAP: Record<string, string> = {
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-5-20250514',
  'claude-opus': 'claude-opus-4-0-20250115',
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const agentName = sanitizeString(body.agent, 50)
    const task = sanitizeString(body.task, 5000)
    const context = body.context || {}
    const caller = sanitizeString(body.caller, 20) || 'api'

    if (!agentName || !task) {
      return NextResponse.json(
        { error: 'Missing required fields: agent, task' },
        { status: 400 }
      )
    }

    const claudeApiKey = process.env.CLAUDE_API_KEY
    if (!claudeApiKey) {
      return NextResponse.json(
        { error: 'CLAUDE_API_KEY not configured' },
        { status: 500 }
      )
    }

    // --- Load agent from Supabase (única fuente de verdad) ---
    const supabase = getSupabaseAdmin()

    const { data: agentConfig, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('name', agentName)
      .single()

    if (agentError || !agentConfig) {
      return NextResponse.json(
        { error: `Agent "${agentName}" not found in database` },
        { status: 404 }
      )
    }

    if (!agentConfig.identity_content || agentConfig.identity_content.startsWith('Loaded from filesystem')) {
      return NextResponse.json(
        { error: `Agent "${agentName}" has no identity content loaded. Run migration script first.` },
        { status: 500 }
      )
    }

    // --- Load skills (con skills_filter si se proporciona) ---
    const skillsFilter: string[] | undefined = context.skills_filter

    let skillsQuery = supabase
      .from('agent_skill_assignments')
      .select(`
        priority,
        agent_skills (
          skill_name,
          skill_content
        )
      `)
      .eq('agent_id', agentConfig.id)
      .order('priority', { ascending: true })

    const { data: skillAssignments } = await skillsQuery

    // Falla 3: skills_filter — solo cargar los skills que n8n indica como relevantes
    interface SkillRecord {
      skill_name: string
      skill_content: string
    }

    interface SkillAssignment {
      priority: number
      agent_skills: SkillRecord | SkillRecord[] | null
    }

    let loadedSkills: { name: string; content: string }[] = []

    if (skillAssignments) {
      loadedSkills = (skillAssignments as SkillAssignment[])
        .map((sa) => {
          const skill = Array.isArray(sa.agent_skills) ? sa.agent_skills[0] : sa.agent_skills
          if (!skill?.skill_content || skill.skill_content.startsWith('Loaded from filesystem')) return null
          return { name: skill.skill_name, content: skill.skill_content }
        })
        .filter((s): s is { name: string; content: string } => s !== null)

      // Si hay skills_filter, solo mantener los que están en la lista
      if (skillsFilter && skillsFilter.length > 0) {
        loadedSkills = loadedSkills.filter(s => skillsFilter.includes(s.name))
      }
    }

    // --- Build system prompt ---
    const systemParts: string[] = [
      `# Tu Identidad\n${agentConfig.identity_content}`,
    ]

    // Agregar skills cargados
    for (const skill of loadedSkills) {
      systemParts.push(`\n# Skill: ${skill.name}\n${skill.content}`)
    }

    // Contexto de operación (agnóstico de industria)
    systemParts.push(`\n# Contexto de Operación`)
    systemParts.push(`- Agencia: Zero Risk (agencia de negocios agéntica — sirve cualquier industria)`)
    if (context.client_industry) {
      systemParts.push(`- Industria del cliente: ${context.client_industry}`)
    }
    systemParts.push(`- Idioma: Español`)
    systemParts.push(`- Caller: ${caller}`)

    if (context.extra) {
      systemParts.push(`- Contexto adicional: ${JSON.stringify(context.extra)}`)
    }

    // Falla 6: chain — contexto de agentes previos en la pipeline de n8n
    if (context.chain && Array.isArray(context.chain) && context.chain.length > 0) {
      systemParts.push(`\n# Contexto de la Pipeline (outputs de agentes previos)`)
      for (const step of context.chain) {
        systemParts.push(`\n## Output de ${step.agent}:\n${step.output}`)
      }
    }

    const systemPrompt = systemParts.join('\n')

    // --- Call Claude API ---
    const modelKey = agentConfig.model || 'claude-sonnet'
    const modelId = MODEL_MAP[modelKey] || MODEL_MAP['claude-sonnet']

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: task,
        }],
      }),
    })

    if (!claudeResponse.ok) {
      const errData = await claudeResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: `Claude API error: ${claudeResponse.status}`, details: errData },
        { status: 502 }
      )
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || ''
    const inputTokens = claudeData.usage?.input_tokens || 0
    const outputTokens = claudeData.usage?.output_tokens || 0
    const tokensUsed = inputTokens + outputTokens
    const durationMs = Date.now() - startTime

    // --- Log execution ---
    try {
      await supabase.from('agents_log').insert({
        agent_name: agentName,
        action: 'agents_run',
        input: {
          task: task.substring(0, 200),
          caller,
          skills_loaded: loadedSkills.map(s => s.name),
          skills_filtered: !!skillsFilter,
          chain_length: context.chain?.length || 0,
        },
        output: {
          response_length: responseText.length,
          model: modelId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
        status: 'success',
        duration_ms: durationMs,
        cost: 0,
      })
    } catch {
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      agent: agentName,
      display_name: agentConfig.display_name,
      model: modelId,
      response: responseText,
      tokens_used: tokensUsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      skills_loaded: loadedSkills.map(s => s.name),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET /api/agents/run — info
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/run',
    method: 'POST',
    description: 'Ejecutor de UN agente. n8n orquesta la cadena completa.',
    body_schema: {
      agent: 'string (required) — nombre del agente e.g. "content-creator"',
      task: 'string (required) — la tarea a ejecutar',
      context: {
        chain: 'Array<{ agent, output }> (optional) — outputs previos en la pipeline n8n',
        skills_filter: 'string[] (optional) — solo cargar estos skills (reduce tokens)',
        client_industry: 'string (optional) — industria del cliente actual',
        extra: 'object (optional) — contexto adicional',
      },
      caller: 'string (optional) — "n8n" | "jarvis" | "api"',
    },
    note: 'Agent config comes from Supabase only. No filesystem fallbacks.',
  })
}
