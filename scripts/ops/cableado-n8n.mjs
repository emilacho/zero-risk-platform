#!/usr/bin/env node
/**
 * CABLEADO ENTRE FLUJOS DE n8n (CC#3 · 19-oct · arreglo 4 de «arreglos de la cadena 1-5»). SOLO LECTURA: no ejecuta, no activa, no escribe.
 *
 * Detecta el corte que dejó al calendario sin llegar al brief: un flujo ENCENDIDO que llama a un webhook (`…/zero-risk/<ruta>`) cuyo flujo está APAGADO
 * o no existe. n8n registra un webhook de producción solo mientras su flujo está activo; llamarlo apagado da 404 y el sobre se pierde.
 *
 *   node --env-file=.env.local scripts/ops/cableado-n8n.mjs [--json] [--todo] [--solo <regex del nombre del flujo que llama>]   (--todo también lista los enlaces sanos)
 *   sale con código 1 si hay algún enlace roto entre flujos encendidos.
 *
 * La lógica es pura (`cableado(flujos)`): los flujos son `{ id, name, active, nodes: [{ type, name, parameters }] }` tal como los devuelve la API de n8n.
 */
import { pathToFileURL } from 'node:url'

const TIPO_WEBHOOK = 'n8n-nodes-base.webhook'
const RE_LLAMADA = /\/?zero-risk\/([a-z0-9][a-z0-9_-]*(?:\/[a-z0-9_-]+)*)/gi

const norm = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '').toLowerCase()

/** rutas de webhook que un flujo ATIENDE: `zero-risk/oficina` → «oficina» (acepta la ruta con o sin el prefijo) */
export function rutasQueAtiende(flujo) {
  const out = []
  for (const n of flujo.nodes ?? []) if (n.type === TIPO_WEBHOOK && n.parameters?.path) out.push(norm(n.parameters.path).replace(/^zero-risk\//, ''))
  return out
}

/** rutas de webhook que un flujo LLAMA: busca `zero-risk/<ruta>` en los parámetros de nodos que no son su propio webhook de entrada (HTTP, código, esperas…) */
export function rutasQueLlama(flujo) {
  const out = new Map()
  for (const n of flujo.nodes ?? []) {
    if (n.type === TIPO_WEBHOOK || n.type === 'n8n-nodes-base.stickyNote') continue
    const texto = JSON.stringify(n.parameters ?? {})
    for (const m of texto.matchAll(RE_LLAMADA)) {
      const ruta = norm(m[1])
      // «/api/…» de la plataforma no es un webhook de n8n: las direcciones de la API no llevan `zero-risk/` delante, pero se descarta lo que cuelgue de /api/ por si acaso
      const antes = texto.slice(Math.max(0, m.index - 6), m.index)
      if (/\/api$/.test(antes)) continue
      if (!out.has(ruta)) out.set(ruta, n.name)
    }
  }
  return out
}

/**
 * Para cada flujo ENCENDIDO que llama a una ruta de webhook:
 *   ok               → hay al menos un flujo ENCENDIDO que atiende esa ruta
 *   flujo_apagado    → la atiende solo un flujo apagado (el sobre da 404)
 *   sin_flujo        → ningún flujo la atiende
 * Los flujos apagados no cuentan como quien llama (no corren). Una llamada a la ruta propia se ignora.
 */
export function cableado(flujos) {
  const atiende = new Map() // ruta → [{ id, name, active }]
  for (const f of flujos) for (const r of rutasQueAtiende(f)) atiende.set(r, [...(atiende.get(r) ?? []), { id: f.id, name: f.name, active: f.active === true }])
  const enlaces = []
  for (const f of flujos) {
    if (f.active !== true) continue
    const propias = new Set(rutasQueAtiende(f))
    for (const [ruta, nodo] of rutasQueLlama(f)) {
      if (propias.has(ruta)) continue
      const destinos = atiende.get(ruta) ?? []
      const vivo = destinos.find((d) => d.active)
      const estado = vivo ? 'ok' : destinos.length ? 'flujo_apagado' : 'sin_flujo'
      enlaces.push({ desde: { id: f.id, name: f.name, nodo }, ruta, estado, hacia: (vivo ?? destinos[0]) ? { id: (vivo ?? destinos[0]).id, name: (vivo ?? destinos[0]).name } : null })
    }
  }
  return { enlaces, rotos: enlaces.filter((e) => e.estado !== 'ok') }
}

async function main() {
  const args = process.argv.slice(2)
  const quiere = (n) => args.includes(n)
  const solo = args.indexOf('--solo') >= 0 ? new RegExp(args[args.indexOf('--solo') + 1], 'i') : null
  const BASE = (process.env.N8N_BASE_URL || '').replace(/\/$/, ''), KEY = process.env.N8N_API_KEY
  if (!BASE || !KEY) { console.error('faltan N8N_BASE_URL / N8N_API_KEY (usa node --env-file=.env.local …)'); process.exit(2) }
  const api = async (p) => { const r = await fetch(BASE + '/api/v1' + p, { headers: { 'X-N8N-API-KEY': KEY } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json() }
  const lista = []
  let cursor = ''
  for (let i = 0; i < 20; i++) { const j = await api('/workflows?limit=100' + (cursor ? '&cursor=' + cursor : '')); lista.push(...j.data); cursor = j.nextCursor; if (!cursor) break }
  const flujos = []
  for (const w of lista) flujos.push(await api('/workflows/' + w.id))
  const r = cableado(flujos)
  const vista = solo ? { ...r, enlaces: r.enlaces.filter((e) => solo.test(e.desde.name)), rotos: r.rotos.filter((e) => solo.test(e.desde.name)) } : r
  if (quiere('--json')) console.log(JSON.stringify(vista, null, 1))
  else {
    console.log(`flujos ${flujos.length} · encendidos ${flujos.filter((f) => f.active).length} · enlaces entre flujos encendidos ${vista.enlaces.length} · ROTOS ${vista.rotos.length}`)
    for (const e of vista.rotos) console.log(`  ✗ ${e.estado.padEnd(13)} «${e.desde.name}» (${e.desde.nodo}) → zero-risk/${e.ruta}${e.hacia ? '  [' + e.hacia.name + ' · ' + e.hacia.id + ']' : ''}`)
    if (quiere('--todo')) for (const e of vista.enlaces.filter((x) => x.estado === 'ok')) console.log(`  ✓ «${e.desde.name}» → zero-risk/${e.ruta}  [${e.hacia.name}]`)
  }
  process.exit(vista.rotos.length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(String(e)); process.exit(2) })
