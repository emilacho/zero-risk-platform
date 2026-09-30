// PUBLICA el arreglo de raíz del orden (planeación + Vigía) · CC#1 · 2026-09-30 · con el GO de Emilio.
//   node publicar-orden-explicito.mjs --salida=dir
// Por cada flujo: (1) la versión viva debe ser la de la foto «antes» (si no, ABORTA: alguien lo editó) · (2) 0 corridas vivas · (3) desactivar → PUT → activar ·
// (4) guardar antes/después y comparar · (5) confirmar que sigue ACTIVO. Deja constancia de nodos y conexiones cambiadas.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9) || join(process.cwd(), 'salida-publicacion')
fs.mkdirSync(salida, { recursive: true })
const espera = (ms) => new Promise((s) => setTimeout(s, ms))
const get = async (id) => (await fetch(`${N8N}/api/v1/workflows/${id}`, { headers: H })).json()
async function vivas() {
  let n = 0
  for (const st of ['running', 'waiting', 'new']) n += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).length
  return n
}
const FLUJOS = [
  { id: 'X9F0zp6LQ2xGEYVS', nombre: 'planeacion', versionEsperada: 'd67390d1-14c6-4eed-a630-69fd2730867a', archivo: 'planeacion-construida-orden-explicito-2026-09-30.json' },
  { id: '0WRWM0cChdiAxfTY', nombre: 'vigia', versionEsperada: 'd2014d36-5ea6-4953-b190-07be3d705f12', archivo: 'vigia-construida-orden-explicito-2026-09-30.json' },
]
const informe = {}
for (const f of FLUJOS) {
  const antes = await get(f.id)
  fs.writeFileSync(join(salida, `flujo-vivo-ANTES-${f.nombre}-${f.id}.json`), JSON.stringify(antes))
  if (antes.versionId !== f.versionEsperada) { console.log(`ABORTO ${f.nombre}: la versión viva es ${antes.versionId} y esperaba ${f.versionEsperada}`); process.exit(1) }
  const estabaActivo = !!antes.active
  const v = await vivas()
  if (v !== 0) { console.log(`ABORTO ${f.nombre}: hay ${v} corridas vivas`); process.exit(1) }
  const cuerpo = fs.readFileSync(join(aqui, f.archivo), 'utf8')
  await fetch(`${N8N}/api/v1/workflows/${f.id}/deactivate`, { method: 'POST', headers: H })
  const put = await fetch(`${N8N}/api/v1/workflows/${f.id}`, { method: 'PUT', headers: H, body: cuerpo })
  const putTxt = put.status === 200 ? '' : (await put.text()).slice(0, 300)
  let despuesAct = null
  if (estabaActivo) despuesAct = await (await fetch(`${N8N}/api/v1/workflows/${f.id}/activate`, { method: 'POST', headers: H })).json()
  await espera(2000)
  const despues = await get(f.id)
  fs.writeFileSync(join(salida, `flujo-vivo-DESPUES-${f.nombre}-${f.id}.json`), JSON.stringify(despues))
  const ma = Object.fromEntries(antes.nodes.map((n) => [n.name, JSON.stringify([n.parameters, n.position, n.onError, n.alwaysOutputData])]))
  const cambiados = despues.nodes.filter((n) => ma[n.name] !== JSON.stringify([n.parameters, n.position, n.onError, n.alwaysOutputData])).map((n) => n.name)
  const conexiones = Object.keys({ ...antes.connections, ...despues.connections }).filter((k) => JSON.stringify(antes.connections[k]) !== JSON.stringify(despues.connections[k]))
  informe[f.nombre] = { put: put.status, putError: putTxt || null, versionAntes: antes.versionId, versionDespues: despues.versionId, activoAntes: estabaActivo, activoDespues: !!despues.active, nodos: despues.nodes.length, nodosCambiados: cambiados, conexionesCambiadas: conexiones, disparadores: despues.nodes.filter((n) => /trigger|webhook|schedule/i.test(n.type)).map((n) => n.name) }
  console.log(JSON.stringify({ [f.nombre]: informe[f.nombre] }, null, 1))
  if (put.status !== 200 || (estabaActivo && !despues.active)) { console.log('🔴 ALGO FALLÓ · no sigo'); process.exit(2) }
}
fs.writeFileSync(join(salida, 'resumen-publicacion.json'), JSON.stringify(informe, null, 1))
