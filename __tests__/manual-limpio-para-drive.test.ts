/**
 * El manual LIMPIO · lo que va a viajar a Drive en PDF.
 *
 * ── EL ROJO ───────────────────────────────────────────────────────────────
 * Contra el estado de HOY estas afirmaciones tienen que FALLAR:
 *   1. «existe una forma de pedir el manual de un cliente EN LIMPIO»
 *      → hoy: no hay endpoint · lo único que existe devuelve la fila cruda con
 *        `content_text` entero (puntajes, umbral, ciclos, lentes, todo).
 *   2. «lo que devuelve NO lleva puntajes, ni costo, ni nombres de columna, ni
 *      la advertencia interna del empleado»
 *      → hoy: no hay nada que lo garantice, y los CUATRO manuales que ya están
 *        en Drive llevan la maquinaria adentro (dos publican el costo).
 *   3. «el archivo se llama `Manual de Marca · <Cliente>`»
 *      → hoy: no existe la noción de nombre.
 *
 * ── EL CONTROL POSITIVO ───────────────────────────────────────────────────
 * «el contenido de marca sobrevive entero» · verde hoy y después: limpiar no
 * puede significar vaciar. Un manual sin nada que sacar sale igual.
 *
 * ── EL CASO REAL ──────────────────────────────────────────────────────────
 * Se usa el manual REAL de la corrida del 03-sep (GOEUROPEADVENTURE), con su
 * advertencia interna en la voz y sus 19 palabras prohibidas.
 */
import { describe, it, expect } from 'vitest'
import {
  renderManualLimpio,
  nombreDelManual,
} from '../src/lib/brand-book-render-limpio'

const VOZ_SUCIA =
  'Voz accesible y directa, sin formalismo institucional. Prioriza claridad sobre ' +
  'persuasión: precios explícitos y reserva sin intermediarios. ADVERTENCIA DE ' +
  'CONFIANZA BAJA: esta descripción es inferida exclusivamente desde el positioning ' +
  'y los datos del ICP; no existen muestras directas de copy del cliente en la ' +
  'evidencia (apify_sources vacío).'

const MANUAL_REAL = {
  client_id: 'a7ad4331-b7d6-48c8-8846-c53063495bd3',
  positioning: 'Único operador multi-actividad en Zermatt con reserva online transparente.',
  voice_description: VOZ_SUCIA,
  forbidden_words: ['exclusivo', 'world-class', 'el mejor'],
  required_terminology: ['Zermatt', 'Matterhorn'],
  competitor_mentions_policy: 'never_mention',
  created_at: '2026-09-03T10:25:16.744Z',
  gate_outcome: 'paso_la_vara',
  content_text: JSON.stringify({
    brand_book_draft: {
      positioning: 'Único operador multi-actividad en Zermatt con reserva online transparente.',
      icp_summary: 'SEGMENTO 1 · Familias con niños. SEGMENTO 2 · Viajeros internacionales.',
      voice_description: VOZ_SUCIA,
      customer_angle: 'Decide antes de viajar, confirma en el lugar.',
      retention_notes: 'La confianza cross-estacional es el mayor motor.',
      mision: 'Organizar aventura alpina guiada en Zermatt.',
      proposito: 'Hacer la alta montaña accesible.',
      personalidad: ['Accesible', 'Transparente'],
      tagline_opciones: ['One operator. All of Zermatt.'],
      mensajes_clave: ['Un solo operador para todas tus aventuras.'],
      propuestas_de_valor: ['Las cuatro actividades bajo un solo punto de reserva.'],
      forbidden_words: ['exclusivo', 'world-class', 'el mejor'],
      required_terminology: ['Zermatt', 'Matterhorn'],
      competitor_mentions_policy: 'never_mention',
      _field_meta: { personalidad: { estado: 'provisional', confianza: 0.3 } },
      _build: { lenses: ['brand-strategist', 'editor-en-jefe'], cycle: 1 },
      campos_gateados: ['positioning', 'icp_summary'],
      campos_provisionales: ['personalidad', 'tagline_opciones'],
    },
    fidelity_passed: true,
    fidelity_scores: { positioning: 0.96, icp_summary: 0.93, voice_description: 0.4 },
    fidelity_threshold: 0.85,
    approved_by: 'faithfulness_check',
    approved_at: '2026-09-03T10:25:16.000Z',
  }),
}

const ENTRADA = {
  brand_book: MANUAL_REAL,
  client_name: 'GOEUROPEADVENTURE',
  industry: 'turismo europeo',
  country: 'Suiza',
  city: 'Zermatt',
  website: 'https://www.goeuropeadventure.com',
  created_at: '2026-09-03T10:25:16.744Z',
}

describe('🔴 ROJO · el nombre canónico del archivo', () => {
  it('es `Manual de Marca · <Cliente>` · el mismo patrón de los 4 que ya están en Drive', () => {
    expect(nombreDelManual('GOEUROPEADVENTURE')).toBe('Manual de Marca · GOEUROPEADVENTURE')
    expect(nombreDelManual('Náufrago')).toBe('Manual de Marca · Náufrago')
  })
  it('un nombre vacío no produce un archivo sin nombre', () => {
    expect(nombreDelManual('')).toBe('Manual de Marca · Cliente')
  })
})

describe('🔴 ROJO · lo que viaja NO lleva nada interno', () => {
  const r = renderManualLimpio(ENTRADA)

  it('sin puntajes de fidelidad', () => {
    expect(r.texto).not.toMatch(/0\.96|0\.93|0\.85|0\.4\b/)
    expect(r.texto).not.toMatch(/fidelity|fidelidad|umbral|threshold/i)
  })
  it('sin costo de la corrida · el error que ya viajó cuatro veces', () => {
    expect(r.texto).not.toMatch(/costo de la corrida|cost_usd|\$\d/i)
    expect(r.texto).not.toMatch(/exec \d+/i)
  })
  it('sin nombres de columna ni jerga de proceso', () => {
    for (const t of ['icp_summary', 'customer_angle', 'retention_notes', 'brand_book_draft',
      '_field_meta', '_build', 'campos_gateados', 'campos_provisionales', 'gate_outcome',
      'client_id', 'faithfulness_check', 'provisional', 'lente'])
      expect(r.texto.toLowerCase()).not.toContain(t.toLowerCase())
  })
  it('sin la advertencia interna del empleado ni sus variables', () => {
    expect(r.texto).not.toMatch(/ADVERTENCIA DE CONFIANZA BAJA/)
    expect(r.texto).not.toMatch(/apify_sources/)
    expect(r.fugas).toEqual([])
  })
  it('la voz sale limpia pero COMPLETA hasta donde termina lo útil', () => {
    expect(r.texto).toContain('Voz accesible y directa')
    expect(r.texto).toContain('reserva sin intermediarios.')
  })
})

describe('🟢 CONTROL POSITIVO · el contenido de marca sobrevive entero', () => {
  const r = renderManualLimpio(ENTRADA)

  it('están las secciones que el cliente tiene que leer', () => {
    for (const t of ['MANUAL DE MARCA', 'GOEUROPEADVENTURE', 'POSICIONAMIENTO', 'MISIÓN',
      'PROPÓSITO', 'A QUIÉN LE HABLAMOS', 'CÓMO SUENA LA MARCA', 'PERSONALIDAD',
      'LEMAS PROPUESTOS', 'MENSAJES CLAVE', 'PROPUESTAS DE VALOR',
      'EL RECORRIDO DEL CLIENTE', 'CÓMO SE FIDELIZA', 'VOCABULARIO OBLIGATORIO',
      'PALABRAS PROHIBIDAS'])
      expect(r.texto).toContain(t)
  })
  it('el contenido real viaja · no sólo los títulos', () => {
    expect(r.texto).toContain('Único operador multi-actividad en Zermatt')
    expect(r.texto).toContain('SEGMENTO 1')
    expect(r.texto).toContain('One operator. All of Zermatt.')
    expect(r.texto).toContain('exclusivo')
    expect(r.texto).toContain('Matterhorn')
  })
  it('el encabezado ubica al cliente', () => {
    expect(r.texto).toContain('turismo europeo')
    expect(r.texto).toContain('Zermatt, Suiza')
    expect(r.texto).toContain('www.goeuropeadventure.com')
    expect(r.texto).toContain('Preparado por Zero Risk · 2026-09-03')
  })
  it('la política de competidores sale en castellano, no como código', () => {
    expect(r.texto).toContain('No se menciona a la competencia por nombre')
    expect(r.texto).not.toContain('never_mention')
  })
})

describe('🟢 las secciones vacías se OMITEN y se declaran', () => {
  it('un manual con la mitad vacía no imprime títulos huérfanos', () => {
    const r = renderManualLimpio({
      ...ENTRADA,
      brand_book: { positioning: 'Solo esto.', forbidden_words: [], content_text: '' },
    })
    expect(r.texto).toContain('POSICIONAMIENTO')
    expect(r.texto).not.toContain('PALABRAS PROHIBIDAS')
    expect(r.texto).not.toContain('(vacío)')
    expect(r.omitidas).toContain('forbidden_words')
    expect(r.secciones).toEqual(['positioning'])
  })
})

describe('🟢 no rompe con entradas rotas', () => {
  it('content_text ilegible · cae a las columnas, no lanza', () => {
    const r = renderManualLimpio({
      ...ENTRADA,
      brand_book: { positioning: 'Vale igual.', content_text: '{esto no es json' },
    })
    expect(r.texto).toContain('Vale igual.')
  })
  it('manual vacío · devuelve encabezado, no una excepción', () => {
    const r = renderManualLimpio({ brand_book: {}, client_name: 'X' })
    expect(r.texto).toContain('MANUAL DE MARCA')
    expect(r.secciones).toEqual([])
    expect(r.omitidas.length).toBeGreaterThan(0)
  })
})

describe('🔴 ROJO · el detector de fugas avisa si algo interno sobrevive', () => {
  it('un término interno en la prosa queda DECLARADO', () => {
    const r = renderManualLimpio({
      ...ENTRADA,
      brand_book: { positioning: 'Sale del discovery_package del cliente.', content_text: '' },
    })
    expect(r.fugas.length).toBeGreaterThan(0)
    expect(r.fugas[0]).toContain('discovery_package')
  })
})

/**
 * ── EL ROJO EN VIVO, medido contra producción el 2026-09-03 ───────────────
 *   GET /api/brand-book/{id}/limpio            →  404   · no existe
 *   content_text del manual real de hoy        →  9 marcadores de maquinaria
 *      fidelity_scores · fidelity_threshold · faithfulness_check · _field_meta ·
 *      campos_gateados · campos_provisionales · _build · client_id · gate_outcome
 * Lo único que existe hoy para sacar el manual lleva TODO eso adentro.
 */
import { describe as describeRuta, it as itRuta, expect as expectRuta, vi, beforeEach } from 'vitest'

const filaMock = {
  ...MANUAL_REAL,
  created_at: '2026-09-03T10:25:16.744Z',
}
const supa = {
  from: vi.fn((t: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () =>
        t === 'client_brand_books'
          ? { data: filaMock, error: null }
          : { data: { name: 'GOEUROPEADVENTURE', industry: 'turismo europeo', country: 'Suiza', website_url: 'https://www.goeuropeadventure.com' }, error: null },
    }
    return chain
  }),
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => supa }))

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k' })

const ctxRuta = { params: Promise.resolve({ clientId: 'a7ad4331-b7d6-48c8-8846-c53063495bd3' }) } as never
const pedir = (conLlave = true) =>
  new Request('http://localhost/api/brand-book/x/limpio', {
    headers: conLlave ? { 'x-api-key': 'k' } : {},
  })

describeRuta('🔴 ROJO · la puerta que hoy devuelve 404 en producción', () => {
  itRuta('existe y entrega el manual limpio con su nombre', async () => {
    vi.resetModules()
    const { GET } = await import('../src/app/api/brand-book/[clientId]/limpio/route')
    const res = await GET(pedir(), ctxRuta)
    expectRuta(res.status).toBe(200)
    const j = await res.json()
    expectRuta(j.ok).toBe(true)
    expectRuta(j.nombre).toBe('Manual de Marca · GOEUROPEADVENTURE')
    expectRuta(j.texto).toContain('MANUAL DE MARCA')
    expectRuta(j.texto).not.toMatch(/fidelity|ADVERTENCIA DE CONFIANZA|apify_sources/i)
    expectRuta(j.fugas).toEqual([])
  })

  itRuta('🟢 sin llave interna no entrega nada', async () => {
    vi.resetModules()
    const { GET } = await import('../src/app/api/brand-book/[clientId]/limpio/route')
    const res = await GET(pedir(false), ctxRuta)
    expectRuta(res.status).toBe(401)
  })
})
