/**
 * POST /sentry-tunnel
 *
 * Canon canonical Sentry tunnel route handler · proxies Sentry envelopes from
 * the client SDK to Sentry SaaS · required because `next.config.js` declares
 * `tunnelRoute: '/sentry-tunnel'` to bypass ad-blockers + privacy extensions.
 *
 * Without this handler, all client-side Sentry events return 404 and silently
 * drop · server-side events (instrumentation.ts → sentry.server.config.ts)
 * are unaffected because they send directly from the runtime.
 *
 * Root cause of 0 events in 24h (CIC findings 2026-05-30) · tunnelRoute
 * configured but handler missing. Server events may also be affected if
 * Vercel env vars are not propagated (SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN).
 *
 * Reference · https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/tunneling/
 */

// Canon canonical · edge runtime for lowest-latency proxy
export const runtime = 'edge'

// Sentry SaaS host suffixes canon canonical · validates DSN host pattern
const ALLOWED_HOST_SUFFIXES = [
  '.ingest.sentry.io',
  '.ingest.us.sentry.io',
  '.ingest.de.sentry.io',
]

export async function POST(req: Request) {
  try {
    const envelope = await req.text()
    const headerLine = envelope.split('\n', 1)[0]
    if (!headerLine) {
      return new Response('empty envelope', { status: 400 })
    }

    const header = JSON.parse(headerLine) as { dsn?: string }
    if (!header.dsn) {
      return new Response('missing dsn in envelope header', { status: 400 })
    }

    const dsn = new URL(header.dsn)
    const hostAllowed = ALLOWED_HOST_SUFFIXES.some((sfx) => dsn.host.endsWith(sfx))
    if (!hostAllowed) {
      return new Response(`invalid sentry host: ${dsn.host}`, { status: 400 })
    }

    const projectId = dsn.pathname?.replace(/^\//, '')
    if (!projectId) {
      return new Response('missing project id in dsn', { status: 400 })
    }

    const upstreamUrl = `https://${dsn.host}/api/${projectId}/envelope/`
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      body: envelope,
      headers: { 'content-type': 'application/x-sentry-envelope' },
    })

    return new Response(null, { status: upstream.status })
  } catch (err) {
    return new Response('tunnel error', { status: 500 })
  }
}
