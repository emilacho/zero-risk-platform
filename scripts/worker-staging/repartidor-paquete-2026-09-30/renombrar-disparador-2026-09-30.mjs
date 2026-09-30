// RENOMBRA EL DISPARADOR DEL RELOJ DEL REPARTIDOR · CC#1 · 2026-09-30 · pedido de CC#3 (tercer rótulo de la semana que contradice al código).
// El nodo se llamaba «Every 3min» y ejecuta cada 15 (`*/15 * * * *`) · cambia SÓLO el nombre: el del nodo y la llave de las conexiones que lo referencian. Nada más.
//   node renombrar-disparador-2026-09-30.mjs            → construye y compara contra la foto v6fd09a14 (no toca n8n)
//   node renombrar-disparador-2026-09-30.mjs --publicar → 0 corridas vivas (se ignora el propio reloj) + versión viva esperada + desactivar → PUT → activar → verificar
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NOMBRE_VIEJO = 'Every 3min'
export const NOMBRE_NUEVO = 'Every 15min'
const SETTINGS_OK = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'timezone', 'executionTimeout', 'errorWorkflow', 'callerPolicy']
export function renombrarDisparador(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  const nodo = w.nodes.find((n) => n.name === NOMBRE_VIEJO)
  if (!nodo) throw new Error('falta el nodo ' + NOMBRE_VIEJO)
  if (nodo.parameters.rule.interval[0].expression !== '*/15 * * * *') throw new Error('el disparador ya no es el de cada 15 min')
  if (w.nodes.some((n) => n.name === NOMBRE_NUEVO)) throw new Error('ya existe un nodo ' + NOMBRE_NUEVO)
  nodo.name = NOMBRE_NUEVO
  nodo.notes = 'Red de seguridad · cada 15 min (antes cada 3) · paquete del repartidor 30-sep'
  const conexiones = {}
  for (const [de, v] of Object.entries(w.connections)) {
    const k = de === NOMBRE_VIEJO ? NOMBRE_NUEVO : de
    conexiones[k] = { ...v, main: v.main.map((rama) => rama.map((h) => (h.node === NOMBRE_VIEJO ? { ...h, node: NOMBRE_NUEVO } : h))) }
  }
  const settings = {}
  for (const k of SETTINGS_OK) if (w.settings?.[k] !== undefined) settings[k] = w.settings[k]
  return { name: w.name, nodes: w.nodes, connections: conexiones, settings }
}
if (process.argv[1] && process.argv[1].endsWith('renombrar-disparador-2026-09-30.mjs')) {
  const foto = JSON.parse(fs.readFileSync(join(aqui, 'reloj-vivo-6fd09a14-2026-09-30.json'), 'utf8'))
  const construido = renombrarDisparador(foto)
  fs.writeFileSync(join(aqui, 'reloj-renombrado-2026-09-30.json'), JSON.stringify(construido))
  console.log('construido · nodos', construido.nodes.length, '· versión de la foto', foto.versionId)
  if (process.argv.includes('--publicar')) {
    const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
    for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
    const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
    const ID = 'z2nS8Up115EA9TKz'
    const get = async () => (await fetch(`${N8N}/api/v1/workflows/${ID}`, { headers: H })).json()
    let vivas = 0
    for (const st of ['running', 'waiting', 'new']) vivas += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).filter((e) => e.workflowId !== ID).length
    if (vivas) { console.log('ABORTO: corridas vivas', vivas); process.exit(1) }
    const vivo = await get()
    if (vivo.versionId !== foto.versionId) { console.log('ABORTO: versión viva', vivo.versionId); process.exit(1) }
    await fetch(`${N8N}/api/v1/workflows/${ID}/deactivate`, { method: 'POST', headers: H })
    const put = await fetch(`${N8N}/api/v1/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(construido) })
    console.log('PUT', put.status, put.status === 200 ? '' : (await put.text()).slice(0, 300))
    await fetch(`${N8N}/api/v1/workflows/${ID}/activate`, { method: 'POST', headers: H })
    const d = await get()
    const ma = Object.fromEntries(vivo.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
    console.log(JSON.stringify({
      versionAntes: vivo.versionId, versionDespues: d.versionId, activo: d.active, nodos: d.nodes.map((n) => n.name),
      disparador: d.nodes.find((n) => n.name === NOMBRE_NUEVO)?.parameters.rule.interval[0].expression, conexiones: Object.keys(d.connections),
      parametrosCambiados: d.nodes.filter((n) => ma[n.name === NOMBRE_NUEVO ? NOMBRE_VIEJO : n.name] !== JSON.stringify(n.parameters)).map((n) => n.name),
    }))
  }
}
