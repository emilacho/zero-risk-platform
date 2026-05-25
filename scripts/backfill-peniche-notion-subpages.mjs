#!/usr/bin/env node
/**
 * Sprint 8D Fase 1 cuenta #1 closure · Peniche workspace backfill canonical.
 *
 * Per spec · CC#3 dispatched 2026-05-25 · backfill Peniche Notion workspace
 * con outputs canonical Steps 1+3+4+5+7+9+12 desde n8n exec 12752 (main Journey B
 * cycle Peniche · 18 invocaciones agent canonical · status error en HITL pero
 * Steps 1-9 + 12 completados canonical).
 *
 * Canonical · NO scrapeo Supabase tables structured (están EMPTY drift doc vs
 * realidad · finding crítico post-mortem). Pull canonical outputs directamente
 * desde n8n exec data canonical (single source of truth canonical).
 *
 * Workspace_id canonical · 36bbacee-94af-815e-8106-cb3d4360eb8a
 * Client_id canonical · 5470bdf9-697d-4fed-a81d-54172e2235e6
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../outputs/peniche-backfill");
mkdirSync(OUT, { recursive: true });

const WORKSPACE_ID = "36bbacee-94af-815e-8106-cb3d4360eb8a";
const CLIENT_ID = "5470bdf9-697d-4fed-a81d-54172e2235e6";
const API_URL = process.env.ZERO_RISK_API_URL || "https://zero-risk-platform.vercel.app";
const API_KEY = process.env.INTERNAL_API_KEY;

if (!API_KEY) {
  console.error("INTERNAL_API_KEY missing in env");
  process.exit(2);
}

// Map · n8n node name → canonical sub-page metadata
const SUBPAGES = [
  {
    node: "Step 1 · onboarding-specialist intake form",
    agent_slug: "onboarding-specialist",
    title: "Intake Form · Onboarding Brief · v0",
    section_label: "intake_form_v0",
  },
  {
    node: "Step 4 · customer-research ICP",
    agent_slug: "customer-research",
    title: "ICP Document · v1",
    section_label: "icp_v1",
  },
  {
    node: "Step 5 · competitive-intelligence landscape mapping",
    agent_slug: "competitive-intelligence-agent",
    title: "Análisis Competitivo · 5 Capas · v2",
    section_label: "competitive_v2",
  },
  {
    node: "Step 3 · brand-strategist auto-generate Brand Book v0",
    agent_slug: "brand-strategist",
    title: "Brand Book · canonical · v1",
    section_label: "brand_book_v1",
  },
  {
    node: "Step 7 · web-designer · Notion workspace setup",
    agent_slug: "web-designer",
    title: "Notion Workspace · layout planning",
    section_label: "web_layout_v1",
  },
  {
    node: "Step 9 · sales-enablement · kickoff deck",
    agent_slug: "sales-enablement",
    title: "Kickoff Deck · canonical",
    section_label: "kickoff_deck",
  },
  {
    node: "Step 12 · jefe-marketing · first sprint plan",
    agent_slug: "jefe-marketing",
    title: "Plan Primer Sprint · canonical",
    section_label: "first_sprint_plan",
  },
];

const exec = JSON.parse(readFileSync(resolve(OUT, "exec-12752.json"), "utf8"));
const runData = exec?.data?.resultData?.runData || {};

const results = [];
const ts = new Date().toISOString().replace(/[:.]/g, "-");

for (const subpage of SUBPAGES) {
  const runs = runData[subpage.node];
  if (!runs || runs.length === 0) {
    console.error(`[backfill] MISSING node run data · ${subpage.node}`);
    results.push({ ...subpage, ok: false, error: "missing_run_data" });
    continue;
  }
  const out = runs[0]?.data?.main?.[0]?.[0]?.json || {};
  const response = typeof out.response === "string" ? out.response : "";
  if (response.length === 0) {
    console.error(`[backfill] EMPTY response · ${subpage.node}`);
    results.push({ ...subpage, ok: false, error: "empty_response" });
    continue;
  }

  console.log(`[backfill] posting · ${subpage.agent_slug} · ${response.length} chars`);

  const body = {
    workspace_id: WORKSPACE_ID,
    agent_slug: subpage.agent_slug,
    title: subpage.title,
    content_markdown: response,
    client_id: CLIENT_ID,
    section_label: subpage.section_label,
  };

  try {
    const res = await fetch(`${API_URL}/api/notion/create-agent-output-subpage`, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      console.log(`  ✅ ${subpage.agent_slug} → ${json.subpage_url} · ${json.blocks_count} blocks${json.blocks_capped ? " (CAPPED)" : ""}`);
      results.push({ ...subpage, ok: true, ...json });
    } else {
      console.error(`  ❌ ${subpage.agent_slug} · HTTP ${res.status} · ${JSON.stringify(json).slice(0, 300)}`);
      results.push({ ...subpage, ok: false, http: res.status, error: json });
    }
  } catch (err) {
    console.error(`  ❌ ${subpage.agent_slug} · ${err.message}`);
    results.push({ ...subpage, ok: false, error: err.message });
  }
}

writeFileSync(resolve(OUT, `backfill-results-${ts}.json`), JSON.stringify(results, null, 2));

const okCount = results.filter((r) => r.ok).length;
console.log(`\n[backfill] ${okCount}/${results.length} sub-pages created canonical`);
console.log(`[backfill] results saved · outputs/peniche-backfill/backfill-results-${ts}.json`);
process.exit(okCount === results.length ? 0 : 1);
