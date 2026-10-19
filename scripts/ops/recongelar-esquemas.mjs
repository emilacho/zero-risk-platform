#!/usr/bin/env node
/**
 * Re-congelar los esquemas de Apify de forma ORDENADA (19-oct · cuando el relector del lunes avisa que un raspador cambió).
 *   node scripts/ops/recongelar-esquemas.mjs leer                        · compara lo congelado con Apify HOY (solo lectura · US$ 0); no escribe nada
 *   node scripts/ops/recongelar-esquemas.mjs aplicar [--ejecutar]        · sin --ejecutar dice qué haría; con él: respalda los dos flujos, actualiza el dato y los dos flujos
 *   node scripts/ops/recongelar-esquemas.mjs restaurar <carpeta> --ejecutar · deja los dos flujos como en ese respaldo (el dato se restaura con git)
 * Fuente única: scripts/worker-staging/esquemas-apify/esquemas.json (esquema congelado de cada función + `renombres` + `retirados`). De ahí salen el validador del Servicio (3lyknrP3PoS2KzUf)
 * y el relector del lunes (Smu6A18qr1XJ2uzB). Un campo que se fue y tiene renombre en `renombres` NO es grave (el validador lo traduce); uno que se fue SIN renombre pasa a `retirados`
 * y el Servicio deja de llamar a ese raspador con él («sin dato por cambio del raspador») hasta que alguien escriba el renombre aquí y vuelva a correr `aplicar`.
 * Respaldo: el flujo TAL CUAL lo devuelve la API, en <carpeta> (por omisión .../esquemas-apify/respaldos/<fecha-hora>). Ni el estado activo ni las conexiones previas se tocan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ARCHIVO_DE_ESQUEMAS, leerEsquemas, reconciliar, servicioConEsquemasVivos, relectorConEsquemasVivos } from '../worker-staging/construir-esquemas-vivos.mjs'

export const FLUJO_SERVICIO = '3lyknrP3PoS2KzUf'
export const FLUJO_RELECTOR = 'Smu6A18qr1XJ2uzB'
const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/')
const N8N_FLUJO = HERE + 'n8n-flujo.mjs'

const args = process.argv.slice(2)
const [orden, extra] = args
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const ejecutar = args.includes('--ejecutar')
const envPath = flag('--env') ?? 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')

/** el esquema de hoy de cada función, directo de Apify (GET builds/default: gratis) */
export async function esquemasDeHoy(datos, traer = fetch, token = g('APIFY_API_TOKEN')) {
  const hoy = {}
  for (const [fn, e] of Object.entries(datos.funciones)) {
    try {
      const r = await traer(`https://api.apify.com/v2/acts/${e.actor}/builds/default`, { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      const inp = j?.data?.actorDefinition?.input
      hoy[fn] = inp ? { acepta: Object.keys(inp.properties || {}), obligatorios: inp.required || [] } : null
    } catch { hoy[fn] = null }
  }
  return hoy
}

const flujoCli = (...a) => { const r = spawnSync(process.execPath, [N8N_FLUJO, ...a, '--env', envPath], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stdout + r.stderr).trim().slice(0, 400)); return r.stdout.trim() }

function resumen(rec) {
  const out = [`congelado el ${rec.datos.congelado_en} · ${Object.keys(rec.datos.funciones).length} funciones · cambios: ${rec.cambios.length} · graves (sin mapa): ${rec.graves}`]
  for (const c of rec.cambios) out.push(`  ${c.grave ? '🔴' : '🟡'} ${c.funcion} (${c.actor}) · ya no existen: ${c.campos_que_ya_no_existen.join(', ') || '—'} · con mapa: ${c.resueltos_por_mapa.map((r) => `${r.de}→${r.a}`).join(', ') || '—'} · SIN mapa: ${c.sin_mapa.join(', ') || '—'} · obligatorios nuevos: ${c.obligatorios_nuevos.join(', ') || '—'} · campos nuevos: ${c.campos_nuevos.join(', ') || '—'}`)
  if (rec.ilegibles.length) out.push(`  ⚠ no se pudo leer: ${rec.ilegibles.join(', ')} (esas quedan como estaban)`)
  return out.join('\n')
}

async function main() {
  const datos = leerEsquemas()
  if (orden === 'leer' || orden === 'aplicar') {
    const rec = reconciliar(datos, await esquemasDeHoy(datos))
    console.log(resumen(rec))
    if (orden === 'leer') return
    if (!rec.hay_cambios) { console.log('nada que re-congelar: lo congelado coincide con Apify hoy'); return }
    const carpeta = extra && !extra.startsWith('--') ? extra : HERE + '../worker-staging/esquemas-apify/respaldos/' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    if (!ejecutar) { console.log(`\nsin --ejecutar no se toca nada. Con él: respaldo en ${path.resolve(carpeta)}, dato nuevo y los dos flujos (${FLUJO_SERVICIO}, ${FLUJO_RELECTOR}).`); return }
    fs.mkdirSync(carpeta, { recursive: true })
    const resp = { [FLUJO_SERVICIO]: path.join(carpeta, 'servicio-ANTES.json'), [FLUJO_RELECTOR]: path.join(carpeta, 'relector-ANTES.json') }
    for (const [id, archivo] of Object.entries(resp)) console.log(flujoCli('respaldar', id, archivo))
    const nuevos = {
      [FLUJO_SERVICIO]: servicioConEsquemasVivos(JSON.parse(fs.readFileSync(resp[FLUJO_SERVICIO], 'utf8')), rec.datos),
      [FLUJO_RELECTOR]: relectorConEsquemasVivos(JSON.parse(fs.readFileSync(resp[FLUJO_RELECTOR], 'utf8')), rec.datos),
    }
    const hechos = []
    try {
      for (const [id, flujo] of Object.entries(nuevos)) {
        const archivo = path.join(carpeta, id === FLUJO_SERVICIO ? 'servicio-NUEVO.json' : 'relector-NUEVO.json')
        fs.writeFileSync(archivo, JSON.stringify(flujo))
        console.log(flujoCli('restaurar', id, archivo, '--ejecutar')); hechos.push(id)
      }
    } catch (e) {
      console.error('FALLÓ: ' + e.message + ' · se devuelven los flujos ya cambiados a su respaldo')
      for (const id of hechos) console.error(flujoCli('restaurar', id, resp[id], '--ejecutar'))
      process.exit(1)
    }
    fs.writeFileSync(ARCHIVO_DE_ESQUEMAS, JSON.stringify(rec.datos, null, 1) + '\n')
    console.log(`listo · dato actualizado (${ARCHIVO_DE_ESQUEMAS}) · reversa: node scripts/ops/recongelar-esquemas.mjs restaurar "${path.resolve(carpeta)}" --ejecutar`)
    return
  }
  if (orden === 'restaurar') {
    if (!extra || extra.startsWith('--')) { console.error('uso: restaurar <carpeta de respaldo> --ejecutar'); process.exit(2) }
    for (const [id, f] of [[FLUJO_SERVICIO, 'servicio-ANTES.json'], [FLUJO_RELECTOR, 'relector-ANTES.json']]) console.log(flujoCli('restaurar', id, path.join(extra, f), ...(ejecutar ? ['--ejecutar'] : [])))
    return
  }
  console.error('uso: recongelar-esquemas.mjs leer | aplicar [--ejecutar] | restaurar <carpeta> --ejecutar'); process.exit(2)
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().then(() => new Promise((r) => setTimeout(r, 100))).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1) })
