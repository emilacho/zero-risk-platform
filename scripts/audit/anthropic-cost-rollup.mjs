#!/usr/bin/env node
/**
 * Anthropic spend rollup · Sprint 7.7 prep side-task.
 *
 * Query Supabase `agent_invocations` table · aggregate `cost_usd` and
 * `tokens_input + tokens_output` por · día · agente · modelo · cliente.
 * Output · TSV files en scripts/audit/out/ + summary stdout JSON.
 *
 * Run ·
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     node scripts/audit/anthropic-cost-rollup.mjs [--days N]
 *
 * Defaults a 30 días lookback. Output stdout es JSON canonical · TSVs en disco
 * para Excel/PostHog import + vault doc table consumption.
 *
 * Cost canon · `cost_usd` ya está pre-computado per invocation por
 * `/api/agents/run-sdk` con `MODEL_PRICING` table (Sprint 5+). NO recalcular ·
 * confiar en stored value · canonical.
 *
 * Pricing reference (USD per 1M tokens · Anthropic 2026) ·
 *   - claude-opus-4-7    · in $15.00 · out $75.00
 *   - claude-opus-4-6    · in $15.00 · out $75.00
 *   - claude-sonnet-4-6  · in  $3.00 · out $15.00
 *   - claude-haiku-4-5   · in  $1.00 · out  $5.00
 *
 * Si cost_usd=0 + tokens > 0 (bug LOTE-C surfaced) · script flags como
 * `pricing-missing` y recalcula heuristic con MODEL_PRICING canonical.
 */
import { createClient } from "@supabase/supabase-js"
import { writeFile, mkdir } from "node:fs/promises"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const OUT_DIR = join(ROOT, "scripts", "audit", "out")
const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30)

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const MODEL_PRICING = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku": { input: 1, output: 5 },
}

function recalcCost(model, inTok, outTok) {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]
  return (inTok / 1_000_000) * pricing.input + (outTok / 1_000_000) * pricing.output
}

function fmtUsd(n) {
  return Number(n).toFixed(4)
}

function log(msg) {
  console.error(`[cost-rollup] ${new Date().toISOString().slice(11, 19)} · ${msg}`)
}

async function fetchAllInvocations(supa, startedAfter) {
  // Paginated fetch · Supabase REST limits 1000 per request
  const PAGE_SIZE = 1000
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supa
      .from("agent_invocations")
      .select(
        "id, agent_id, model, started_at, status, cost_usd, tokens_input, tokens_output, client_id",
      )
      .gte("started_at", startedAfter)
      .order("started_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      log(`fetch error · ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    log(`fetched ${data.length} rows · total ${all.length}`)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function fetchAgentSlugMap(supa) {
  const { data, error } = await supa.from("agents").select("id, name")
  if (error) {
    log(`agent slug map fetch error · ${error.message}`)
    return new Map()
  }
  return new Map((data ?? []).map((a) => [a.id, a.name]))
}

function rollup(rows) {
  const byDay = new Map()
  const byAgent = new Map()
  const byModel = new Map()
  const byClient = new Map()
  let totalCost = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalInvocations = 0
  let recalcedRows = 0

  for (const row of rows) {
    const day = (row.started_at ?? "").slice(0, 10)
    const agent = row.agent_id ?? "unknown"
    const model = row.model ?? "unknown"
    const client = row.client_id ?? "no-client"
    const inTok = Number(row.tokens_input ?? 0)
    const outTok = Number(row.tokens_output ?? 0)
    let cost = Number(row.cost_usd ?? 0)

    // Recalc if cost=0 + tokens>0 (LOTE-C bug pattern · stored cost wrong)
    if (cost === 0 && inTok + outTok > 0) {
      cost = recalcCost(model, inTok, outTok)
      recalcedRows++
    }

    totalCost += cost
    totalTokensIn += inTok
    totalTokensOut += outTok
    totalInvocations++

    const accumulate = (map, key) => {
      const cur = map.get(key) ?? {
        invocations: 0,
        cost_usd: 0,
        tokens_in: 0,
        tokens_out: 0,
      }
      cur.invocations += 1
      cur.cost_usd += cost
      cur.tokens_in += inTok
      cur.tokens_out += outTok
      map.set(key, cur)
    }

    accumulate(byDay, day)
    accumulate(byAgent, agent)
    accumulate(byModel, model)
    accumulate(byClient, client)
  }

  return {
    totals: {
      cost_usd: totalCost,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      tokens_total: totalTokensIn + totalTokensOut,
      invocations: totalInvocations,
      recalced_rows: recalcedRows,
    },
    by_day: Object.fromEntries(byDay),
    by_agent: Object.fromEntries(byAgent),
    by_model: Object.fromEntries(byModel),
    by_client: Object.fromEntries(byClient),
  }
}

function toTsv(map, keyName) {
  const lines = [[keyName, "invocations", "cost_usd", "tokens_in", "tokens_out"].join("\t")]
  for (const [key, val] of Object.entries(map)) {
    lines.push(
      [
        key,
        val.invocations,
        fmtUsd(val.cost_usd),
        val.tokens_in,
        val.tokens_out,
      ].join("\t"),
    )
  }
  return lines.join("\n") + "\n"
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log("FATAL · SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required")
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })

  const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  })

  const startedAfter = new Date(Date.now() - DAYS * 24 * 3_600_000).toISOString()
  log(`fetching agent_invocations since ${startedAfter} (${DAYS}d lookback)`)

  const [rows, agentSlugMap] = await Promise.all([
    fetchAllInvocations(supa, startedAfter),
    fetchAgentSlugMap(supa),
  ])

  if (rows.length === 0) {
    log("no rows found · table empty OR filter excluded all")
    console.log(JSON.stringify({ totals: { invocations: 0 }, days_lookback: DAYS }, null, 2))
    return
  }

  const r = rollup(rows)

  // Resolve agent UUIDs to slugs for readability
  const byAgentSlug = {}
  for (const [agentId, val] of Object.entries(r.by_agent)) {
    const slug = agentSlugMap.get(agentId) ?? agentId
    byAgentSlug[slug] = val
  }
  r.by_agent_slug = byAgentSlug

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  await writeFile(join(OUT_DIR, `cost-by-day-${ts}.tsv`), toTsv(r.by_day, "day"))
  await writeFile(join(OUT_DIR, `cost-by-agent-${ts}.tsv`), toTsv(byAgentSlug, "agent_slug"))
  await writeFile(join(OUT_DIR, `cost-by-model-${ts}.tsv`), toTsv(r.by_model, "model"))
  await writeFile(join(OUT_DIR, `cost-by-client-${ts}.tsv`), toTsv(r.by_client, "client_id"))
  log(`TSVs written to ${OUT_DIR}`)

  // Stdout JSON summary
  const summary = {
    sprint_origin: "Sprint 7.7 prep · side-task",
    generated_at: new Date().toISOString(),
    days_lookback: DAYS,
    totals: {
      ...r.totals,
      cost_usd: fmtUsd(r.totals.cost_usd),
    },
    top_models: Object.entries(r.by_model)
      .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .slice(0, 10)
      .map(([model, v]) => ({
        model,
        invocations: v.invocations,
        cost_usd: fmtUsd(v.cost_usd),
        tokens_total: v.tokens_in + v.tokens_out,
      })),
    top_agents: Object.entries(byAgentSlug)
      .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .slice(0, 15)
      .map(([slug, v]) => ({
        slug,
        invocations: v.invocations,
        cost_usd: fmtUsd(v.cost_usd),
      })),
    top_days: Object.entries(r.by_day)
      .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .slice(0, 10)
      .map(([day, v]) => ({
        day,
        invocations: v.invocations,
        cost_usd: fmtUsd(v.cost_usd),
      })),
    by_client: Object.entries(r.by_client)
      .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .map(([client, v]) => ({
        client_id: client === "no-client" ? "(no client_id)" : client.slice(0, 8) + "...",
        invocations: v.invocations,
        cost_usd: fmtUsd(v.cost_usd),
      })),
  }

  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

main().catch((err) => {
  log(`UNCAUGHT · ${err.message}`)
  process.exit(99)
})
