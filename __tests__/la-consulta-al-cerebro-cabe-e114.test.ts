/**
 * 🔴 E114 · LA CONSULTA AL CEREBRO TIENE QUE CABER.
 *
 * Medido (E113 · Náufrago): el corredor embebía como consulta el pedido ENTERO del redactor de planeación
 * (43.165 caracteres ≈ 12.000 tokens); `text-embedding-3-small` admite 8.192 → OpenAI 400 «maximum context
 * length is 8192 tokens» → `embed_query_failed` → las dos planeaciones (E107 · E108) salieron sin cerebro
 * (`brain_hit:false`). Las lentes del cimiento (≤14.000) sí recibían 5 trozos.
 *
 * Fija: la consulta se recorta a la CABEZA del pedido (MAX_QUERY_CHARS = 6.000) y se declara
 * (`brain_query_chars` · `brain_query_truncated`); un pedido corto viaja entero; el resto del contrato
 * (trozos · evidence_refs · grounding · errores) no cambia. Sin red: OpenAI y la RPC simulados; el pedido es
 * el REAL grabado en 146630.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enrichSystemPromptWithClientBrain, MAX_QUERY_CHARS, OLD_VERSION_MARGIN } from '../services/agent-runner/src/lib/brain-enrichment'

const EV = JSON.parse(readFileSync(join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS/evidencia-146630-e114.json'), 'utf8')) as { cliente_id: string; pedido: string; pedido_chars: number }
const TOPE_TOKENS_MODELO = 8192
const LIMITE_CHARS_OPENAI = 25000 // simulación conservadora: por encima de esto el modelo real ya rechaza (43k chars = 12k tokens)

const embeds: string[] = []
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as { input: string; model: string; dimensions: number }
  embeds.push(body.input)
  if (body.input.length > LIMITE_CHARS_OPENAI) {
    return { ok: false, status: 400, json: async () => ({ error: { message: `Invalid 'input': maximum context length is ${TOPE_TOKENS_MODELO} tokens.` } }) } as unknown as Response
  }
  return { ok: true, status: 200, json: async () => ({ data: [{ embedding: new Array(body.dimensions).fill(0.01) }], usage: { total_tokens: Math.round(body.input.length / 3.6) } }) } as unknown as Response
})
const filas = [
  { chunk_id: 'c-1', source_table: 'client_brand_books', source_id: '37c8a8bd', section_label: 'positioning', chunk_text: 'Náufrago ocupa un eje…', similarity: 0.59 },
  { chunk_id: 'c-2', source_table: 'client_competitive_landscape', source_id: '0736401b', section_label: 'instagram_competitive', chunk_text: 'La Casa del Encebollado…', similarity: 0.7 },
]
const rpc = vi.fn(async () => ({ data: filas, error: null }))
const supabase = { rpc } as unknown as Parameters<typeof enrichSystemPromptWithClientBrain>[0]['supabase']

beforeEach(() => { embeds.length = 0; rpc.mockClear(); fetchMock.mockClear(); process.env.OPENAI_API_KEY = 'test-openai'; global.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { delete process.env.OPENAI_API_KEY })

describe('el rojo · el pedido real del redactor no cabe en el embedding', () => {
  it('el pedido grabado de 146630 mide 43.165 chars (≈12.000 tokens · tope 8.192) · embebido entero, OpenAI lo rechaza', async () => {
    expect(EV.pedido.length).toBe(43165)
    expect(EV.pedido_chars).toBe(43165)
    expect(Math.round(EV.pedido.length / 3.6)).toBeGreaterThan(TOPE_TOKENS_MODELO)
    const r = await fetchMock('https://api.openai.com/v1/embeddings', { body: JSON.stringify({ input: '[campaign-brief-agent] ' + EV.pedido, model: 'text-embedding-3-small', dimensions: 1536 }) })
    expect(r.ok).toBe(false)
  })
})

describe('el verde · sólo la cabeza va como consulta · y el cerebro contesta', () => {
  it('con el pedido real: consulta = 6.000 chars (recortada · declarada) · empieza por [slug] + instrucción · 2 trozos · brain_hit', async () => {
    const out = await enrichSystemPromptWithClientBrain({ supabase, clientId: EV.cliente_id, taskDescription: EV.pedido, agentSlug: 'campaign-brief-agent', topK: 5 })
    expect(embeds).toHaveLength(1)
    expect(embeds[0].length).toBe(MAX_QUERY_CHARS)
    expect(embeds[0].startsWith('[campaign-brief-agent] Sos el redactor de planes')).toBe(true)
    expect(out.brain_hit).toBe(true)
    expect(out.brain_chunks_count).toBe(2)
    expect(out.brain_query_chars).toBe(MAX_QUERY_CHARS)
    expect(out.brain_query_truncated).toBe(true)
    expect(out.error).toBeUndefined()
    expect(out.evidence_refs).toEqual(['c-1', 'c-2'])
    expect(out.grounding).toBe('prose_only')
    expect(out.enrichment).toContain('client_brand_books · positioning')
    // E116 · se piden top_k + margen para poder descartar trozos del manual de versiones viejas
    expect(rpc).toHaveBeenCalledWith('query_client_brain', expect.objectContaining({ p_client_id: EV.cliente_id, p_top_k: 5 + OLD_VERSION_MARGIN }))
  })
  it('un pedido corto (como los de las lentes) viaja ENTERO · sin recorte declarado', async () => {
    const corto = 'Escribí el posicionamiento de Náufrago con la materia del cliente.'
    const out = await enrichSystemPromptWithClientBrain({ supabase, clientId: EV.cliente_id, taskDescription: corto, agentSlug: 'brand-strategist' })
    expect(embeds[0]).toBe('[brand-strategist] ' + corto)
    expect(out.brain_query_chars).toBe(embeds[0].length)
    expect(out.brain_query_truncated).toBe(false)
    expect(out.brain_hit).toBe(true)
  })
  it('el tope es 6.000: cabe con margen aunque el texto sea denso (≤ 3.000 tokens a 2 chars/token)', () => {
    expect(MAX_QUERY_CHARS).toBe(6000)
    expect(MAX_QUERY_CHARS / 2).toBeLessThan(TOPE_TOKENS_MODELO)
  })
})

describe('nada más cambió · los caminos de fallo siguen declarando', () => {
  it('sin OPENAI_API_KEY → embed_query_failed (como antes) · ahora con los chars declarados', async () => {
    delete process.env.OPENAI_API_KEY
    const out = await enrichSystemPromptWithClientBrain({ supabase, clientId: EV.cliente_id, taskDescription: EV.pedido, agentSlug: 'campaign-brief-agent' })
    expect(out).toMatchObject({ brain_hit: false, brain_chunks_count: 0, error: 'embed_query_failed', brain_query_chars: MAX_QUERY_CHARS, brain_query_truncated: true })
  })
  it('cerebro vacío → brain_empty_for_client · error de RPC → rpc_error · sin clientId → vacío sin llamar', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect((await enrichSystemPromptWithClientBrain({ supabase, clientId: EV.cliente_id, taskDescription: 'x' })).error).toBe('brain_empty_for_client')
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never)
    expect((await enrichSystemPromptWithClientBrain({ supabase, clientId: EV.cliente_id, taskDescription: 'x' })).error).toBe('rpc_error: boom')
    embeds.length = 0
    const vacio = await enrichSystemPromptWithClientBrain({ supabase, clientId: null, taskDescription: EV.pedido })
    expect(vacio.brain_hit).toBe(false)
    expect(embeds).toHaveLength(0)
  })
})
