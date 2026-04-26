import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Replay: off for normal sessions, on for errors only
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  debug: false,
});

// App Router router transition tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
