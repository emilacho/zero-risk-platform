#!/usr/bin/env node
/**
 * AUDITORÍA DE FLUJOS VIVOS · paso 2 del cerebro · SOLO LECTURA (solo hace GET a la API de n8n).
 *
 * El repositorio no ve los flujos VIVOS de n8n. Este guion los lee todos (activos e inactivos) y falla si alguno:
 *   · nombra las tablas nuevas del cerebro (`cerebro_ingresos`, `cerebro_fichas`) o las 4 columnas nuevas de `client_social_images`
 *     (`que_muestra`, `producto_visto`, `etiquetada_en`, `etiqueta_modelo`): nadie más que el portero del cerebro las toca;
 *   · pide TODAS las columnas (`select=*`) de `client_social_images`: un campo más no puede romper a un lector.
 * Y deja escritas las VERSIONES de la pieza, la planeación y el Servicio de Apify, para comparar antes/después de publicar.
 *
 * Uso:  node scripts/audit/cerebro-tablas-no-las-usa-nadie.mjs [--env-file ruta/.env.local]
 *       (usa N8N_API_KEY y N8N_BASE_URL del entorno o del archivo)    → exit 0 si todo bien, 1 si hay infracciones.
 * Doc:  docs/MAPA-2026-10-06-tablas-del-cerebro.md (archivo central)
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export const NOMBRES_NUEVOS = /\b(cerebro_ingresos|cerebro_fichas|que_muestra|producto_visto|etiquetada_en|etiqueta_modelo)\b/
export const FLUJOS_A_VIGILAR = { lVCLzxQCKNkd3uS0: 'pieza', X9F0zp6LQ2xGEYVS: 'planeacion', '3lyknrP3PoS2KzUf': 'apify_service' }

export function usaSelectEstrella(texto) {
  return /client_social_images[^\n"'`]{0,300}[?&]select=\*/.test(texto) || /[?&]select=\*[^\n"'`]{0,300}client_social_images/.test(texto)
}

/** @param {Array<{id:string,name?:string,active?:boolean,versionId?:string,nodes?:unknown[]}>} flujos */
export function revisarFlujos(flujos) {
  const infracciones = []
  const versiones = {}
  for (const f of flujos) {
    if (FLUJOS_A_VIGILAR[f.id]) versiones[f.id] = f.versionId ?? null
    for (const n of f.nodes ?? []) {
      const texto = JSON.stringify(n)
      const nuevo = texto.match(NOMBRES_NUEVOS)
      if (nuevo) infracciones.push({ flujo: f.id, nombre: f.name ?? '', activo: f.active === true, nodo: n.name ?? '', tipo: 'nombra_algo_del_cerebro', detalle: nuevo[1] })
      if (usaSelectEstrella(texto)) infracciones.push({ flujo: f.id, nombre: f.name ?? '', activo: f.active === true, nodo: n.name ?? '', tipo: 'select_estrella_sobre_client_social_images', detalle: 'select=*' })
    }
  }
  return { ok: infracciones.length === 0, flujos_revisados: flujos.length, activos: flujos.filter((f) => f.active).length, infracciones, versiones }
}

function leerEntorno(ruta) {
  const env = { ...process.env }
  if (ruta && fs.existsSync(ruta)) for (const l of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  return env
}

async function main() {
  const i = process.argv.indexOf('--env-file')
  const env = leerEntorno(i > -1 ? process.argv[i + 1] : undefined)
  if (!env.N8N_API_KEY || !env.N8N_BASE_URL) { console.error('FALTA N8N_API_KEY o N8N_BASE_URL'); process.exit(2) }
  const base = env.N8N_BASE_URL.replace(/\/$/, '')
  const get = async (p) => { const r = await fetch(base + p, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json() }
  const flujos = []
  let cursor = ''
  do { const r = await get('/api/v1/workflows?limit=100' + (cursor ? '&cursor=' + cursor : '')); flujos.push(...r.data); cursor = r.nextCursor } while (cursor)
  const r = revisarFlujos(flujos)
  console.log(JSON.stringify({ ...r, leido_en: new Date().toISOString() }, null, 1))
  process.exit(r.ok ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(String(e)); process.exit(2) })
