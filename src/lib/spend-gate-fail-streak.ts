/**
 * §150 · FALLO ABIERTO **ACOTADO** · criterio del Consejero, aceptado 2026-08-23.
 *
 * El fallo abierto se mantiene para el caso que lo justifica: una consulta que
 * falla UNA vez es una caída pasajera, y frenar la agencia por eso sería peor.
 *
 * **Pero una consulta que falla SIEMPRE no es una caída: es una rotura.** Y ahí
 * "dejar pasar" deja de ser prudencia y pasa a ser **gasto sin techo por tiempo
 * indefinido**. El precedente es nuestro: el incidente de $19 fue exactamente eso —
 * algo que seguía corriendo porque nadie lo frenaba.
 *
 * Regla · se cuentan los fallos CONSECUTIVOS de la consulta del tope. Al llegar a K
 * (`RUN_SPEND_CAP_FAIL_STREAK` · 3 por default) el freno **deja de dejar pasar**.
 * Un solo éxito reinicia la cuenta.
 *
 * ⚠️ Límite honesto del alcance · la cuenta vive **en memoria del proceso**. En
 * serverless cada instancia tiene la suya, así que esto **acota** el daño sin
 * garantizar exactamente-K a nivel global — el mismo compromiso, y por el mismo
 * motivo, que la anti-inundación de los avisos. La alternativa (contador en base)
 * necesitaría la misma base que acaba de fallar.
 */

/**
 * Fallos consecutivos tolerados antes de dejar de dejar pasar.
 *
 * ── (a) POR QUÉ 3 · la cuenta en plata, para poder re-calibrarla con evidencia ──
 * Costo observado por invocación de empleado (medición CC#3 · corridas reales de
 * agosto): **~$0,6 a $0,8**. Con K=3, lo máximo que se fuga mientras el freno está
 * ciego es:
 *
 *     K × costo_por_invocación = 3 × ~$0,7 ≈ **~$2 por instancia**
 *
 * Ese ~$2 es la cota que se está comprando, y es del mismo orden que el techo del
 * cubo `system` ($2) · no es una coincidencia buscada, pero sirve de referencia.
 * Si el costo por invocación sube (modelos más caros, tareas más largas), **K hay
 * que bajarlo**: la cota es K × costo, no K a secas.
 *
 * ── (b) DISPARADOR DE REVISIÓN · esto NO es una cota global ──
 * 🔴 La cuenta vive por proceso. **Si alguna vez corren VARIAS ALTAS EN PARALELO,
 * esta cota se multiplica por la cantidad de instancias y hay que revisarla.**
 * Con 5 instancias simultáneas la fuga posible pasa de ~$2 a ~$10 · con 10, a ~$20.
 * Hoy el alta corre de a una (los tres procesos están pausados · CC#3 2026-08-23),
 * así que la cota vale. **El día que eso cambie, este número deja de valer.**
 */
export const DEFAULT_FAIL_STREAK_LIMIT = 3

/** Costo observado por invocación de empleado · base de la aritmética de arriba. */
export const COSTO_OBSERVADO_POR_INVOCACION_USD = 0.7

/** La cota de fuga que compra el K vigente · POR INSTANCIA (ver disparador arriba). */
export function fugaAcotadaUsd(costoPorInvocacionUsd = COSTO_OBSERVADO_POR_INVOCACION_USD): number {
  return resolveFailStreakLimit() * costoPorInvocacionUsd
}

/** Qué freno lleva la cuenta · son roturas distintas y se cuentan aparte. */
export type GateScope = 'run-sdk' | 'sala-router'

const streaks = new Map<GateScope, number>()

/** Límite · env `RUN_SPEND_CAP_FAIL_STREAK` (entero positivo) > default 3. */
export function resolveFailStreakLimit(): number {
  const n = Number(process.env.RUN_SPEND_CAP_FAIL_STREAK)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_FAIL_STREAK_LIMIT
}

/** Registra un fallo de la consulta del tope · devuelve la racha resultante. */
export function recordGateFailure(scope: GateScope): number {
  const next = (streaks.get(scope) ?? 0) + 1
  streaks.set(scope, next)
  return next
}

/** Un solo éxito reinicia la cuenta · la rotura dejó de estarlo. */
export function recordGateSuccess(scope: GateScope): void {
  if (streaks.get(scope)) streaks.set(scope, 0)
}

export function currentFailStreak(scope: GateScope): number {
  return streaks.get(scope) ?? 0
}

/**
 * ¿La racha ya alcanzó el límite? Cuando esto es `true`, el freno **deja de dejar
 * pasar**: no estamos ante una caída, estamos ante algo roto.
 */
export function isFailStreakExhausted(scope: GateScope, streak?: number): boolean {
  return (streak ?? currentFailStreak(scope)) >= resolveFailStreakLimit()
}

/** Sólo para pruebas. */
export function resetGateFailStreaks(): void {
  streaks.clear()
}
