/**
 * Synthetic Inngest functions · Escalón 2 SHADOW durability tests.
 *
 * Mirror of the 3-step structure proven by the spike
 * (RESULTS-CC3-inngest-runtime-verify · 3 runs · 21 trace lines).
 * Reproduces the same shape in Inngest cloud so we can test ·
 * (a) retry-bajo-error under a real runtime (forced step failure)
 * (b) durability / persistence across deploy boundary (step memoised
 *     in attempt N must NOT re-run on attempt N+1)
 *
 * Trigger · NoneOf production callers wire these. They are dispatched
 * by the durability smoke script (`scripts/sala/synthetic-durability-smoke.mjs`)
 * which CC#4 runs against the deployed endpoint.
 *
 * §148 honest · these handlers DO NOT touch agent_invocations,
 * campaigns, or any client data. They write to a synthetic trace
 * (returned in the function result) that the smoke script reads back.
 */
import { inngestClient } from './client'
import { buildDeadLetterFailureHandler } from './dead-letter-handler'

/** Event name the synthetic functions respond to · namespaced
 *  `synthetic/*` so a future router with real journey events
 *  (`journey/*`) never collides. */
export const SYNTHETIC_DURABILITY_EVENT = 'synthetic/durability.test'

/** Per-step trace entry returned by each synthetic step body. */
interface StepTrace {
  readonly step: string
  readonly attempt: number
  readonly at: number
  readonly note?: string
}

/** The durability test function. 3 steps · step-1-compute returns a
 *  small constant · step-2-slow optionally throws on the first
 *  attempt (driven by event.data.simulate_failure) · step-3-finalize
 *  merges and returns. Inngest's `idempotency` keyed on
 *  `event.data.runId` ensures duplicate triggers within 24h collapse
 *  to one execution (proves the spike's idempotency property at
 *  runtime real). Inngest's `retries` config drives retry-bajo-error. */
export const syntheticDurabilityTest = inngestClient.createFunction(
  {
    id: 'synthetic-durability-test',
    name: 'Synthetic Durability Test · escalón 2 SHADOW',
    idempotency: 'event.data.runId',
    retries: 3,
    triggers: [{ event: SYNTHETIC_DURABILITY_EVENT }],
    // DLQ Option A · co-req #3 pre-flip escalón 5 · 2026-06-04.
    // When all 3 retries exhaust, write a `dead_letter` event to
    // sala_event_log + best-effort Slack alert. The handler swallows
    // its own errors so a writer failure NEVER masks the original
    // function error (§148 cap is safety net · not critical path).
    onFailure: buildDeadLetterFailureHandler('synthetic-durability-test'),
  },
  async ({ event, step, attempt }) => {
    const data = (event.data ?? {}) as {
      runId?: string
      simulate_failure?: 'step-2' | 'step-3' | 'none'
    }
    const runId = data.runId ?? 'unknown-runid'
    const simulate = data.simulate_failure ?? 'none'

    const r1: StepTrace = await step.run('step-1-compute', async () => {
      return {
        step: 'step-1-compute',
        attempt,
        at: Date.now(),
        note: `runId=${runId} simulate=${simulate}`,
      }
    })

    const r2: StepTrace = await step.run('step-2-slow', async () => {
      // Force a transient failure on the first attempt when the
      // smoke script requested it · proves retry-bajo-error in the
      // real runtime. Inngest will replay the function body but the
      // memoised step-1 result returns instantly (durability).
      if (simulate === 'step-2' && attempt < 2) {
        throw new Error(
          `synthetic transient failure · step-2 · attempt ${attempt} · runId ${runId}`,
        )
      }
      // Light synthetic work · 200ms · short enough to not hold
      // Inngest's compute window, long enough to be observable.
      await new Promise((res) => setTimeout(res, 200))
      return {
        step: 'step-2-slow',
        attempt,
        at: Date.now(),
        note: `runId=${runId}`,
      }
    })

    const r3 = await step.run('step-3-finalize', async () => {
      if (simulate === 'step-3' && attempt < 2) {
        throw new Error(
          `synthetic transient failure · step-3 · attempt ${attempt} · runId ${runId}`,
        )
      }
      return {
        step: 'step-3-finalize',
        attempt,
        at: Date.now(),
        note: `runId=${runId} · final attempt=${attempt}`,
        inputs: { r1, r2 },
      }
    })

    return {
      runId,
      simulate,
      final_attempt: attempt,
      step_count: 3,
      result: r3,
    }
  },
)

/** Array of synthetic functions to register with the serve handler.
 *  Growing this list = adding more shadow probes. NO real journey
 *  functions go here · those land in a separate registry gated by
 *  SALA_INNGEST_MODE=live (escalón 5). */
export const SYNTHETIC_FUNCTIONS = [syntheticDurabilityTest] as const
