/**
 * Onboarding E2E v2 (LyVoKcrypS5uLyuu) · Gap 1 + Gap 3 wiring.
 *
 * Gap 1 patches:
 *   - Validate Deal Data jsCode · accept optional client_logo_url +
 *     client_brand_colors + client_brand_fonts on the webhook payload
 *   - Persist Client to Supabase body · forward those fields to
 *     /api/clients/upsert (which already accepts them after PR #?? merge)
 *
 * Gap 3 patches:
 *   - Insert a NEW node "Run Onboarding Cascade" AFTER Persist Client to
 *     Supabase that POSTs to /api/cascade/onboard with the persisted
 *     client_id and the (optional) scrape_summary
 *   - Re-wire connections: Persist → Run Cascade → Trigger Master Journey ugK3
 *
 * Reusable pattern · same shape as fix-onboarding-client-id.mjs (PR #25).
 */

import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=")
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const N8N_URL = env.N8N_BASE_URL
const N8N_KEY = env.N8N_API_KEY
const WF_ID = "LyVoKcrypS5uLyuu"

async function n8n(path, opts = {}) {
  const res = await fetch(`${N8N_URL}${path}`, {
    ...opts,
    headers: {
      "X-N8N-API-KEY": N8N_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

console.log("== 1. Pull current workflow ==")
const got = await n8n(`/api/v1/workflows/${WF_ID}`)
if (got.status !== 200) {
  console.error("Pull failed:", got.status, got.data)
  process.exit(1)
}
const wf = got.data
console.log(`Loaded · ${wf.nodes.length} nodes`)

// --- Gap 1a · extend Validate jsCode ---
const NEW_VALIDATE_CODE = `const b = $input.first().json.body || $input.first().json;
const missing = [];
if (!b.client_name) missing.push('client_name');
if (!b.website && !b.domain) missing.push('website');
if (!b.industry) missing.push('industry');
if (!b.contract_scope) missing.push('contract_scope');
if (missing.length) {
  throw new Error(\`Missing required fields: \${missing.join(', ')}\`);
}
// LOTE-C Fix · pre-generate client UUID so downstream agent invocations
// share the same UUID as the persist upsert.
if (!b.client_id) {
  b.client_id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
// Gap 1 · brand assets passed through unchanged so Persist + Cascade pick them up.
b.client_logo_url = b.client_logo_url || null;
b.client_brand_colors = Array.isArray(b.client_brand_colors) ? b.client_brand_colors : null;
b.client_brand_fonts = Array.isArray(b.client_brand_fonts) ? b.client_brand_fonts : null;
return [{ json: b }];`

const validateNode = wf.nodes.find((n) => n.id === "validate-deal")
if (!validateNode) {
  console.error("validate-deal node missing")
  process.exit(1)
}
validateNode.parameters.jsCode = NEW_VALIDATE_CODE
console.log("Patched · Validate Deal Data jsCode (brand assets accepted)")

// --- Gap 1b · extend Persist body to forward brand assets ---
const persistNode = wf.nodes.find((n) => n.id === "persist-client-supabase")
if (!persistNode) {
  console.error("persist-client-supabase node missing")
  process.exit(1)
}
const persistBodyBefore = persistNode.parameters.jsonBody
// Inject 3 new fields inside the JSON.stringify({...}) object after `metadata`
const persistBodyAfter = persistBodyBefore.replace(
  /(metadata: \{ workflow: \"Client Onboarding E2E v2\", workflow_id: \$workflow\.id, execution_id: \$execution\.id \})/,
  `$1, logo_url: $('Validate Deal Data').item.json.client_logo_url, brand_colors: $('Validate Deal Data').item.json.client_brand_colors, brand_fonts: $('Validate Deal Data').item.json.client_brand_fonts`,
)
if (persistBodyAfter === persistBodyBefore) {
  console.error("persist body patch · pattern not found · aborting")
  console.error("Body excerpt:", persistBodyBefore.slice(0, 400))
  process.exit(1)
}
persistNode.parameters.jsonBody = persistBodyAfter
console.log("Patched · Persist Client to Supabase body (brand assets forwarded)")

// --- Gap 3 · insert "Run Onboarding Cascade" node post-Persist ---
const CASCADE_NODE_ID = "run-onboarding-cascade"
if (!wf.nodes.find((n) => n.id === CASCADE_NODE_ID)) {
  wf.nodes.push({
    parameters: {
      method: "POST",
      url: '={{ $env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app" }}/api/cascade/onboard',
      sendHeaders: true,
      specifyHeaders: "keypair",
      headerParameters: {
        parameters: [
          { name: "x-api-key", value: "={{ $env.INTERNAL_API_KEY }}" },
          { name: "Content-Type", value: "application/json" },
        ],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody:
        '={{ JSON.stringify({ client_id: $(\'Validate Deal Data\').item.json.client_id, scrape_summary: $(\'Call Onboarding Specialist: Auto-Discovery\').item.json.response, caller: "onboarding-e2e-v2:" + $execution.id }) }}',
      options: {
        timeout: 300000,
        response: { response: { neverError: true } },
      },
    },
    id: CASCADE_NODE_ID,
    name: "Run Onboarding Cascade (Gap 3)",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1720, 100],
    onError: "continueRegularOutput",
  })
  console.log("Inserted · Run Onboarding Cascade node")
} else {
  console.log("Already inserted · Run Onboarding Cascade node (idempotent)")
}

// --- Gap 3 · re-wire connections: Persist → Cascade → ugK3 ---
const before = JSON.stringify(wf.connections)
const persistName = "Persist Client to Supabase"
const ugk3Name = "Trigger Master Journey ugK3"
const cascadeName = "Run Onboarding Cascade (Gap 3)"

// 1. Persist now goes to Cascade (was: Persist → Trigger ugK3)
wf.connections[persistName] = {
  main: [[{ node: cascadeName, type: "main", index: 0 }]],
}
// 2. Cascade goes to ugK3
wf.connections[cascadeName] = {
  main: [[{ node: ugk3Name, type: "main", index: 0 }]],
}
console.log("Re-wired · Persist → Cascade → ugK3")
console.log(
  "Connections diff:",
  before === JSON.stringify(wf.connections) ? "no change" : "updated",
)

// --- PUT workflow ---
console.log("\n== 2. PUT workflow ==")
const patchBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
}
const patched = await n8n(`/api/v1/workflows/${WF_ID}`, {
  method: "PUT",
  body: JSON.stringify(patchBody),
})
console.log("PUT status:", patched.status)
if (patched.status >= 400) {
  console.error("PUT failed:", JSON.stringify(patched.data).slice(0, 500))
  process.exit(1)
}
console.log("✓ versionId:", patched.data?.versionId)

console.log("\n== 3. Re-activate ==")
const activated = await n8n(`/api/v1/workflows/${WF_ID}/activate`, {
  method: "POST",
})
console.log("Activate status:", activated.status, "· active:", activated.data?.active)

console.log("\nDone · onboarding workflow now propagates Gap 1 brand assets AND triggers Gap 3 cascade post-persist.")
