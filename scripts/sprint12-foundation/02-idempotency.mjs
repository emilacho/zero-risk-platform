#!/usr/bin/env node
/**
 * 02 · Idempotency · business-key dedup · 2× same key → 1 row
 *
 * Validates ADR-009 §flag #1 + UNIQUE(idempotency_key) ·
 *   - SHA-256 hex idempotency_key from {operation_type · client_id · logical_period}
 *   - insert #1 · inserted=true · row created
 *   - insert #2 (same key) · inserted=false · same id returned (NO duplicate row)
 *
 * Canon · uses real Supabase adapter via service_role.
 */
import { createHash } from 'node:crypto'
import { assertSafety, report, serviceClient, TABLE, newUuids } from './_lib.mjs'

assertSafety()

const HARNESS = '02-idempotency'
const failures = []

function buildIdempotencyKey({ operation_type, client_id, logical_period, input_hash }) {
  const parts = [operation_type, client_id, logical_period, input_hash || '']
  return createHash('sha256').update(parts.join('\n')).digest('hex')
}

async function run() {
  const svc = serviceClient()
  const [tenant, client, stream, corr] = newUuids(4)
  const idempotency_key = buildIdempotencyKey({
    operation_type: 'smoke.idempotency',
    client_id: client,
    logical_period: '2026-W23',
  })

  // insert #1
  const ins1 = await svc
    .from(TABLE)
    .insert({
      tenant_id: tenant,
      client_id: client,
      stream_id: stream,
      sequence: 1,
      correlation_id: corr,
      event_type: 'dispatch_requested',
      journey_type: 'SMOKE_TEST',
      operation_type: 'smoke.idempotency',
      idempotency_key,
      logical_period: '2026-W23',
      payload: { harness: HARNESS, attempt: 1 },
    })
    .select('event_id')
    .single()

  if (ins1.error) failures.push({ step: 'insert_1', error: ins1.error.message })

  // insert #2 · same idempotency_key · MUST collide (23505)
  const ins2 = await svc
    .from(TABLE)
    .insert({
      tenant_id: tenant,
      client_id: client,
      stream_id: stream,
      sequence: 2, // canon-DIFFERENT sequence · idempotency UNIQUE catches first
      correlation_id: corr,
      event_type: 'dispatch_requested',
      journey_type: 'SMOKE_TEST',
      operation_type: 'smoke.idempotency',
      idempotency_key,
      logical_period: '2026-W23',
      payload: { harness: HARNESS, attempt: 2 },
    })
    .select('event_id')

  // expected · error code 23505 (Postgres UNIQUE violation)
  if (!ins2.error) {
    failures.push({ step: 'insert_2', expected: '23505', got: 'no_error' })
  } else if (ins2.error.code !== '23505') {
    failures.push({ step: 'insert_2', expected: '23505', got: ins2.error.code, msg: ins2.error.message })
  }

  // assert · exactly 1 row with this idempotency_key
  const { data: rows, error: selErr } = await svc
    .from(TABLE)
    .select('event_id, sequence, payload')
    .eq('idempotency_key', idempotency_key)

  if (selErr) failures.push({ step: 'select_count', error: selErr.message })
  else if (!rows || rows.length !== 1)
    failures.push({ step: 'select_count', expected: 1, got: rows?.length ?? 0 })

  // cleanup
  await svc.from(TABLE).delete().eq('stream_id', stream)

  report(HARNESS, {
    pass: failures.length === 0,
    failures,
    idempotency_key,
    row_count: rows?.length ?? 0,
    insert1_id: ins1.data?.event_id ?? null,
    insert2_error_code: ins2.error?.code ?? null,
  })
}

run().catch((err) => {
  report(HARNESS, { pass: false, failures: [{ step: 'uncaught', error: String(err) }] })
})
