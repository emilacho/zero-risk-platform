/**
 * Zero Risk — Agent SDK Runner (V3, Sesión 19)
 *
 * Reemplazo de la llamada directa a /v1/messages por @anthropic-ai/claude-agent-sdk.
 *
 * Diferencias clave vs el runner anterior (src/app/api/agents/run/route.ts):
 *
 *  1. Sesiones persistentes — cada ejecución puede reanudar un session_id
 *     previo, lo que permite encadenar pasos del pipeline sin re-enviar el
 *     system prompt completo (ahorro de tokens + contexto natural).
 *
 *  2. Subagentes declarativos — los 27 agentes de Zero Risk se declaran como
 *     AgentDefinition y el SDK gestiona el aislamiento de contexto.
 *
 *  3. Hooks nativos — podemos pausar en PostToolUse para HITL, registrar
 *     telemetría en PreToolUse, etc., sin parchar el cliente HTTP.
 *
 *  4. MCP servers — Client Brain se expone como MCP server (ver
 *     src/lib/mcp/client-brain-server.ts) en vez de inyectarse como texto.
 *
 *  Nota de runtime: el SDK spawnea el CLI `claude` como subproceso, por lo
 *  que la ruta que lo consume DEBE declarar `runtime = "nodejs"` y el host
 *  debe tener el binario disponible (ver README del refactor).
 */

import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveAgentSlug, isCanonicalSlug } from '@/lib/agent-alias-map'

// ---------- Tipos públicos ----------

export interface AgentRunInput {
  /** Nombre del agente en tabla `agents` (e.g. "jefe-marketing"). */
  agentName: string
  /** Instrucción de la tarea (equivale al user message). */
  task: string
  /** Si se provee, reanuda la sesión SDK previa — encadena contexto. */
  resumeSessionId?: string | null
  /** ID del cliente → activa Client Brain MCP. */
  clientId?: string | null
  /** ID del pipeline — se propaga a hooks y logs. */
  pipelineId?: string | null
  /** Nombre del step (para logs). */
  stepName?: string | null
  /** Extra para system prompt. */
  extra?: Record<string, unknown>
}

export interface AgentRunResult {
  success: boolean
  response: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  model: string
  error?: string
}

// ---------- Model mapping ----------

// Accepts both the legacy short keys (used by the `agents` table) and the
// full model IDs stored in `managed_agents_registry.default_model` (which is
// constrained by CHECK to {claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6}).
const MODEL_MAP: Record<string, string> = {
  // legacy short keys
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-opus': 'claude-opus-4-6',
  // registry full names
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-6': 'claude-opus-4-6',
}

// Precios (USD / 1M tokens) Sonnet 4.6 — ajustar por modelo si hace falta
const COST_PER_M = {
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  opus: { input: 15, output: 75 },
}

function costFor(model: string, inTok: number, outTok: number): number {
  const key = model.includes('haiku') ? 'haiku' : model.includes('opus') ? 'opus' : 'sonnet'
  const p = COST_PER_M[key as keyof typeof COST_PER_M]
  return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output
}

// ---------- Runner principal ----------

export async function runAgentViaSDK(input: AgentRunInput): Promise<AgentRunResult> {
  const startedAt = Date.now()
  const supabase = getSupabaseAdmin()

  // 0a. Static alias resolution (no DB round-trip).
  const resolvedName = resolveAgentSlug(input.agentName)
  if (resolvedName !== input.agentName && !isCanonicalSlug(input.agentName)) {
    console.info(`[agent-sdk-runner] ghost slug resolved: "${input.agentName}" → "${resolvedName}"`)
  }

  // 0b. Resolve alias → canonical slug via managed_agents_registry.
  //    The registry is the source of truth for identity_md (production-safe,
  //    no filesystem reads on Vercel).
  let canonicalSlug = resolvedName
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
      .or(`slug.eq.${resolvedName},aliases.cs.{"${resolvedName}"}`)
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

  // 1. Try the legacy `agents` table (still authoritative for the 27 agents
  //    seeded in V1/V2 with proper identity_content + skills wiring).
  let { data: agentCfg } = await supabase
    .from('agents')
    .select('*')
    .eq('name', canonicalSlug)
    .maybeSingle()

  // 1b. Fallback: synthesize a minimal config from the registry row.
  //     identity_md must be populated by `scripts/sync-registry-identities.ts`
  //     before deploying — otherwise we error out cleanly.
  if (!agentCfg && registryRow?.identity_md) {
    agentCfg = {
      id: null,
      name: registryRow.slug,
      display_name: registryRow.display_name,
      identity_content: registryRow.identity_md,
      model: registryRow.default_model,
    }
  }

  if (!agentCfg) {
    const hint = registryRow
      ? `registry row exists but identity_md is empty — run scripts/sync-registry-identities.ts`
      : `slug not found in registry`
    return fail(`Agent "${input.agentName}" (resolved to "${canonicalSlug}") not loadable: ${hint}`, startedAt)
  }

  if (!agentCfg.identity_content || agentCfg.identity_content.startsWith('Loaded from filesystem')) {
    return fail(`Agent "${canonicalSlug}" has no identity_content loaded`, startedAt)
  }

  const { data: skillRows } = agentCfg.id
    ? await supabase
        .from('agent_skill_assignments')
        .select('priority, agent_skills(skill_name, skill_content)')
        .eq('agent_id', agentCfg.id)
        .order('priority', { ascending: true })
    : { data: [] as Array<{ priority: number; agent_skills: { skill_name: string; skill_content: string } | { skill_name: string; skill_content: string }[] }> }

  const skills: { name: string; content: string }[] = []
  for (const sa of skillRows ?? []) {
    const skill = Array.isArray(sa.agent_skills) ? sa.agent_skills[0] : sa.agent_skills
    if (!skill?.skill_content) continue
    if (skill.skill_content.startsWith('Loaded from filesystem')) continue
    skills.push({ name: skill.skill_name, content: skill.skill_content })
  }

  // 2. Armar system prompt (identidad + skills + contexto de agencia).
  const systemParts = [
    `# Tu Identidad\n${agentCfg.identity_content}`,
    ...skills.map(s => `\n# Skill: ${s.name}\n${s.content}`),
    `\n# Contexto de Operación`,
    `- Agencia: Zero Risk (agencia de negocios agéntica — sirve cualquier industria)`,
    `- Idioma: Español`,
    input.pipelineId ? `- Pipeline ID: ${input.pipelineId}` : '',
    input.stepName ? `- Step: ${input.stepName}` : '',
    input.extra ? `- Extra: ${JSON.stringify(input.extra)}` : '',
  ].filter(Boolean)

  const systemPrompt = systemParts.join('\n')

  // 3. Configurar opciones del SDK.
  const modelKey = agentCfg.model || 'claude-sonnet'
  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP['claude-sonnet']

  const options: Options = {
    // Reemplazamos el system prompt default del SDK por el nuestro.
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt },
    model: modelId,
    // Solo lectura + búsqueda; los agentes no editan archivos locales.
    allowedTools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    permissionMode: 'default',
    // Reanudar sesión previa para encadenar contexto entre pasos del pipeline.
    ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
    // MCP servers: Client Brain se conecta si hay clientId.
    mcpServers: input.clientId
      ? {
          'client-brain': {
            type: 'stdio',
            command: 'node',
            args: [
              require('path').resolve(process.cwd(), 'src/lib/mcp/client-brain-server.js'),
            ],
            env: {
              CLIENT_ID: input.clientId,
              SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
              SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
              // Inherit PATH for node resolution
              PATH: process.env.PATH || '',
            },
          },
        }
      : {},
  }

  // 4. Ejecutar query y drenar el stream.
  let responseText = ''
  let sessionId: string | null = null
  let inputTokens = 0
  let outputTokens = 0

  try {
    const stream = query({ prompt: input.task, options })

    for await (const msg of stream as AsyncIterable<SDKMessage>) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id
      } else if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') responseText += block.text
        }
      } else if (msg.type === 'result') {
        inputTokens = msg.usage?.input_tokens ?? 0
        outputTokens = msg.usage?.output_tokens ?? 0
        sessionId = sessionId || msg.session_id
      }
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'SDK error', startedAt)
  }

  const durationMs = Date.now() - startedAt
  const costUsd = costFor(modelId, inputTokens, outputTokens)

  // 5. Log ejecución (best-effort).
  supabase
    .from('agents_log')
    .insert({
      agent_name: canonicalSlug,
      action: 'agent_sdk_run',
      input: {
        task: input.task.substring(0, 200),
        pipeline_id: input.pipelineId,
        step_name: input.stepName,
        resumed: !!input.resumeSessionId,
        skills_loaded: skills.map(s => s.name),
      },
      output: {
        response_length: responseText.length,
        model: modelId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        session_id: sessionId,
      },
      status: 'success',
      duration_ms: durationMs,
      cost: costUsd,
    })
    .then(() => { /* best-effort log */ })

  return {
    success: true,
    response: responseText,
    sessionId,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    model: modelId,
  }
}

function fail(message: string, startedAt: number): AgentRunResult {
  return {
    success: false,
    response: '',
    sessionId: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: Date.now() - startedAt,
    model: 'unknown',
    error: message,
  }
}
