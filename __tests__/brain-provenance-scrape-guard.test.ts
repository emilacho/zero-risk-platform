/**
 * CANDADO#1 · guard-test de integridad de procedencia (ADR-012).
 *
 * INVARIANTE INNEGOCIABLE: ningún chunk del CEREBRO puede llevar un `source` de
 * scrape (apify_scrape · dataforseo_scrape) sin una TRAZA de scrape real
 * (`scrape_trace: true`). Sin la traza, el source de scrape se DEGRADA a
 * `auto_discovery` — la verdad: el dato fue inferido, no scrapeado.
 *
 * Origen · bug Peniche 2026-07-19 · un chunk `landscape_summary` (prosa,
 * inferencia) quedó etiquetado `apify_scrape` con `trust_level: untrusted` y
 * sin evidencia (landscape.analysis_source=auto_discovery · deep_scan_data={}).
 * El re-gate exigía evidencia real y no la había → RAZÓN. Este guard evita que
 * el CEREBRO vuelva a mentir procedencia a TODO lo que lo consume (re-gate,
 * RAG, auditoría, jefes).
 */
import { describe, it, expect } from 'vitest'
import {
  buildBrainProvenanceTag,
  SCRAPE_ASSERTING_SOURCES,
  NO_SCRAPE_FALLBACK_SOURCE,
} from '../src/lib/client-brain'

const SCRAPE_SOURCES = [...SCRAPE_ASSERTING_SOURCES]
const NON_SCRAPE_SOURCES = [
  'onboarding_discovery',
  'auto_discovery',
  'search',
  'tally_form',
  'whatsapp_inbound',
  'review_monitor',
  'legacy_pre_adr012',
]

describe('CANDADO#1 · provenance scrape-trace guard', () => {
  it('la lista de fuentes de scrape no está vacía (protege algo)', () => {
    expect(SCRAPE_SOURCES.length).toBeGreaterThan(0)
    expect(SCRAPE_ASSERTING_SOURCES.has('apify_scrape')).toBe(true)
  })

  describe.each(SCRAPE_SOURCES)('source de scrape "%s"', (source) => {
    it('SIN scrape_trace → degrada a auto_discovery', () => {
      const tag = buildBrainProvenanceTag({ source })
      expect(tag.source).toBe(NO_SCRAPE_FALLBACK_SOURCE)
      expect(tag.source).not.toBe(source)
    })

    it('scrape_trace=false explícito → degrada (falla-cerrado)', () => {
      const tag = buildBrainProvenanceTag({ source, scrape_trace: false })
      expect(tag.source).toBe(NO_SCRAPE_FALLBACK_SOURCE)
    })

    it('scrape_trace=true (scrape real) → preserva el source', () => {
      const tag = buildBrainProvenanceTag({ source, scrape_trace: true })
      expect(tag.source).toBe(source)
    })

    it('degradar NO altera type ni trust_level', () => {
      const tag = buildBrainProvenanceTag({ source, type: 'evidence', trust_level: 'untrusted' })
      expect(tag.type).toBe('evidence')
      expect(tag.trust_level).toBe('untrusted')
    })
  })

  describe.each(NON_SCRAPE_SOURCES)('source no-scrape "%s"', (source) => {
    it('nunca se toca (con o sin scrape_trace)', () => {
      expect(buildBrainProvenanceTag({ source }).source).toBe(source)
      expect(buildBrainProvenanceTag({ source, scrape_trace: true }).source).toBe(source)
    })
  })

  it('INVARIANTE · el tag resultante NUNCA tiene un source de scrape salvo con scrape_trace real', () => {
    const cases: Array<{ source: string; scrape_trace?: boolean }> = [
      ...SCRAPE_SOURCES.map((source) => ({ source })),
      ...SCRAPE_SOURCES.map((source) => ({ source, scrape_trace: false })),
      ...NON_SCRAPE_SOURCES.map((source) => ({ source })),
    ]
    for (const c of cases) {
      const tag = buildBrainProvenanceTag(c)
      if (SCRAPE_ASSERTING_SOURCES.has(tag.source)) {
        // Si el tag SÍ salió con source de scrape, el input DEBIÓ probar la traza.
        expect(c.scrape_trace).toBe(true)
      }
    }
  })

  it('reproduce el bug Peniche exacto: apify_scrape + untrusted + sin trace → auto_discovery', () => {
    const tag = buildBrainProvenanceTag({
      source: 'apify_scrape',
      type: 'evidence',
      trust_level: 'untrusted',
      received_at: '2026-07-19T16:47:10.411Z',
      ingress_route: 'lib/brain/persist-chunks',
    })
    expect(tag.source).toBe('auto_discovery')
    expect(tag.trust_level).toBe('untrusted')
    expect(tag.type).toBe('evidence')
  })
})
