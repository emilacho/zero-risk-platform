/**
 * Journey Orchestrator · L1 · L2 routing map
 *
 * Pure config · maps each journey type to the L2 dispatch target.
 * Separated from `dispatch.ts` so the routing is auditable / overrideable
 * via env vars in tests.
 *
 * Per dispatch spec (zr-vault/raw/dispatches/2026-05-20-cc1-sprint1-l1-...) ·
 *
 *   ONBOARD   → POST /api/onboarding (existing OnboardingOrchestrator)
 *   PRODUCE   → POST n8n webhook NEXUS 7-Phase RT1tcru9mysEwKkf
 *   ALWAYS_ON → POST /api/journey/event-log (just register the event)
 *   REVIEW    → STUB (TODO sprint posterior · QBR generator)
 *   ACQUIRE   → STUB (TODO sprint posterior · lead capture wrapper)
 *   GROWTH    → STUB (TODO sprint posterior)
 */
import type { JourneyType } from './types.js'

export type DispatchMode = 'http' | 'n8n_webhook' | 'stub'

export interface L2Route {
  /** What we'll do · http POST to platform · POST to n8n · or stub no-op. */
  mode: DispatchMode
  /** URL (with placeholder support · `${ZERO_RISK_API_URL}` etc). */
  url?: string
  /** Optional · header to add (e.g. x-api-key for internal). */
  authHeader?: 'x-api-key' | 'none'
  /** Timeout in ms · default 30000. */
  timeoutMs?: number
  /** Documentation reason · why this route. */
  doc?: string
}

/** Resolves a URL template against env vars at runtime. */
function resolveUrl(template: string): string {
  return template
    .replace(/\$\{ZERO_RISK_API_URL\}/g, process.env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')
    .replace(/\$\{N8N_BASE_URL\}/g, process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app')
}

const ROUTES: Record<JourneyType, L2Route> = {
  ONBOARD: {
    mode: 'http',
    url: '${ZERO_RISK_API_URL}/api/onboarding',
    authHeader: 'x-api-key',
    timeoutMs: 30_000,
    doc: 'OnboardingOrchestrator existing · Day-1 auto-discovery + intake form',
  },
  PRODUCE: {
    mode: 'n8n_webhook',
    url: '${N8N_BASE_URL}/webhook/campaign-orchestrator',
    authHeader: 'none',
    // NEXUS 7-Phase can take many minutes · this is a fire-and-forget;
    // L1 doesn't wait for completion · n8n calls back via callback-master.
    timeoutMs: 15_000,
    doc: 'NEXUS 7-Phase Campaign Orchestrator · workflow RT1tcru9mysEwKkf',
  },
  ALWAYS_ON: {
    mode: 'http',
    url: '${ZERO_RISK_API_URL}/api/journey/event-log',
    authHeader: 'x-api-key',
    timeoutMs: 10_000,
    doc: 'Journey D event registration · cron supervisors handle actual work',
  },
  REVIEW: {
    mode: 'stub',
    doc: 'TODO sprint posterior · QBR Generator quarterly · journey-e wrapper',
  },
  ACQUIRE: {
    mode: 'stub',
    doc: 'TODO sprint posterior · journey-a-acquire-pipeline · lead capture',
  },
  GROWTH: {
    mode: 'stub',
    doc: 'TODO sprint posterior · journey-f-growth-pipeline',
  },
}

export function routeForJourney(journey: JourneyType): L2Route {
  const route = ROUTES[journey]
  if (route.mode === 'stub') return route
  return {
    ...route,
    url: route.url ? resolveUrl(route.url) : undefined,
  }
}

export const _ROUTES_INTERNAL = ROUTES
