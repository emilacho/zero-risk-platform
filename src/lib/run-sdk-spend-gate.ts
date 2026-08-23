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
 * ── Arreglo de los tres agujeros · plan 2026-08-15 · firmado por Emilio 2026-08-23 ──
 *
 * **C · el freno se rendía en silencio.** Un fallo de consulta seguía dejando pasar
 * (eso NO cambia · una caída de base no debe frenar la agencia) pero ahora AVISA.
 * *Un freno que se rinde en silencio no es un freno, es un adorno.*
 *
 * **A · sin `client_id` no había techo.** Un `client_id` nulo es legítimo para
 * llamadas de sistema, así que bloquear a secas rompía eso. Ahora cae en un cubo
 * `system` con techo propio (`RUN_SPEND_CAP_SYSTEM_USD` · $2 por default) y AVISA.
 * El techo se dimensionó con el dato: el peor día sin cliente de toda la historia
 * fue $0,6147 (CC#3 2026-08-22) · $2 deja tres veces ese pico.
 * Toda invocación que llega hasta acá ya pasó el enforcement de `workflow_id`
 * (`run-sdk/route.ts`), o sea que ES una corrida de agente real dentro de un
 * workflow · por eso el aviso no necesita consultar el registro de empleados.
 *
 * **B1 · el techo acumulaba por `client_id`, que se duplica.** Ahora suma por la
 * FAMILIA canónica: `canonical_client_id` declarado. El caso vivo es Peniche, con
 * dos fichas (`e388a370` real + `53b05ecb` fantasma) cuyo gasto se contaba partido
 * ($18,65 y $5,37 · ninguna llegaba al techo). Una clave DERIVADA (slug/dominio) NO
 * sirve y está medido: las dos fichas no comparten slug, ni nombre, ni dominio
 * (vacío en toda la base), ni sitio (nulo en una) — la información no está en la
 * fila, por eso el vínculo se DECLARA.
 *
 * §148 safety-net · un fallo de query NUNCA bloquea tráfico legítimo (devuelve
 * not-blocked) · el cap es un backstop, no un punto único de falla. Lo que cambió
 * es que ahora se entera alguien.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifySpendGateDegradation } from './spend-gate-alert'

const WINDOW_MS = 24 * 60 * 60 * 1000

/** Techo run-scoped genérico por default · $8 (encima de ~$2-3 esperado · debajo del
 *  $25 canon). TUNABLE por env `RUN_SPEND_CAP_USD`. */
export const DEFAULT_RUN_SPEND_CAP_USD = 8.0

/** Techo del cubo `system` (corridas sin `client_id`) · firmado por Emilio 2026-08-23.
 *  TUNABLE por env `RUN_SPEND_CAP_SYSTEM_USD`. */
export const DEFAULT_SYSTEM_SPEND_CAP_USD = 2.0

export interface SpendGateResult {
  readonly blocked: boolean
  readonly reason:
    | 'disabled'
    | 'no_client'
    | 'under_cap'
    | 'over_cap'
    | 'query_error'
    /** Corrida sin `client_id` · medida contra el techo del cubo `system`. */
    | 'system_under_cap'
    | 'system_over_cap'
  readonly cap_usd?: number
  readonly spent_usd?: number
  /** Ficha canónica contra la que se acumuló (B1) · útil para forense. */
  readonly canonical_client_id?: string | null
  /** Cuántas fichas entraron en la suma · >1 significa que había duplicación. */
  readonly family_size?: number
}

export interface SpendGateOptions {
  readonly nowMs?: number
  /** Empleado de la corrida · sólo para que el aviso diga quién fue. */
  readonly agentSlug?: string | null
  /** Inyectable para prueba · en producción se usa el real. */
  readonly notify?: typeof notifySpendGateDegradation
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

/** Techo del cubo `system` · env `RUN_SPEND_CAP_SYSTEM_USD` > default $2. */
export function resolveSystemSpendCapUsd(): number {
  const n = Number(process.env.RUN_SPEND_CAP_SYSTEM_USD)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SYSTEM_SPEND_CAP_USD
}

function sumCost(rows: unknown[] | null | undefined): number {
  return (rows ?? []).reduce<number>((acc, r) => {
    const v = (r as { cost_usd?: number | string | null }).cost_usd
    const n = typeof v === 'string' ? Number(v) : (v ?? 0)
    return acc + (Number.isFinite(n) ? Number(n) : 0)
  }, 0)
}

/**
 * B1 · resuelve la FAMILIA de fichas que representan al mismo negocio.
 *
 * Devuelve el id canónico y todos los ids que apuntan a él. Si la columna
 * `canonical_client_id` todavía no existe en la base (migración sin aplicar), la
 * consulta falla y se degrada al id suelto **avisando** — la lección de H1.2:
 * el código no puede romperse por una migración que aún no llegó.
 */
export async function resolveClientFamily(
  supabase: SupabaseClient,
  clientId: string,
  notify: typeof notifySpendGateDegradation,
): Promise<{ canonical: string; family: string[]; degraded: boolean }> {
  const solo = { canonical: clientId, family: [clientId], degraded: true }
  try {
    const { data: own, error: ownErr } = await supabase
      .from('clients')
      .select('canonical_client_id')
      .eq('id', clientId)
      .maybeSingle()
    if (ownErr) {
      void notify({
        kind: 'canonical_lookup_degraded',
        detail: 'No se pudo leer la ficha canónica · el gasto se cuenta sólo por esta ficha.',
        client_id: clientId,
      })
      return solo
    }
    const canonical =
      (own as { canonical_client_id?: string | null } | null)?.canonical_client_id || clientId

    const { data: kin, error: kinErr } = await supabase
      .from('clients')
      .select('id')
      .or(`id.eq.${canonical},canonical_client_id.eq.${canonical}`)
    if (kinErr) {
      void notify({
        kind: 'canonical_lookup_degraded',
        detail: 'No se pudo listar las fichas hermanas · el gasto se cuenta sólo por esta ficha.',
        client_id: clientId,
      })
      return { canonical, family: [clientId], degraded: true }
    }
    const family = Array.from(
      new Set([clientId, canonical, ...((kin ?? []) as { id: string }[]).map((r) => r.id)]),
    )
    return { canonical, family, degraded: false }
  } catch {
    void notify({
      kind: 'canonical_lookup_degraded',
      detail: 'Excepción al resolver la ficha canónica · el gasto se cuenta sólo por esta ficha.',
      client_id: clientId,
    })
    return solo
  }
}

/**
 * Evalúa el freno de gasto §150 GENÉRICO para una invocación de run-sdk.
 *
 * Compatibilidad · el tercer parámetro acepta el `nowMs` histórico (número) o el
 * objeto de opciones nuevo, así los dos llamadores existentes siguen andando.
 */
export async function checkRunSdkSpendCap(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
  optsOrNow: number | SpendGateOptions = {},
): Promise<SpendGateResult> {
  const opts: SpendGateOptions = typeof optsOrNow === 'number' ? { nowMs: optsOrNow } : optsOrNow
  const nowMs = opts.nowMs ?? Date.now()
  const notify = opts.notify ?? notifySpendGateDegradation
  const agentSlug = opts.agentSlug ?? null

  // Kill-switch explícito · default ON (paso c · deja de ser default-OFF).
  if (!isRunSpendCapEnforced()) return { blocked: false, reason: 'disabled' }

  const floor = new Date(nowMs - WINDOW_MS).toISOString()

  // ── A · cubo `system` · corridas sin cliente ──────────────────────────────
  // Toda invocación que llega acá ya pasó el enforcement de `workflow_id`, así
  // que es una corrida de agente real. Se mide, se avisa, y se bloquea sólo si
  // el cubo pasó su propio techo.
  if (!clientId) {
    const cap = resolveSystemSpendCapUsd()
    try {
      const { data, error } = await supabase
        .from('agent_invocations')
        .select('cost_usd')
        .is('client_id', null)
        .gte('started_at', floor)
      if (error) {
        void notify({
          kind: 'query_error',
          detail: 'Falló la consulta del cubo system · la corrida sigue SIN techo medido.',
          agent_slug: agentSlug,
        })
        return { blocked: false, reason: 'query_error' }
      }
      const spent = sumCost(data)

      // El caso que importa · una corrida paga sin cliente. Siempre avisa,
      // bloquee o no: que el caso quede VISIBLE, no bloqueado a ciegas.
      void notify({
        kind: spent >= cap ? 'system_bucket_over_cap' : 'system_bucket_agent',
        detail:
          'Una corrida de empleado entró sin cliente asignado y se midió contra el cubo de sistema.',
        agent_slug: agentSlug,
        spent_usd: spent,
        cap_usd: cap,
      })

      if (spent >= cap) {
        return { blocked: true, reason: 'system_over_cap', cap_usd: cap, spent_usd: spent }
      }
      return { blocked: false, reason: 'system_under_cap', cap_usd: cap, spent_usd: spent }
    } catch {
      void notify({
        kind: 'query_error',
        detail: 'Excepción midiendo el cubo system · la corrida sigue SIN techo medido.',
        agent_slug: agentSlug,
      })
      return { blocked: false, reason: 'query_error' }
    }
  }

  // ── B1 · suma por la FAMILIA canónica, no por el id suelto ────────────────
  try {
    const { canonical, family } = await resolveClientFamily(supabase, String(clientId), notify)

    // Una sola ficha (el caso normal) sigue usando `.eq` · `.in` sólo cuando hay
    // familia declarada. Misma consulta de antes cuando no hay duplicación.
    const base_ = supabase.from('agent_invocations').select('cost_usd')
    const scoped_ =
      family.length > 1 ? base_.in('client_id', family) : base_.eq('client_id', String(clientId))
    const { data, error } = await scoped_.gte('started_at', floor)
    // §148 safety-net · un error de query no debe bloquear tráfico legítimo…
    if (error) {
      // …pero C · ya no en silencio.
      void notify({
        kind: 'query_error',
        detail: 'Falló la consulta del gasto acumulado · la corrida pasa SIN techo medido.',
        client_id: String(clientId),
        agent_slug: agentSlug,
      })
      return { blocked: false, reason: 'query_error' }
    }
    const spent = sumCost(data)

    const cap = resolveRunSpendCapUsd()
    const base = {
      cap_usd: cap,
      spent_usd: spent,
      canonical_client_id: canonical,
      family_size: family.length,
    }
    if (spent >= cap) return { blocked: true, reason: 'over_cap', ...base }
    return { blocked: false, reason: 'under_cap', ...base }
  } catch {
    void notify({
      kind: 'query_error',
      detail: 'Excepción midiendo el gasto acumulado · la corrida pasa SIN techo medido.',
      client_id: String(clientId),
      agent_slug: agentSlug,
    })
    return { blocked: false, reason: 'query_error' }
  }
}
