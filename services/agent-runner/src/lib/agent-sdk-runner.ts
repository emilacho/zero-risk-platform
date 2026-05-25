/**
 * Zero Risk · Agent SDK Runner · Railway copy
 *
 * Mirror of zero-risk-platform/src/lib/agent-sdk-runner.ts adapted for this
 * standalone Express service. Differences vs the Vercel copy:
 *
 *   - `@/lib/...` Next.js path aliases replaced with relative ESM imports
 *     (`./supabase.js`, `./agent-alias-map.js`).
 *   - Inline `require('path').resolve(...)` for the MCP server arg replaced
 *     by a top-level `import { resolve as pathResolve } from 'node:path'`,
 *     since this service runs as ESM (`"type":"module"` in package.json).
 *   - No Vercel/NFT escape hatches — Railway installs the SDK's optional
 *     linux-x64 native binary cleanly via pnpm, so the SDK's own
 *     `createRequire(import.meta.url).resolve(...)` works as designed.
 *
 * Everything else (model mapping, Supabase queries, system prompt assembly,
 * stream draining, cost computation, logging) is byte-identical to the
 * Vercel copy. Keep in sync until a shared package factors this out.
 */

import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { getSupabaseAdmin } from './supabase.js'
import { resolveAgentSlug, isCanonicalSlug } from './agent-alias-map.js'
import { buildMcpServers } from './agent-mcp-registry.js'
import { insertWithRetry } from './agents-log-retry.js'
import { insertAgentInvocationWithRetry } from './agent-invocations-log.js'
import { callSdkWithRetry } from './sdk-call-retry.js'

// Local message shapes — the SDK's d.ts has internal type errors that cause
// `msg.message`, `msg.usage`, etc. to collapse to `{}`. We re-declare the
// fields we actually consume so strict mode can verify access.
type SDKSystemInitMessage = {
  type: 'system'
  subtype: 'init'
  session_id?: string
}
type SDKAssistantBlock = { type: string; text?: string }
type SDKAssistantStreamMessage = {
  type: 'assistant'
  message?: { content?: SDKAssistantBlock[] }
}
type SDKResultStreamMessage = {
  type: 'result'
  session_id?: string
  /**
   * Sprint 8 prompt-caching observability · the Agent SDK auto-enables
   * Anthropic prompt caching (per upstream issue
   * anthropics/claude-agent-sdk-typescript#188 · defaults to 1h TTL). The
   * underlying API responses include cache_creation + cache_read counters
   * which we now extract for cost-rollup visibility. SDK currently does
   * NOT expose breakpoint control · we observe what the SDK chose to cache.
   */
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
    cache_creation?: {
      ephemeral_5m_input_tokens?: number
      ephemeral_1h_input_tokens?: number
    }
  }
}
type SDKStreamMessage =
  | SDKSystemInitMessage
  | SDKAssistantStreamMessage
  | SDKResultStreamMessage
  | { type: string }

// `query` from the SDK accepts `{ prompt, options }` but the SDK's d.ts has
// collapsed return inference. We type the call-site explicitly.
type QueryParams = { prompt: string; options: Options }
type QueryFn = (p: QueryParams) => AsyncIterable<SDKMessage>

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
  /**
   * Sprint 8D workflow attribution (Emilio canon 2026-05-24 · "agentes
   * solo se invocan vía workflows"). Forwarded by the Vercel proxy after
   * enforcement gate · runner persists on `agents_log.input` + (when DB
   * column exists) `agent_invocations.workflow_id` / `_execution_id` so
   * every invocation is auditable to its originating workflow.
   */
  workflowId?: string | null
  workflowExecutionId?: string | null
  /** Extra para system prompt. */
  extra?: Record<string, unknown>
}

/**
 * Brain enrichment metadata surfaced in the agent run result so the Vercel
 * proxy + observability writers can persist it on the canonical
 * agent_invocations.metadata + agents_log.output rows. Sprint 8B B3.
 */
/**
 * Sprint 8 cache observability metadata · surfaced on AgentRunResult so the
 * Vercel proxy can persist it in agent_invocations.metadata. SDK auto-caches
 * (per upstream issue #188 · 1h TTL default) · zero values when prefix below
 * model's 1024-token cache threshold OR SDK chose not to cache.
 */
export interface CacheMetricsMeta {
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  cache_creation_5m_tokens: number
  cache_creation_1h_tokens: number
}

export interface BrainEnrichmentResultMeta {
  brain_hit: boolean
  brain_chunks_count: number
  brain_query_ms: number
  brain_cost_usd: number
  brain_error?: string
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
  /**
   * Sprint 8B · brain enrichment metadata. Always present (zero values when
   * clientId missing OR brain empty for client). Vercel proxy forwards this
   * to agent_invocations.metadata.brain_chunks_count etc.
   */
  brainEnrichment: BrainEnrichmentResultMeta
  /**
   * Sprint 8 prompt-cache observability · always present · zero values when
   * the SDK does not cache (prefix below 1024 tokens · or first-time call).
   */
  cacheMetrics: CacheMetricsMeta
  error?: string
}

// ---------- Model mapping ----------

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

/**
 * @internal Exported for unit testing. Not part of the public API.
 *
 * Sprint 8 · cache-aware cost. Anthropic prompt caching pricing per docs ·
 *   - regular input · 1.0× base
 *   - cache_read    · 0.1× base (90% off · the win)
 *   - cache write 5m TTL · 1.25× base
 *   - cache write 1h TTL · 2.0× base
 *
 * `inTok` from `usage.input_tokens` is the REGULAR input (Anthropic excludes
 * cached portions from this number). Cache reads / writes are billed via the
 * separate counters passed here.
 */
export function _costFor(
  model: string,
  inTok: number,
  outTok: number,
  cacheRead = 0,
  cache5mWrite = 0,
  cache1hWrite = 0,
): number {
  const key = model.includes('haiku') ? 'haiku' : model.includes('opus') ? 'opus' : 'sonnet'
  const p = COST_PER_M[key as keyof typeof COST_PER_M]
  const baseIn = p.input / 1_000_000
  return (
    inTok * baseIn +
    outTok * (p.output / 1_000_000) +
    cacheRead * baseIn * 0.1 +
    cache5mWrite * baseIn * 1.25 +
    cache1hWrite * baseIn * 2.0
  )
}

const costFor = _costFor

// ---------- Internal helpers ----------

interface RegistryRow {
  slug: string
  display_name: string
  default_model: string
  identity_md: string | null
}

interface AgentConfig {
  id: string | null
  name: string
  display_name?: string
  identity_content: string
  model?: string
}

interface Skill {
  name: string
  content: string
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

/**
 * Resolve an input agent slug → canonical slug + (optional) registry row.
 * Combines static alias map (no DB) with managed_agents_registry lookup.
 */
async function resolveCanonicalSlug(
  supabase: SupabaseAdmin,
  inputName: string,
): Promise<{ canonicalSlug: string; registryRow: RegistryRow | null }> {
  const resolvedName = resolveAgentSlug(inputName)
  if (resolvedName !== inputName && !isCanonicalSlug(inputName)) {
    console.info(`[agent-sdk-runner] ghost slug resolved: "${inputName}" → "${resolvedName}"`)
  }

  const { data: regRows } = await supabase
    .from('managed_agents_registry')
    .select('slug, display_name, default_model, identity_md, aliases')
    .eq('status', 'active')
    .or(`slug.eq.${resolvedName},aliases.cs.{"${resolvedName}"}`)
    .limit(1)

  const row = regRows?.[0]
  if (!row) {
    return { canonicalSlug: resolvedName, registryRow: null }
  }
  return {
    canonicalSlug: row.slug,
    registryRow: {
      slug: row.slug,
      display_name: row.display_name,
      default_model: row.default_model,
      identity_md: row.identity_md ?? null,
    },
  }
}

/**
 * Load agent config from the legacy `agents` table, with registry fallback.
 * Returns null if neither source has a usable identity_content.
 */
async function loadAgentConfig(
  supabase: SupabaseAdmin,
  canonicalSlug: string,
  registryRow: RegistryRow | null,
): Promise<AgentConfig | null> {
  const { data: dbCfg } = await supabase
    .from('agents')
    .select('*')
    .eq('name', canonicalSlug)
    .maybeSingle()

  if (dbCfg) return dbCfg as AgentConfig

  if (registryRow?.identity_md) {
    return {
      id: null,
      name: registryRow.slug,
      display_name: registryRow.display_name,
      identity_content: registryRow.identity_md,
      model: registryRow.default_model,
    }
  }
  return null
}

/**
 * Load + filter skills from agent_skill_assignments.
 * Drops empty / "Loaded from filesystem" placeholders.
 */
async function loadSkills(supabase: SupabaseAdmin, agentId: string | null): Promise<Skill[]> {
  if (!agentId) return []

  const { data: skillRows } = await supabase
    .from('agent_skill_assignments')
    .select('priority, agent_skills(skill_name, skill_content)')
    .eq('agent_id', agentId)
    .order('priority', { ascending: true })

  const skills: Skill[] = []
  for (const sa of skillRows ?? []) {
    const skill = Array.isArray(sa.agent_skills) ? sa.agent_skills[0] : sa.agent_skills
    if (!skill?.skill_content) continue
    if (skill.skill_content.startsWith('Loaded from filesystem')) continue
    skills.push({ name: skill.skill_name, content: skill.skill_content })
  }
  return skills
}

/**
 * Compose the system prompt from identity + skills + agency context.
 *
 * @internal Exported for unit testing. Not part of the public API.
 */
export function _buildSystemPrompt(
  identity: string,
  skills: Skill[],
  ctx: Pick<AgentRunInput, 'pipelineId' | 'stepName' | 'extra'>,
): string {
  return [
    `# Tu Identidad\n${identity}`,
    ...skills.map(s => `\n# Skill: ${s.name}\n${s.content}`),
    `\n# Contexto de Operación`,
    `- Agencia: Zero Risk (agencia de negocios agéntica — sirve cualquier industria)`,
    `- Idioma: Español`,
    ctx.pipelineId ? `- Pipeline ID: ${ctx.pipelineId}` : '',
    ctx.stepName ? `- Step: ${ctx.stepName}` : '',
    ctx.extra ? `- Extra: ${JSON.stringify(ctx.extra)}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Build the SDK Options object: model, allowedTools, resume, MCP servers.
 */
function buildSdkOptions(
  modelId: string,
  systemPrompt: string,
  input: AgentRunInput,
): Options {
  // SDK's d.ts has internal type errors that collapse `systemPrompt` to
  // `string | undefined`, hiding the documented preset-object form. Build the
  // value first and cast — runtime accepts both shapes per the SDK docs.
  const systemPromptOption = {
    type: 'preset' as const,
    preset: 'claude_code' as const,
    append: systemPrompt,
  }
  return {
    systemPrompt: systemPromptOption as unknown as Options['systemPrompt'],
    model: modelId,
    // Solo lectura + búsqueda; los agentes no editan archivos locales.
    allowedTools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    permissionMode: 'default',
    // Reanudar sesión previa para encadenar contexto entre pasos del pipeline.
    ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
    // MCP servers · canonical registry (Sprint 6 Track C1) covers
    // client-brain (per-cliente) + meta-ads (Brazo 3) + apify · dataforseo
    // · higgsfield via env-gated conditional activation. See
    // `agent-mcp-registry.ts` for the activation matrix and per-agent
    // deny-list. `needsMetaAds()` remains exported below for direct callers
    // (smoke test + lib consumers).
    mcpServers: buildMcpServers({
      agentSlug: input.agentName,
      clientId: input.clientId ?? undefined,
    }),
  }
}

/**
 * Heuristic · which agent slugs benefit from the Pipeboard Meta Ads MCP
 * tool surface (36 tools · accounts · campaigns · adsets · ads · creatives ·
 * insights · targeting search). Matches the 6 Meta-related agents
 * documented in audit `2026-05-18-brazo3-meta-ads-gap-analysis.md` Frente 3.
 */
export function needsMetaAds(input: { agentName: string }): boolean {
  return /media[-_]buyer|paid[-_]social|paid[-_]media|instagram|social[-_]media|community[-_]manager|\bmeta\b/i.test(
    input.agentName,
  )
}

interface StreamDrainResult {
  responseText: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
  /**
   * Sprint 8 cache observability · cache_creation_input_tokens (new writes
   * to cache · paid at write premium) and cache_read_input_tokens (hits ·
   * paid at 10% of base · 90% savings). Zero when SDK does not cache · or
   * when prefix is below the model's 1024-token threshold.
   */
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  cacheCreation5mTokens: number
  cacheCreation1hTokens: number
}

/**
 * Drain the SDK stream and accumulate text + usage stats.
 * Throws on stream error; caller wraps in try/catch.
 */
async function drainStream(stream: AsyncIterable<SDKMessage>): Promise<StreamDrainResult> {
  let responseText = ''
  let sessionId: string | null = null
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationInputTokens = 0
  let cacheReadInputTokens = 0
  let cacheCreation5mTokens = 0
  let cacheCreation1hTokens = 0

  for await (const rawMsg of stream) {
    const msg = rawMsg as SDKStreamMessage
    if (msg.type === 'system' && (msg as SDKSystemInitMessage).subtype === 'init') {
      sessionId = (msg as SDKSystemInitMessage).session_id ?? null
    } else if (msg.type === 'assistant') {
      const content = (msg as SDKAssistantStreamMessage).message?.content
      if (content) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            responseText += block.text
          }
        }
      }
    } else if (msg.type === 'result') {
      const r = msg as SDKResultStreamMessage
      inputTokens = r.usage?.input_tokens ?? 0
      outputTokens = r.usage?.output_tokens ?? 0
      cacheCreationInputTokens = r.usage?.cache_creation_input_tokens ?? 0
      cacheReadInputTokens = r.usage?.cache_read_input_tokens ?? 0
      cacheCreation5mTokens = r.usage?.cache_creation?.ephemeral_5m_input_tokens ?? 0
      cacheCreation1hTokens = r.usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0
      sessionId = sessionId ?? r.session_id ?? null
    }
  }

  return {
    responseText,
    sessionId,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cacheCreation5mTokens,
    cacheCreation1hTokens,
  }
}

/**
 * Persist execution record to `agents_log` with 3-retry exponential backoff.
 *
 * Combined fix · CC#1 B2 (retry · explicit error handling · log visibility)
 * + CC#2 B3 (brain enrichment markers in output JSONB · client_id in input).
 *
 * Previously the `.then(() => {})` with no `.catch()` swallowed both PostgREST
 * 4xx/5xx via `data.error` AND network rejections · `agents_log` had 0 rows
 * total since deploy despite many SDK runs. Failures are now logged to
 * console with attempt number + reason · final unrecoverable failure logged
 * as ERROR with full row preview for post-mortem replay.
 *
 * The output JSONB carries brain enrichment markers (brain_hit ·
 * brain_chunks_count · brain_query_ms · brain_cost_usd · optional
 * brain_error) so the Railway runtime path produces visible runtime evidence
 * of Pilar 2 RAG · matching the agent_invocations.metadata shape the Vercel
 * proxy persists.
 *
 * Still fire-and-forget from the caller's perspective (returns void · the
 * actual work happens in an unawaited IIFE inside insertWithRetry) so SDK
 * run latency is unaffected.
 */
function logExecution(
  supabase: SupabaseAdmin,
  args: {
    canonicalSlug: string
    input: AgentRunInput
    skills: Skill[]
    drain: StreamDrainResult
    modelId: string
    startedAtMs: number
    durationMs: number
    costUsd: number
    brainEnrichment: BrainEnrichmentResultMeta
    cacheMetrics: CacheMetricsMeta
  },
): void {
  const { canonicalSlug, input, skills, drain, modelId, startedAtMs, durationMs, costUsd, brainEnrichment, cacheMetrics } = args
  const row = {
    agent_name: canonicalSlug,
    action: 'agent_sdk_run',
    input: {
      task: input.task.substring(0, 200),
      pipeline_id: input.pipelineId,
      step_name: input.stepName,
      resumed: !!input.resumeSessionId,
      skills_loaded: skills.map(s => s.name),
      client_id: input.clientId ?? null,
      // Sprint 8D workflow attribution · persists in agents_log.input JSONB
      // for spam-loop forensics ("which workflow fired this agent · when").
      workflow_id: input.workflowId ?? null,
      workflow_execution_id: input.workflowExecutionId ?? null,
    },
    output: {
      response_length: drain.responseText.length,
      model: modelId,
      input_tokens: drain.inputTokens,
      output_tokens: drain.outputTokens,
      session_id: drain.sessionId,
      brain_hit: brainEnrichment.brain_hit,
      brain_chunks_count: brainEnrichment.brain_chunks_count,
      brain_query_ms: brainEnrichment.brain_query_ms,
      brain_cost_usd: brainEnrichment.brain_cost_usd,
      ...(brainEnrichment.brain_error ? { brain_error: brainEnrichment.brain_error } : {}),
      // Sprint 8 cache observability · SDK auto-caches with 1h TTL default
      // (per upstream issue #188). Zeros are normal for first-time calls
      // OR when prefix is under the model's 1024-token cache threshold.
      cache_creation_input_tokens: cacheMetrics.cache_creation_input_tokens,
      cache_read_input_tokens: cacheMetrics.cache_read_input_tokens,
      cache_creation_5m_tokens: cacheMetrics.cache_creation_5m_tokens,
      cache_creation_1h_tokens: cacheMetrics.cache_creation_1h_tokens,
    },
    status: 'success',
    duration_ms: durationMs,
    cost_usd: costUsd,
  }
  // Unawaited · caller stays fire-and-forget · helper logs all attempt failures.
  // Sprint 8 follow-up · CC#3 audit · field rename `cost` → `cost_usd` matches
  // canonical agents_log schema · INSERT failed with PGRST204 silently for
  // every SDK run since deploy · B2 fix surfaced via console.error post-merge.
  void insertWithRetry(supabase, row, canonicalSlug)

  // Sprint 8D cuenta #1 closure · dual-write to canonical agent_invocations
  // table so canon enforcement audit query (`workflow_id IS NULL`) and Mission
  // Control dashboards see Railway-direct n8n invocations. Without this, n8n
  // direct path (Sprint 8D Fase 1 bypass) produces success+cost in n8n output
  // but ZERO rows in agent_invocations · audit trail BROKEN. The Vercel proxy
  // route `/api/agents/run` writes here for the CLI path; this matches that
  // shape so dashboards consuming agent_invocations are caller-agnostic.
  const endedAtMs = startedAtMs + durationMs
  const sessionIdForInsert = drain.sessionId ?? `runner-${startedAtMs}-${Math.random().toString(36).slice(2, 8)}`
  const invocationRow: Record<string, unknown> = {
    session_id: sessionIdForInsert,
    agent_id: canonicalSlug,
    agent_name: canonicalSlug,
    command: null,
    task_id: input.pipelineId ?? null,
    workflow_id: input.workflowId ?? null,
    workflow_execution_id: input.workflowExecutionId ?? null,
    client_id: input.clientId ?? null,
    journey_id: null,
    model: modelId,
    started_at: new Date(startedAtMs).toISOString(),
    ended_at: new Date(endedAtMs).toISOString(),
    // duration_ms is a GENERATED column in agent_invocations · computed as
    // (ended_at - started_at). Explicit values trigger PostgREST 428C9
    // "cannot insert a non-DEFAULT value into a generated column". Vercel
    // proxy /api/agents/run also omits it (Sprint #4 Fase A migration ·
    // mission-control/supabase/migrations/2026051401_create_agent_invocations.sql).
    cost_usd: costUsd,
    tokens_input: drain.inputTokens,
    tokens_output: drain.outputTokens,
    tokens_cache_read: cacheMetrics.cache_read_input_tokens,
    tokens_cache_creation: cacheMetrics.cache_creation_input_tokens,
    num_turns: 1,
    status: 'completed',
    exit_code: 0,
    error_message: null,
    system_prompt: null,
    // Sprint 8D transparency enhancement · canonical forensics deep self-contained
    // truncated 2000 chars + ellipsis · full payloads viven en Anthropic console retention
    input_summary: input.task.length > 2000 ? input.task.slice(0, 2000) + '…' : input.task,
    output_summary: drain.responseText.length > 2000 ? drain.responseText.slice(0, 2000) + '…' : drain.responseText,
    metadata: {
      source: 'agent-runner-railway',
      caller: 'agent-runner',
      task_text: input.task.substring(0, 200),
      step_name: input.stepName ?? null,
      pipeline_id: input.pipelineId ?? null,
      resumed: !!input.resumeSessionId,
      skills_loaded: skills.map(s => s.name).slice(0, 20),
      response_length: drain.responseText.length,
      brain_hit: brainEnrichment.brain_hit,
      brain_chunks_count: brainEnrichment.brain_chunks_count,
      brain_query_ms: brainEnrichment.brain_query_ms,
      brain_cost_usd: brainEnrichment.brain_cost_usd,
      ...(brainEnrichment.brain_error ? { brain_error: brainEnrichment.brain_error } : {}),
      cache_creation_5m_tokens: cacheMetrics.cache_creation_5m_tokens,
      cache_creation_1h_tokens: cacheMetrics.cache_creation_1h_tokens,
    },
  }
  void insertAgentInvocationWithRetry(supabase, invocationRow, canonicalSlug)
}

// ---------- Public entry point ----------

export async function runAgentViaSDK(input: AgentRunInput): Promise<AgentRunResult> {
  const startedAt = Date.now()
  const supabase = getSupabaseAdmin()

  // 0. Resolve slug → canonical + registry row.
  const { canonicalSlug, registryRow } = await resolveCanonicalSlug(supabase, input.agentName)

  // 1. Load agent config (legacy table preferred, registry fallback).
  const agentCfg = await loadAgentConfig(supabase, canonicalSlug, registryRow)
  if (!agentCfg) {
    const hint = registryRow
      ? `registry row exists but identity_md is empty — run scripts/sync-registry-identities.ts`
      : `slug not found in registry`
    return fail(`Agent "${input.agentName}" (resolved to "${canonicalSlug}") not loadable: ${hint}`, startedAt)
  }
  if (!agentCfg.identity_content || agentCfg.identity_content.startsWith('Loaded from filesystem')) {
    return fail(`Agent "${canonicalSlug}" has no identity_content loaded`, startedAt)
  }

  // 2. Load skills + assemble system prompt.
  const skills = await loadSkills(supabase, agentCfg.id)
  let systemPrompt = _buildSystemPrompt(agentCfg.identity_content, skills, input)

  // 2b · Sprint 7.5 A6 · push-enrichment Client Brain RAG.
  // Inject top_k canonical chunks for this client's brain into the system
  // prompt. Graceful · NEVER throws · falls back to identity-only prompt
  // when clientId missing OR OpenAI/RPC fails OR brain empty for client.
  const { enrichSystemPromptWithClientBrain } = await import('./brain-enrichment')
  const enrichment = await enrichSystemPromptWithClientBrain({
    supabase,
    clientId: input.clientId,
    taskDescription: input.task ?? '',
    agentSlug: canonicalSlug,
    topK: 5,
  })
  if (enrichment.brain_hit) {
    systemPrompt = `${systemPrompt}\n\n${enrichment.enrichment}`
    console.log(
      `[brain-enrich] ${canonicalSlug} · ${enrichment.brain_chunks_count} chunks injected · ${enrichment.brain_query_ms}ms · client=${input.clientId} · $${enrichment.cost_usd.toFixed(6)}`,
    )
  } else if (input.clientId) {
    // Soft-fail: client_id provided but brain returned nothing · log for audit.
    console.warn(
      `[brain-enrich] ${canonicalSlug} · NO chunks · client=${input.clientId} · reason=${enrichment.error ?? 'unknown'}`,
    )
  }

  // 3. Build SDK options.
  const modelKey = agentCfg.model || 'claude-sonnet'
  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP['claude-sonnet']
  const options = buildSdkOptions(modelId, systemPrompt, input)

  // 4. Execute SDK query + drain stream · Sprint 8D Fase 1 wrap with retry
  //    for Anthropic capacity transients ("service was not able to process",
  //    "overloaded", 5xx, ECONNRESET, etc). Non-transient errors pass through
  //    immediately. See sdk-call-retry.ts for the full transient pattern list.
  let drain: StreamDrainResult
  try {
    const wrapped = await callSdkWithRetry(
      async () => {
        const stream = (query as unknown as QueryFn)({ prompt: input.task, options })
        return await drainStream(stream)
      },
      { canonicalSlug },
    )
    drain = wrapped.result
    if (wrapped.retry.retried) {
      console.log(
        `[sdk-call-retry] OK ${canonicalSlug} · succeeded on attempt ${wrapped.retry.attempts}/3 after ${wrapped.retry.transientErrors.length} transient(s)`,
      )
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'SDK error', startedAt)
  }

  const durationMs = Date.now() - startedAt
  const costUsd = costFor(
    modelId,
    drain.inputTokens,
    drain.outputTokens,
    drain.cacheReadInputTokens,
    drain.cacheCreation5mTokens,
    drain.cacheCreation1hTokens,
  )

  const brainEnrichmentMeta: BrainEnrichmentResultMeta = {
    brain_hit: enrichment.brain_hit,
    brain_chunks_count: enrichment.brain_chunks_count,
    brain_query_ms: enrichment.brain_query_ms,
    brain_cost_usd: enrichment.cost_usd,
    ...(enrichment.error ? { brain_error: enrichment.error } : {}),
  }

  const cacheMetricsMeta: CacheMetricsMeta = {
    cache_creation_input_tokens: drain.cacheCreationInputTokens,
    cache_read_input_tokens: drain.cacheReadInputTokens,
    cache_creation_5m_tokens: drain.cacheCreation5mTokens,
    cache_creation_1h_tokens: drain.cacheCreation1hTokens,
  }

  // 5. Best-effort log · include brain enrichment + cache markers.
  //    Dual-write · `agents_log` (Railway runner forensics) + `agent_invocations`
  //    (canonical Sprint 8D audit trail · workflow_id column for enforcement
  //    query). See agent-invocations-log.ts for dual-write rationale.
  logExecution(supabase, {
    canonicalSlug, input, skills, drain, modelId, startedAtMs: startedAt, durationMs, costUsd,
    brainEnrichment: brainEnrichmentMeta,
    cacheMetrics: cacheMetricsMeta,
  })

  return {
    success: true,
    response: drain.responseText,
    sessionId: drain.sessionId,
    inputTokens: drain.inputTokens,
    outputTokens: drain.outputTokens,
    costUsd,
    durationMs,
    model: modelId,
    brainEnrichment: brainEnrichmentMeta,
    cacheMetrics: cacheMetricsMeta,
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
    brainEnrichment: {
      brain_hit: false,
      brain_chunks_count: 0,
      brain_query_ms: 0,
      brain_cost_usd: 0,
    },
    cacheMetrics: {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_5m_tokens: 0,
      cache_creation_1h_tokens: 0,
    },
    error: message,
  }
}
