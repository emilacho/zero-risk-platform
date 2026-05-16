// One-shot · Onboarding E2E v2 workflow (LyVoKcrypS5uLyuu) client_id propagation fix.
//
// Problem · the Onboarding Specialist agent invocation runs PRE-persist (it
// does the discovery whose output feeds the upsert). At that moment the
// webhook payload from CC#3 / GHL doesn't carry a `client_id`, so the
// `/api/agents/run` call lands with empty string · agent_invocations row
// gets `client_id=NULL`. Same NULL propagates to the 3 Camino III reviewers
// (brand-strategist + jefe-client-success + editor-en-jefe).
//
// CC#3's master-workflow attempt for Náufrago (execution_id 7196 · 2026-05-16T07:22-07:23Z)
// produced 4 NULL rows totaling $0.345 of Anthropic spend, all detached from
// the actual client row `d69100b5-8ad7-4bb0-908c-68b5544065dc`.
//
// Fix · generate the client UUID inside `Validate Deal Data` (jsCode node)
// so it's available to every downstream node. `Persist Client to Supabase`
// then includes it as `client_id` in the `/api/clients/upsert` body · upsert
// honors explicit `client_id` per its docs (line 17 of route.ts: "explicit
// `client_id` (UUID) takes precedence").
//
// Reusable pattern · same script shape as `fix-b1-expression.mjs` (PR #21).

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const N8N_URL = env.N8N_BASE_URL;
const N8N_KEY = env.N8N_API_KEY;
const WF_ID = "LyVoKcrypS5uLyuu";

async function n8n(path, opts = {}) {
  const res = await fetch(`${N8N_URL}${path}`, {
    ...opts,
    headers: {
      "X-N8N-API-KEY": N8N_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

console.log("== 1. Pull current workflow ==");
const got = await n8n(`/api/v1/workflows/${WF_ID}`);
if (got.status !== 200) {
  console.error("Pull failed:", got.status, got.data);
  process.exit(1);
}
const wf = got.data;
console.log(`Loaded · ${wf.nodes.length} nodes · active=${wf.active}`);

// --- Patch 1 · Validate Deal Data jsCode · pre-generate client_id ---
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
// (onboarding-specialist + Camino III reviewers) AND the persist upsert
// share the same UUID. /api/clients/upsert honors explicit client_id per
// its docs. If the webhook already carries a client_id (re-runs, manual
// retries), use that instead of regenerating.
// n8n Code node sandbox blocks both \`crypto\` (global) and require('crypto')
// per the platform's hardening · inline UUID v4 via Math.random meets
// uniqueness needs for workflow-scoped propagation (NOT crypto-grade · ok
// here because the value is a primary-key surrogate, not a security token).
if (!b.client_id) {
  b.client_id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
return [{ json: b }];`;

const validateNode = wf.nodes.find((n) => n.id === "validate-deal");
if (!validateNode) {
  console.error("validate-deal node missing");
  process.exit(1);
}
const validateBefore = validateNode.parameters.jsCode;
validateNode.parameters.jsCode = NEW_VALIDATE_CODE;
console.log(`Patched · Validate Deal Data jsCode (before=${validateBefore.length} chars · after=${NEW_VALIDATE_CODE.length} chars)`);

// --- Patch 2 · Persist Client to Supabase · include client_id in upsert body ---
const persistNode = wf.nodes.find((n) => n.id === "persist-client-supabase");
if (!persistNode) {
  console.error("persist-client-supabase node missing");
  process.exit(1);
}
const persistBodyBefore = persistNode.parameters.jsonBody;
// Inject `client_id` field after `name` in the JSON.stringify body.
// Replacement is surgical to preserve every other field exactly.
const persistBodyAfter = persistBodyBefore.replace(
  /name:\s*\$\('Validate Deal Data'\)\.item\.json\.client_name,/,
  `client_id: $('Validate Deal Data').item.json.client_id, name: $('Validate Deal Data').item.json.client_name,`,
);
if (persistBodyAfter === persistBodyBefore) {
  console.error("persist-client-supabase body patch · pattern not found · aborting");
  console.error("Body excerpt:", persistBodyBefore.slice(0, 400));
  process.exit(1);
}
persistNode.parameters.jsonBody = persistBodyAfter;
console.log(`Patched · Persist Client to Supabase body · client_id field injected`);

// --- 3. PUT the modified workflow ---
const patchBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
};

console.log("\n== 2. PUT workflow ==");
const patched = await n8n(`/api/v1/workflows/${WF_ID}`, {
  method: "PUT",
  body: JSON.stringify(patchBody),
});
console.log("PUT status:", patched.status);
if (patched.status >= 400) {
  console.error("PUT failed:", JSON.stringify(patched.data).slice(0, 500));
  process.exit(1);
}
console.log("✓ Workflow updated · versionId:", patched.data?.versionId);

// --- 4. Re-activate (PUT may deactivate) ---
console.log("\n== 3. Re-activate ==");
const activated = await n8n(`/api/v1/workflows/${WF_ID}/activate`, {
  method: "POST",
});
console.log("Activate status:", activated.status, "· active=", activated.data?.active);

console.log("\nDone · workflow ready to fire with propagated client_id");
