#!/usr/bin/env node
/**
 * 03 · Race-test · sequence allocation under concurrent writers
 *
 * Validates ADR-009 §sequence monotonic + Track J optimistic-concurrency pattern ·
 *   - N=10 parallel inserts to SAME stream_id · DIFFERENT idempotency_keys
 *   - Each insert allocates sequence via MAX(sequence)+1 + UNIQUE(stream_id, sequence)
 *   - canon · all 10 succeed via retry pattern (Sprint 13+ ships SECURITY DEFINER for higher cap)
 *   - canon · resulting sequences are {1..10} contiguous · NO gaps · NO duplicates
 *
 * §148 honest · canon-optimistic concurrency · retries may exhaust under HIGH contention.
 * Per Track J adapter default maxSequenceRetries=5. Canon · test cap = 10 concurrent writers.
 */
import { createHash } from 'node:crypto'
import { assertSafety, report, serviceClient, TABLE, newUuids } from './_lib.mjs'

assertSafety()

const HARNESS = '03-race-sequence'
const N = 10
const MAX_SEQUENCE_RETRIES = 8
const failures = []

function key(parts) {
  return createHash('sha256').update(parts.join('\n')).digest('hex')
}

async function insertWithSequenceRetry(svc, base, attempt = 1) {
  // canon canon-canon-allocate · SELECT MAX(sequence)+1 then INSERT · retry on 23505
  const { data: maxRow, error: maxErr } = await svc
    .from(TABLE)
    .select('sequence')
    .eq('stream_id', base.stream_id)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr && maxErr.code !== 'PGRST116') throw maxErr
  const next = (maxRow?.sequence ?? 0) + 1

  const { data, error } = await svc
    .from(TABLE)
    .insert({ ...base, sequence: next })
    .select('id, sequence')
    .single()

  if (error?.code === '23505' && attempt < MAX_SEQUENCE_RETRIES) {
    // canon-exponential jitter retry · sequence collision OR idempotency collision
    if (error.details?.includes('idempotency_key')) throw error // canon-dedup not retried
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 20))
    return insertWithSequenceRetry(svc, base, attempt + 1)
  }
  if (error) throw error
  return { id: data.id, sequence: data.sequence, attempts: attempt }
}

async function run() {
  const svc = serviceClient()
  const [tenant, client, stream, corr] = newUuids(4)

  // canon canon-launch N parallel inserts
  const tasks = Array.from({ length: N }, (_, i) => {
    const idempotency_key = key(['smoke.race', stream, String(i)])
    return insertWithSequenceRetry(svc, {
      tenant_id: tenant,
      client_id: client,
      stream_id: stream,
      correlation_id: corr,
      event_type: 'dispatch_requested',
      idempotency_key,
      logical_period: '2026-W23',
      payload: { harness: HARNESS, writer: i },
    })
  })

  const settled = await Promise.allSettled(tasks)

  const successes = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
  const errors = settled.filter((s) => s.status === 'rejected').map((s) => String(s.reason))

  if (successes.length !== N)
    failures.push({ step: 'all_succeed', expected: N, got: successes.length, errors: errors.slice(0, 3) })

  // canon canon-verify sequences {1..N} contiguous
  const { data: rows } = await svc
    .from(TABLE)
    .select('sequence')
    .eq('stream_id', stream)
    .order('sequence', { ascending: true })

  const sequences = (rows ?? []).map((r) => r.sequence)
  const expected = Array.from({ length: N }, (_, i) => i + 1)
  const match = JSON.stringify(sequences) === JSON.stringify(expected)
  if (!match)
    failures.push({ step: 'sequences_contiguous', expected, got: sequences })

  const maxAttempts = Math.max(...successes.map((s) => s.attempts), 0)

  // cleanup
  await svc.from(TABLE).delete().eq('stream_id', stream)

  report(HARNESS, {
    pass: failures.length === 0,
    failures,
    N,
    successes: successes.length,
    rejected: errors.length,
    max_retry_attempts: maxAttempts,
    sequences,
  })
}

run().catch((err) => {
  report(HARNESS, { pass: false, failures: [{ step: 'uncaught', error: String(err) }] })
})
