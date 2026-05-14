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

import { resolve as pathResolve } from 'node:path'
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { getSupabaseAdmin } from './supabase.js'
import { resolveAgentSlug, isCanonicalSlug } from './agent-alias-map.js'

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
  usage?: { input_tokens?: number; output_tokens?: number }
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
 */
export function _costFor(model: string, inTok: number, outTok: number): number {
  const key = model.includes('haiku') ? 'haiku' : model.includes('opus') ? 'opus' : 'sonnet'
  const p = COST_PER_M[key as keyof typeof COST_PER_M]
  return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output
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
    // MCP servers: Client Brain se conecta si hay clientId.
    mcpServers: input.clientId
      ? {
          'client-brain': {
            type: 'stdio',
            command: 'node',
            args: [
              pathResolve(process.cwd(), 'src/lib/mcp/client-brain-server.js'),
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
}

interface StreamDrainResult {
  responseText: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
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
      sessionId = sessionId ?? r.session_id ?? null
    }
  }

  return { responseText, sessionId, inputTokens, outputTokens }
}

/**
 * Best-effort fire-and-forget log to agents_log. Never throws.
 */
function logExecution(
  supabase: SupabaseAdmin,
  args: {
    canonicalSlug: string
    input: AgentRunInput
    skills: Skill[]
    drain: StreamDrainResult
    modelId: string
    durationMs: number
    costUsd: number
  },
): void {
  const { canonicalSlug, input, skills, drain, modelId, durationMs, costUsd } = args
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
        response_length: drain.responseText.length,
        model: modelId,
        input_tokens: drain.inputTokens,
        output_tokens: drain.outputTokens,
        session_id: drain.sessionId,
      },
      status: 'success',
      duration_ms: durationMs,
      cost: costUsd,
    })
    .then(() => { /* best-effort log */ })
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
  const systemPrompt = _buildSystemPrompt(agentCfg.identity_content, skills, input)

  // 3. Build SDK options.
  const modelKey = agentCfg.model || 'claude-sonnet'
  const modelId = MODEL_MAP[modelKey] ?? MODEL_MAP['claude-sonnet']
  const options = buildSdkOptions(modelId, systemPrompt, input)

  // 4. Execute SDK query + drain stream.
  let drain: StreamDrainResult
  try {
    const stream = (query as unknown as QueryFn)({ prompt: input.task, options })
    drain = await drainStream(stream)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'SDK error', startedAt)
  }

  const durationMs = Date.now() - startedAt
  const costUsd = costFor(modelId, drain.inputTokens, drain.outputTokens)

  // 5. Best-effort log.
  logExecution(supabase, {
    canonicalSlug, input, skills, drain, modelId, durationMs, costUsd,
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
