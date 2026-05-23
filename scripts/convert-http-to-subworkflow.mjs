#!/usr/bin/env node
/**
 * Sprint 7 Track C5 · sub-workflow ref converter.
 *
 * Reads an n8n workflow JSON · finds `httpRequest` nodes targeting other
 * n8n webhook URLs · converts them to `executeWorkflow` nodes pointing at
 * the canonical sub-workflow IDs.
 *
 * Outputs the converted JSON con sufijo `-sub-workflow-refs.json`. Original
 * untouched. Live n8n cutover is a separate dispatch.
 *
 * Usage ·
 *   node scripts/convert-http-to-subworkflow.mjs \
 *     n8n-workflows/proposed-sesion27b/06-client-success/004-onboarding-e2e-v2.json
 *
 * Canonical sub-workflow ID map · `scripts/canonical-subworkflow-ids.json`
 * (placeholder IDs · update post-live n8n lookup vía REST API).
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, basename, extname } from "node:path"

const SUB_WORKFLOW_ID_MAP = {
  // webhook path → workflow ID (placeholder · update post live lookup)
  "/webhook/journey-dispatch": "L1_MASTER_JOURNEY_ORCHESTRATOR_ID",
  "/webhook/journey/dispatch": "L1_MASTER_JOURNEY_ORCHESTRATOR_ID",
  "/webhook/campaign-orchestrator": "NEXUS_7PHASE_ORCHESTRATOR_ID",
  "/webhook/evidence-collector": "PHASE_GATE_EVIDENCE_COLLECTOR_ID",
  "/webhook/agent-outcomes-writer": "AGENT_OUTCOMES_STREAM_WRITER_ID",
  "/webhook/router-entry": "RUFLO_SMART_ROUTER_ID",
  // Vercel-intermediary patterns · /api/X actually proxies to n8n webhook · direct ref preferred
  "/api/evidence/validate": "PHASE_GATE_EVIDENCE_COLLECTOR_ID",
  "/api/agent-outcomes/write": "AGENT_OUTCOMES_STREAM_WRITER_ID",
}

function extractWebhookPath(url) {
  if (typeof url !== "string") return null
  // Match /webhook/<path> first
  const wm = url.match(/\/webhook\/([\w/-]+)/)
  if (wm) return `/webhook/${wm[1]}`
  // Match Vercel-intermediary /api/<path> that's in our convertible map
  const am = url.match(/\/api\/([\w/-]+)/)
  if (am) return `/api/${am[1]}`
  return null
}

function convertNode(node) {
  if (node.type !== "n8n-nodes-base.httpRequest") return { changed: false, node }
  const url = node.parameters?.url
  const webhookPath = extractWebhookPath(url)
  if (!webhookPath) return { changed: false, node }
  const workflowId = SUB_WORKFLOW_ID_MAP[webhookPath]
  if (!workflowId) {
    return { changed: false, node, reason: `unknown sub-workflow · ${webhookPath}` }
  }

  // Build the executeWorkflow node · preserve id · rename for clarity
  const converted = {
    id: node.id,
    name: `${node.name} (sub-workflow)`,
    type: "n8n-nodes-base.executeWorkflow",
    typeVersion: 1.1,
    position: node.position,
    parameters: {
      workflowId,
      options: {
        waitForSubWorkflow: true,
      },
    },
    // Annotate origin for audit trail
    notes: `Sprint 7 Track C5 · converted from httpRequest to executeWorkflow · ${webhookPath} → ${workflowId}`,
  }
  return { changed: true, node: converted, original_url: url, sub_workflow_id: workflowId }
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error("usage · node scripts/convert-http-to-subworkflow.mjs <workflow.json>")
    process.exit(1)
  }
  const fullPath = resolve(input)
  const content = await readFile(fullPath, "utf8")
  const workflow = JSON.parse(content)

  const conversions = []
  for (let i = 0; i < workflow.nodes.length; i++) {
    const result = convertNode(workflow.nodes[i])
    if (result.changed) {
      workflow.nodes[i] = result.node
      conversions.push({
        node_id: result.node.id,
        node_name: result.node.name,
        original_url: result.original_url,
        sub_workflow_id: result.sub_workflow_id,
      })
    } else if (result.reason) {
      console.log(`[skip] ${result.node?.name ?? "?"} · ${result.reason}`)
    }
  }

  if (conversions.length === 0) {
    console.log("[converter] no convertible nodes found · skipping write")
    process.exit(0)
  }

  // Output path · suffix `-sub-workflow-refs.json`
  const dir = dirname(fullPath)
  const ext = extname(fullPath)
  const base = basename(fullPath, ext)
  const outPath = `${dir}/${base}-sub-workflow-refs${ext}`

  // Annotate workflow-level
  workflow.meta = workflow.meta ?? {}
  workflow.meta.sprint7_track_c5_conversions = {
    converted_at: new Date().toISOString(),
    count: conversions.length,
    conversions,
    canonical_pattern_doc: "zr-vault/wiki/playbooks/sub-workflow-refs-canon.md",
  }

  await writeFile(outPath, JSON.stringify(workflow, null, 2))
  console.log(`[converter] ${conversions.length} nodes converted · output · ${outPath}`)
  for (const c of conversions) {
    console.log(`  · ${c.node_name} · ${c.original_url} → ${c.sub_workflow_id}`)
  }
}

main().catch((err) => {
  console.error("[converter] FATAL", err)
  process.exit(99)
})
