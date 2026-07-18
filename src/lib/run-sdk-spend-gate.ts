/**
 * §150 spend gate · freno de gasto GENÉRICO en el hot path de agentes.
 *
 * Diagnóstico (CC#3 2026-06-30 · P0): el cap §150 sólo existía en el dispatch del
 * sala-router-consumer (`dispatch.ts`) y como alertas Slack. `/api/agents/run-sdk`
 * — el path por el que fluye TODA invocación de agente — no tenía freno.
 *
 * Re-plan del go-live · paso (c) · ruling consejero 2026-07-18 13:41 ─────────────
 * El freno anterior era un AGUJERO LATENTE para todo cliente futuro: estaba
 * (a) default-OFF (shadow) y (b) tenant-scoped SÓLO a Náufrago (`NAUFRAGO_TENANT_IDS`),
 * así que Peniche / cualquier `other_tenant` corría SIN red automática. "Un humano
 * mirando NO es un freno" (el incidente de $19 pasó exactamente por eso). Este módulo
 * lo vuelve GENÉRICO:
 *   (1) el cap aplica por el cliente/tenant DE LA CORRIDA · SIN UUIDs hardcodeados.
 *   (2) enforce ON por default (deja de ser default-OFF · sólo se apaga con un
 *       kill-switch explícito `RUN_SPEND_CAP_ENFORCE=false`).
 *   (3) techo run-scoped ~$8 (encima de los ~$2-3 esperados · debajo del $25 canon)
 *       → frena TEMPRANO. Configurable por env `RUN_SPEND_CAP_USD`.
 * El watch manual en vivo queda como SEGUNDA capa, nunca la única.
 *
 * Relación con el hard-stop Náufrago ($25 §144): son capas distintas. El $25
 * tenant-específico sigue vivo en el path del sala-router (`evaluateNaufragoRunCap`).
 * Este freno genérico $8 es MÁS estricto y universal → dispara antes, para todos.
 *
 * "Run-scoped" en la práctica: `agent_invocations.journey_id` no se puebla de forma
 * confiable (PR #216), así que el gasto computable es SUM(cost_usd) del client_id de
 * la corrida en una ventana wall-clock de 24h. Para un cliente nuevo (Peniche) en una
 * ventana quieta esto ≈ el costo de la corrida · el techo $8 es el freno temprano.
 *
 * §148 safety-net · un fallo de query NUNCA bloquea tráfico legítimo (devuelve
 * not-blocked) · el cap es un backstop, no un punto único de falla.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const WINDOW_MS = 24 * 60 * 60 * 1000

/** Techo run-scoped genérico por default · $8 (encima de ~$2-3 esperado · debajo del
 *  $25 canon). TUNABLE por env `RUN_SPEND_CAP_USD`. */
export const DEFAULT_RUN_SPEND_CAP_USD = 8.0

export interface SpendGateResult {
  readonly blocked: boolean
  readonly reason: 'disabled' | 'no_client' | 'under_cap' | 'over_cap' | 'query_error'
  readonly cap_usd?: number
  readonly spent_usd?: number
}

/**
 * enforce ON por default (ruling consejero 18-jul · paso c). El freno automático es
 * la PRIMERA capa · sólo se desactiva con un kill-switch EXPLÍCITO
 * `RUN_SPEND_CAP_ENFORCE` en 'false' / '0' / 'off'. Un env ausente = ON.
 */
export function isRunSpendCapEnforced(): boolean {
  const raw = (process.env.RUN_SPEND_CAP_ENFORCE ?? '').trim().toLowerCase()
  return !(raw === 'false' || raw === '0' || raw === 'off' || raw === 'no')
}

/** Resuelve el techo · env `RUN_SPEND_CAP_USD` (número positivo) > default $8. */
export function resolveRunSpendCapUsd(): number {
  const n = Number(process.env.RUN_SPEND_CAP_USD)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RUN_SPEND_CAP_USD
}

/**
 * Evalúa el freno de gasto §150 GENÉRICO para una invocación de run-sdk. Devuelve
 * `{ blocked: true }` cuando el enforce está vivo (default ON) Y el gasto acumulado
 * del cliente de la corrida (ventana 24h) alcanza el techo. Aplica a CUALQUIER
 * client_id · sin tenants hardcodeados.
 */
export async function checkRunSdkSpendCap(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<SpendGateResult> {
  // Kill-switch explícito · default ON (paso c · deja de ser default-OFF).
  if (!isRunSpendCapEnforced()) return { blocked: false, reason: 'disabled' }
  if (!clientId) return { blocked: false, reason: 'no_client' }

  try {
    const floor = new Date(nowMs - WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('agent_invocations')
      .select('cost_usd')
      .eq('client_id', String(clientId))
      .gte('started_at', floor)
    // §148 safety-net · un error de query no debe bloquear tráfico legítimo.
    if (error) return { blocked: false, reason: 'query_error' }
    const spent = (data ?? []).reduce((acc, r) => {
      const v = (r as { cost_usd?: number | string | null }).cost_usd
      const n = typeof v === 'string' ? Number(v) : (v ?? 0)
      return acc + (Number.isFinite(n) ? Number(n) : 0)
    }, 0)

    const cap = resolveRunSpendCapUsd()
    if (spent >= cap) {
      return { blocked: true, reason: 'over_cap', cap_usd: cap, spent_usd: spent }
    }
    return { blocked: false, reason: 'under_cap', cap_usd: cap, spent_usd: spent }
  } catch {
    return { blocked: false, reason: 'query_error' }
  }
}
