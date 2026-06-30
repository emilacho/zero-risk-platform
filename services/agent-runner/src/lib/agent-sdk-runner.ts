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

import * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk'
import { type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { instrumentClaudeAgentSdk } from './braintrust.js'

// Braintrust · traza cada `query()` del Claude Agent SDK · pass-through (cero
// overhead) cuando BRAINTRUST_API_KEY no está en el env de Railway. El wrapper
// devuelve un Proxy · no muta el namespace.
const { query } = instrumentClaudeAgentSdk(claudeAgentSdk)
import { getSupabaseAdmin } from './supabase.js'
import { resolveAgentSlug, isCanonicalSlug } from './agent-alias-map.js'
import { buildMcpServers, DISCOVERY_OUTPUT_ALLOW } from './agent-mcp-registry.js'
import { insertWithRetry } from './agents-log-retry.js'
import { insertAgentInvocationWithRetry } from './agent-invocations-log.js'
import { callSdkWithRetry } from './sdk-call-retry.js'
import {
  shouldSkipStep,
  saveCheckpoint,
  type ShouldSkipResult,
} from './workflow-checkpoint.js'
import { buildDryRunFakeResponse } from './dry-run-mode.js'

// Local message shapes — the SDK's d.ts has internal type errors that cause
// `msg.message`, `msg.usage`, etc. to collapse to `{}`. We re-declare the
// fields we actually consume so strict mode can verify access.
type SDKSystemInitMessage = {
  type: 'system'
  subtype: 'init'
  session_id?: string
}
/**
 * Canon canonical · assistant content blocks · the SDK emits text + tool_use.
 * The d.ts collapses these · we explicitly type the tool_use shape so we can
 * capture structured tool args without a cast at every site. The Anthropic
 * SDK emits tool_use blocks PRIOR to the tool actually running · so capturing
 * here gives us the input directly · the actual MCP tool execution + reply
 * still happens normally · we only OBSERVE.
 */
type SDKAssistantBlock = {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}
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
  /**
   * Sprint 8D tail canon · workflow checkpoint/resume idempotency guardrail
   * #3. When `forceRestart=true` · skip the checkpoint cache lookup and
   * re-execute the agent SDK call from scratch. Default (false / undefined)
   * uses cached `completed` checkpoint if present (re-hydrates response from
   * `workflow_checkpoints.output_ref`). Set true for HITL rejection re-runs
   * · operator-forced fresh smokes · or any path that needs ungated SDK call.
   */
  forceRestart?: boolean
  /**
   * Sprint 9 entry canon · dry-run mode. When `dryRun=true` · skip the
   * Anthropic SDK call · return a canonical fake StreamDrainResult · cost
   * 0 USD · 0 tokens · 0 MCP invocations · 0 Client Brain enrichment.
   * Enables mass-audit Phase 2 functional validation (58 workflows ~$3 total
   * vs $30-100 without dry-run). Skips checkpoint save canon-guard
   * (prevents cache pollution per spike `2026-05-25-cc2-dry-run-mass-audit-brazos-ejecutores-spike.md`).
   */
  dryRun?: boolean
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

/**
 * Canon canonical · captured `emit_discovery_output` tool call (SPEC lazo
 * agentico 2026-06-05 follow-up · tool-call linchpin).
 *
 * When the Auto-Discovery agent invokes the canonical MCP tool · the SDK
 * emits an `assistant` message with a `tool_use` content block carrying the
 * structured input. drainStream observes it and surfaces it here · the
 * Vercel proxy PREFERS this over the parser-on-text fallback (the parser
 * stays as defense-in-depth · `parseDiscoveryOutput` in `src/lib/discovery-output/`).
 *
 * Multiple emissions · we keep the LAST one (final answer · agent may iterate).
 * Tool args ARE pre-validated against the zod schema in the MCP server before
 * the agent SDK forwards them · so `input` is guaranteed canonical shape per
 * the SDK contract · we still TS-cast at the persist boundary for safety.
 */
export interface DiscoveryToolCallCapture {
  /** Canon canonical · the structured payload as emitted by the agent · matches
   *  the `DiscoveryOutput` interface in `src/lib/discovery-output/types.ts`
   *  byte-aligned with the zod schema in `discovery-output-server.js`. */
  readonly input: Record<string, unknown>
  /** Canon canonical · how many emissions saw on the stream · canonical is 1 ·
   *  >1 means the agent iterated (we kept the LAST · forensics surface). */
  readonly emission_count: number
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
  /**
   * Canon canonical · SPEC lazo agentico 2026-06-05 follow-up · structured
   * Discovery output captured via the `emit_discovery_output` MCP tool · only
   * present when the agent invoked the tool · absent for all other agents
   * + for onboarding-specialist runs where the tool was not called (in which
   * case the platform falls back to the text parser).
   */
  discoveryToolCall?: DiscoveryToolCallCapture
  /** Brand Book · sección estructurada emitida por la lente vía emit_brand_section. */
  brandSectionToolCall?: DiscoveryToolCallCapture
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
 * Canon canonical · MCP namespace prefix that the Claude Agent SDK uses for
 * tool surface from registered MCP servers. The SDK constructs tool names as
 * `mcp__<server-name>__<tool-name>` · adding the FULLY QUALIFIED name to
 * `allowedTools` is the canonical way to let `permissionMode='default'`
 * accept an MCP tool without an interactive approval prompt (the SDK gates
 * any tool NOT in `allowedTools`).
 *
 * Per-MCP allowed tools table (SPEC lazo agentico 2026-06-06 follow-up · Track L).
 * Add new entries when a future MCP needs autonomous tool calls from agents.
 * Tests cover the activation matrix in `__tests__/agent-sdk-runner-allowed-tools.test.ts`.
 */
const MCP_ALLOWED_TOOLS_BY_SERVER: Record<string, readonly string[]> = {
  'discovery-output': ['mcp__discovery-output__emit_discovery_output'],
  // Brand Book · emit_brand_section · cada lente (brand-strategist · editor-en-jefe
  // · jefe-client-success) emite SU sección estructurada vía tool call · mismo
  // patrón que emit_discovery_output (CC#4 2026-06-30 · fix narración-vs-estructurado).
  'brand-section': ['mcp__brand-section__emit_brand_section'],
}

/** Brand Book · nombres del tool_use de emit_brand_section (namespace + bare). */
export const BRAND_SECTION_TOOL_USE_NAMES: ReadonlySet<string> = new Set([
  'mcp__brand-section__emit_brand_section',
  'emit_brand_section',
])

/**
 * Canon canonical · the SDK tool_use block names the Claude Agent SDK emits
 * for the canonical Discovery tool. SPEC Track M (2026-06-06 · post-smoke
 * ROJO round 4 root-cause) · the SDK emits tool_use blocks with the FULLY
 * QUALIFIED MCP namespace name (`mcp__<server>__<tool>`) · NOT the bare
 * tool name. drainStream must match against the namespace · matching the
 * bare name silently misses every tool_use block · the agent calls the
 * tool but the capture path falls through to the text parser fallback.
 *
 * We accept BOTH forms for resilience · if a future SDK release changes
 * the convention OR a server-side override drops the prefix · drainStream
 * still captures. Cero false positives because only canonical names enter
 * this set.
 */
export const DISCOVERY_TOOL_USE_NAMES: ReadonlySet<string> = new Set([
  'mcp__discovery-output__emit_discovery_output', // canonical SDK MCP namespace
  'emit_discovery_output', // bare name · defensive fallback
])

/**
 * Canon canonical · derive the per-agent allowedTools array · base SDK tools
 * + per-MCP additions based on which MCP servers `buildMcpServers` registered.
 * Pure function · cero IO · tested independently of the SDK call site.
 *
 * Why · `permissionMode='default'` blocks any tool NOT in `allowedTools` ·
 * the smoke linchpin (2026-06-06) revealed the agent saw the MCP tool but
 * refused to invoke it without user permission (canonical SDK behavior).
 * Adding the tool to `allowedTools` lifts the gate · the agent invokes
 * autonomously when ready · canon §148 honest forensics via emission_count.
 */
export function deriveAllowedTools(
  mcpServers: Record<string, unknown>,
): string[] {
  const base = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']
  const extras: string[] = []
  for (const [serverName, tools] of Object.entries(MCP_ALLOWED_TOOLS_BY_SERVER)) {
    if (mcpServers[serverName]) extras.push(...tools)
  }
  return [...base, ...extras]
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
  // MCP servers · canonical registry (Sprint 6 Track C1) covers
  // client-brain (per-cliente) + meta-ads (Brazo 3) + apify · dataforseo
  // · higgsfield via env-gated conditional activation. See
  // `agent-mcp-registry.ts` for the activation matrix and per-agent
  // deny-list. `needsMetaAds()` remains exported below for direct callers
  // (smoke test + lib consumers).
  //
  // SPEC lazo agentico 2026-06-06 Track L · build mcpServers FIRST so
  // `deriveAllowedTools` can branch on which servers are registered ·
  // canonical mc/MCP-tools-in-allowedTools wiring per the SDK contract
  // (permissionMode=default gates any tool not whitelisted).
  const mcpServers = buildMcpServers({
    agentSlug: input.agentName,
    clientId: input.clientId ?? undefined,
  })
  return {
    systemPrompt: systemPromptOption as unknown as Options['systemPrompt'],
    model: modelId,
    // Solo lectura + búsqueda; los agentes no editan archivos locales.
    // SPEC Track L · per-MCP tool additions when the server is registered
    // (e.g. discovery-output → emit_discovery_output canonical autonomous emit).
    allowedTools: deriveAllowedTools(
      mcpServers as unknown as Record<string, unknown>,
    ),
    permissionMode: 'default',
    // Reanudar sesión previa para encadenar contexto entre pasos del pipeline.
    ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
    mcpServers,
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

export interface StreamDrainResult {
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
  /**
   * Canon canonical · SPEC lazo agentico 2026-06-05 follow-up · Discovery
   * tool-call capture · null when the agent did NOT invoke `emit_discovery_output`
   * (which is the case for all non-discovery agents AND for discovery agents
   * that emitted prose-only). Surfaced to AgentRunResult.discoveryToolCall.
   */
  discoveryToolCall: DiscoveryToolCallCapture | null
  /** Brand Book · captura del emit_brand_section de la lente · null si narró sin emitir. */
  brandSectionToolCall: DiscoveryToolCallCapture | null
}

/**
 * Drain the SDK stream and accumulate text + usage stats.
 * Throws on stream error; caller wraps in try/catch.
 */
export async function drainStream(stream: AsyncIterable<SDKMessage>): Promise<StreamDrainResult> {
  let responseText = ''
  let sessionId: string | null = null
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationInputTokens = 0
  let cacheReadInputTokens = 0
  let cacheCreation5mTokens = 0
  let cacheCreation1hTokens = 0
  // SPEC lazo agentico 2026-06-05 follow-up · capture every tool_use of the
  // canonical Discovery tool · keep the LAST one (final answer) · the count
  // surfaces forensics when the agent emits more than once.
  let discoveryEmissionCount = 0
  let lastDiscoveryInput: Record<string, unknown> | null = null
  // Brand Book · captura paralela del emit_brand_section (cada lente emite su sección).
  let brandSectionEmissionCount = 0
  let lastBrandSectionInput: Record<string, unknown> | null = null

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
          } else if (
            block.type === 'tool_use' &&
            typeof block.name === 'string' &&
            DISCOVERY_TOOL_USE_NAMES.has(block.name) &&
            block.input &&
            typeof block.input === 'object' &&
            !Array.isArray(block.input)
          ) {
            // Canon · agent invoked the canonical Discovery tool. Per SPEC
            // we keep the LAST emission (final answer · the agent may iterate).
            // Args are pre-validated by the MCP server's zod schema before
            // reaching here so shape is canonical per SDK contract.
            //
            // Track M (2026-06-06) · accept both the canonical SDK MCP
            // namespace name (`mcp__discovery-output__emit_discovery_output`)
            // AND the bare tool name (`emit_discovery_output`) · matches the
            // DISCOVERY_TOOL_USE_NAMES set canonical.
            discoveryEmissionCount++
            lastDiscoveryInput = block.input
          } else if (
            block.type === 'tool_use' &&
            typeof block.name === 'string' &&
            BRAND_SECTION_TOOL_USE_NAMES.has(block.name) &&
            block.input &&
            typeof block.input === 'object' &&
            !Array.isArray(block.input)
          ) {
            // Brand Book · la lente emitió su sección estructurada vía tool ·
            // keep the LAST emission · args pre-validados por el zod del MCP.
            brandSectionEmissionCount++
            lastBrandSectionInput = block.input
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
    discoveryToolCall:
      lastDiscoveryInput !== null
        ? {
            input: lastDiscoveryInput,
            emission_count: discoveryEmissionCount,
          }
        : null,
    brandSectionToolCall:
      lastBrandSectionInput !== null
        ? {
            input: lastBrandSectionInput,
            emission_count: brandSectionEmissionCount,
          }
        : null,
  }
}

/**
 * Forced-emit decision (Discovery Fix · 2026-06-28 · CC#4). Returns true when a
 * Discovery agent had the `emit_discovery_output` MCP tool mounted for this run
 * but closed the stream WITHOUT calling it (`discoveryToolCall === null`) and a
 * resumable session exists. The caller then re-prompts that session with a hard
 * directive to force the missed emission · pure predicate · tested in isolation.
 */
export function shouldForceDiscoveryEmit(
  mcpServers: Record<string, unknown> | undefined,
  drain: Pick<StreamDrainResult, 'discoveryToolCall' | 'sessionId'>,
): boolean {
  const discoveryToolMounted = !!(mcpServers && mcpServers['discovery-output'])
  return discoveryToolMounted && drain.discoveryToolCall === null && !!drain.sessionId
}

/**
 * Checkpoint-skip usability (Discovery Fix · 2026-06-28 · CC#4). A `completed`
 * checkpoint is reusable EXCEPT for a Discovery agent whose cached `output_ref`
 * captured NO emission (`discoveryToolCall` absent). Rehydrating such a cache
 * yields source:none (degraded discovery · 0 competitors) · so we force a fresh
 * run instead. Root cause exec 40004 · the re-discovery node's static
 * `workflow_id` collided with a stale pre-fix checkpoint. Pure · tested.
 */
export function isDiscoveryCheckpointUsable(
  canonicalSlug: string,
  outputRef: Record<string, unknown> | null | undefined,
): boolean {
  if (!DISCOVERY_OUTPUT_ALLOW.has(canonicalSlug)) return true
  return !!(outputRef && outputRef.discoveryToolCall)
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
      // Sprint 9 entry canon · dry-run audit trail · invocations where this
      // flag is true returned canonical fake responses · NO Anthropic call ·
      // forensics + post-deploy compliance queries should filter on this.
      dry_run: input.dryRun === true,
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

  // 0b. Sprint 8D tail · workflow checkpoint/resume canon (idempotency
  //     guardrail #3). Skip SDK call entirely when a `completed` checkpoint
  //     exists for (workflow_id, client_id, agent_slug) and forceRestart is
  //     not true. Re-hydrates the cached AgentRunResult from output_ref.
  //     Skipped silently when workflow_id OR client_id missing (cannot
  //     uniquely identify the step). Graceful · helper NEVER throws.
  let checkpointDecision: ShouldSkipResult | null = null
  if (input.workflowId && input.clientId) {
    checkpointDecision = await shouldSkipStep(
      supabase,
      {
        workflowId: input.workflowId,
        clientId: input.clientId,
        stepName: canonicalSlug,
      },
      { forceRestart: input.forceRestart === true },
    )
    if (checkpointDecision.skip && checkpointDecision.checkpoint?.output_ref) {
      const cached = checkpointDecision.checkpoint.output_ref as Record<string, unknown>
      // Discovery Fix · a Discovery-agent checkpoint that did NOT capture an
      // emission (no `discoveryToolCall`) rehydrates to source:none → degraded
      // discovery (0 competitors · stale-cache root cause · exec 40004). Run
      // fresh instead so the agent + forced-emit can attempt. Non-discovery
      // agents + valid emit-caches still skip normally.
      if (isDiscoveryCheckpointUsable(canonicalSlug, cached)) {
        console.log(
          `[workflow-checkpoint] SKIP ${canonicalSlug} · client=${input.clientId} · workflow=${input.workflowId} · cached from ${checkpointDecision.checkpoint.updated_at}`,
        )
        return rehydrateFromCheckpoint(cached, startedAt)
      }
      console.warn(
        `[workflow-checkpoint] DISCOVERY checkpoint has NO emission · running fresh · ${canonicalSlug} · client=${input.clientId} · workflow=${input.workflowId}`,
      )
    }
    // Best-effort · mark step in_progress (advisory · concurrent racers may
    // both proceed but unique constraint ensures only 1 row · downstream
    // saveCheckpoint at end will overwrite with terminal status).
    //
    // Sprint 9 entry canon guard · skip in_progress save when dry-run is
    // active · prevent checkpoint cache pollution with fake responses.
    if (!checkpointDecision.skip && input.dryRun !== true) {
      void saveCheckpoint(supabase, {
        workflowId: input.workflowId,
        workflowExecutionId: input.workflowExecutionId ?? null,
        clientId: input.clientId,
        stepName: canonicalSlug,
        status: 'in_progress',
      })
    }
  }

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
  //
  //    Sprint 9 entry canon · dry-run mode short-circuit · when input.dryRun
  //    is true · skip SDK + retry wrapper entirely · return canonical fake
  //    StreamDrainResult · cost computation downstream produces 0 USD given
  //    zero token inputs. See dry-run-mode.ts for activation patterns +
  //    canon guards.
  let drain: StreamDrainResult
  if (input.dryRun === true) {
    drain = buildDryRunFakeResponse(canonicalSlug, input.task ?? '')
    console.log(
      `[dry-run] ${canonicalSlug} · canonical fake response · zero LLM cost · skip checkpoint save`,
    )
  } else {
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

    // 4b. Forced-emit fallback · Discovery agents MUST emit emit_discovery_output ·
    //     if the agent closed the stream having done research but never called the
    //     tool (discoveryToolCall === null · root cause of narration-without-emit),
    //     re-prompt the SAME session (resume · preserves the gathered research
    //     context) with a hard directive to emit. The Agent SDK has NO tool_choice
    //     forcing (sdk.d.ts exposes maxTurns/canUseTool/interrupt · no tool_choice) ·
    //     and a fresh Messages-API tool_choice call would LOSE the session context ·
    //     so session-resume + directive is the canonical + context-preserving way to
    //     drive the missed emission. Scoped · only when the discovery-output MCP was
    //     mounted for this run (i.e. the agent COULD have emitted) · cero overhead
    //     when the agent already emitted.
    if (shouldForceDiscoveryEmit(options.mcpServers as Record<string, unknown> | undefined, drain)) {
      console.warn(
        `[forced-emit] ${canonicalSlug} closed stream WITHOUT emit_discovery_output · re-prompting session ${drain.sessionId} to force emission`,
      )
      try {
        const forcedOptions: Options = { ...options, resume: drain.sessionId }
        const forcedPrompt =
          'STOP. You completed your research but did NOT call the emit_discovery_output tool. ' +
          'Call emit_discovery_output NOW with the structured findings (own_handles + competitors[] + ' +
          'icp + competitive_landscape_summary) from the research you just did. The tool call is the ' +
          'ONLY acceptable output · do NOT reply with prose. Skipping it = empty Client Brain = failed onboarding.'
        const forced = await callSdkWithRetry(
          async () => {
            const stream = (query as unknown as QueryFn)({ prompt: forcedPrompt, options: forcedOptions })
            return await drainStream(stream)
          },
          { canonicalSlug },
        )
        if (forced.result.discoveryToolCall) {
          // Recovered · graft the forced emission onto the original drain · sum
          // token usage so cost + audit reflect both turns · keep original prose.
          drain = {
            ...drain,
            discoveryToolCall: forced.result.discoveryToolCall,
            inputTokens: drain.inputTokens + forced.result.inputTokens,
            outputTokens: drain.outputTokens + forced.result.outputTokens,
            cacheCreationInputTokens:
              drain.cacheCreationInputTokens + forced.result.cacheCreationInputTokens,
            cacheReadInputTokens: drain.cacheReadInputTokens + forced.result.cacheReadInputTokens,
            cacheCreation5mTokens:
              drain.cacheCreation5mTokens + forced.result.cacheCreation5mTokens,
            cacheCreation1hTokens:
              drain.cacheCreation1hTokens + forced.result.cacheCreation1hTokens,
          }
          console.log(
            `[forced-emit] ${canonicalSlug} · emission RECOVERED on forced turn · emission_count=${drain.discoveryToolCall?.emission_count}`,
          )
        } else {
          // Fix C (2026-06-28) · the Agent SDK resume+directive turn STILL did
          // not emit (the SDK has no tool_choice forcing). Escalate to a direct
          // Messages API call with tool_choice:{type:'tool'} · the model is
          // COMPELLED to return the tool call · it cannot narrate. Re-inject the
          // research the agent already did so the emission is grounded.
          console.warn(
            `[forced-emit] ${canonicalSlug} · still NO emission after forced turn · escalating to Messages-API tool_choice`,
          )
          try {
            // Lazy import · keeps `@anthropic-ai/sdk` out of the eager module
            // graph (it lives in the agent-runner pnpm tree · not resolvable by
            // the root vitest config that loads agent-sdk-runner). Only loaded
            // on the forced-emit path · at runtime the dep is present.
            const { forceEmitViaMessagesApi } = await import('./forced-emit-messages')
            const forcedInput = await forceEmitViaMessagesApi({
              model: modelId,
              systemPrompt,
              task: input.task,
              researchText: drain.responseText,
              clientId: input.clientId ?? null,
            })
            if (forcedInput) {
              drain = {
                ...drain,
                discoveryToolCall: { input: forcedInput.input, emission_count: forcedInput.emission_count },
                inputTokens: drain.inputTokens + forcedInput.inputTokens,
                outputTokens: drain.outputTokens + forcedInput.outputTokens,
              }
              console.log(
                `[forced-emit] ${canonicalSlug} · emission RECOVERED via Messages-API tool_choice`,
              )
            } else {
              console.warn(
                `[forced-emit] ${canonicalSlug} · Messages-API tool_choice returned no tool_use block`,
              )
            }
          } catch (me) {
            console.warn(
              `[forced-emit] ${canonicalSlug} · Messages-API forced-emit errored: ${me instanceof Error ? me.message : 'unknown'}`,
            )
          }
        }
      } catch (e) {
        // Never let the fallback fail the run · the original drain stands.
        console.warn(
          `[forced-emit] ${canonicalSlug} · forced turn errored: ${e instanceof Error ? e.message : 'unknown'}`,
        )
      }
    }
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

  const result: AgentRunResult = {
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
    ...(drain.discoveryToolCall
      ? { discoveryToolCall: drain.discoveryToolCall }
      : {}),
    ...(drain.brandSectionToolCall
      ? { brandSectionToolCall: drain.brandSectionToolCall }
      : {}),
  }

  // 5b. Sprint 8D tail · save checkpoint canonical · status='completed' +
  //     embedded output_ref (response + tokens + cost + brain + cache).
  //     Next re-trigger for same (workflow_id, client_id, agent_slug) will
  //     skip the SDK call entirely. Fire-and-forget · NEVER throws.
  //
  //     Sprint 9 entry canon guard · skip save when dry-run is active ·
  //     prevents fake `[DRY_RUN]` response polluting the checkpoint cache.
  //     A subsequent real (non-dry-run) call must re-execute the SDK ·
  //     dry-run is for plumbing validation only · NOT a real cache fill.
  if (input.workflowId && input.clientId && input.dryRun !== true) {
    void saveCheckpoint(supabase, {
      workflowId: input.workflowId,
      workflowExecutionId: input.workflowExecutionId ?? null,
      clientId: input.clientId,
      stepName: canonicalSlug,
      status: 'completed',
      outputRef: serializeResultForCheckpoint(result),
      costUsd,
      durationMs,
    })
  }

  return result
}

/**
 * Serialize an AgentRunResult into a compact jsonb-storable shape for
 * `workflow_checkpoints.output_ref`. Caps response text at 100k chars to
 * prevent runaway rows on verbose generations.
 */
function serializeResultForCheckpoint(r: AgentRunResult): Record<string, unknown> {
  const RESPONSE_CAP = 100_000
  const responseClipped = r.response.length > RESPONSE_CAP
    ? r.response.slice(0, RESPONSE_CAP)
    : r.response
  return {
    schema_version: 1,
    response: responseClipped,
    response_truncated: r.response.length > RESPONSE_CAP,
    sessionId: r.sessionId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
    durationMs: r.durationMs,
    model: r.model,
    brainEnrichment: r.brainEnrichment,
    cacheMetrics: r.cacheMetrics,
    // Discovery Fix · persist the captured emission so a rehydrated Discovery
    // checkpoint preserves source:tool_call (was lost · every rehydration came
    // back source:none regardless of the original emission).
    ...(r.discoveryToolCall ? { discoveryToolCall: r.discoveryToolCall } : {}),
  }
}

/**
 * Re-hydrate an AgentRunResult from a `workflow_checkpoints.output_ref`
 * payload (written by serializeResultForCheckpoint). Returns success result
 * with `durationMs` overridden to reflect the cache-hit duration (near-zero
 * · the caller's started_at vs now). The cached original durationMs is
 * preserved on the result for forensics via the `extra` field.
 */
function rehydrateFromCheckpoint(
  cached: Record<string, unknown>,
  startedAt: number,
): AgentRunResult {
  const cacheHitDurationMs = Date.now() - startedAt
  const cachedDurationMs = typeof cached.durationMs === 'number' ? cached.durationMs : 0
  console.log(
    `[workflow-checkpoint] rehydrated · cache-hit duration ${cacheHitDurationMs}ms · saved original ${cachedDurationMs}ms`,
  )
  return {
    success: true,
    response: String(cached.response ?? ''),
    sessionId: (cached.sessionId as string | null) ?? null,
    inputTokens: 0, // cache hit · no new tokens
    outputTokens: 0,
    costUsd: 0,     // cache hit · no new cost · savings = cached.costUsd
    durationMs: cacheHitDurationMs,
    model: String(cached.model ?? 'cached'),
    brainEnrichment: (cached.brainEnrichment as BrainEnrichmentResultMeta | undefined) ?? {
      brain_hit: false,
      brain_chunks_count: 0,
      brain_query_ms: 0,
      brain_cost_usd: 0,
    },
    cacheMetrics: (cached.cacheMetrics as CacheMetricsMeta | undefined) ?? {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_5m_tokens: 0,
      cache_creation_1h_tokens: 0,
    },
    // Discovery Fix · restore the captured emission from the cache so a valid
    // emit-checkpoint rehydrates as source:tool_call downstream.
    ...(cached.discoveryToolCall
      ? { discoveryToolCall: cached.discoveryToolCall as AgentRunResult['discoveryToolCall'] }
      : {}),
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
