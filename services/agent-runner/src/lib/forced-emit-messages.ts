/**
 * forced-emit-messages · Fix C (Discovery · 2026-06-28 · CC#1).
 *
 * Deterministic last-resort recovery for the "agent narrates instead of calling
 * emit_discovery_output" bug. PR #220 re-prompts the Claude Agent SDK session
 * with a prose directive, but the Agent SDK exposes NO tool_choice forcing, so
 * the model can ignore it and narrate again. This module escalates to a direct
 * Messages API call with `tool_choice: {type:'tool', name:'emit_discovery_output'}`
 * — the model is COMPELLED to return the tool call; it cannot reply with prose.
 *
 * The agent's research narration (`researchText`) is re-injected as a prior
 * assistant turn so the forced emission is grounded in the work already done.
 *
 * Auth: `new Anthropic()` reads ANTHROPIC_API_KEY from the env (same key the
 * Agent SDK uses). If ANTHROPIC_BASE_URL is set (Vercel AI Gateway), it is used
 * as baseURL; otherwise the client hits Anthropic directly.
 */
import Anthropic from '@anthropic-ai/sdk'

/** Bare tool name (NOT the `mcp__discovery-output__` SDK namespace). */
export const EMIT_DISCOVERY_OUTPUT_TOOL_NAME = 'emit_discovery_output'

// FIX 2026-08-09 (CC#1) · `['string','null']` · espejo del `.nullish()` que se
// aplicó al esquema zod vivo (discovery-output-server.js · PR #307). El agente
// manda `null` para la red social que NO encontró · declarar sólo `'string'`
// invita al modelo a inventar o a omitir la llamada, y en el camino zod tumbaba
// la emisión ENTERA por una sola cuenta faltante (MCP -32602). Los dos esquemas
// DEBEN aceptar las mismas formas (ver nota de sincronización abajo).
const SOCIAL_HANDLES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    instagram: { type: ['string', 'null'] },
    facebook: { type: ['string', 'null'] },
    tiktok: { type: ['string', 'null'] },
    linkedin: { type: ['string', 'null'] },
    youtube: { type: ['string', 'null'] },
  },
} as const

/** Igual que el anterior pero admite el objeto entero nulo · espejo de `socialHandles.nullish()`. */
const SOCIAL_HANDLES_SCHEMA_NULLABLE = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: SOCIAL_HANDLES_SCHEMA.properties,
} as const

const ICP_SEGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['audience_segment'],
  properties: {
    audience_segment: { type: 'string', minLength: 1 },
    segment_priority: { type: 'integer', minimum: 1 },
    job_titles: { type: 'array', items: { type: 'string' } },
    company_size: { type: 'string' },
    industries: { type: 'array', items: { type: 'string' } },
    geography: { type: 'string' },
    goals: { type: 'array', items: { type: 'string' } },
    pain_points: { type: 'array', items: { type: 'string' } },
    jobs_to_be_done: { type: 'array', items: { type: 'string' } },
    objections: { type: 'array', items: { type: 'string' } },
    buying_process: { type: 'string' },
    decision_criteria: { type: 'array', items: { type: 'string' } },
    budget_range: { type: 'string' },
    preferred_channels: { type: 'array', items: { type: 'string' } },
    content_preferences: { type: 'string' },
  },
} as const

/**
 * JSON Schema mirroring the live zod `DISCOVERY_INPUT_SCHEMA`
 * (services/agent-runner/src/lib/mcp/discovery-output-server.js). 5 top-level
 * fields · required: client_id, own_handles, competitors. Nested objects are
 * `.strict()` in zod → additionalProperties:false here. NO `sources` and NO
 * competitor provenance fields (zod strict rejects them).
 */
export const EMIT_DISCOVERY_OUTPUT_TOOL = {
  name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
  description:
    'Emit the structured Client Brain discovery output. Call this with the findings ' +
    'from your research: the client own social handles, the real competitors, the ICP, ' +
    'and a competitive landscape summary.',
  input_schema: {
    type: 'object',
    required: ['client_id', 'own_handles', 'competitors'],
    properties: {
      client_id: { type: 'string', format: 'uuid', description: 'MUST match the client_id passed by the orchestrator.' },
      own_handles: SOCIAL_HANDLES_SCHEMA,
      competitors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            website: { type: ['string', 'null'], format: 'uri' },
            handles: SOCIAL_HANDLES_SCHEMA_NULLABLE,
            why: { type: 'string' },
            competitor_type: { type: 'string', enum: ['direct', 'indirect', 'aspirational', 'alternative'] },
            positioning: { type: 'string' },
          },
        },
      },
      icp: {
        oneOf: [ICP_SEGMENT_SCHEMA, { type: 'array', minItems: 1, items: ICP_SEGMENT_SCHEMA }],
      },
      competitive_landscape_summary: { type: 'string' },
    },
  },
} as const

// ── Brand Book · forced-emit del judge de fidelidad (CC#4 2026-06-30 · Bug 2) ──
// El judge (editor-en-jefe) narraba en vez de llamar emit_fidelity_scores → scores 0
// → loop. Messages-API tool_choice COMPELE el tool call. Mismo patrón que discovery.
export const EMIT_FIDELITY_SCORES_TOOL_NAME = 'emit_fidelity_scores'

export const EMIT_FIDELITY_SCORES_TOOL = {
  name: EMIT_FIDELITY_SCORES_TOOL_NAME,
  description:
    'Emit your per-field FIDELITY (groundedness) scores for the brand book. Each score 0..1 ' +
    'measures how well the field is supported by the real client evidence (1 = fully grounded, ' +
    '0 = invented/contradicts).',
  input_schema: {
    type: 'object',
    required: ['scores'],
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        properties: {
          positioning: { type: 'number', minimum: 0, maximum: 1 },
          icp_summary: { type: 'number', minimum: 0, maximum: 1 },
          voice_description: { type: 'number', minimum: 0, maximum: 1 },
          customer_angle: { type: 'number', minimum: 0, maximum: 1 },
          retention_notes: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const

export interface ForceFidelityArgs {
  model: string
  systemPrompt: string
  task: string
  researchText: string
  /** Injectable for tests · defaults to a real Anthropic client. */
  createClient?: () => Pick<Anthropic, 'messages'>
}

/**
 * Force the fidelity-scores emission via the Messages API tool_choice. Returns the
 * parsed tool input ({ scores: {...} }) or null if no tool_use block came back.
 * Caller wraps in try/catch (a repair failure must not fail the run).
 */
export async function forceFidelityEmitViaMessagesApi(
  args: ForceFidelityArgs,
): Promise<ForceEmitOutcome | null> {
  const client = args.createClient ? args.createClient() : buildAnthropicClient()
  const work = args.researchText?.trim() || '(judging completed but not captured as text)'

  const resp = await client.messages.create({
    model: args.model,
    max_tokens: 2000,
    system: args.systemPrompt,
    messages: [
      { role: 'user', content: args.task },
      { role: 'assistant', content: work },
      {
        role: 'user',
        content:
          'Emit your fidelity scores NOW by calling the emit_fidelity_scores tool. ' +
          'One number 0..1 per field, grounded in the evidence and the fields above.',
      },
    ],
    tools: [EMIT_FIDELITY_SCORES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: EMIT_FIDELITY_SCORES_TOOL_NAME },
  })

  const block = (resp.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === EMIT_FIDELITY_SCORES_TOOL_NAME,
  )
  if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
    return null
  }
  return {
    input: { ...(block.input as Record<string, unknown>) },
    emission_count: 1,
    source: 'forced_messages_api',
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
  }
}

// ── Brand Book · forced-emit de la SECCIÓN (CC#1 2026-08-10 · tiro Peniche 88922) ──
// Mismo patrón que el judge, para la otra mitad del problema: la RE-SÍNTESIS del Lazo A
// narró en vez de llamar `emit_brand_section` → el borrador no cambió → ciclo estéril
// (`track_reason: ciclo_esteril:resintesis_sin_tool`) → ciclos agotados → el manual NO se
// escribió, tras $2,93 de corrida. El descubrimiento y las notas de fidelidad ya tenían
// esta red; la sección de marca era la única que no.
export const EMIT_BRAND_SECTION_TOOL_NAME = 'emit_brand_section'

/** Valor plano O `{valor, fuente, confianza}` · espejo del `PROV()` del esquema zod vivo. */
const PROV_SCHEMA = (valor: object) => ({
  anyOf: [
    valor,
    {
      type: 'object',
      properties: {
        valor,
        fuente: { type: 'string' },
        confianza: { type: ['number', 'string', 'null'] },
      },
    },
  ],
})
const TEXTO = { type: 'string' } as const
const LISTA_SCHEMA = { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }] }

/**
 * Espejo en JSON Schema del zod vivo de `brand-section-server.js`. Los 7 GATEADOS
 * conservan su tipo plano exacto (el gate no se toca) · los 6 de Fase 1 admiten las dos
 * formas · `_field_meta` libre.
 */
export const EMIT_BRAND_SECTION_TOOL = {
  name: EMIT_BRAND_SECTION_TOOL_NAME,
  description:
    'Emit YOUR structured section of the brand book. Fill only the fields of your lens; ' +
    'leave the rest out. This tool call is the ONLY way your section reaches the consolidator.',
  input_schema: {
    type: 'object',
    required: ['lens'],
    properties: {
      lens: { type: 'string', enum: ['brand-strategist', 'editor-en-jefe', 'jefe-client-success'] },
      // GATEADOS · tipo plano · byte-equivalentes al zod
      positioning: TEXTO,
      icp_summary: TEXTO,
      voice_description: TEXTO,
      forbidden_words: { type: 'array', items: { type: 'string' } },
      required_terminology: { type: 'array', items: { type: 'string' } },
      customer_angle: TEXTO,
      retention_notes: TEXTO,
      // FASE 1 · provisionales · valor plano o con procedencia
      mision: PROV_SCHEMA(TEXTO),
      propuestas_de_valor: PROV_SCHEMA(LISTA_SCHEMA),
      personalidad: PROV_SCHEMA(LISTA_SCHEMA),
      tagline_opciones: PROV_SCHEMA(LISTA_SCHEMA),
      mensajes_clave: PROV_SCHEMA(LISTA_SCHEMA),
      proposito: PROV_SCHEMA(TEXTO),
      _field_meta: { type: 'object' },
    },
  },
} as const

/**
 * Los 7 campos GATEADOS y su tipo declarado. Son los que decide el gate: nada que no sea
 * del tipo declarado puede entrar acá.
 */
const GATEADOS_TEXTO = [
  'positioning',
  'icp_summary',
  'voice_description',
  'customer_angle',
  'retention_notes',
] as const
const GATEADOS_LISTA = ['forbidden_words', 'required_terminology'] as const

/**
 * Normaliza los 7 GATEADOS de una emisión FORZADA antes de injertarla.
 *
 * POR QUÉ · el camino forzado NO pasa por zod: es una llamada Messages-API, no una llamada
 * al MCP, así que la validación del servidor no corre y el injerto es verbatim. Si el
 * modelo devolviera un gateado en forma-objeto PESE al esquema, entraría tal cual y el
 * consolidador metería un objeto en el eje del gate → de ahí al juez y al manual.
 *
 * REGLA · (a) del tipo declarado ⇒ pasa · (b) envuelto en `{valor}` con el tipo correcto
 * adentro ⇒ se DESENVUELVE (es un valor legítimo con la forma equivocada · recuperarlo es
 * mejor que perderlo, y perderlo vacía el eje del gate, que es justo lo que evitamos) ·
 * (c) cualquier otra cosa ⇒ **se DESCARTA el campo**. Nunca basura al eje.
 *
 * Los 6 campos de Fase 1, `lens`, `_field_meta` y cualquier clave desconocida pasan
 * INTACTOS · su lector es tolerante a propósito y no los decide el gate.
 */
export function normalizarGateadosForzados(
  input: Record<string, unknown>,
): { input: Record<string, unknown>; desenvueltos: string[]; descartados: string[] } {
  const out: Record<string, unknown> = { ...input }
  const desenvueltos: string[] = []
  const descartados: string[] = []
  const envuelto = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v) && 'valor' in (v as Record<string, unknown>)
      ? (v as Record<string, unknown>).valor
      : undefined

  for (const k of GATEADOS_TEXTO) {
    if (!(k in out)) continue
    const v = out[k]
    if (typeof v === 'string') {
      if (!v.trim()) {
        delete out[k] // vacío = no lo llenó · que se note como AUSENTE, no como "lo dijo vacío"
        descartados.push(k)
      }
      continue
    }
    const dentro = envuelto(v)
    if (typeof dentro === 'string' && dentro.trim()) {
      out[k] = dentro
      desenvueltos.push(k)
    } else {
      delete out[k]
      descartados.push(k)
    }
  }

  for (const k of GATEADOS_LISTA) {
    if (!(k in out)) continue
    const v = out[k]
    const arr = Array.isArray(v) ? v : Array.isArray(envuelto(v)) ? (envuelto(v) as unknown[]) : null
    if (!arr) {
      delete out[k]
      descartados.push(k)
      continue
    }
    if (!Array.isArray(v)) desenvueltos.push(k)
    out[k] = arr.filter((x): x is string => typeof x === 'string')
  }

  return { input: out, desenvueltos, descartados }
}

export interface ForceBrandSectionArgs {
  model: string
  systemPrompt: string
  task: string
  /** Lo que el agente alcanzó a narrar · es el material del que se destila la sección. */
  researchText: string
  /** Qué lente es · se le recuerda para que no se equivoque de campos. */
  lens?: string | null
  /** Injectable for tests · defaults to a real Anthropic client. */
  createClient?: () => Pick<Anthropic, 'messages'>
}

/**
 * Compele el `emit_brand_section` vía Messages-API `tool_choice`. Devuelve el input del
 * tool parseado, o null si no vino ningún `tool_use`. El llamador envuelve en try/catch:
 * que falle la reparación NUNCA debe romper la corrida.
 */
export async function forceBrandSectionEmitViaMessagesApi(
  args: ForceBrandSectionArgs,
): Promise<ForceEmitOutcome | null> {
  const client = args.createClient ? args.createClient() : buildAnthropicClient()
  const work = args.researchText?.trim() || '(section drafted but not captured as text)'

  const resp = await client.messages.create({
    model: args.model,
    // 8.000 como el de descubrimiento (no 2.000 como el del judge): una sección puede
    // traer 7-13 campos de texto largo · el borrador real medido fue de 9.874 caracteres.
    max_tokens: 8000,
    system: args.systemPrompt,
    messages: [
      { role: 'user', content: args.task },
      { role: 'assistant', content: work },
      {
        role: 'user',
        content:
          'Emit your brand book section NOW by calling the emit_brand_section tool' +
          (args.lens ? ` with lens:"${args.lens}"` : '') +
          '. Use the content you just produced above. Prose is NOT an acceptable output — ' +
          'the tool call is the only way your section reaches the consolidator.',
      },
    ],
    tools: [EMIT_BRAND_SECTION_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: EMIT_BRAND_SECTION_TOOL_NAME },
  })

  const block = (resp.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === EMIT_BRAND_SECTION_TOOL_NAME,
  )
  if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
    return null
  }
  return {
    input: { ...(block.input as Record<string, unknown>) },
    emission_count: 1,
    source: 'forced_messages_api',
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
  }
}

export interface ForceEmitArgs {
  model: string
  systemPrompt: string
  task: string
  researchText: string
  clientId: string | null
  /** Injectable for tests · defaults to a real Anthropic client. */
  createClient?: () => Pick<Anthropic, 'messages'>
}

export interface ForceEmitOutcome {
  input: Record<string, unknown>
  emission_count: number
  source: 'forced_messages_api'
  inputTokens: number
  outputTokens: number
}

/** Build an Anthropic client · honours ANTHROPIC_BASE_URL (gateway) when set. */
export function buildAnthropicClient(): Anthropic {
  const baseURL = process.env.ANTHROPIC_BASE_URL
  return new Anthropic(baseURL ? { baseURL } : {})
}

/**
 * Force the discovery emission via the Messages API. Returns the parsed tool
 * input (with client_id pinned to the canonical value · the model is not
 * trusted to echo it), or null if no tool_use block came back. Never throws is
 * NOT guaranteed here · the caller wraps this in try/catch (the run must not
 * fail because the repair failed).
 */
export async function forceEmitViaMessagesApi(args: ForceEmitArgs): Promise<ForceEmitOutcome | null> {
  const client = args.createClient ? args.createClient() : buildAnthropicClient()
  const research = args.researchText?.trim() || '(research completed but not captured as text)'

  const resp = await client.messages.create({
    model: args.model,
    max_tokens: 8000,
    system: args.systemPrompt,
    messages: [
      { role: 'user', content: args.task },
      { role: 'assistant', content: research },
      {
        role: 'user',
        content:
          'Emit your structured discovery findings NOW by calling the emit_discovery_output tool. ' +
          (args.clientId ? `client_id MUST be exactly "${args.clientId}". ` : '') +
          'Use the competitors, own_handles, ICP, and competitive landscape from the research above.',
      },
    ],
    // `as const` makes the schema deeply-readonly (good for the exported literal
    // + test access) · the SDK's Tool type is mutable, so cast at the boundary.
    tools: [EMIT_DISCOVERY_OUTPUT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: EMIT_DISCOVERY_OUTPUT_TOOL_NAME },
  })

  const block = (resp.content ?? []).find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EMIT_DISCOVERY_OUTPUT_TOOL_NAME,
  )
  if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
    return null
  }

  const input: Record<string, unknown> = { ...(block.input as Record<string, unknown>) }
  // Pin the canonical client_id · the downstream brain persist keys every row on
  // it · a model-hallucinated id would orphan the chunks.
  if (args.clientId) input.client_id = args.clientId

  return {
    input,
    emission_count: 1,
    source: 'forced_messages_api',
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
  }
}
