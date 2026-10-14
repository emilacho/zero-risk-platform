#!/usr/bin/env node
/**
 * J7 · APLICAR UN ENGANCHE (o crear el flujo de prueba de pieza) · CC#1 · 14-oct · NO SE EJECUTA todavía: va después del seco y de la certificación de CC#3, UNO a la vez, en este orden: pieza → brief → calendario → estrategia → plan.
 * SIN `--aplicar` solo IMPRIME. Con `--aplicar`: n8n con 0 corriendo y 0 esperando · el flujo VIVO debe ser igual a su ANTES respaldado (`n8n-flujo.mjs diferencia`; si otro CC lo tocó, se detiene) ·
 * PUT del ARREGLADO (nunca cambia si el flujo está activo o no) · lectura de vuelta que comprueba que lo único nuevo son los nodos «JEF · …» (y, en el plan, «Plan vigente» y los retoques declarados).
 * El enganche nace APAGADO: mientras `jefatura_config` no tenga el tipo en `tipos_activos` (y al cliente en ensayo), la ruta contesta 409 y el flujo se porta como hoy.
 *
 *   node scripts/worker-staging/jefatura-j7/aplicar-enganche.mjs orden
 *   node scripts/worker-staging/jefatura-j7/aplicar-enganche.mjs brief|calendario|estrategia|plan [--aplicar]
 *   node scripts/worker-staging/jefatura-j7/aplicar-enganche.mjs pieza [--aplicar]        crea el flujo de prueba NUEVO, INACTIVO (se niega si ya existe uno con ese nombre)
 *   node scripts/worker-staging/jefatura-j7/aplicar-enganche.mjs reversa brief|calendario|estrategia|plan [--aplicar]   restaura el ANTES (con `n8n-flujo.mjs restaurar`)
 */
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { antesDe, CONSTRUCTORES, construirPruebaDePieza, FLUJOS, PRUEBA_DE_PIEZA } from './construir-enganches.mjs'
import { NOMBRES_DE_LA_PUERTA } from './gate.mjs'
import { NOMBRES_DE_LA_CADENA } from './plan-versiones.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const A = process.argv.slice(2)
const reversa = A[0] === 'reversa'
const quien = reversa ? A[1] : A[0]
const aplicar = A.includes('--aplicar')
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }
const antesRuta = (id) => join(aqui, `ANTES-${id}-2026-10-14.json`)
const paso = (t) => console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + t)
const herramienta = (...args) => spawnSync(process.execPath, [join(aqui, '..', '..', 'ops', 'n8n-flujo.mjs'), ...args], { encoding: 'utf8', env: process.env })
const api = async (m, p, body) => { const r = await fetch(`${N8N}/api/v1${p}`, { method: m, headers: HN(), body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t) }
async function enVuelo() {
  let n = 0
  for (const st of ['running', 'waiting']) { const j = await api('GET', `/executions?status=${st}&limit=50`); if (!Array.isArray(j.data)) throw new Error('no se pudo leer n8n'); n += j.data.length }
  return n
}

async function main() {
  if (!quien || quien === 'orden') {
    console.log('J7 · orden de enganche (uno a la vez, cada uno con su seco y la certificación de CC#3 antes del siguiente):')
    for (const t of ['pieza', 'brief', 'calendario', 'estrategia', 'plan']) console.log(`  ${t.padEnd(10)} ${t === 'pieza' ? 'flujo de PRUEBA nuevo (la oficina no se toca)' : `${FLUJOS[t].id} · ${FLUJOS[t].nombre}`}`)
    console.log('Cada uno nace APAGADO (409 de la ruta = idéntico a hoy). Reversa: `reversa <tipo>` o apagar el tipo en jefatura_config.tipos_activos.\nAhora no se ha tocado nada.')
    return
  }
  if (quien === 'pieza') {
    const nuevo = construirPruebaDePieza()
    paso(`crear el flujo «${PRUEBA_DE_PIEZA.nombre}» (${nuevo.nodes.length} nodos) INACTIVO, webhook ${PRUEBA_DE_PIEZA.path}`)
    if (!aplicar) return
    necesita('N8N_API_KEY')
    const lista = (await api('GET', '/workflows?limit=250')).data ?? []
    if (lista.some((w) => w.name === nuevo.name)) { console.error('se detiene: ya existe un flujo con ese nombre'); process.exit(3) }
    if ((await enVuelo()) !== 0) { console.error('se detiene: n8n tiene corridas'); process.exit(3) }
    const c = await api('POST', '/workflows', { name: nuevo.name, nodes: nuevo.nodes, connections: nuevo.connections, settings: nuevo.settings })
    console.log('creado', c.id, 'activo =', c.active === true, '(debe ser false)')
    return
  }
  const f = FLUJOS[quien]
  if (!f) { console.error('tipo desconocido: ' + quien); process.exit(2) }
  const antes = antesDe(f.id)
  const ARREGLADO = CONSTRUCTORES[quien](antes)
  if (reversa) {
    paso(`restaurar ${f.id} a su ANTES (${antes.nodes.length} nodos) con n8n-flujo.mjs restaurar`)
    if (!aplicar) return
    necesita('N8N_API_KEY')
    if ((await enVuelo()) !== 0) { console.error('se detiene: n8n tiene corridas'); process.exit(3) }
    const r = herramienta('restaurar', f.id, antesRuta(f.id), '--ejecutar'); console.log(r.stdout.trim() || r.stderr.trim()); process.exit(r.status ?? 1)
  }
  paso(`PUT de ${f.id} (${antes.nodes.length} → ${ARREGLADO.nodes.length} nodos); no cambia si está activo; solo se suman «JEF · …»${quien === 'plan' ? ', «Plan vigente» y los retoques declarados' : ''}`)
  if (!aplicar) return
  necesita('N8N_API_KEY')
  if ((await enVuelo()) !== 0) { console.error('se detiene: n8n tiene corridas (debe haber 0 corriendo y 0 esperando)'); process.exit(3) }
  const d = herramienta('diferencia', f.id, antesRuta(f.id))
  if (d.status !== 0) { console.error(`se detiene: el flujo ${f.id} vivo NO es igual a su ANTES respaldado (otro cambio debajo):\n${d.stdout}`); process.exit(4) }
  await api('PUT', `/workflows/${f.id}`, { name: ARREGLADO.name, nodes: ARREGLADO.nodes, connections: ARREGLADO.connections, settings: ARREGLADO.settings })
  const despues = await api('GET', `/workflows/${f.id}`)
  const nuevos = despues.nodes.filter((n) => !antes.nodes.some((a) => a.name === n.name)).map((n) => n.name)
  const permitidos = new Set([...NOMBRES_DE_LA_PUERTA, ...(quien === 'plan' ? NOMBRES_DE_LA_CADENA : [])])
  const raros = nuevos.filter((n) => !permitidos.has(n))
  console.log(`nodos nuevos: ${nuevos.length} · fuera de lo previsto: ${raros.length ? raros.join(', ') : 'ninguno'} · activo (no se toca): ${despues.active}`)
  if (raros.length) process.exit(5)
}
await main()
await new Promise((r) => setTimeout(r, 100))
void fs
