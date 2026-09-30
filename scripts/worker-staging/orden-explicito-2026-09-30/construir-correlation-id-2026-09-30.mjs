// EL SOBRE DE PLANEACIÓN AL BRIEF NO MANDA `correlation_id: null` · CC#1 · 2026-09-30 · sólo construye (lee el flujo vivo, escribe «antes» y «construida»; NO publica).
//   node construir-correlation-id-2026-09-30.mjs
// La puerta de la sala rechaza `correlation_id: null` (invalid_envelope · debe venir como texto/UUID o no venir). Con `?? undefined` JSON.stringify omite la llave.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
const ID = 'X9F0zp6LQ2xGEYVS', NODO = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const SETTINGS_OK = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'timezone', 'executionTimeout', 'errorWorkflow', 'callerPolicy']
const VIEJO = "correlation_id: $('Webhook · planeacion').first().json.body._sala_correlation_id ?? null })"
const NUEVO = "correlation_id: $('Webhook · planeacion').first().json.body._sala_correlation_id || undefined })"
const vivo = await (await fetch(`${process.env.N8N_BASE_URL}/api/v1/workflows/${ID}`, { headers: H })).json()
fs.writeFileSync(join(aqui, 'planeacion-antes-correlation-id-2026-09-30.json'), JSON.stringify(vivo))
const nodo = vivo.nodes.find((n) => n.name === NODO)
if (!nodo || nodo.parameters.jsonBody.split(VIEJO).length !== 2) { console.log('ABORTO: el nodo o la línea no son los esperados', !!nodo); process.exit(1) }
nodo.parameters.jsonBody = nodo.parameters.jsonBody.replace(VIEJO, () => NUEVO)
const settings = {}
for (const k of SETTINGS_OK) if (vivo.settings?.[k] !== undefined) settings[k] = vivo.settings[k]
fs.writeFileSync(join(aqui, 'planeacion-construida-correlation-id-2026-09-30.json'), JSON.stringify({ name: vivo.name, nodes: vivo.nodes, connections: vivo.connections, settings }))
console.log('ok · versión viva', vivo.versionId, '· nodos', vivo.nodes.length)
