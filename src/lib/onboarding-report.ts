/**
 * Onboarding executive report · 7-slide content model + Slides render requests.
 *
 * FIX FORMATO (Emilio 2026-07-03): the old render pasted each brand-book field
 * as one full paragraph → walls of text + 3 bugs (positioning duplicated,
 * empty cover, mixed next-steps slide). New layout, applies to EVERY client:
 *   - each content slide = título-conclusión (headline = the takeaway) +
 *     3–6 short bullets (≤14 words) + the full original field text in the
 *     slide's SPEAKER NOTES.
 *   - the cover is populated; each field appears on ONE slide only.
 *
 * Adaptation is DETERMINISTIC + generalizable (no hardcoded Náufrago · $0):
 * per-kind headline templates + a splitter that turns a field into short
 * bullets, with the full text preserved to notes. A future upgrade can swap
 * `deriveBullets` for an LLM few-shot pass (quality bar = the Náufrago target
 * in the spec) without touching the render.
 *
 * Data-mapping (verified vs prod):
 *   - positioning/icp_summary/customer_angle ← content_text.brand_book_draft.*
 *   - elevator_pitch/voice_description ← top-level columns (fallbacks)
 *   - competitors ← client_brain_chunks (source_table='client_competitive_landscape')
 */

export interface CompetitorEntry {
  readonly name: string
  readonly why?: string
}

export interface ReportInput {
  readonly clientName: string
  readonly reportDateISO: string
  readonly elevatorPitch?: string | null
  readonly tagline?: string | null
  readonly positioning?: string | null
  readonly icpSummary?: string | null
  readonly voiceDescription?: string | null
  readonly customerAngle?: string | null
  readonly competitors?: readonly CompetitorEntry[]
}

export type SlideKind =
  | 'cover'
  | 'positioning'
  | 'icp'
  | 'competitive'
  | 'voice'
  | 'emotional_angle'
  | 'next_steps'

export interface Slide {
  readonly n: number
  readonly kind: SlideKind
  readonly headline: string
  readonly bullets: readonly string[]
  /** Full original field text · goes to the slide's speaker notes. */
  readonly notes: string
}

export interface ReportModel {
  readonly client_name: string
  readonly report_date: string
  readonly prepared_by: 'Zero Risk Agency'
  readonly slides: readonly Slide[]
}

const MAX_BULLET_WORDS = 14
const PLACEHOLDER = 'Dato no disponible en el brand book'

/** Trim a phrase to ≤ maxWords words (adds ellipsis when cut). */
export function clampWords(text: string, maxWords = MAX_BULLET_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ') + '…'
}

/**
 * Split a field into short bullets. Prefers explicit structure (numbered
 * "1." items, newline segments) · falls back to sentence split. Each bullet
 * clamped to ≤14 words. Deterministic.
 */
export function deriveBullets(text: string | null | undefined, max = 6): string[] {
  if (!text || !text.trim()) return []
  const t = text.trim()
  let parts: string[] = []
  if (/(^|\s)\d+[.)]\s/.test(t)) {
    parts = t.split(/(?:^|\s)\d+[.)]\s+/).map((s) => s.trim()).filter(Boolean)
  } else if (t.includes('\n')) {
    parts = t.split(/\r?\n/).map((s) => s.replace(/^[—\-·•\s]+/, '').trim()).filter(Boolean)
  } else {
    parts = t.split(/(?<=[.;])\s+/).map((s) => s.trim()).filter(Boolean)
  }
  return parts.slice(0, max).map((p) => clampWords(p))
}

/** First non-empty clause of a field · used for headlines. */
function firstClause(text: string | null | undefined, maxWords = 12): string {
  if (!text) return ''
  const first = text.trim().split(/(?<=[.;\n])\s+/)[0] ?? ''
  return clampWords(first.replace(/[.;]$/, ''), maxWords)
}

/** Build the 7-slide model · deterministic adaptation · full text → notes. */
export function buildReportSlides(input: ReportInput): ReportModel {
  const date = input.reportDateISO.slice(0, 10)
  const positioning = input.positioning?.trim() || ''
  const icp = input.icpSummary?.trim() || ''
  const voice = input.voiceDescription?.trim() || ''
  const angle = input.customerAngle?.trim() || ''
  const competitors = (input.competitors ?? []).slice(0, 6)

  const icpSegments = icp
    .split(/SEGMENTO\s*\d+/i)
    .map((s) => s.replace(/^[\s·—-]+/, '').trim())
    .filter(Boolean)

  const slides: Slide[] = [
    {
      n: 1,
      kind: 'cover',
      headline: input.clientName,
      bullets: [
        'Reporte de Onboarding · Estrategia de Marca',
        `Preparado por Zero Risk Agency · ${date}`,
      ],
      notes: input.elevatorPitch?.trim() || '',
    },
    {
      n: 2,
      kind: 'positioning',
      headline: firstClause(positioning) || '¿Quién eres en el mercado?',
      bullets: positioning ? deriveBullets(positioning, 5) : [PLACEHOLDER],
      notes: positioning,
    },
    {
      n: 3,
      kind: 'icp',
      headline:
        icpSegments.length > 1
          ? `${icpSegments.length} perfiles, un rechazo común a la trampa turística`
          : 'A quién le hablas',
      bullets:
        icpSegments.length > 0
          ? icpSegments.slice(0, 6).map((s) => clampWords(s))
          : deriveBullets(icp, 5).length
            ? deriveBullets(icp, 5)
            : [PLACEHOLDER],
      notes: icp,
    },
    {
      n: 4,
      kind: 'competitive',
      headline: 'Tu mercado — el mercado ya valida al especialista',
      bullets:
        competitors.length > 0
          ? competitors.map((c) => clampWords(c.why ? `${c.name}: ${c.why}` : c.name))
          : [PLACEHOLDER],
      notes: competitors.map((c) => (c.why ? `${c.name} — ${c.why}` : c.name)).join('\n'),
    },
    {
      n: 5,
      kind: 'voice',
      headline: 'Cómo le hablas — voz de local, no de folleto turístico',
      bullets: voice ? deriveBullets(voice, 6) : [PLACEHOLDER],
      notes: voice,
    },
    {
      n: 6,
      kind: 'emotional_angle',
      headline: firstClause(angle) || 'Ángulo emocional',
      bullets: angle ? deriveBullets(angle, 5) : [PLACEHOLDER],
      notes: angle,
    },
    {
      n: 7,
      kind: 'next_steps',
      headline: 'La agencia ya tiene todo para arrancar',
      bullets: [
        'Campañas de contenido',
        'Anuncios',
        'Monitoreo competitivo',
        'Reportes semanales',
      ],
      notes: '',
    },
  ]

  return {
    client_name: input.clientName,
    report_date: date,
    prepared_by: 'Zero Risk Agency',
    slides,
  }
}

// ── Supabase data-shape helpers (pure) ────────────────────────────────────

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
    if (out.length >= 6) break
  }
  return out
}

// ── Slides batchUpdate requests (pure) · título + viñetas ─────────────────
// The renderer must delete the auto-created default slide (its objectId is
// only known after presentations.create) · pass it as `defaultSlideObjectId`
// to prepend a deleteObject (fixes the "empty cover" bug). Speaker notes need
// the per-slide notes placeholder id (only known post-create) · the renderer
// applies them in a 2nd pass via `notesBySlideNumber()`.

export function buildSlidesBatchRequests(
  model: ReportModel,
  defaultSlideObjectId?: string,
): object[] {
  const reqs: object[] = []
  if (defaultSlideObjectId) reqs.push({ deleteObject: { objectId: defaultSlideObjectId } })
  model.slides.forEach((slide) => {
    const sid = `slide_${slide.n}`
    const titleId = `s${slide.n}_title`
    const bodyId = `s${slide.n}_body`
    reqs.push({ createSlide: { objectId: sid, slideLayoutReference: { predefinedLayout: 'BLANK' } } })
    reqs.push({
      createShape: {
        objectId: titleId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: 8500000, unit: 'EMU' }, height: { magnitude: 1100000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 400000, translateY: 400000, unit: 'EMU' },
        },
      },
    })
    reqs.push({ insertText: { objectId: titleId, text: slide.headline, insertionIndex: 0 } })
    reqs.push({
      updateTextStyle: {
        objectId: titleId,
        style: { fontSize: { magnitude: 22, unit: 'PT' }, bold: true },
        textRange: { type: 'ALL' },
        fields: 'fontSize,bold',
      },
    })
    const bodyText = slide.bullets.map((b) => `•  ${b}`).join('\n')
    reqs.push({
      createShape: {
        objectId: bodyId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: 8500000, unit: 'EMU' }, height: { magnitude: 3600000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 400000, translateY: 1700000, unit: 'EMU' },
        },
      },
    })
    reqs.push({ insertText: { objectId: bodyId, text: bodyText || ' ', insertionIndex: 0 } })
    reqs.push({
      updateTextStyle: {
        objectId: bodyId,
        style: { fontSize: { magnitude: 15, unit: 'PT' } },
        textRange: { type: 'ALL' },
        fields: 'fontSize',
      },
    })
  })
  return reqs
}

/** Map of slide number → speaker-notes text (renderer's 2nd pass). */
export function notesBySlideNumber(model: ReportModel): Record<number, string> {
  const out: Record<number, string> = {}
  for (const s of model.slides) if (s.notes) out[s.n] = s.notes
  return out
}
