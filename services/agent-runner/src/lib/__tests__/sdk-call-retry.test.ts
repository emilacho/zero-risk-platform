/**
 * sdk-call-retry unit tests · Sprint 8D Fase 1 cuenta #1 closure.
 *
 * Verifies Anthropic transient retry pattern · success on first try ·
 * retry on transient (overloaded · service-not-able · 5xx) · throw
 * non-transient immediately · exhausted retries re-throw last error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { callSdkWithRetry, SDK_CALL_RETRY_DELAYS_MS } from "../sdk-call-retry"

describe("callSdkWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "log").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("succeeds on first attempt · no retries · no warnings", async () => {
    const fn = vi.fn().mockResolvedValue({ data: "ok" })
    const result = await callSdkWithRetry(fn, { canonicalSlug: "test-agent" })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.result).toEqual({ data: "ok" })
    expect(result.retry.attempts).toBe(1)
    expect(result.retry.retried).toBe(false)
    expect(result.retry.transientErrors).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("retries on 'service was not able to process' transient · succeeds 2nd attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("The service was not able to process your request"))
      .mockResolvedValueOnce({ data: "ok-retry" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "brand-strategist" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0])
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.result).toEqual({ data: "ok-retry" })
    expect(result.retry.attempts).toBe(2)
    expect(result.retry.retried).toBe(true)
    expect(result.retry.transientErrors).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it("retries on 'overloaded' transient · succeeds 3rd attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Overloaded · please retry"))
      .mockRejectedValueOnce(new Error("Overloaded · still"))
      .mockResolvedValueOnce({ data: "ok-3rd" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "jefe-marketing" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[1])
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(3)
    expect(result.result).toEqual({ data: "ok-3rd" })
    expect(result.retry.attempts).toBe(3)
  })

  it("re-throws non-transient errors immediately · no retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid model specified"))
    await expect(callSdkWithRetry(fn, { canonicalSlug: "test" })).rejects.toThrow("Invalid model specified")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("exhausts 3 retries on persistent transient · re-throws last error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET first"))
      .mockRejectedValueOnce(new Error("ECONNRESET second"))
      .mockRejectedValueOnce(new Error("ECONNRESET third"))
    const promise = callSdkWithRetry(fn, { canonicalSlug: "exhausted" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0])
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[1])
    await expect(promise).rejects.toThrow("ECONNRESET third")
    expect(fn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it("recognizes 5xx HTTP error strings as transient", async () => {
    const cases = [
      "502 Bad Gateway from upstream",
      "503 Service Unavailable",
      "504 Gateway Timeout",
      "Server-side issue · please retry",
      "Connection aborted",
      "Request timed out after 60s",
    ]
    for (const msg of cases) {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error(msg))
        .mockResolvedValueOnce({ ok: true })
      const promise = callSdkWithRetry(fn, { canonicalSlug: "transient-test" })
      await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0])
      await promise
      expect(fn).toHaveBeenCalledTimes(2)
      fn.mockClear()
    }
  })

  it("backoff delays match exponential schedule [1000 · 3000 · 10000]", () => {
    expect(SDK_CALL_RETRY_DELAYS_MS).toEqual([1000, 3000, 10000])
  })
})
