import { PostHog } from 'posthog-node'

let _client: PostHog | null = null

export function getPostHogClient(): PostHog | null {
  if (!process.env.POSTHOG_API_KEY) return null
  if (_client) return _client
  _client = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_API_URL ?? 'https://us.posthog.com',
    // flushAt: 1 flushes after every event — required for Vercel serverless
    // where the process may be killed immediately after response.
    flushAt: 1,
    flushInterval: 0,
  })
  return _client
}

export function capture(
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  try {
    const ph = getPostHogClient()
    if (!ph) return
    ph.capture({ distinctId, event, properties })
  } catch {
    // fail-open: PostHog failure must never break the request
  }
}

export async function flushPostHog(): Promise<void> {
  try {
    if (_client) await _client.flush()
  } catch {
    // ignore
  }
}

export async function shutdownPostHog(): Promise<void> {
  try {
    if (_client) await _client.shutdown()
    _client = null
  } catch {
    // ignore
  }
}
