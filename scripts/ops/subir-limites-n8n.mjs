#!/usr/bin/env node
/**
 * REGLA VIVA 10 (Emilio, 02-nov) · límites técnicos al máximo en n8n. Sube a 800 s (el máximo de Vercel `maxDuration`) la espera de las
 * llamadas HTTP de los flujos ACTIVOS cuya espera sea menor, y pone 800 s a las llamadas a empleados (`/api/agents/run-sdk`) que no tengan ninguna.
 * NO toca topes de GASTO, ni reintentos, ni cabeceras. Idempotente: segunda pasada = sin cambios.
 *   node scripts/ops/subir-limites-n8n.mjs plan                        · solo lectura: lista «antes → después» por flujo y nodo
 *   node scripts/ops/subir-limites-n8n.mjs aplicar [--solo <id,id>]    · exige n8n 0/0; respalda cada flujo ANTES (fuera de la bóveda y del repo), cambia, re-registra el horario y verifica
 *   node scripts/ops/subir-limites-n8n.mjs restaurar <carpeta>         · vuelve cada flujo al respaldo de esa carpeta
 * Los respaldos van a la carpeta `OUT` (por omisión `%TEMP%/respaldos-limites-n8n/<fecha>`): algunos flujos tienen llaves pegadas, por eso NO se guardan en git ni en la bóveda.
 * Lee N8N_BASE_URL y N8N_API_KEY del entorno (doppler run -p zero-risk -c prd -- node …).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MAXIMO_MS = 800000
const NB = (process.env.N8N_BASE_URL || '').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const api = async (m, p, b) => {
  const r = await fetch(NB + '/api/v1' + p, { method: m, headers: { 'X-N8N-API-KEY': NK, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  const t = await r.text(); if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : {}
}
export const esLlamadaAEmpleado = (n) => n.type === 'n8n-nodes-base.httpRequest' && String((n.parameters && n.parameters.url) || '').includes('/api/agents/run-sdk')
/** [{ nodo, antes, despues }] de un flujo (sin modificarlo) */
export function cambiosDe(f) {
  const out = []
  for (const n of f.nodes || []) {
    if (n.type !== 'n8n-nodes-base.httpRequest') continue
    const t = n.parameters && n.parameters.options && n.parameters.options.timeout
    if (typeof t === 'number' && t < MAXIMO_MS) out.push({ nodo: n.name, antes: t, despues: MAXIMO_MS })
    else if (t === undefined && esLlamadaAEmpleado(n)) out.push({ nodo: n.name, antes: null, despues: MAXIMO_MS })
  }
  return out
}
export function aplicarA(f) {
  const nombres = new Set(cambiosDe(f).map((c) => c.nodo))
  for (const n of f.nodes) if (nombres.has(n.name)) n.parameters.options = Object.assign({}, n.parameters.options, { timeout: MAXIMO_MS })
  return f
}
const vivas = async () => { let t = 0; for (const s of ['running', 'waiting']) t += ((await api('GET', '/executions?status=' + s + '&limit=100')).data || []).length; return t }
const activos = async () => { const o = []; let cur; do { const j = await api('GET', '/workflows?limit=100' + (cur ? '&cursor=' + cur : '')); o.push(...j.data); cur = j.nextCursor } while (cur); return o.filter((w) => w.active) }

async function main() {
  const [orden, ...resto] = process.argv.slice(2)
  if (!NB || !NK) { console.error('faltan N8N_BASE_URL / N8N_API_KEY'); process.exit(1) }
  const solo = resto.includes('--solo') ? new Set(String(resto[resto.indexOf('--solo') + 1]).split(',')) : null
  if (orden === 'plan' || orden === 'aplicar') {
    const lista = (await activos()).filter((w) => !solo || solo.has(w.id))
    const trabajo = []
    for (const w of lista) { const f = await api('GET', '/workflows/' + w.id); const c = cambiosDe(f); if (c.length) trabajo.push({ f, c }) }
    for (const { f, c } of trabajo) { console.log(f.id + ' · ' + f.name); for (const x of c) console.log('   ' + x.nodo + ' · ' + (x.antes === null ? 'sin tope' : x.antes / 1000 + ' s') + ' → ' + x.despues / 1000 + ' s') }
    console.log('FLUJOS ACTIVOS ' + lista.length + ' · CON CAMBIOS ' + trabajo.length + ' · NODOS ' + trabajo.reduce((a, t) => a + t.c.length, 0))
    if (orden === 'plan') return
    if (await vivas() !== 0) { console.error('n8n NO está en 0/0: no se aplica nada'); process.exit(2) }
    const OUT = process.env.OUT || path.join(os.tmpdir(), 'respaldos-limites-n8n', new Date().toISOString().replace(/[:.]/g, '-'))
    fs.mkdirSync(OUT, { recursive: true }); console.log('respaldos en ' + OUT)
    for (const { f } of trabajo) fs.writeFileSync(path.join(OUT, f.id + '.json'), JSON.stringify(f))
    for (const { f } of trabajo) {
      if (await vivas() !== 0) { console.error('apareció una corrida viva: me detengo antes de ' + f.id); process.exit(3) }
      const g = aplicarA(JSON.parse(JSON.stringify(f)))
      await api('PUT', '/workflows/' + f.id, { name: g.name, nodes: g.nodes, connections: g.connections, settings: g.settings })
      await api('POST', '/workflows/' + f.id + '/deactivate'); await api('POST', '/workflows/' + f.id + '/activate')
      const d = await api('GET', '/workflows/' + f.id)
      console.log((cambiosDe(d).length === 0 && d.active ? 'OK     ' : 'REVISAR ') + f.id + ' · ' + f.name)
    }
    console.log('respaldos para la vuelta atrás: ' + OUT)
  } else if (orden === 'restaurar') {
    const dir = resto[0]; if (!dir) { console.error('falta la carpeta'); process.exit(1) }
    if (await vivas() !== 0) { console.error('n8n NO está en 0/0'); process.exit(2) }
    for (const a of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const f = JSON.parse(fs.readFileSync(path.join(dir, a), 'utf8'))
      await api('PUT', '/workflows/' + f.id, { name: f.name, nodes: f.nodes, connections: f.connections, settings: f.settings })
      await api('POST', '/workflows/' + f.id + '/deactivate'); await api('POST', '/workflows/' + f.id + '/activate'); console.log('restaurado ' + f.id)
    }
  } else { console.error('uso: plan | aplicar [--solo ids] | restaurar <carpeta>'); process.exit(1) }
}
if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('subir-limites-n8n.mjs')) main().catch((e) => { console.error(e.message); process.exit(1) })
