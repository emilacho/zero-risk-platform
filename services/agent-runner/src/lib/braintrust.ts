import { initLogger, wrapClaudeAgentSDK, type Logger } from 'braintrust'

/**
 * Braintrust · LLM eval + observability para el agent-runner (Railway).
 *
 * El runner es el servicio que EJECUTA el Claude Agent SDK · acá viven los
 * spans reales de cada `query()`. Init en `instrument.ts` (junto a Sentry ·
 * ANTES de cualquier request) · gateado por BRAINTRUST_API_KEY · fail-open ·
 * una falla de tracing NUNCA debe romper una invocación.
 *
 * IMPORTANTE · `BRAINTRUST_API_KEY` debe estar en el env de RAILWAY (no
 * Vercel) · el runner corre en Railway. Sin la key todo hace no-op (cero
 * overhead · cero llamadas de red).
 *
 * Región · EU (`api-eu.braintrust.dev` · `BRAINTRUST_API_URL` env-overridable).
 *
 * §148 honesto · el SDK pide `orgName` (string nombre), NO un org-id. Con una
 * API key scoped a un solo org `orgName` es innecesario, así que el org-id se
 * exporta como constante de referencia pero NO se pasa a `initLogger`.
 */

/** Org id · workspace Zero Risk Braintrust (EU). Referencia · NO es orgName. */
export const BRAINTRUST_ORG_ID = '681199c4-0884-4691-bd62-4e31e88e5835'

/** Project id · env-overridable. */
export const BRAINTRUST_PROJECT_ID =
  process.env.BRAINTRUST_PROJECT_ID ?? '9a1f2db0-41d0-444d-97ce-665c29cbf174'

/** Endpoint región EU · §144 env-overridable. */
const BRAINTRUST_APP_URL =
  process.env.BRAINTRUST_API_URL ?? 'https://api-eu.braintrust.dev'

let _logger: Logger<true> | null = null
let _initialized = false

/**
 * Init idempotente · llamar una vez al boot (`instrument.ts`). Devuelve el
 * logger o `null` si no hay key (no-op). Fail-open · nunca lanza.
 */
export function initBraintrust(): Logger<true> | null {
  if (_initialized) return _logger
  _initialized = true
  if (!process.env.BRAINTRUST_API_KEY) return null
  try {
    _logger = initLogger({
      apiKey: process.env.BRAINTRUST_API_KEY,
      projectId: BRAINTRUST_PROJECT_ID,
      appUrl: BRAINTRUST_APP_URL,
    })
  } catch {
    _logger = null
  }
  return _logger
}

/** true si el tracing está activo (key presente + init OK). */
export function isBraintrustEnabled(): boolean {
  return _logger !== null
}

/**
 * Envuelve el módulo del Claude Agent SDK para trazar cada `query()`. El
 * wrapper de Braintrust devuelve un Proxy (no muta el módulo · seguro sobre
 * el namespace ESM congelado). Si no hay key, devuelve el SDK sin tocar
 * (pass-through · cero overhead). Gatea por presencia de key · NO por estado
 * de init, porque el span lee el logger actual perezosamente al llamar (en
 * tiempo de request el init ya corrió). Fail-open.
 */
export function instrumentClaudeAgentSdk<T extends object>(sdk: T): T {
  if (!process.env.BRAINTRUST_API_KEY) return sdk
  try {
    return wrapClaudeAgentSDK(sdk)
  } catch {
    return sdk
  }
}

/**
 * Flush · llamar tras completar cada request (el server es long-lived ·
 * asyncFlush batchea en background · este flush asegura entrega oportuna).
 * Fail-open.
 */
export async function flushBraintrust(): Promise<void> {
  try {
    if (_logger) await _logger.flush()
  } catch {
    // fail-open · una falla de flush no debe romper el request
  }
}
