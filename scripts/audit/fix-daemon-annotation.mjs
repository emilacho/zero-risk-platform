/**
 * Fix-up · re-annotate daemon system rows con canonical source
 * 'system-overhead-cross-cliente' · prior backfill iteration overwrote
 * with 'no-upstream-evidence' due to local-vs-DB state mismatch bug.
 */
import { createClient } from "@supabase/supabase-js"

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: daemonRows } = await supa
  .from("agent_invocations")
  .select("id, metadata")
  .eq("agent_id", "system")
  .filter("metadata->>source", "eq", "daemon")
  .is("client_id", null)

console.log(`found ${daemonRows.length} daemon system rows · re-annotating`)

let updated = 0
for (const row of daemonRows) {
  const newMeta = {
    ...(row.metadata ?? {}),
    client_id_resolution: {
      source: "system-overhead-cross-cliente",
      sprint: "7p7-track-d",
      backfilled_at: new Date().toISOString(),
      note: "daemon-initiated · NO cliente owner · system overhead",
    },
  }
  const { error } = await supa
    .from("agent_invocations")
    .update({ metadata: newMeta })
    .eq("id", row.id)
  if (error) {
    console.error(`error row ${row.id}: ${error.message}`)
  } else {
    updated++
  }
}
console.log(`updated · ${updated}/${daemonRows.length}`)
