/**
 * sdk-call-retry unit tests · Sprint 8D Fase 1 baseline + Sprint 8D tail
 * brand-strategist Railway app-level resilience upgrade.
 *
 * Verifies ·
 *  - Success on first try
 *  - Retry on transient (string-pattern · error.code · HTTP status)
 *  - Differentiated backoff (regular vs rate-limit)
 *  - Non-transient errors throw immediately (no retry noise)
 *  - Exhausted retries re-throw last error
 *  - Jitter applied (delay within ±20% of base)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  callSdkWithRetry,
  classifyError,
  SDK_CALL_RETRY_DELAYS_MS,
  SDK_CALL_RATELIMIT_DELAYS_MS,
} from "../sdk-call-retry"

describe("classifyError", () => {
  it("classifies HTTP 429 as transient + rateLimit (longer backoff)", () => {
    const err = Object.assign(new Error("Too many requests"), { status: 429 })
    const c = classifyError(err)
    expect(c.transient).toBe(true)
    expect(c.rateLimit).toBe(true)
    expect(c.reason).toContain("http-429")
  })

  it("classifies error.code=ECONNRESET as transient (network)", () => {
    const err = Object.assign(new Error("socket disconnect"), { code: "ECONNRESET" })
    const c = classifyError(err)
    expect(c.transient).toBe(true)
    expect(c.rateLimit).toBe(false)
    expect(c.reason).toContain("network-error-code=ECONNRESET")
  })

  it("classifies error.code=ETIMEDOUT as transient", () => {
    const err = Object.assign(new Error("..."), { code: "ETIMEDOUT" })
    expect(classifyError(err).transient).toBe(true)
  })

  it("classifies HTTP 502/503/504 as transient (server-side)", () => {
    for (const status of [500, 502, 503, 504, 521, 599]) {
      const err = Object.assign(new Error("server err"), { status })
      const c = classifyError(err)
      expect(c.transient).toBe(true)
      expect(c.rateLimit).toBe(false)
      expect(c.reason).toContain(`status=${status}`)
    }
  })

  it("classifies HTTP 408 + 425 as transient (timeout/early-data)", () => {
    expect(classifyError(Object.assign(new Error(), { status: 408 })).transient).toBe(true)
    expect(classifyError(Object.assign(new Error(), { status: 425 })).transient).toBe(true)
  })

  it("classifies HTTP 4xx (NOT 408/425/429) as non-transient", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const err = Object.assign(new Error("client err"), { status })
      const c = classifyError(err)
      expect(c.transient).toBe(false)
      expect(c.reason).toContain("non-retryable")
    }
  })

  it("falls back to message-pattern match when no status/code", () => {
    expect(classifyError(new Error("Overloaded")).transient).toBe(true)
    expect(classifyError(new Error("The service was not able to process your request")).transient).toBe(true)
    expect(classifyError(new Error("The connection to the server was closed unexpectedly")).transient).toBe(true)
    expect(classifyError(new Error("socket hang up")).transient).toBe(true)
  })

  it("classifies completely unknown errors as non-transient (fail-fast)", () => {
    expect(classifyError(new Error("Invalid model")).transient).toBe(false)
    expect(classifyError(new Error("foo bar baz")).transient).toBe(false)
  })

  it("reads status from nested error.response.status (fetch-style)", () => {
    const err = Object.assign(new Error("..."), { response: { status: 503 } })
    expect(classifyError(err).transient).toBe(true)
  })

  it("reads code from nested error.cause.code (Node fetch-style)", () => {
    const err = Object.assign(new Error("..."), { cause: { code: "ECONNRESET" } })
    expect(classifyError(err).transient).toBe(true)
  })
})

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

  it("retries on 'service was not able to process' · succeeds 2nd attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("The service was not able to process your request"))
      .mockResolvedValueOnce({ data: "ok-retry" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "brand-strategist" })
    // Jitter is ±20% so advance the full upper bound (1.2× baseDelay).
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0] * 1.2)
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.result).toEqual({ data: "ok-retry" })
    expect(result.retry.attempts).toBe(2)
    expect(result.retry.retried).toBe(true)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it("retries on error.code=ECONNRESET (structured) · succeeds 2nd attempt", async () => {
    const econnreset = Object.assign(new Error("socket reset"), { code: "ECONNRESET" })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(econnreset)
      .mockResolvedValueOnce({ data: "ok" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "brand-strategist" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0] * 1.2)
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.retry.attempts).toBe(2)
  })

  it("retries on HTTP 500 (structured) · succeeds 2nd attempt", async () => {
    const http500 = Object.assign(new Error("server error"), { status: 500 })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(http500)
      .mockResolvedValueOnce({ data: "ok" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "brand-strategist" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0] * 1.2)
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.retry.attempts).toBe(2)
  })

  it("uses longer rate-limit backoff on HTTP 429", async () => {
    const http429 = Object.assign(new Error("rate limited"), { status: 429 })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(http429)
      .mockResolvedValueOnce({ data: "ok" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "brand-strategist" })
    // Should sleep ~30s (rate-limit) not ~5s (regular) · advance only 5s + buffer should NOT resolve
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0] * 1.2)
    expect(fn).toHaveBeenCalledTimes(1) // still on first attempt · rate-limit not elapsed
    // Now advance up to rate-limit delay upper bound (30s · 1.2 jitter = 36s)
    await vi.advanceTimersByTimeAsync(SDK_CALL_RATELIMIT_DELAYS_MS[0] * 1.2)
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.retry.transientErrors[0]).toContain("http-429")
  })

  it("retries on 'overloaded' · succeeds 3rd attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Overloaded · please retry"))
      .mockRejectedValueOnce(new Error("Overloaded · still"))
      .mockResolvedValueOnce({ data: "ok-3rd" })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "jefe-marketing" })
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[0] * 1.2)
    await vi.advanceTimersByTimeAsync(SDK_CALL_RETRY_DELAYS_MS[1] * 1.2)
    const result = await promise
    expect(fn).toHaveBeenCalledTimes(3)
    expect(result.retry.attempts).toBe(3)
  })

  it("re-throws non-transient errors immediately · no retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid model specified"))
    await expect(callSdkWithRetry(fn, { canonicalSlug: "test" })).rejects.toThrow("Invalid model specified")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("re-throws HTTP 401 immediately · no retry (auth failure)", async () => {
    const http401 = Object.assign(new Error("auth"), { status: 401 })
    const fn = vi.fn(async () => { throw http401 })
    await expect(callSdkWithRetry(fn, { canonicalSlug: "test" })).rejects.toBe(http401)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("exhausts retries on persistent transient · re-throws last error", async () => {
    const errors = [
      Object.assign(new Error("first"), { code: "ECONNRESET" }),
      Object.assign(new Error("second"), { code: "ECONNRESET" }),
      Object.assign(new Error("third"), { code: "ECONNRESET" }),
      Object.assign(new Error("fourth"), { code: "ECONNRESET" }),
    ]
    let call = 0
    const fn = vi.fn(async () => { throw errors[call++] })
    const promise = callSdkWithRetry(fn, { canonicalSlug: "exhausted" })
    const settled = promise.catch((e) => e)
    for (const delay of SDK_CALL_RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay * 1.2)
    }
    const finalErr = await settled
    expect(finalErr).toBeInstanceOf(Error)
    expect((finalErr as Error).message).toBe("fourth")
    expect(fn).toHaveBeenCalledTimes(SDK_CALL_RETRY_DELAYS_MS.length + 1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it("backoff schedule is [5s · 15s · 30s] (regular transient · was 1s/3s/10s pre-Sprint-8D-tail)", () => {
    expect(SDK_CALL_RETRY_DELAYS_MS).toEqual([5000, 15000, 30000])
  })

  it("rate-limit backoff schedule is [30s · 60s · 120s]", () => {
    expect(SDK_CALL_RATELIMIT_DELAYS_MS).toEqual([30000, 60000, 120000])
  })
})
