import { initLogger, type Logger } from 'braintrust'

/**
 * Braintrust client · LLM eval + observability (EU data region).
 *
 * Lazy singleton · env-gated · fail-open (mismo idioma que `posthog.ts`).
 * El logger sólo se inicializa cuando `BRAINTRUST_API_KEY` está presente;
 * si falta, `getBraintrustLogger()` devuelve `null` y los callers hacen
 * no-op. Una falla de Braintrust NUNCA debe romper un request.
 *
 * Región · EU (`api-eu.braintrust.dev`). El endpoint es env-overridable
 * (`BRAINTRUST_API_URL`) para rollback sin redeploy (patrón §144).
 *
 * §148 honesto · el SDK pide `orgName` (string nombre), NO un org-id. Con
 * una API key scoped a un solo org el `orgName` es innecesario, así que
 * `BRAINTRUST_ORG_ID` se exporta como constante de referencia (permalinks
 * · metadata) pero NO se pasa a `initLogger` (pasarlo como `orgName`
 * rompería el login). El project sí se pasa como `projectId`.
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

/**
 * Devuelve el logger singleton · `null` si no hay `BRAINTRUST_API_KEY`.
 * Los callers deben tratar `null` como "tracing deshabilitado" y seguir.
 */
export function getBraintrustLogger(): Logger<true> | null {
  if (!process.env.BRAINTRUST_API_KEY) return null
  if (_logger) return _logger
  _logger = initLogger({
    apiKey: process.env.BRAINTRUST_API_KEY,
    projectId: BRAINTRUST_PROJECT_ID,
    appUrl: BRAINTRUST_APP_URL,
  })
  return _logger
}

/**
 * Flush explícito · llamar en `finally` de paths serverless (Vercel) antes
 * de que el proceso se congele tras la respuesta. Fail-open.
 */
export async function flushBraintrust(): Promise<void> {
  try {
    if (_logger) await _logger.flush()
  } catch {
    // fail-open · una falla de flush no debe romper el request
  }
}
