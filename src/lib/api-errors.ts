/**
 * api-errors.ts · Wave 12 (CC#1)
 *
 * Standard envelope para responses de error en routes Next.js. Reduce drift
 * entre handlers y permite que el client (Mission Control · n8n · external)
 * dependa de un shape consistente.
 *
 * Adoption pattern · drop-in replacement de NextResponse.json para errores:
 *
 *   import { apiError, ApiErrorCode } from '@/lib/api-errors'
 *
 *   if (!body.foo) return apiError('validation_error', 400, "Missing 'foo'")
 *   if (!auth.ok) return apiError('unauthorized', 401, auth.reason)
 *   if (!exists)  return apiError('not_found', 404, `Resource ${id} not found`)
 *
 * Migración gradual · routes legacy con `NextResponse.json({error: '...'})`
 * pueden coexistir · este helper sólo standardiza nuevos handlers + migrations.
 */
import { NextResponse } from 'next/server'

/**
 * Códigos canónicos · alineados con HTTP semantics.
 * Si necesitás un código nuevo, agregalo acá primero (no inventes ad-hoc en el route).
 */
export type ApiErrorCode =
  | 'validation_error'      // 400 · body shape inválido
  | 'unauthorized'           // 401 · auth missing/invalid
  | 'forbidden'              // 403 · auth OK pero sin permission
  | 'not_found'              // 404 · resource no existe
  | 'method_not_allowed'     // 405
  | 'conflict'               // 409 · estado conflicto (ej: duplicate journey)
  | 'gone'                   // 410 · resource expiró (ej: TTL expired)
  | 'unprocessable'          // 422 · semantic invalid (ej: contract violation)
  | 'rate_limited'           // 429
  | 'internal_error'         // 500 · catch-all server-side
  | 'service_unavailable'    // 503 · DB down · migration missing · etc

export interface ApiErrorBody {
  error: ApiErrorCode
  detail?: string
  /** Optional structured error code (ej. 'E-WF-003-REQUIRED' · 'E-PERSIST-001') */
  error_code?: string
  /** Optional hint para el caller (ej. "Provide one of: foo, bar") */
  hint?: string
  /** Optional context object · evitar dump de datos sensibles */
  context?: Record<string, unknown>
}

/**
 * Crea NextResponse con shape canónico { error, detail?, error_code?, hint?, context? }.
 * Status code obligatorio (no asume default · cada route declara explícitamente).
 *
 * @example
 *   return apiError('validation_error', 400, "Missing 'journey' field")
 *   return apiError('not_found', 404, `Client ${id} does not exist`)
 *   return apiError('unprocessable', 422, 'Schema violation', { error_code: 'E-WF-003-REQUIRED' })
 */
export function apiError(
  code: ApiErrorCode,
  status: number,
  detail?: string,
  extras?: { error_code?: string; hint?: string; context?: Record<string, unknown> },
): NextResponse {
  const body: ApiErrorBody = { error: code }
  if (detail) body.detail = detail.slice(0, 500) // safety cap · no leak large payloads
  if (extras?.error_code) body.error_code = extras.error_code
  if (extras?.hint) body.hint = extras.hint
  if (extras?.context) body.context = extras.context
  return NextResponse.json(body, { status })
}

/**
 * Shortcut helpers · evitan repetir status codes en el call-site.
 */
export const apiErrors = {
  validation: (detail: string, hint?: string) =>
    apiError('validation_error', 400, detail, hint ? { hint } : undefined),
  unauthorized: (detail: string) => apiError('unauthorized', 401, detail),
  forbidden: (detail: string) => apiError('forbidden', 403, detail),
  notFound: (detail: string) => apiError('not_found', 404, detail),
  conflict: (detail: string, context?: Record<string, unknown>) =>
    apiError('conflict', 409, detail, context ? { context } : undefined),
  gone: (detail: string) => apiError('gone', 410, detail),
  unprocessable: (detail: string, error_code?: string) =>
    apiError('unprocessable', 422, detail, error_code ? { error_code } : undefined),
  rateLimited: (detail: string) => apiError('rate_limited', 429, detail),
  internal: (detail: string) => apiError('internal_error', 500, detail),
  serviceUnavailable: (detail: string) => apiError('service_unavailable', 503, detail),
}
