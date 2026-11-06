/**
 * Chequeo de la migración 202611062000 (las preguntas al dueño salen del cerebro · adenda #940, 06-nov). SOLO LECTURA: no escribe en la base.
 *
 *   antes:   doppler run -p zero-risk -c prd -- node scripts/ops/preguntas-del-dueno-chequeo.mjs antes --respaldo <carpeta>
 *            guarda el respaldo completo de `cerebro_dueno_preguntas` (JSON con fecha) y comprueba que cada respondida tenga su ficha del dueño viva y con respuesta.
 *            Sale con código 1 si falta alguna: la migración la rechazaría (respondida exige respuesta) y no se debe correr hasta resolverlo.
 *   después: doppler run -p zero-risk -c prd -- node scripts/ops/preguntas-del-dueno-chequeo.mjs despues
 *            compara fila por fila (mismo id): estado, respuesta, ficha y motivo. Sale con código 1 si algo no coincide.
 * No imprime secretos: solo ids cortos, estados y conteos.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: llave, authorization: `Bearer ${llave}` }
async function leer(ruta) {
  const r = await fetch(`${url}/rest/v1/${ruta}`, { headers: h })
  if (!r.ok) throw new Error(`${ruta.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
const corto = (x) => String(x ?? '').slice(0, 8)

export function revisarAntes(preguntas, fichas) {
  const porId = new Map(fichas.map((f) => [f.id, f]))
  const problemas = []
  for (const p of preguntas.filter((x) => x.estado === 'respondida')) {
    const f = porId.get(p.ficha_id)
    if (!p.ficha_id) problemas.push(`${corto(p.id)} respondida sin ficha_id`)
    else if (!f) problemas.push(`${corto(p.id)} su ficha ${corto(p.ficha_id)} no existe`)
    else if (!String(f.respuesta ?? '').trim()) problemas.push(`${corto(p.id)} su ficha ${corto(p.ficha_id)} no guarda la respuesta`)
  }
  const conteo = {}
  for (const p of preguntas) conteo[p.estado] = (conteo[p.estado] ?? 0) + 1
  return { problemas, conteo }
}

export function revisarDespues(viejas, nuevas, fichas) {
  const nueva = new Map(nuevas.map((d) => [d.id, d]))
  const ficha = new Map(fichas.map((f) => [f.id, f]))
  const problemas = []
  for (const p of viejas) {
    const d = nueva.get(p.id)
    if (!d) { problemas.push(`${corto(p.id)} no está en dueno_preguntas`); continue }
    if (d.estado !== p.estado && p.estado !== 'pendiente') problemas.push(`${corto(p.id)} estado ${p.estado} → ${d.estado}`)
    if (p.estado === 'respondida') {
      if (d.ficha_ref !== p.ficha_id) problemas.push(`${corto(p.id)} ficha ${corto(p.ficha_id)} → ${corto(d.ficha_ref)}`)
      if (String(d.respuesta ?? '') !== String(ficha.get(p.ficha_id)?.respuesta ?? '')) problemas.push(`${corto(p.id)} la respuesta no coincide con la de su ficha`)
    }
    if (p.estado === 'obsoleta' && !String(d.motivo ?? '').trim()) problemas.push(`${corto(p.id)} obsoleta sin motivo`)
  }
  return { problemas, movidas: viejas.filter((p) => nueva.has(p.id)).length }
}

async function principal() {
  if (!url || !llave) { console.error('faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (correr con doppler)'); process.exit(2) }
  const modo = process.argv[2]
  const viejas = await leer('cerebro_dueno_preguntas?select=*&order=creado_en.asc')
  const ids = viejas.map((p) => p.ficha_id).filter(Boolean)
  const fichas = ids.length ? await leer(`cerebro_fichas?select=id,clase,origen,retirada_en,respuesta:provenance_tag->datos->>respuesta&id=in.(${ids.join(',')})`) : []
  if (modo === 'antes') {
    const i = process.argv.indexOf('--respaldo')
    const carpeta = i > 0 ? process.argv[i + 1] : ''
    if (!carpeta) { console.error('falta --respaldo <carpeta>'); process.exit(2) }
    mkdirSync(carpeta, { recursive: true })
    const archivo = join(carpeta, `cerebro_dueno_preguntas-respaldo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(archivo, JSON.stringify({ tomado_en: new Date().toISOString(), filas: viejas, fichas_de_las_respondidas: fichas }, null, 2))
    const r = revisarAntes(viejas, fichas)
    console.log('respaldo', archivo, '· filas', viejas.length, '· por estado', JSON.stringify(r.conteo))
    for (const p of viejas) console.log(corto(p.id), p.estado, p.ficha_id ? `ficha ${corto(p.ficha_id)}` : '', p.motivo_descarte ? '· con motivo' : '')
    if (r.problemas.length) { console.log('NO MIGRAR:', r.problemas.join(' | ')); process.exit(1) }
    console.log('listo para migrar: cada respondida tiene su ficha con la respuesta')
  } else if (modo === 'despues') {
    const nuevas = viejas.length ? await leer(`dueno_preguntas?select=id,estado,respuesta,ficha_ref,motivo&id=in.(${viejas.map((p) => p.id).join(',')})`) : []
    const r = revisarDespues(viejas, nuevas, fichas)
    console.log('movidas', r.movidas, 'de', viejas.length)
    if (r.problemas.length) { console.log('NO COINCIDE:', r.problemas.join(' | ')); process.exit(1) }
    console.log('coincide fila por fila')
  } else { console.error('uso: antes --respaldo <carpeta> | despues'); process.exit(2) }
}

if (process.argv[1] && process.argv[1].endsWith('preguntas-del-dueno-chequeo.mjs')) principal().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
