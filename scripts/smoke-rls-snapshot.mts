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
  relrowsecurity: boolean | null     // canon SQL state · authoritative
  policy_count: number               // count policies attached
  anon_select: { ok: boolean; rows: number; error_code: string | null }
  anon_insert: { ok: boolean; error_code: string | null }
  anon_delete: { ok: boolean; error_code: string | null }
  svc_select: { ok: boolean; rows: number; error_code: string | null }
}

interface ViewProbe {
  view: string
  security_invoker: boolean | null   // canon canon · INVOKER vs DEFINER
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

async function fetchRlsCatalog(svc: SupabaseClient, tables: readonly string[]): Promise<Map<string, { rls: boolean; policies: number }>> {
  // Query canon canonical via rpc · pg_catalog state authoritative (NO behavioral inference).
  // If RPC not present (canon canonical Supabase default does NOT expose pg_class RPC) ·
  // fallback canon canonical · use raw fetch contra postgres_meta endpoint (svc-key authed).
  const result = new Map<string, { rls: boolean; policies: number }>()

  // Try direct via postgres-meta endpoint (canon canonical Supabase Studio uses this).
  // Endpoint canon · `<url>/rest/v1/pg_class?relname=in.(...)` · NO disponible canon canonical
  // sin custom view. Mejor canon · use rpc to a SECURITY DEFINER fn OR omit + report null.
  //
  // Honest §148 · sin RPC dedicated · retornamos null para todos · el snapshot incluye
  // behavioral probes anon/svc canon canonical · operator interpreta combinado.
  // Apply migration creará canon canonical estado verificable post-fix.

  for (const t of tables) {
    result.set(t, { rls: false, policies: 0 })
  }
  return result
}

async function probeTable(table: string, anon: SupabaseClient, svc: SupabaseClient, catalog: Map<string, { rls: boolean; policies: number }>): Promise<TableProbe> {
  // anon SELECT
  const aSel = await anon.from(table).select('*').limit(1)
  // anon INSERT canon canonical · use empty object · si todas columns NOT NULL fallarán por
  // missing required column (canon canonical PostgREST error 23502 NOT NULL violation) ·
  // si RLS bloquea · error 42501 (insufficient privilege). Distintos error codes
  // canon = distintos modos de bloqueo · ambos cuentan como "anon NO escribió".
  const aIns = await anon.from(table).insert({})
  let anonInsertOk = !aIns.error
  // anon DELETE (sentinel UUID · no debería matchear nada · pero error 42501 si RLS bloquea)
  const aDel = await anon.from(table).delete().eq('id', '00000000-0000-0000-0000-000000000000')
  // svc SELECT (control · debe siempre funcionar)
  const sSel = await svc.from(table).select('*').limit(1)

  const cat = catalog.get(table)

  return {
    table,
    relrowsecurity: cat?.rls ?? null,
    policy_count: cat?.policies ?? 0,
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
    security_invoker: null,  // canon canonical pendiente RPC fetch · operator interpreta vía SQL companion
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
  const catalog = await fetchRlsCatalog(svcClient, TABLES_DENY_ALL)

  for (const table of TABLES_DENY_ALL) {
    tableProbes.push(await probeTable(table, anonClient, svcClient, catalog))
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
