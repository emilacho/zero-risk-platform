#!/usr/bin/env node
/**
 * Respaldo exacto y REVERSA de un flujo de n8n (relevo 51 · el alta y el Servicio de Apify).
 *   node scripts/ops/n8n-flujo.mjs respaldar <id> <archivo.json> [--env <ruta .env.local>]
 *   node scripts/ops/n8n-flujo.mjs diferencia <id> <archivo.json>            · compara el flujo VIVO con el respaldo (nodo por nodo)
 *   node scripts/ops/n8n-flujo.mjs restaurar <id> <archivo.json> --ejecutar  · sin --ejecutar solo dice qué cambiaría
 * El respaldo guarda el flujo TAL CUAL lo devuelve la API (nodos, conexiones, ajustes, estado activo). Antes de guardarlo se busca
 * cualquier llave pegada (64 hex, JWT, sk-, xox, Bearer literal): si hay, NO se escribe el archivo (hay que guardarlo fuera de la bóveda).
 * Restaurar NO cambia si el flujo está activo o no: solo nombre, nodos, conexiones y ajustes.
 */
import fs from 'node:fs'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const [orden, id, archivo] = args
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const envPath = flag('--env') ?? 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const BASE = g('N8N_BASE_URL')?.replace(/\/$/, '')
const KEY = g('N8N_API_KEY')
if (!orden || !id || !archivo || !BASE || !KEY) { console.error('uso: n8n-flujo.mjs <respaldar|diferencia|restaurar> <id> <archivo.json> [--ejecutar]; faltan N8N_BASE_URL / N8N_API_KEY'); process.exit(2) }

// salir con una pausa corta: process.exit justo tras un fetch dispara un aviso de libuv en Windows
const salir = async (c) => { await new Promise((r) => setTimeout(r, 100)); process.exit(c) }
const api = async (m, p, body) => {
  const r = await fetch(`${BASE}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 200)}`)
  return JSON.parse(t)
}
const LLAVES = [/[0-9a-f]{64}/, /eyJ[A-Za-z0-9_-]{20,}/, /(?<![A-Za-z-])sk-[A-Za-z0-9_-]{20,}/, /xox[a-z]-[A-Za-z0-9-]{10,}/, /Bearer [A-Za-z0-9._-]{25,}/, /apify_api_[A-Za-z0-9]+/]
const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n')
const huella = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12)
const canon = (n) => JSON.stringify({ t: n.type, p: JSON.parse(JSON.stringify(n.parameters ?? {}), (_k, v) => (typeof v === 'string' ? lf(v) : v)), e: n.onError ?? null, r: n.retryOnFail ?? null, to: n.executeOnce ?? null, d: n.disabled ?? null })

function diferencia(a, b) {
  const A = new Map(a.nodes.map((n) => [n.name, n])), B = new Map(b.nodes.map((n) => [n.name, n]))
  const cambia = [], nuevos = [...B.keys()].filter((k) => !A.has(k)), quitados = [...A.keys()].filter((k) => !B.has(k))
  for (const [k, n] of A) if (B.has(k) && canon(n) !== canon(B.get(k))) cambia.push(k)
  const con = huella(a.connections) !== huella(b.connections)
  return { cambian: cambia, nuevos, quitados, conexiones_distintas: con, nombre_distinto: a.name !== b.name, ajustes_distintos: huella(a.settings) !== huella(b.settings), iguales: !cambia.length && !nuevos.length && !quitados.length && !con && a.name === b.name }
}

const vivo = await api('GET', `/workflows/${id}`)
if (orden === 'respaldar') {
  const s = JSON.stringify(vivo, null, 1)
  const hit = LLAVES.filter((r) => r.test(s)).map(String)
  if (hit.length) { console.error('HAY LLAVES PEGADAS (' + hit.join(' ') + '): no se escribe el archivo; guárdalo fuera de la bóveda'); await salir(3) }
  fs.writeFileSync(archivo, s)
  console.log(`respaldado ${vivo.name} · ${vivo.nodes.length} nodos · activo=${vivo.active} · sha256 ${crypto.createHash('sha256').update(s).digest('hex')}`)
} else {
  const resp = JSON.parse(fs.readFileSync(archivo, 'utf8'))
  if (resp.id !== id) { console.error(`el respaldo es del flujo ${resp.id}, no de ${id}`); await salir(4) }
  const d = diferencia(resp, vivo)
  if (orden === 'diferencia') { console.log(JSON.stringify(d, null, 1)); await salir(d.iguales ? 0 : 1) }
  if (orden === 'restaurar') {
    console.log('el vivo difiere del respaldo en:', JSON.stringify(d))
    if (!args.includes('--ejecutar')) { console.log('(sin --ejecutar: no se cambió nada)'); await salir(0) }
    const { name, nodes, connections, settings } = resp
    await api('PUT', `/workflows/${id}`, { name, nodes, connections, settings })
    const despues = await api('GET', `/workflows/${id}`)
    const f = diferencia(resp, despues)
    console.log('tras restaurar:', JSON.stringify(f), '· activo =', despues.active, '(no se toca)')
    await salir(f.iguales ? 0 : 5)
  }
  console.error('orden desconocida'); await salir(2)
}
