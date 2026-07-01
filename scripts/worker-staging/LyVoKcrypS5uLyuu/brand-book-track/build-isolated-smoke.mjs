/**
 * Brand Book · SMOKE AISLADO del track (Opción 1 · CC#4 2026-06-30).
 *
 * Arma un workflow n8n standalone que INYECTA un discovery_package pre-armado con
 * datos REALES de Náufrago (config.apify + client_brain_chunks) y corre SOLO el
 * track BB (Fan-out → 3 lentes → Consolidador → Lazo A → judge → IF → Promote),
 * salteando el discovery caro (~$1). Cap objetivo del track ~$1-2.
 *
 * Reusa los nodos BB EXACTOS de rewired-worker.json + 2 seed nodes nombrados
 * `Validate Deal Data` y `Confirm barato · competitor list` (los nodos BB los
 * referencian por nombre · así corre el código sin tocarlo).
 *
 * Run: node build-isolated-smoke.mjs   → escribe isolated-smoke.json + lo imprime.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const CID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

// discovery_package se inyecta vía env JSON (lo arma el runner que llama este build).
const discoveryPackage = JSON.parse(process.env.BB_DISCOVERY_PACKAGE || '{}')

const worker = JSON.parse(readFileSync(join(DIR, 'rewired-worker.json'), 'utf8'))
// Nodos del track BB + lentes (los referenciables por nombre).
const BB = worker.nodes.filter(
  (n) => /^\[BB\]/.test(n.name) || /^Lente · /.test(n.name),
)

// Seed nodes · proveen client_id + discovery_package con los nombres que el código espera.
const manualTrigger = {
  parameters: { httpMethod: 'POST', path: 'zero-risk/bb-isolated-smoke', responseMode: 'onReceived' },
  id: 'iso-trigger', name: 'Webhook · smoke trigger',
  type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 400],
}
const validate = {
  parameters: {
    jsCode:
      'return [{ json: { client_id: ' + JSON.stringify(CID) + ', ' +
      "client_name: 'Náufrago', industry: 'restaurante / hospitality', " +
      "website: 'https://www.instagram.com/naufrago.ec/' } }];",
  },
  id: 'iso-validate', name: 'Validate Deal Data',
  type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 400],
}
const confirm = {
  parameters: {
    jsCode:
      'return [{ json: { client_id: ' + JSON.stringify(CID) +
      ', discovery_package: ' + JSON.stringify(discoveryPackage) + ' } }];',
  },
  id: 'iso-confirm', name: 'Confirm barato · competitor list',
  type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 400],
}

// Reposicionar el track a la derecha de los seeds (estético · no afecta runtime).
for (const n of BB) n.position = [n.position[0] + 200, n.position[1]]

const nodes = [manualTrigger, validate, confirm, ...BB]

// Conexiones · trigger → validate → confirm → [BB] Fan-out prep · + las conexiones
// internas del track copiadas del worker (solo entre nodos BB/Lente presentes).
const present = new Set(nodes.map((n) => n.name))
const C = {}
// toIdx · índice de ENTRADA del destino (preservar para el Merge · lentes a 0/1/2).
const link = (from, to, idx = 0, toIdx = 0) => {
  C[from] = C[from] || { main: [] }
  while (C[from].main.length <= idx) C[from].main.push([])
  C[from].main[idx].push({ node: to, type: 'main', index: toIdx })
}
link('Webhook · smoke trigger', 'Validate Deal Data')
link('Validate Deal Data', 'Confirm barato · competitor list')
link('Confirm barato · competitor list', '[BB] Fan-out prep')
// copiar las conexiones del worker entre nodos presentes (track interno) ·
// preservar edge.index (input del destino) · crítico para el Merge lentes.
for (const [from, conn] of Object.entries(worker.connections || {})) {
  if (!present.has(from)) continue
  ;(conn.main || []).forEach((branch, idx) => {
    for (const edge of branch || []) {
      if (present.has(edge.node)) link(from, edge.node, idx, edge.index || 0)
    }
  })
}

const wf = {
  name: 'Zero Risk — Brand Book · SMOKE AISLADO (track only · CC#4)',
  nodes, connections: C,
  settings: { executionOrder: 'v1' }, active: false,
}
const out = join(DIR, 'isolated-smoke.json')
writeFileSync(out, JSON.stringify(wf, null, 2))
console.log('isolated smoke wf ·', nodes.length, 'nodes · discovery_package keys:', Object.keys(discoveryPackage).join(','), '·', out)
