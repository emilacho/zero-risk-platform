/**
 * Inngest client · Sprint 12 Fase 0 Escalón 2 (Mitad 2 wire · SHADOW).
 *
 * Real Inngest SDK client bound to the production credentials Emilio
 * provided via §144 (loaded from Vercel env vars · NOT committed).
 *
 * SHADOW mode (escalón 2) · only synthetic functions are registered
 * here. Real journey dispatch (escalón 5 · flip enforce) wires
 * separately and is gated by a different §144 step.
 *
 * Env contract ·
 *   INNGEST_EVENT_KEY     · server-side · used to emit events
 *   INNGEST_SIGNING_KEY   · validates incoming webhooks from Inngest
 *                           cloud · also used by inngest-cli for sync
 *   SALA_INNGEST_MODE     · 'shadow' (default) | 'live' · gates which
 *                           function set is registered with serve()
 *                           (only 'shadow' active in escalón 2)
 */
import { Inngest } from 'inngest'

/** App id · matches the Inngest cloud app registered for this
 *  deploy URL. Used by the SDK to namespace events + functions. */
export const INNGEST_APP_ID = 'zero-risk-platform'

/** Singleton Inngest client. Reads INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
 *  from process.env at construction. In serverless / Vercel runtimes
 *  these are populated by the Production env vars (set 2026-06-04
 *  via Vercel API · ids 9pv5w0XoR77Qmlb8 + e9XSaCEKh9hlJZff). */
export const inngestClient = new Inngest({
  id: INNGEST_APP_ID,
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
})

/** Operational mode of the Inngest wire. SHADOW (default) registers
 *  ONLY synthetic functions · real journey dispatch is OFF. */
export type SalaInngestMode = 'shadow' | 'live'

export function getSalaInngestMode(): SalaInngestMode {
  const raw = process.env.SALA_INNGEST_MODE
  return raw === 'live' ? 'live' : 'shadow'
}
