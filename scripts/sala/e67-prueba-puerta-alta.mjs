#!/usr/bin/env node
/**
 * E67 · LA PRUEBA GRATIS DE LA PUERTA DEL ALTA · lista para correr apenas se encienda.
 *
 * Qué prueba (sin gastar · el alta muere en el PRIMER nodo, antes de cualquier agente):
 *   1. `POST {}` al webhook del alta          → rechazo · corrida en error en el guarda · 0 nodos de gasto.
 *   2. `POST {trigger_source: 'sala-router-dispatch'}` SIN llave → rechazo igual (la marca ya no abre).
 *   3. (opcional · --con-llave) `POST` con la llave correcta y SIN marca → rechazo (llave sola no abre).
 *      ⚠️ NO manda llave + marca juntas: eso arrancaría un alta pagada.
 *
 * Verifica en el motor (API pública) que la última corrida del alta:
 *   - status `error`
 *   - lastNodeExecuted === '[MODELB] Dispatch-único Guard · scoped al run'
 *   - runData sólo contiene el webhook y el guarda (cero nodos de gasto)
 *   - la respuesta HTTP hacia afuera NO trae el mensaje del guarda (mudo hacia afuera)
 *
 * Uso:  node scripts/sala/e67-prueba-puerta-alta.mjs            (lee .env.local: N8N_BASE_URL · N8N_API_KEY)
 *       node scripts/sala/e67-prueba-puerta-alta.mjs --con-llave (agrega la prueba 3 · lee SALA_DISPATCH_KEY)
 * Si el alta está APAGADA, el webhook responde 404 y la prueba se declara NO EJECUTABLE (no falla en falso).
 */
import { readFileSync, existsSync } from 'node:fs'

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/+$/, '')
const KEY = process.env.N8N_API_KEY
const ALTA = 'LyVoKcrypS5uLyuu'
const GUARD = '[MODELB] Dispatch-único Guard · scoped al run'
const WEBHOOK = `${N8N}/webhook/zero-risk/deal-won-onboarding`
const CON_LLAVE = process.argv.includes('--con-llave')
if (!KEY) { console.error('falta N8N_API_KEY'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p) => (await fetch(`${N8N}/api/v1${p}`, { headers: { 'X-N8N-API-KEY': KEY } })).json()

async function ultimaCorrida() {
  const r = await api(`/executions?workflowId=${ALTA}&limit=1`)
  return r.data?.[0]?.id ?? null
}

async function sonda(nombre, body, headers = {}) {
  const antes = await ultimaCorrida()
  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const texto = await res.text()
  if (res.status === 404) return { nombre, ejecutable: false, detalle: 'el alta está APAGADA (404) · la prueba se corre después de encender' }
  await sleep(4000)
  const id = await ultimaCorrida()
  if (!id || id === antes) return { nombre, ok: false, detalle: `no apareció corrida nueva (HTTP ${res.status})` }
  const e = await api(`/executions/${id}?includeData=true`)
  const rd = e.data?.resultData ?? {}
  const nodos = Object.keys(rd.runData ?? {})
  const soloPuerta = nodos.every((n) => n === 'Webhook: Deal Won' || n === GUARD)
  const mudo = !texto.includes('ALTA_') && !texto.includes('llave') && !texto.includes('trigger_source')
  const ok = e.status === 'error' && rd.lastNodeExecuted === GUARD && soloPuerta && mudo
  return {
    nombre, ok, ejecutable: true, corrida: id, status: e.status, http: res.status,
    ultimo_nodo: rd.lastNodeExecuted, nodos_corridos: nodos, mudo_hacia_afuera: mudo,
    motivo_adentro: rd.error?.message?.slice(0, 120) ?? null,
  }
}

const resultados = []
resultados.push(await sonda('1 · POST {} · sin nada', {}))
resultados.push(await sonda('2 · marca copiada · SIN llave', { trigger_source: 'sala-router-dispatch', client_name: 'sonda-e67' }))
if (CON_LLAVE) {
  const k = process.env.SALA_DISPATCH_KEY
  if (!k) console.error('--con-llave pedido pero falta SALA_DISPATCH_KEY en el entorno')
  else resultados.push(await sonda('3 · llave correcta · SIN marca', { client_name: 'sonda-e67' }, { 'x-sala-dispatch-key': k }))
}

for (const r of resultados) console.log(JSON.stringify(r, null, 2))
const noEjecutable = resultados.some((r) => r.ejecutable === false)
const todasOk = resultados.every((r) => r.ok === true)
console.log('\nVEREDICTO ·', noEjecutable ? 'NO EJECUTABLE (alta apagada)' : todasOk ? 'PUERTA CERRADA · rechaza mudo hacia afuera y con motivo adentro · 0 gasto' : '🔴 LA PUERTA NO CIERRA · NO HAY BOLITA')
process.exit(noEjecutable ? 3 : todasOk ? 0 : 1)
