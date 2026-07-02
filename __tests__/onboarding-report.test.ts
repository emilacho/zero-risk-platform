/**
 * Tests · onboarding executive report · slide-model builder + data helpers.
 * Fixtures mirror the REAL prod shape of Náufrago's brand book (content_text
 * .brand_book_draft) + competitive-landscape chunks.
 */
import { describe, it, expect } from 'vitest'
import {
  buildReportSlides,
  buildSlidesBatchRequests,
  extractDraft,
  assembleCompetitors,
  firstLines,
  type ReportInput,
} from '../src/lib/onboarding-report'

const baseInput: ReportInput = {
  clientName: 'Náufrago',
  reportDateISO: '2026-07-02T14:00:00.000Z',
  elevatorPitch: 'Náufrago es el único restaurante en Olón especialista en encebollado.\nUna categoría propia.',
  tagline: null,
  positioning: 'El único especialista en encebollado de Olón.',
  icpSummary: 'SEGMENTO 1 · Viajero extranjero en la Ruta del Spondylus.',
  voiceDescription: 'Sensorial antes que adjetival.',
  customerAngle: 'El cliente valida su elección de destino.',
  competitors: [
    { name: 'Rasimar Restaurante', why: 'más reseñas en Google Maps' },
    { name: 'Marisquería El Náufrago', why: 'nombre confuso' },
  ],
}

describe('buildReportSlides', () => {
  it('produces exactly 6 slides in canonical order', () => {
    const m = buildReportSlides(baseInput)
    expect(m.slides).toHaveLength(6)
    expect(m.slides.map((s) => s.kind)).toEqual([
      'cover',
      'positioning',
      'icp',
      'competitive',
      'voice',
      'next_steps',
    ])
  })

  it('slide 1 cover · client name + 2-line elevator pitch + prepared-by', () => {
    const s = buildReportSlides(baseInput).slides[0]
    expect(s.title).toBe('Náufrago')
    expect(s.subtitle).toContain('encebollado')
    expect(s.body).toContain('Preparado por Zero Risk Agency')
    expect(s.body).toContain('2026-07-02')
  })

  it('slide 4 competitive · name — why format, capped at 5', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, why: `w${i}` }))
    const s = buildReportSlides({ ...baseInput, competitors: many }).slides[3]
    expect(s.body).toHaveLength(5)
    expect(s.body[0]).toBe('C0 — w0')
  })

  it('slide 5 voice · voice_description + customer angle', () => {
    const s = buildReportSlides(baseInput).slides[4]
    expect(s.body[0]).toContain('Sensorial')
    expect(s.body.some((b) => b.includes('Ángulo emocional'))).toBe(true)
  })

  it('slide 6 next steps · static bullets', () => {
    const s = buildReportSlides(baseInput).slides[5]
    expect(s.body).toContain('Monitoreo competitivo')
    expect(s.body).toContain('Reportes semanales')
  })

  it('missing data → placeholder, never crashes', () => {
    const m = buildReportSlides({
      clientName: 'X',
      reportDateISO: '2026-07-02T00:00:00Z',
    })
    expect(m.slides[1].body[0]).toContain('pendiente')
    expect(m.slides[3].body[0]).toContain('pendiente')
    expect(m.slides).toHaveLength(6)
  })
})

describe('buildSlidesBatchRequests (n8n Slides node · OAuth-as-user)', () => {
  it('emits createSlide + title/body shape + insertText per slide (6 slides)', () => {
    const model = buildReportSlides(baseInput)
    const reqs = buildSlidesBatchRequests(model) as Array<Record<string, unknown>>
    expect(reqs).toHaveLength(30) // 5 requests × 6 slides
    expect(reqs.filter((r) => 'createSlide' in r)).toHaveLength(6)
    expect(reqs.filter((r) => 'createShape' in r)).toHaveLength(12)
    expect(reqs.filter((r) => 'insertText' in r)).toHaveLength(12)
    const firstInsert = reqs.find((r) => 'insertText' in r) as {
      insertText: { text: string; objectId: string }
    }
    expect(firstInsert.insertText.objectId).toBe('s1_title')
    expect(firstInsert.insertText.text).toContain('Náufrago')
  })
})

describe('firstLines', () => {
  it('returns first N non-empty trimmed lines', () => {
    expect(firstLines('a\n\n b \nc\nd', 2)).toEqual(['a', 'b'])
  })
  it('empty/null → []', () => {
    expect(firstLines(null, 2)).toEqual([])
    expect(firstLines('', 2)).toEqual([])
  })
})

describe('extractDraft', () => {
  it('parses content_text JSON string → brand_book_draft', () => {
    const row = {
      content_text: JSON.stringify({
        brand_book_draft: { positioning: 'P', icp_summary: 'I', customer_angle: 'A' },
        fidelity_passed: true,
      }),
    }
    const d = extractDraft(row)
    expect(d.positioning).toBe('P')
    expect(d.icp_summary).toBe('I')
  })
  it('handles object content_text + missing/invalid gracefully', () => {
    expect(extractDraft({ content_text: { brand_book_draft: { positioning: 'Z' } } }).positioning).toBe('Z')
    expect(extractDraft({ content_text: 'not-json' })).toEqual({})
    expect(extractDraft(null)).toEqual({})
    expect(extractDraft({})).toEqual({})
  })
})

describe('assembleCompetitors', () => {
  it('pairs name + why_competitor by source_id, only from competitive-landscape', () => {
    const chunks = [
      { source_table: 'client_competitive_landscape', section_label: 'name', source_id: 's1', chunk_text: 'Rasimar' },
      { source_table: 'client_competitive_landscape', section_label: 'why_competitor', source_id: 's1', chunk_text: 'más reseñas' },
      { source_table: 'client_competitive_landscape', section_label: 'name', source_id: 's2', chunk_text: 'El Náufrago' },
      // noise from another source_table must be ignored
      { source_table: 'client_icp_documents', section_label: 'name', source_id: 's9', chunk_text: 'IGNORE' },
    ]
    const out = assembleCompetitors(chunks)
    expect(out).toEqual([
      { name: 'Rasimar', why: 'más reseñas' },
      { name: 'El Náufrago', why: undefined },
    ])
  })
  it('caps at 5', () => {
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      source_table: 'client_competitive_landscape',
      section_label: 'name',
      source_id: `s${i}`,
      chunk_text: `C${i}`,
    }))
    expect(assembleCompetitors(chunks)).toHaveLength(5)
  })
})
