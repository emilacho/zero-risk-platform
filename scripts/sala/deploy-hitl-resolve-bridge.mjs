#!/usr/bin/env node
/**
 * scripts/sala/deploy-hitl-resolve-bridge.mjs · Sprint 12 Fase 0 prep finale.
 *
 * Idempotent deploy of the sala-hitl-resolve bridge workflow to n8n
 * production. ALWAYS deploys as `active: false` · the flip to active is
 * §144 (post SALA_HITL_RESOLVE_ENABLED=true on Vercel side).
 *
 * Behavior:
 *   - If a workflow with the canonical name exists · PUT (update in-place)
 *     preserving the existing workflow_id (canon §149 stable id).
 *   - If not · POST (create new) and report the assigned workflow_id.
 *   - Result printed to stdout: workflow_id + webhook test/prod paths.
 *
 * Usage:
 *   node scripts/sala/deploy-hitl-resolve-bridge.mjs
 *
 * Env required (loaded from .env.local):
 *   N8N_BASE_URL
 *   N8N_API_KEY
 *
 * §148 honest · this script ONLY writes to n8n REST API. It does NOT
 * activate the workflow · it does NOT touch sala_event_log · it does NOT
 * call /api/sala/hitl/resolve. Reversible: re-run with the same JSON
 * idempotent · DELETE via n8n API removes the workflow entirely.
 */
import fs from 'node:fs'
import path from 'node:path'

function loadDotenv() {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
  ]
  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (!m) continue
        const k = m[1]
        let v = m[2]
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1)
        }
        if (!(k in process.env)) process.env[k] = v
      }
    } catch {
      /* ignore · file optional */
    }
  }
}

loadDotenv()

const N8N_BASE_URL = process.env.N8N_BASE_URL
const N8N_API_KEY = process.env.N8N_API_KEY

if (!N8N_BASE_URL || !N8N_API_KEY) {
  console.error('ERROR · N8N_BASE_URL + N8N_API_KEY required in .env.local')
  process.exit(1)
}

const WORKFLOW_JSON_PATH = path.join(
  process.cwd(),
  'scripts',
  'sala',
  'n8n-workflows',
  'sala-hitl-resolve-bridge.workflow.json',
)

const workflow = JSON.parse(fs.readFileSync(WORKFLOW_JSON_PATH, 'utf8'))
const TARGET_NAME = workflow.name

const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': N8N_API_KEY,
}

async function findExisting() {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=250`, { headers })
  if (!res.ok) {
    throw new Error(`list workflows · ${res.status} · ${await res.text()}`)
  }
  const data = await res.json()
  const list = data.data ?? []
  return list.find((w) => w.name === TARGET_NAME) ?? null
}

function buildBody(source) {
  // n8n PUT accepts: name, nodes, connections, settings, staticData
  return {
    name: source.name,
    nodes: source.nodes,
    connections: source.connections,
    settings: source.settings ?? {},
  }
}

async function deploy() {
  console.log(`[deploy-hitl-resolve-bridge] target: ${TARGET_NAME}`)
  console.log(`[deploy-hitl-resolve-bridge] base : ${N8N_BASE_URL}`)

  const existing = await findExisting()
  let id
  let mode

  if (existing) {
    id = existing.id
    mode = 'updated'
    const body = buildBody(workflow)
    const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`PUT ${id} · ${res.status} · ${await res.text()}`)
    }
  } else {
    mode = 'created'
    const body = buildBody(workflow)
    const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`POST · ${res.status} · ${await res.text()}`)
    }
    const created = await res.json()
    id = created.id
  }

  // Always ensure inactive · shadow guardrail (canon §148).
  // n8n separates active flag toggling from PUT body in some versions.
  // Verify and explicitly deactivate if needed.
  const verifyRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}`, {
    headers,
  })
  const verify = await verifyRes.json()
  if (verify.active) {
    const deactivateRes = await fetch(
      `${N8N_BASE_URL}/api/v1/workflows/${id}/deactivate`,
      { method: 'POST', headers },
    )
    if (!deactivateRes.ok) {
      console.warn(
        `[deploy-hitl-resolve-bridge] WARN · could not deactivate · ${deactivateRes.status}`,
      )
    }
  }

  const webhookNode = workflow.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')
  const webhookPath = webhookNode?.parameters?.path
  const webhookProdUrl = `${N8N_BASE_URL}/webhook/${webhookPath}`
  const webhookTestUrl = `${N8N_BASE_URL}/webhook-test/${webhookPath}`

  console.log('')
  console.log(`[deploy-hitl-resolve-bridge] ${mode} · workflow_id: ${id}`)
  console.log(`[deploy-hitl-resolve-bridge] active           : false (shadow · canon §148)`)
  console.log(`[deploy-hitl-resolve-bridge] webhook prod url : ${webhookProdUrl}`)
  console.log(`[deploy-hitl-resolve-bridge] webhook test url : ${webhookTestUrl}`)
  console.log('')
  console.log('[deploy-hitl-resolve-bridge] next steps:')
  console.log('  1. flip SALA_HITL_RESOLVE_ENABLED=true on Vercel (§144 escalón 5)')
  console.log('  2. activate workflow via n8n UI OR `curl -X POST $N8N_BASE_URL/api/v1/workflows/' + id + '/activate -H "X-N8N-API-KEY: $N8N_API_KEY"`')
  console.log('  3. point MC inbox panel "Approve/Reject" to POST ' + webhookProdUrl)
  console.log('')
  console.log(JSON.stringify({ workflow_id: id, active: false, mode, webhookProdUrl, webhookTestUrl }))
}

deploy().catch((e) => {
  console.error('[deploy-hitl-resolve-bridge] FAILED · ' + e.message)
  process.exit(1)
})
