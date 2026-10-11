// SOLO LECTURA · exporta TODAS las filas del cliente (todas las tablas con client_id) y los archivos de su carpeta en el almacenamiento, FUERA de la bóveda.
// Uso: node respaldo-cliente.mjs <client_id> <carpeta_de_salida>
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SB = g('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''), SK = g('SUPABASE_SERVICE_ROLE_KEY')
const ref = SB.match(/https:\/\/([a-z0-9]+)\./)[1]
const [id, salida] = process.argv.slice(2)
if (!/^[0-9a-f-]{36}$/.test(id) || !salida) throw new Error('uso: <client_id> <carpeta>')
fs.mkdirSync(path.join(salida, 'tablas'), { recursive: true }); fs.mkdirSync(path.join(salida, 'almacenamiento'), { recursive: true })
const admin = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + g('SUPABASE_ACCESS_TOKEN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j }
const tablas = await admin(`select c.table_name, t.table_type from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='public' and c.column_name='client_id' order by 1`)
const manifiesto = { cliente: id, hecho_en: new Date().toISOString(), tablas: [], almacenamiento: [], nota: 'Respaldo exacto antes de ELIMINAR los registros del cliente (relevo 53). Filas completas tal como las devuelve PostgREST con la llave de servicio. Fuera de la bóveda.' }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
for (const t of tablas) {
  const filas = []
  for (let desde = 0; ; desde += 500) {
    const r = await fetch(`${SB}/rest/v1/${t.table_name}?client_id=eq.${id}&select=*`, { headers: { apikey: SK, Authorization: 'Bearer ' + SK, Range: `${desde}-${desde + 499}`, 'Range-Unit': 'items' } })
    if (!r.ok) { manifiesto.tablas.push({ tabla: t.table_name, tipo: t.table_type, error: r.status + ' ' + (await r.text()).slice(0, 150) }); break }
    const lote = await r.json(); filas.push(...lote)
    if (lote.length < 500) break
  }
  if (!filas.length) continue
  const cuerpo = JSON.stringify(filas, null, 1)
  fs.writeFileSync(path.join(salida, 'tablas', t.table_name + '.json'), cuerpo)
  manifiesto.tablas.push({ tabla: t.table_name, tipo: t.table_type, filas: filas.length, sha256: sha(cuerpo) })
}
// la ficha del cliente
{
  const r = await fetch(`${SB}/rest/v1/clients?id=eq.${id}&select=*`, { headers: { apikey: SK, Authorization: 'Bearer ' + SK } })
  const cuerpo = JSON.stringify(await r.json(), null, 1); fs.writeFileSync(path.join(salida, 'tablas', 'clients.json'), cuerpo)
  manifiesto.tablas.push({ tabla: 'clients', tipo: 'BASE TABLE', filas: 1, sha256: sha(cuerpo), nota: 'la ficha NO se elimina (la sostiene la libreta de costos)' })
}
// almacenamiento: todo objeto cuyo nombre contenga el id (cualquier cubo)
const objs = await admin(`select bucket_id, name, (metadata->>'size')::bigint as bytes from storage.objects where name like '%${id}%' and bucket_id <> 'client-websites' order by 1,2`)   // el cubo de la landing (client-websites) NO se lee ni se respalda: es de otro dueño
for (const o of objs) {
  const r = await fetch(`${SB}/storage/v1/object/${o.bucket_id}/${o.name.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: SK, Authorization: 'Bearer ' + SK } })
  if (!r.ok) { manifiesto.almacenamiento.push({ ...o, error: r.status }); continue }
  const buf = Buffer.from(await r.arrayBuffer())
  const destino = path.join(salida, 'almacenamiento', o.bucket_id, o.name)
  fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, buf)
  manifiesto.almacenamiento.push({ bucket: o.bucket_id, objeto: o.name, bytes: buf.length, sha256: sha(buf) })
}
fs.writeFileSync(path.join(salida, 'MANIFIESTO.json'), JSON.stringify(manifiesto, null, 1))
const filasTotal = manifiesto.tablas.reduce((a, t) => a + (t.filas || 0), 0)
console.log(JSON.stringify({ tablas_con_filas: manifiesto.tablas.filter((t) => t.filas).length, filas_total: filasTotal, errores: manifiesto.tablas.filter((t) => t.error), objetos: manifiesto.almacenamiento.length, objetos_con_error: manifiesto.almacenamiento.filter((o) => o.error).length }, null, 1))
