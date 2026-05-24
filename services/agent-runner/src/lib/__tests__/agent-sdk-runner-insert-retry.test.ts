/**
 * agent-sdk-runner · insertWithRetry · Sprint 8B B2 unit tests.
 *
 * Verifies the retry behaviour that replaced the silent `.then(()=>{})`
 * fire-and-forget in `logExecution`. Each attempt that fails (PostgREST
 * error in resolved promise OR thrown rejection) is logged · 3 attempts
 * total with exponential backoff (100ms · 500ms · 2000ms) · final failure
 * logged as ERROR with row preview · NEVER throws to caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertWithRetry, AGENTS_LOG_RETRY_DELAYS_MS } from "../agents-log-retry"

type InsertFn = (row: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>

function buildMockSupabase(insertFn: InsertFn) {
  return {
    from: () => ({ insert: insertFn }),
  } as unknown as Parameters<typeof insertWithRetry>[0]
}

describe("insertWithRetry", () => {
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
    const promise = insertWithRetry(supabase, { foo: "bar" }, "test-slug")
    await promise
    expect(insertFn).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it("retries on PostgREST error · succeeds on 2nd attempt", async () => {
    const insertFn = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ error: null })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertWithRetry(supabase, { foo: "bar" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[0])
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
    const promise = insertWithRetry(supabase, { agent_name: "test-slug", cost: 0.01 }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[1])
    await promise
    expect(insertFn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(2) // attempts 1 + 2
    expect(console.error).toHaveBeenCalledTimes(2) // final attempt fail + row preview
    const errorCalls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(errorCalls.some((c: unknown[]) => String(c[0]).includes("[agents-log]"))).toBe(true)
    expect(errorCalls.some((c: unknown[]) => String(c[0]).includes("row preview"))).toBe(true)
  })

  it("retries on thrown rejection (network error) · 3rd attempt success", async () => {
    const insertFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ error: null })
    const supabase = buildMockSupabase(insertFn)
    const promise = insertWithRetry(supabase, { foo: "bar" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[1])
    await promise
    expect(insertFn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(console.error).not.toHaveBeenCalled() // 3rd succeeded
  })

  it("NEVER throws to caller · even on full failure", async () => {
    const insertFn = vi.fn().mockRejectedValue(new Error("permanent network failure"))
    const supabase = buildMockSupabase(insertFn)
    const promise = insertWithRetry(supabase, { foo: "bar" }, "test-slug")
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(AGENTS_LOG_RETRY_DELAYS_MS[1])
    // Should resolve · NOT reject
    await expect(promise).resolves.toBeUndefined()
    expect(insertFn).toHaveBeenCalledTimes(3)
  })

  it("backoff delays match exponential schedule [100 · 500 · 2000]", () => {
    expect(AGENTS_LOG_RETRY_DELAYS_MS).toEqual([100, 500, 2000])
  })
})
