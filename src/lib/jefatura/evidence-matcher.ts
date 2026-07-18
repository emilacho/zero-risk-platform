/**
 * JEFATURA · matching REAL afirmación→fragmento (claim→chunk) · ADR-020 M1 ·
 * Sprint JEFATURA §8 endurecimiento 2. Base: substrato #278 (chunk_id surfaceado).
 *
 * El substrato #278 surfacea los chunk_ids recuperados pero declara
 * `grounding: prose_only` porque NO existe matching claim→chunk (los chunks se
 * inyectan como prosa, no linkeados a una afirmación específica).
 *
 * Este módulo construye ese matching REAL: por cada CLAIM del brand book busca en el
 * CEREBRO el chunk que lo fundamenta (similaridad coseno ≥ threshold). Cuando existe
 * el link, `grounding` flipea a `chunk_linked` — el TARGET del cimiento (§155).
 *
 * ── Calibración pre-P3 (sonda E2 2026-07-17 · Náufrago 484 chunks · ruling consejero
 *    17-jul) · 4 endurecimientos sobre #285 ────────────────────────────────────────
 *   fix 1 · el grounding se GATEA SOLO por campos FÁCTICOS (`DEFAULT_GATED_FIELDS` ·
 *           positioning/icp_summary). Las reglas de voz/tono son prescriptivas (no
 *           hechos de discovery · en E2 0/15 trazaban a evidencia) · se puntúan pero
 *           NO bloquean groundedness. Sin esto, un set heterogéneo hechos+estilo hacía
 *           `chunk_linked` INALCANZABLE con datos reales.
 *   fix 2 · el veredicto se decide por COVERAGE fáctica (fracción de campos fácticos
 *           fundamentados ≥ una vara TUNABLE) · NO por un ALL global sobre todas las
 *           claims. `factual_coverage` expone la verdad granular.
 *   fix 3 · (NO NEGOCIABLE) `brand_books` EXCLUIDO del pool de matching · una claim del
 *           brand book NO puede fundamentarse en el brand book mismo (self-match
 *           circular @1.000 detectado en E2). Groundedness = traza a EVIDENCIA de
 *           discovery (competidores · ICP · VoC · outputs), no a sí misma.
 *   + umbral v1 = 0.72 (era 0.75) TUNABLE por config · captura paráfrasis fáctica
 *     legítima (E2: soporte real 0.74-0.89 · ruido ≤0.69 · gap real). CAVEAT: muestra
 *     fina n=6 · re-calibrable con más cimientos.
 *
 * Honestidad (endurecimiento del consejero · NO sobre-vender): `chunk_linked` SOLO si
 * la cobertura FÁCTICA alcanza la vara. Si no → `prose_only` (no se afirma
 * groundedness que no existe). `factual_coverage` + `matches[]` dicen campo-por-campo
 * qué se fundamentó y con qué chunk.
 *
 * §148 · DISEÑO $0 · función pura de orquestación sobre `queryClientBrain` · el costo
 * runtime es 1 embedding por claim (~$0.00002) · nada se cablea acá.
 */
import { queryClientBrain, type BrainSection } from '../client-brain'
import { DEFAULT_GATED_FIELDS } from './fidelity-grader'

/** Umbral de similaridad coseno v1 para considerar una claim "fundamentada" por un
 *  chunk. TUNABLE por config (env `JEFATURA_MATCH_THRESHOLD` · no redeploy). Calibrado
 *  empíricamente (sonda E2 2026-07-17): los claims fácticos trazan a evidencia real en
 *  0.74-0.89 · el ruido queda ≤0.69 (gap real) · 0.72 captura paráfrasis legítima sin
 *  admitir ruido. CAVEAT: muestra fina n=6 · re-calibrable con más cimientos. */
export const DEFAULT_MATCH_THRESHOLD = 0.72

/** Cobertura FÁCTICA mínima para declarar `chunk_linked`. TUNABLE por config (env
 *  `JEFATURA_GROUNDING_COVERAGE_MIN`). Default 1.0 = piso HONESTO (todo campo fáctico
 *  traza a evidencia) · el consejero puede bajarlo a medida que más cimientos calibren
 *  la vara. NO es ALL-global (fix 2): la fracción es sólo sobre los campos fácticos. */
export const DEFAULT_GROUNDING_COVERAGE_MIN = 1.0

/** Secciones del CEREBRO que cuentan como EVIDENCIA (fix 3 · NO NEGOCIABLE). El brand
 *  book (`brand_books`) queda EXCLUIDO: la groundedness de una claim se demuestra
 *  contra la evidencia de discovery, nunca contra el propio brand book (self-match). */
export const EVIDENCE_SECTIONS: readonly BrainSection[] = [
  'competitive_landscape',
  'icp_documents',
  'voc_library',
  'historical_outputs',
]

const inUnit = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= 1

/** Resuelve el umbral de match · precedencia override > env > default. */
export function resolveMatchThreshold(override?: number): number {
  if (typeof override === 'number' && inUnit(override)) return override
  const n = Number(process.env.JEFATURA_MATCH_THRESHOLD)
  return inUnit(n) ? n : DEFAULT_MATCH_THRESHOLD
}

/** Resuelve la cobertura fáctica mínima · precedencia override > env > default. */
export function resolveGroundingCoverageMin(override?: number): number {
  if (typeof override === 'number' && inUnit(override)) return override
  const n = Number(process.env.JEFATURA_GROUNDING_COVERAGE_MIN)
  return inUnit(n) ? n : DEFAULT_GROUNDING_COVERAGE_MIN
}

/** ¿La fuente del chunk es el propio brand book? Normaliza el prefijo `client_`
 *  (el CEREBRO guarda `client_brand_books` · el tipo público es `brand_books`) para
 *  que el filtro fix 3 sea robusto ante ambas formas. */
export function isBrandBookSource(sourceTable: string | null | undefined): boolean {
  if (!sourceTable) return false
  const s = sourceTable.startsWith('client_') ? sourceTable.slice('client_'.length) : sourceTable
  return s === 'brand_books'
}

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
  /** Similaridad coseno del mejor chunk de EVIDENCIA (0 si no hubo resultados). */
  readonly similarity: number
  /** true si similarity ≥ threshold (la claim está fundamentada). */
  readonly matched: boolean
  /** true si el campo es FÁCTICO (gatea groundedness · fix 1). Los no-fácticos
   *  (voz/tono) se reportan pero NO cuentan para `factual_coverage`/`grounding`. */
  readonly gated: boolean
  /** Tabla fuente del chunk que fundamenta (auditoría) · presente solo si matched. */
  readonly source_table?: string
}

export interface EvidenceMatchResult {
  readonly matches: EvidenceMatch[]
  /** chunk_ids que fundamentan HECHOS, deduplicados · el `evidence_refs[]` REAL de M1
   *  (solo de campos fácticos matcheados · sostienen groundedness). */
  readonly evidence_refs: string[]
  /** `chunk_linked` SOLO si la cobertura fáctica ≥ la vara (fix 1+2 · honesto). */
  readonly grounding: 'chunk_linked' | 'prose_only'
  /** Fracción de TODAS las claims fundamentadas (0..1) · verdad granular · backward-compat. */
  readonly coverage: number
  /** Fracción de campos FÁCTICOS fundamentados (0..1) · lo que DECIDE el grounding. */
  readonly factual_coverage: number
  /** Campos fácticos fundamentados / total (para la traza §148). */
  readonly factual_matched: number
  readonly factual_total: number
  readonly threshold: number
  /** La vara de cobertura efectiva usada para el veredicto (config resuelta). */
  readonly grounding_coverage_min: number
}

/**
 * Linkea cada claim del brand book a su chunk del CEREBRO (SOLO evidencia · fix 3).
 * El grounding se decide por la COVERAGE de los campos FÁCTICOS (fix 1+2): cuando la
 * fracción de campos fácticos fundamentados alcanza la vara → `chunk_linked`; si no →
 * `prose_only` (no se sobre-vende). Async · una query de brain por claim.
 */
export async function matchClaimsToChunks(args: {
  readonly client_id: string
  readonly claims: readonly ClaimInput[]
  readonly threshold?: number
  /** Campos que GATEAN groundedness · default `DEFAULT_GATED_FIELDS` (fácticos). */
  readonly gatedFields?: readonly string[]
  /** Cobertura fáctica mínima para `chunk_linked` · default config/1.0. */
  readonly groundingCoverageMin?: number
  readonly match_count?: number
}): Promise<EvidenceMatchResult> {
  const threshold = resolveMatchThreshold(args.threshold)
  const coverageMin = resolveGroundingCoverageMin(args.groundingCoverageMin)
  const gatedFields: readonly string[] = args.gatedFields ?? DEFAULT_GATED_FIELDS
  const isGated = (field: string): boolean => gatedFields.includes(field)
  // Pedimos un pool ≥5 para tener candidatos tras excluir brand_books (fix 3).
  const poolSize = Math.max(args.match_count ?? 5, 5)

  const matches: EvidenceMatch[] = []

  for (const claim of args.claims) {
    const gated = isGated(claim.field)
    const text = (claim.text ?? '').trim()
    if (!text) {
      matches.push({ field: claim.field, chunk_id: null, similarity: 0, matched: false, gated })
      continue
    }
    // fix 3 · buscamos SOLO en secciones-evidencia (brand_books excluido en origen).
    // El RPC devuelve ordenado por similaridad desc → results[0] es el mejor candidato.
    const results = await queryClientBrain({
      client_id: args.client_id,
      query: text,
      sections: EVIDENCE_SECTIONS as BrainSection[],
      match_count: poolSize,
    })
    // fix 3 (defensa en profundidad) · aun si el índice/consumidor devolviera un chunk
    // de brand_books, lo sacamos ANTES de elegir el mejor · mata el self-match circular.
    const evidence = results.filter((r) => !isBrandBookSource(r.source_table))
    const best = evidence[0]
    const similarity = best?.similarity ?? 0
    const matched = !!best && similarity >= threshold
    matches.push({
      field: claim.field,
      chunk_id: matched ? best.chunk_id : null,
      similarity,
      matched,
      gated,
      ...(matched ? { source_table: best.source_table } : {}),
    })
  }

  // fix 1 · groundedness la deciden SOLO los campos fácticos.
  const factual = matches.filter((m) => m.gated)
  const factualMatched = factual.filter((m) => m.matched)
  const factual_total = factual.length
  const factual_matched = factualMatched.length
  // fix 2 · COVERAGE fáctica (no ALL-global).
  const factual_coverage = factual_total > 0 ? factual_matched / factual_total : 0

  // evidence_refs = chunks que fundamentan HECHOS (dedup) · sostienen groundedness.
  const evidence_refs = [
    ...new Set(factualMatched.filter((m) => m.chunk_id).map((m) => m.chunk_id as string)),
  ]

  // cobertura global (todas las claims) · verdad granular · backward-compat.
  const coverage =
    matches.length > 0 ? matches.filter((m) => m.matched).length / matches.length : 0

  // Honesto: chunk_linked SOLO si HAY campos fácticos Y su cobertura ≥ la vara.
  // Sin campos fácticos → prose_only (nada fáctico que fundamentar ≠ fundamentado).
  const grounding: 'chunk_linked' | 'prose_only' =
    factual_total > 0 && factual_coverage >= coverageMin ? 'chunk_linked' : 'prose_only'

  return {
    matches,
    evidence_refs,
    grounding,
    coverage,
    factual_coverage,
    factual_matched,
    factual_total,
    threshold,
    grounding_coverage_min: coverageMin,
  }
}
