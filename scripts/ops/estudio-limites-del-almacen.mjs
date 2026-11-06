// Sube al máximo los límites de tamaño del almacén para el Estudio (decisión Lenovo 06-nov: «todo lo creado se guarda en el bucket del cliente, sin importar su tamaño»).
// Uso (con `doppler run -p zero-risk -c prd --`):
//   node scripts/ops/estudio-limites-del-almacen.mjs leer      → solo lee, no cambia nada
//   node scripts/ops/estudio-limites-del-almacen.mjs aplicar   → respalda, cambia, relee y verifica
// Solo después de que termine la corrida del plan y con la certificación de CC7. Nunca imprime llaves.
import { writeFileSync, mkdirSync } from 'node:fs'
import { sql } from './lib-sql-ops.mjs'

const BUCKET = 'oficina-creativos'
const UN_GIB = 1024 * 1024 * 1024
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
const api = (ruta, init = {}) => fetch(`https://api.supabase.com/v1/projects/${ref}${ruta}`, { ...init, headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })

async function leer() {
  const [b] = await sql(`select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = '${BUCKET}'`)
  const r = await api('/config/storage')
  const t = await r.text()
  if (!r.ok) throw new Error(`config/storage ${r.status} ${t.slice(0, 300)}`)
  const c = JSON.parse(t)
  return { bucket: b ?? null, global: { fileSizeLimit: c.fileSizeLimit, features: c.features } }
}

const modo = process.argv[2] ?? 'leer'
const antes = await leer()
console.log('antes:', JSON.stringify(antes))
if (modo !== 'aplicar') process.exit(0)
if (!antes.bucket) throw new Error(`no existe el bucket ${BUCKET}`)

const dir = `${process.env.ZR_VAULT ?? 'C:/Users/emili/OneDrive/Documents/zr-vault'}/raw/respaldos/almacen-estudio-${new Date().toISOString().replace(/[:.]/g, '-')}`
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/antes.json`, JSON.stringify(antes, null, 2))

// 1) límite global del proyecto: al menos 1 GiB (nunca se baja si ya es mayor)
if (!(Number(antes.global.fileSizeLimit) >= UN_GIB)) {
  const r = await api('/config/storage', { method: 'PATCH', body: JSON.stringify({ fileSizeLimit: UN_GIB }) })
  if (!r.ok) throw new Error(`no se pudo subir el límite global: ${r.status} ${(await r.text()).slice(0, 300)}`)
}
// 2) el bucket sin tope propio (queda el global); los tipos permitidos no se tocan
await sql(`update storage.buckets set file_size_limit = null where id = '${BUCKET}'`)

const despues = await leer()
writeFileSync(`${dir}/despues.json`, JSON.stringify(despues, null, 2))
console.log('después:', JSON.stringify(despues))
const ok = despues.bucket.file_size_limit === null && Number(despues.global.fileSizeLimit) >= UN_GIB
  && JSON.stringify(despues.bucket.allowed_mime_types) === JSON.stringify(antes.bucket.allowed_mime_types)
console.log(ok ? 'VERIFICADO: bucket sin tope propio y global ≥ 1 GiB' : 'NO VERIFICADO: revisar')
console.log(`respaldo en ${dir}/ · para volver: update storage.buckets set file_size_limit = ${antes.bucket.file_size_limit ?? 'null'} where id = '${BUCKET}'; global fileSizeLimit = ${antes.global.fileSizeLimit}`)
process.exitCode = ok ? 0 : 1
