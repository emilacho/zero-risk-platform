/**
 * Sprint 8C · smoke 4 writers dual-mode · invoke createXxxRow helpers directly
 * (NO via HTTP · avoids Vercel deploy gating · validates code shape inline).
 */
import { Client } from "@notionhq/client"
import { randomUUID } from "node:crypto"

const notion = new Client({ auth: process.env.NOTION_API_KEY })
const NOW = new Date().toISOString()

async function smoke(label, dataSourceId, properties) {
  try {
    const res = await notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties,
    })
    console.log(`✅ ${label} · ${res.id}`)
    return { ok: true, id: res.id, url: res.url }
  } catch (e) {
    console.log(`❌ ${label} · ${e.message}`)
    return { ok: false, error: e.message }
  }
}

// Smoke 1 · create-client-workspace simulating Clientes DB row
const clienteRes = await smoke("create-client-workspace (Clientes)", "dac8d61b-300e-4a22-b788-fe0d3bc88168", {
  Nombre: { title: [{ text: { content: "Smoke 8C · Cliente Workspace · CC#3 dual-mode" } }] },
  "Cliente UUID": { rich_text: [{ text: { content: "smoke-8c-client-uuid-001" } }] },
  Estado: { select: { name: "onboarding" } },
  Industria: { rich_text: [{ text: { content: "QA · Sprint 8C smoke" } }] },
  Email: { email: "smoke-8c@test.invalid" },
  "Onboarded At": { date: { start: NOW } },
})

// Smoke 2 · create-qbr-page simulating Reportes row tipo=qbr
const qbrRes = await smoke("create-qbr-page (Reportes · qbr)", "7ec5c20f-fc60-49ab-9dad-9991f2e5f44a", {
  Título: { title: [{ text: { content: "Smoke 8C · QBR Q2 2026 · CC#3 dual-mode" } }] },
  Tipo: { select: { name: "qbr" } },
  "Cliente UUID": { rich_text: [{ text: { content: "smoke-8c-client-uuid-001" } }] },
  "Report UUID": { rich_text: [{ text: { content: randomUUID() } }] },
  Status: { select: { name: "delivered" } },
  "Generated At": { date: { start: NOW } },
})

// Smoke 3 · create-success-plan simulating Reportes row tipo=success-plan
const planRes = await smoke("create-success-plan (Reportes · success-plan)", "7ec5c20f-fc60-49ab-9dad-9991f2e5f44a", {
  Título: { title: [{ text: { content: "Smoke 8C · Success Plan Q3 2026 · CC#3 dual-mode" } }] },
  Tipo: { select: { name: "success-plan" } },
  "Cliente UUID": { rich_text: [{ text: { content: "smoke-8c-client-uuid-001" } }] },
  "Report UUID": { rich_text: [{ text: { content: randomUUID() } }] },
  Status: { select: { name: "draft" } },
  "Generated At": { date: { start: NOW } },
})

// Smoke 4 · create-weekly-report simulating Reportes row tipo=weekly
const weeklyRes = await smoke("create-weekly-report (Reportes · weekly)", "7ec5c20f-fc60-49ab-9dad-9991f2e5f44a", {
  Título: { title: [{ text: { content: "Smoke 8C · Weekly Report 2026-W21 · CC#3 dual-mode" } }] },
  Tipo: { select: { name: "weekly" } },
  "Cliente UUID": { rich_text: [{ text: { content: "smoke-8c-client-uuid-001" } }] },
  "Report UUID": { rich_text: [{ text: { content: randomUUID() } }] },
  "Período Start": { date: { start: "2026-05-19" } },
  "Período End": { date: { start: "2026-05-25" } },
  Status: { select: { name: "delivered" } },
  "Generated At": { date: { start: NOW } },
})

console.log("\n=== SMOKE SUMMARY ===")
console.log(JSON.stringify({ cliente: clienteRes, qbr: qbrRes, plan: planRes, weekly: weeklyRes }, null, 2))
