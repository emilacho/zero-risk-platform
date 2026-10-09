/**
 * CREAR LOS FLUJOS DE LA CADENA EN n8n · TODOS INACTIVOS · CC#1 · 2026-10-09
 *
 *   node scripts/worker-staging/cadena/crear-en-n8n.mjs <ruta .env.local>            → plan (no escribe nada)
 *   node scripts/worker-staging/cadena/crear-en-n8n.mjs <ruta .env.local> --ejecutar → crea (POST) y verifica
 *
 * 🔴 NO enciende nada: la API de n8n crea los flujos SIN `active`; el script verifica después que ninguno quedó activo.
 * 🔴 NO edita ni lee con intención de editar los flujos vivos: solo los LEE (`PQdIgbuFexuBsoh8`, `X9F0zp6LQ2xGEYVS`) y se niega a seguir si cambiaron respecto a la copia de `vivos/`
 *    (la copia por filas se arma sobre ESA versión; si el flujo vivo cambió, hay que revisar los cambios antes).
 * 🔴 NO escribe en la base: imprime el SQL de `cadena_config` (flujos + puerta_workflow_id) para que se aplique junto con la migración, con la firma que corresponda.
 * Orden: sub-flujos → vigía → puerta (necesita los ids de los tres) → parte por filas (necesita el id de la puerta) → copia de planeación.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { construirFlujos } from './construir.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const [, , envPath, ...flags] = process.argv
if (!envPath) { console.error('uso: crear-en-n8n.mjs <ruta .env.local> [--ejecutar]'); process.exit(2) }
const ejecutar = flags.includes('--ejecutar')
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const BASE = env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' }
const api = async (m, p, body) => { const r = await fetch(BASE + '/api/v1' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = { raw: t } } if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 300)}`); return j }
const huella = (w) => createHash('sha256').update(JSON.stringify(w.nodes.map((n) => [n.name, n.type, n.parameters]))).digest('hex')

const leerVivo = (f) => JSON.parse(fs.readFileSync(path.join(AQUI, 'vivos', f), 'utf8'))
const ID_PARTE = 'PQdIgbuFexuBsoh8', ID_PLAN = 'X9F0zp6LQ2xGEYVS'

console.log('1 · comprobando que los flujos vivos no cambiaron desde la copia de `vivos/` …')
for (const [id, f] of [[ID_PARTE, `${ID_PARTE}.json`], [ID_PLAN, `${ID_PLAN}.json`]]) {
  const vivo = await api('GET', `/workflows/${id}`)
  const guardado = leerVivo(f)
  if (huella(vivo) !== huella(guardado)) { console.error(`🔴 el flujo vivo ${id} CAMBIÓ respecto a vivos/${f}: no se sigue (revisar el cambio y refrescar la copia)`); process.exit(1) }
  console.log(`   ${id} · igual a la copia · ${vivo.nodes.length} nodos · activo: ${vivo.active}`)
}

const existentes = []
let cursor
do { const r = await api('GET', `/workflows?limit=100${cursor ? '&cursor=' + cursor : ''}`); existentes.push(...r.data); cursor = r.nextCursor } while (cursor)
const NOMBRES = ['Zero Risk — Cadena · estrategia (sub-flujo · CC#1)', 'Zero Risk — Cadena · calendario (sub-flujo · CC#1)', 'Zero Risk — Cadena · fechas especiales (sub-flujo · CC#1)', 'Zero Risk — Cadena · vigía (reloj 2×/día · CC#1)', 'Zero Risk — Cadena · puerta (webhook · CC#1)', 'Zero Risk — Cadena · parte por filas (copia de Brief · CC#1)', '[COPIA INACTIVA · sin cambios · referencia] ' + leerVivo(`${ID_PLAN}.json`).name]
const ya = existentes.filter((w) => NOMBRES.includes(w.name))
if (ya.length) { console.error('🔴 ya existen flujos con estos nombres (no se duplica):', ya.map((w) => `${w.name} (${w.id}, activo: ${w.active})`).join(' | ')); process.exit(1) }

const parteViva = leerVivo(`${ID_PARTE}.json`), planViva = leerVivo(`${ID_PLAN}.json`)
const prueba = construirFlujos({ parteViva, planViva })
console.log('2 · plan de creación (todos SIN active):')
for (const [k, w] of Object.entries(prueba)) console.log(`   ${k} · ${w.nodes.length} nodos · ${w.name}`)
if (!ejecutar) { console.log('\n(plan solamente: no se creó nada · agregar --ejecutar)'); process.exit(0) }

const ids = {}
const crear = async (clave, flujo) => {
  const { name, nodes, connections, settings } = flujo
  const r = await api('POST', '/workflows', { name, nodes, connections, settings })
  if (r.active === true) throw new Error(`🔴 ${name} quedó ACTIVO: esto no debía pasar`)
  ids[clave] = r.id
  console.log(`   creado ${clave} → ${r.id} (activo: ${r.active})`)
  return r.id
}
console.log('3 · creando …')
const base = construirFlujos({})
await crear('estrategia', base['cadena-estrategia'])
await crear('calendario', base['cadena-calendario'])
await crear('fechas', base['cadena-fechas'])
await crear('vigia', base['cadena-vigia'])
const conIds = construirFlujos({ ids: { estrategia: ids.estrategia, calendario: ids.calendario, fechas: ids.fechas, puerta: '@@ID_PUERTA@@' } })
await crear('puerta', conIds['cadena-puerta'])
const finales = construirFlujos({ ids: { estrategia: ids.estrategia, calendario: ids.calendario, fechas: ids.fechas, puerta: ids.puerta }, parteViva, planViva })
await crear('parte', finales['cadena-parte-por-filas'])
await crear('copia_plan', finales['copia-plan-X9F0'])

console.log('4 · verificando que NADA quedó activo y que los vivos siguen igual …')
for (const [k, id] of Object.entries(ids)) {
  const w = await api('GET', `/workflows/${id}`)
  if (w.active) throw new Error(`🔴 ${k} (${id}) está ACTIVO`)
  console.log(`   ${k} · ${w.nodes.length} nodos · activo: ${w.active}`)
}
for (const [id, f] of [[ID_PARTE, `${ID_PARTE}.json`], [ID_PLAN, `${ID_PLAN}.json`]]) {
  const vivo = await api('GET', `/workflows/${id}`)
  if (huella(vivo) !== huella(leerVivo(f))) throw new Error(`🔴 el flujo vivo ${id} cambió durante la creación`)
}
console.log('   los dos flujos vivos siguen idénticos')

const salida = { creados: ids, fecha: new Date().toISOString() }
fs.writeFileSync(path.join(AQUI, 'flujos-creados.json'), JSON.stringify(salida, null, 1))
const lista = [ids.estrategia, ids.calendario, ids.fechas, ids.puerta, ids.vigia, ids.parte]
console.log('\n5 · SQL para aplicar JUNTO con la migración (NO se aplicó):\n')
console.log(`INSERT INTO public.cadena_config (clave, valor) VALUES ('flujos', '${JSON.stringify(lista)}'::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now();`)
console.log(`INSERT INTO public.cadena_config (clave, valor) VALUES ('puerta_workflow_id', '"${ids.puerta}"'::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now();`)
