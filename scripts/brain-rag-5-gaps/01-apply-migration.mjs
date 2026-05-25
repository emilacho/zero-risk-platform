#!/usr/bin/env node
/**
 * Sprint 8D Brain RAG · apply embedding_version migration to live Supabase.
 *
 * Reads supabase/migrations/202605250700_brain_embedding_version.sql · executes
 * via Supabase exec_sql function (canonical pattern · service-role authenticated).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(__dirname, "../../supabase/migrations/202605250700_brain_embedding_version.sql");
const sql = readFileSync(SQL_PATH, "utf8");

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Try exec_sql RPC first (canonical) · fallback to direct PostgreSQL via fetch if available
console.log("[migration] applying embedding_version migration...");
const r = await fetch(`${SUPA_URL}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ sql }),
});
const body = await r.text();
console.log("status:", r.status, "·", body.slice(0, 300));

if (!r.ok) {
  console.error("ERR · exec_sql RPC failed · maybe needs to be created OR apply via Supabase dashboard SQL editor.");
  console.error("Migration SQL to paste manually:");
  console.error("---");
  console.error(sql);
  process.exit(2);
}

// Verify column exists
const v = await fetch(`${SUPA_URL}/rest/v1/client_brain_chunks?select=embedding_version&limit=1`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const vbody = await v.text();
console.log("\nverification GET embedding_version · status:", v.status, "·", vbody.slice(0, 200));
if (v.status === 200) {
  console.log("[migration] ✅ embedding_version column live");
} else {
  console.log("[migration] ❌ column not detected · check Supabase dashboard");
}
