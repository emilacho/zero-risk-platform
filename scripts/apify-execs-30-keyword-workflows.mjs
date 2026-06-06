#!/usr/bin/env node
/**
 * Sprint 9 · Fase 2 · pull executions historic per 30 keyword-detected workflows.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envText = readFileSync(envPath, "utf8");
const envMap = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const idx = l.indexOf("=");
    return [l.slice(0, idx), l.slice(idx + 1)];
  }),
);

const N8N_BASE_URL = envMap.N8N_BASE_URL || "https://n8n-production-72be.up.railway.app";
const N8N_API_KEY = envMap.N8N_API_KEY;

const prior = JSON.parse(readFileSync(resolve(__dirname, "../outputs/apify-criticality-audit/prior-keyword-scan.json"), "utf8"));
const keywordWfs = prior.filter((w) => !w.uses_apify && w.keyword_count > 0);

const results = [];
for (const wf of keywordWfs) {
  const execs = await fetch(`${N8N_BASE_URL}/api/v1/executions?workflowId=${wf.id}&limit=30`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY, Accept: "application/json" },
  }).then((r) => r.json());
  const data = execs.data || [];
  const success = data.filter((e) => e.finished && e.status !== "error").length;
  const error = data.filter((e) => e.status === "error").length;
  const last = data[0];
  results.push({
    id: wf.id,
    name: wf.name,
    active: wf.active,
    keyword_count: wf.keyword_count,
    keywords_hit: wf.keywords_hit,
    execs_30: data.length,
    success_30: success,
    error_30: error,
    last_exec: last ? { id: last.id, status: last.status, started: last.startedAt } : null,
  });
  process.stdout.write(".");
}
console.log();

writeFileSync(resolve(__dirname, "../outputs/apify-criticality-audit/fase2-execs-30.json"), JSON.stringify(results, null, 2));

// Print summary
console.log("\n=== Summary execs canonical ===");
const ghost = results.filter((r) => r.execs_30 === 0);
const operational = results.filter((r) => r.execs_30 > 0);
console.log(`GHOST (0 execs): ${ghost.length}`);
console.log(`OPERATIONAL (>0 execs): ${operational.length}`);
console.log("\n=== Operational top 10 by execs ===");
operational.sort((a, b) => b.execs_30 - a.execs_30).slice(0, 10).forEach((w) =>
  console.log(`  ${w.execs_30}x (✓${w.success_30}/✗${w.error_30}) · [${w.id}] · ${w.name}`),
);
