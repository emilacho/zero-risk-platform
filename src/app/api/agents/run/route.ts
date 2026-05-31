import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { buildAgentContext } from '@/lib/client-brain'
import { requiresEditorReview, getEditorConfig, PRIMARY_REVIEWER, SECOND_REVIEWER } from '@/lib/editor-routing'
import { runDualReviewMiddleware } from '@/lib/editor-middleware'
import { resolveAgentSlug, isCanonicalSlug } from '@/lib/agent-alias-map'
import { capture } from '@/lib/posthog'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { enrichClientIdFromContext } from '@/lib/client-id-enricher'
import { checkInternalKey } from '@/lib/internal-auth'
import { killSwitch, type InvocationContext } from '@/lib/agent-safety'

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
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

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

    // ── Sprint 8D · workflow_id enforcement (Emilio canon 2026-05-24) ────
    // Symmetric with /api/agents/run-sdk · "agentes solo se invocan vía
    // workflows NUNCA directo". Reject if missing workflow_id /
    // workflow_execution_id (accept top-level OR nested under context).
    // 403 + structured log so spam loops cannot accumulate cost.
    const wfIdCandidate =
      typeof body.workflow_id === 'string' && body.workflow_id.length > 0
        ? (body.workflow_id as string)
        : typeof context.workflow_id === 'string' && context.workflow_id.length > 0
          ? (context.workflow_id as string)
          : null
    const wfExecCandidate =
      typeof body.workflow_execution_id === 'string' && body.workflow_execution_id.length > 0
        ? (body.workflow_execution_id as string)
        : typeof context.workflow_execution_id === 'string' &&
            context.workflow_execution_id.length > 0
          ? (context.workflow_execution_id as string)
          : null
    if (!wfIdCandidate || !wfExecCandidate) {
      const missing = [
        !wfIdCandidate && 'workflow_id',
        !wfExecCandidate && 'workflow_execution_id',
      ].filter(Boolean)
      const callerHint = {
        agent: agentName,
        caller,
        user_agent: request.headers.get('user-agent')?.slice(0, 100) || null,
        x_vercel_id: request.headers.get('x-vercel-id')?.slice(0, 64) || null,
        body_keys: Object.keys(body || {}),
        has_context: !!body.context,
        missing,
      }
      console.warn(
        '[agents/run] REJECTED · workflow_id enforcement · ' + JSON.stringify(callerHint),
      )
      return NextResponse.json(
        {
          error: 'workflow_id_required',
          code: 'E-WF-ID-REQUIRED',
          detail:
            'canon Sprint 8D (Emilio 2026-05-24) · agents only via workflows · ' +
            `missing field(s): ${missing.join(', ')} · ` +
            'pass workflow_id + workflow_execution_id top-level OR nested under context · ' +
            'for ad-hoc smoke tests use the canonical "Smoke Test Agent Invocation" n8n workflow',
        },
        { status: 403 }
      )
    }

    // Sprint 8B B4 · CLAUDE_API_KEY check removed · LLM call moved to Railway
    // agent-runner which owns the Anthropic credential. RAILWAY_AGENT_RUNNER_URL
    // gate happens later in the LLM-call section.

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

    // --- Sprint 8B B4 · Delegate to Railway agent-runner ---
    // Per master plan · the Anthropic API call + system prompt construction
    // moves to Railway (services/agent-runner) where the Claude Agent SDK
    // binary runs natively + Brain enricher injects client RAG context.
    // This route stays for orchestration concerns · auth / sanitization /
    // smoke mock / Camino III middleware / agent_invocations observability
    // INSERT. The actual LLM work and brain enrichment live one hop down.
    capture('agent_run_invoked', String(resolvedClientId || 'system'), {
      agent_slug: canonicalSlug,
      model: (context.model_override as string) || (agentConfig.model as string) || 'claude-sonnet',
      client_id: resolvedClientId,
      has_pipeline_id: !!context.pipeline_id,
    })

    // ── PR #128 v2 · agent-safety SHADOW mount (Sprint 11 Ola 1 Track 1) ──
    // Symmetric con /api/agents/run-sdk · killSwitch corre las 3 gates en
    // SHADOW · audit row a agent_safety_audit · NO bloquea producción.
    //
    // Spec · SPEC-PR-128-ADR-008-EXTENDED-SHADOW-MODE-v2.md §3.2
    // Honest §148 · este route YA tiene hard 403 §149 enforcement (línea
    // ~127) · killSwitch shadow se ejecuta DESPUÉS · audita gates 2-3
    // (idempotency + rate_limit) para baseline 7-day pre-enforce flip.
    try {
      const safetyCtx: InvocationContext = {
        workflow_id: wfIdCandidate,
        workflow_execution_id: wfExecCandidate,
        client_id: resolvedClientId ?? null,
        agent_id: canonicalSlug,
        task,
        tool_name: undefined,
        estimated_cost_usd: undefined,
        caller: (caller as InvocationContext['caller']) ?? 'api',
        request_id:
          (context.request_id as string | undefined) ??
          (context.idempotency_key as string | undefined),
      }
      await killSwitch(safetyCtx, supabase, '/api/agents/run')
    } catch (e) {
      // Fail-open · NO bloquear prod por bug propio middleware (canon §148).
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[agents-run] killSwitch shadow uncaught · fail-open:', msg)
    }

    const railwayUrl = process.env.RAILWAY_AGENT_RUNNER_URL
    if (!railwayUrl) {
      console.error('[agents-run] RAILWAY_AGENT_RUNNER_URL not configured · Sprint 8B requires Railway proxy')
      return NextResponse.json(
        { error: 'agent-runner not configured', code: 'E-RUNNER-MISSING' },
        { status: 503 },
      )
    }
    const internalKey = process.env.INTERNAL_API_KEY ?? ''

    const railwayResp = await fetch(`${railwayUrl.replace(/\/+$/, '')}/run-sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-auth': internalKey,
      },
      body: JSON.stringify({
        agentName: canonicalSlug,
        task,
        clientId: resolvedClientId ?? null,
        pipelineId: (context.pipeline_id as string | null) ?? null,
        stepName: (context.step_name as string | null) ?? null,
        extra: (context.extra as Record<string, unknown> | undefined) ?? undefined,
      }),
      signal: AbortSignal.timeout(290_000),
    })

    if (!railwayResp.ok) {
      const errText = await railwayResp.text().catch(() => '')
      return NextResponse.json(
        { error: `agent-runner upstream failed: ${railwayResp.status}`, details: errText.slice(0, 500) },
        { status: 502 },
      )
    }

    interface RailwayResult {
      success: boolean
      response?: string
      sessionId?: string | null
      inputTokens?: number
      outputTokens?: number
      costUsd?: number
      durationMs?: number
      model?: string
      brainEnrichment?: {
        brain_hit: boolean
        brain_chunks_count: number
        brain_query_ms: number
        brain_cost_usd: number
        brain_error?: string
      }
      cacheMetrics?: {
        cache_creation_input_tokens: number
        cache_read_input_tokens: number
        cache_creation_5m_tokens: number
        cache_creation_1h_tokens: number
      }
      error?: string
    }
    const railwayData = (await railwayResp.json()) as RailwayResult
    if (!railwayData.success) {
      return NextResponse.json(
        { error: railwayData.error || 'agent-runner returned success=false' },
        { status: 500 },
      )
    }
    const responseText = railwayData.response ?? ''
    const inputTokens = railwayData.inputTokens ?? 0
    const outputTokens = railwayData.outputTokens ?? 0
    const tokensUsed = inputTokens + outputTokens
    const costUsd = railwayData.costUsd ?? 0
    const durationMs = railwayData.durationMs ?? Date.now() - startTime
    const modelId = railwayData.model ?? 'unknown'
    const brainEnrichmentMeta = railwayData.brainEnrichment
    const cacheMetricsMeta = railwayData.cacheMetrics
    const endedAt = new Date()
    const startedAt = new Date(startTime)
    // Sprint 8B B4 · system prompt construction moved to Railway · we no
    // longer have local visibility. Set to null in INSERT. Operators wanting
    // exact prompt persistence query `agents_log.output` on Railway-side row
    // (B2 fixes silent INSERT swallow · once landed agents_log gets the prompt).
    const claudeData: { id?: string; stop_reason?: string | null; usage?: Record<string, number> } = {}

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

    // Sprint 7.7 Track D2 · client_id late-binding enrichment.
    // Si body NO trajo client_id but FK columns (workflow_execution_id ·
    // journey_id · task_id · session_id) están presentes · DB lookup chain
    // recovers cliente attribution. Cierra 23.5% billing gap del rollup audit.
    const taskIdForInsert =
      (context.pipeline_id as string | null) || (context.task_id as string | null) || null
    const workflowExecutionIdForInsert = (context.workflow_execution_id as string | null) || null
    const journeyIdForInsert =
      (context.journey_id as string | null) || (context._journey_id as string | null) || null
    const sessionIdForInsert =
      (claudeData?.id as string | undefined) || `run-${startTime}-${Math.random().toString(36).slice(2, 8)}`
    const enrichment = await enrichClientIdFromContext(supabase, resolvedClientId, {
      workflow_execution_id: workflowExecutionIdForInsert,
      journey_id: journeyIdForInsert,
      task_id: taskIdForInsert,
      session_id: sessionIdForInsert,
    }).catch(() => ({ client_id: resolvedClientId, source: 'none' as const, attempted_lookups: [] }))
    const enrichedClientId = enrichment.client_id

    void supabase
      .from('agent_invocations')
      .insert({
        session_id: sessionIdForInsert,
        agent_id: canonicalSlug,
        agent_name: (agentConfig.display_name as string) || canonicalSlug,
        command: null,
        task_id: taskIdForInsert,
        workflow_id: (context.workflow_id as string | null) || null,
        workflow_execution_id: workflowExecutionIdForInsert,
        client_id: enrichedClientId,
        journey_id: journeyIdForInsert,
        model: modelId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        cost_usd: costUsd,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        // Sprint 8 cache observability · top-level columns mirror the JSONB
        // metadata. Source · Railway response cacheMetrics (post Sprint 8B B4
        // proxy refactor · claudeData stub is no longer populated locally).
        tokens_cache_read: cacheMetricsMeta?.cache_read_input_tokens ?? 0,
        tokens_cache_creation: cacheMetricsMeta?.cache_creation_input_tokens ?? 0,
        num_turns: 1,
        status: 'completed',
        exit_code: 0,
        error_message: null,
        // Sprint 8B B4 · system_prompt persists on Railway-side `agents_log`
        // (which now includes the actual prompt sent to the model + brain
        // enrichment). Local Vercel build was dropped to honor "zero prompt
        // construction" canon · NULL here is the correct semantic.
        system_prompt: null,
        metadata: {
          source: 'api_agents_run',
          caller,
          task_text: task.substring(0, 200),
          skills_loaded: loadedSkills.map(s => s.name).slice(0, 20),
          response_length: responseText.length,
          stop_reason: claudeData?.stop_reason || null,
          // Sprint 7.7 Track D2 · provenance del client_id final
          client_id_resolution: {
            source: enrichment.source,
            attempted_lookups: enrichment.attempted_lookups,
          },
          // Sprint 8B B3 · brain enrichment runtime evidence · sourced from
          // Railway response. brain_hit=false when clientId missing OR brain
          // empty for client. Closes the 6-gap audit (CC#2 A8).
          ...(brainEnrichmentMeta
            ? {
                brain_hit: brainEnrichmentMeta.brain_hit,
                brain_chunks_count: brainEnrichmentMeta.brain_chunks_count,
                brain_query_ms: brainEnrichmentMeta.brain_query_ms,
                brain_cost_usd: brainEnrichmentMeta.brain_cost_usd,
                ...(brainEnrichmentMeta.brain_error
                  ? { brain_error: brainEnrichmentMeta.brain_error }
                  : {}),
              }
            : {}),
          // Sprint 8 prompt-caching observability · Agent SDK auto-caches
          // (per upstream #188 · 1h TTL default) · counters surface the
          // hit/write split so cost rollups reflect the 90% cache-read
          // discount. Zero values when SDK didn't cache (first-time call,
          // prefix < 1024 tokens, or smoke-mock path early-return).
          ...(cacheMetricsMeta
            ? {
                cache_creation_input_tokens: cacheMetricsMeta.cache_creation_input_tokens,
                cache_read_input_tokens: cacheMetricsMeta.cache_read_input_tokens,
                cache_creation_5m_tokens: cacheMetricsMeta.cache_creation_5m_tokens,
                cache_creation_1h_tokens: cacheMetricsMeta.cache_creation_1h_tokens,
              }
            : {}),
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
