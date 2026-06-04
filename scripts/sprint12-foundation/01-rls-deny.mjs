#!/usr/bin/env node
/**
 * 01 · RLS · anon DENIED · service_role OK
 *
 * Validates ADR-009 §5 RLS posture · canon ·
 *   - anon SELECT  → 0 rows (RLS silently filters · NO error)
 *   - anon INSERT  → 401/403 (RLS blocks · explicit error)
 *   - service_role SELECT/INSERT → OK
 */
import { anonClient, assertSafety, report, serviceClient, TABLE, newUuids } from './_lib.mjs'

assertSafety()

const HARNESS = '01-rls-deny'
const failures = []

async function run() {
  const anon = anonClient()
  const svc = serviceClient()

  const [tenant, client, stream, corr] = newUuids(4)

  // 1 · anon SELECT · expect 0 rows (RLS filters · NO row visible)
  {
    const { data, error } = await anon.from(TABLE).select('id').limit(5)
    if (error) {
      failures.push({ step: 'anon_select', error: error.message })
    } else if (data && data.length > 0) {
      failures.push({ step: 'anon_select', got_rows: data.length, expected: 0 })
    }
  }

  // 2 · anon INSERT · expect error (RLS blocks · canonical 401/403/42501)
  {
    const { error } = await anon.from(TABLE).insert({
      tenant_id: tenant,
      client_id: client,
      stream_id: stream,
      sequence: 1,
      correlation_id: corr,
      event_type: 'dispatch_requested',
      idempotency_key: '0'.repeat(64),
      logical_period: '2026-W23',
      payload: {},
    })
    if (!error) {
      failures.push({ step: 'anon_insert', expected: 'rls_error', got: 'no_error' })
    }
  }

  // 3 · service_role INSERT · expect OK
  let svcInsertedId = null
  {
    const idempotency_key = '0'.repeat(64).slice(0, -6) + 'rls001'
    const { data, error } = await svc
      .from(TABLE)
      .insert({
        tenant_id: tenant,
        client_id: client,
        stream_id: stream,
        sequence: 1,
        correlation_id: corr,
        event_type: 'dispatch_requested',
        idempotency_key,
        logical_period: '2026-W23',
        payload: { harness: HARNESS, smoke: true },
      })
      .select('id')
      .single()
    if (error) failures.push({ step: 'svc_insert', error: error.message })
    else svcInsertedId = data?.id
  }

  // 4 · service_role SELECT · expect 1+ rows for this stream
  if (svcInsertedId) {
    const { data, error } = await svc
      .from(TABLE)
      .select('id, event_type, sequence')
      .eq('stream_id', stream)
    if (error) failures.push({ step: 'svc_select', error: error.message })
    else if (!data || data.length < 1)
      failures.push({ step: 'svc_select', got_rows: data?.length ?? 0, expected: '>=1' })
  }

  // 5 · cleanup · canon canon-NO leftover rows for this synthetic stream
  if (svcInsertedId) {
    await svc.from(TABLE).delete().eq('stream_id', stream)
  }

  report(HARNESS, {
    pass: failures.length === 0,
    failures,
    tenant_id: tenant,
    stream_id: stream,
  })
}

run().catch((err) => {
  report(HARNESS, { pass: false, failures: [{ step: 'uncaught', error: String(err) }] })
})
