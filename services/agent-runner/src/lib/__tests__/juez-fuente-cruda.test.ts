/**
 * Encargo 13 (21-nov · firma D1) · el juez de fidelidad recibe del cerebro SOLO fuente cruda propia o humana, con su
 * procedencia; nunca síntesis ni el manual que juzga. US$ 0 · sin red (proveedor de huellas y base son moldes).
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CLASES_DE_SINTESIS_DE_FICHA, CLASES_HUMANAS, esPedidoDelJuezDeFidelidad, fuenteCrudaParaElJuez,
  MARGEN_DE_CRUDA, ORIGENES_DE_SINTESIS, TABLAS_DE_SINTESIS, tipoCrudoDelTrozo,
} from '../juez-fuente-cruda'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('el canon es UNO: las listas de síntesis son las de `src/lib/manual/procedencia.ts` (este servicio no puede importarlo)', () => {
  const procedencia = readFileSync(resolve(__dirname, '../../../../../src/lib/manual/procedencia.ts'), 'utf8')
  it('cada tabla y cada origen de síntesis de este módulo está, literal, en el canon', () => {
    for (const t of TABLAS_DE_SINTESIS) expect(procedencia, t).toContain(`'${t}'`)
    for (const o of ORIGENES_DE_SINTESIS) expect(procedencia, o).toContain(`'${o}'`)
    expect(TABLAS_DE_SINTESIS).toHaveLength(5)
    expect(ORIGENES_DE_SINTESIS).toHaveLength(4)
  })
})

describe('esPedidoDelJuezDeFidelidad', () => {
  it('solo `extra.fidelity_judge: true` exacto (el marcador que ya mandan los dos flujos del juez)', () => {
    expect(esPedidoDelJuezDeFidelidad({ fidelity_judge: true })).toBe(true)
    expect(esPedidoDelJuezDeFidelidad({ fidelity_judge: 'true' })).toBe(false)
    expect(esPedidoDelJuezDeFidelidad({})).toBe(false)
    expect(esPedidoDelJuezDeFidelidad(undefined)).toBe(false)
    expect(esPedidoDelJuezDeFidelidad([true])).toBe(false)
  })
})

describe('tipoCrudoDelTrozo · qué es fuente para el juez (ante la duda, se excluye)', () => {
  const ficha = (o: Partial<{ clase: string; propiedad: string; retirada_en: string | null }> = {}) => ({ id: 'f1', clase: 'sitio', propiedad: 'propia', retirada_en: null, titulo: 't', ...o })
  it('🔴 el manual que juzga y toda tabla de síntesis quedan FUERA, aunque la búsqueda los traiga', () => {
    for (const source_table of TABLAS_DE_SINTESIS) expect(tipoCrudoDelTrozo({ source_table }, null), source_table).toBeNull()
  })
  it('un origen que delata síntesis queda fuera; una tabla desconocida también (nunca se presume primaria)', () => {
    for (const o of ORIGENES_DE_SINTESIS) expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas', provenance_source: o }, ficha()), o).toBeNull()
    expect(tipoCrudoDelTrozo({ source_table: 'tabla_rara' }, null)).toBeNull()
  })
  it('de las fichas: la propia cruda es primaria; la del dueño es humana; la ajena, la retirada y la síntesis no son fuente', () => {
    expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, ficha())).toBe('primaria_propia')
    for (const clase of CLASES_HUMANAS) expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, ficha({ clase })), clase).toBe('humana')
    expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, ficha({ propiedad: 'ajena' }))).toBeNull()
    expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, ficha({ retirada_en: '2026-11-01' }))).toBeNull()
    for (const clase of CLASES_DE_SINTESIS_DE_FICHA) expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, ficha({ clase })), clase).toBeNull()
    expect(tipoCrudoDelTrozo({ source_table: 'cerebro_fichas' }, null)).toBeNull()
  })
})

// ── el empuje entero, con la base y el proveedor de huellas como moldes ──────────────────────────
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo }) as Response
const TROZOS = [
  { chunk_id: 'r1', source_table: 'cerebro_fichas', source_id: 'f-sitio', section_label: 'sitio', chunk_text: 'CEVICHES DESDE 2009', similarity: 0.9 },
  { chunk_id: 'r2', source_table: 'cerebro_fichas', source_id: 'f-dueno', section_label: 'dato', chunk_text: 'EL DUEÑO DIJO HORARIO', similarity: 0.8 },
  { chunk_id: 'r3', source_table: 'client_brand_books', source_id: 'bb-v2', section_label: 'voz', chunk_text: 'EL MANUAL QUE JUZGA', similarity: 0.7 },
  { chunk_id: 'r4', source_table: 'client_icp_documents', source_id: 'icp1', section_label: 'icp', chunk_text: 'SINTESIS DE ICP', similarity: 0.6 },
  { chunk_id: 'r5', source_table: 'cerebro_fichas', source_id: 'f-ajena', section_label: 'resena', chunk_text: 'LO QUE DICE UN TERCERO', similarity: 0.5 },
  { chunk_id: 'r6', source_table: 'cerebro_fichas', source_id: 'f-resumen', section_label: 'resumen', chunk_text: 'RESUMEN VIVO DEL MODELO', similarity: 0.45 },
  { chunk_id: 'r7', source_table: 'cerebro_fichas', source_id: 'f-coment', section_label: 'comentarios', chunk_text: 'COMENTARIO EN LO PROPIO', similarity: 0.4 },
  { chunk_id: 'r8', source_table: 'cerebro_fichas', source_id: 'f-retirada', section_label: 'vieja', chunk_text: 'FICHA RETIRADA', similarity: 0.3 },
]
const FICHAS = [
  { id: 'f-sitio', clase: 'sitio', propiedad: 'propia', retirada_en: null, titulo: 'la página' },
  { id: 'f-dueno', clase: 'dato_del_dueno', propiedad: 'propia', retirada_en: null, titulo: 'horario' },
  { id: 'f-ajena', clase: 'resenas', propiedad: 'ajena', retirada_en: null, titulo: 'reseña' },
  { id: 'f-resumen', clase: 'resumen_vivo', propiedad: 'propia', retirada_en: null, titulo: 'resumen' },
  { id: 'f-coment', clase: 'comentarios', propiedad: 'propia', retirada_en: null, titulo: 'comentarios' },
  { id: 'f-retirada', clase: 'sitio', propiedad: 'propia', retirada_en: '2026-11-01', titulo: 'vieja' },
]
function baseFalsa(o: { fallaFichas?: boolean; fallaTrozos?: boolean } = {}) {
  const from = (tabla: string) => {
    const q: Record<string, unknown> = { _cols: '' }
    q.select = (cols: string) => { q._cols = cols; return q }
    q.eq = () => q; q.order = () => q; q.limit = () => q
    q.maybeSingle = async () => ({ data: tabla === 'client_brand_books' ? { id: 'bb-v2' } : null, error: null })
    q.in = async (_c: string, ids: string[]) => {
      if (tabla === 'client_brain_chunks' && String(q._cols).includes('provenance_tag') && String(q._cols).includes('metadata')) {
        return { data: ids.map((id) => ({ id, provenance_tag: { trust_level: 'canon' }, metadata: {} })), error: null }
      }
      if (tabla === 'client_brain_chunks') {
        if (o.fallaTrozos) return { data: null, error: { message: 'se cayó la base al leer los trozos' } }
        return { data: TROZOS.filter((t) => ids.includes(t.chunk_id)).map((t) => ({ id: t.chunk_id, source_table: t.source_table, source_id: t.source_id, section_label: t.section_label, chunk_text: t.chunk_text, provenance_tag: null })), error: null }
      }
      if (tabla === 'cerebro_fichas') return o.fallaFichas ? { data: null, error: { message: 'se cayó la base' } } : { data: FICHAS.filter((f) => ids.includes(f.id)), error: null }
      return { data: [], error: null }
    }
    return q
  }
  return { from, rpc: async () => ({ data: TROZOS, error: null }) } as never
}

describe('🔴 fuenteCrudaParaElJuez · el empuje del juez', () => {
  it('entrega SOLO lo crudo, en el orden de la búsqueda, con su procedencia <fuente tipo=…>; la síntesis y el manual quedan contados fuera', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const r = await fuenteCrudaParaElJuez({ supabase: baseFalsa(), clientId: 'c1', taskDescription: 'FIDELIDAD del manual', topK: 2 })
    expect(r).toMatchObject({ brain_hit: true, brain_chunks_count: 2, brain_push: 'solo_fuente_cruda_del_juez', brain_chunks_no_crudos_dropped: 5 })
    expect(r.evidence_refs).toEqual(['r1', 'r2'])
    expect(r.enrichment).toContain('<fuente rotulo="sitio · la página" tipo="primaria_propia">')
    expect(r.enrichment).toContain('<fuente rotulo="dato_del_dueno · horario" tipo="humana">')
    expect(r.enrichment).toContain('CEVICHES DESDE 2009')
    for (const prohibido of ['EL MANUAL QUE JUZGA', 'SINTESIS DE ICP', 'LO QUE DICE UN TERCERO', 'RESUMEN VIVO DEL MODELO', 'FICHA RETIRADA']) {
      expect(r.enrichment).not.toContain(prohibido)
    }
    expect(MARGEN_DE_CRUDA).toBeGreaterThanOrEqual(10) // se pide de más para que el filtro no deje corto al juez
  })
  it('con más cupo entran los tres crudos (el comentario propio también); nunca un cuarto inventado', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const r = await fuenteCrudaParaElJuez({ supabase: baseFalsa(), clientId: 'c1', taskDescription: 'x', topK: 5 })
    expect(r.evidence_refs).toEqual(['r1', 'r2', 'r7'])
    expect(r.enrichment).toContain('COMENTARIO EN LO PROPIO')
  })
  it('la base que se cae al leer las fichas o los trozos es FALLO (brain_fallo: el paso se detiene, encargo 15); el fallo del proveedor también viaja', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const r = await fuenteCrudaParaElJuez({ supabase: baseFalsa({ fallaFichas: true }), clientId: 'c1', taskDescription: 'x' })
    expect(r).toMatchObject({ brain_fallo: true, error: 'juez_fichas_failed', brain_hit: false })
    const t = await fuenteCrudaParaElJuez({ supabase: baseFalsa({ fallaTrozos: true }), clientId: 'c1', taskDescription: 'x' })
    expect(t).toMatchObject({ brain_fallo: true, error: 'juez_trozos_failed', brain_hit: false })
    expect(t.brain_error_detalle).toContain('se cayó la base al leer los trozos')
    vi.stubGlobal('fetch', async () => respuesta(429, { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'quota' } }))
    const f = await fuenteCrudaParaElJuez({ supabase: baseFalsa(), clientId: 'c1', taskDescription: 'x' })
    expect(f).toMatchObject({ brain_fallo: true, error: 'embed_query_failed', brain_push: 'solo_fuente_cruda_del_juez' })
  })
  it('0 trozos crudos NO es fallo: el juez sigue con la evidencia de su pedido y queda anotado `sin_fuente_cruda`', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-prueba-123456')
    vi.stubGlobal('fetch', async () => respuesta(200, { data: [{ embedding: [0.1, 0.2] }] }))
    const soloSintesis = { ...(baseFalsa() as Record<string, unknown>), rpc: async () => ({ data: TROZOS.filter((t) => t.chunk_id === 'r4'), error: null }) } as never
    const r = await fuenteCrudaParaElJuez({ supabase: soloSintesis, clientId: 'c1', taskDescription: 'x' })
    expect(r).toMatchObject({ brain_hit: false, error: 'sin_fuente_cruda', brain_chunks_no_crudos_dropped: 1, enrichment: '' })
    expect(r.brain_fallo).toBeUndefined()
  })
})
