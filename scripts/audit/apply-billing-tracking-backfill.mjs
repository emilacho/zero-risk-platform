#!/usr/bin/env node
/**
 * Sprint 7.7 Track D3 · billing tracking backfill via Supabase JS.
 *
 * Mimics canonical SQL migration `202605230001_billing_tracking_fix.sql`
 * vía supabase-js (no direct PG access en this environment). Idempotent ·
 * safe to re-run · uses metadata `client_id_resolution.sprint` marker para
 * skip rows ya backfilled.
 *
 * Steps ·
 *   1. Fetch all NULL-client invocations
 *   2. Per-row · attempt FK lookup chain · journey_executions →
 *      workflow_executions (if exists) → onboarding_sessions → session_resume
 *   3. UPDATE matched rows con resolved client_id + metadata annotation
 *   4. Annotate daemon system rows con NULL canonical
 *   5. Replace model='unknown' literal con 'daemon-internal'
 *   6. Annotate remaining orphans
 *
 * Output · summary JSON stdout · rows updated por source.
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FATAL · need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const SPRINT_TAG = "7p7-track-d"
const summary = {
  total_null_rows_pre: 0,
  journey_recovered: 0,
  workflow_recovered: 0,
  onboarding_recovered: 0,
  session_resume_recovered: 0,
  daemon_system_annotated: 0,
  model_unknown_replaced: 0,
  orphan_annotated: 0,
  errors: [],
}

function log(msg) {
  console.error(`[backfill] ${new Date().toISOString().slice(11, 19)} · ${msg}`)
}

async function main() {
  // 0 · Fetch all NULL-client rows
  const { data: nullRows, error: fetchErr } = await supa
    .from("agent_invocations")
    .select("id, agent_id, model, session_id, task_id, workflow_execution_id, journey_id, metadata")
    .is("client_id", null)
  if (fetchErr) {
    log(`fetch error · ${fetchErr.message}`)
    process.exit(2)
  }
  summary.total_null_rows_pre = nullRows.length
  log(`fetched ${nullRows.length} NULL-client rows`)

  // 1 · Journey executions backfill
  const journeyIds = Array.from(new Set(nullRows.map((r) => r.journey_id).filter(Boolean)))
  if (journeyIds.length > 0) {
    const { data: journeys } = await supa
      .from("journey_executions")
      .select("id, client_id")
      .in("id", journeyIds)
    const journeyMap = new Map((journeys ?? []).map((j) => [j.id, j.client_id]).filter(([_, c]) => c))
    log(`journey_executions lookup · ${journeyMap.size} matches`)

    for (const row of nullRows) {
      if (!row.journey_id) continue
      const cid = journeyMap.get(row.journey_id)
      if (!cid) continue
      const newMeta = {
        ...(row.metadata ?? {}),
        client_id_resolution: {
          source: "backfill-journey-executions",
          sprint: SPRINT_TAG,
          backfilled_at: new Date().toISOString(),
        },
      }
      const { error } = await supa
        .from("agent_invocations")
        .update({ client_id: cid, metadata: newMeta })
        .eq("id", row.id)
      if (error) {
        summary.errors.push(`journey row ${row.id}: ${error.message}`)
      } else {
        summary.journey_recovered++
        row.client_id = cid // mutate local copy
      }
    }
  }

  // 2 · Workflow executions backfill (if table exists)
  const workflowExecIds = Array.from(
    new Set(nullRows.filter((r) => !r.client_id).map((r) => r.workflow_execution_id).filter(Boolean)),
  )
  if (workflowExecIds.length > 0) {
    const { data: workflows, error: wfErr } = await supa
      .from("workflow_executions")
      .select("id, client_id")
      .in("id", workflowExecIds)
    if (wfErr) {
      log(`workflow_executions table missing OR err · ${wfErr.message} · skip`)
    } else {
      const wfMap = new Map((workflows ?? []).map((w) => [w.id, w.client_id]).filter(([_, c]) => c))
      log(`workflow_executions lookup · ${wfMap.size} matches`)
      for (const row of nullRows) {
        if (row.client_id) continue
        if (!row.workflow_execution_id) continue
        const cid = wfMap.get(row.workflow_execution_id)
        if (!cid) continue
        const newMeta = {
          ...(row.metadata ?? {}),
          client_id_resolution: {
            source: "backfill-workflow-executions",
            sprint: SPRINT_TAG,
            backfilled_at: new Date().toISOString(),
          },
        }
        const { error } = await supa
          .from("agent_invocations")
          .update({ client_id: cid, metadata: newMeta })
          .eq("id", row.id)
        if (error) {
          summary.errors.push(`workflow row ${row.id}: ${error.message}`)
        } else {
          summary.workflow_recovered++
          row.client_id = cid
        }
      }
    }
  }

  // 3 · Onboarding sessions backfill (task_id puede ser onboarding_id)
  const taskIds = Array.from(
    new Set(nullRows.filter((r) => !r.client_id).map((r) => r.task_id).filter(Boolean)),
  )
  if (taskIds.length > 0) {
    const { data: onboardings } = await supa
      .from("onboarding_sessions")
      .select("id, client_id")
      .in("id", taskIds)
    const obMap = new Map((onboardings ?? []).map((o) => [o.id, o.client_id]).filter(([_, c]) => c))
    log(`onboarding_sessions lookup · ${obMap.size} matches`)
    for (const row of nullRows) {
      if (row.client_id) continue
      if (!row.task_id) continue
      const cid = obMap.get(row.task_id)
      if (!cid) continue
      const newMeta = {
        ...(row.metadata ?? {}),
        client_id_resolution: {
          source: "backfill-onboarding-sessions",
          sprint: SPRINT_TAG,
          backfilled_at: new Date().toISOString(),
        },
      }
      const { error } = await supa
        .from("agent_invocations")
        .update({ client_id: cid, metadata: newMeta })
        .eq("id", row.id)
      if (error) {
        summary.errors.push(`onboarding row ${row.id}: ${error.message}`)
      } else {
        summary.onboarding_recovered++
        row.client_id = cid
      }
    }
  }

  // 4 · Session resume backfill · find sibling invocations w/ same session_id que SI tienen client_id
  const sessionIds = Array.from(
    new Set(nullRows.filter((r) => !r.client_id).map((r) => r.session_id).filter(Boolean)),
  )
  if (sessionIds.length > 0) {
    const sessionMap = new Map()
    // Chunked lookup · 100 ids per query
    for (let i = 0; i < sessionIds.length; i += 100) {
      const chunk = sessionIds.slice(i, i + 100)
      const { data: siblings } = await supa
        .from("agent_invocations")
        .select("session_id, client_id")
        .in("session_id", chunk)
        .not("client_id", "is", null)
      for (const sib of siblings ?? []) {
        if (!sessionMap.has(sib.session_id) && sib.client_id) {
          sessionMap.set(sib.session_id, sib.client_id)
        }
      }
    }
    log(`session_resume lookup · ${sessionMap.size} matches`)
    for (const row of nullRows) {
      if (row.client_id) continue
      if (!row.session_id) continue
      const cid = sessionMap.get(row.session_id)
      if (!cid) continue
      const newMeta = {
        ...(row.metadata ?? {}),
        client_id_resolution: {
          source: "backfill-session-resume",
          sprint: SPRINT_TAG,
          backfilled_at: new Date().toISOString(),
        },
      }
      const { error } = await supa
        .from("agent_invocations")
        .update({ client_id: cid, metadata: newMeta })
        .eq("id", row.id)
      if (error) {
        summary.errors.push(`session row ${row.id}: ${error.message}`)
      } else {
        summary.session_resume_recovered++
        row.client_id = cid
      }
    }
  }

  // 5 · Annotate daemon system rows · client_id stays NULL canonically
  for (const row of nullRows) {
    if (row.client_id) continue
    const isDaemon = row.agent_id === "system" && row.metadata?.source === "daemon"
    if (!isDaemon) continue
    const newMeta = {
      ...(row.metadata ?? {}),
      client_id_resolution: {
        source: "system-overhead-cross-cliente",
        sprint: SPRINT_TAG,
        backfilled_at: new Date().toISOString(),
        note: "daemon-initiated · NO cliente owner · system overhead",
      },
    }
    const { error } = await supa
      .from("agent_invocations")
      .update({ metadata: newMeta })
      .eq("id", row.id)
    if (error) {
      summary.errors.push(`daemon row ${row.id}: ${error.message}`)
    } else {
      summary.daemon_system_annotated++
    }
  }

  // 6 · Replace model='unknown' con 'daemon-internal' sentinel
  for (const row of nullRows) {
    if (row.model !== "unknown") continue
    const isDaemon = row.metadata?.source === "daemon"
    if (!isDaemon) continue
    const newMeta = {
      ...(row.metadata ?? {}),
      model_resolution: {
        original_value: "unknown",
        replaced_with: "daemon-internal",
        sprint: SPRINT_TAG,
        note: "daemon writer cross-repo · fix tracked Sprint 8",
      },
    }
    const { error } = await supa
      .from("agent_invocations")
      .update({ model: "daemon-internal", metadata: newMeta })
      .eq("id", row.id)
    if (error) {
      summary.errors.push(`model-unknown row ${row.id}: ${error.message}`)
    } else {
      summary.model_unknown_replaced++
    }
  }

  // 7 · Annotate remaining orphans
  for (const row of nullRows) {
    if (row.client_id) continue
    const alreadyAnnotated = row.metadata?.client_id_resolution
    if (alreadyAnnotated) continue
    const newMeta = {
      ...(row.metadata ?? {}),
      client_id_resolution: {
        source: "no-upstream-evidence",
        sprint: SPRINT_TAG,
        backfilled_at: new Date().toISOString(),
        note: "orphan invocation · no FK matched · historical pre-Sprint-7.7 fix",
      },
    }
    const { error } = await supa
      .from("agent_invocations")
      .update({ metadata: newMeta })
      .eq("id", row.id)
    if (error) {
      summary.errors.push(`orphan row ${row.id}: ${error.message}`)
    } else {
      summary.orphan_annotated++
    }
  }

  // Final · re-fetch counts
  const { count: postNullCount } = await supa
    .from("agent_invocations")
    .select("id", { count: "exact", head: true })
    .is("client_id", null)
  summary.total_null_rows_post = postNullCount ?? 0

  const { count: postUnknownCount } = await supa
    .from("agent_invocations")
    .select("id", { count: "exact", head: true })
    .eq("model", "unknown")
  summary.model_unknown_remaining = postUnknownCount ?? 0

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  log(`UNCAUGHT · ${e.message}`)
  console.log(JSON.stringify({ ...summary, fatal_error: e.message }, null, 2))
  process.exit(99)
})
