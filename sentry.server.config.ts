import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,

  // Wave 12 noise-reduction (CC#2 nocturno · 2026-04-30)
  // Suppress error patterns from known-broken workflows that fire on cron.
  // These are tracked separately in n8n execution history — Sentry capture
  // adds no signal, just burns free-tier quota (5K errors/mes).
  ignoreErrors: [
    // B-001 · HITL Inbox Processor JSON expression bug (every 15 min · 96/day)
    /JSON Body field is not valid JSON/i,
    // B-004 · Healthchecks Ping Monitor missing credential (every hour · 24/day)
    /missing api ?key/i,
    // n8n stub fallbacks intentional (returned by /api/stubs/* when real
    // service URLs not configured · expected behavior in pre-launch)
    /stub-handler/i,
  ],

  // Drop transactions for noisy / low-signal routes
  beforeSendTransaction(event) {
    const name = event.transaction || '';
    if (
      name.includes('/api/health') ||
      name.includes('/api/posthog/') ||
      name.includes('/_next/') ||
      name.startsWith('/static/')
    ) {
      return null;
    }
    return event;
  },
});
