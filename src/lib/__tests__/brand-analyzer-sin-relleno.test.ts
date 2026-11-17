/**
 * 17-nov · GO Lenovo «quitar rejas» · A·13 de CC3: el analizador de marca del alta ya no rellena con un estilo inventado
 * («Professional», «Friendly and engaging», «never_mention», industria «Unknown») cuando no puede leer el análisis.
 * El alta sigue: los campos quedan VACÍOS y se DECLARA por qué. US$ 0, sin red (el modelo y la base son de mentira).
 */
import { describe, expect, it, vi } from 'vitest'
import { BrandAnalyzer } from '../brand-analyzer'

function baseFalsa() {
  const filas: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      insert: (fila: Record<string, unknown>) => { filas.push(fila); return { select: () => ({ single: async () => ({ data: { id: 'bb-1' }, error: null }) }) } },
    }),
  }
  return { supabase: supabase as never, filas }
}
const descubrimiento = { pages: [{ url: 'https://ejemplo.test', title: 't', metaDescription: 'd', headings: [], bodyText: 'c', images: [], links: [], socialLinks: [], contactInfo: { emails: [], phones: [], address: null } }], errors: [], websiteUrl: 'https://ejemplo.test', socialProfiles: {}, colorPalette: [], contactInfo: {}, detectedTagline: null, detectedServices: [], totalPagesScraped: 1 } as never

async function analizarCon(respuesta: string) {
  const { supabase, filas } = baseFalsa()
  const a = new BrandAnalyzer(supabase)
  vi.spyOn(a as never as { callClaude: () => unknown }, 'callClaude').mockResolvedValue({ text: respuesta, inputTokens: 10, outputTokens: 5 } as never)
  const r = await a.analyzeBrand(descubrimiento, 'Marca X')
  const id = await a.writeBrandBookToDB('cli-1', r.analysis, 'https://ejemplo.test')
  return { r, id, fila: filas[0] }
}

describe('A·13 · sin análisis legible: vacío y declarado, nada inventado', () => {
  it('el alta sigue (se escribe el manual) con los campos de estilo VACÍOS', async () => {
    const { r, id, fila } = await analizarCon('esto no es json')
    expect(id).toBe('bb-1')
    for (const k of ['brand_purpose', 'brand_personality', 'voice_description', 'writing_style', 'elevator_pitch', 'imagery_style', 'competitor_mentions_policy']) expect(fila[k]).toBeNull()
    expect(fila.tone_guidelines).toEqual({})
    expect(r.analysis.detected_industry).toBeNull()
    expect(r.analysis.detected_market).toBeNull()
  })
  it('ninguno de los rellenos viejos vuelve', async () => {
    const { r, fila } = await analizarCon('esto no es json')
    const todo = JSON.stringify([r.analysis, fila])
    for (const relleno of ['Professional', 'Friendly and engaging', 'Clear and concise', 'never_mention', 'Unknown', 'purpose to be determined', 'provides solutions']) expect(todo).not.toContain(relleno)
  })
  it('lo declara: `sin_analisis` dice por qué faltan los campos', async () => {
    const { r } = await analizarCon('esto no es json')
    expect(r.analysis.sin_analisis).toMatch(/no se pudo leer.*campos vacíos, sin inventar/)
  })
  it('con un análisis legible, no declara nada y usa lo que el modelo leyó', async () => {
    const { r, fila } = await analizarCon(JSON.stringify({ brand_purpose: 'p', brand_personality: 'cálida', voice_description: 'v', tone_guidelines: { social_media: 's' }, writing_style: 'w', elevator_pitch: 'e', imagery_style: 'i', competitor_mentions_policy: 'acknowledge_neutral', brand_values: [], key_messages: [], value_propositions: [], primary_colors: [], suggested_forbidden_words: [], suggested_required_terminology: [], detected_industry: 'gastronomía', detected_market: 'B2C' }))
    expect(r.analysis.sin_analisis).toBeUndefined()
    expect(fila.brand_personality).toBe('cálida')
    expect(fila.competitor_mentions_policy).toBe('acknowledge_neutral')
  })
})

describe('A·13 · el pedido al modelo tampoco empuja a rellenar', () => {
  it('ya no dice «pon un valor razonable basado en la industria»; dice que lo deje en null', async () => {
    const { supabase } = baseFalsa()
    const a = new BrandAnalyzer(supabase)
    const espia = vi.spyOn(a as never as { callClaude: () => unknown }, 'callClaude').mockResolvedValue({ text: '{}', inputTokens: 1, outputTokens: 1 } as never)
    await a.analyzeBrand(descubrimiento, 'Marca X')
    const sistema = String((espia.mock.calls[0] as unknown[])[0])
    expect(sistema).not.toMatch(/valor razonable basado en la industria/)
    expect(sistema).toMatch(/déjalo en null \(o la lista vacía\): no lo rellenes/)
  })
})
