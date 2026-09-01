/**
 * Tests · Sprint B · pieza (e) · el recibo dice QUÉ marca quedó escrita.
 *
 * 🔴 EL ROJO · medido en producción el 2026-09-01, no deducido:
 *
 *   corrida 118856 (ssLtwYPt7zxuvnM2 · 20:24→20:29Z) · el manual PASÓ la vara
 *     · `[BB] Promote prep` emitió  promote_body.gate_outcome = "paso_la_vara"
 *     · `[BB] Promote → canon` recibió  { persisted: true, id: 5648b126-… }
 *   fila 5648b126-7b0c-4cb1-b5b4-90a3165c864f (GoEuropeAdventure · 20:29:11Z)
 *     · columna gate_outcome ....... NULL
 *     · content_text ............... SIN las claves gate_outcome/gate_nota
 *
 * La ausencia de las claves DENTRO del texto es la huella: el escritor de la pieza
 * (e) escribe `gate_outcome: null` explícito cuando el cuerpo no trae marca. Que no
 * estén significa que quien escribió la fila fue el escritor ANTERIOR a la pieza —
 * producción corre `495c8d7` (main · 27-ago) y las 12 líneas de (e) nunca salieron
 * de la rama local. Se publicó la columna (migración aplicada) y se publicó el flujo
 * (n8n · 28-ago 20:36Z), pero no el código.
 *
 * Y el modo de falla, que es lo que esta prueba cierra: el escritor viejo ACEPTA la
 * marca, la descarta y devuelve `persisted: true`. El recibo salió verde con la marca
 * perdida. Nadie mintió — nadie preguntó. Si el recibo hubiera dicho qué quedó escrito,
 * la corrida de hoy lo habría gritado en su propio registro.
 *
 * La prueba de la pieza (e.5) estaba VERDE mientras producción escribía nulo: probaba
 * una función del repositorio, no la que corre. El instrumento que faltaba —el que le
 * pregunta a producción— es `scripts/compuerta-marca-del-veredicto.mjs`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertSingle = vi.fn()
const existingMaybeSingle = vi.fn()
let insertado: Record<string, unknown> | null = null
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: existingMaybeSingle }) }) }),
      }),
      insert: (row: Record<string, unknown>) => {
        insertado = row
        return { select: () => ({ single: insertSingle }) }
      },
    }),
  }),
}))

const { POST } = await import('../src/app/api/brand-book/[clientId]/route')

const CID = '534362db-29d9-4c7d-9b88-95d1ba89fb7b'
const ctx = { params: Promise.resolve({ clientId: CID }) }
const req = (body: unknown) =>
  new Request('http://x/api/brand-book/' + CID, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
    body: JSON.stringify(body),
  })

/** el cuerpo EXACTO que mandó la corrida 118856, recortado a lo que importa */
const CUERPO_118856 = {
  brand_book: { positioning: 'GoEuropeAdventure es el único operador…', icp_summary: 'viajero…' },
  source: 'onboarding_collaborative_build',
  fidelity_passed: true,
  gate_outcome: 'paso_la_vara',
  gate_nota: null,
  fidelity_threshold: 0.85,
  approved_by: 'faithfulness_check',
}

beforeEach(() => {
  insertado = null
  insertSingle.mockReset()
  existingMaybeSingle.mockReset()
  existingMaybeSingle.mockResolvedValue({ data: null, error: null })
  process.env.INTERNAL_API_KEY = 'test-key'
})
afterEach(() => { delete process.env.INTERNAL_API_KEY })

/**
 * La base contesta lo que quedó en la fila (`.select('id, gate_outcome')` tras el
 * insert), no lo que traía el cuerpo. El simulacro respeta eso: si el escritor no
 * mapea la marca a la fila, acá vuelve vacía — que es exactamente lo que pasó en
 * producción el 01-sep.
 */
const respondeComoLaBase = (id: string) =>
  insertSingle.mockImplementation(async () => ({
    data: { id, gate_outcome: (insertado as Record<string, unknown> | null)?.gate_outcome ?? null },
    error: null,
  }))

describe('🔴→🟢 el recibo dice la marca que quedó escrita', () => {
  it('la corrida de hoy · el recibo devuelve la marca que se persistió', async () => {
    respondeComoLaBase('5648b126')
    const res = await POST(req(CUERPO_118856), ctx)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    // sin esto, un escritor que descarta la marca devuelve el MISMO recibo verde
    expect(j.gate_outcome, 'el recibo no dice qué marca quedó escrita').toBe('paso_la_vara')
    // y lo que dice el recibo es lo que se mandó a la base · no una copia del cuerpo
    expect((insertado as Record<string, unknown>).gate_outcome).toBe('paso_la_vara')
  })

  it('el manual del tope · el recibo lo distingue del aprobado', async () => {
    respondeComoLaBase('bb-tope')
    const res = await POST(
      req({ ...CUERPO_118856, fidelity_passed: false, gate_outcome: 'salio_al_tope', approved_by: 'cap_agotado' }),
      ctx,
    )
    expect((await res.json()).gate_outcome).toBe('salio_al_tope')
  })

  it('cuerpo SIN marca · el recibo la devuelve en nulo · no se inventa una', async () => {
    respondeComoLaBase('bb-vieja')
    const res = await POST(req({ brand_book: { positioning: 'x' }, fidelity_passed: true }), ctx)
    const j = await res.json()
    expect(j.persisted).toBe(true)
    expect(j.gate_outcome).toBe(null)
  })

  it('camino idempotente · el recibo dice la marca de la fila que YA estaba', async () => {
    // el caso de GoEuropeAdventure a partir de mañana: la fila existe y salió sin marca ·
    // el corte de idempotencia devuelve la de siempre, y hay que poder VER que está vacía.
    existingMaybeSingle.mockResolvedValue({ data: { id: '5648b126', gate_outcome: null }, error: null })
    const res = await POST(req(CUERPO_118856), ctx)
    const j = await res.json()
    expect(j.already_existed).toBe(true)
    expect(j.gate_outcome, 'el recibo del camino idempotente no dice nada de la marca').toBe(null)
    expect(insertSingle).not.toHaveBeenCalled()
  })
})

describe('(e) · lo que NO debe romper · el camino que acaba de correr bien', () => {
  it('la fila sigue llevando la marca en columna y dentro del texto', async () => {
    respondeComoLaBase('bb-1')
    await POST(req(CUERPO_118856), ctx)
    const row = insertado as Record<string, unknown>
    expect(row.gate_outcome).toBe('paso_la_vara')
    const t = JSON.parse(String(row.content_text))
    expect(t.gate_outcome).toBe('paso_la_vara')
    expect(t.fidelity_passed).toBe(true)
    expect(t.approved_by).toBe('faithfulness_check')
    expect(t.fidelity_threshold).toBe(0.85)
    expect(row.positioning).toBe('GoEuropeAdventure es el único operador…')
    expect(row.auto_generated_from).toBe('onboarding_collaborative_build')
    expect(row.human_validated).toBe(false)
    expect(row.version).toBe(1)
  })

  it('el corte de idempotencia sigue sin crear duplicados', async () => {
    existingMaybeSingle.mockResolvedValue({ data: { id: 'bb-existing', gate_outcome: 'paso_la_vara' }, error: null })
    const res = await POST(req(CUERPO_118856), ctx)
    const j = await res.json()
    expect(j.id).toBe('bb-existing')
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('el insert fallido sigue devolviendo 500 y persisted:false', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(req(CUERPO_118856), ctx)
    expect(res.status).toBe(500)
    expect((await res.json()).persisted).toBe(false)
  })
})
