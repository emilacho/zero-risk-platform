#!/usr/bin/env node
// ROTAR LAS CREDENCIALES DE CABECERA GUARDADAS EN n8n con el valor que vive en Doppler: se cambia el valor DENTRO de la misma credencial (PATCH por id), así los flujos que la usan no se tocan.
// (22-oct · ENCARGO de Lenovo «credenciales guardadas en n8n expuestas».) Google es OAuth: lo reconecta Emilio, no pasa por aquí.
//
//   doppler run -p zero-risk -c prd -- node scripts/ops/rotar-credenciales-n8n.mjs --seco      (por omisión: qué haría; no cambia nada)
//   doppler run -p zero-risk -c prd -- node scripts/ops/rotar-credenciales-n8n.mjs --aplicar [--solo portero|healthchecks]
// Nunca imprime un valor. El valor sale del entorno (lo inyecta `doppler run`); si la variable no está, esa credencial se salta y se dice.
import { fileURLToPath } from 'node:url'

/** credencial de n8n → de qué variable de Doppler sale el valor y con qué nombre de cabecera se manda */
export const CREDENCIALES = {
  portero: { id: 'hKo5XOxoVHcazlc9', nombre: 'Portero · llave de los webhooks (x-portero-key)', tipo: 'httpHeaderAuth', cabecera: 'x-portero-key', variable: 'PORTERO_WEBHOOK_KEY', quien: 'ya generada por el guion del grupo C; la plataforma valida con el MISMO valor (Vercel)' },
  healthchecks: { id: 'SbwGWme9a9EHmDPG', nombre: 'Healthchecks Read API', tipo: 'httpHeaderAuth', cabecera: 'X-Api-Key', variable: 'HEALTHCHECK_API_KEY', quien: 'la crea Emilio en healthchecks.io (Project Settings → API keys) y la pega en Doppler' },
}

/** qué se haría con cada credencial, dado el entorno y la lista que devuelve n8n (sin valores) */
export function planear(env, existentes, solo = null) {
  return Object.entries(CREDENCIALES).filter(([k]) => !solo || k === solo).map(([k, c]) => {
    const enN8n = existentes.find((x) => x.id === c.id)
    const valor = env[c.variable]
    let accion = 'rotar', motivo = ''
    if (!enN8n) { accion = 'saltar'; motivo = 'la credencial no existe en n8n con ese id' }
    else if (enN8n.type !== c.tipo) { accion = 'saltar'; motivo = `el tipo es ${enN8n.type}, no ${c.tipo}` }
    else if (!valor) { accion = 'saltar'; motivo = `${c.variable} no está en el entorno (¿falta pegarla en Doppler?)` }
    return { clave: k, id: c.id, nombre: c.nombre, variable: c.variable, accion, motivo, largo: valor ? valor.length : 0 }
  })
}

/** cuerpo del PATCH: el valor nuevo con su cabecera; nada más */
export const cuerpoDelCambio = (clave, valor) => ({ data: { name: CREDENCIALES[clave].cabecera, value: valor } })

export async function ejecutar({ env = process.env, aplicar = false, solo = null, fetchImpl = fetch, log = console.log } = {}) {
  const base = (env.N8N_BASE_URL || '').replace(/\/$/, ''), llave = env.N8N_API_KEY
  if (!base || !llave) { log('✖ faltan N8N_BASE_URL / N8N_API_KEY en el entorno (usa `doppler run --`)'); return { ok: false } }
  const api = async (m, p, body) => { const r = await fetchImpl(`${base}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': llave, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 120)}`); return t ? JSON.parse(t) : {} }
  const lista = (await api('GET', '/credentials')).data ?? []
  const plan = planear(env, lista, solo)
  let ok = true
  for (const p of plan) {
    log(`${p.accion === 'rotar' ? (aplicar ? '→' : 'SECO') : '·'} ${p.nombre} (${p.id}): ${p.accion}${p.motivo ? ' — ' + p.motivo : ` con ${p.variable} (${p.largo} caracteres)`}`)
    if (p.accion !== 'rotar' || !aplicar) continue
    try {
      await api('PATCH', `/credentials/${p.id}`, cuerpoDelCambio(p.clave, env[p.variable]))
      const despues = ((await api('GET', '/credentials')).data ?? []).find((x) => x.id === p.id)
      log(`   ${despues ? '✔ cambiada; sigue en n8n con el mismo id (los flujos no se tocan)' : '✖ ya no aparece en la lista'}`)
      if (!despues) ok = false
    } catch (e) { log(`   ✖ ${e.message}`); ok = false }
  }
  return { ok, plan }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--solo')
  ejecutar({ aplicar: process.argv.includes('--aplicar'), solo: i >= 0 ? process.argv[i + 1] : null }).then((r) => setTimeout(() => process.exit(r.ok ? 0 : 1), 100))
}
