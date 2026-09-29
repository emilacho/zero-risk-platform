// El nodo del piso visual del cimiento (ssLtwYPt7zxuvnM2) pasa a leer NUESTRAS copias de las fotos · CC#1 · 2026-09-29.
// Cambia SOLO `parameters.jsCode` de «[BB] Piso visual (antes del Promote · CC#1)»: ni conexiones, ni otros nodos, ni ajustes.
//
//   node actualizar-nodo-visual-copias.mjs                → muestra el diff y escribe --salida= · NO toca n8n
//   node actualizar-nodo-visual-copias.mjs --publicar     → PUT al flujo vivo (solo con 0 corridas vivas y aviso previo)
import { writeFileSync } from 'node:fs'
import { NODO, codigoDelNodo } from './construir-nodo-visual.mjs'
const publicar = process.argv.includes('--publicar')
const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY, ID = 'ssLtwYPt7zxuvnM2'
const w = await (await fetch(`${base}/api/v1/workflows/${ID}`, { headers: { 'X-N8N-API-KEY': key } })).json()
const nodo = w.nodes.find((n) => n.name === NODO)
if (!nodo) throw new Error(`no encontré «${NODO}» en el flujo vivo`)
const nuevo = codigoDelNodo()
if (nodo.parameters.jsCode === nuevo) { console.log('el nodo ya tiene este código · nada que hacer'); process.exit(0) }
console.log('versión viva:', w.versionId, '· nodos:', w.nodes.length, '· activo:', w.active)
console.log('jsCode:', nodo.parameters.jsCode.length, '→', nuevo.length, 'caracteres · usa client_social_images:', nuevo.includes('client_social_images'), '· resolverCopias:', nuevo.includes('resolverCopias'))
nodo.parameters.jsCode = nuevo
const cuerpo = { name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings }
writeFileSync(process.argv.find((a) => a.startsWith('--salida='))?.slice(9) || 'cimiento-con-copias.json', JSON.stringify(cuerpo))
if (publicar) {
  const r = await fetch(`${base}/api/v1/workflows/${ID}`, { method: 'PUT', headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  console.log('PUT', r.status)
}
