#!/usr/bin/env node
/**
 * Snapshot · RLS state baseline · captura evidencia antes/después canon canonical
 *
 * Canon · spec-CC1-RLS-remediation-lockdown.md · Sprint 11 Ola 1 seguridad
 * Companion canónico de `scripts/smoke-rls-deny-all-verify.mts` ·
 *
 *   smoke-rls-deny-all-verify.mts  → ASSERT pass/fail post-migration (4 fases)
 *   smoke-rls-snapshot.mts (este)  → DUMP state · no assert · evidencia
 *                                     antes/después comparable side-by-side
 *
 * Uso canon canonical canon ·
 *   - PRE-migration  · esperás LEAK (anon SÍ lee/escribe) · baseline confirma
 *                      exposición activa CIC#2
 *   - POST-migration · esperás BLOCKED (anon denegado · svc OK · vistas filtran)
 *                      evidencia fix shipped
 *
 * Output canon · JSON structured a stdout · 1 línea por probe · easy to diff ·
 * + summary final con counts. Apropiado para canon canonical entrega evidencia
 * a Lenovo → Emilio §144.
 *
 * Pre-requisitos canon canonical ·
 *   - .env.local OR env vars con `NEXT_PUBLIC_SUPABASE_URL` +
 *     `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
 *   - Para branch de prueba · CIC#1 entrega connection string + anon key ·
 *     se pasan via env vars OR `.env.branch` file
 *
 * Usage canon canonical ·
 *   # Snapshot del branch de prueba canon canonical
 *   node --env-file=.env.branch scripts/smoke-rls-snapshot.mts --label pre-migration > evidence/branch-pre.json
 *   # (aplicar migration al branch via supabase CLI)
 *   node --env-file=.env.branch scripts/smoke-rls-snapshot.mts --label post-migration > evidence/branch-post.json
 *   # Diff canon canonical
 *   diff evidence/branch-pre.json evidence/branch-post.json
 *
 * NO modifica nada canon canonical · solo SELECT + INSERT-then-ROLLBACK pattern
 * (inserts canónicos retornan error si RLS lo bloquea · si NO bloquea · DELETE
 * inmediato canon canonical para zero residue).
 *
 * Exit code · siempre 0 (snapshot solo dumpea · NO valida · use smoke-rls-deny-
 * all-verify.mts canon canonical para assertions).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// =====================================================================
// Constants canon canonical · mismo set canon que smoke-rls-deny-all-verify
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

interface TableProbe {
  table: string
  anon_select: { ok: boolean; rows: number; error_code: string | null }
  anon_insert: { ok: boolean; error_code: string | null }
  anon_delete: { ok: boolean; error_code: string | null }
  svc_select: { ok: boolean; rows: number; error_code: string | null }
}

interface ViewProbe {
  view: string
  anon_select: { ok: boolean; rows: number; error_code: string | null }
  svc_select: { ok: boolean; rows: number; error_code: string | null }
}

// =====================================================================
// Pre-flight
// =====================================================================

function preflight(): { url: string; anon: string; svc: string; label: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon || !svc) {
    console.error(JSON.stringify({
      error: 'preflight_failed',
      detail: 'missing env · need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY',
    }))
    process.exit(1)
  }

  // Parse --label canon canonical (default 'snapshot')
  const labelIdx = process.argv.findIndex((a) => a === '--label')
  const label = labelIdx > 0 && process.argv[labelIdx + 1] ? process.argv[labelIdx + 1]! : 'snapshot'

  return { url, anon, svc, label }
}

// =====================================================================
// Probe canon canonical · per tabla 3 ops anon + 1 svc
// =====================================================================

async function probeTable(table: string, anon: SupabaseClient, svc: SupabaseClient): Promise<TableProbe> {
  // anon SELECT
  const aSel = await anon.from(table).select('*').limit(1)
  // anon INSERT (con marker · si pasa · DELETE inmediato)
  const insertMarker = `snapshot-evidence-${Date.now()}`
  const aIns = await anon.from(table).insert({ smoke_marker: insertMarker })
  let anonInsertOk = !aIns.error
  if (anonInsertOk) {
    // Cleanup inmediato canon canonical (raro · pero si RLS estaba off el row pasó)
    try { await svc.from(table).delete().eq('smoke_marker', insertMarker) } catch { /* no smoke_marker col */ }
  }
  // anon DELETE (sentinel UUID · no debería matchear nada)
  const aDel = await anon.from(table).delete().eq('id', '00000000-0000-0000-0000-000000000000')
  // svc SELECT (control · debe siempre funcionar)
  const sSel = await svc.from(table).select('*').limit(1)

  return {
    table,
    anon_select: {
      ok: !aSel.error,
      rows: aSel.data?.length ?? 0,
      error_code: aSel.error?.code ?? null,
    },
    anon_insert: {
      ok: anonInsertOk,
      error_code: aIns.error?.code ?? null,
    },
    anon_delete: {
      ok: !aDel.error,
      error_code: aDel.error?.code ?? null,
    },
    svc_select: {
      ok: !sSel.error,
      rows: sSel.data?.length ?? 0,
      error_code: sSel.error?.code ?? null,
    },
  }
}

async function probeView(view: string, anon: SupabaseClient, svc: SupabaseClient): Promise<ViewProbe> {
  const aSel = await anon.from(view).select('*').limit(1)
  const sSel = await svc.from(view).select('*').limit(1)

  return {
    view,
    anon_select: {
      ok: !aSel.error,
      rows: aSel.data?.length ?? 0,
      error_code: aSel.error?.code ?? null,
    },
    svc_select: {
      ok: !sSel.error,
      rows: sSel.data?.length ?? 0,
      error_code: sSel.error?.code ?? null,
    },
  }
}

// =====================================================================
// Main
// =====================================================================

async function main(): Promise<void> {
  const { url, anon, svc, label } = preflight()
  const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const svcClient = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })

  const startedAt = new Date().toISOString()
  const tableProbes: TableProbe[] = []
  const viewProbes: ViewProbe[] = []

  for (const table of TABLES_DENY_ALL) {
    tableProbes.push(await probeTable(table, anonClient, svcClient))
  }
  for (const view of VIEWS_SECURITY_INVOKER) {
    viewProbes.push(await probeView(view, anonClient, svcClient))
  }

  // Summary canon canonical
  const anonReadOK = tableProbes.filter((p) => p.anon_select.ok && p.anon_select.rows > 0).length
  const anonReadEmpty = tableProbes.filter((p) => p.anon_select.ok && p.anon_select.rows === 0).length
  const anonReadError = tableProbes.filter((p) => !p.anon_select.ok).length
  const anonWriteOK = tableProbes.filter((p) => p.anon_insert.ok).length
  const anonWriteBlocked = tableProbes.filter((p) => !p.anon_insert.ok).length
  const svcReadOK = tableProbes.filter((p) => p.svc_select.ok).length
  const svcReadFailed = tableProbes.filter((p) => !p.svc_select.ok).length

  const viewAnonReadWithData = viewProbes.filter((p) => p.anon_select.ok && p.anon_select.rows > 0).length
  const viewAnonReadEmpty = viewProbes.filter((p) => p.anon_select.ok && p.anon_select.rows === 0).length
  const viewAnonReadError = viewProbes.filter((p) => !p.anon_select.ok).length

  const output = {
    label,
    started_at: startedAt,
    supabase_url: url.replace(/^(https?:\/\/[^.]+).*/, '$1...(redacted)'),
    summary: {
      tables_tested: tableProbes.length,
      views_tested: viewProbes.length,
      anon_read: {
        ok_with_data: anonReadOK,
        ok_empty: anonReadEmpty,
        errored: anonReadError,
      },
      anon_write: {
        succeeded_LEAK: anonWriteOK,
        blocked: anonWriteBlocked,
      },
      svc_read: {
        ok: svcReadOK,
        failed: svcReadFailed,
      },
      views_anon_read: {
        with_data: viewAnonReadWithData,
        empty: viewAnonReadEmpty,
        errored: viewAnonReadError,
      },
    },
    interpretation: {
      anon_exposed_tables: tableProbes
        .filter((p) => p.anon_insert.ok || (p.anon_select.ok && p.anon_select.rows > 0))
        .map((p) => p.table),
      backend_intact: svcReadOK === tableProbes.length,
      views_filtering_to_anon: viewProbes
        .filter((p) => !p.anon_select.ok || p.anon_select.rows === 0)
        .map((p) => p.view),
      views_leaking_to_anon: viewProbes
        .filter((p) => p.anon_select.ok && p.anon_select.rows > 0)
        .map((p) => p.view),
    },
    table_probes: tableProbes,
    view_probes: viewProbes,
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((e) => {
  console.error(JSON.stringify({ error: 'snapshot_failed', detail: e instanceof Error ? e.message : String(e) }))
  process.exit(99)
})
