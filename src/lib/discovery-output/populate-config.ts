/**
 * Canon canonical · Discovery output → clients.config.apify (SPEC 2026-06-05).
 *
 * Populates `clients.config.apify.competitor_list` + `own_handles` from the
 * Discovery output · so APIFY_WIRE consumes DYNAMIC targets discovered by
 * the agent · NOT a manual list (spec problem statement).
 *
 * Merge policy ·
 *   - `competitor_list` → REPLACED on every successful re-discovery (the
 *     agent's view IS the canonical source · stale manual lists overwritten)
 *   - `own_handles` → MERGED preserving existing values · the agent's
 *     handles ONLY fill empty slots (admin-set handles are sticky · §148
 *     honest · we don't overwrite human ground-truth)
 *
 * §148 honest · NEVER throws · single Supabase UPDATE call · writes via
 * `service_role` so RLS is bypassed for the canonical platform write path.
 *
 * Default-OFF via `SALA_DISCOVERY_BRAIN_PUSH_ENABLED` (shared flag with the
 * brain-push module · they ship as one unit per spec).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DiscoveryOutput, DiscoverySocialHandles } from './types'
import { isDiscoveryBrainPushEnabled } from './persist-brain'

export interface PopulateConfigInput {
  readonly supabase: SupabaseClient
  readonly discovery: DiscoveryOutput
  readonly enabled?: boolean
}

export interface PopulateConfigResult {
  readonly client_id: string
  readonly handles_written: number
  readonly competitors_written: number
  readonly merged_handles: DiscoverySocialHandles
  readonly errors: readonly string[]
  /**
   * E121 · qué pasó con `clients.industry` y `clients.market`:
   * 'written' = la ficha estaba vacía/unknown y el descubridor trajo el dato ·
   * 'kept' = la ficha ya tenía un valor (de ventas u otro) y NO se pisa ·
   * 'absent' = el descubridor no lo trajo · 'skipped' = no se intentó (flag off / error de lectura).
   */
  readonly industry_outcome?: 'written' | 'kept' | 'absent' | 'skipped'
  readonly market_outcome?: 'written' | 'kept' | 'absent' | 'skipped'
}

/** E121 · «vacío o unknown» · lo único que se rellena · nunca se pisa lo que puso ventas. */
export function estaVacioOUnknown(v: unknown): boolean {
  if (v === null || v === undefined) return true
  const s = String(v).trim().toLowerCase()
  return s.length === 0 || s === 'unknown' || s === 'null' || s === 'n/a'
}

/**
 * Canon canonical · entry point · idempotent · returns counts for surface.
 */
export async function populateClientConfigFromDiscovery(
  input: PopulateConfigInput,
): Promise<PopulateConfigResult> {
  const empty: PopulateConfigResult = {
    client_id: input.discovery.client_id,
    handles_written: 0,
    competitors_written: 0,
    merged_handles: {},
    errors: [],
  }
  if (!isDiscoveryBrainPushEnabled({ enabled: input.enabled })) {
    return { ...empty, errors: ['flag_off'] }
  }

  // ─── Step 1 · read current config (preserve existing structure) ───
  const { data: row, error: readError } = await input.supabase
    .from('clients')
    .select('config, industry, market')
    .eq('id', input.discovery.client_id)
    .maybeSingle()
  if (readError) {
    return { ...empty, errors: [`read_error: ${readError.message}`] }
  }
  if (!row) {
    return { ...empty, errors: ['client_not_found'] }
  }
  const currentConfig =
    row.config && typeof row.config === 'object' && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {}
  const currentApify =
    currentConfig.apify &&
    typeof currentConfig.apify === 'object' &&
    !Array.isArray(currentConfig.apify)
      ? (currentConfig.apify as Record<string, unknown>)
      : {}

  // ─── Step 2 · merge handles (sticky · agent fills empty slots only) ───
  const currentHandles: Record<string, string> =
    currentApify.own_handles &&
    typeof currentApify.own_handles === 'object' &&
    !Array.isArray(currentApify.own_handles)
      ? Object.fromEntries(
          Object.entries(currentApify.own_handles as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {}
  let handlesWritten = 0
  const mergedHandles: Record<string, string> = { ...currentHandles }
  for (const [k, v] of Object.entries(input.discovery.own_handles)) {
    if (typeof v !== 'string' || v.trim().length === 0) continue
    if (!mergedHandles[k] || mergedHandles[k].trim().length === 0) {
      mergedHandles[k] = v.trim()
      handlesWritten++
    }
  }

  // ─── Step 3 · build competitor_list · REPLACED (agent is canon) ───
  const competitorList = input.discovery.competitors.map((c) => ({
    name: c.name,
    ...(c.website ? { website: c.website } : {}),
    ...(c.handles && Object.keys(c.handles).length > 0 ? { handles: c.handles } : {}),
    ...(c.competitor_type ? { competitor_type: c.competitor_type } : {}),
  }))

  // ─── Step 4 · single UPDATE · merge into config.apify ───
  const nextApify = {
    ...currentApify,
    own_handles: mergedHandles,
    competitor_list: competitorList,
    last_populated_from_discovery_at: new Date().toISOString(),
    last_populated_source: 'auto_discovery_agent',
  }
  // ─── Step 4b · business_model · E36 (CC#2 2026-09-15) ───
  // Vive al lado de `apify`, NO adentro: no es un objetivo de raspado, es qué
  // ES el negocio. Sin migración · `config` es texto libre estructurado y este
  // UPDATE ya preserva lo que había.
  // 🔴 `clients.industry` NO se toca (hoy dice "turismo europeo") · es una
  // categoría, no un modelo, y pisarla borraría un dato de otra procedencia.
  // Si el empleado NO contesta, la respuesta anterior NO se borra: un silencio
  // no puede desmentir a una respuesta.
  const businessModel =
    typeof input.discovery.business_model === 'string' &&
    input.discovery.business_model.trim().length > 0
      ? {
          business_model: {
            text: input.discovery.business_model.trim(),
            source: 'auto_discovery_agent',
            captured_at: new Date().toISOString(),
          },
        }
      : {}

  const nextConfig = { ...currentConfig, apify: nextApify, ...businessModel }

  // ─── Step 4c · industry · market · E121 (CC#1 2026-09-24) ───
  // Lo que el sistema descubre se guarda: `client_industry` → `clients.industry` y
  // `client_markets` → `clients.market` (texto · «Guayaquil · Olón, Santa Elena»), pero
  // SÓLO si la ficha los tiene vacíos o `unknown`. Lo que puso ventas nunca se pisa
  // (la nota de E36 de arriba sigue valiendo: no es un modelo, es una categoría, y no
  // se sobreescribe). Va en el MISMO UPDATE que el config: una escritura, un recibo.
  const industryDiscovered =
    typeof input.discovery.client_industry === 'string' && input.discovery.client_industry.trim().length > 0
      ? input.discovery.client_industry.trim()
      : null
  const marketsDiscovered =
    Array.isArray(input.discovery.client_markets) && input.discovery.client_markets.length > 0
      ? input.discovery.client_markets.map((m) => String(m).trim()).filter((m) => m.length > 0).join(' · ')
      : null
  const industry_outcome: PopulateConfigResult['industry_outcome'] = !industryDiscovered
    ? 'absent'
    : estaVacioOUnknown(row.industry)
      ? 'written'
      : 'kept'
  const market_outcome: PopulateConfigResult['market_outcome'] = !marketsDiscovered
    ? 'absent'
    : estaVacioOUnknown(row.market)
      ? 'written'
      : 'kept'
  const extras: Record<string, unknown> = {
    ...(industry_outcome === 'written' ? { industry: industryDiscovered } : {}),
    ...(market_outcome === 'written' ? { market: marketsDiscovered } : {}),
  }

  const { error: writeError } = await input.supabase
    .from('clients')
    .update({ config: nextConfig, ...extras, updated_at: new Date().toISOString() })
    .eq('id', input.discovery.client_id)
  if (writeError) {
    return {
      ...empty,
      merged_handles: mergedHandles as DiscoverySocialHandles,
      errors: [`write_error: ${writeError.message}`],
    }
  }

  return {
    client_id: input.discovery.client_id,
    handles_written: handlesWritten,
    competitors_written: competitorList.length,
    merged_handles: mergedHandles as DiscoverySocialHandles,
    errors: [],
    industry_outcome,
    market_outcome,
  }
}
