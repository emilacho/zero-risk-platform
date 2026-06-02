/**
 * Sprint 12 · Drift B paso D · deprecation instrumentation for the legacy
 * `/api/agents/run` endpoint. ADDITIVE only · no behavior change.
 *
 * Spec · `spec-CC2-legacy-endpoint-deprecation-instrument.md` · Opus batch 15 §B.
 *
 * Canon · `/api/agents/run` (legacy) vs `/api/agents/run-sdk` (canon post-§149).
 * Drift B sweep 2026-06-01 · 38 of 50 agent-call nodes in n8n live still hit
 * the legacy endpoint (76% of coverage). This module wires the observability
 * that lets the §144 pre-rankeada migration list rank by REAL traffic over a
 * shadow window · not the static sweep.
 *
 * Surface · 3 pure helpers used by the route file ·
 *  - `addLegacyDeprecationHeaders(response)` · attaches RFC 9745 Deprecation
 *    + Link rel="successor-version" headers + X-Deprecated-Endpoint markers
 *    to ANY NextResponse · idempotent · safe to call multiple times
 *  - `legacyJson(body, init?)` · NextResponse.json shorthand that already has
 *    the deprecation headers attached · drop-in replacement for the bare
 *    `NextResponse.json(...)` calls inside the legacy route
 *  - `logLegacyEndpointUsage(payload)` · structured console.warn that the
 *    ranking SQL canon (zr-vault/runbooks/legacy-endpoint-usage-ranking.md)
 *    can correlate with `agent_invocations.metadata` rows
 */
import { NextResponse } from 'next/server'

export const LEGACY_ENDPOINT_PATH = '/api/agents/run'
export const LEGACY_SUCCESSOR_PATH = '/api/agents/run-sdk'
const LEGACY_LINK_HEADER = `<${LEGACY_SUCCESSOR_PATH}>; rel="successor-version"`

/**
 * Attach canon RFC 9745 deprecation headers + Zero Risk X-Deprecated-* markers.
 * Idempotent · safe to call multiple times on the same response object.
 */
export function addLegacyDeprecationHeaders(response: NextResponse): NextResponse {
  response.headers.set('Deprecation', 'true')
  response.headers.set('Link', LEGACY_LINK_HEADER)
  response.headers.set('X-Deprecated-Endpoint', LEGACY_ENDPOINT_PATH)
  response.headers.set('X-Successor-Endpoint', LEGACY_SUCCESSOR_PATH)
  return response
}

/**
 * NextResponse.json shorthand that already has the legacy deprecation headers
 * attached. Drop-in replacement for `NextResponse.json(...)` calls inside the
 * legacy `/api/agents/run` route. Ensures the deprecation signal is consistent
 * regardless of outcome (2xx / 4xx / 5xx).
 */
export function legacyJson(
  ...args: Parameters<typeof NextResponse.json>
): NextResponse {
  return addLegacyDeprecationHeaders(NextResponse.json(...args))
}

export interface LegacyUsagePayload {
  workflow_id: string | null
  workflow_execution_id: string | null
  agent_slug: string | null
  caller: string | null
  user_agent: string | null
  client_id: string | null
}

/**
 * Structured console.warn fired per legacy-endpoint invocation that passes
 * the entry validation (auth + required fields). Fired BEFORE wf_id
 * enforcement so the log captures even non-compliant callers · they still
 * count as legacy attempts that need migration.
 *
 * Log format · single-line JSON prefixed with a canon scan tag so log search
 * (Vercel + Sentry) can pick it up via regex `legacy_endpoint_invocation`.
 */
export function logLegacyEndpointUsage(payload: LegacyUsagePayload): void {
  console.warn(
    '[agents/run · DEPRECATED · §149 Drift B paso D] ' + JSON.stringify({
      kind: 'legacy_endpoint_invocation',
      endpoint: LEGACY_ENDPOINT_PATH,
      successor: LEGACY_SUCCESSOR_PATH,
      ts: new Date().toISOString(),
      ...payload,
    }),
  )
}

/**
 * Canonical metadata fragment to merge into `agent_invocations.metadata` for
 * every legacy invocation that lands a row. Used as the source-of-truth for
 * the ranking SQL canon (see vault doc).
 *
 * Spread into the existing metadata object · does NOT replace.
 */
export const LEGACY_INVOCATION_METADATA = {
  endpoint_path: LEGACY_ENDPOINT_PATH,
  endpoint_legacy: true,
  endpoint_successor: LEGACY_SUCCESSOR_PATH,
} as const
