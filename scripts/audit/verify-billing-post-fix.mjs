import { createClient } from "@supabase/supabase-js"
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { count: unknownCount } = await supa
  .from("agent_invocations")
  .select("id", { count: "exact", head: true })
  .eq("model", "unknown")
const { count: daemonInternalCount } = await supa
  .from("agent_invocations")
  .select("id", { count: "exact", head: true })
  .eq("model", "daemon-internal")
const { count: nullClientCount } = await supa
  .from("agent_invocations")
  .select("id", { count: "exact", head: true })
  .is("client_id", null)
const { count: daemonAnnotated } = await supa
  .from("agent_invocations")
  .select("id", { count: "exact", head: true })
  .is("client_id", null)
  .contains("metadata", { client_id_resolution: { source: "system-overhead-cross-cliente" } })
const { count: orphanAnnotated } = await supa
  .from("agent_invocations")
  .select("id", { count: "exact", head: true })
  .is("client_id", null)
  .contains("metadata", { client_id_resolution: { source: "no-upstream-evidence" } })

console.log(
  JSON.stringify(
    {
      model_unknown_literal_remaining: unknownCount,
      model_daemon_internal_rows: daemonInternalCount,
      total_null_client_rows: nullClientCount,
      null_client_daemon_annotated: daemonAnnotated,
      null_client_orphan_annotated: orphanAnnotated,
      coverage_post_fix: {
        all_null_categorized: daemonAnnotated + orphanAnnotated >= nullClientCount,
        model_unknown_zero: unknownCount === 0,
      },
    },
    null,
    2,
  ),
)
