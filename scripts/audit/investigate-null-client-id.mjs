#!/usr/bin/env node
/**
 * Sprint 7.7 Track D1 · investigate which invocations have client_id NULL.
 *
 * For each NULL row · capture · agent slug · model · started_at · status ·
 * tokens · related campaign_execution_id / journey_execution_id (if FK exists)
 * · pipeline_id (if column exists) · caller hint.
 *
 * Output · stdout JSON grouped by agent + day para identify code paths
 * upstream que omiten client_id.
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("FATAL · need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

async function main() {
  // Fetch schema first via meta query · find which columns exist
  const { data: sample, error: sampleErr } = await supa
    .from("agent_invocations")
    .select("*")
    .is("client_id", null)
    .order("started_at", { ascending: false })
    .limit(1)
  if (sampleErr) {
    console.error("schema probe error:", sampleErr.message)
    process.exit(2)
  }
  console.error("=== columns en agent_invocations ===")
  console.error(Object.keys(sample?.[0] ?? {}).join(", "))
  console.error("")

  // Fetch all NULL-client rows
  const { data: rows, error } = await supa
    .from("agent_invocations")
    .select("*")
    .is("client_id", null)
    .order("started_at", { ascending: false })
    .limit(200)
  if (error) {
    console.error("fetch error:", error.message)
    process.exit(3)
  }

  // Resolve agent slugs
  const agentIds = Array.from(new Set(rows.map((r) => r.agent_id).filter(Boolean)))
  const { data: agents } = await supa.from("agents").select("id, name").in("id", agentIds)
  const slugMap = new Map((agents ?? []).map((a) => [a.id, a.name]))

  // Group by agent + model + day
  const byAgent = new Map()
  const byModel = new Map()
  const byDay = new Map()
  const byStatus = new Map()
  for (const r of rows) {
    const slug = slugMap.get(r.agent_id) ?? r.agent_id ?? "unknown"
    const model = r.model ?? "unknown"
    const day = (r.started_at ?? "").slice(0, 10)
    const status = r.status ?? "unknown"
    const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1)
    inc(byAgent, slug)
    inc(byModel, model)
    inc(byDay, day)
    inc(byStatus, status)
  }

  // Look for related FK columns
  const sampleKeys = Object.keys(rows[0] ?? {})
  const fkColumns = sampleKeys.filter((k) => k.endsWith("_id") || k === "session_id")

  // Per-row representative samples (5 most recent)
  const samples = rows.slice(0, 10).map((r) => {
    const obj = { agent: slugMap.get(r.agent_id) ?? r.agent_id, model: r.model, status: r.status, started_at: r.started_at }
    for (const k of fkColumns) {
      if (r[k] !== null && r[k] !== undefined) obj[k] = r[k]
    }
    return obj
  })

  console.log(
    JSON.stringify(
      {
        total_null_rows: rows.length,
        fk_columns_available: fkColumns,
        by_agent: Object.fromEntries(byAgent),
        by_model: Object.fromEntries(byModel),
        by_day: Object.fromEntries(byDay),
        by_status: Object.fromEntries(byStatus),
        samples,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error("UNCAUGHT", e.message)
  process.exit(99)
})
