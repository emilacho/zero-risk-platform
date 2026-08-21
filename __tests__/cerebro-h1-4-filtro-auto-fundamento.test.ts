/**
 * CEREBRO · H1.4 · conectar el filtro anti-auto-fundamento
 *
 * Reconocimiento de CC#2 (20-ago · `raw/tasks/2026-08-20-LENOVO-H1.4-…`):
 *   - el filtro NO está duplicado ni mal escrito · `evidence-matcher.ts:84` está bien
 *   - lo que estaba mal es que `matchClaimsToChunks` tenía CERO llamadores: módulo muerto
 *   - el enchufe va en `onboarding-cimiento.ts:95`, donde hoy manda `resolveGrounding`
 *
 * EL AGUJERO, medido: `FidelityEvidenceRef` NO lleva `source_table`
 * (`fidelity-grader.ts:40-46`) ⇒ `resolveGrounding` no puede saber de qué tabla salió el
 * fragmento, y con semántica ANY (`fidelity-grader.ts:161-167`) **una sola** referencia
 * que se funde en el propio manual alcanza para declarar `chunk_linked`.
 * Eso es auto-fundamento: el manual demostrándose a sí mismo.
 *
 * ROJO OBLIGATORIO (del encargo): una afirmación de brand_books @1.000
 *   - SIN el filtro → el enchufe declara `chunk_linked` ⇒ estas pruebas FALLAN
 *   - CON el filtro → `prose_only` ⇒ pasan
 * Si pasaran en los dos casos, el filtro no está en el camino y el hito no cerró.
 *
 * Las dos trampas ya medidas, respetadas y verificadas abajo:
 *   1 · el umbral es 0.72 · no se inventa ni se sube "por prudencia"
 *   2 · gatea SOLO campos fácticos · el global es inalcanzable por diseño y dejaría
 *       todos los manuales en borrador para siempre
 *
 * $0 · CEREBRO mockeado · sin LLM · sin red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── CEREBRO simulado · keyed por texto de consulta ────────────────────────────
const cerebro: { porConsulta: Map<string, Array<{ chunk_id: string; source_table: string; similarity: number }>> } = {
  porConsulta: new Map(),
}
vi.mock('@/lib/client-brain', () => ({
  queryClientBrain: (p: { query: string }) =>
    Promise.resolve(
      (cerebro.porConsulta.get(p.query) ?? []).map((r) => ({
        chunk_id: r.chunk_id,
        source_table: r.source_table,
        source_id: 'sid',
        label: 'lbl',
        content_text: 'txt',
        similarity: r.similarity,
      })),
    ),
}))

const { resolveCimientoGrounding } = await import('../src/lib/jefatura/onboarding-cimiento')
const { DEFAULT_MATCH_THRESHOLD } = await import('../src/lib/jefatura/evidence-matcher')

const CLIENTE = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'
const POSICIONAMIENTO = 'Somos la escuela de surf de Peniche para viajeros que quieren progresar.'
const ICP = 'Viajero de 25-40 que reserva paquete de surf + alojamiento.'

const borrador = { positioning: POSICIONAMIENTO, icp_summary: ICP }

/** La referencia envenenada: el manual fundándose en el manual, con nota perfecta. */
const refAutoFundamento = [
  { field: 'positioning', claim: POSICIONAMIENTO, chunk_id: 'chunk-del-propio-manual', grounding: 'chunk_linked' as const },
]

beforeEach(() => { cerebro.porConsulta.clear() })

describe('H1.4 · EL AGUJERO · lo que declaraba el camino viejo (SIN el filtro)', () => {
  it('con la referencia envenenada, el derivador viejo declara chunk_linked · ése es el auto-fundamento', async () => {
    const { resolveGrounding } = await import('../src/lib/jefatura/fidelity-grader')

    // Semántica ANY (fidelity-grader.ts:161-167) · UNA sola referencia con chunk_id alcanza.
    // Y como FidelityEvidenceRef NO lleva source_table, no hay forma de saber que ese
    // fragmento salió del propio manual. Por eso el filtro no puede vivir acá.
    expect(resolveGrounding(refAutoFundamento)).toBe('chunk_linked')
  })

  it('el derivador viejo no distingue evidencia real de auto-fundamento · da lo MISMO en ambos', async () => {
    const { resolveGrounding } = await import('../src/lib/jefatura/fidelity-grader')

    const refReal = [{ field: 'positioning', chunk_id: 'c-competencia', grounding: 'chunk_linked' as const }]

    // idéntico veredicto para un caso legítimo y uno circular ⇒ el veredicto no informa nada
    expect(resolveGrounding(refReal)).toBe(resolveGrounding(refAutoFundamento))
  })
})

describe('H1.4 · una afirmación NO puede fundamentarse en el propio manual', () => {
  it('brand_books @1.000 · el auto-fundamento NO cuenta · queda prose_only', async () => {
    // el cerebro devuelve un calce perfecto… pero es del propio manual
    cerebro.porConsulta.set(POSICIONAMIENTO, [
      { chunk_id: 'chunk-del-propio-manual', source_table: 'client_brand_books', similarity: 1.0 },
    ])
    cerebro.porConsulta.set(ICP, [
      { chunk_id: 'chunk-del-propio-manual-2', source_table: 'client_brand_books', similarity: 1.0 },
    ])

    const r = await resolveCimientoGrounding({
      clientId: CLIENTE,
      brandBookDraft: borrador,
      evidenceRefs: refAutoFundamento,   // ← ANY diría chunk_linked · es la trampa
    })

    expect(r.grounding).toBe('prose_only')
    expect(r.factual_matched).toBe(0)
    expect(r.evidence_refs).toEqual([])
  })

  it('evidencia REAL de descubrimiento · sí funda · chunk_linked', async () => {
    cerebro.porConsulta.set(POSICIONAMIENTO, [
      { chunk_id: 'c-competencia', source_table: 'client_competitive_landscape', similarity: 0.81 },
    ])
    cerebro.porConsulta.set(ICP, [
      { chunk_id: 'c-icp', source_table: 'client_icp_documents', similarity: 0.77 },
    ])

    const r = await resolveCimientoGrounding({ clientId: CLIENTE, brandBookDraft: borrador })

    expect(r.grounding).toBe('chunk_linked')
    expect(r.factual_matched).toBe(2)
    expect(r.evidence_refs).toEqual(['c-competencia', 'c-icp'])
  })

  it('el auto-fundamento NO tapa a la evidencia real que viene detrás', async () => {
    // el propio manual calza @1.000 y la evidencia real @0.79 · debe ganar la real
    cerebro.porConsulta.set(POSICIONAMIENTO, [
      { chunk_id: 'chunk-del-propio-manual', source_table: 'client_brand_books', similarity: 1.0 },
      { chunk_id: 'c-competencia', source_table: 'client_competitive_landscape', similarity: 0.79 },
    ])
    cerebro.porConsulta.set(ICP, [
      { chunk_id: 'c-icp', source_table: 'client_icp_documents', similarity: 0.75 },
    ])

    const r = await resolveCimientoGrounding({ clientId: CLIENTE, brandBookDraft: borrador })

    expect(r.grounding).toBe('chunk_linked')
    expect(r.evidence_refs).toEqual(['c-competencia', 'c-icp'])
    expect(r.evidence_refs).not.toContain('chunk-del-propio-manual')
  })
})

describe('H1.4 · trampa 1 · el umbral es 0.72 · no se toca', () => {
  it('el módulo declara 0.72 y el enchufe no lo pisa', () => {
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.72)
  })

  it('0.74 funda (soporte real medido) · 0.69 no (ruido medido)', async () => {
    cerebro.porConsulta.set(POSICIONAMIENTO, [
      { chunk_id: 'c-borde-arriba', source_table: 'client_competitive_landscape', similarity: 0.74 },
    ])
    cerebro.porConsulta.set(ICP, [
      { chunk_id: 'c-borde-abajo', source_table: 'client_icp_documents', similarity: 0.69 },
    ])

    const r = await resolveCimientoGrounding({ clientId: CLIENTE, brandBookDraft: borrador })

    expect(r.factual_matched).toBe(1)                       // sólo el de 0.74
    expect(r.evidence_refs).toEqual(['c-borde-arriba'])
    expect(r.grounding).toBe('prose_only')                  // cobertura fáctica incompleta
  })
})

describe('H1.4 · trampa 2 · gatea SOLO campos fácticos', () => {
  it('las reglas de voz NO bloquean el grounding · si no, el manual queda en borrador para siempre', async () => {
    // los dos fácticos fundados · la regla de voz sin evidencia (es prescriptiva, no un hecho)
    cerebro.porConsulta.set(POSICIONAMIENTO, [
      { chunk_id: 'c-competencia', source_table: 'client_competitive_landscape', similarity: 0.81 },
    ])
    cerebro.porConsulta.set(ICP, [
      { chunk_id: 'c-icp', source_table: 'client_icp_documents', similarity: 0.77 },
    ])
    const VOZ = 'Hablar en tono cercano, sin tecnicismos.'
    cerebro.porConsulta.set(VOZ, [])   // sin evidencia · es correcto que no la tenga

    const r = await resolveCimientoGrounding({
      clientId: CLIENTE,
      brandBookDraft: { ...borrador, voice_description: VOZ },
    })

    expect(r.grounding).toBe('chunk_linked')   // la voz no lo bloquea
    expect(r.factual_total).toBe(2)            // sólo positioning + icp_summary gatean
  })
})

describe('H1.4 · sin poder verificar, no se afirma lo que no se sabe', () => {
  it('sin cliente no se puede consultar el cerebro ⇒ prose_only, aunque las refs digan lo contrario', async () => {
    const r = await resolveCimientoGrounding({
      clientId: null,
      brandBookDraft: borrador,
      evidenceRefs: refAutoFundamento,
    })

    expect(r.grounding).toBe('prose_only')
    expect(r.verified).toBe(false)   // declarado · no es lo mismo que "verificado y sin fundamento"
  })

  it('si el CEREBRO no responde, NO tumba la calificación · promueve provisional', async () => {
    // regresión que yo mismo introduje al enchufar: convertí una función pura en una
    // que sale a la red, en el camino bloqueante. Sin esta red, un cerebro caído
    // rompía la calificación entera de un manual que igual se podía promover.
    const matcherCaido = (() => Promise.reject(new Error('Embedding generation failed'))) as never

    const r = await resolveCimientoGrounding({
      clientId: CLIENTE,
      brandBookDraft: borrador,
      matcher: matcherCaido,
    })

    expect(r.grounding).toBe('prose_only')
    expect(r.verified).toBe(false)
  })

  it('sin campos fácticos en el borrador ⇒ prose_only · no hay nada que fundar', async () => {
    const r = await resolveCimientoGrounding({
      clientId: CLIENTE,
      brandBookDraft: { voice_description: 'tono cercano' },
    })

    expect(r.grounding).toBe('prose_only')
    expect(r.factual_total).toBe(0)
  })
})
