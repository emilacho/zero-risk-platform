/**
 * Tests for src/lib/sala/g6/* · Track N prep escalón 4.
 *
 * Coverage ·
 * - RPC call shape (name + params)
 * - Mode hierarchy · shadow default · live opt-in · per-bucket
 *   shadow_mode_db overrides hook live
 * - Cap frena en shadow · would-block logged but ok=true
 * - Cap frena en live · ok=false when exhausted + bucket NOT db-shadow
 * - RPC errors fail-OPEN with warn
 * - RPC throws fail-OPEN with warn
 * - Unknown bucket fail-OPEN (RPC returns shadow_mode_db=true)
 * - createG6BudgetHook factory · default noop · enabled+supabase=real
 *   · enabled without supabase=noop+warn
 */
import { describe, it, expect, vi } from 'vitest'
import {
  G6_RPC_INCREMENT,
  SupabaseG6BudgetHook,
  createG6BudgetHook,
  type G6Logger,
  type SupabaseG6BudgetHookOptions,
} from '../src/lib/sala/g6'
import { noopBudgetHook } from '../src/lib/sala/budget-hook'

// ─── Helpers ────────────────────────────────────────────────────────

type RpcResult = {
  exhausted: boolean
  remaining_cost_usd: number | null
  remaining_steps: number | null
  shadow_mode_db: boolean
}

function stubSupabase(opts: {
  result?: RpcResult
  rpcError?: { message: string }
  throws?: Error
} = {}) {
  const rpc = vi.fn(async (_name: string, _params: unknown) => {
    if (opts.throws) throw opts.throws
    if (opts.rpcError) return { data: null, error: opts.rpcError }
    return { data: opts.result ? [opts.result] : null, error: null }
  })
  return {
    client: { rpc } as unknown as SupabaseG6BudgetHookOptions['supabase'],
    rpc,
  }
}

interface SpyLogger extends G6Logger {
  warns: Array<[string, Record<string, unknown> | undefined]>
  infos: Array<[string, Record<string, unknown> | undefined]>
}

function spyLogger(): SpyLogger {
  const warns: Array<[string, Record<string, unknown> | undefined]> = []
  const infos: Array<[string, Record<string, unknown> | undefined]> = []
  return {
    warn(msg: string, ctx?: Record<string, unknown>) {
      warns.push([msg, ctx])
    },
    info(msg: string, ctx?: Record<string, unknown>) {
      infos.push([msg, ctx])
    },
    warns,
    infos,
  }
}

// ─── RPC call shape ─────────────────────────────────────────────────

describe('SupabaseG6BudgetHook · RPC call shape', () => {
  it('calls increment_bucket_atomic with the canonical params', async () => {
    const s = stubSupabase({
      result: {
        exhausted: false,
        remaining_cost_usd: 99.5,
        remaining_steps: 999,
        shadow_mode_db: true,
      },
    })
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
    })
    await hook.checkAndIncrement('client:c-abc:onboard.brand', 0.25)
    expect(s.rpc).toHaveBeenCalledTimes(1)
    expect(s.rpc).toHaveBeenCalledWith(G6_RPC_INCREMENT, {
      p_bucket_key: 'client:c-abc:onboard.brand',
      p_cost_usd: 0.25,
    })
  })

  it('defaults cost to 0 when estimatedCostUsd is omitted', async () => {
    const s = stubSupabase({
      result: {
        exhausted: false,
        remaining_cost_usd: 10,
        remaining_steps: 10,
        shadow_mode_db: false,
      },
    })
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
    })
    await hook.checkAndIncrement('bucket-x')
    expect(s.rpc).toHaveBeenCalledWith(G6_RPC_INCREMENT, {
      p_bucket_key: 'bucket-x',
      p_cost_usd: 0,
    })
  })
})

// ─── Mode hierarchy ─────────────────────────────────────────────────

describe('SupabaseG6BudgetHook · mode hierarchy', () => {
  const exhaustedRow: RpcResult = {
    exhausted: true,
    remaining_cost_usd: 0,
    remaining_steps: 0,
    shadow_mode_db: false,
  }

  it('mode=shadow · exhausted bucket returns ok=true (cap frena en shadow · log-only)', async () => {
    const s = stubSupabase({ result: exhaustedRow })
    const log = spyLogger()
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'shadow',
      logger: log,
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    // Logged the would-block decision for observability.
    const wouldBlock = log.infos.find(([msg]) => msg === 'cap_would_block')
    expect(wouldBlock).toBeDefined()
    expect((wouldBlock?.[1] as Record<string, unknown>).enforced).toBe(false)
  })

  it('mode=live · exhausted bucket + DB shadow_mode=false → ok=false (enforce)', async () => {
    const s = stubSupabase({ result: exhaustedRow })
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bucket-exhausted')
    expect(result.remainingCostUsd).toBe(0)
    expect(result.remainingSteps).toBe(0)
  })

  it('mode=live · exhausted bucket + DB shadow_mode=true → ok=true (per-bucket overrides)', async () => {
    const s = stubSupabase({
      result: { ...exhaustedRow, shadow_mode_db: true },
    })
    const log = spyLogger()
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
      logger: log,
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    // Still logs the would-block decision · enforced=false.
    const wouldBlock = log.infos.find(([msg]) => msg === 'cap_would_block')
    expect(wouldBlock).toBeDefined()
    expect((wouldBlock?.[1] as Record<string, unknown>).enforced).toBe(false)
    expect((wouldBlock?.[1] as Record<string, unknown>).bucket_shadow_db).toBe(true)
  })

  it('mode=live · NOT exhausted · returns ok=true with remaining', async () => {
    const s = stubSupabase({
      result: {
        exhausted: false,
        remaining_cost_usd: 50,
        remaining_steps: 100,
        shadow_mode_db: false,
      },
    })
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
    })
    const result = await hook.checkAndIncrement('bucket-x', 5)
    expect(result.ok).toBe(true)
    expect(result.remainingCostUsd).toBe(50)
    expect(result.remainingSteps).toBe(100)
  })
})

// ─── Fail-open paths (§148 cap is safety net) ───────────────────────

describe('SupabaseG6BudgetHook · fail-open on errors', () => {
  it('rpc error · fail-OPEN with logged warn', async () => {
    const s = stubSupabase({ rpcError: { message: 'connection refused' } })
    const log = spyLogger()
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
      logger: log,
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    expect(result.reason).toContain('rpc-error')
    expect(log.warns.some(([msg]) => msg === 'rpc_error · fail_open')).toBe(true)
  })

  it('rpc throws · fail-OPEN with logged warn', async () => {
    const s = stubSupabase({ throws: new Error('network down') })
    const log = spyLogger()
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
      logger: log,
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    expect(result.reason).toContain('rpc-threw')
    expect(log.warns.some(([msg]) => msg === 'rpc_threw · fail_open')).toBe(true)
  })

  it('rpc returns no data (defensive · should not happen with real RPC) · fail-OPEN', async () => {
    const s = stubSupabase({ result: undefined })
    const log = spyLogger()
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
      logger: log,
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    expect(result.reason).toBe('no-rpc-row')
    expect(log.warns.some(([msg]) => msg === 'rpc_no_row · fail_open')).toBe(true)
  })

  it('handles single-object RPC return shape (not array)', async () => {
    const s = stubSupabase()
    s.rpc.mockResolvedValueOnce({
      data: {
        exhausted: false,
        remaining_cost_usd: 7,
        remaining_steps: 7,
        shadow_mode_db: false,
      } as unknown,
      error: null,
    } as never)
    const hook = new SupabaseG6BudgetHook({
      supabase: s.client,
      mode: 'live',
    })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true)
    expect(result.remainingCostUsd).toBe(7)
  })
})

// ─── Default mode (shadow) when constructor omits it ───────────────

describe('SupabaseG6BudgetHook · constructor defaults', () => {
  it('mode defaults to shadow when omitted', async () => {
    const s = stubSupabase({
      result: {
        exhausted: true,
        remaining_cost_usd: 0,
        remaining_steps: 0,
        shadow_mode_db: false,
      },
    })
    const hook = new SupabaseG6BudgetHook({ supabase: s.client })
    const result = await hook.checkAndIncrement('bucket-x')
    expect(result.ok).toBe(true) // shadow · never enforces
  })
})

// ─── createG6BudgetHook factory ────────────────────────────────────

describe('createG6BudgetHook factory', () => {
  it('returns noopBudgetHook by default (env not set)', () => {
    const prev = process.env.SALA_G6_HOOK_ENABLED
    delete process.env.SALA_G6_HOOK_ENABLED
    try {
      const hook = createG6BudgetHook()
      expect(hook).toBe(noopBudgetHook)
    } finally {
      if (prev !== undefined) process.env.SALA_G6_HOOK_ENABLED = prev
    }
  })

  it('returns SupabaseG6BudgetHook when enabled=true + supabase provided', () => {
    const s = stubSupabase()
    const hook = createG6BudgetHook({ enabled: true, supabase: s.client })
    expect(hook).toBeInstanceOf(SupabaseG6BudgetHook)
  })

  it('returns noopBudgetHook with warn when enabled=true but no supabase', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const hook = createG6BudgetHook({ enabled: true })
      expect(hook).toBe(noopBudgetHook)
      expect(warnSpy).toHaveBeenCalled()
      expect(warnSpy.mock.calls[0]?.[0]).toContain('no supabase client')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('reads SALA_G6_HOOK_ENABLED env when input.enabled omitted', () => {
    const prev = process.env.SALA_G6_HOOK_ENABLED
    process.env.SALA_G6_HOOK_ENABLED = 'true'
    try {
      const s = stubSupabase()
      const hook = createG6BudgetHook({ supabase: s.client })
      expect(hook).toBeInstanceOf(SupabaseG6BudgetHook)
    } finally {
      if (prev !== undefined) process.env.SALA_G6_HOOK_ENABLED = prev
      else delete process.env.SALA_G6_HOOK_ENABLED
    }
  })

  it('reads SALA_G6_HOOK_MODE env when input.mode omitted', async () => {
    const prevEnabled = process.env.SALA_G6_HOOK_ENABLED
    const prevMode = process.env.SALA_G6_HOOK_MODE
    process.env.SALA_G6_HOOK_ENABLED = 'true'
    process.env.SALA_G6_HOOK_MODE = 'live'
    try {
      const s = stubSupabase({
        result: {
          exhausted: true,
          remaining_cost_usd: 0,
          remaining_steps: 0,
          shadow_mode_db: false,
        },
      })
      const hook = createG6BudgetHook({ supabase: s.client })
      const result = await hook.checkAndIncrement('bucket-x')
      expect(result.ok).toBe(false) // live mode kicked in via env
    } finally {
      if (prevEnabled !== undefined)
        process.env.SALA_G6_HOOK_ENABLED = prevEnabled
      else delete process.env.SALA_G6_HOOK_ENABLED
      if (prevMode !== undefined) process.env.SALA_G6_HOOK_MODE = prevMode
      else delete process.env.SALA_G6_HOOK_MODE
    }
  })

  it('defaults to shadow when SALA_G6_HOOK_MODE is anything but "live"', async () => {
    const prevEnabled = process.env.SALA_G6_HOOK_ENABLED
    const prevMode = process.env.SALA_G6_HOOK_MODE
    process.env.SALA_G6_HOOK_ENABLED = 'true'
    process.env.SALA_G6_HOOK_MODE = 'enforce-pls' // bogus → shadow
    try {
      const s = stubSupabase({
        result: {
          exhausted: true,
          remaining_cost_usd: 0,
          remaining_steps: 0,
          shadow_mode_db: false,
        },
      })
      const hook = createG6BudgetHook({ supabase: s.client })
      const result = await hook.checkAndIncrement('bucket-x')
      expect(result.ok).toBe(true) // shadow · never enforces
    } finally {
      if (prevEnabled !== undefined)
        process.env.SALA_G6_HOOK_ENABLED = prevEnabled
      else delete process.env.SALA_G6_HOOK_ENABLED
      if (prevMode !== undefined) process.env.SALA_G6_HOOK_MODE = prevMode
      else delete process.env.SALA_G6_HOOK_MODE
    }
  })
})
