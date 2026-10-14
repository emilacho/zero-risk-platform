/**
 * LIMPIA LAS FICHAS REPETIDAS DEL PORTERO (14-oct) · la misma línea de menú/horario/pie en varias páginas del sitio quedó archivada una vez por página.
 * Por cada (cliente, fuente, huella) deja VIVA la ficha más antigua y RETIRA las demás con motivo y `reemplazada_por` (la historia queda: nada se borra).
 * Los trozos de las retiradas salen del índice en la siguiente pasada del puente (`/api/brain/alimentar/puente`), que ya no mantiene fichas repetidas.
 *   node portero-limpiar-repetidas.cjs <client_id> [--ejecutar] [--respaldo <carpeta>]
 * Sin `--ejecutar` solo muestra el plan. SIEMPRE escribe el respaldo (filas completas de lo que va a retirar) antes de tocar nada. Entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from 'node:fs'
import path from 'node:path'
import { esBuscable, sinRepetidas, type FichaParaPuente } from '../../src/lib/portero-alimenta/puente'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const args = process.argv.slice(2)
const cliente = args.find((a) => /^[0-9a-f-]{36}$/i.test(a))
const ejecutar = args.includes('--ejecutar')
const carpeta = args[args.indexOf('--respaldo') + 1] && args.includes('--respaldo') ? args[args.indexOf('--respaldo') + 1] : '.'
if (!URL_BASE || !LLAVE || !cliente) { console.error('uso: portero-limpiar-repetidas <client_id> [--ejecutar] [--respaldo <carpeta>]; faltan variables de entorno o client_id'); process.exit(2) }
const H = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'content-type': 'application/json', Prefer: 'return=minimal' }

async function main() {
  const r = await fetch(`${URL_BASE}/rest/v1/cerebro_fichas?select=*&client_id=eq.${cliente}&retirada_en=is.null&descartada=eq.false&limit=5000`, { headers: H })
  if (!r.ok) { console.error('lectura fallida', r.status, (await r.text()).slice(0, 200)); process.exit(1) }
  const filas = (await r.json()) as Array<FichaParaPuente & Record<string, unknown>>
  const buscables = filas.filter(esBuscable)
  const { unicas, repetidas } = sinRepetidas(buscables)
  const representante = new Map<string, string>()
  for (const u of unicas) if (u.huella) representante.set(`${/^portero:([^:]+):/.exec(u.ref)?.[1] ?? '?'}|${u.huella}`, u.id)
  const plan = repetidas.map((x) => ({ id: x.id, de: representante.get(`${/^portero:([^:]+):/.exec(x.ref)?.[1] ?? '?'}|${x.huella}`) ?? null, ref: x.ref }))
  console.log(JSON.stringify({ cliente, vivas: filas.length, buscables: buscables.length, unicas: unicas.length, repetidas: plan.length, ejecutar }, null, 1))
  if (!plan.length) return
  const respaldo = path.join(carpeta, `respaldo-fichas-repetidas-${cliente}.json`)
  fs.mkdirSync(carpeta, { recursive: true })
  const ids = new Set(plan.map((p) => p.id))
  fs.writeFileSync(respaldo, JSON.stringify(filas.filter((f) => ids.has(f.id)), null, 1))
  console.log('respaldo escrito:', respaldo, `(${ids.size} filas)`)
  if (!ejecutar) { console.log('(sin --ejecutar: no se cambió nada)'); return }
  const ahora = new Date().toISOString()
  let hechas = 0
  for (const p of plan) {
    if (!p.de) { console.error('sin representante para', p.id); continue }
    const u = await fetch(`${URL_BASE}/rest/v1/cerebro_fichas?id=eq.${p.id}&client_id=eq.${cliente}&retirada_en=is.null`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ retirada_en: ahora, motivo_retirada: `repetida: mismo contenido que ${p.de} (la misma línea en otra página) · limpieza del 14-oct`, reemplazada_por: p.de }),
    })
    if (u.ok) hechas++; else console.error('falló', p.id, u.status)
  }
  console.log(`retiradas ${hechas} de ${plan.length}`)
}
void main().catch((e) => { console.error(e); process.exit(1) })
