#!/usr/bin/env node
/**
 * Sprint 7 D1 · Normalize workflow naming in live n8n.
 *
 * Canon · all workflow names start with "Zero Risk — " (em-dash · NOT
 * hyphen) · NO "ZR" abbreviation prefix.
 *
 * Audit ground truth 2026-05-22 ·
 *   - 9 workflows use hyphen "Zero Risk - "
 *   - 2 workflows use "ZR — " prefix
 *   - 47 already canonical em-dash
 *
 * Usage ·
 *   node scripts/sprint7-d1-normalize-naming.mjs            # dry-run
 *   node scripts/sprint7-d1-normalize-naming.mjs --apply    # PUT live
 *
 * Safety ·
 *   - Metadata-only change (name field) · workflow logic untouched
 *   - Backups · pre-image written to outputs/sprint7-naming-backups-YYYY-MM-DD/
 *   - n8n executions history preserved (id unchanged)
 *   - Active workflows continue executing (rename is hot-swappable)
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const APPLY = process.argv.includes("--apply")
const N8N_API_URL =
  process.env.N8N_API_URL ?? "https://n8n-production-72be.up.railway.app"
const N8N_API_KEY = process.env.N8N_API_KEY
if (!N8N_API_KEY) {
  console.error("[d1] FATAL · N8N_API_KEY env missing")
  process.exit(2)
}

async function n8nFetch(p, init = {}) {
  return fetch(`${N8N_API_URL}${p}`, {
    ...init,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
}

function normalizeName(name) {
  if (!name) return name
  let n = name
  // Replace "ZR — " or "ZR -" prefix with "Zero Risk — "
  n = n.replace(/^ZR\s*[-—]\s*/, "Zero Risk — ")
  // Replace "Zero Risk - " hyphen with "Zero Risk — " em-dash
  n = n.replace(/^Zero Risk\s+-\s+/, "Zero Risk — ")
  return n
}

async function main() {
  console.log(`[d1] mode · ${APPLY ? "APPLY" : "DRY-RUN"}`)
  const listRes = await n8nFetch("/api/v1/workflows?limit=250")
  if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`)
  const { data: wfs } = await listRes.json()
  const changes = []
  for (const wf of wfs) {
    const newName = normalizeName(wf.name)
    if (newName !== wf.name) changes.push({ id: wf.id, from: wf.name, to: newName })
  }
  console.log(`[d1] ${changes.length} workflows need rename`)
  for (const c of changes) console.log(`  ${c.id} · ${c.from} → ${c.to}`)
  if (!APPLY || changes.length === 0) return

  const stamp = new Date().toISOString().slice(0, 10)
  const backupDir = path.join("outputs", `sprint7-naming-backups-${stamp}`)
  await mkdir(backupDir, { recursive: true })

  let ok = 0
  let fail = 0
  for (const c of changes) {
    // Fetch full workflow body
    const getRes = await n8nFetch(`/api/v1/workflows/${c.id}`)
    if (!getRes.ok) {
      console.error(`  ✖ GET ${c.id} HTTP ${getRes.status}`)
      fail++
      continue
    }
    const wf = await getRes.json()
    await writeFile(path.join(backupDir, `${c.id}.json`), JSON.stringify(wf, null, 2))
    // n8n v1 PUT workflow accepts ONLY · name · nodes · connections ·
    // settings (with allowed sub-fields) · staticData. Strip extras.
    const allowedSettings = [
      "saveDataErrorExecution",
      "saveDataSuccessExecution",
      "saveManualExecutions",
      "saveExecutionProgress",
      "executionTimeout",
      "timezone",
      "errorWorkflow",
      "callerPolicy",
      "executionOrder",
    ]
    const cleanSettings = {}
    for (const k of allowedSettings) {
      if (wf.settings && wf.settings[k] !== undefined) {
        cleanSettings[k] = wf.settings[k]
      }
    }
    const patched = {
      name: c.to,
      nodes: wf.nodes ?? [],
      connections: wf.connections ?? {},
      settings: cleanSettings,
      staticData: wf.staticData ?? null,
    }
    const putRes = await n8nFetch(`/api/v1/workflows/${c.id}`, {
      method: "PUT",
      body: JSON.stringify(patched),
    })
    if (putRes.ok) {
      ok++
      console.log(`  ✔ ${c.id} → ${c.to}`)
    } else {
      const t = await putRes.text().catch(() => "")
      console.error(`  ✖ PUT ${c.id} HTTP ${putRes.status} · ${t.slice(0, 200)}`)
      fail++
    }
  }
  console.log(`[d1] APPLY · ${ok} renamed · ${fail} failed · backups · ${backupDir}/`)
}

main().catch((e) => {
  console.error("[d1] FATAL", e)
  process.exit(1)
})
