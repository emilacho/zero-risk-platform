#!/usr/bin/env node
// ROTAR LAS CREDENCIALES DE CABECERA GUARDADAS EN n8n con el valor que vive en Doppler.
// (22-oct · ENCARGO de Lenovo «credenciales guardadas en n8n expuestas».) Medido en el n8n vivo: la API pública solo deja CREAR y LEER credenciales (PATCH y DELETE dan 405),
// así que la rotación es: crear una credencial NUEVA con el valor nuevo → apuntar a ella los nodos que usaban la vieja (con respaldo exacto de cada flujo) → la vieja queda sin uso
// (no se puede borrar por API: su valor ya está muerto; se borra a mano en el panel). Google es OAuth: lo reconecta Emilio, no pasa por aquí.
//
//   doppler run -p zero-risk -c prd -- node scripts/ops/rotar-credenciales-n8n.mjs --seco                      (por omisión: qué haría; no cambia nada)
//   doppler run -p zero-risk -c prd -- node scripts/ops/rotar-credenciales-n8n.mjs --aplicar --respaldos <carpeta FUERA de la bóveda> [--solo portero|healthchecks]
//   reversa por flujo: node scripts/ops/n8n-flujo.mjs restaurar <id> <respaldo.json> --ejecutar
// Nunca imprime un valor. El valor sale del entorno (lo inyecta `doppler run`); si la variable no está, esa credencial se salta y se dice.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** credencial de n8n → de qué variable de Doppler sale el valor y con qué nombre de cabecera se manda */
export const CREDENCIALES = {
  portero: { id: 'hKo5XOxoVHcazlc9', nombre: 'Portero · llave de los webhooks (x-portero-key)', tipo: 'httpHeaderAuth', cabecera: 'x-portero-key', variable: 'PORTERO_WEBHOOK_KEY', quien: 'ya generada por el guion del grupo C; la plataforma valida con el MISMO valor (Vercel)' },
  healthchecks: { id: 'SbwGWme9a9EHmDPG', nombre: 'Healthchecks Read API', tipo: 'httpHeaderAuth', cabecera: 'X-Api-Key', variable: 'HEALTHCHECK_API_KEY', quien: 'la crea Emilio en healthchecks.io (Project Settings → API keys) y la pega en Doppler' },
}
export const SUFIJO_NUEVA = ' [2026-10]'

/** qué se haría con cada credencial, dado el entorno y la lista que devuelve n8n (sin valores) */
export function planear(env, existentes, solo = /** @type {string | null} */ (null)) {
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

/** cuerpo para CREAR la credencial nueva: mismo tipo, la cabecera y el valor; el nombre lleva un sufijo para distinguirla de la vieja */
export const cuerpoDeLaNueva = (clave, valor) => ({ name: CREDENCIALES[clave].nombre + SUFIJO_NUEVA, type: CREDENCIALES[clave].tipo, data: { name: CREDENCIALES[clave].cabecera, value: valor } })

/** los nodos de un flujo que usan la credencial `idViejo` de tipo `tipo` */
export const nodosQueLaUsan = (flujo, tipo, idViejo) => (flujo.nodes ?? []).filter((n) => n.credentials?.[tipo]?.id === idViejo)

/** copia del flujo con esos nodos apuntando a la credencial nueva; nada más cambia */
export function repuntar(flujo, tipo, idViejo, nueva) {
  let cambiados = 0
  const nodes = (flujo.nodes ?? []).map((n) => {
    if (n.credentials?.[tipo]?.id !== idViejo) return n
    cambiados++
    return { ...n, credentials: { ...n.credentials, [tipo]: { id: nueva.id, name: nueva.name } } }
  })
  return { flujo: { ...flujo, nodes }, cambiados }
}

export async function ejecutar({ env = process.env, aplicar = false, solo = /** @type {string | null} */ (null), respaldos = /** @type {string | null} */ (null), fetchImpl = fetch, log = console.log } = {}) {
  const base = (env.N8N_BASE_URL || '').replace(/\/$/, ''), llave = env.N8N_API_KEY
  if (!base || !llave) { log('✖ faltan N8N_BASE_URL / N8N_API_KEY en el entorno (usa `doppler run --`)'); return { ok: false } }
  if (aplicar && (!respaldos || /zr-vault|OneDrive/i.test(respaldos))) { log('✖ --aplicar exige --respaldos <carpeta> FUERA de la bóveda (el respaldo de un flujo puede traer valores)'); return { ok: false } }
  const api = async (m, p, body) => { const r = await fetchImpl(`${base}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': llave, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 120)}`); return t ? JSON.parse(t) : {} }
  const todosLosFlujos = async () => { const out = []; let cursor = ''; for (let i = 0; i < 20; i++) { const r = await api('GET', `/workflows?limit=100${cursor ? '&cursor=' + cursor : ''}`); out.push(...(r.data ?? [])); cursor = r.nextCursor; if (!cursor) break } return out }
  const lista = (await api('GET', '/credentials')).data ?? []
  const plan = planear(env, lista, solo)
  const flujos = await todosLosFlujos()
  if (aplicar && (((await api('GET', '/executions?status=running&limit=20')).data) ?? []).length) { log('✖ hay ejecuciones corriendo; no se toca nada ahora'); return { ok: false, plan } }
  let ok = true
  for (const p of plan) {
    const c = CREDENCIALES[p.clave]
    const afectados = flujos.filter((f) => nodosQueLaUsan(f, c.tipo, c.id).length)
    const nodos = afectados.reduce((s, f) => s + nodosQueLaUsan(f, c.tipo, c.id).length, 0)
    log(`${p.accion === 'rotar' ? (aplicar ? '→' : 'SECO') : '·'} ${p.nombre} (${p.id}): ${p.accion}${p.motivo ? ' — ' + p.motivo : ` con ${p.variable} (${p.largo} caracteres) · la usan ${nodos} nodo(s) en ${afectados.length} flujo(s): ${afectados.map((f) => f.id).join(', ')}`}`)
    if (p.accion !== 'rotar' || !aplicar) continue
    try {
      const nueva = await api('POST', '/credentials', cuerpoDeLaNueva(p.clave, env[p.variable]))
      if (!nueva?.id) throw new Error('n8n no devolvió el id de la credencial nueva')
      log(`   ✔ credencial nueva creada (${nueva.id})`)
      for (const resumen of afectados) {
        const vivo = await api('GET', `/workflows/${resumen.id}`)
        fs.mkdirSync(respaldos, { recursive: true })
        const archivo = path.join(respaldos, `${vivo.id}-antes-credencial-${p.clave}.json`); fs.writeFileSync(archivo, JSON.stringify(vivo))
        const { flujo, cambiados } = repuntar(vivo, c.tipo, c.id, nueva)
        const { name, nodes, connections, settings } = flujo
        await api('PUT', `/workflows/${vivo.id}`, { name, nodes, connections, settings })
        if (vivo.active) { await api('POST', `/workflows/${vivo.id}/deactivate`); await api('POST', `/workflows/${vivo.id}/activate`) }
        const despues = await api('GET', `/workflows/${vivo.id}`)
        const quedaVieja = nodosQueLaUsan(despues, c.tipo, c.id).length, usaNueva = nodosQueLaUsan(despues, c.tipo, nueva.id).length
        log(`   ${quedaVieja === 0 && usaNueva === cambiados ? '✔' : '✖'} ${vivo.id}: ${cambiados} nodo(s) ahora con la nueva · quedan con la vieja ${quedaVieja} · activo=${despues.active} · respaldo ${archivo}`)
        if (quedaVieja !== 0 || usaNueva !== cambiados || despues.active !== vivo.active) ok = false
      }
      log(`   La credencial vieja (${c.id}) queda SIN USO: n8n no deja borrarla por API; su valor ya está muerto; bórrala a mano en el panel (Credentials).`)
    } catch (e) { log(`   ✖ ${e.message}`); ok = false }
  }
  return { ok, plan }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
  ejecutar({ aplicar: process.argv.includes('--aplicar'), solo: arg('--solo'), respaldos: arg('--respaldos') }).then((r) => setTimeout(() => process.exit(r.ok ? 0 : 1), 100))
}
