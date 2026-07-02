/**
 * Onboarding executive report · slide-content model builder (Opción A · CC#3).
 *
 * Pure, provider-agnostic core: takes the client's brand book + competitor
 * data and produces a 6-slide content model (JSON). The Google Slides/Drive
 * RENDER is a separate phase, deferred until a Google service-account
 * credential exists on the platform (none today · CC#3 pre-smoke audit
 * 2026-07-01). Keeping the model pure means the render layer can be swapped
 * (Slides API · Google Doc · HTML→pptx) without touching this logic, and the
 * whole assembly is unit-testable without Supabase or Google.
 *
 * Data-mapping canon (verified against prod · brand book real de Náufrago):
 *   - positioning / icp_summary / customer_angle live in
 *     `client_brand_books.content_text.brand_book_draft.*` (JSON) · NOT columns.
 *   - elevator_pitch / voice_description ARE top-level columns (fallbacks).
 *   - competitors live in `client_brain_chunks` where
 *     `source_table = 'client_competitive_landscape'` · `section_label='name'`
 *     for the name + `section_label='why_competitor'` for the differentiator ·
 *     paired by `source_id`. There is NO `category` column.
 */

export interface CompetitorEntry {
  readonly name: string
  readonly why?: string
}

export interface ReportInput {
  readonly clientName: string
  readonly reportDateISO: string // caller stamps (Date.now() not available in some runtimes)
  readonly elevatorPitch?: string | null
  readonly tagline?: string | null
  readonly positioning?: string | null
  readonly icpSummary?: string | null
  readonly voiceDescription?: string | null
  readonly customerAngle?: string | null
  readonly competitors?: readonly CompetitorEntry[]
}

export interface Slide {
  readonly n: number
  readonly kind: 'cover' | 'positioning' | 'icp' | 'competitive' | 'voice' | 'next_steps'
  readonly title: string
  readonly subtitle?: string
  readonly body: readonly string[]
}

export interface ReportModel {
  readonly client_name: string
  readonly report_date: string
  readonly prepared_by: 'Zero Risk Agency'
  readonly slides: readonly Slide[]
}

/** First N non-empty lines of a block · used for the cover tagline. */
export function firstLines(text: string | null | undefined, n: number): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, n)
}

const PLACEHOLDER = '(pendiente · dato no disponible en el brand book)'

/** Build the 6-slide content model. Pure · no I/O. */
export function buildReportSlides(input: ReportInput): ReportModel {
  const coverTagline =
    firstLines(input.elevatorPitch, 2).join(' ') ||
    (input.tagline?.trim() ?? '') ||
    ''

  const competitors = (input.competitors ?? []).slice(0, 5)
  const competitiveBody =
    competitors.length > 0
      ? competitors.map((c) =>
          c.why ? `${c.name} — ${c.why}` : c.name,
        )
      : [PLACEHOLDER]

  const voiceBody: string[] = []
  if (input.voiceDescription?.trim()) voiceBody.push(input.voiceDescription.trim())
  if (input.customerAngle?.trim())
    voiceBody.push(`Ángulo emocional: ${input.customerAngle.trim()}`)
  if (voiceBody.length === 0) voiceBody.push(PLACEHOLDER)

  const slides: Slide[] = [
    {
      n: 1,
      kind: 'cover',
      title: input.clientName,
      subtitle: coverTagline || undefined,
      body: [input.reportDateISO.slice(0, 10), 'Preparado por Zero Risk Agency'],
    },
    {
      n: 2,
      kind: 'positioning',
      title: '¿Quién eres en el mercado?',
      body: [input.positioning?.trim() || PLACEHOLDER],
    },
    {
      n: 3,
      kind: 'icp',
      title: 'A quién le hablas',
      body: [input.icpSummary?.trim() || PLACEHOLDER],
    },
    {
      n: 4,
      kind: 'competitive',
      title: 'Tu mercado',
      body: competitiveBody,
    },
    {
      n: 5,
      kind: 'voice',
      title: 'Cómo le hablas a tu cliente',
      body: voiceBody,
    },
    {
      n: 6,
      kind: 'next_steps',
      title: 'La agencia ya tiene todo para arrancar',
      body: [
        'Campañas de contenido',
        'Anuncios',
        'Monitoreo competitivo',
        'Reportes semanales',
      ],
    },
  ]

  return {
    client_name: input.clientName,
    report_date: input.reportDateISO.slice(0, 10),
    prepared_by: 'Zero Risk Agency',
    slides,
  }
}

// ── Supabase data-shape helpers (pure · unit-testable) ────────────────────

interface BrandBookRow {
  elevator_pitch?: string | null
  tagline?: string | null
  voice_description?: string | null
  content_text?: unknown
}

interface BrainChunkRow {
  section_label?: string | null
  source_id?: string | null
  source_table?: string | null
  chunk_text?: string | null
}

/** Extract the brand_book_draft object from a client_brand_books row. */
export function extractDraft(row: BrandBookRow | null | undefined): Record<string, unknown> {
  const ct = row?.content_text
  let parsed: unknown = ct
  if (typeof ct === 'string') {
    try {
      parsed = JSON.parse(ct)
    } catch {
      parsed = {}
    }
  }
  const draft = (parsed as { brand_book_draft?: unknown } | null)?.brand_book_draft
  return draft && typeof draft === 'object' ? (draft as Record<string, unknown>) : {}
}

/**
 * Assemble up to 5 competitors from client_competitive_landscape chunks:
 * pair `section_label='name'` with `section_label='why_competitor'` by
 * `source_id`.
 */
export function assembleCompetitors(chunks: readonly BrainChunkRow[]): CompetitorEntry[] {
  const landscape = chunks.filter((c) => c.source_table === 'client_competitive_landscape')
  const nameBySource = new Map<string, string>()
  const whyBySource = new Map<string, string>()
  for (const c of landscape) {
    const sid = c.source_id ?? ''
    if (!sid) continue
    if (c.section_label === 'name' && c.chunk_text) nameBySource.set(sid, c.chunk_text.trim())
    if (c.section_label === 'why_competitor' && c.chunk_text)
      whyBySource.set(sid, c.chunk_text.trim())
  }
  const out: CompetitorEntry[] = []
  for (const [sid, name] of nameBySource) {
    out.push({ name, why: whyBySource.get(sid) })
    if (out.length >= 5) break
  }
  return out
}
