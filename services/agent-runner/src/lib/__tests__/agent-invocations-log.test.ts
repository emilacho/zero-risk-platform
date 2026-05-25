/**
 * agent-invocations-log · insertAgentInvocationWithRetry · Sprint 8D cuenta #1
 * closure unit tests. Mirror of agent-sdk-runner-insert-retry.test.ts pattern
 * targeting the canonical `agent_invocations` table.
 *
 * Same retry behaviour as agents-log: 3 attempts · exponential backoff
 * [100ms · 500ms · 2000ms] · NEVER throws to caller · final failure logs
 * ERROR with row preview.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  insertAgentInvocationWithRetry,
  AGENT_INVOCATIONS_RETRY_DELAYS_MS,
} from "../agent-invocations-log"

type InsertFn = (row: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>

function buildMockSupabase(insertFn: InsertFn) {
  return {
    from: (table: string) => {
      // Verify the helper targets the canonical table · catch typos early.
      if (table !== "agent_invocations") {
        throw new Error(`expected from('agent_invocations') · got '${table}'`)
      }
      return { insert: insertFn }
    },
  } as unknown as Parameters<typeof insertAgentInvocationWithRetry>[0]
}

describe("insertAgentInvocationWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("succeeds on first attempt · no retries · no warnings", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertAgentInvocationWithRetry(supabase, { workflow_id: "wf-1" }, "test-slug")
    await promise
    expect(insertFn).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it("targets the canonical agent_invocations table (not agents_log)", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null })
    // The buildMockSupabase from() throws if a different table name is used.
    const supabase = buildMockSupabase(insertFn)
    await insertAgentInvocationWithRetry(supabase, { workflow_id: "wf-1" }, "test-slug")
    expect(insertFn).toHaveBeenCalledTimes(1)
  })

  it("retries on PostgREST error · succeeds on 2nd attempt", async () => {
    const insertFn = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ error: null })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertAgentInvocationWithRetry(supabase, { workflow_id: "wf-1" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[0])
    await promise
    expect(insertFn).toHaveBeenCalledTimes(2)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it("retries 3 times on persistent error · final logs ERROR with row preview", async () => {
    const insertFn = vi
      .fn()
      .mockResolvedValue({ error: { code: "500", message: "db unreachable" } })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertAgentInvocationWithRetry(
      supabase,
      { agent_name: "test-slug", workflow_id: "wf-1", cost_usd: 0.01 },
      "test-slug",
    )
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[1])
    await promise
    expect(insertFn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledTimes(2)
    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(errorCalls.some((c: unknown[]) => String(c[0]).includes("[agent-invocations]"))).toBe(true)
    expect(errorCalls.some((c: unknown[]) => String(c[0]).includes("row preview"))).toBe(true)
  })

  it("retries on thrown rejection (network error) · 3rd attempt success", async () => {
    const insertFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ error: null })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertAgentInvocationWithRetry(supabase, { workflow_id: "wf-1" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[1])
    await promise
    expect(insertFn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(console.error).not.toHaveBeenCalled()
  })

  it("NEVER throws to caller · even on full failure", async () => {
    const insertFn = vi.fn().mockRejectedValue(new Error("permanent network failure"))
    const supabase = buildMockSupabase(insertFn)
    const promise = insertAgentInvocationWithRetry(supabase, { workflow_id: "wf-1" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENT_INVOCATIONS_RETRY_DELAYS_MS[1])
    await expect(promise).resolves.toBeUndefined()
    expect(insertFn).toHaveBeenCalledTimes(3)
  })

  it("backoff delays match exponential schedule [100 · 500 · 2000]", () => {
    expect(AGENT_INVOCATIONS_RETRY_DELAYS_MS).toEqual([100, 500, 2000])
  })
})
