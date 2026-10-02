/**
 * 🔴 EL CEREBRO NO LE INYECTA AL EMPLEADO LO RASPADO SIN SELLO · pruebas a costo cero · CC#1 · 2026-10-02 (encargo Lenovo «sedes, mapas, cerebro y voz» punto 4 · firma de Emilio 02-oct).
 *
 * Medido (certificación CC#3 · primera pieza real): el trozo 343bed5c («El Naufrago Marisquería · Gualaceo», otro negocio) quedó en el cerebro de Náufrago, `trust_level:"untrusted"`,
 * y `brain-enrichment` NO miraba la confianza: podía inyectarse en el siguiente empleado rotulado como evidencia competitiva.
 *
 * 🔴 HALLAZGO QUE CAMBIA LA REGLA LITERAL (medido en la base 02-oct): los 92 trozos del cerebro (el único cliente con cerebro) son `untrusted`. Ninguno tiene sello: el «write-back canon» (fase C2 de ADR-021)
 * nunca se construyó. Excluir TODO `untrusted` apagaría el cerebro entero (la voz del manual incluida) para todos los empleados. Por eso la regla de hoy es la ESTRECHA que cierra el incidente:
 *   · se excluye lo `untrusted` que entró por el raspado del Servicio de Apify (`metadata.apify_function` presente): material de terceros, sin sello, que nadie promovió.
 *   · lo `untrusted` que NO viene de ahí (manual, ICP, perfiles del alta) sigue entrando: hoy es todo lo que hay.
 *   · hay una palanca ya construida y apagada (`BRAIN_EXCLUIR_UNTRUSTED=todo`) para cuando exista el sello: es decisión de Emilio, no se enciende sola.
 * Si no se puede saber la confianza de los trozos (la consulta falla) NO se inyecta nada que no se pueda verificar, y se declara.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enrichSystemPromptWithClientBrain, excluidoPorConfianza } from '../services/agent-runner/src/lib/brain-enrichment'

const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const V2 = '37c8a8bd-92bc-40d7-ad1f-62b2d311a2ac'
const fila = (id: string, source_table: string, source_id: string, section_label: string, similarity: number, texto?: string) => ({ chunk_id: id, source_table, source_id, section_label, chunk_text: texto ?? `${section_label} de ${source_id}`, similarity })
const TAG_ALTA = { type: 'evidence', source: 'onboarding_discovery', trust_level: 'untrusted', ingress_route: '/api/brain/ingest-source' }
const META_RASPADO = { apify_function: 'google_maps_scraper', sprint: '9-apify-service-workflow' }

// lo que devuelve la búsqueda (el trozo del homónimo de Gualaceo es el MÁS parecido a «ceviche / marisquería / Ecuador»)
const BUSQUEDA = [
  fila('gualaceo', 'client_competitive_landscape', CID, 'google_maps_competitive', 0.81, 'El Naufrago Marisquería · Marisquería · Gualaceo'),
  fila('voz', 'client_brand_books', V2, 'voice_description', 0.70),
  fila('icp', 'client_icp_documents', 'i1', 'segmento', 0.66),
  fila('ig', 'client_competitive_landscape', CID, 'instagram_competitive', 0.62),
  fila('pez', 'client_competitive_landscape', 'p1', 'apify_profile', 0.60),
  fila('ads', 'client_competitive_landscape', CID, 'meta_ads_competitive', 0.58),
]
// lo que dice la tabla de cada trozo (fuente: la base real 02-oct)
let marcas: Record<string, { provenance_tag: unknown; metadata: unknown }> = {}
const marcasReales = () => ({
  gualaceo: { provenance_tag: TAG_ALTA, metadata: META_RASPADO },
  voz: { provenance_tag: TAG_ALTA, metadata: { embedding_model: 'text-embedding-3-small' } },
  icp: { provenance_tag: TAG_ALTA, metadata: {} },
  ig: { provenance_tag: TAG_ALTA, metadata: { apify_function: 'instagram_scraper' } },
  pez: { provenance_tag: { type: 'evidence', source: 'apify_scrape', trust_level: 'untrusted', ingress_route: 'lib/brain/persist-chunks' }, metadata: {} },
  ads: { provenance_tag: TAG_ALTA, metadata: { apify_function: 'facebook_ads_library_scraper' } },
})
let falloLaConsultaDeConfianza: string | null = null
let consultasDeConfianza = 0
const rpc = vi.fn(async () => ({ data: BUSQUEDA, error: null }))
const from = vi.fn((tabla: string) => {
  if (tabla === 'client_brain_chunks') {
    return { select: () => ({ in: async (_c: string, ids: string[]) => {
      consultasDeConfianza++
      if (falloLaConsultaDeConfianza) return { data: null, error: { message: falloLaConsultaDeConfianza } }
      return { data: ids.filter((i) => marcas[i]).map((i) => ({ id: i, ...marcas[i] })), error: null }
    } }) }
  }
  return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: V2 }, error: null }) }) }) }) }) }
})
const supabase = { rpc, from } as unknown as Parameters<typeof enrichSystemPromptWithClientBrain>[0]['supabase']
const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }], usage: { total_tokens: 10 } }) }) as unknown as Response)

beforeEach(() => {
  rpc.mockClear(); from.mockClear(); marcas = marcasReales(); falloLaConsultaDeConfianza = null; consultasDeConfianza = 0
  process.env.OPENAI_API_KEY = 'test'; global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => { delete process.env.OPENAI_API_KEY; delete process.env.BRAIN_EXCLUIR_UNTRUSTED })
const correr = () => enrichSystemPromptWithClientBrain({ supabase, clientId: CID, taskDescription: 'ceviche marisquería Ecuador', agentSlug: 'campaign-brief-agent', topK: 5 })

describe('① la regla de hoy: lo raspado por el Servicio de Apify sin sello NO se inyecta', () => {
  it('🔴 el homónimo de Gualaceo (el trozo más parecido de la búsqueda) NO llega al empleado · ni los otros raspados del Servicio · se declara cuántos', async () => {
    const out = await correr()
    expect(out.evidence_refs).not.toContain('gualaceo')
    expect(out.enrichment).not.toContain('Gualaceo')
    expect(out.evidence_refs).not.toContain('ig')
    expect(out.evidence_refs).not.toContain('ads')
    expect(out.brain_chunks_untrusted_dropped).toBe(3)
  })
  it('lo `untrusted` que NO viene del raspado del Servicio (manual · ICP · perfiles del alta) SIGUE entrando: hoy es todo el cerebro', async () => {
    const out = await correr()
    expect(out.brain_hit).toBe(true)
    expect(out.evidence_refs).toEqual(['voz', 'icp', 'pez'])
    expect(out.enrichment).toContain('client_brand_books · voice_description')
  })
  it('un trozo con sello (`tenant_trusted`/`canon`) entra aunque traiga `apify_function`: el sello manda', async () => {
    marcas.gualaceo = { provenance_tag: { ...TAG_ALTA, trust_level: 'tenant_trusted' }, metadata: META_RASPADO }
    expect((await correr()).evidence_refs).toContain('gualaceo')
  })
  it('pide la confianza de TODOS los trozos en UNA consulta (no una por trozo)', async () => {
    await correr()
    expect(consultasDeConfianza).toBe(1)
  })
  it('el criterio, solo: sólo `untrusted` con `apify_function` se excluye', () => {
    expect(excluidoPorConfianza({ trust_level: 'untrusted' }, { apify_function: 'x' })).toBe(true)
    expect(excluidoPorConfianza({ trust_level: 'untrusted' }, {})).toBe(false)
    expect(excluidoPorConfianza({ trust_level: 'untrusted' }, null)).toBe(false)
    expect(excluidoPorConfianza({ trust_level: 'tenant_trusted' }, { apify_function: 'x' })).toBe(false)
    expect(excluidoPorConfianza(null, { apify_function: 'x' })).toBe(false) // sin etiqueta no se sabe: no se inventa una exclusión
  })
})

describe('② la palanca construida y apagada: `BRAIN_EXCLUIR_UNTRUSTED=todo` (cuando exista el sello)', () => {
  it('por defecto está APAGADA (lo medido: 92 de 92 trozos son untrusted · encenderla hoy apagaría el cerebro)', () => {
    expect(excluidoPorConfianza({ trust_level: 'untrusted' }, {})).toBe(false)
  })
  it('encendida, excluye TODO untrusted · y con todo excluido el cerebro declara que está vacío (no inventa)', async () => {
    process.env.BRAIN_EXCLUIR_UNTRUSTED = 'todo'
    const out = await correr()
    expect(out.brain_hit).toBe(false)
    expect(out.error).toBe('brain_empty_for_client')
    expect(out.brain_chunks_untrusted_dropped).toBe(6)
  })
})

describe('③ si no se puede saber la confianza, NO se inyecta lo que no se puede verificar (y se declara)', () => {
  it('la consulta de confianza falla ⇒ cerebro vacío con el motivo declarado · no «deja pasar todo»', async () => {
    falloLaConsultaDeConfianza = 'timeout'
    const out = await correr()
    expect(out.brain_hit).toBe(false)
    expect(out.error).toBe('brain_trust_lookup_failed')
    expect(out.brain_trust_lookup_error).toMatch(/timeout/)
    expect(out.enrichment).toBe('')
  })
  it('un trozo que la consulta no devuelve (borrado entre la búsqueda y la consulta) no se inyecta', async () => {
    delete marcas.voz
    expect((await correr()).evidence_refs).not.toContain('voz')
  })
})
