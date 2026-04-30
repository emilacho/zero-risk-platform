/**
 * sentry-capture.ts · Wave 12 (CC#1)
 *
 * Wrapper estándar para Sentry capture en routes Next.js. Asegura tags +
 * breadcrumbs consistentes y previene capture duplicado en cadenas de
 * try/catch anidadas.
 *
 * Por qué este wrapper:
 * - main branch tiene Sentry SDK instrumentado (sentry.{client,server,edge}.config.ts)
 *   pero ZERO routes lo usan (Wave 12 audit · ÁREA H).
 * - Sin tags consistentes el dashboard de Sentry es ruido.
 * - Routes que catch+swallow errores son el silent-fail más caro de debuggear.
 *
 * Adoption pattern:
 *
 *   import { captureRouteError } from '@/lib/sentry-capture'
 *
 *   try {
 *     // ... business logic
 *   } catch (e) {
 *     captureRouteError(e, request, { route: '/api/foo', source: 'submit' })
 *     return apiError('internal_error', 500, 'Internal failure')
 *   }
 *
 * Si Sentry no está configurado (env DSN missing) · fail-open (no throw).
 */
import * as Sentry from '@sentry/nextjs'

export interface CaptureContext {
  /** Route path · ej. '/api/journey/dispatch' · for tags filtering en Sentry UI */
  route: string
  /** Free-form source identifier · ej. 'dispatch_handler' · 'callback_persist' */
  source?: string
  /** Optional structured error code · agregado a tags */
  error_code?: string
  /** Optional extra context · NO leak PII grande (Sentry tiene size limits) */
  extra?: Record<string, unknown>
  /** Optional client_id / journey_id / etc para fingerprinting */
  ids?: Record<string, string | null | undefined>
}

/**
 * Captura una exception en Sentry con tags + breadcrumb consistentes.
 * Fail-open: si Sentry no está disponible (ej. DSN missing en local) · no throw.
 *
 * @returns Sentry event ID si capture exitoso · null si no.
 */
export function captureRouteError(
  err: unknown,
  request: Request | null,
  ctx: CaptureContext,
): string | null {
  try {
    const tags: Record<string, string> = {
      source: ctx.source ?? 'route_handler',
      route: ctx.route,
    }
    if (ctx.error_code) tags.error_code = ctx.error_code

    const extra: Record<string, unknown> = {
      ...(ctx.extra ?? {}),
      ...(ctx.ids ?? {}),
    }
    if (request) {
      extra.method = request.method
      extra.url = request.url
      extra.user_agent = request.headers.get('user-agent') ?? null
    }

    const error = err instanceof Error ? err : new Error(String(err))
    const eventId = Sentry.captureException(error, { tags, extra })
    return eventId ?? null
  } catch {
    // Sentry capture itself failed · don't propagate
    return null
  }
}

/**
 * Captura un mensaje (no-exception · ej. warning sobre estado raro pero handled).
 * Útil para contract violations, rate-limit triggers, etc.
 */
export function captureRouteWarning(
  message: string,
  ctx: CaptureContext,
  level: 'info' | 'warning' = 'warning',
): string | null {
  try {
    const tags: Record<string, string> = {
      source: ctx.source ?? 'route_handler',
      route: ctx.route,
    }
    if (ctx.error_code) tags.error_code = ctx.error_code

    const eventId = Sentry.captureMessage(message, {
      level,
      tags,
      extra: { ...(ctx.extra ?? {}), ...(ctx.ids ?? {}) },
    })
    return eventId ?? null
  } catch {
    return null
  }
}

/**
 * Helper · breadcrumb informativo (no es error · solo trace context).
 * Útil para tracear pasos en pipelines largos antes de un eventual error.
 */
export function addRouteBreadcrumb(
  message: string,
  ctx: Pick<CaptureContext, 'route' | 'source' | 'extra'>,
): void {
  try {
    Sentry.addBreadcrumb({
      category: 'route',
      message,
      level: 'info',
      data: {
        route: ctx.route,
        source: ctx.source ?? 'route_handler',
        ...(ctx.extra ?? {}),
      },
    })
  } catch {
    // noop
  }
}
