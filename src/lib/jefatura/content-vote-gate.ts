/**
 * JEFATURA · gate de voto de CONTENIDO · Sprint JEFATURA F1.3 · ADR-020.
 *
 * Generaliza el voto 3-de-N existente (Camino III · `hi5nwPCGUWHkGnT7`) en una
 * capacidad de JUICIO reusable que se cuelga del contrato único (`./contract`).
 * NO reimplementa la tabulación: reusa `tabulateVotes` (matriz canónica Sprint
 * 7.6) y la valida contra el contrato de la Jefatura.
 *
 * Reglas canónicas (ADR-020 §82-85):
 *   - Tabulador DETERMINISTA · ≥2 verde & 0 rojo → PASS · ≥2 rojo → REJECT ·
 *     resto (split/insuficiente) → ESCALATE (HITL).
 *   - REJECT **SIEMPRE** con corrections (ADR-020 §58 · un REJECT sin corrections
 *     es un bug · se enforcea acá).
 *   - Vota SOLO contenido · el cimiento va a fidelidad (no-circularidad §4) — este
 *     módulo NUNCA se invoca sobre `artifact_class: 'cimiento'`.
 *   - Vota contra el **brand book del CEREBRO** (evidencia de grounding · abajo).
 *
 * §148 · esto es DISEÑO $0 · función pura + helper de evidencia · nada se cablea
 * a prod acá (el apply/wiring es build post-GO).
 */
import { tabulateVotes, type VoteRecord, type ReviewStatus } from '../camino-iii/tabulate'
import { validateCorrectionObject, type CorrectionObject } from '../camino-iii/corrections'
import { queryClientBrain, type BrainSearchResult } from '../client-brain'
import type { JefaturaCorrection, JefaturaOutput, JefaturaVerdict } from './contract'

/**
 * El contrato usa severidad en español (`rojo|ambar`) · el módulo Camino III la
 * emite en inglés (`red|amber`). Único punto de traducción.
 */
const SEVERITY_TO_CONTRACT: Record<CorrectionObject['severidad'], JefaturaCorrection['severidad']> = {
  red: 'rojo',
  amber: 'ambar',
}

function toJefaturaCorrection(c: CorrectionObject): JefaturaCorrection {
  return {
    eje: c.eje,
    severidad: SEVERITY_TO_CONTRACT[c.severidad],
    donde: c.donde,
    problema: c.problema,
    por_que: c.por_que,
    cambio_sugerido: c.cambio_sugerido,
  }
}

/**
 * Mapea el `status` determinista del tabulador → veredicto del contrato.
 * - `approved`       → PASS
 * - `rejected`       → REJECT (exige corrections aguas abajo)
 * - `escalated_hitl` → ESCALATE (split ambiguo)
 * - `pending`        → ESCALATE (votos insuficientes · NUNCA auto-PASS · seguro)
 * - `expired`/`cancelled` → ESCALATE (review terminó sin decisión · va a humano · nunca auto-PASS)
 */
export function statusToVerdict(status: ReviewStatus): JefaturaVerdict {
  switch (status) {
    case 'approved':
      return 'PASS'
    case 'rejected':
      return 'REJECT'
    case 'escalated_hitl':
    case 'pending':
    case 'expired':
    case 'cancelled':
      return 'ESCALATE'
  }
}

export interface ContentVoteGateInput {
  /** Votos de los revisores · `is_voting:false` (advisors) se excluyen del tally. */
  readonly votes: VoteRecord[]
  /** Canónico 3 · configurable per política (`vote_config.expected_votes`). */
  readonly expectedVotes?: number
  /** Enlace de observabilidad (agent_invocations.metadata · M1/F4.3). */
  readonly trace_id: string
}

/** Error tipado · un REJECT sin corrections viola el contrato (ADR-020 §58). */
export class RejectWithoutCorrectionsError extends Error {
  readonly code = 'E-JEFATURA-REJECT-NO-CORRECTIONS'
  constructor() {
    super('un veredicto REJECT requiere ≥1 corrección válida (ADR-020 §58 · rechazo SIEMPRE con corrections)')
    this.name = 'RejectWithoutCorrectionsError'
  }
}

/**
 * Gate de contenido determinista. Corre el voto 3-de-N canónico, consolida las
 * corrections válidas de los votantes, y devuelve el `JefaturaOutput` del
 * contrato. Enforcea REJECT⇒corrections. Función PURA (sin I/O).
 *
 * @throws {RejectWithoutCorrectionsError} si el tally es REJECT y no hay
 *   ninguna corrección válida (input malformado · red sin corrections).
 */
export function evaluateContentVoteGate(input: ContentVoteGateInput): JefaturaOutput {
  const tab = tabulateVotes(input.votes, input.expectedVotes ?? 3)
  const verdict = statusToVerdict(tab.status)

  // Consolidar corrections válidas de los votantes (advisors excluidos). Las
  // inválidas se descartan (mismo criterio leniente que el votes endpoint · un
  // objeto malformado no debe tumbar la consolidación).
  const corrections: JefaturaCorrection[] = []
  for (const v of input.votes) {
    if (v.is_voting === false) continue
    for (const raw of v.corrections ?? []) {
      const r = validateCorrectionObject(raw)
      if (r.ok) corrections.push(toJefaturaCorrection(r.value))
    }
  }

  // ADR-020 §58 · un REJECT SIEMPRE viaja con corrections. Si el tally rechaza
  // pero no sobrevive ninguna corrección válida, el input está roto (red sin
  // corrections) → fail loud · NO se emite un REJECT vacío (sería el mismo
  // falso-verde invertido: un bloqueo sin el qué-corregir accionable).
  if (verdict === 'REJECT' && corrections.length === 0) {
    throw new RejectWithoutCorrectionsError()
  }

  return {
    corrections,
    verdict,
    scores: { votes: tab.votes },
    trace_id: input.trace_id,
  }
}

/**
 * Sustrato de "vota contra el brand book del CEREBRO": trae el brand book del
 * cliente desde el CEREBRO (`client_brain_chunks` · sección `brand_books`) como
 * evidencia de grounding para los votantes. Los revisores votan el contenido
 * CONTRA esta verdad del cliente (voice · terminología · posicionamiento).
 *
 * Nota: la EMISIÓN de los votos la hacen los agentes revisores (workflow n8n) ·
 * este helper les provee la evidencia canónica; la TABULACIÓN es determinista
 * (arriba). No decide nada por sí solo.
 */
export async function fetchBrandBookEvidence(
  client_id: string,
  query = 'brand voice · terminología · posicionamiento · restricciones del cliente',
  match_count = 8,
): Promise<BrainSearchResult[]> {
  return queryClientBrain({ client_id, query, sections: ['brand_books'], match_count })
}
