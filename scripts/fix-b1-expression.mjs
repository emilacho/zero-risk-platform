// One-shot · Sprint #6 Brazo 2 polish · fix expression case-sensitivity bug
// in B1 5-layer deep scan (vRSkPFxe5IbdQbz3) · Competitive Strategist (Opus),
// Persist Deep Report, and Respond nodes reference `$node['validate']` and
// `$node['merge']` (lowercase) but the actual display names are `Validate`
// and `Merge 5 Layers` (capitalized). n8n `$node[...]` uses display name and
// is case-sensitive · the workflow errors with "ExpressionError: Referenced
// node doesn't exist".

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
const WF_ID = "vRSkPFxe5IbdQbz3";

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

// Rewrite expressions in 3 nodes
const REPLACEMENTS = [
  // strategist + persist
  { from: /\$node\['validate'\]/g, to: "$node['Validate']" },
  { from: /\$node\['merge'\]/g, to: "$node['Merge 5 Layers']" },
];

let touched = 0;
for (const node of wf.nodes) {
  if (!["strategist", "persist", "respond"].includes(node.id)) continue;
  const before = JSON.stringify(node.parameters);
  let after = before;
  for (const r of REPLACEMENTS) after = after.replace(r.from, r.to);
  if (after !== before) {
    node.parameters = JSON.parse(after);
    touched++;
    console.log(`Patched · ${node.id} (${node.name})`);
  }
}
console.log(`Nodes touched: ${touched}`);

if (touched === 0) {
  console.log("No changes needed · already fixed");
  process.exit(0);
}

// n8n PATCH /api/v1/workflows/{id} expects {name, nodes, connections, settings}
// only · stripping read-only fields.
const patchBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
};

console.log("\n== 2. PATCH workflow ==");
const patched = await n8n(`/api/v1/workflows/${WF_ID}`, {
  method: "PUT",
  body: JSON.stringify(patchBody),
});
console.log("PATCH status:", patched.status);
if (patched.status >= 400) {
  console.error("PATCH failed:", JSON.stringify(patched.data).slice(0, 500));
  process.exit(1);
}
console.log("✓ Workflow updated · versionId:", patched.data?.versionId);

// Workflow may have deactivated on PATCH — re-activate to be safe.
console.log("\n== 3. Re-activate ==");
const activated = await n8n(`/api/v1/workflows/${WF_ID}/activate`, {
  method: "POST",
});
console.log("Activate status:", activated.status, "· active=", activated.data?.active);

console.log("\nDone · ready to smoke");
