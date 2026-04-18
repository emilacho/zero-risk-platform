import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { buildAgentContext } from '@/lib/client-brain'

// POST /api/agents/run
// Ejecutor de UN agente. n8n orquesta la cadena completa.
//
// Body: {
//   agent: "content-creator" | "jefe-marketing" | etc.
//   task: "Instrucción para el agente"
//   context?: {
//     chain?: Array<{ agent: string, output: string }>  // outputs previos en la pipeline
//     client_id?: string          // UUID → activa Client Brain RAG (guardrails + semantic search)
//     rag_query?: string          // query específico para RAG (default: usa task)
//     rag_match_count?: number    // resultados RAG a traer (default: 5)
//     skills_filter?: string[]    // solo cargar estos skills (reduce tokens)
//     client_industry?: string    // industria del cliente actual
//     extra?: Record<string, unknown>
//   }
//   caller?: "n8n" | "pipeline" | "api"
// }

// Model mapping
const MODEL_MAP: Record<string, string> = {
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-opus': 'claude-opus-4-6',
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const agentName = sanitizeString(body.agent, 50)
    // Tolerate multiple task field names (research-generated workflows use task_type,
    // request_text, routing_instructions, etc). Fall back through common variants
    // so we never silently get an empty task.
    const taskCandidates = [
      body.task,
      body.task_type,
      body.request_text,
      body.routing_instructions,
      body.instruction,
      body.prompt,
    ].filter(v => typeof v === 'string' && v.trim().length > 0)
    const taskRaw = taskCandidates[0] || ''
    const task = sanitizeString(taskRaw, 5000)
    const context = body.context || body.client_brain || {}
    const caller = sanitizeString(body.caller, 20) || 'api'

    if (!agentName || !task) {
      return NextResponse.json(
        {
          error: 'Missing required fields: agent, task',
          received_keys: Object.keys(body || {}),
          hint: 'Provide one of: task, task_type, request_text, routing_instructions, instruction, prompt',
        },
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

    // --- Load agent from Supabase (registry + legacy table) ---
    const supabase = getSupabaseAdmin()

    // 0. Resolve alias → canonical slug via managed_agents_registry.
    //    n8n workflows may send legacy snake_case slugs (e.g. "backlink_strategist");
    //    the registry maps them to the canonical kebab-case slug.
    //    Registry is the source of truth for identity_md (production-safe).
    let canonicalSlug = agentName
    let registryRow: {
      slug: string
      display_name: string
      default_model: string
      identity_md: string | null
    } | null = null
    {
      const { data: regRows } = await supabase
        .from('managed_agents_registry')
        .select('slug, display_name, default_model, identity_md, aliases')
        .eq('status', 'active')
        .or(`slug.eq.${agentName},aliases.cs.{"${agentName}"}`)
        .limit(1)
      const row = regRows?.[0]
      if (row) {
        canonicalSlug = row.slug
        registryRow = {
          slug: row.slug,
          display_name: row.display_name,
          default_model: row.default_model,
          identity_md: row.identity_md ?? null,
        }
      }
    }

    // 1. Try the legacy `agents` table first (has skills wiring).
    let agentConfig = (await supabase
      .from('agents')
      .select('*')
      .eq('name', canonicalSlug)
      .maybeSingle()).data as Record<string, unknown> | null

    // 1b. Fallback: synthesize config from managed_agents_registry.
    if (!agentConfig && registryRow?.identity_md) {
      agentConfig = {
        id: null,
        name: registryRow.slug,
        display_name: registryRow.display_name,
        identity_content: registryRow.identity_md,
        model: registryRow.default_model,
      }
    }

    // 1c. Override identity_content from registry if legacy table has stale data.
    if (agentConfig && registryRow?.identity_md) {
      const legacyContent = agentConfig.identity_content as string | null
      if (!legacyContent || legacyContent.startsWith('Loaded from filesystem')) {
        agentConfig.identity_content = registryRow.identity_md
      }
    }

    if (!agentConfig) {
      const hint = registryRow
        ? `registry row exists but identity_md is empty — run scripts/sync-registry-identities.ts`
        : `slug not found in agents table or managed_agents_registry`
      return NextResponse.json(
        { error: `Agent "${agentName}" (resolved to "${canonicalSlug}") not loadable: ${hint}` },
        { status: 404 }
      )
    }

    if (!agentConfig.identity_content || (agentConfig.identity_content as string).startsWith('Loaded from filesystem')) {
      return NextResponse.json(
        { error: `Agent "${canonicalSlug}" has no identity content loaded. Run migration script first.` },
        { status: 500 }
      )
    }

    // --- Load skills (con skills_filter si se proporciona) ---
    const skillsFilter: string[] | undefined = context.skills_filter

    // Skills only available if agent comes from legacy table (has id)
    const { data: skillAssignments } = agentConfig.id
      ? await supabase
          .from('agent_skill_assignments')
          .select(`
            priority,
            agent_skills (
              skill_name,
              skill_content
            )
          `)
          .eq('agent_id', agentConfig.id as string)
          .order('priority', { ascending: true })
      : { data: [] as unknown[] }

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
      `# Tu Identidad\n${agentConfig.identity_content as string}`,
    ]

    // Agregar skills cargados
    for (const skill of loadedSkills) {
      systemParts.push(`\n# Skill: ${skill.name}\n${skill.content}`)
    }

    // --- Client Brain RAG context (guardrails + semantic search) ---
    if (context.client_id) {
      try {
        const ragQuery = context.rag_query || task  // orchestrator can pass targeted query
        const brainContext = await buildAgentContext({
          client_id: context.client_id,
          query: ragQuery.substring(0, 500),  // limit query length
          match_count: context.rag_match_count || 5,
        })
        if (brainContext) {
          systemParts.push(`\n# Client Brain — Conocimiento del Cliente`)
          systemParts.push(brainContext)
        }
      } catch (ragError) {
        // RAG failure should not block agent execution
        console.warn(`Client Brain RAG failed for client ${context.client_id}:`, ragError)
        systemParts.push(`\n# Client Brain — Nota: búsqueda semántica no disponible (fallback sin contexto)`)
      }
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
    const modelKey = (agentConfig.model as string) || 'claude-sonnet'
    // Support both legacy short keys and registry full names
    const FULL_MODEL_MAP: Record<string, string> = {
      ...MODEL_MAP,
      'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-opus-4-6': 'claude-opus-4-6',
    }
    const modelId = FULL_MODEL_MAP[modelKey] || MODEL_MAP['claude-sonnet']

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
        agent_name: canonicalSlug,
        action: 'agents_run',
        input: {
          task: task.substring(0, 200),
          caller,
          skills_loaded: loadedSkills.map(s => s.name),
          skills_filtered: !!skillsFilter,
          chain_length: context.chain?.length || 0,
          client_brain_enabled: !!context.client_id,
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
      agent: canonicalSlug,
      display_name: (agentConfig.display_name as string) || canonicalSlug,
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
        chain: 'Array<{ agent, output }> (optional) — outputs previos en la pipeline',
        client_id: 'string (optional) — UUID del cliente → activa Client Brain RAG',
        rag_query: 'string (optional) — query específico para búsqueda semántica (default: task)',
        rag_match_count: 'number (optional) — cuántos resultados RAG traer (default: 5)',
        skills_filter: 'string[] (optional) — solo cargar estos skills (reduce tokens)',
        client_industry: 'string (optional) — industria del cliente actual',
        extra: 'object (optional) — contexto adicional',
      },
      caller: 'string (optional) — "n8n" | "jarvis" | "api"',
    },
    note: 'Agent config comes from Supabase only. No filesystem fallbacks.',
  })
}
