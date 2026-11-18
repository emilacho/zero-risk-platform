// BORRAR LOS ARCHIVOS de la limpieza de Náufrago · por la API de almacenamiento · SOLO después de aplicar la migración 202611180500
// uso: node borrar-archivos.mjs <carpeta-de-respaldo> [--aplicar]
// Sin --aplicar: dice qué borraría y comprueba el respaldo (no borra nada).
// Borra SOLO un archivo que: (1) cumple las condiciones de `ARCHIVOS` (conjuntos.mjs), (2) está en el respaldo y (3) su huella sha256 de HOY es
// igual a la del respaldo (se vuelve a bajar y se compara). Si algo no calza, no borra nada.
// Después comprueba: los conjuntos quedan en 0, y los 9 archivos del reel y los 11 de `agent-images` siguen ahí.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ARCHIVOS, C, REEL, sql } from './conjuntos.mjs'

const [dir, modo] = process.argv.slice(2)
const conteos = JSON.parse(fs.readFileSync(path.join(dir, 'conteos.json'), 'utf8'))
const U = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), K = process.env.SUPABASE_SERVICE_ROLE_KEY, h = { Authorization: `Bearer ${K}`, apikey: K }
const huella = (b) => createHash('sha256').update(b).digest('hex')
const enRespaldo = new Map(Object.values(conteos.archivos).flatMap((a) => a.lista.map((x) => [x.name, x.sha256])))
const reelYImagenes = async () => (await sql(`select (select count(*)::int from storage.objects where bucket_id = 'oficina-creativos' and name like 'oficina/${C}/${REEL}/%') reel, (select count(*)::int from storage.objects where bucket_id = 'agent-images' and name like '${C}/%') imagenes`))[0]

const antes = await reelYImagenes()
const porBorrar = []
let malos = 0
for (const { bucket, donde, esperado } of ARCHIVOS) {
  const objs = await sql(`select name from storage.objects where bucket_id = '${bucket}' and ${donde} order by name`)
  if (objs.length !== esperado) { malos++; console.log(`✘ ${bucket} ${donde}: ${objs.length} (esperaba ${esperado})`) }
  for (const { name } of objs) {
    if (name.includes(REEL)) { malos++; console.log(`✘ un archivo del reel entró en la lista: ${name}`); continue }
    const r = await fetch(`${U}/storage/v1/object/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`, { headers: h })
    const hoy = r.ok ? huella(Buffer.from(await r.arrayBuffer())) : null
    if (!enRespaldo.has(name) || enRespaldo.get(name) !== hoy) { malos++; console.log(`✘ ${name}: no está en el respaldo o cambió`); continue }
    porBorrar.push({ bucket, name })
  }
}
console.log(`reel ${antes.reel} archivos · agent-images ${antes.imagenes} · por borrar ${porBorrar.length}`)
if (malos || antes.reel !== 9 || antes.imagenes !== 11) { console.log('NO SE BORRA NADA'); process.exit(1) }
if (modo !== '--aplicar') { console.log('(plan · sin borrar)'); process.exit(0) }

for (const bucket of [...new Set(porBorrar.map((x) => x.bucket))]) {
  const prefixes = porBorrar.filter((x) => x.bucket === bucket).map((x) => x.name)
  const r = await fetch(`${U}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes }) })
  console.log(`${bucket}: ${r.status} · ${prefixes.length} pedidos · ${((await r.json().catch(() => [])) ?? []).length} borrados`)
}
let quedan = 0
for (const { bucket, donde } of ARCHIVOS) quedan += (await sql(`select count(*)::int n from storage.objects where bucket_id = '${bucket}' and ${donde}`))[0].n
const despues = await reelYImagenes()
console.log(`DESPUÉS · quedan ${quedan} (deben ser 0) · reel ${despues.reel} (9) · agent-images ${despues.imagenes} (11)`)
process.exitCode = quedan === 0 && despues.reel === 9 && despues.imagenes === 11 ? 0 : 1
