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

const mode = getSalaInngestMode()

// SHADOW · only synthetic functions. Mode is logged on import (cold
// start) so the Vercel function log makes the active set explicit
// for forensic checks.
// eslint-disable-next-line no-console
console.log(
  `[sala/inngest] serve · mode=${mode} · synthetic_count=${SYNTHETIC_FUNCTIONS.length}`,
)

const handler = serve({
  client: inngestClient,
  functions:
    mode === 'shadow'
      ? // SHADOW · ONLY the synthetic durability probes register.
        ([...SYNTHETIC_FUNCTIONS] as Parameters<typeof serve>[0]['functions'])
      : // LIVE wires in a later §144 step · not authorised today.
        // Until then, accept synthetics anyway so the endpoint stays
        // green even with the env flipped accidentally.
        ([...SYNTHETIC_FUNCTIONS] as Parameters<typeof serve>[0]['functions']),
})

export const { GET, POST, PUT } = handler

// Force the route to run on Node (not Edge) so the Inngest SDK has
// access to crypto + streams. Inngest officially supports Node
// runtimes via `inngest/next`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
