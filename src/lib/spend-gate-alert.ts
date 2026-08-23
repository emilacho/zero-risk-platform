/**
 * §150 · aviso cuando el FRENO DE GASTO se degrada.
 *
 * Agujero C del plan del 15-ago (`raw/tasks/2026-08-15-LENOVO-arreglo-agujeros-freno-de-gasto.md`):
 * los dos frenos fallan ABIERTOS y **en silencio** (`if (error) return 0` en el del
 * router · `query_error` → not-blocked en el genérico).
 *
 * La política NO cambia y eso es deliberado: una caída de base no debe frenar la
 * agencia. **Lo que se arregla es el silencio.** *Un freno que se rinde en silencio
 * no es un freno, es un adorno.*
 *
 * Tres reglas de diseño, en orden de importancia:
 *   (1) **El aviso NUNCA puede romper la corrida.** Todo va envuelto; si el canal
 *       falla, se ignora. Un aviso que tumba el tráfico es peor que el silencio.
 *   (2) **Anti-inundación.** Un aviso por causa cada `ALERT_MIN_INTERVAL_MS`. Si la
 *       base se cae, no queremos 400 mensajes.
 *   (3) **Se mantiene el fallo abierto.** Este módulo sólo notifica · jamás decide
 *       si se bloquea.
 *
 * Reusa el mismo canal que el monitor de costos (`SLACK_WEBHOOK_URL_EQUIPO`) pero
 * NO su payload: `dispatchCostMonitorAlert` está modelado para brechas de umbral
 * (breaches[] · agregados 24h/1h) y forzar estos eventos ahí falsearía esos campos.
 */

/** Causas por las que el freno se degrada o deja pasar algo que merece mirada. */
export type SpendGateAlertKind =
  /** La consulta del tope falló · el freno dejó pasar sin poder medir. */
  | 'query_error'
  /** K fallos SEGUIDOS · ya no es una caída, es una rotura · el freno deja de dejar pasar. */
  | 'query_error_streak'
  /** Una invocación de agente REAL corrió sin `client_id` (cubo `system`). */
  | 'system_bucket_agent'
  /** El cubo `system` alcanzó su techo. */
  | 'system_bucket_over_cap'
  /** No se pudo resolver el vínculo canónico · el gasto puede estar contándose partido. */
  | 'canonical_lookup_degraded'

export interface SpendGateAlertInput {
  readonly kind: SpendGateAlertKind
  /** Texto corto y en admin-language · lo que se lee en el canal. */
  readonly detail: string
  readonly client_id?: string | null
  readonly agent_slug?: string | null
  readonly spent_usd?: number
  readonly cap_usd?: number
  /** Inyectables para prueba · nunca se pasan en producción. */
  readonly fetchImpl?: typeof fetch
  readonly webhookUrl?: string
  readonly nowMs?: number
}

export interface SpendGateAlertResult {
  readonly dispatched: boolean
  readonly reason?: 'no_webhook' | 'throttled' | 'webhook_error' | 'threw'
}

/** Una alerta por causa cada 5 minutos · evita la inundación si la base se cae. */
export const ALERT_MIN_INTERVAL_MS = 5 * 60 * 1000

const KIND_LABELS: Record<SpendGateAlertKind, string> = {
  query_error: 'El freno de gasto no pudo medir · dejó pasar',
  query_error_streak: 'FALLO SOSTENIDO del freno · deja de dejar pasar (fallo abierto acotado)',
  system_bucket_agent: 'Corrida paga SIN cliente · cubo system',
  system_bucket_over_cap: 'El cubo system alcanzó su techo',
  canonical_lookup_degraded: 'No se pudo resolver la ficha canónica · el gasto puede contarse partido',
}

/**
 * Memoria en proceso del último aviso por causa. En serverless cada instancia
 * tiene la suya · eso ACOTA la inundación sin garantizar exactamente-uno, que es
 * el compromiso correcto: preferimos un duplicado ocasional a 400 mensajes.
 */
const lastSentMs = new Map<SpendGateAlertKind, number>()

/** Sólo para pruebas · limpia la memoria anti-inundación. */
export function resetSpendGateAlertThrottle(): void {
  lastSentMs.clear()
}

export function buildSpendGateAlertText(input: SpendGateAlertInput): string {
  const label = KIND_LABELS[input.kind] ?? input.kind
  const parts = [`:warning: *§150 freno de gasto* · ${label}`, input.detail]
  const meta: string[] = []
  if (input.client_id) meta.push(`cliente \`${String(input.client_id).slice(0, 8)}\``)
  if (input.agent_slug) meta.push(`empleado \`${input.agent_slug}\``)
  if (typeof input.spent_usd === 'number') meta.push(`gastado $${input.spent_usd.toFixed(4)}`)
  if (typeof input.cap_usd === 'number') meta.push(`techo $${input.cap_usd.toFixed(2)}`)
  meta.push(`causa \`${input.kind}\``)
  parts.push(meta.join(' · '))
  return parts.join('\n')
}

/**
 * Notifica una degradación del freno. **Nunca lanza.** El llamador puede ignorar
 * el resultado por completo · está tipado sólo para que las pruebas puedan verlo.
 */
export async function notifySpendGateDegradation(
  input: SpendGateAlertInput,
): Promise<SpendGateAlertResult> {
  try {
    const now = input.nowMs ?? Date.now()
    const last = lastSentMs.get(input.kind)
    if (last !== undefined && now - last < ALERT_MIN_INTERVAL_MS) {
      return { dispatched: false, reason: 'throttled' }
    }

    const webhookUrl = input.webhookUrl ?? process.env.SLACK_WEBHOOK_URL_EQUIPO
    if (!webhookUrl) return { dispatched: false, reason: 'no_webhook' }

    // Se marca ANTES de enviar · si el envío falla igual respetamos la ventana,
    // porque el modo de falla que importa es la inundación, no el aviso perdido.
    lastSentMs.set(input.kind, now)

    const fetchImpl = input.fetchImpl ?? fetch
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: buildSpendGateAlertText(input) }),
    })
    if (!res || !res.ok) return { dispatched: false, reason: 'webhook_error' }
    return { dispatched: true }
  } catch {
    // Regla (1) · el aviso jamás rompe la corrida.
    return { dispatched: false, reason: 'threw' }
  }
}
