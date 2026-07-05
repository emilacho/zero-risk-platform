/**
 * JEFATURA · contrato de calificación único · Sprint JEFATURA F0.3 · ADR-020.
 *
 * La Jefatura es UN módulo de calificación · los workflows se cuelgan de ella
 * por CONTRATO (v1 · executeWorkflowTrigger · target event-driven cuando la sala
 * viva). NO reimplementan calidad adentro. Un solo contrato de entrada y de salida
 * gobierna ambas clases de artefacto (cimiento · contenido).
 *
 * Mnemotecnia (ADR-020 §70): la Jefatura corrige siempre · vota solo contenido ·
 * la fidelidad valida cimientos · Braintrust califica a los que califican ·
 * GPT-5.5 caza puntos ciegos.
 *
 * §148 · esto es DISEÑO $0 (tipos + contrato documentado) · nada se cablea aún.
 */

// ─── Entrada · sobre uniforme (ADR-020 §38-44) ──────────────────────────────
// Cualquier productor entrega ESTO. La Jefatura NO sabe qué workflow la llamó ·
// el `artifact_type` gobierna todo el tratamiento (vía jefatura_grading_policies).
export interface JefaturaInput {
  /** Clave del registry · gobierna la política (ej. 'brand_book' | 'ad_creative'). */
  readonly artifact_type: string
  /** Id del artefacto a calificar (uuid o clave de negocio). */
  readonly artifact_id: string
  /** Cliente dueño del artefacto · null solo en flujos sin cliente aún resuelto. */
  readonly client_id: string | null
  /** Correlación con el journey/stream que lo produjo (trazabilidad ADR-018). */
  readonly journey_id: string | null
  /** El contenido a calificar (draft + evidencia). Shape libre por artifact_type. */
  readonly payload: Record<string, unknown>
}

// ─── Corrección accionable (formato SPEC-lazo §6 · ADR-020 §57) ─────────────
// Los jefes DIAGNOSTICAN (emiten esto) · el CREADOR original corrige (no-auto-
// calificación · los jefes nunca reescriben).
export interface JefaturaCorrection {
  readonly eje: 'factual' | 'voz' | 'posicionamiento' | 'cliente'
  readonly severidad: 'rojo' | 'ambar'
  readonly donde: string
  readonly problema: string
  readonly por_que: string
  readonly cambio_sugerido: string
}

/**
 * Veredicto unificado (ADR-020 §82-85):
 * - `PASS`      · aprobado (fidelidad ≥umbral en cimiento · ≥2 verde/0 rojo en contenido).
 * - `REJECT`    · rechazado (≥2 rojo en contenido) · SIEMPRE acompañado de corrections.
 * - `ESCALATE`  · a humano (HITL · voto sin mayoría · o punto ciego de GPT-5.5).
 * - `CORRECTED` · pasó por la rama "corregir" y re-entregó (estado intermedio del loop).
 */
export type JefaturaVerdict = 'PASS' | 'REJECT' | 'ESCALATE' | 'CORRECTED'

// ─── Scores · fidelidad (cimiento) | votos (contenido) ──────────────────────
export interface JefaturaScores {
  /** Groundedness ≥0.85 factual · solo cimiento. */
  readonly fidelity?: number
  /** Tally del voto 3-de-N · solo contenido (amber = advisory · fuera del tally-gate). */
  readonly votes?: {
    readonly green: number
    readonly amber: number
    readonly red: number
    readonly total: number
  }
}

// ─── Salida · contrato único (ADR-020 §82-85) ───────────────────────────────
export interface JefaturaOutput {
  /** Objetos accionables · vacío si no hay nada que corregir. Un REJECT sin corrections es un bug (ADR-020 §58). */
  readonly corrections: readonly JefaturaCorrection[]
  readonly verdict: JefaturaVerdict
  readonly scores: JefaturaScores
  /** Enlace de observabilidad (agent_invocations.metadata · sustrato de Braintrust · M1/F4.3). */
  readonly trace_id: string
}

// ─── Registry (F0.2 · fila de jefatura_grading_policies) ────────────────────
export interface JefaturaGradingPolicy {
  readonly artifact_type: string
  readonly artifact_class: 'cimiento' | 'contenido'
  /** Siempre true (ADR-020 §36 · corrección = función base). */
  readonly correction_enabled: boolean
  /** true solo en contenido · false en cimiento (no-circularidad §4). */
  readonly judgment_enabled: boolean
  readonly canon_grader: 'fidelity' | 'vote_3_of_n'
  readonly counterweight: 'shadow_scorer' | 'gpt55_non_voting' | null
  /** Loop-cap central · default 1 (ADR-020 §7). */
  readonly max_cycles: number
  /** ≥0.85 en cimiento · null en contenido. */
  readonly fidelity_threshold: number | null
  /** {expected_votes, approve, reject, else, amber, red_requires_corrections} en contenido · null en cimiento. */
  readonly vote_config: Record<string, unknown> | null
  readonly is_active: boolean
}
