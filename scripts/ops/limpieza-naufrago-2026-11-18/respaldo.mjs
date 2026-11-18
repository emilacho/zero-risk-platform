// RESPALDO de la limpieza de Náufrago · SOLO LECTURA · US$ 0
// uso: doppler run -p zero-risk -c prd -- node respaldo.mjs <carpeta-de-respaldo>
// Guarda, por tabla, las filas EXACTAS que la migración 202611180500 va a borrar (mismas condiciones: conjuntos.mjs), el valor entero de las
// 3 libretas y los archivos del almacenamiento que se borran. Escribe `conteos.json` con lo guardado y la huella sha256 de cada archivo.
// Si un conteo no es el esperado, lo dice y sale con 1 (no se sigue a borrar con un respaldo que no calza).
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { CONJUNTOS, LIBRETAS, ARCHIVOS, sql } from './conjuntos.mjs'

const dir = process.argv[2]
if (!dir) { console.log('uso: node respaldo.mjs <carpeta>'); process.exit(1) }
fs.mkdirSync(path.join(dir, 'tablas'), { recursive: true })
fs.mkdirSync(path.join(dir, 'archivos'), { recursive: true })
const huella = (b) => createHash('sha256').update(b).digest('hex')
const conteos = { tomado_utc: new Date().toISOString(), tablas: {}, libretas: {}, archivos: {} }
let malos = 0

for (const { tabla, donde, esperado } of CONJUNTOS) {
  const [{ filas }] = await sql(`select coalesce(json_agg(t), '[]'::json) as filas from public.${tabla} t where ${donde}`)
  const texto = JSON.stringify(filas)
  fs.writeFileSync(path.join(dir, 'tablas', `${tabla}.json`), texto)
  conteos.tablas[tabla] = { filas: filas.length, esperado, sha256: huella(texto) }
  if (filas.length !== esperado) { malos++; console.log(`✘ ${tabla}: ${filas.length} (esperaba ${esperado})`) } else console.log(`✔ ${tabla}: ${filas.length}`)
}

const lib = await sql(`select clave, valor from public.cadena_config where clave in (${LIBRETAS.map((k) => `'${k}'`).join(',')})`)
fs.writeFileSync(path.join(dir, 'tablas', 'cadena_config_libretas.json'), JSON.stringify(lib))
for (const k of LIBRETAS) { const f = lib.find((x) => x.clave === k); conteos.libretas[k] = f ? { llaves: Object.keys(f.valor ?? {}).length, sha256: huella(JSON.stringify(f.valor)) } : null; if (!f) { malos++; console.log(`✘ libreta ${k}: no está`) } }

const U = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), K = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const { bucket, donde, esperado } of ARCHIVOS) {
  const objs = await sql(`select name, (metadata->>'size')::bigint as bytes from storage.objects where bucket_id = '${bucket}' and ${donde} order by name`)
  const lista = []
  for (const o of objs) {
    const r = await fetch(`${U}/storage/v1/object/${bucket}/${o.name.split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${K}`, apikey: K } })
    if (!r.ok) { malos++; console.log(`✘ no se pudo bajar ${bucket}/${o.name}: ${r.status}`); continue }
    const b = Buffer.from(await r.arrayBuffer())
    const destino = path.join(dir, 'archivos', bucket, ...o.name.split('/'))
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, b)
    lista.push({ name: o.name, bytes: b.length, sha256: huella(b) })
  }
  const clave = `${bucket}:${donde.split("'")[1]}`
  conteos.archivos[clave] = { archivos: lista.length, esperado, lista }
  if (lista.length !== esperado) { malos++; console.log(`✘ ${clave}: ${lista.length} (esperaba ${esperado})`) } else console.log(`✔ ${clave}: ${lista.length}`)
}

fs.writeFileSync(path.join(dir, 'conteos.json'), JSON.stringify(conteos, null, 2))
console.log(malos ? `RESPALDO CON ${malos} DIFERENCIAS · no se borra` : 'RESPALDO COMPLETO')
process.exitCode = malos ? 1 : 0
