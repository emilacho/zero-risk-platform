/**
 * ALTA DEL LECTOR DE LAS FICHAS en n8n · Sprint 4 · A entrega 2 · CC#3 · 17-nov
 *
 *   doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/alta-del-lector-de-fichas.mjs              → plan (no escribe nada)
 *   doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/alta-del-lector-de-fichas.mjs --ejecutar   → crea y parcha
 *
 * 🔴 SOLO con el 🟢 del certificador, el GO de Lenovo, la migración 202611172300 YA aplicada y n8n 0/0.
 * Orden (cada paso verifica el anterior):
 *   1 · la puerta viva es IGUAL al respaldo `puerta-s4-fichas-ANTES.json` (si cambió, no se sigue: rehacer el respaldo y el parche)
 *   2 · crea el sub-flujo «cadena · fichas» (nace apagado, como los otros sub-flujos de la cadena)
 *   3 · imprime el SQL que suma su id a `cadena_config.flujos` (sin eso la ruta responde 403 y el lector no corre · NO se aplica aquí)
 *   4 · parcha la puerta con `construir-s4-fichas-puerta.mjs` y la verifica nodo por nodo
 * REVERSA: `node scripts/ops/n8n-flujo.mjs restaurar pBAp5Cx7R39U585i scripts/worker-staging/cadena/puerta-s4-fichas-ANTES.json --ejecutar` y quitar el id de `cadena_config.flujos`.
 * Las llaves vienen del entorno (Doppler): este guion no las imprime ni las guarda.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { construirFlujos } from './construir.mjs'
import { construirFlujo as conLector } from './construir-s4-fichas-puerta.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ejecutar = process.argv.includes('--ejecutar')
const BASE = process.env.N8N_BASE_URL?.replace(/\/$/, ''), KEY = process.env.N8N_API_KEY
if (!BASE || !KEY) { console.error('faltan N8N_BASE_URL / N8N_API_KEY en el entorno (correr con doppler run)'); process.exit(2) }
const H = { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json' }
const api = async (m, p, body) => {
  const r = await fetch(BASE + '/api/v1' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j).slice(0, 200)}`)
  return j
}
const huella = (w) => createHash('sha256').update(JSON.stringify([w.nodes.map((n) => [n.name, n.type, n.parameters, n.onError ?? null]), w.connections])).digest('hex')
const ID_PUERTA = 'pBAp5Cx7R39U585i'
const ANTES = JSON.parse(fs.readFileSync(path.join(AQUI, 'puerta-s4-fichas-ANTES.json'), 'utf8'))

const vivo = await api('GET', `/workflows/${ID_PUERTA}`)
if (huella(vivo) !== huella(ANTES)) { console.error('🔴 la puerta viva NO es igual al respaldo: no se sigue (rehacer el respaldo y revisar el parche)'); process.exit(1) }
console.log('1 · la puerta viva es igual al respaldo')
const sub = construirFlujos()['cadena-fichas']
const existentes = []
let cursor
do { const r = await api('GET', `/workflows?limit=100${cursor ? '&cursor=' + cursor : ''}`); existentes.push(...r.data); cursor = r.nextCursor } while (cursor)
if (existentes.some((w) => w.name === sub.name)) { console.error(`🔴 ya existe un flujo «${sub.name}»: no se duplica`); process.exit(1) }
const prueba = conLector(ANTES, '@@ID_FICHAS@@')
console.log(`2 · plan: crear «${sub.name}» (${sub.nodes.length} nodos, apagado) · la puerta pasa de ${ANTES.nodes.length} a ${prueba.nodes.length} nodos`)
if (!ejecutar) { console.log('\n(plan solamente: no se creó nada · agregar --ejecutar)'); process.exit(0) }

const creado = await api('POST', '/workflows', { name: sub.name, nodes: sub.nodes, connections: sub.connections, settings: sub.settings })
if (creado.active === true) throw new Error('🔴 el sub-flujo quedó ACTIVO: esto no debía pasar')
console.log(`   creado fichas → ${creado.id} (activo: ${creado.active})`)
console.log('\n3 · SQL para sumar su id a la lista de flujos autorizados (NO se aplicó · aplicarlo ANTES de que corra una campaña):\n')
console.log(`UPDATE public.cadena_config SET valor = valor || '${JSON.stringify([creado.id])}'::jsonb, actualizado_en = now() WHERE clave = 'flujos' AND NOT (valor ? '${creado.id}');\n`)
const nueva = conLector(ANTES, creado.id)
await api('PUT', `/workflows/${ID_PUERTA}`, { name: vivo.name, nodes: nueva.nodes, connections: nueva.connections, settings: vivo.settings })
const despues = await api('GET', `/workflows/${ID_PUERTA}`)
if (huella(despues) !== huella(nueva)) throw new Error('🔴 la puerta guardada no es igual al parche: restaurar con puerta-s4-fichas-ANTES.json')
console.log(`4 · puerta parchada y verificada (${despues.nodes.length} nodos · activa: ${despues.active})`)
fs.writeFileSync(path.join(AQUI, 'lector-de-fichas-creado.json'), JSON.stringify({ fichas: creado.id, puerta: ID_PUERTA, fecha: new Date().toISOString() }, null, 1))
await new Promise((r) => setTimeout(r, 100))
