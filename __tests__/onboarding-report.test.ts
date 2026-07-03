/**
 * Tests · onboarding executive report · 7-slide model + FIX FORMATO.
 * Fixtures mirror the REAL prod shape of Náufrago's brand book.
 */
import { describe, it, expect } from 'vitest'
import {
  buildReportSlides,
  buildSlidesBatchRequests,
  notesBySlideNumber,
  deriveBullets,
  clampWords,
  extractDraft,
  assembleCompetitors,
  type ReportInput,
} from '../src/lib/onboarding-report'

const baseInput: ReportInput = {
  clientName: 'Náufrago',
  reportDateISO: '2026-07-03T14:00:00.000Z',
  elevatorPitch: 'Náufrago es el único restaurante en Olón especialista en encebollado.',
  positioning:
    'Náufrago es el único especialista en encebollado de Olón. Ningún competidor reclama la categoría. El riesgo es la confusión con El Náufrago de Gualaceo.',
  icpSummary:
    'SEGMENTO 1 · Viajero extranjero: quiere autenticidad. SEGMENTO 2 · Turista ecuatoriano: busca sabor real.',
  voiceDescription:
    '1. Sensorial antes que adjetival. 2. Voz de local, no de folleto. 3. Educador cultural con orgullo.',
  customerAngle:
    'No vienen solo a comer: vienen a validar su elección de destino. La autenticidad retiene.',
  competitors: [
    { name: 'Rasimar', why: 'lidera descubrimiento digital local' },
    { name: 'Mali Thai', why: 'compite por el mismo horario' },
  ],
}

describe('buildReportSlides · 7-slide layout (FIX FORMATO)', () => {
  it('produces exactly 7 slides in canonical order', () => {
    const m = buildReportSlides(baseInput)
    expect(m.slides).toHaveLength(7)
    expect(m.slides.map((s) => s.kind)).toEqual([
      'cover',
      'positioning',
      'icp',
      'competitive',
      'voice',
      'emotional_angle',
      'next_steps',
    ])
  })

  it('BUG FIX · cover is populated (headline + bullets), not empty', () => {
    const s = buildReportSlides(baseInput).slides[0]
    expect(s.headline).toBe('Náufrago')
    expect(s.bullets.length).toBeGreaterThanOrEqual(2)
    expect(s.bullets.some((b) => b.includes('Zero Risk Agency'))).toBe(true)
  })

  it('BUG FIX · positioning appears ONLY on slide 2, not duplicated', () => {
    const m = buildReportSlides(baseInput)
    const withPositioning = m.slides.filter((s) =>
      s.notes.includes('especialista en encebollado de Olón'),
    )
    expect(withPositioning.map((s) => s.kind)).toEqual(['positioning'])
    expect(m.slides[0].bullets.join(' ')).not.toContain('especialista en encebollado de Olón')
  })

  it('BUG FIX · next_steps has only the 4 static bullets, no pasted paragraph', () => {
    const s = buildReportSlides(baseInput).slides[6]
    expect(s.bullets).toEqual([
      'Campañas de contenido',
      'Anuncios',
      'Monitoreo competitivo',
      'Reportes semanales',
    ])
    expect(s.notes).toBe('')
  })

  it('bullets are short (≤14 words) · full text preserved in notes', () => {
    const m = buildReportSlides(baseInput)
    for (const s of m.slides)
      for (const b of s.bullets)
        expect(b.split(/\s+/).length).toBeLessThanOrEqual(15)
    // full original field text preserved verbatim in notes
    expect(m.slides[1].notes).toBe(baseInput.positioning)
  })

  it('icp headline counts segments · bullets one per segment', () => {
    const s = buildReportSlides(baseInput).slides[2]
    expect(s.headline).toContain('2 perfiles')
    expect(s.bullets.length).toBe(2)
  })

  it('missing data → placeholder, never crashes', () => {
    const m = buildReportSlides({ clientName: 'X', reportDateISO: '2026-07-03T00:00:00Z' })
    expect(m.slides).toHaveLength(7)
    expect(m.slides[1].bullets[0]).toContain('no disponible')
  })
})

describe('deriveBullets / clampWords', () => {
  it('clampWords caps to N words with ellipsis', () => {
    expect(clampWords('a b c d', 2)).toBe('a b…')
    expect(clampWords('a b', 5)).toBe('a b')
  })
  it('deriveBullets splits numbered lists', () => {
    const b = deriveBullets('1. uno dos. 2. tres cuatro. 3. cinco', 3)
    expect(b.length).toBe(3)
    expect(b[0]).toContain('uno')
  })
  it('deriveBullets splits sentences when no structure', () => {
    expect(deriveBullets('Primera cosa. Segunda cosa. Tercera.', 2)).toHaveLength(2)
  })
  it('empty → []', () => {
    expect(deriveBullets('')).toEqual([])
    expect(deriveBullets(null)).toEqual([])
  })
})

describe('buildSlidesBatchRequests', () => {
  it('renders title+body+styles per slide (7 slides) · no default-slide leak', () => {
    const model = buildReportSlides(baseInput)
    const reqs = buildSlidesBatchRequests(model) as Array<Record<string, unknown>>
    expect(reqs.filter((r) => 'createSlide' in r)).toHaveLength(7)
    expect(reqs.filter((r) => 'createShape' in r)).toHaveLength(14)
    expect(reqs.filter((r) => 'insertText' in r)).toHaveLength(14)
    expect(reqs.filter((r) => 'updateTextStyle' in r)).toHaveLength(14)
    expect(reqs.filter((r) => 'deleteObject' in r)).toHaveLength(0)
  })

  it('prepends deleteObject when the default slide id is provided (empty-cover fix)', () => {
    const model = buildReportSlides(baseInput)
    const reqs = buildSlidesBatchRequests(model, 'p_default') as Array<Record<string, unknown>>
    expect(reqs[0]).toEqual({ deleteObject: { objectId: 'p_default' } })
  })

  it('bullets rendered with bullet marks', () => {
    const model = buildReportSlides(baseInput)
    const reqs = buildSlidesBatchRequests(model) as Array<{ insertText?: { objectId: string; text: string } }>
    const body = reqs.find((r) => r.insertText?.objectId === 's7_body')
    expect(body?.insertText?.text).toContain('•  Campañas de contenido')
  })
})

describe('notesBySlideNumber', () => {
  it('maps only slides that carry notes', () => {
    const notes = notesBySlideNumber(buildReportSlides(baseInput))
    expect(notes[2]).toContain('especialista en encebollado')
    expect(notes[7]).toBeUndefined()
  })
})

describe('extractDraft / assembleCompetitors', () => {
  it('extractDraft parses content_text JSON', () => {
    const d = extractDraft({ content_text: JSON.stringify({ brand_book_draft: { positioning: 'P' } }) })
    expect(d.positioning).toBe('P')
  })
  it('extractDraft handles junk gracefully', () => {
    expect(extractDraft({ content_text: 'nope' })).toEqual({})
    expect(extractDraft(null)).toEqual({})
  })
  it('assembleCompetitors pairs name+why by source_id from competitive-landscape', () => {
    const out = assembleCompetitors([
      { source_table: 'client_competitive_landscape', section_label: 'name', source_id: 's1', chunk_text: 'Rasimar' },
      { source_table: 'client_competitive_landscape', section_label: 'why_competitor', source_id: 's1', chunk_text: 'reseñas' },
      { source_table: 'client_icp_documents', section_label: 'name', source_id: 's9', chunk_text: 'IGNORE' },
    ])
    expect(out).toEqual([{ name: 'Rasimar', why: 'reseñas' }])
  })
})
