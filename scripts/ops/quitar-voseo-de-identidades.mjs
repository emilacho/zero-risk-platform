#!/usr/bin/env node
/**
 * 04-nov · ENCARGO Lenovo «quitar el voseo de la identidad» (dale de Emilio 14:23Z) · tabla `agents`, columna `identity_content`.
 * Pasa a tuteo SOLO las 5 identidades con voseo real (barrido de las 71 filas con `barrer-voseo.mjs` + lectura a mano de lo que la herramienta no ve: «Decile», «Tenés», «convertís»…).
 * No toca nada más del contenido: antes de escribir, la diferencia palabra por palabra debe ser EXACTAMENTE la lista de cambios de abajo (si el vivo cambió, se detiene).
 *   node scripts/ops/quitar-voseo-de-identidades.mjs [--ejecutar] <respaldo.json>   · sin --ejecutar solo muestra la diferencia
 * El respaldo (id + identity_content original de cada fila) se escribe SIEMPRE antes de cualquier cambio; la reversa es PATCH de ese contenido.
 */
import fs from 'node:fs'
import { barrerTexto } from './barrer-voseo.mjs'

const EXTRA = {
  'competitive-intelligence-agent': [['Tenés una herramienta', 'Tienes una herramienta'], ['Decile QUÉ', 'Dile QUÉ'], ['la convertís en', 'la conviertes en'], ['Podés afirmar', 'Puedes afirmar']],
  'carousel-designer': [['Pick `agenda` OR `reserva` OR `escribe`', 'Pick `agenda` OR `reserva` OR `escribe`'], ['"agenda|reserva|escribí"', '"agenda|reserva|escribe"']],
}
const ejecutar = process.argv.includes('--ejecutar')
const salida = process.argv.filter((a) => !a.startsWith('--')).pop()
const U = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const NOMBRES = ['carousel-designer', 'delivery-coordinator', 'video-editor', 'onboarding_specialist', 'competitive-intelligence-agent']
const filas = await (await fetch(U + '/rest/v1/agents?select=id,name,identity_content&name=in.(' + NOMBRES.join(',') + ')', { headers: H })).json()
if (filas.length !== NOMBRES.length) throw new Error('esperaba ' + NOMBRES.length + ' filas, hay ' + filas.length)
fs.writeFileSync(salida, JSON.stringify(filas, null, 2))
const nuevos = []
for (const a of filas) {
  let t = barrerTexto(a.identity_content).texto
  for (const [v, n] of EXTRA[a.name] || []) { if (v !== n && t.includes(v)) { if (t.split(v).length !== 2) throw new Error(a.name + ': «' + v + '» aparece más de una vez'); t = t.replace(v, () => n) } }
  const resto = [...t.matchAll(/(vos|decile|decime|hacelo|usalo|usalos|fijate|convertís|decís|querés|podés|tenés|sabés|incluí|ponderá|leé|agendá|reservá|descubrí|escribí|ponele)/gi)].map((m) => m[0])
  console.log(a.name, 'restos de voseo tras el barrido:', resto.length ? resto.join(', ') : 'ninguno')
  const antes = a.identity_content.split('\n'), despues = t.split('\n')
  if (antes.length !== despues.length) throw new Error(a.name + ': cambió el número de líneas')
  let cambiadas = 0
  antes.forEach((l, i) => { if (l !== despues[i]) { cambiadas++; console.log(a.name, 'L' + (i + 1), '\n  -', l.slice(0, 170), '\n  +', despues[i].slice(0, 170)) } })
  console.log('==', a.name, cambiadas, 'líneas')
  nuevos.push({ id: a.id, name: a.name, identity_content: t })
}
if (!ejecutar) { console.log('(sin --ejecutar: nada escrito)'); process.exit(0) }
for (const n of nuevos) {
  const r = await fetch(U + '/rest/v1/agents?id=eq.' + n.id, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ identity_content: n.identity_content }) })
  const j = await r.json()
  console.log(n.name, r.status, Array.isArray(j) && j[0] && j[0].identity_content === n.identity_content ? 'escrito y verificado' : 'REVISAR ' + JSON.stringify(j).slice(0, 120))
}
