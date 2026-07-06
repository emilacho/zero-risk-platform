/**
 * JEFATURA · matching REAL afirmación→fragmento (claim→chunk) · ADR-020 M1 ·
 * Sprint JEFATURA §8 endurecimiento 2. Base: substrato #278 (chunk_id surfaceado).
 *
 * El substrato #278 surfacea los chunk_ids recuperados pero declara
 * `grounding: prose_only` porque NO existe matching claim→chunk (los chunks se
 * inyectan como prosa, no linkeados a una afirmación específica).
 *
 * Este módulo construye ese matching REAL: por cada CLAIM del brand book (campo
 * fáctico · positioning · icp_summary · etc.) busca en el CEREBRO el chunk que
 * lo fundamenta (similaridad coseno ≥ threshold). Cuando existe el link,
 * `grounding` flipea a `chunk_linked` — el TARGET del cimiento (§155).
 *
 * Honestidad (endurecimiento del consejero · NO sobre-vender):
 *   `chunk_linked` SOLO si TODAS las claims trazan a un chunk ≥ threshold
 *   (groundedness completa). Si alguna claim queda sin chunk → `prose_only`
 *   (no se afirma groundedness que no existe). `coverage` expone la verdad
 *   granular · `matches[]` dice claim-por-claim qué se fundamentó y con qué chunk.
 *
 * §148 · DISEÑO $0 · función pura de orquestación sobre `queryClientBrain` ·
 * el costo runtime es 1 embedding por claim (~$0.00002) · nada se cablea acá.
 */
import { queryClientBrain } from '../client-brain'

/** Umbral de similaridad coseno para considerar una claim "fundamentada" por un
 *  chunk. Tunable · default conservador: una claim derivada de su chunk fuente
 *  matchea ~0.8+ · 0.75 exige apoyo real sin exigir texto idéntico. */
export const DEFAULT_MATCH_THRESHOLD = 0.75

export interface ClaimInput {
  /** Nombre del campo del brand book (ej. 'positioning' · 'icp_summary'). */
  readonly field: string
  /** El texto de la afirmación a fundamentar contra el CEREBRO. */
  readonly text: string
}

export interface EvidenceMatch {
  readonly field: string
  /** chunk_id del CEREBRO que fundamenta la claim · null si ninguno ≥ threshold. */
  readonly chunk_id: string | null
  /** Similaridad coseno del mejor chunk (0 si no hubo resultados). */
  readonly similarity: number
  /** true si similarity ≥ threshold (la claim está fundamentada). */
  readonly matched: boolean
  /** Tabla fuente del chunk que fundamenta (auditoría) · presente solo si matched. */
  readonly source_table?: string
}

export interface EvidenceMatchResult {
  readonly matches: EvidenceMatch[]
  /** chunk_ids fundamentantes, deduplicados · el `evidence_refs[]` REAL de M1. */
  readonly evidence_refs: string[]
  /** `chunk_linked` SOLO si todas las claims matchearon · si no `prose_only` (honesto). */
  readonly grounding: 'chunk_linked' | 'prose_only'
  /** Fracción de claims fundamentadas (0..1) · verdad granular · no sobre-vende. */
  readonly coverage: number
  readonly threshold: number
}

/**
 * Linkea cada claim del brand book a su chunk del CEREBRO. Cuando TODAS trazan a
 * un chunk ≥ threshold, `grounding` = `chunk_linked` (groundedness real). Si no,
 * `prose_only` (no se sobre-vende). Async · una query de brain por claim.
 */
export async function matchClaimsToChunks(args: {
  readonly client_id: string
  readonly claims: readonly ClaimInput[]
  readonly threshold?: number
  readonly match_count?: number
}): Promise<EvidenceMatchResult> {
  const threshold = args.threshold ?? DEFAULT_MATCH_THRESHOLD
  const matches: EvidenceMatch[] = []

  for (const claim of args.claims) {
    const text = (claim.text ?? '').trim()
    if (!text) {
      matches.push({ field: claim.field, chunk_id: null, similarity: 0, matched: false })
      continue
    }
    // Buscar en TODO el CEREBRO (no solo brand_books · una claim se fundamenta
    // en la evidencia fuente · competitive/icp · no en sí misma). El RPC devuelve
    // ordenado por similaridad desc → results[0] es el mejor candidato.
    const results = await queryClientBrain({
      client_id: args.client_id,
      query: text,
      match_count: args.match_count ?? 3,
    })
    const best = results[0]
    const similarity = best?.similarity ?? 0
    const matched = !!best && similarity >= threshold
    matches.push({
      field: claim.field,
      chunk_id: matched ? best.chunk_id : null,
      similarity,
      matched,
      ...(matched ? { source_table: best.source_table } : {}),
    })
  }

  const matchedCount = matches.filter((m) => m.matched).length
  const evidence_refs = [
    ...new Set(matches.filter((m) => m.matched && m.chunk_id).map((m) => m.chunk_id as string)),
  ]
  const coverage = matches.length > 0 ? matchedCount / matches.length : 0
  // Honesto: chunk_linked SOLO con groundedness completa (toda claim fundamentada).
  // Un set vacío NUNCA es chunk_linked (nada que fundamentar ≠ fundamentado).
  const grounding: 'chunk_linked' | 'prose_only' =
    matches.length > 0 && matchedCount === matches.length ? 'chunk_linked' : 'prose_only'

  return { matches, evidence_refs, grounding, coverage, threshold }
}
