// COMPLETAR LAS FILAS VIEJAS DE `client_social_images` · CC#1 · 2026-10-03 · encargo Lenovo «cada foto viaja con todo su contexto» punto 1 («las filas existentes se completan desde apify_raw, sin raspar»).
//
//   node completar-contexto-fotos.mjs [--cliente=<uuid>]              → SECO (por defecto): lee y muestra qué escribiría · NO escribe nada
//   node completar-contexto-fotos.mjs [--cliente=<uuid>] --aplicar    → PATCH fila por fila · SOLO con la migración 202610030100 ya aplicada y GO de Emilio
//
// US$ 0: lee tablas propias (`client_social_images`, `apify_raw`, el parte de trabajo) y BAJA cada foto de NUESTRO bucket para sacar su huella · no llama a Apify ni a ningún proveedor de pago.
// Idempotente: sólo escribe lo que cambia. No borra filas: la repetida se marca con `duplicado_de` y los lectores la saltan.
// NO guarda «qué producto muestra» (depende del brief): eso se decide al usar la foto, con su procedencia.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const F = require(join(aqui, '..', '..', '..', 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))

const primero = (v) => (Array.isArray(v) ? v[0] : v)
const ordenPorFecha = (a, b) => String(b.created_at).localeCompare(String(a.created_at))

/** el contexto de cada post de un raspado, indexado por `post_id` de fila (portada = «<código>» · hijos = «<código>-cN») */
export function contextoDeRaspados(raspados) {
  const porId = {}
  for (const r of [...raspados].sort(ordenPorFecha)) { // los más nuevos primero: gana el más nuevo
    const perfil = primero(r.respuesta)
    if (!perfil || !Array.isArray(perfil.latestPosts)) continue
    for (const p of perfil.latestPosts) for (const c of F.contextoDePost(p, { maxHijas: 12 })) {
      const k = String(perfil.username || '').toLowerCase() + '|' + c.post_id
      if (!porId[k]) porId[k] = { ...c, raspado: r.id, raspado_en: r.created_at }
    }
  }
  return porId
}

/**
 * Lo que se escribiría en cada fila. `filas` = client_social_images · `raspados` = apify_raw (instagram_scraper real) · `huellas` = { id → sha256 }.
 * Devuelve { cambios: [{ id, post_id, parche }], sin_raspado: [post_id], duplicadas: [{ id, post_id, de }] }
 */
export function planificar({ filas, raspados, huellas }) {
  const ctx = contextoDeRaspados(raspados)
  const cambios = []
  const sin_raspado = []
  // la huella agrupa por (cliente · rol · usuario · post base): la fila con menor índice de posición se queda
  const grupos = {}
  for (const f of filas) {
    const h = huellas[f.id]
    if (!h) continue
    const base = String(f.post_id).replace(/-c\d+$/, '')
    const k = [f.client_id, f.owner_role, f.handle, base, h].join('|')
    ;(grupos[k] = grupos[k] || []).push(f)
  }
  const rango = (f) => (/-c(\d+)$/.test(f.post_id) ? Number(/-c(\d+)$/.exec(f.post_id)[1]) : 0)
  const duplicadas = []
  const queda = {}
  for (const g of Object.values(grupos)) {
    g.sort((a, b) => rango(a) - rango(b))
    for (const d of g.slice(1)) { duplicadas.push({ id: d.id, post_id: d.post_id, de: g[0].id, de_post_id: g[0].post_id }); queda[d.id] = g[0].id }
  }
  for (const f of filas) {
    const c = ctx[String(f.handle).toLowerCase() + '|' + f.post_id]
    const parche = {}
    if (/^logo/.test(f.post_id) || /^logo/.test(f.tipo || '')) { parche.medio = 'logo'; parche.posicion = 'unica' }
    else if (c) {
      Object.assign(parche, { caption: c.caption, posted_at: c.posted_at, post_url: c.post_url, posicion: c.posicion, medio: c.medio })
      // 🔴 el PRODUCTO no se guarda aquí: depende del brief (la misma foto es «el producto» para un brief y «otro plato» para otro). Se decide al USAR la foto, con su procedencia (fotos-contexto-logica.js · clasificarFotos).
      // Las columnas `producto` / `producto_fuente` quedan para lo que afirme el DUEÑO (gana siempre) y para la pasada de visión cuando haya GO.
    } else if (!/^logo/.test(f.post_id)) sin_raspado.push(f.post_id)
    if (huellas[f.id]) parche.hash_archivo = huellas[f.id]
    if (queda[f.id]) parche.duplicado_de = queda[f.id]
    // sólo lo que cambia (si la fila ya trae el valor, no se reescribe)
    for (const k of Object.keys(parche)) {
      const a = f[k], b = parche[k]
      const igual = Array.isArray(b) ? JSON.stringify(a || []) === JSON.stringify(b) : (a === undefined ? null : a) === (b === undefined ? null : b) || (k === 'posted_at' && a && b && new Date(a).getTime() === new Date(b).getTime())
      if (igual) delete parche[k]
    }
    if (Object.keys(parche).length) cambios.push({ id: f.id, post_id: f.post_id, parche: { ...parche, contexto_completado_en: new Date().toISOString() } })
  }
  return { cambios, sin_raspado, duplicadas }
}

if (process.argv[1] && process.argv[1].endsWith('completar-contexto-fotos.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
  const h = { apikey: K, Authorization: 'Bearer ' + K }
  const get = async (ruta) => { const r = await fetch(SB + '/rest/v1/' + ruta, { headers: h }); const j = await r.json(); if (!r.ok) throw new Error('GET ' + ruta + ' → ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); return j }
  const aplicar = process.argv.includes('--aplicar')
  const cliente = process.argv.find((a) => a.startsWith('--cliente='))?.slice(10)
  if (aplicar) { try { await get('client_social_images?select=caption,duplicado_de&limit=1') } catch (e) { console.error('ABORTO · la migración 202610030100 no está aplicada (', String(e.message).slice(0, 120), ')'); process.exit(2) } }
  const columnasNuevas = await get('client_social_images?select=caption&limit=1').then(() => true, () => false)
  const filas = await get('client_social_images?select=*&estado=eq.ok&order=created_at.asc&limit=1000' + (cliente ? '&client_id=eq.' + cliente : ''))
  const clientes = [...new Set(filas.map((f) => f.client_id))]
  const salida = { modo: aplicar ? 'APLICAR' : 'SECO', columnas_nuevas_en_la_tabla: columnasNuevas, clientes: [] }
  for (const cid of clientes) {
    const de = filas.filter((f) => f.client_id === cid)
    const raspados = await get('apify_raw?select=id,created_at,respuesta,params&client_id=eq.' + cid + '&apify_function=eq.instagram_scraper&ensayo=eq.false&order=created_at.desc&limit=60')
    const ficha = (await get('clients?select=id,name&id=eq.' + cid))[0] || {}
    // la huella: se baja cada foto de NUESTRO bucket (US$ 0)
    const huellas = {}
    for (const f of de) {
      try { const r = await fetch(f.url); if (r.ok) huellas[f.id] = crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') } catch (e) { /* sin huella: no se marca duplicada */ }
    }
    const plan = planificar({ filas: de, raspados, huellas })
    salida.clientes.push({ client_id: cid, nombre: ficha.name, filas: de.length, raspados_leidos: raspados.length, cambios: plan.cambios.length, sin_raspado: plan.sin_raspado, duplicadas: plan.duplicadas, detalle: plan.cambios.map((c) => ({ post_id: c.post_id, ...c.parche })) })
    if (aplicar) for (const c of plan.cambios) {
      const r = await fetch(SB + '/rest/v1/client_social_images?id=eq.' + c.id, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(c.parche) })
      if (!r.ok) { console.error('PATCH', c.post_id, r.status, (await r.text()).slice(0, 200)); process.exit(3) }
    }
  }
  const dest = process.argv.find((a) => a.startsWith('--salida='))?.slice(9)
  const texto = JSON.stringify(salida, null, 1)
  if (dest) fs.writeFileSync(dest, texto)
  console.log(texto.length > 6000 ? texto.slice(0, 6000) + '\n…(recortado · usa --salida=)' : texto)
}
