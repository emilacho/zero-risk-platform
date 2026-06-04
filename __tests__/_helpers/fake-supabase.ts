/**
 * Canon canonical · FakeSupabase chainable mock for sala-event-log adapter tests.
 *
 * Implements the subset of the Supabase JS client interface that the
 * `SupabaseEventLogStorage` adapter uses:
 *   - `from(table)` returns a query builder
 *   - INSERT chain: `.insert(payload).select().single()`
 *   - SELECT chain: `.select(cols).eq().eq().in().gte().lt().order().order().limit().maybeSingle?()`
 *
 * Behavior · the fake maintains an in-memory `rows` array + a queue of
 * canned responses. Each TERMINAL call (`single`, `maybeSingle`, awaited
 * builder) either executes against `rows` OR returns the next queued
 * response if one is set.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface FakeResponse {
  data?: unknown
  error?: { code?: string; message: string }
}

type Op = 'insert' | 'select'

interface ChainState {
  table: string
  op: Op
  insertPayload?: unknown
  selectCols?: string
  eqFilters: Array<{ col: string; val: unknown }>
  inFilters: Array<{ col: string; vals: unknown[] }>
  gte?: { col: string; val: unknown }
  lt?: { col: string; val: unknown }
  orders: Array<{ col: string; ascending: boolean }>
  limit?: number
}

function freshState(table: string): ChainState {
  return {
    table,
    op: 'select',
    eqFilters: [],
    inFilters: [],
    orders: [],
  }
}

export interface FakeRpcCall {
  fn: string
  args: Record<string, unknown> | undefined
}

export interface FakeSupabaseControls {
  /** Add a row to the in-memory backing (canon canonical mimic INSERT side-effect). */
  push(row: Record<string, unknown>): void
  /** Force the NEXT terminal call to return this response · canon · regardless of operation. */
  queueResponse(r: FakeResponse): void
  /** Force the NEXT terminal call that matches the predicate. */
  queueResponseIf(
    predicate: (state: ChainState) => boolean,
    response: FakeResponse,
  ): void
  /** Read the recorded call log (canon canon-canon-canon-test inspection). */
  calls: ChainState[]
  /** Read current rows. */
  rows: Record<string, unknown>[]
  /** Reset all state. */
  reset(): void
  /**
   * Track M canon canonical · register an RPC handler. The adapter probes
   * the schema by calling `rpc('sala_event_log_allocate_sequence', { p_stream_id })`.
   * Tests set this to simulate either (a) the RPC being present (return data) or
   * (b) the RPC being absent (return error with code PGRST202).
   */
  setRpcHandler(
    fn: string,
    handler: (args: Record<string, unknown> | undefined) => FakeResponse,
  ): void
  /** Track M canon · log of every rpc() call · canon canon-canonical-inspection. */
  rpcCalls: FakeRpcCall[]
}

export function createFakeSupabase(): {
  client: SupabaseClient
  controls: FakeSupabaseControls
} {
  const rows: Record<string, unknown>[] = []
  const calls: ChainState[] = []
  const queuedResponses: Array<{
    predicate?: (state: ChainState) => boolean
    response: FakeResponse
    used: boolean
  }> = []

  function pickQueuedResponse(state: ChainState): FakeResponse | null {
    for (const q of queuedResponses) {
      if (q.used) continue
      if (q.predicate && !q.predicate(state)) continue
      q.used = true
      return q.response
    }
    return null
  }

  function executeSelect(state: ChainState): FakeResponse {
    let result = rows.filter((r) => r.__table === state.table)
    for (const f of state.eqFilters) {
      result = result.filter((r) => r[f.col] === f.val)
    }
    for (const f of state.inFilters) {
      result = result.filter((r) => f.vals.includes(r[f.col]))
    }
    if (state.gte) {
      result = result.filter((r) => (r[state.gte!.col] as string) >= (state.gte!.val as string))
    }
    if (state.lt) {
      result = result.filter((r) => (r[state.lt!.col] as string) < (state.lt!.val as string))
    }
    for (const o of state.orders.slice().reverse()) {
      result = [...result].sort((a, b) => {
        const av = a[o.col] as never
        const bv = b[o.col] as never
        if (av === bv) return 0
        if (o.ascending) return av < bv ? -1 : 1
        return av > bv ? -1 : 1
      })
    }
    if (typeof state.limit === 'number') {
      result = result.slice(0, state.limit)
    }
    // canon canon · canon canon-canon-canon-strip internal table marker
    const stripped = result.map((r) => {
      const { __table: _t, ...rest } = r
      void _t
      return rest
    })
    return { data: stripped }
  }

  function executeInsert(state: ChainState): FakeResponse {
    const payload = state.insertPayload as Record<string, unknown>
    // canon · canon canon-canon-canon-mimic UNIQUE constraints
    if (
      typeof payload.tenant_id === 'string' &&
      typeof payload.idempotency_key === 'string'
    ) {
      const dup = rows.find(
        (r) =>
          r.__table === state.table &&
          r.tenant_id === payload.tenant_id &&
          r.idempotency_key === payload.idempotency_key,
      )
      if (dup) {
        return {
          error: {
            code: '23505',
            message: `duplicate key value violates unique constraint "sala_event_log_idempotency_key_key"`,
          },
        }
      }
    }
    if (
      typeof payload.stream_id === 'string' &&
      typeof payload.sequence === 'number'
    ) {
      const seqDup = rows.find(
        (r) =>
          r.__table === state.table &&
          r.stream_id === payload.stream_id &&
          r.sequence === payload.sequence,
      )
      if (seqDup) {
        return {
          error: {
            code: '23505',
            message: `duplicate key value violates unique constraint "sala_event_log_stream_sequence_unique"`,
          },
        }
      }
    }
    const inserted = { ...payload, __table: state.table, event_id: payload.event_id ?? 'evt_' + Math.random().toString(36).slice(2) }
    rows.push(inserted)
    const { __table: _t, ...rest } = inserted
    void _t
    return { data: rest }
  }

  function makeBuilder(state: ChainState): unknown {
    const builder: Record<string, unknown> = {
      select(cols?: string) {
        state.selectCols = cols ?? '*'
        return builder
      },
      insert(payload: unknown) {
        state.op = 'insert'
        state.insertPayload = payload
        return builder
      },
      eq(col: string, val: unknown) {
        state.eqFilters.push({ col, val })
        return builder
      },
      in(col: string, vals: unknown[]) {
        state.inFilters.push({ col, vals })
        return builder
      },
      gte(col: string, val: unknown) {
        state.gte = { col, val }
        return builder
      },
      lt(col: string, val: unknown) {
        state.lt = { col, val }
        return builder
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.orders.push({ col, ascending: opts?.ascending !== false })
        return builder
      },
      limit(n: number) {
        state.limit = n
        return builder
      },
      single() {
        calls.push({ ...state })
        const q = pickQueuedResponse(state)
        if (q) return Promise.resolve(q)
        if (state.op === 'insert') {
          return Promise.resolve(executeInsert(state))
        }
        const r = executeSelect(state)
        const first = (r.data as unknown[])?.[0] ?? null
        if (!first) {
          return Promise.resolve({
            error: { code: 'PGRST116', message: 'No rows found (canonical-single)' },
          })
        }
        return Promise.resolve({ data: first })
      },
      maybeSingle() {
        calls.push({ ...state })
        const q = pickQueuedResponse(state)
        if (q) return Promise.resolve(q)
        if (state.op === 'insert') {
          const ins = executeInsert(state)
          return Promise.resolve(ins)
        }
        const r = executeSelect(state)
        const first = (r.data as unknown[])?.[0] ?? null
        return Promise.resolve({ data: first })
      },
      then(onfulfilled: (r: FakeResponse) => unknown, onrejected?: (e: unknown) => unknown) {
        // canon · canon canon-canon-canon-treat awaited builder (no terminal) as select-all-matching
        calls.push({ ...state })
        const q = pickQueuedResponse(state)
        if (q) return Promise.resolve(q).then(onfulfilled, onrejected)
        return Promise.resolve(executeSelect(state)).then(onfulfilled, onrejected)
      },
    }
    return builder
  }

  // Track M canon canonical · RPC handlers registry · canon-canonical-default
  // canon-NO handler set · canon-canonical-returns PGRST202 (function not found)
  // canon-canonical-canon-this means existing tests AUTO-fallback to optimistic
  // canon-canonical-preserving their behaviour.
  const rpcHandlers: Map<string, (args: Record<string, unknown> | undefined) => FakeResponse> = new Map()
  const rpcCalls: FakeRpcCall[] = []

  const client = {
    from(table: string) {
      return makeBuilder(freshState(table))
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      const handler = rpcHandlers.get(fn)
      const response: FakeResponse = handler
        ? handler(args)
        : {
            data: null,
            error: {
              code: 'PGRST202',
              message: `Could not find the function public.${fn}(...) in the schema cache`,
            },
          }
      // canon · supabase-js .rpc() is awaitable directly · canon-canonical-emulate that
      return {
        then(onfulfilled: (r: FakeResponse) => unknown, onrejected?: (e: unknown) => unknown) {
          return Promise.resolve(response).then(onfulfilled, onrejected)
        },
      }
    },
  } as unknown as SupabaseClient

  const controls: FakeSupabaseControls = {
    push(row) {
      const r = { ...row, __table: row.__table ?? 'sala_event_log' }
      rows.push(r)
    },
    queueResponse(response) {
      queuedResponses.push({ response, used: false })
    },
    queueResponseIf(predicate, response) {
      queuedResponses.push({ predicate, response, used: false })
    },
    calls,
    rows,
    reset() {
      rows.length = 0
      calls.length = 0
      queuedResponses.length = 0
      rpcHandlers.clear()
      rpcCalls.length = 0
    },
    setRpcHandler(fn, handler) {
      rpcHandlers.set(fn, handler)
    },
    rpcCalls,
  }

  return { client, controls }
}
