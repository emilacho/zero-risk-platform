#!/usr/bin/env node
/**
 * E79 · LA PRUEBA GRATIS DE LA ENTRADA DE TRATO CERRADO (llamador IXF3mOG0PRZlNR4a).
 *
 *   1. pedido SIN llave            → muere MUDO en «PORTERO · llave del trato cerrado» · 0 ítems · SIN aviso · 0 gasto
 *   2. pedido CON llave · cliente INVENTADO (uuid al azar) → rechazo RUIDOSO en «GUARDA · el cliente existe» · 0 gasto ·
 *      CON aviso (o suprimido por el freno si hubo otro igual hace <10 min) · el sobre NUNCA llega a la puerta de la sala
 *   ⚠️ NUNCA manda llave + cliente real: eso deja un sobre en la sala y, con la cadena encendida, paga.
 *
 * Uso:  node scripts/sala/e79-prueba-entrada-trato-cerrado.mjs              (sólo la prueba 1 · lee .env.local: N8N_BASE_URL · N8N_API_KEY)
 *       DEAL_WON_WEBHOOK_KEY=… node scripts/sala/e79-prueba-entrada-trato-cerrado.mjs --con-llave   (agrega la prueba 2)
 * Exit 0 = entrada cerrada como debe · 1 = algo no cierra · 2 = no se pudo medir.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/+$/, '')
const KEY = process.env.N8N_API_KEY
const LLAMADOR = 'IXF3mOG0PRZlNR4a', AVISADOR = '5fkPLbZvQsQa1bcd'
const PORTERO = 'PORTERO · llave del trato cerrado', GCLI = 'GUARDA · el cliente existe', DEJAR = 'Dejar el sobre en la puerta de la sala'
const WEBHOOK = `${N8N}/webhook/zero-risk/deal-won`
const CON_LLAVE = process.argv.includes('--con-llave')
if (!KEY) { console.error('falta N8N_API_KEY'); process.exit(2) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = async (p) => (await fetch(`${N8N}/api/v1${p}`, { headers: { 'X-N8N-API-KEY': KEY } })).json()
const ultima = async (wf) => (await api(`/executions?workflowId=${wf}&limit=1`)).data?.[0]?.id ?? null

async function sonda(nombre, body, headers, esperado) {
  const antesLl = await ultima(LLAMADOR), antesAv = await ultima(AVISADOR)
  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  await res.text(); await sleep(8000)
  const id = await ultima(LLAMADOR)
  if (!id || id === antesLl) return { nombre, ok: false, detalle: `no apareció corrida nuevа del llamador (HTTP ${res.status})` }
  const e = await api(`/executions/${id}?includeData=true`)
  const rd = e.data?.resultData ?? {}
  const nodos = Object.keys(rd.runData ?? {})
  const avisoNuevo = (await ultima(AVISADOR)) !== antesAv
  const llegoALaPuerta = nodos.includes(DEJAR)
  const r = { nombre, corrida: id, status: e.status, ultimo_nodo: rd.lastNodeExecuted, nodos_corridos: nodos, llego_a_la_puerta: llegoALaPuerta, aviso_nuevo: avisoNuevo, motivo: rd.error?.message?.slice(0, 120) ?? null }
  r.ok = esperado(r)
  return r
}

const resultados = []
resultados.push(await sonda('1 · sin llave', { client_id: randomUUID(), tenant_id: randomUUID(), client_name: 'sonda-e79', deal_id: 'E79-SONDA' }, {},
  (r) => r.status === 'success' && r.ultimo_nodo === PORTERO && !r.llego_a_la_puerta && !r.aviso_nuevo))
if (CON_LLAVE) {
  const k = process.env.DEAL_WON_WEBHOOK_KEY
  if (!k) console.error('--con-llave pedido pero falta DEAL_WON_WEBHOOK_KEY en el entorno')
  else resultados.push(await sonda('2 · con llave · cliente inventado', { client_id: randomUUID(), tenant_id: randomUUID(), client_name: 'sonda-e79', deal_id: 'E79-SONDA-2', closed_at: '2026-09-17' }, { 'x-deal-won-key': k },
    (r) => r.status === 'error' && r.ultimo_nodo === GCLI && !r.llego_a_la_puerta))
}
for (const r of resultados) console.log(JSON.stringify(r, null, 2))
const ok = resultados.every((r) => r.ok)
console.log('\nVEREDICTO ·', ok ? 'ENTRADA CERRADA · sin llave muere mudo y sin aviso · cliente inventado no llega a la puerta · 0 gasto' : '🔴 LA ENTRADA NO CIERRA · NO HAY BOLITA')
process.exit(ok ? 0 : 1)
