/**
 * Inngest serve endpoint · Sprint 12 Fase 0 Escalón 2 (SHADOW).
 *
 * Vercel App Router route handler. Inngest cloud pings this endpoint
 * to · (a) discover registered functions (PUT / GET introspection),
 * (b) deliver event payloads to the registered handlers (POST signed
 * by INNGEST_SIGNING_KEY).
 *
 * SHADOW gate · `getSalaInngestMode()` returns 'shadow' unless an
 * explicit env override · ONLY `SYNTHETIC_FUNCTIONS` register. The
 * router (Track H / escalón 3+) and real journey handlers wire
 * SEPARATELY in a later §144 step.
 *
 * §148 honest · this endpoint is intentionally narrow · it accepts
 * synthetic events only. Real journey events (`journey.*`) have no
 * handler today, so they would be no-ops if Inngest cloud routed
 * any to us · which it should not, because we have not registered
 * any such handlers.
 */
import { serve } from 'inngest/next'
import {
  getSalaInngestMode,
  inngestClient,
} from '@/lib/sala/inngest/client'
import { SYNTHETIC_FUNCTIONS } from '@/lib/sala/inngest/synthetic-functions'
import {
  isSyntheticCanaryEnabled,
  syntheticCanaryFn,
} from '@/lib/sala/inngest/canary-function'

const mode = getSalaInngestMode()
const canaryEnabled = isSyntheticCanaryEnabled()

// Synthetic function set · the durability probe ships always, the
// canary is gated by `SALA_CANARY_ENABLED=true` so production runtime
// stays narrow until Track S finale prep §144 flips it.
const activeFunctions = canaryEnabled
  ? ([...SYNTHETIC_FUNCTIONS, syntheticCanaryFn] as Parameters<
      typeof serve
    >[0]['functions'])
  : ([...SYNTHETIC_FUNCTIONS] as Parameters<typeof serve>[0]['functions'])

// Mode + active-function summary is logged on import (cold start) so
// the Vercel function log makes the registered set explicit for
// forensic checks.
// eslint-disable-next-line no-console
console.log(
  `[sala/inngest] serve · mode=${mode} · canary=${canaryEnabled} · active_count=${activeFunctions.length}`,
)

const handler = serve({
  client: inngestClient,
  functions: activeFunctions,
})

export const { GET, POST, PUT } = handler

// Force the route to run on Node (not Edge) so the Inngest SDK has
// access to crypto + streams. Inngest officially supports Node
// runtimes via `inngest/next`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
