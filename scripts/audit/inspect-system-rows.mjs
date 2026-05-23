import { createClient } from "@supabase/supabase-js"
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { data, error } = await supa
  .from("agent_invocations")
  .select("*")
  .eq("agent_id", "system")
  .order("started_at", { ascending: false })
  .limit(3)
if (error) {
  console.error("ERR", error.message)
  process.exit(1)
}
console.log(JSON.stringify(data, null, 2))
