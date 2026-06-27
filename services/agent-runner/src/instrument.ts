/**
 * Sentry instrumentation · Sprint Monitoreo §144 · CC#1 2026-06-27
 *
 * Imported as the VERY FIRST line of index.ts so Sentry.init runs before any
 * other module executes (ESM-safe init order · @sentry/node v10 recommended
 * pattern). Captures runtime errors from the Railway agent runner — the
 * service that actually executes the Claude Agent SDK — so agent failures
 * reach Sentry with workflow/client/agent context (closes FASE 1 gap).
 *
 * Graceful · if SENTRY_DSN is absent the SDK initializes disabled (no-op ·
 * no crash). Railway env must provide SENTRY_DSN (same value as Vercel).
 */
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1,
})
