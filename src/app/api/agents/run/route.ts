import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { buildAgentContext } from '@/lib/client-brain'
import { requiresEditorReview, getEditorConfig, PRIMARY_REVIEWER, SECOND_REVIEWER } from '@/lib/editor-routing'
import { runDualReviewMiddleware } from '@/lib/editor-middleware'
import { resolveAgentSlug, isCanonicalSlug } from '@/lib/agent-alias-map'
import { capture } from '@/lib/posthog'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'

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

// USD per token by canonical model id. Anthropic 2026 list prices.
// Fallback for unknown ids uses Sonnet rates so we never silently report $0
// when tokens > 0 (the bug LOTE-C blind dry-run surfaced: hardcoded cost_usd=0
// downstream broke cost-alerts cron + /agents/stats + /costs end-to-end).
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7':            { in: 15 / 1_000_000, out: 75 / 1_000_000 },
  'claude-opus-4-6':            { in: 15 / 1_000_000, out: 75 / 1_000_000 },
  'claude-sonnet-4-6':          { in:  3 / 1_000_000, out: 15 / 1_000_000 },
  'claude-haiku-4-5-20251001':  { in:  1 / 1_000_000, out:  5 / 1_000_000 },
}

function computeCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING['claude-sonnet-4-6']
  return inputTokens * pricing.in + outputTokens * pricing.out
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    // Tolerate multiple agent-name field variants (research-generated workflows
    // use agent_id, agent_slug, agent_name, etc). Fall back through common names
    // so n8n doesn't need a rewrite every time someone ships a new workflow.
    const agentName = sanitizeString(
      body.agent || body.agent_id || body.agent_slug || body.agent_name || body.slug,
      50
    )
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

    // LOTE-C Fix 8b · multi-path client_id resolver · symmetric to /api/agents/run-sdk
    // (PR #16 · `src/lib/client-id-resolver.ts`). Production n8n workflows send
    // `client_id` at top-level (NOT nested under `context`), so the legacy
    // `context.client_id` read fell through to NULL on every invocation.
    // 36/36 agent_invocations rows landed with client_id=NULL pre-fix.
    // Resolver chain · first non-empty string wins · null fallback preserves
    // existing behavior for payloads with no client_id anywhere.
    const resolvedClientId =
      resolveClientIdFromBody(body) ??
      (typeof context.client_id === 'string' && context.client_id.length > 0
        ? (context.client_id as string)
        : null)

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

    // 0a. Static alias resolution (no DB round-trip).
    //     Converts ghost/legacy slugs (snake_case, semantic aliases) to canonical
    //     MANIFEST-31 kebab-case slugs before any registry lookup.
    const resolvedAgentName = resolveAgentSlug(agentName)
    if (resolvedAgentName !== agentName && !isCanonicalSlug(agentName)) {
      console.info(`[agents/run] ghost slug resolved: "${agentName}" → "${resolvedAgentName}"`)
      capture('ghost_slug_resolved', 'system', { input_slug: agentName, canonical_slug: resolvedAgentName })
    }

    // 0b. Resolve alias → canonical slug via managed_agents_registry.
    //    n8n workflows may send legacy snake_case slugs (e.g. "backlink_strategist");
    //    the registry maps them to the canonical kebab-case slug.
    //    Registry is the source of truth for identity_md (production-safe).
    let canonicalSlug = resolvedAgentName
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
        .or(`slug.eq.${resolvedAgentName},aliases.cs.{"${resolvedAgentName}"}`)
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
    if (resolvedClientId) {
      try {
        const ragQuery = context.rag_query || task  // orchestrator can pass targeted query
        const brainContext = await buildAgentContext({
          client_id: resolvedClientId,
          query: ragQuery.substring(0, 500),  // limit query length
          match_count: context.rag_match_count || 5,
        })
        if (brainContext) {
          systemParts.push(`\n# Client Brain — Conocimiento del Cliente`)
          systemParts.push(brainContext)
        }
      } catch (ragError) {
        // RAG failure should not block agent execution
        console.warn(`Client Brain RAG failed for client ${resolvedClientId}:`, ragError)
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

    // --- SMOKE TEST MOCK MODE ---
    // When the caller is obviously a smoke test — identified by any of:
    //   - header  x-smoke-test: 1
    //   - context.smoke_test === true  or  context.test_run === true
    //   - client_id starts with "smoke-" (default from harness fixtures)
    // we skip the Claude call entirely and return a deterministic mock response.
    // This keeps workflow smoke validation cost at $0 while still exercising
    // every HTTP hop, n8n connection graph, and Supabase write in the pipeline.
    const smokeHeader = request.headers.get('x-smoke-test') === '1'
    // Smoke detection uses the resolved id so callers that nest client_id under
    // metadata / client.id / extra.client_id still trigger smoke-mode when their
    // resolved value starts with the smoke- prefix.
    const clientId = resolvedClientId ?? ''
    const isSmokeTest =
      smokeHeader ||
      context.smoke_test === true ||
      context.test_run === true ||
      clientId.startsWith('smoke-') ||
      clientId === 'smoke-test'

    if (isSmokeTest) {
      const mockText = `[smoke mock] ${canonicalSlug} responded. task=${(task || '').slice(0, 60)}`
      // Flatten every place a workflow might have stuffed input data (body top-level,
      // context, extra, extra.brief) so that `$json.X` still resolves downstream in
      // any of the 45 workflows we test.
      const echoedBody: Record<string, unknown> = {}
      // mergeScalars accepts object OR JSON string (workflows often pass
      // `"brief": "{{ JSON.stringify($json) }}"` which arrives as a string).
      const mergeScalars = (src: unknown) => {
        let obj: Record<string, unknown> | null = null
        if (src && typeof src === 'object') {
          obj = src as Record<string, unknown>
        } else if (typeof src === 'string' && src.startsWith('{')) {
          try { const parsed = JSON.parse(src); if (parsed && typeof parsed === 'object') obj = parsed } catch {}
        }
        if (!obj) return
        for (const [k, v] of Object.entries(obj)) {
          if (k === 'agent' || k === 'task' || k === 'task_type' || k === 'context') continue
          if (echoedBody[k] !== undefined) continue
          echoedBody[k] = v
        }
      }
      mergeScalars(body)
      mergeScalars(context)
      const bodyRec = body as Record<string, unknown>
      mergeScalars(bodyRec.extra)
      const extra = bodyRec.extra as Record<string, unknown> | undefined
      mergeScalars(extra?.brief)
      mergeScalars(extra?.payload)
      mergeScalars(extra?.input)
      mergeScalars(extra?.request)

      return NextResponse.json({
        // Echo passes through user-provided fields (duration_s, client_id, campaign_brief, etc.)
        ...echoedBody,
        // Claude-style response envelope
        success: true,
        agent: canonicalSlug,
        display_name: (agentConfig.display_name as string) || canonicalSlug,
        model: 'mock',
        response: mockText,
        output: mockText,
        result: mockText,
        tokens_used: 0,
        input_tokens: 0,
        output_tokens: 0,
        duration_ms: 0,
        cost_usd: 0,
        skills_loaded: [],
        mock: true,
        // Structured fields some workflows downstream read directly from .json:
        issues: [],
        verdict: 'PASS',
        severity: 'low',
        classification_type: 'straightforward',
        success_criteria: [],
        assigned_agents: [canonicalSlug],
        task_breakdown: [],
        variants: [],
        editor_review: { verdict: 'PASS', issues: [] },
        // Video Pipeline / Creative Director fields:
        seedance_prompt: mockText,
        storyboard: [],
        scenes: [],
        script: mockText,
        // RSA / Headlines fields:
        headlines: ['[smoke] A', '[smoke] B', '[smoke] C'],
        descriptions: ['[smoke] desc'],
        // Review / Moderation fields:
        rating: 3,
        sentiment: 'neutral',
        // Routing fields (RUFLO):
        complexity: 'low',
        route: 'direct',
        // Ad Creative / Message-Match Validator fields — default to high match
        // so smoke tests deterministically hit the approved branch.
        match_score: 85,
        required_actions: [],
        flags: [],
        // Community / Subject-line fields
        publish_urgency: 'low',
        authenticity_score: 85,
        authenticity_verdict: 'authentic',
      })
    }

    // --- Call Claude API ---
    // Model resolution: context.model_override > registry model > sonnet fallback
    // model_override lets smoke tests force Haiku (4x cheaper) without editing the registry.
    capture('agent_run_invoked', String(resolvedClientId || 'system'), {
      agent_slug: canonicalSlug,
      model: (context.model_override as string) || (agentConfig.model as string) || 'claude-sonnet',
      client_id: resolvedClientId,
      has_pipeline_id: !!context.pipeline_id,
    })
    const modelKey = (context.model_override as string) || (agentConfig.model as string) || 'claude-sonnet'
    const FULL_MODEL_MAP: Record<string, string> = {
      ...MODEL_MAP,
      'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
      'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-opus-4-6': 'claude-opus-4-6',
    }
    const modelId = FULL_MODEL_MAP[modelKey] || MODEL_MAP['claude-sonnet']

    // max_tokens cap: context can lower it (smoke tests should cap around 50-200).
    // Never exceed 4096 to avoid runaway cost from a misbehaving agent.
    const requestedMaxTokens = typeof context.max_tokens === 'number' ? context.max_tokens : 4096
    const maxTokens = Math.max(1, Math.min(4096, requestedMaxTokens))

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
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
    const costUsd = computeCostUsd(modelId, inputTokens, outputTokens)
    const endedAt = new Date()
    const startedAt = new Date(startTime)

    capture('agent_run_completed', String(resolvedClientId || 'system'), {
      agent_slug: canonicalSlug,
      success: true,
      duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    })

    // --- Log execution · dual-write ---
    // 1. legacy `agents_log` table (kept for backwards-compat · CC#3 can consolidate later)
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
          client_brain_enabled: !!resolvedClientId,
        },
        output: {
          response_length: responseText.length,
          model: modelId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
        status: 'success',
        duration_ms: durationMs,
        cost: costUsd,
      })
    } catch {
      // Don't fail the request if logging fails
    }

    // 2. canonical `agent_invocations` table (Sprint #4 Fase A · MC /agents/stats + /costs consume this)
    // Bridge for production traffic: daemon doesn't run in Railway (no claude CLI) so this is the only
    // path that feeds observability dashboards. Schema reference:
    // mission-control/mission-control/supabase/migrations/2026051401_create_agent_invocations.sql
    // Fire-and-forget · request must not fail if observability insert breaks.
    void supabase
      .from('agent_invocations')
      .insert({
        session_id: (claudeData?.id as string | undefined) || `run-${startTime}-${Math.random().toString(36).slice(2, 8)}`,
        agent_id: canonicalSlug,
        agent_name: (agentConfig.display_name as string) || canonicalSlug,
        command: null,
        task_id: (context.pipeline_id as string | null) || (context.task_id as string | null) || null,
        workflow_id: (context.workflow_id as string | null) || null,
        workflow_execution_id: (context.workflow_execution_id as string | null) || null,
        client_id: resolvedClientId,
        journey_id: (context.journey_id as string | null) || (context._journey_id as string | null) || null,
        model: modelId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        cost_usd: costUsd,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        tokens_cache_read: (claudeData?.usage?.cache_read_input_tokens as number) || 0,
        tokens_cache_creation: (claudeData?.usage?.cache_creation_input_tokens as number) || 0,
        num_turns: 1,
        status: 'completed',
        exit_code: 0,
        error_message: null,
        metadata: {
          source: 'api_agents_run',
          caller,
          task_text: task.substring(0, 200),
          skills_loaded: loadedSkills.map(s => s.name).slice(0, 20),
          response_length: responseText.length,
          stop_reason: claudeData?.stop_reason || null,
        },
      })
      .then(
        ({ error }) => {
          if (error) {
            // Use console.warn so Vercel logs surface this without failing the request
            console.warn('[agents-run] agent_invocations insert failed:', error.message)
          }
        },
        (err: unknown) => {
          console.warn('[agents-run] agent_invocations insert exception:', err instanceof Error ? err.message : String(err))
        },
      )

    // Base response — may be augmented by dual reviewer middleware below
    const baseResponse = {
      success: true,
      agent: canonicalSlug,
      display_name: (agentConfig.display_name as string) || canonicalSlug,
      model: modelId,
      response: responseText,
      output: responseText,
      result: responseText,
      tokens_used: tokensUsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      skills_loaded: loadedSkills.map(s => s.name),
    }

    // DUAL REVIEWER MIDDLEWARE — skip for reviewers themselves, skip header, non-whitelisted
    const skipMiddleware =
      request.headers.get('x-skip-editor-middleware') === '1' ||
      canonicalSlug === PRIMARY_REVIEWER ||
      canonicalSlug === SECOND_REVIEWER ||
      !requiresEditorReview(canonicalSlug)

    if (skipMiddleware) {
      return NextResponse.json(baseResponse)
    }

    const editorConfig = getEditorConfig(canonicalSlug)!
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${request.headers.get('host') || 'localhost:3000'}`

    try {
      const middlewareResult = await runDualReviewMiddleware({
        agentSlug: canonicalSlug,
        content: responseText,
        task,
        context: context as Record<string, unknown>,
        config: editorConfig,
        supabase,
        baseUrl,
        // LOTE-C Fix 8c · propagate resolved client_id to Camino III
        // reviewers so their `agent_invocations` rows also land populated.
        clientId: resolvedClientId,
      })

      return NextResponse.json({ ...baseResponse, ...middlewareResult })
    } catch (middlewareError) {
      // Middleware failure is non-blocking — return original response with error note
      console.error('[Editor Middleware] Failed:', middlewareError)
      return NextResponse.json({
        ...baseResponse,
        editor_review: { verdict: 'middleware_error', severity: 'low' },
      })
    }
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
