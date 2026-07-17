/**
 * JEFATURA · Peldaño 1 · $0 · SEGURIDAD · aislamiento por cliente (no-leakage · riesgo A4)
 * =========================================================================================
 * Concern (consejero · plan de pruebas 2026-07-07): el CEREBRO es un índice HNSW COMPARTIDO
 * entre tenants. Riesgo A4 = una claim del cliente A recupera un chunk del cliente B, y ese
 * chunk termina como `evidence_ref` de A (fuga de datos cross-tenant + grounding falso).
 *
 * Prueba a nivel LÓGICA ($0 · sin DB · sin embeddings): se mockea `queryClientBrain` con un
 * store COMPARTIDO (chunks de 2 clientes en el mismo índice). El seam de seguridad es que el
 * consumidor SIEMPRE pasa `client_id` y el índice filtra por él. Se afirma:
 *   1. calificar A → NINGÚN `evidence_ref` apunta a un chunk de B (invariante A4).
 *   2. `queryClientBrain` recibe `client_id` en CADA llamada (el seam nunca lo omite).
 *   3. test-the-test · un índice LEAKY (que ignora client_id) SÍ filtra un chunk de B →
 *      prueba que la aserción es capaz de cazar la fuga (no es vacuamente verde).
 *
 * LÍMITE §148 · mock-verde ≠ real-verde. Esto prueba que la LÓGICA del consumidor respeta el
 * aislamiento; la garantía server-side (RLS + p_client_id en el RPC) se valida en real (Peldaño 2/3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Store COMPARTIDO (HNSW simulado) · cada chunk pertenece a UN cliente ──────
interface OwnedChunk {
  readonly chunk_id: string
  readonly owner_client: string
  readonly source_table: string
  readonly similarity: number
  /** query-texts que recuperarían este chunk (colisión semántica cross-tenant simulada). */
  readonly matchesQueries: readonly string[]
}

const state: {
  chunks: OwnedChunk[]
  /** true = índice honesto (filtra por client_id) · false = índice LEAKY (ignora client_id). */
  enforceIsolation: boolean
  calls: Array<{ client_id: string; query: string }>
} = { chunks: [], enforceIsolation: true, calls: [] }

vi.mock('@/lib/client-brain', () => ({
  queryClientBrain: (params: { client_id: string; query: string; match_count?: number }) => {
    state.calls.push({ client_id: params.client_id, query: params.query })
    const hits = state.chunks
      .filter((ch) => ch.matchesQueries.includes(params.query))
      // EL SEAM DE SEGURIDAD · el índice honesto sólo devuelve chunks del cliente que consulta.
      .filter((ch) => (state.enforceIsolation ? ch.owner_client === params.client_id : true))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, params.match_count ?? 3)
      .map((ch) => ({
        chunk_id: ch.chunk_id,
        source_table: ch.source_table,
        source_id: 'sid',
        label: 'lbl',
        content_text: 'txt',
        similarity: ch.similarity,
      }))
    return Promise.resolve(hits)
  },
}))

import { matchClaimsToChunks } from '../src/lib/jefatura/evidence-matcher'

const CLIENT_A = 'client-peniche'
const CLIENT_B = 'client-naufrago'

// Dos clientes en el índice compartido. La claim de A ('posicionamiento premium') COLISIONA
// semánticamente con un chunk de B → sin filtro por cliente, A recuperaría el chunk de B.
const B_CHUNK_IDS = ['B-chunk-1', 'B-chunk-2']
function seedSharedIndex() {
  state.chunks = [
    { chunk_id: 'A-chunk-1', owner_client: CLIENT_A, source_table: 'competitive_landscape', similarity: 0.91, matchesQueries: ['posicionamiento premium'] },
    { chunk_id: 'A-chunk-2', owner_client: CLIENT_A, source_table: 'icp_documents', similarity: 0.86, matchesQueries: ['icp pymes'] },
    // Chunks de B que COLISIONAN con las mismas queries que usa A (peor caso A4).
    { chunk_id: 'B-chunk-1', owner_client: CLIENT_B, source_table: 'competitive_landscape', similarity: 0.99, matchesQueries: ['posicionamiento premium'] },
    { chunk_id: 'B-chunk-2', owner_client: CLIENT_B, source_table: 'icp_documents', similarity: 0.97, matchesQueries: ['icp pymes'] },
  ]
}

const claimsA = [
  { field: 'positioning', text: 'posicionamiento premium' },
  { field: 'icp_summary', text: 'icp pymes' },
]

beforeEach(() => {
  state.chunks = []
  state.enforceIsolation = true
  state.calls = []
  seedSharedIndex()
})

describe('A4 · aislamiento no-leakage · índice HNSW compartido (SEGURIDAD)', () => {
  it('calificar A → NINGÚN evidence_ref apunta a un chunk de B', async () => {
    const out = await matchClaimsToChunks({ client_id: CLIENT_A, claims: claimsA })

    // Invariante A4 · ningún chunk de B se cuela en la evidencia de A.
    for (const ref of out.evidence_refs) {
      expect(B_CHUNK_IDS).not.toContain(ref)
    }
    for (const m of out.matches) {
      if (m.chunk_id) expect(B_CHUNK_IDS).not.toContain(m.chunk_id)
    }
    // Y positivamente · la evidencia de A son chunks de A (mejor candidato del PROPIO cliente).
    expect(out.evidence_refs.sort()).toEqual(['A-chunk-1', 'A-chunk-2'])
    expect(out.grounding).toBe('chunk_linked')
  })

  it('el seam pasa client_id en CADA llamada al CEREBRO (nunca lo omite)', async () => {
    await matchClaimsToChunks({ client_id: CLIENT_A, claims: claimsA })
    expect(state.calls.length).toBe(claimsA.length)
    for (const call of state.calls) {
      expect(call.client_id).toBe(CLIENT_A) // el filtro por tenant nunca se saltea
    }
  })

  it('calificar B con las MISMAS queries → sólo evidencia de B (simetría · sin cruce)', async () => {
    const out = await matchClaimsToChunks({ client_id: CLIENT_B, claims: claimsA })
    const A_CHUNK_IDS = ['A-chunk-1', 'A-chunk-2']
    for (const ref of out.evidence_refs) expect(A_CHUNK_IDS).not.toContain(ref)
    expect(out.evidence_refs.sort()).toEqual(['B-chunk-1', 'B-chunk-2'])
  })

  it('test-the-test · un índice LEAKY (ignora client_id) SÍ filtra un chunk de B → la aserción caza A4', async () => {
    // Se desactiva el filtro por tenant (simula el bug A4 · HNSW sin scope de cliente).
    state.enforceIsolation = false
    const out = await matchClaimsToChunks({ client_id: CLIENT_A, claims: claimsA })

    // Con la fuga activa, la evidencia de A AHORA contiene chunks de B (mayor similaridad).
    const leaked = out.evidence_refs.filter((ref) => B_CHUNK_IDS.includes(ref))
    expect(leaked.length).toBeGreaterThan(0) // la prueba es CAPAZ de detectar la fuga
  })
})
