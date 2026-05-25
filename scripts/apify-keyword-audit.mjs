#!/usr/bin/env node
/**
 * Sprint 8D tail · Apify workflows + agents keyword audit canonical pre-implementación pass 3.
 *
 * READ-ONLY audit · scan 58 n8n workflows + 60+ managed agents identity_content para
 * detectar canonical keywords que indican necesidad de Apify integration.
 *
 * Output canonical · matriz workflow × keywords + matriz agent × keywords + cross-reference gaps.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../outputs/apify-keyword-audit");
mkdirSync(OUT, { recursive: true });

const N8N_BASE_URL = process.env.N8N_BASE_URL || "https://n8n-production-72be.up.railway.app";
const N8N_API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = SUPABASE_URL ? SUPABASE_URL.replace(/^https?:\/\/([^.]+)\..*/, "$1") : "";

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY missing");
  process.exit(2);
}
if (!SUPABASE_TOKEN || !PROJECT_REF) {
  console.error("SUPABASE_ACCESS_TOKEN or PROJECT_REF missing");
  process.exit(2);
}

// Keyword groups canonical per spec
const KEYWORDS = {
  scraping: ["apify", "scrape", "scraper", "crawl", "crawler"],
  social: ["instagram", "tiktok", "linkedin", "facebook", "youtube", "twitter", "x.com"],
  competitive: ["competitor", "competidor", "landscape", "monitoring", "benchmark"],
  ads: ["meta ads", "google ads", "facebook ads", "ads library", "ad library"],
  content_discovery: ["trending", "creative center", "viral", "engagement", "audience insights"],
  voc: ["voice of customer", "voc", "sentiment", "community engagement", "social listening"],
};

function scanText(text) {
  const lower = (text || "").toLowerCase();
  const hits = {};
  for (const [group, kws] of Object.entries(KEYWORDS)) {
    const found = kws.filter((kw) => lower.includes(kw));
    if (found.length > 0) hits[group] = found;
  }
  return hits;
}

// ===== Fase 1 · workflows =====
console.log("[apify-audit] Fase 1 · workflows scan canonical...");

const wfList = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=250`, {
  headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" },
}).then((r) => r.json());

const workflows = wfList.data || [];
console.log(`[apify-audit] workflows fetched · ${workflows.length}`);

const wfResults = [];
for (const wf of workflows) {
  const full = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${wf.id}`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" },
  }).then((r) => r.json());

  const bodyText = JSON.stringify(full);
  const hits = scanText(bodyText);
  const usesApify = bodyText.toLowerCase().includes("apify.com") || bodyText.toLowerCase().includes("/v2/acts/") || bodyText.toLowerCase().includes("apify_api_token") || bodyText.toLowerCase().includes("apifyclient");
  const nodeTypes = (full.nodes || []).map((n) => n.type);
  const httpNodes = (full.nodes || []).filter((n) => n.type === "n8n-nodes-base.httpRequest");
  const apifyHttpNodes = httpNodes.filter((n) => {
    const url = n.parameters?.url || "";
    return url.toLowerCase().includes("apify.com");
  });

  wfResults.push({
    id: wf.id,
    name: wf.name,
    active: wf.active,
    node_count: (full.nodes || []).length,
    uses_apify: usesApify,
    apify_http_node_count: apifyHttpNodes.length,
    apify_http_urls: apifyHttpNodes.map((n) => n.parameters?.url || "").slice(0, 3),
    keywords_hit: hits,
    keyword_count: Object.values(hits).reduce((s, arr) => s + arr.length, 0),
  });
  process.stdout.write(".");
}
console.log("");
console.log(`[apify-audit] workflows scanned · ${wfResults.length}`);

writeFileSync(resolve(OUT, "workflows-scan.json"), JSON.stringify(wfResults, null, 2));

// Summary workflows
const wfUsingApify = wfResults.filter((w) => w.uses_apify);
const wfWithKwNotApify = wfResults.filter((w) => !w.uses_apify && w.keyword_count > 0);
const wfNoKw = wfResults.filter((w) => !w.uses_apify && w.keyword_count === 0);
console.log(`[apify-audit] workflows YA usan Apify · ${wfUsingApify.length}`);
console.log(`[apify-audit] workflows con keywords pero NO Apify · ${wfWithKwNotApify.length}`);
console.log(`[apify-audit] workflows sin keywords · ${wfNoKw.length}`);

// ===== Fase 2 · agents =====
console.log("\n[apify-audit] Fase 2 · agents scan canonical...");

// Canonical agents table (60 rows · Layer 1 employee catalog) + LEFT JOIN managed_agents_registry (38 mcp_servers) + agent_tools (19 tool assignments)
const sqlQuery = `
SELECT
  a.id,
  a.name AS slug,
  a.display_name,
  a.role,
  a.model,
  a.status,
  a.identity_content,
  mar.mcp_servers,
  mar.capabilities AS mar_capabilities,
  COALESCE((SELECT json_agg(json_build_object('tool_name', t.tool_name, 'tool_type', t.tool_type, 'config', t.config)) FROM agent_tools t WHERE t.agent_id = a.id), '[]'::json) AS tools_assigned
FROM agents a
LEFT JOIN managed_agents_registry mar ON mar.slug = a.name
WHERE a.is_active = true OR a.is_active IS NULL
ORDER BY a.name
`;
const agents = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SUPABASE_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sqlQuery }),
}).then((r) => r.json());

if (!Array.isArray(agents)) {
  console.error("agents query failed:", JSON.stringify(agents).slice(0, 500));
  process.exit(3);
}

console.log(`[apify-audit] agents fetched · ${agents.length}`);

const agentResults = [];
for (const ag of agents) {
  const identity = ag.identity_content || "";
  const description = ag.display_name || "";
  const role = ag.role || "";
  const mcp = JSON.stringify(ag.mcp_servers || {});
  const caps = JSON.stringify(ag.mar_capabilities || {});
  const tools = JSON.stringify(ag.tools_assigned || []);
  const combined = `${identity}\n${description}\n${role}\n${mcp}\n${caps}\n${tools}`;
  const hits = scanText(combined);
  const declaresApify = combined.toLowerCase().includes("apify") || combined.toLowerCase().includes("@zero-risk/apify");

  agentResults.push({
    slug: ag.slug,
    display_name: ag.display_name,
    role: ag.role,
    model: ag.model,
    status: ag.status,
    declares_apify: declaresApify,
    mcp_servers: ag.mcp_servers,
    tools_assigned: ag.tools_assigned,
    keywords_hit: hits,
    keyword_count: Object.values(hits).reduce((s, arr) => s + arr.length, 0),
    identity_length: identity.length,
  });
}

writeFileSync(resolve(OUT, "agents-scan.json"), JSON.stringify(agentResults, null, 2));

const agDeclaringApify = agentResults.filter((a) => a.declares_apify);
const agWithKwNotApify = agentResults.filter((a) => !a.declares_apify && a.keyword_count > 0);
const agNoKw = agentResults.filter((a) => !a.declares_apify && a.keyword_count === 0);

console.log(`[apify-audit] agents YA declaran Apify · ${agDeclaringApify.length}`);
console.log(`[apify-audit] agents con keywords pero NO Apify · ${agWithKwNotApify.length}`);
console.log(`[apify-audit] agents sin keywords · ${agNoKw.length}`);

// ===== Fase 3 · cross-reference workflow → agent =====
console.log("\n[apify-audit] Fase 3 · cross-reference workflow → agent...");

const crossRef = [];
for (const wf of wfResults) {
  if (wf.keyword_count === 0 && !wf.uses_apify) continue;
  const full = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${wf.id}`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" },
  }).then((r) => r.json());
  const fullText = JSON.stringify(full);
  const agentInvocations = new Set();
  // Heuristic canonical broader · canonical patrones reales n8n ·
  //  1) `"agent": "<slug>"` (HTTP body literal)
  //  2) `agent=<slug>` (URL canonical OR expression)
  //  3) `body.agent === "<slug>"` (Code node logic)
  //  4) node `name` containing slug as separator-bounded word
  //  5) n8n expression invoking agent canonical
  for (const ag of agentResults) {
    const escSlug = ag.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`["']agent["']\\s*:\\s*["']${escSlug}["']`, "i"),
      new RegExp(`agent[=:]\\s*["']?${escSlug}["']?`, "i"),
      new RegExp(`["']${escSlug}["']`, ""),
      new RegExp(`(?:\\b|·\\s*)${escSlug}(?:\\b|\\s*·)`, "i"),
    ];
    if (patterns.some((p) => p.test(fullText))) {
      agentInvocations.add(ag.slug);
    }
  }
  const invoked = Array.from(agentInvocations);
  if (invoked.length > 0 || wf.uses_apify || wf.keyword_count > 0) {
    crossRef.push({
      workflow_id: wf.id,
      workflow_name: wf.name,
      uses_apify: wf.uses_apify,
      agents_invoked: invoked,
      agents_declaring_apify: invoked.filter((s) => {
        const a = agentResults.find((aa) => aa.slug === s);
        return a?.declares_apify;
      }),
    });
  }
}

writeFileSync(resolve(OUT, "cross-reference.json"), JSON.stringify(crossRef, null, 2));

console.log(`[apify-audit] cross-reference rows · ${crossRef.length}`);

// ===== Summary final =====
const summary = {
  workflows: {
    total: wfResults.length,
    using_apify: wfUsingApify.length,
    with_keywords_no_apify: wfWithKwNotApify.length,
    no_keywords: wfNoKw.length,
  },
  agents: {
    total: agentResults.length,
    declaring_apify: agDeclaringApify.length,
    with_keywords_no_apify: agWithKwNotApify.length,
    no_keywords: agNoKw.length,
  },
  cross_reference: {
    workflows_with_keyword_or_apify: crossRef.length,
    workflows_invoking_agents_that_declare_apify: crossRef.filter((c) => c.agents_declaring_apify.length > 0).length,
    workflows_with_gap: crossRef.filter((c) => !c.uses_apify && c.agents_invoked.length > 0 && c.agents_declaring_apify.length === 0).length,
  },
  scan_ts: new Date().toISOString(),
};

writeFileSync(resolve(OUT, "summary.json"), JSON.stringify(summary, null, 2));

console.log("\n=== SUMMARY canonical ===");
console.log(JSON.stringify(summary, null, 2));
console.log("\n[apify-audit] ✅ outputs saved · outputs/apify-keyword-audit/");
