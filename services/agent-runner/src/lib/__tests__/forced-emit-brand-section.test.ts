/**
 * Tests · forced-emit de la SECCIÓN de marca (CC#1 2026-08-10 · tiro Peniche exec 88922).
 *
 * La re-síntesis del Lazo A narró en vez de llamar `emit_brand_section` ⇒ el borrador no
 * cambió ⇒ `ciclo_esteril:resintesis_sin_tool` ⇒ el manual NO se escribió tras $2,93.
 * Descubrimiento y notas de fidelidad ya tenían esta red; la sección era la única sin ella.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
    constructor() {}
  },
}))

const { forceBrandSectionEmitViaMessagesApi, EMIT_BRAND_SECTION_TOOL, EMIT_BRAND_SECTION_TOOL_NAME } =
  await import('../forced-emit-messages')
const { shouldForceBrandSectionEmit } = await import('../agent-sdk-runner')

const ARGS = {
  model: 'claude-sonnet-4-6',
  systemPrompt: 'Sos el consolidador del brand book.',
  task: 'Mejorá el BORRADOR con las CORRECCIONES...',
  researchText: 'Reescribí el positioning para anclarlo en la evidencia de Peniche...',
}
const SECCION = { lens: 'brand-strategist', positioning: 'P', icp_summary: 'I' }
const conToolUse = (input: unknown) => ({
  content: [{ type: 'tool_use', name: EMIT_BRAND_SECTION_TOOL_NAME, input }],
  usage: { input_tokens: 120, output_tokens: 900 },
})

beforeEach(() => createMock.mockReset())

describe('shouldForceBrandSectionEmit · el guarda', () => {
  const sinEmitir = { brandSectionToolCall: null }
  const yaEmitio = { brandSectionToolCall: { input: SECCION, emission_count: 1 } }
  const montado = { 'brand-section': {} }

  it('dispara cuando el tool está montado y el agente NO emitió (el caso 88922)', () => {
    expect(shouldForceBrandSectionEmit(montado, undefined, sinEmitir)).toBe(true)
  })

  it('NO dispara si el agente ya emitió solo · coste cero en el camino sano', () => {
    expect(shouldForceBrandSectionEmit(montado, undefined, yaEmitio)).toBe(false)
  })

  it('NO dispara si el tool no está montado (el agente no podía emitir)', () => {
    expect(shouldForceBrandSectionEmit({}, undefined, sinEmitir)).toBe(false)
    expect(shouldForceBrandSectionEmit(undefined, undefined, sinEmitir)).toBe(false)
  })

  it('NO dispara para la invocación-judge · ésa tiene su propia red y no emite sección', () => {
    expect(shouldForceBrandSectionEmit(montado, { fidelity_judge: true }, sinEmitir)).toBe(false)
  })

  it('sí dispara para las lentes y la re-síntesis (extra sin fidelity_judge)', () => {
    expect(shouldForceBrandSectionEmit(montado, { lens: 'editor-en-jefe' }, sinEmitir)).toBe(true)
    expect(shouldForceBrandSectionEmit(montado, {}, sinEmitir)).toBe(true)
  })
})

describe('forceBrandSectionEmitViaMessagesApi · compele el tool', () => {
  it('manda tool_choice forzado al tool correcto', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    await forceBrandSectionEmitViaMessagesApi(ARGS)
    const req = createMock.mock.calls[0][0]
    expect(req.tool_choice).toEqual({ type: 'tool', name: EMIT_BRAND_SECTION_TOOL_NAME })
    expect(req.tools[0].name).toBe(EMIT_BRAND_SECTION_TOOL_NAME)
  })

  it('usa 8.000 de salida · una sección es larga (el borrador real midió 9.874 ch)', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    await forceBrandSectionEmitViaMessagesApi(ARGS)
    expect(createMock.mock.calls[0][0].max_tokens).toBe(8000)
  })

  it('le pasa al modelo la tarea y lo que alcanzó a narrar', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    await forceBrandSectionEmitViaMessagesApi(ARGS)
    const msgs = createMock.mock.calls[0][0].messages
    expect(msgs[0].content).toBe(ARGS.task)
    expect(msgs[1].content).toBe(ARGS.researchText)
    expect(msgs[2].content).toContain('emit_brand_section')
  })

  it('le recuerda qué lente es cuando se le dice', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    await forceBrandSectionEmitViaMessagesApi({ ...ARGS, lens: 'jefe-client-success' })
    expect(createMock.mock.calls[0][0].messages[2].content).toContain('lens:"jefe-client-success"')
  })

  it('devuelve la sección + los tokens gastados', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    const r = await forceBrandSectionEmitViaMessagesApi(ARGS)
    expect(r?.input).toEqual(SECCION)
    expect(r?.emission_count).toBe(1)
    expect(r?.inputTokens).toBe(120)
    expect(r?.outputTokens).toBe(900)
  })

  it('devuelve null si no vino ningún tool_use (no inventa nada)', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'sigo narrando' }], usage: {} })
    expect(await forceBrandSectionEmitViaMessagesApi(ARGS)).toBeNull()
  })

  it('aguanta narración vacía sin romper', async () => {
    createMock.mockResolvedValue(conToolUse(SECCION))
    const r = await forceBrandSectionEmitViaMessagesApi({ ...ARGS, researchText: '' })
    expect(r?.input).toEqual(SECCION)
    expect(createMock.mock.calls[0][0].messages[1].content).toContain('not captured')
  })
})

describe('EMIT_BRAND_SECTION_TOOL · espejo del esquema zod vivo', () => {
  const p = EMIT_BRAND_SECTION_TOOL.input_schema.properties as Record<string, { type?: unknown }>

  it('los 7 GATEADOS conservan su tipo plano · el gate no se toca', () => {
    for (const k of ['positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes']) {
      expect(p[k].type).toBe('string')
    }
    for (const k of ['forbidden_words', 'required_terminology']) expect(p[k].type).toBe('array')
  })

  it('sólo `lens` es obligatoria', () => {
    expect(EMIT_BRAND_SECTION_TOOL.input_schema.required).toEqual(['lens'])
  })

  it('los 6 de Fase 1 admiten las DOS formas (plana y con procedencia)', () => {
    for (const k of ['mision', 'propuestas_de_valor', 'personalidad', 'tagline_opciones', 'mensajes_clave', 'proposito']) {
      const f = p[k] as { anyOf?: unknown[] }
      expect(Array.isArray(f.anyOf)).toBe(true)
      expect(f.anyOf).toHaveLength(2)
      const obj = (f.anyOf as Array<{ type?: string; properties?: Record<string, unknown> }>)[1]
      expect(obj.type).toBe('object')
      expect(Object.keys(obj.properties ?? {})).toEqual(['valor', 'fuente', 'confianza'])
    }
  })

  it('declara `_field_meta`', () => {
    expect(p._field_meta).toBeTruthy()
  })
})
