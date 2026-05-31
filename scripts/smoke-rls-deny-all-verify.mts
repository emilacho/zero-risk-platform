#!/usr/bin/env node
/**
 * Smoke · RLS deny-all lockdown verification · Sprint 11 Ola 1 seguridad
 *
 * Canon · spec-CC1-RLS-remediation-lockdown.md · post migration
 * 202605310010_rls_deny_all_lockdown.sql applied (staging primero · prod
 * post-staging-verde + Emilio §144 sign-off).
 *
 * UPDATE 2026-05-31 EOD · CIC#2 cerró hilo Realtime · NINGUNA de las 14 está
 * en supabase_realtime publication → canon canonical SIN excepción
 * anon-SELECT · cero impacto Realtime · agent_invocations + loyalty_balance
 * separate concerns OUT-OF-SCOPE este smoke.
 *
 * Evidence base · RESULTS-CIC2-RLS-advisor-evidence-2026-05-31.md
 *
 * Pre-requisitos canon canonical ·
 *   - Migración applied al target Supabase project
 *   - .env.local con NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY +
 *     SUPABASE_SERVICE_ROLE_KEY (canon canonical para roles ambos)
 *   - TARGET · default project del .env.local · staging primero canon canonical
 *
 * 4 fases canon canonical · ejecutadas en orden ·
 *
 *   FASE A · anon denied a las 14 tablas (read + write)
 *     - SELECT anon → expect denied (error OR data=[] depending Postgres behavior)
 *     - INSERT anon → expect denied (error 42501 canon)
 *     - DELETE anon → expect denied
 *
 *   FASE B · service_role bypass intacto (backend NO roto)
 *     - SELECT service_role en cada tabla → expect OK
 *     - INSERT service_role canonical sample → expect OK + cleanup inmediato
 *
 *   FASE C · 5 vistas SECURITY INVOKER · anon ya no ve PII subyacente
 *     - SELECT anon en active_journeys → expect denied OR data=[] (RLS subyacente)
 *     - SELECT anon en v_hitl_inbox · v_active_pipelines · v_agent_scorecards ·
 *       v_pending_improvements → expect denied OR data=[]
 *     - SELECT service_role en las 5 → expect OK (bypass RLS)
 *
 *   FASE D · final cleanup canon canonical (sweep test rows)
 *
 * Cero prod risk canon canonical · NO inserts persistentes · service_role inserts
 * usan key prefix 'smoke-rls-verify-' + cleanup automático Fase D.
 *
 * Usage canon canonical ·
 *   node --env-file=.env.local scripts/smoke-rls-deny-all-verify.mts
 *
 *   Skip cleanup (debug) · SKIP_CLEANUP=1
 *
 * Exit codes canon canonical ·
 *   0 · all fases pass · RLS lockdown VERIFIED · ready Emilio §144 prod approval
 *   1 · pre-flight env missing
 *   2 · FASE A FAIL · anon NO denegado · canon canonical lockdown roto P0
 *   3 · FASE B FAIL · service_role bypass roto · BACKEND BROKEN (CRITICAL · revert)
 *   4 · FASE C FAIL · vista SECURITY INVOKER no aplicada · PII potencial leak
 *   5 · cleanup error
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// =====================================================================
// Constants canon canonical · 14 tablas RLS deny-all
// =====================================================================

const TABLES_DENY_ALL = [
  'client_reports',
  'content_packages',
  'experiments',
  'rank_tracking_daily',
  'review_metrics',
  'seo_engagements',
  'social_metrics',
  'social_schedules',
  'workflow_checkpoints',
  'seo_deliverables',
  'analytics',
  'websites',
  'managed_agents_registry',
  'settings',
] as const

const VIEWS_SECURITY_INVOKER = [
  'active_journeys',
  'v_hitl_inbox',
  'v_active_pipelines',
  'v_agent_scorecards',
  'v_pending_improvements',
] as const

interface PhaseResult {
  phase: 'A' | 'B' | 'C' | 'D'
  name: string
  passed: boolean
  details: Record<string, unknown>
  duration_ms: number
}

// =====================================================================
// Pre-flight
// =====================================================================

function preflight(): { url: string; anon: string; svc: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon || !svc) {
    console.error('[smoke-rls] ❌ pre-flight FAIL · missing env vars · need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  return { url, anon, svc }
}

// =====================================================================
// FASE A · anon denied 14 tablas (SIN excepción canon canonical)
// =====================================================================

interface AnonProbe {
  table: string
  select_blocked: boolean
  insert_blocked: boolean
  delete_blocked: boolean
  select_error_or_empty: string
  insert_error: string
  delete_error: string
}

async function faseA(anon: SupabaseClient): Promise<PhaseResult> {
  const start = Date.now()
  console.log('\n[smoke-rls] FASE A · anon denied · 14 tablas RLS deny-all SIN excepción')

  const probes: AnonProbe[] = []
  for (const table of TABLES_DENY_ALL) {
    const probe: AnonProbe = {
      table,
      select_blocked: false,
      insert_blocked: false,
      delete_blocked: false,
      select_error_or_empty: '',
      insert_error: '',
      delete_error: '',
    }

    // SELECT · RLS deny → row count 0 OR explicit error 42501 (insufficient privilege)
    // Canon canonical Supabase behavior · post RLS-on sin policy · anon SELECT retorna
    // data=[] (rows filtered) OR error según policy. Cualquiera de los dos = denied.
    const sel = await anon.from(table).select('*').limit(1)
    if (sel.error) {
      probe.select_blocked = true
      probe.select_error_or_empty = `error:${sel.error.code ?? 'unknown'}`
    } else if (!sel.data || sel.data.length === 0) {
      probe.select_blocked = true
      probe.select_error_or_empty = 'empty_data_array_canon_RLS_filtered'
    } else {
      probe.select_blocked = false
      probe.select_error_or_empty = `LEAK rows=${sel.data.length}`
    }

    // INSERT · RLS deny + REVOKE → explicit error
    const ins = await anon.from(table).insert({ smoke_marker: 'smoke-rls-verify-anon-insert-test' })
    probe.insert_blocked = !!ins.error
    probe.insert_error = ins.error?.code ?? (ins.error?.message?.slice(0, 80) ?? 'NO_ERROR_LEAK')

    // DELETE · RLS deny + REVOKE → explicit error
    const del = await anon.from(table).delete().eq('id', '00000000-0000-0000-0000-000000000000')
    probe.delete_blocked = !!del.error
    probe.delete_error = del.error?.code ?? (del.error?.message?.slice(0, 80) ?? 'NO_ERROR_LEAK')

    probes.push(probe)
  }

  const allBlocked = probes.every(p => p.select_blocked && p.insert_blocked && p.delete_blocked)
  const leaks = probes.filter(p => !p.select_blocked || !p.insert_blocked || !p.delete_blocked)

  const details = {
    tables_tested: TABLES_DENY_ALL.length,
    all_three_ops_blocked: allBlocked,
    leak_count: leaks.length,
    leaks: leaks.slice(0, 5),
    sample_clean_probe: probes.find(p => p.select_blocked && p.insert_blocked && p.delete_blocked),
  }

  const passed = allBlocked
  console.log(`[smoke-rls] FASE A · ${passed ? '✅ PASS' : '❌ FAIL'} ·`, JSON.stringify(details))
  return { phase: 'A', name: 'anon denied 14 tablas', passed, details, duration_ms: Date.now() - start }
}

// =====================================================================
// FASE B · service_role bypass intacto (backend NO roto)
// =====================================================================

async function faseB(svc: SupabaseClient): Promise<PhaseResult> {
  const start = Date.now()
  console.log('\n[smoke-rls] FASE B · service_role bypass · backend intacto')

  const probes: Array<{ table: string; select_ok: boolean; error?: string }> = []

  for (const table of TABLES_DENY_ALL) {
    const sel = await svc.from(table).select('*').limit(1)
    probes.push({
      table,
      select_ok: !sel.error,
      error: sel.error?.code ?? sel.error?.message?.slice(0, 80),
    })
  }

  // Sample INSERT canon canonical en tabla settings (key-value · seed/delete safe)
  let insertOk = false
  let insertError = ''
  const sampleKey = `smoke-rls-verify-${Date.now()}`
  const insRes = await svc.from('settings').insert({
    key: sampleKey,
    value: 'smoke-rls-verify',
    category: 'general',
  })
  insertOk = !insRes.error
  if (!insertOk) insertError = insRes.error?.code ?? insRes.error?.message?.slice(0, 80) ?? 'unknown'

  // Cleanup inmediato canon canonical · NO persiste rows test
  if (insertOk) {
    await svc.from('settings').delete().eq('key', sampleKey)
  }

  const allSelectOk = probes.every(p => p.select_ok)
  const passed = allSelectOk && insertOk

  const details = {
    tables_tested: TABLES_DENY_ALL.length,
    all_select_ok: allSelectOk,
    select_failures: probes.filter(p => !p.select_ok).slice(0, 5),
    sample_insert_ok: insertOk,
    sample_insert_error: insertError || null,
    sample_insert_table: 'settings',
    canon_note: 'service_role bypasea RLS canon canonical Supabase default · backend SUPABASE_SERVICE_ROLE_KEY intacto',
  }

  console.log(`[smoke-rls] FASE B · ${passed ? '✅ PASS' : '❌ FAIL'} ·`, JSON.stringify(details))
  return { phase: 'B', name: 'service_role bypass intacto', passed, details, duration_ms: Date.now() - start }
}

// =====================================================================
// FASE C · 5 vistas SECURITY INVOKER · PII no expuesta a anon
// =====================================================================

async function faseC(anon: SupabaseClient, svc: SupabaseClient): Promise<PhaseResult> {
  const start = Date.now()
  console.log('\n[smoke-rls] FASE C · 5 vistas SECURITY INVOKER · anon no ve PII subyacente')

  const probes: Array<{ view: string; anon_blocked_or_empty: boolean; svc_ok: boolean; details: string }> = []

  for (const view of VIEWS_SECURITY_INVOKER) {
    // anon · expect denied OR empty (RLS subyacente applies via INVOKER)
    const anonRes = await anon.from(view).select('*').limit(1)
    const anonBlocked = anonRes.error !== null || (anonRes.data?.length ?? 0) === 0

    // service_role · expect OK (bypasses RLS)
    const svcRes = await svc.from(view).select('*').limit(1)
    const svcOk = !svcRes.error

    probes.push({
      view,
      anon_blocked_or_empty: anonBlocked,
      svc_ok: svcOk,
      details: `anon_err=${anonRes.error?.code ?? 'none'} anon_rows=${anonRes.data?.length ?? 0} svc_err=${svcRes.error?.code ?? 'none'}`,
    })
  }

  const allAnonBlocked = probes.every(p => p.anon_blocked_or_empty)
  const allSvcOk = probes.every(p => p.svc_ok)
  const passed = allAnonBlocked && allSvcOk

  const details = {
    views_tested: VIEWS_SECURITY_INVOKER.length,
    all_anon_blocked_or_empty: allAnonBlocked,
    all_svc_ok: allSvcOk,
    leaks: probes.filter(p => !p.anon_blocked_or_empty),
    svc_failures: probes.filter(p => !p.svc_ok),
    canon_note: 'SECURITY INVOKER · vistas respetan RLS de tablas base · anon no salta el filtro',
  }

  console.log(`[smoke-rls] FASE C · ${passed ? '✅ PASS' : '❌ FAIL'} ·`, JSON.stringify(details))
  return { phase: 'C', name: '5 vistas SECURITY INVOKER', passed, details, duration_ms: Date.now() - start }
}

// =====================================================================
// FASE D · final cleanup canon canonical (sweep test rows)
// =====================================================================

async function faseD(svc: SupabaseClient): Promise<PhaseResult> {
  const start = Date.now()
  console.log('\n[smoke-rls] FASE D · final cleanup canon canonical')

  const { error: delErr, count } = await svc
    .from('settings')
    .delete({ count: 'exact' })
    .like('key', 'smoke-rls-verify-%')

  const passed = !delErr
  const details = {
    settings_smoke_rows_deleted: count ?? 0,
    delete_error: delErr?.message?.slice(0, 100) ?? null,
  }

  console.log(`[smoke-rls] FASE D · ${passed ? '✅ PASS' : '❌ FAIL'} ·`, JSON.stringify(details))
  return { phase: 'D', name: 'cleanup canon canonical', passed, details, duration_ms: Date.now() - start }
}

// =====================================================================
// Main runner
// =====================================================================

async function main(): Promise<void> {
  console.log('[smoke-rls] === Sprint 11 Ola 1 · RLS deny-all lockdown verification ===')
  const { url, anon, svc } = preflight()

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const svcClient = createClient(url, svc, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const results: PhaseResult[] = []

  try {
    results.push(await faseA(anonClient))
    if (!results[0]!.passed) {
      console.error('[smoke-rls] ❌ FASE A FAIL · anon NO denegado · lockdown roto · canon §148 P0')
      await safeCleanup(svcClient)
      process.exit(2)
    }

    results.push(await faseB(svcClient))
    if (!results[results.length - 1]!.passed) {
      console.error('[smoke-rls] ❌ FASE B FAIL · service_role bypass ROTO · BACKEND BROKEN · revert mandatory canon §148 CRITICAL')
      await safeCleanup(svcClient)
      process.exit(3)
    }

    results.push(await faseC(anonClient, svcClient))
    if (!results[results.length - 1]!.passed) {
      console.error('[smoke-rls] ❌ FASE C FAIL · vista SECURITY INVOKER no aplicada · PII potencial leak')
      await safeCleanup(svcClient)
      process.exit(4)
    }

    if (process.env.SKIP_CLEANUP === '1') {
      console.log('[smoke-rls] FASE D SKIPPED · SKIP_CLEANUP=1')
    } else {
      results.push(await faseD(svcClient))
      if (!results[results.length - 1]!.passed) {
        console.error('[smoke-rls] ⚠ FASE D cleanup failed · orphan rows possible · revisar manualmente')
        process.exit(5)
      }
    }

    console.log('\n[smoke-rls] === SUMMARY ===')
    for (const r of results) {
      console.log(`  Fase ${r.phase} · ${r.name} · ${r.passed ? '✅' : '❌'} · ${r.duration_ms}ms`)
    }
    console.log('[smoke-rls] ✅ ALL PHASES PASS · RLS lockdown VERIFIED canon canonical · ready Emilio §144 prod approval')
    process.exit(0)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[smoke-rls] ❌ UNCAUGHT EXCEPTION ·', msg)
    await safeCleanup(svcClient)
    process.exit(99)
  }
}

async function safeCleanup(svc: SupabaseClient): Promise<void> {
  if (process.env.SKIP_CLEANUP === '1') return
  try {
    await svc.from('settings').delete().like('key', 'smoke-rls-verify-%')
  } catch (e) {
    console.warn('[smoke-rls] safe cleanup error:', e instanceof Error ? e.message : String(e))
  }
}

main().catch((e) => {
  console.error('[smoke-rls] fatal:', e)
  process.exit(99)
})
