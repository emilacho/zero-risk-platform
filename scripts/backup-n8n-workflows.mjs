#!/usr/bin/env node
/**
 * Sprint 7 Track C1 · daily n8n backup script.
 *
 * 3-capa backup strategy ·
 *   1. Local file dump  → `n8n-workflows/live-snapshots/YYYY-MM-DD/*.json` (1 file por workflow)
 *   2. Manifest TSV     → `n8n-workflows/live-snapshots/YYYY-MM-DD/MANIFEST.tsv` (id · name · active · updatedAt)
 *   3. Supabase Storage → uploads tarball del snapshot al bucket `n8n-backups` (paths · `YYYY-MM-DD/snapshot.tar.gz`)
 *
 * Runs daily via `.github/workflows/n8n-daily-backup.yml` (cron 03:00 UTC) ·
 * NUNCA debe romper si N8N caído · graceful skip + alert email vía Resend.
 *
 * Env required ·
 *   - N8N_API_KEY (JWT · pre-claim expiry check)
 *   - N8N_BASE_URL (default · https://primary-production-bf18.up.railway.app)
 *   - SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (Storage upload)
 *
 * Recovery playbook · `zr-vault/wiki/playbooks/n8n-disaster-recovery.md`.
 */
import { mkdir, writeFile, readdir, stat } from "node:fs/promises"
import { resolve, join } from "node:path"
import { execSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

const N8N_API_KEY = process.env.N8N_API_KEY
const N8N_BASE_URL = (
  process.env.N8N_BASE_URL ?? "https://primary-production-bf18.up.railway.app"
).replace(/\/$/, "")
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ROOT = resolve(new URL(".", import.meta.url).pathname, "..")
const TODAY = new Date().toISOString().slice(0, 10)
const SNAPSHOT_DIR = join(ROOT, "n8n-workflows", "live-snapshots", TODAY)

function log(msg) {
  console.log(`[backup-n8n] ${new Date().toISOString()} · ${msg}`)
}

function checkJwtExpiry(jwt) {
  try {
    const parts = jwt.split(".")
    if (parts.length !== 3) return { valid: false, reason: "not_jwt" }
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    )
    if (!payload.exp) return { valid: true, hours_remaining: null }
    const remainingMs = payload.exp * 1000 - Date.now()
    const hours = Math.floor(remainingMs / 3_600_000)
    return { valid: remainingMs > 0, hours_remaining: hours }
  } catch (err) {
    return { valid: false, reason: err.message }
  }
}

async function fetchWorkflows() {
  const url = `${N8N_BASE_URL}/api/v1/workflows`
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`n8n list workflows HTTP ${res.status} · ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.data ?? []
}

async function fetchWorkflowDetail(id) {
  const url = `${N8N_BASE_URL}/api/v1/workflows/${id}`
  const res = await fetch(url, {
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    throw new Error(`n8n get workflow ${id} HTTP ${res.status}`)
  }
  return await res.json()
}

async function uploadToSupabase(tarballPath) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log("Supabase env missing · skip Storage upload (local snapshot still kept)")
    return { uploaded: false, reason: "env_missing" }
  }
  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { readFile } = await import("node:fs/promises")
  const fileBuf = await readFile(tarballPath)
  const remotePath = `${TODAY}/snapshot.tar.gz`

  const { error } = await supa.storage
    .from("n8n-backups")
    .upload(remotePath, fileBuf, {
      contentType: "application/gzip",
      upsert: true,
    })
  if (error) {
    return { uploaded: false, reason: error.message }
  }
  return { uploaded: true, path: remotePath }
}

async function main() {
  if (!N8N_API_KEY) {
    log("FATAL · N8N_API_KEY env missing")
    process.exit(1)
  }
  const expiry = checkJwtExpiry(N8N_API_KEY)
  if (!expiry.valid) {
    log(`FATAL · N8N_API_KEY JWT invalid · ${expiry.reason ?? "expired"}`)
    process.exit(2)
  }
  if (expiry.hours_remaining !== null && expiry.hours_remaining < 24) {
    log(`WARN · N8N_API_KEY expires in ${expiry.hours_remaining}h · rotate soon`)
  }

  await mkdir(SNAPSHOT_DIR, { recursive: true })
  log(`snapshot dir · ${SNAPSHOT_DIR}`)

  let workflows
  try {
    workflows = await fetchWorkflows()
  } catch (err) {
    log(`FATAL · list workflows · ${err.message}`)
    process.exit(3)
  }
  log(`fetched ${workflows.length} workflows from n8n`)

  const manifest = []
  manifest.push(["id", "name", "active", "updatedAt", "nodes_count"].join("\t"))

  let successful = 0
  let failed = 0
  for (const wf of workflows) {
    try {
      const detail = await fetchWorkflowDetail(wf.id)
      const outPath = join(SNAPSHOT_DIR, `${wf.id}.json`)
      await writeFile(outPath, JSON.stringify(detail, null, 2))
      manifest.push(
        [
          wf.id,
          (wf.name ?? "").replace(/\t/g, " "),
          wf.active ? "active" : "inactive",
          wf.updatedAt ?? "",
          (detail.nodes ?? []).length,
        ].join("\t"),
      )
      successful++
    } catch (err) {
      log(`WARN · workflow ${wf.id} (${wf.name}) · ${err.message}`)
      failed++
    }
  }

  await writeFile(
    join(SNAPSHOT_DIR, "MANIFEST.tsv"),
    manifest.join("\n") + "\n",
  )

  log(`local snapshot · ${successful} OK · ${failed} failed`)

  // Tarball + Supabase upload
  const tarballPath = join(ROOT, "n8n-workflows", "live-snapshots", `${TODAY}.tar.gz`)
  try {
    execSync(`tar -czf "${tarballPath}" -C "${join(ROOT, "n8n-workflows", "live-snapshots")}" "${TODAY}"`, {
      stdio: "inherit",
    })
    log(`tarball created · ${tarballPath}`)
  } catch (err) {
    log(`WARN · tarball create failed · ${err.message}`)
  }

  const upload = await uploadToSupabase(tarballPath).catch((err) => ({
    uploaded: false,
    reason: err.message,
  }))
  if (upload.uploaded) {
    log(`Supabase Storage uploaded · n8n-backups/${upload.path}`)
  } else {
    log(`Supabase Storage skipped · ${upload.reason}`)
  }

  log(`DONE · snapshot ${TODAY} · ${successful}/${workflows.length} workflows saved`)
  process.exit(failed > 0 ? 4 : 0)
}

main().catch((err) => {
  log(`UNCAUGHT · ${err.message}`)
  process.exit(99)
})
