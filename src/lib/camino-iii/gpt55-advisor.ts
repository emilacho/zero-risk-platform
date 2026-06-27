/**
 * Camino III · GPT-5.5 · cazador de punto ciego (SPEC 2026-06-27 §3) · §144.
 *
 * GPT-5.5 corre como 4º revisor de OTRA familia (rompe el punto ciego de 3
 * Claude). NO vota para aprobar (su verde/ámbar no suma a la matemática 3-of-N
 * · ya filtrado por `is_voting=false` en tabulate). PERO frena · si marca ROJO
 * donde los 3 jefes dieron verde (machine_verdict PASS), su desacuerdo FUERZA
 * revisión humana (override PASS→ESCALATE). Siempre adjunta sus correcciones al
 * expediente (consolidateCorrections incluye is_voting=false).
 *
 * Flag · `SALA_GPT55_ADVISOR_ENABLED` default OFF · el slot (agente
 * `gpt-5.5-advisor` · posición `qa-advisor-D` · columna is_voting) ya existe ·
 * este módulo agrega el OVERRIDE + el gate del flag. Encender cuando haya masa
 * crítica de revisiones calibradas (Braintrust · Etapa 2).
 */

/** Veredicto-máquina de tabulate (3 votantes). */
export type MachineVerdict = 'PASS' | 'REJECT' | 'ESCALATE'

/** El color que emite el advisor (mismo vocabulario que un voto). */
export type AdvisorVote = 'green' | 'amber' | 'red'

/** Flag · default OFF. El advisor solo aplica override cuando está encendido. */
export function isGpt55AdvisorEnabled(): boolean {
  return process.env.SALA_GPT55_ADVISOR_ENABLED === 'true'
}

export interface BlindSpotOverrideResult {
  /** Veredicto final tras considerar al advisor. */
  readonly verdict: MachineVerdict
  /** true cuando el advisor forzó el cambio (PASS→ESCALATE). */
  readonly overridden: boolean
  readonly reason: string
}

/**
 * Apply the GPT-5.5 blind-spot override to a machine verdict.
 *
 * Canon rule (SPEC §3) · ONLY a `red` advisor vote on a `PASS` machine verdict
 * forces ESCALATE (the 3 voters approved · the outside model disagrees → human
 * must look). Every other combination leaves the machine verdict UNTOUCHED ·
 * the advisor never auto-approves, never downgrades a REJECT, never sways the
 * tally. No-op when the flag is OFF or no advisor vote was cast.
 */
export function applyBlindSpotOverride(
  machineVerdict: MachineVerdict,
  advisorVote: AdvisorVote | null | undefined,
  opts: { enabled?: boolean } = {},
): BlindSpotOverrideResult {
  const enabled = opts.enabled ?? isGpt55AdvisorEnabled()

  if (!enabled) {
    return {
      verdict: machineVerdict,
      overridden: false,
      reason: 'advisor disabled (SALA_GPT55_ADVISOR_ENABLED!=true) · no override',
    }
  }
  if (!advisorVote) {
    return {
      verdict: machineVerdict,
      overridden: false,
      reason: 'no advisor vote · machine verdict unchanged',
    }
  }
  if (machineVerdict === 'PASS' && advisorVote === 'red') {
    return {
      verdict: 'ESCALATE',
      overridden: true,
      reason: 'blind-spot · 3 voters PASS but GPT-5.5 red → force human review',
    }
  }
  return {
    verdict: machineVerdict,
    overridden: false,
    reason: `advisor ${advisorVote} does not override machine ${machineVerdict}`,
  }
}
