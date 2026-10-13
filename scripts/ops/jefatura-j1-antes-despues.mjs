#!/usr/bin/env node
/**
 * JEFATURA · J1 · foto ANTES / DESPUÉS de aplicar la migración 202610131000 (SOLO LECTURA: únicamente GET a PostgREST; no escribe nada, no llama a ningún modelo, US$ 0).
 * Comprueba lo que pide el encargo: las filas del cimiento (brand_book, icp, competitive) y las de contenido quedan IDÉNTICAS en las columnas de julio, y el conjunto de filas
 * que lee `grade-cimiento` (artifact_type + is_active = true) no cambia. Lo que añade la migración (6 filas `revision` INACTIVAS y las columnas nuevas) se informa aparte.
 *
 *   node scripts/ops/jefatura-j1-antes-despues.mjs --guardar antes.json     # ANTES de aplicar
 *   node scripts/ops/jefatura-j1-antes-despues.mjs --comparar antes.json    # DESPUÉS de aplicar (sale con código 1 si algo cambió)
 *   node scripts/ops/jefatura-j1-antes-despues.mjs                          # solo imprime la foto de ahora
 *
 * Credenciales: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY del entorno o de .env.local. Nunca se imprimen.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** columnas que existían en julio: son las únicas que se comparan (las nuevas no deben alterar nada de esto) */
export const COLUMNAS_DE_JULIO = ['artifact_type', 'artifact_class', 'correction_enabled', 'judgment_enabled', 'canon_grader', 'counterweight', 'max_cycles', 'fidelity_threshold', 'vote_config', 'notes', 'is_active', 'created_at', 'updated_at']
export const TIPOS_DE_JULIO = ['brand_book', 'icp', 'competitive', 'ad_creative', 'copy', 'email', 'landing']
export const TIPOS_DEL_CIMIENTO = ['brand_book', 'icp', 'competitive']

const estable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(estable) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, estable(v[k])]))) : v)
export const huella = (fila) => crypto.createHash('sha256').update(JSON.stringify(estable(fila))).digest('hex')
export const soloJulio = (fila) => Object.fromEntries(COLUMNAS_DE_JULIO.map((c) => [c, fila[c] ?? null]))

/** puro: arma la foto a partir de las filas leídas */
export function armarFoto(filas, ahora = new Date()) {
  const julio = filas.filter((f) => TIPOS_DE_JULIO.includes(f.artifact_type)).map(soloJulio).sort((a, b) => a.artifact_type.localeCompare(b.artifact_type))
  const lee_grade_cimiento = filas.filter((f) => f.is_active === true && TIPOS_DEL_CIMIENTO.includes(f.artifact_type)).map((f) => f.artifact_type).sort()
  const nuevas = filas.filter((f) => !TIPOS_DE_JULIO.includes(f.artifact_type)).map((f) => ({ artifact_type: f.artifact_type, artifact_class: f.artifact_class, is_active: f.is_active }))
  return { tomada_en: ahora.toISOString(), filas_de_julio: julio, huellas: Object.fromEntries(julio.map((f) => [f.artifact_type, huella(f)])), lee_grade_cimiento, filas_nuevas: nuevas }
}

/** puro: compara dos fotos; `ok` solo si las filas de julio y lo que lee grade-cimiento son idénticos */
export function compararFotos(antes, despues) {
  const cambios = []
  for (const t of TIPOS_DE_JULIO) {
    const a = antes.huellas[t], d = despues.huellas[t]
    if (a === undefined && d === undefined) continue
    if (a !== d) cambios.push(`la fila «${t}» cambió (antes ${a ? a.slice(0, 12) : 'no existía'} · después ${d ? d.slice(0, 12) : 'no existe'})`)
  }
  if (JSON.stringify(antes.lee_grade_cimiento) !== JSON.stringify(despues.lee_grade_cimiento)) cambios.push(`lo que lee grade-cimiento cambió: ${JSON.stringify(antes.lee_grade_cimiento)} → ${JSON.stringify(despues.lee_grade_cimiento)}`)
  const activasNuevas = despues.filas_nuevas.filter((f) => f.is_active === true)
  if (activasNuevas.length) cambios.push(`hay filas nuevas ACTIVAS (deben nacer inactivas): ${activasNuevas.map((f) => f.artifact_type).join(', ')}`)
  return { ok: cambios.length === 0, cambios }
}

function entorno() {
  const env = { ...process.env }
  const f = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '') }
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const key = env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno o en .env.local')
  return { url, key }
}

async function leerFilas() {
  const { url, key } = entorno()
  const r = await fetch(`${url}/rest/v1/jefatura_grading_policies?select=*&order=artifact_type.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`leer jefatura_grading_policies: HTTP ${r.status}`)
  return r.json()
}

async function principal() {
  const args = process.argv.slice(2)
  const i = (flag) => args.indexOf(flag)
  const foto = armarFoto(await leerFilas())
  if (i('--guardar') >= 0) {
    const f = args[i('--guardar') + 1]
    if (!f) throw new Error('--guardar necesita un archivo')
    fs.writeFileSync(f, JSON.stringify(foto, null, 2))
    console.log(`ANTES guardada en ${f}: ${foto.filas_de_julio.length} filas de julio · grade-cimiento lee ${JSON.stringify(foto.lee_grade_cimiento)} · filas nuevas ${foto.filas_nuevas.length}`)
    return 0
  }
  if (i('--comparar') >= 0) {
    const f = args[i('--comparar') + 1]
    if (!f || !fs.existsSync(f)) throw new Error('--comparar necesita el archivo de la foto ANTES')
    const res = compararFotos(JSON.parse(fs.readFileSync(f, 'utf8')), foto)
    console.log(res.ok ? `IDÉNTICO · las ${foto.filas_de_julio.length} filas de julio y lo que lee grade-cimiento no cambiaron · filas nuevas: ${foto.filas_nuevas.map((x) => `${x.artifact_type}(${x.is_active ? 'ACTIVA' : 'inactiva'})`).join(', ') || 'ninguna'}` : `CAMBIÓ:\n - ${res.cambios.join('\n - ')}`)
    return res.ok ? 0 : 1
  }
  console.log(JSON.stringify(foto, null, 2))
  return 0
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('jefatura-j1-antes-despues.mjs')) {
  principal().then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(2) })
}
