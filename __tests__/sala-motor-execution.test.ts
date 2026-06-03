/**
 * Tests for src/lib/sala/executors/inngest-executor.ts ·
 * Motor Mitad 1 (CÓDIGO) · execution runtime semantics ·
 * Sprint 12 Fase 0 Track B.
 *
 * What is covered ·
 * - Happy path · enqueue → execute → completed
 * - Step memoisation · cross-attempt persistence (the load-bearing
 *   durability primitive · matches Inngest spike §2.2)
 * - Retry policy · maxAttempts enforced · exponential backoff applied
 *   between attempts · capped by maxBackoffMs
 * - Dead-letter queue · runs that exhaust retries land in DLQ with
 *   full attempt history + finalError + timestamp
 * - Budget hook called at every step · BudgetExhaustedError counts
 *   as failure → retry policy applies
 * - Local maxStepsPerRun enforcement · independent of bucket cap
 * - Cancel mid-flight · cancelled status stops further retries
 * - executeAll drains queued runs
 * - Attempt history accessor exposes per-attempt audit trail
 */
import { describe, it, expect, vi } from 'vitest'
import { InngestExecutor } from '../src/lib/sala/executors/inngest-executor'
import {
  BudgetExhaustedError,
  type BudgetHook,
} from '../src/lib/sala/budget-hook'
import { deriveIdempotencyKey } from '../src/lib/sala/idempotency-key'
import type {
  ExecutionInput,
  LogicalPeriod,
  StepRunner,
} from '../src/lib/sala/executor-contract'

// ─── Fixtures ──────────────────────────────────────────────────────

const PERIOD: LogicalPeriod = { kind: 'iso_week', value: '2026-W23' }

function buildInput<T = unknown>(
  overrides?: Partial<Omit<ExecutionInput<T>, 'idempotencyKey'>>,
): ExecutionInput<T> {
  const base = {
    operationType: 'campaign.create_brief',
    clientId: 'client-abc',
    logicalPeriod: PERIOD,
    payload: { foo: 'bar' } as unknown as T,
  }
  const merged = { ...base, ...overrides }
  return {
    ...merged,
    idempotencyKey: deriveIdempotencyKey({
      operationType: merged.operationType,
      clientId: merged.clientId,
      logicalPeriod: merged.logicalPeriod,
    }),
  }
}

const defaultRetry = {
  maxAttempts: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 1000,
}

/** Sleep stub that records calls (so tests can assert backoff usage)
 *  without actually waiting. */
function makeSleepSpy() {
  const calls: number[] = []
  const sleep = async (ms: number) => {
    calls.push(ms)
  }
  return { sleep, calls }
}

// ─── Happy path ────────────────────────────────────────────────────

describe('InngestExecutor.execute · happy path', () => {
  it('runs the handler once and transitions to completed', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    let invocations = 0
    exec.register(
      'op',
      async (_payload, step) => {
        invocations++
        const a = await step.run('s1', async () => 'A')
        const b = await step.run('s2', async () => 'B')
        return `${a}${b}`
      },
      { retry: defaultRetry },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(invocations).toBe(1)
    expect(await exec.getStatus(runId)).toBe('completed')
    expect(exec.getOutput(runId)).toBe('AB')
  })

  it('records a single completed attempt in the history', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    exec.register('op', async () => 'done', { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    const history = exec.getAttemptHistory(runId)
    expect(history).toHaveLength(1)
    expect(history[0]!.attempt).toBe(1)
    expect(history[0]!.status).toBe('completed')
  })

  it('execute is idempotent on completed runs', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    let invocations = 0
    exec.register(
      'op',
      async () => {
        invocations++
      },
      { retry: defaultRetry },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    await exec.execute(runId)
    await exec.execute(runId)
    expect(invocations).toBe(1)
    expect(await exec.getStatus(runId)).toBe('completed')
  })
})

// ─── Step memoisation across retry attempts ────────────────────────

describe('InngestExecutor.execute · step memoisation', () => {
  it('memoised step results are NOT re-executed across retry attempts', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    const s1Invocations = vi.fn(async () => 'step-1-result')
    let attempt = 0
    exec.register(
      'op',
      async (_payload, step) => {
        attempt++
        const a = await step.run('s1', s1Invocations)
        if (attempt < 3) {
          throw new Error('transient failure in attempt ' + attempt)
        }
        return a
      },
      { retry: defaultRetry },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(await exec.getStatus(runId)).toBe('completed')
    // s1 ran on attempt 1, then memoised · attempts 2 + 3 return
    // the cached value without invoking the fn again.
    expect(s1Invocations).toHaveBeenCalledTimes(1)
    expect(exec.getOutput(runId)).toBe('step-1-result')
  })

  it('a step that throws is NOT memoised · re-runs next attempt', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    const s1Throws = vi.fn(async () => {
      throw new Error('s1 boom')
    })
    exec.register(
      'op',
      async (_payload, step) => {
        await step.run('s1', s1Throws)
        return 'never reached'
      },
      { retry: { ...defaultRetry, maxAttempts: 3 } },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(await exec.getStatus(runId)).toBe('failed')
    expect(s1Throws).toHaveBeenCalledTimes(3)
  })
})

// ─── Retry policy + exponential backoff ────────────────────────────

describe('InngestExecutor.execute · retry policy', () => {
  it('retries up to maxAttempts then dead-letters', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    exec.register('op', fn, {
      retry: { maxAttempts: 4, initialBackoffMs: 10, maxBackoffMs: 100 },
    })
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(fn).toHaveBeenCalledTimes(4)
    expect(await exec.getStatus(runId)).toBe('failed')
    expect(exec.getDeadLetterQueue()).toHaveLength(1)
  })

  it('succeeds on retry · attempt history shows failed → completed', async () => {
    const { sleep } = makeSleepSpy()
    const exec = new InngestExecutor({ sleep })
    let attempts = 0
    exec.register(
      'op',
      async () => {
        attempts++
        if (attempts < 3) throw new Error('transient')
        return 'ok'
      },
      { retry: defaultRetry },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(await exec.getStatus(runId)).toBe('completed')
    const history = exec.getAttemptHistory(runId)
    expect(history).toHaveLength(3)
    expect(history[0]!.status).toBe('failed')
    expect(history[1]!.status).toBe('failed')
    expect(history[2]!.status).toBe('completed')
  })

  it('exponential backoff · initial * 2^(n-1) capped at maxBackoffMs', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    exec.register(
      'op',
      async () => {
        throw new Error('boom')
      },
      { retry: { maxAttempts: 5, initialBackoffMs: 100, maxBackoffMs: 500 } },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    // Backoffs happen BETWEEN attempts · maxAttempts=5 means 4 backoffs
    // before the final attempt. Schedule · 100 · 200 · 400 · 500 (cap).
    expect(spy.calls).toEqual([100, 200, 400, 500])
  })

  it('no backoff after the last attempt (no wasted sleep)', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    exec.register(
      'op',
      async () => {
        throw new Error('boom')
      },
      { retry: { maxAttempts: 1, initialBackoffMs: 1000, maxBackoffMs: 1000 } },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(spy.calls).toEqual([])
    expect(await exec.getStatus(runId)).toBe('failed')
  })
})

// ─── Dead-letter queue ──────────────────────────────────────────────

describe('InngestExecutor dead-letter queue', () => {
  it('captures the full attempt history + finalError + timestamp', async () => {
    const spy = makeSleepSpy()
    let nowVal = 1_000_000
    const exec = new InngestExecutor({
      sleep: spy.sleep,
      now: () => nowVal++,
    })
    exec.register(
      'op',
      async () => {
        throw new Error('persistent failure · code 42')
      },
      { retry: { maxAttempts: 2, initialBackoffMs: 10, maxBackoffMs: 100 } },
    )
    const input = buildInput({ operationType: 'op', clientId: 'client-x' })
    const runId = await exec.enqueue(input)
    await exec.execute(runId)
    const dlq = exec.getDeadLetterQueue()
    expect(dlq).toHaveLength(1)
    expect(dlq[0]!.runId).toBe(runId)
    expect(dlq[0]!.operationType).toBe('op')
    expect(dlq[0]!.clientId).toBe('client-x')
    expect(dlq[0]!.idempotencyKey).toBe(input.idempotencyKey)
    expect(dlq[0]!.attempts).toHaveLength(2)
    expect(dlq[0]!.attempts[0]!.status).toBe('failed')
    expect(dlq[0]!.attempts[1]!.status).toBe('failed')
    expect(dlq[0]!.finalError).toContain('persistent failure')
    expect(dlq[0]!.deadLetteredAt).toBeGreaterThan(1_000_000)
  })

  it('drain returns + clears the queue', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    exec.register(
      'op-a',
      async () => {
        throw new Error('a')
      },
      { retry: { maxAttempts: 1, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    exec.register(
      'op-b',
      async () => {
        throw new Error('b')
      },
      { retry: { maxAttempts: 1, initialBackoffMs: 0, maxBackoffMs: 0 } },
    )
    const rA = await exec.enqueue(buildInput({ operationType: 'op-a' }))
    const rB = await exec.enqueue(buildInput({ operationType: 'op-b' }))
    await exec.execute(rA)
    await exec.execute(rB)
    expect(exec.getDeadLetterQueue()).toHaveLength(2)
    const drained = exec.drainDeadLetterQueue()
    expect(drained).toHaveLength(2)
    expect(exec.getDeadLetterQueue()).toHaveLength(0)
  })

  it('budget-exhausted attempts are recorded as "budget_exhausted" status', async () => {
    const spy = makeSleepSpy()
    const hook: BudgetHook = {
      async checkAndIncrement(bucketKey) {
        return { ok: false, bucketKey, reason: 'window cap reached' }
      },
    }
    const exec = new InngestExecutor({ sleep: spy.sleep, budgetHook: hook })
    exec.register(
      'op',
      async (_payload, step) => {
        await step.run('s1', async () => 'x')
        return 'ok'
      },
      {
        retry: { maxAttempts: 2, initialBackoffMs: 0, maxBackoffMs: 0 },
        budget: { bucketKey: 'op:client:bucket' },
      },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    const history = exec.getAttemptHistory(runId)
    expect(history).toHaveLength(2)
    expect(history[0]!.status).toBe('budget_exhausted')
    expect(history[1]!.status).toBe('budget_exhausted')
    expect(exec.getDeadLetterQueue()).toHaveLength(1)
  })
})

// ─── Budget hook called per step ────────────────────────────────────

describe('InngestExecutor budget hook · G6 binding seam', () => {
  it('hook is invoked once per step.run before the body executes', async () => {
    const spy = makeSleepSpy()
    const hook: BudgetHook = {
      checkAndIncrement: vi.fn(async (bucketKey) => ({ ok: true, bucketKey })),
    }
    const exec = new InngestExecutor({ sleep: spy.sleep, budgetHook: hook })
    exec.register(
      'op',
      async (_payload, step) => {
        await step.run('s1', async () => 'a')
        await step.run('s2', async () => 'b')
        await step.run('s3', async () => 'c')
        return 'done'
      },
      {
        retry: defaultRetry,
        budget: { bucketKey: 'bucket-op' },
      },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(hook.checkAndIncrement).toHaveBeenCalledTimes(3)
    expect(hook.checkAndIncrement).toHaveBeenNthCalledWith(1, 'bucket-op')
  })

  it('hook NOT invoked when handler has no budget policy', async () => {
    const spy = makeSleepSpy()
    const hook: BudgetHook = {
      checkAndIncrement: vi.fn(async (bucketKey) => ({ ok: true, bucketKey })),
    }
    const exec = new InngestExecutor({ sleep: spy.sleep, budgetHook: hook })
    exec.register(
      'op',
      async (_payload, step) => {
        await step.run('s1', async () => 'a')
        return 'ok'
      },
      { retry: defaultRetry }, // no budget
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(hook.checkAndIncrement).not.toHaveBeenCalled()
  })

  it('maxStepsPerRun enforced locally · throws BudgetExhaustedError', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    exec.register(
      'op',
      async (_payload, step) => {
        await step.run('s1', async () => 'a')
        await step.run('s2', async () => 'b')
        await step.run('s3', async () => 'c') // should throw · maxStepsPerRun=2
        return 'never reached'
      },
      {
        retry: { maxAttempts: 1, initialBackoffMs: 0, maxBackoffMs: 0 },
        budget: { bucketKey: 'bucket-op', maxStepsPerRun: 2 },
      },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(await exec.getStatus(runId)).toBe('failed')
    const history = exec.getAttemptHistory(runId)
    expect(history[0]!.status).toBe('budget_exhausted')
    expect(history[0]!.error).toContain('maxStepsPerRun 2 exceeded')
  })

  it('memoised steps do NOT re-invoke the budget hook on retry', async () => {
    const spy = makeSleepSpy()
    const hookCalls: string[] = []
    const hook: BudgetHook = {
      async checkAndIncrement(bucketKey) {
        hookCalls.push(bucketKey)
        return { ok: true, bucketKey }
      },
    }
    const exec = new InngestExecutor({ sleep: spy.sleep, budgetHook: hook })
    let attempt = 0
    exec.register(
      'op',
      async (_payload, step) => {
        attempt++
        const a = await step.run('s1', async () => 'a')
        if (attempt < 2) throw new Error('transient · second attempt please')
        const b = await step.run('s2', async () => 'b')
        return a + b
      },
      {
        retry: defaultRetry,
        budget: { bucketKey: 'bucket-x' },
      },
    )
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(await exec.getStatus(runId)).toBe('completed')
    // Attempt 1 · s1 fires hook · then throws.
    // Attempt 2 · s1 is memoised · skips hook · s2 fires hook.
    // Total · 2 hook calls (NOT 3).
    expect(hookCalls).toEqual(['bucket-x', 'bucket-x'])
    expect(hookCalls).toHaveLength(2)
  })
})

// ─── Cancel mid-flight ──────────────────────────────────────────────

describe('InngestExecutor.cancel during execute', () => {
  it('cancel before execute · execute is a no-op', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    const fn = vi.fn(async () => 'ok')
    exec.register('op', fn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.cancel(runId)
    await exec.execute(runId)
    expect(fn).not.toHaveBeenCalled()
    expect(await exec.getStatus(runId)).toBe('cancelled')
  })

  it('cancel between retry attempts · no further attempts', async () => {
    // The sleep stub triggers cancel during the backoff, simulating
    // an external cancel arriving between attempts.
    let cancelInjected = false
    const exec = new InngestExecutor({
      sleep: async () => {
        if (!cancelInjected) {
          cancelInjected = true
          await exec.cancel(runId)
        }
      },
    })
    const fn = vi.fn(async () => {
      throw new Error('always fails')
    })
    exec.register('op', fn, { retry: defaultRetry })
    const runId = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(runId)
    expect(fn).toHaveBeenCalledTimes(1) // attempt 1, then cancel before attempt 2
    expect(await exec.getStatus(runId)).toBe('cancelled')
  })
})

// ─── executeAll ────────────────────────────────────────────────────

describe('InngestExecutor.executeAll', () => {
  it('drains all queued runs serially', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    const results: string[] = []
    exec.register(
      'op-a',
      async () => {
        results.push('a')
      },
      { retry: defaultRetry },
    )
    exec.register(
      'op-b',
      async () => {
        results.push('b')
      },
      { retry: defaultRetry },
    )
    exec.register(
      'op-c',
      async () => {
        results.push('c')
      },
      { retry: defaultRetry },
    )
    await exec.enqueue(buildInput({ operationType: 'op-a' }))
    await exec.enqueue(buildInput({ operationType: 'op-b' }))
    await exec.enqueue(buildInput({ operationType: 'op-c' }))
    await exec.executeAll()
    expect(results.sort()).toEqual(['a', 'b', 'c'])
  })

  it('skips runs that are already terminal', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    const fn = vi.fn(async () => 'ok')
    exec.register('op', fn, { retry: defaultRetry })
    const r1 = await exec.enqueue(buildInput({ operationType: 'op' }))
    await exec.execute(r1)
    fn.mockClear()
    await exec.executeAll() // r1 is completed · skipped
    expect(fn).not.toHaveBeenCalled()
  })
})

// ─── Register validation ────────────────────────────────────────────

describe('InngestExecutor.register validation (extended)', () => {
  it('rejects negative backoff values', () => {
    const exec = new InngestExecutor()
    expect(() =>
      exec.register('op', async () => undefined, {
        retry: { maxAttempts: 3, initialBackoffMs: -1, maxBackoffMs: 100 },
      }),
    ).toThrow(/backoff values must be/)
  })

  it('rejects maxBackoffMs < initialBackoffMs', () => {
    const exec = new InngestExecutor()
    expect(() =>
      exec.register('op', async () => undefined, {
        retry: { maxAttempts: 3, initialBackoffMs: 1000, maxBackoffMs: 100 },
      }),
    ).toThrow(/maxBackoffMs must be >=/)
  })
})

// ─── Type-only sanity ─────────────────────────────────────────────

describe('InngestExecutor · type compatibility', () => {
  it('handler receives the typed payload', async () => {
    const spy = makeSleepSpy()
    const exec = new InngestExecutor({ sleep: spy.sleep })
    let observed: { id: number } | undefined
    const handler = async (
      payload: { id: number },
      _step: StepRunner,
    ): Promise<string> => {
      observed = payload
      return `id=${payload.id}`
    }
    exec.register<{ id: number }, string>('op', handler, {
      retry: defaultRetry,
    })
    const runId = await exec.enqueue<{ id: number }>(
      buildInput<{ id: number }>({
        operationType: 'op',
        payload: { id: 42 },
      }),
    )
    await exec.execute(runId)
    expect(observed).toEqual({ id: 42 })
    expect(exec.getOutput(runId)).toBe('id=42')
  })
})
