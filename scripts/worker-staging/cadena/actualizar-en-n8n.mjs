/**
 * ACTUALIZAR LOS FLUJOS DE LA CADENA YA CREADOS EN n8n · SIGUEN INACTIVOS · CC#1 · relevo 41
 *
 *   node scripts/worker-staging/cadena/actualizar-en-n8n.mjs <ruta .env.local>            → plan (no escribe nada: dice qué nodos cambian)
 *   node scripts/worker-staging/cadena/actualizar-en-n8n.mjs <ruta .env.local> --ejecutar → PUT de cada flujo y verifica
 *
 * 🔴 Solo toca los 7 flujos de `flujos-creados.json`, y SE NIEGA a tocar uno que esté ACTIVO. Nunca enciende nada.
 * 🔴 NO toca los dos flujos vivos (`PQdIgbuFexuBsoh8`, `X9F0zp6LQ2xGEYVS`): los lee antes y después y exige que sigan idénticos a `vivos/`.
 * Deja lo desplegado = lo que construye `construir.mjs` (lo comprueba nodo por nodo al final).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { construirFlujos } from './construir.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const [, , envPath, ...flags] = process.argv
if (!envPath) { console.error('uso: actualizar-en-n8n.mjs <ruta .env.local> [--ejecutar]'); process.exit(2) }
const ejecutar = flags.includes('--ejecutar')
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()] }))
const BASE = env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' }
const api = async (m, p, body) => { const r = await fetch(BASE + '/api/v1' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${String(t).slice(0, 200)}`); return j }
const huella = (w) => createHash('sha256').update(JSON.stringify(w.nodes.map((n) => [n.name, n.type, n.parameters]))).digest('hex')
const leer = (f) => JSON.parse(fs.readFileSync(path.join(AQUI, f), 'utf8'))
const ID_PARTE = 'PQdIgbuFexuBsoh8', ID_PLAN = 'X9F0zp6LQ2xGEYVS'
const { creados } = leer('flujos-creados.json')

const vivosAntes = {}
for (const id of [ID_PARTE, ID_PLAN]) {
  const vivo = await api('GET', `/workflows/${id}`)
  if (huella(vivo) !== huella(leer(`vivos/${id}.json`))) { console.error(`🔴 el flujo vivo ${id} CAMBIÓ respecto a vivos/: no se sigue`); process.exit(1) }
  vivosAntes[id] = vivo.updatedAt
}
const flujos = construirFlujos({ ids: { estrategia: creados.estrategia, calendario: creados.calendario, fechas: creados.fechas, puerta: creados.puerta }, parteViva: leer(`vivos/${ID_PARTE}.json`), planViva: leer(`vivos/${ID_PLAN}.json`) })
const MAPA = { 'cadena-estrategia': 'estrategia', 'cadena-calendario': 'calendario', 'cadena-fechas': 'fechas', 'cadena-vigia': 'vigia', 'cadena-puerta': 'puerta', 'cadena-parte-por-filas': 'parte', 'copia-plan-X9F0': 'copia_plan' }

console.log('plan:')
const cambios = []
for (const [k, clave] of Object.entries(MAPA)) {
  const id = creados[clave]
  const actual = await api('GET', `/workflows/${id}`)
  if (actual.active) { console.error(`🔴 ${k} (${id}) está ACTIVO: no se toca`); process.exit(1) }
  const nuevo = flujos[k]
  const porNombre = new Map(actual.nodes.map((n) => [n.name, JSON.stringify([n.type, n.parameters, n.onError ?? null])]))
  const distintos = nuevo.nodes.filter((n) => porNombre.get(n.name) !== JSON.stringify([n.type, n.parameters, n.onError ?? null])).map((n) => n.name)
  const quitados = actual.nodes.filter((n) => !nuevo.nodes.some((x) => x.name === n.name)).map((n) => n.name)
  console.log(`   ${k} (${id}) · ${distintos.length} nodo(s) cambian o se agregan${distintos.length ? ': ' + distintos.join(' | ') : ''}${quitados.length ? ' · se quitan: ' + quitados.join(' | ') : ''}`)
  cambios.push({ k, id, nuevo, hay: distintos.length > 0 || quitados.length > 0 })
}
if (!ejecutar) { console.log('\n(plan solamente: no se escribió nada · agregar --ejecutar)'); process.exit(0) }

for (const c of cambios.filter((x) => x.hay)) {
  const { name, nodes, connections, settings } = c.nuevo
  const r = await api('PUT', `/workflows/${c.id}`, { name, nodes, connections, settings })
  if (r.active === true) throw new Error(`🔴 ${c.k} quedó ACTIVO`)
  console.log(`   actualizado ${c.k} → ${c.id} (activo: ${r.active})`)
}
console.log('verificando: nada activo, lo desplegado = lo construido, los vivos intactos …')
for (const c of cambios) {
  const w = await api('GET', `/workflows/${c.id}`)
  if (w.active) throw new Error(`🔴 ${c.k} está ACTIVO`)
  const a = JSON.stringify(c.nuevo.nodes.map((n) => [n.name, n.type, n.parameters, n.onError ?? null]))
  const b = JSON.stringify(w.nodes.map((n) => [n.name, n.type, n.parameters, n.onError ?? null]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))))
  const aOrd = JSON.stringify(JSON.parse(a).sort((x, y) => String(x[0]).localeCompare(String(y[0]))))
  if (aOrd !== b) throw new Error(`🔴 ${c.k}: lo desplegado NO coincide con lo construido`)
  console.log(`   ${c.k} · ${w.nodes.length} nodos · activo: ${w.active} · igual a lo construido`)
}
for (const id of [ID_PARTE, ID_PLAN]) {
  const vivo = await api('GET', `/workflows/${id}`)
  if (huella(vivo) !== huella(leer(`vivos/${id}.json`)) || vivo.updatedAt !== vivosAntes[id]) throw new Error(`🔴 el flujo vivo ${id} cambió durante la actualización`)
}
console.log('   los dos flujos vivos siguen idénticos (mismo updatedAt)')
