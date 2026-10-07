// EL FLUJO DE PRUEBA SIN REINTENTO AUTOMÁTICO · CC#1 · 2026-10-01 · SÓLO con GO de Emilio (el aviso previo ya está en #equipo).
//   node sin-reintento.mjs              → NO toca n8n · lee el flujo vivo, muestra el cambio exacto y verifica las condiciones
//   node sin-reintento.mjs --publicar   → publica (aborta si la versión viva no es la foto «antes» o si hay corridas vivas)
//
// El defecto, medido (corrida 160410): el nodo «Invoke agent via /api/agents/run-sdk» del flujo `y6H7nG3FGrmCGccP` (puerta /webhook/smoke-test-agent) tiene `retryOnFail:true` · `maxTries:3` · `waitBetweenTries:30000`.
// n8n reintenta ese nodo cuando la respuesta trae una clave `error` AUNQUE el HTTP sea 200 (el corredor devuelve así todo fallo, por el latido) y limita la espera entre intentos a 5 s (los 30 s del flujo NO rigen).
// Una llamada pagada que falla se cobra hasta 3 veces (y 4 si además se corta la conexión). Cancelar la ejecución no detiene las llamadas que ya salieron.
//
// Lo ÚNICO que cambia: ese nodo pasa a `retryOnFail:false` y pierde `maxTries`/`waitBetweenTries`. Nada más (nodos, conexiones, ajustes: idénticos).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ID_DEL_FLUJO = 'y6H7nG3FGrmCGccP'
export const VERSION_ESPERADA = '5681d0e1-b83f-4e91-822d-11f43290f79d'
export const NODO = 'Invoke agent via /api/agents/run-sdk'

/** Devuelve una COPIA del flujo con el reintento apagado en el nodo que paga · lanza si el flujo no tiene la forma medida (no adivina) */
export function aplicarSinReintento(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const idx = copia.nodes.map((n, i) => (n.name === NODO ? i : -1)).filter((i) => i >= 0)
  if (idx.length !== 1) throw new Error(`el flujo debe tener exactamente UN nodo «${NODO}» (hay ${idx.length}) · no se adivina`)
  const nodo = copia.nodes[idx[0]]
  if (nodo.type !== 'n8n-nodes-base.httpRequest') throw new Error(`el nodo «${NODO}» no es un HTTP Request (${nodo.type})`)
  nodo.retryOnFail = false
  delete nodo.maxTries
  delete nodo.waitBetweenTries
  return copia
}

/** Lo que cambió entre dos flujos, por nodo (sólo para mostrar y para las pruebas) */
export function nodosCambiados(antes, despues) {
  const a = Object.fromEntries(antes.nodes.map((n) => [n.name, JSON.stringify(n)]))
  return despues.nodes.filter((n) => a[n.name] !== JSON.stringify(n)).map((n) => n.name)
}

/** El cuerpo mínimo que n8n acepta en un PUT (el mismo que usan los demás publicadores de este sprint) */
export const cuerpoDePut = (f) => ({ name: f.name, nodes: f.nodes, connections: f.connections, settings: f.settings })

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (m) => m.toUpperCase())
if (esPrincipal || process.argv[1]?.endsWith('sin-reintento.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const N8N = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app'
  const H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
  const publicar = process.argv.includes('--publicar')
  const get = async () => (await fetch(`${N8N}/api/v1/workflows/${ID_DEL_FLUJO}`, { headers: H })).json()
  const vivas = async () => { let v = 0; for (const st of ['running', 'waiting', 'new']) v += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).length; return v }

  const antes = await get()
  const despues = aplicarSinReintento(antes)
  const enVivo = await vivas()
  console.log(JSON.stringify({ versionViva: antes.versionId, versionEsperada: VERSION_ESPERADA, coincide: antes.versionId === VERSION_ESPERADA, activo: antes.active, corridasVivasEnN8n: enVivo, nodosQueCambian: nodosCambiados(antes, despues), nodoAntes: { retryOnFail: antes.nodes.find((n) => n.name === NODO).retryOnFail, maxTries: antes.nodes.find((n) => n.name === NODO).maxTries, waitBetweenTries: antes.nodes.find((n) => n.name === NODO).waitBetweenTries }, nodoDespues: { retryOnFail: despues.nodes.find((n) => n.name === NODO).retryOnFail } }, null, 1))
  if (!publicar) { console.log('— DRY · no se tocó n8n · para publicar: --publicar (sólo con GO de Emilio)'); process.exit(0) }
  if (antes.versionId !== VERSION_ESPERADA) { console.log('ABORTO: la versión viva no es la de la foto «antes»'); process.exit(1) }
  if (enVivo) { console.log('ABORTO: hay corridas vivas en n8n:', enVivo); process.exit(1) }
  fs.writeFileSync(join(process.cwd(), 'smoke-vivo-ANTES.json'), JSON.stringify(antes))
  await fetch(`${N8N}/api/v1/workflows/${ID_DEL_FLUJO}/deactivate`, { method: 'POST', headers: H })
  const put = await fetch(`${N8N}/api/v1/workflows/${ID_DEL_FLUJO}`, { method: 'PUT', headers: H, body: JSON.stringify(cuerpoDePut(despues)) })
  console.log('PUT', put.status, put.status === 200 ? '' : (await put.text()).slice(0, 300))
  await fetch(`${N8N}/api/v1/workflows/${ID_DEL_FLUJO}/activate`, { method: 'POST', headers: H })
  const d = await get()
  fs.writeFileSync(join(process.cwd(), 'smoke-vivo-DESPUES.json'), JSON.stringify(d))
  console.log(JSON.stringify({ versionAntes: antes.versionId, versionDespues: d.versionId, activo: d.active, nodos: d.nodes.length, cambiados: nodosCambiados(antes, d), retryOnFail: d.nodes.find((n) => n.name === NODO).retryOnFail }))
  void aqui
}
