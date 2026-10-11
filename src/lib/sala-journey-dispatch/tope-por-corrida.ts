/**
 * Tope de costo POR CLIENTE en el despacho de la sala · general, sin cliente nombrado.
 *
 * Antes el tope estaba atado al cliente piloto (un uuid y un alias escritos en el código, más dos variables de entorno con su nombre): ningún otro cliente lo tenía.
 * Ahora aplica a CUALQUIER tenant, y el techo de cada uno sale de su ficha: `clients.config.spend_cap_usd` (número > 0). Sin ese dato rige el techo general.
 * Es la misma regla que el freno §150 de `/api/agents/run-sdk` (`resolveClientCapOverrideUsd`).
 *
 * §148 honesto · sigue siendo SOMBRA hasta que Emilio active `SALA_RUN_CAP_ENFORCE="true"`: con la bandera apagada el techo se puede consultar (panel, auditoría) pero NUNCA bloquea.
 * Reversible: apagar la bandera deja el tope inerte (el freno por cubo G6 y el §150 de run-sdk siguen vivos).
 */

/** techo general por corrida cuando la ficha del cliente no trae el suyo · USD 5,00 */
export const RUN_CAP_DEFAULT_USD = 5.0

/** el techo vivo · `SALA_RUN_CAP_USD` (número finito > 0) si existe, si no el general. La ficha del cliente lo baja o lo sube pasando `cap_usd` a `evaluateRunCap`. */
export function resolveRunCapUsd(): number {
  const raw = process.env.SALA_RUN_CAP_USD
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : RUN_CAP_DEFAULT_USD
}

/** el tope de la ficha (`config.spend_cap_usd`) si es un número > 0; si no, null */
export function capDeLaFicha(config: unknown): number | null {
  const v = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>).spend_cap_usd : undefined
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** umbral de alarma diario · INFORMATIVO (la alarma real es el flujo «Cost Alerts Cron» de n8n) */
export const DAILY_ALERT_USD = 10.0

export interface RunCapInput {
  /** fuerza la bandera · pisa el entorno (las pruebas lo usan) */
  readonly enforce?: boolean
  /** el techo de ESTE cliente (de su ficha) · sin él rige `resolveRunCapUsd()` */
  readonly cap_usd?: number
  /** lo gastado hasta ahora en la corrida (USD) */
  readonly spent_usd: number
}

export type RunCapResult =
  | { readonly verdict: 'pass'; readonly reason: 'flag_off' | 'under_cap' }
  | {
      readonly verdict: 'block'
      readonly reason: 'over_cap'
      readonly cap_usd: number
      readonly spent_usd: number
    }

/** ¿el tope bloquea en este proceso? Apagado por omisión hasta que Emilio lo active. */
export function isRunCapEnforced(input: { enforce?: boolean } = {}): boolean {
  if (input.enforce !== undefined) return input.enforce
  return process.env.SALA_RUN_CAP_ENFORCE === 'true'
}

/** evalúa el tope de una corrida · `block` se traduce en una decisión de presupuesto agotado, `pass` sigue */
export function evaluateRunCap(input: RunCapInput): RunCapResult {
  if (!isRunCapEnforced({ enforce: input.enforce })) return { verdict: 'pass', reason: 'flag_off' }
  const cap = input.cap_usd ?? resolveRunCapUsd()
  if (input.spent_usd >= cap) return { verdict: 'block', reason: 'over_cap', cap_usd: cap, spent_usd: input.spent_usd }
  return { verdict: 'pass', reason: 'under_cap' }
}

/** foto de la configuración del tope · para el panel y la auditoría */
export function getRunCapSnapshot() {
  return {
    cap_usd: resolveRunCapUsd(),
    cap_usd_default: RUN_CAP_DEFAULT_USD,
    cap_env_var: 'SALA_RUN_CAP_USD',
    cap_por_cliente: 'clients.config.spend_cap_usd',
    daily_alert_usd: DAILY_ALERT_USD,
    enforced: isRunCapEnforced(),
    enforce_env_var: 'SALA_RUN_CAP_ENFORCE',
  }
}
