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

  // 1 · anon SELECT · expect EITHER silent RLS filter (0 rows) OR explicit DENY
  // §148 honest · migration §5 REVOKE ALL FROM anon · canonical belt-and-suspenders
  // produces explicit error 42501 (permission denied) · canon-canonical STRONGER posture
  // than silent filter · harness accepts both.
  let anonSelectMode = 'unknown'
  {
    const { data, error } = await anon.from(TABLE).select('event_id').limit(5)
    if (error) {
      // canon · explicit DENY (42501 permission denied · or RLS-equivalent error)
      const acceptableCodes = ['42501', 'PGRST301', 'PGRST116']
      const acceptablePatterns = /permission denied|RLS|row.level.security/i
      if (acceptableCodes.includes(error.code) || acceptablePatterns.test(error.message)) {
        anonSelectMode = `explicit_deny · ${error.code ?? 'no_code'} · ${error.message?.slice(0, 80)}`
      } else {
        failures.push({ step: 'anon_select', unexpected_error: error.message, code: error.code })
      }
    } else if (data && data.length > 0) {
      failures.push({ step: 'anon_select', got_rows: data.length, expected: 0 })
    } else {
      anonSelectMode = 'silent_filter · 0 rows'
    }
  }

  // canon · common required NOT NULL fields per migration §2 · journey_type +
  // operation_type · canon-canonical-§148 honest · harness inicial olvidó esos.
  const baseRow = {
    tenant_id: tenant,
    client_id: client,
    stream_id: stream,
    sequence: 1,
    correlation_id: corr,
    event_type: 'dispatch_requested',
    journey_type: 'SMOKE_TEST',
    operation_type: 'smoke.rls_deny',
    logical_period: '2026-W23',
    payload: { harness: HARNESS, smoke: true },
  }

  // 2 · anon INSERT · expect error (RLS blocks · canonical 401/403/42501)
  {
    const { error } = await anon.from(TABLE).insert({
      ...baseRow,
      idempotency_key: '0'.repeat(64),
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
        ...baseRow,
        idempotency_key,
      })
      .select('event_id')
      .single()
    if (error) failures.push({ step: 'svc_insert', error: error.message })
    else svcInsertedId = data?.event_id
  }

  // 4 · service_role SELECT · expect 1+ rows for this stream
  if (svcInsertedId) {
    const { data, error } = await svc
      .from(TABLE)
      .select('event_id, event_type, sequence')
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
    anon_select_mode: anonSelectMode,
    svc_inserted_event_id: svcInsertedId,
  })
}

run().catch((err) => {
  report(HARNESS, { pass: false, failures: [{ step: 'uncaught', error: String(err) }] })
})
