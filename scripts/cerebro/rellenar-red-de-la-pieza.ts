/**
 * ENCARGO 7 (21-nov) · RELLENO de la etiqueta `red` en lo YA guardado (fotos, videos y fichas), con respaldo y reversa.
 * Usa LOS MISMOS deducidores del código (`red-de-la-pieza.ts`): nada se deduce dos veces de forma distinta.
 *
 *   npx tsx scripts/cerebro/rellenar-red-de-la-pieza.ts seco                 → solo cuenta (no escribe; no necesita la columna)
 *   npx tsx scripts/cerebro/rellenar-red-de-la-pieza.ts aplicar <carpeta>    → respaldo JSON + reversa SQL en <carpeta>, y escribe
 *   npx tsx scripts/cerebro/rellenar-red-de-la-pieza.ts verificar            → cuenta lo escrito en vivo, por tabla y red
 *
 * Reglas: solo llena filas con `red` NULL (nunca pisa un valor); sin señal → queda NULL («no consta»);
 * la reversa devuelve a NULL exactamente los ids tocados, nada más. Secretos por el entorno (doppler), jamás impresos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { redDeLaFicha, redDeLaFotoOVideo } from '../../src/lib/cerebro/portero/red-de-la-pieza'

const URL_BASE = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !LLAVE) { console.error('faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno'); process.exit(1) }
const db = createClient(URL_BASE, LLAVE, { auth: { persistSession: false } })

const POR_PAGINA = 1000
const POR_ESCRITURA = 100
type Fila = Record<string, unknown>
interface TablaDelRelleno { tabla: string; columnas: string; red: (f: Fila) => string | null }
const TABLAS: TablaDelRelleno[] = [
  { tabla: 'client_social_images', columnas: 'id, tipo, post_url, url', red: (f) => redDeLaFotoOVideo(f) },
  { tabla: 'client_videos', columnas: 'id, tipo, post_url, fuente_url', red: (f) => redDeLaFotoOVideo(f) },
  { tabla: 'cerebro_fichas', columnas: 'id, clase, fuente_url', red: (f) => redDeLaFicha(f) },
]

async function leerTodas(tabla: string, columnas: string): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let desde = 0; ; desde += POR_PAGINA) {
    const r = await db.from(tabla).select(columnas).order('id', { ascending: true }).range(desde, desde + POR_PAGINA - 1)
    if (r.error) throw new Error(`${tabla}: ${r.error.message}`)
    const pagina = (r.data ?? []) as unknown as Fila[]
    filas.push(...pagina)
    if (pagina.length < POR_PAGINA) return filas
  }
}

const modo = process.argv[2] ?? 'seco'
const carpeta = process.argv[3]

async function main(): Promise<void> {
if (modo === 'verificar') {
  for (const t of TABLAS) {
    const filas = await leerTodas(t.tabla, 'id, red')
    const porRed: Record<string, number> = {}
    for (const f of filas) porRed[String(f.red ?? 'NULL')] = (porRed[String(f.red ?? 'NULL')] ?? 0) + 1
    console.log(t.tabla, JSON.stringify(porRed))
  }
  process.exit(0)
}

if (modo === 'aplicar' && !carpeta) { console.error('aplicar necesita la carpeta del respaldo'); process.exit(1) }
const respaldo: Record<string, Array<{ id: string; red: string }>> = {}
let total = 0
for (const t of TABLAS) {
  // en `aplicar` la columna ya existe: solo filas con red NULL (nunca se pisa un valor); en `seco` la columna puede no existir aún
  const columnas = modo === 'aplicar' ? `${t.columnas}, red` : t.columnas
  const filas = (await leerTodas(t.tabla, columnas)).filter((f) => (modo === 'aplicar' ? f.red == null : true))
  const nuevos = filas.map((f) => ({ id: String(f.id), red: t.red(f) })).filter((x): x is { id: string; red: string } => x.red !== null)
  const porRed: Record<string, number> = {}
  for (const x of nuevos) porRed[x.red] = (porRed[x.red] ?? 0) + 1
  console.log(`${t.tabla}: ${filas.length} filas miradas · ${nuevos.length} por llenar · ${filas.length - nuevos.length} quedan «no consta» · ${JSON.stringify(porRed)}`)
  respaldo[t.tabla] = nuevos
  total += nuevos.length
}
if (modo === 'seco') { console.log(`SECO: se llenarían ${total} filas. Nada se escribió.`); process.exit(0) }

fs.mkdirSync(carpeta!, { recursive: true })
fs.writeFileSync(path.join(carpeta!, 'respaldo-red.json'), JSON.stringify(respaldo, null, 1))
const reversa: string[] = ['-- reversa del relleno de `red` (encargo 7): devuelve a NULL exactamente los ids tocados']
for (const [tabla, nuevos] of Object.entries(respaldo)) {
  for (let i = 0; i < nuevos.length; i += POR_ESCRITURA) {
    const parte = nuevos.filter((_x, j) => j >= i && j < i + POR_ESCRITURA)
    reversa.push(`update ${tabla} set red = null where id in (${parte.map((x) => `'${x.id}'`).join(', ')});`)
  }
}
fs.writeFileSync(path.join(carpeta!, 'reversa-red.sql'), reversa.join('\n') + '\n')
console.log(`respaldo y reversa escritos en ${carpeta}`)

let escritas = 0
for (const [tabla, nuevos] of Object.entries(respaldo)) {
  const porRed = new Map<string, string[]>()
  for (const x of nuevos) porRed.set(x.red, [...(porRed.get(x.red) ?? []), x.id])
  for (const [red, ids] of porRed) {
    for (let i = 0; i < ids.length; i += POR_ESCRITURA) {
      const parte = ids.filter((_x, j) => j >= i && j < i + POR_ESCRITURA)
      const w = await db.from(tabla).update({ red }).in('id', parte).is('red', null)
      if (w.error) { console.error(`ALTO en ${tabla} (${red}): ${w.error.message} · lo ya escrito queda y la reversa lo cubre`); process.exit(1) }
      escritas += parte.length
    }
  }
  console.log(`${tabla}: llenadas ${nuevos.length}`)
}
console.log(`LISTO: ${escritas} filas llenadas. Reversa: ${path.join(carpeta!, 'reversa-red.sql')}`)
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
