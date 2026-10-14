/**
 * SECO del portero que alimenta contra la base REAL en SOLO LECTURA (US$ 0): muestra, por cliente, qué habría pedido, qué sumaría/reemplazaría/ignoraría y qué costaría.
 * Solo GET a PostgREST con la llave de servicio del entorno (nunca escrita); `dry_run: true`; sin modelo; nada se escribe. Empaquetar con esbuild y correr con node:
 *   node scripts/ops/portero-alimenta-seco.cjs <client_id> [<client_id>…]
 * Entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { alimentarCliente, type Db } from '../../src/lib/portero-alimenta/alimentar'
import { rutaDescubrir } from '../../src/lib/portero-alimenta/rutas'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL_BASE || !LLAVE) { console.error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

/** tablas/columnas de la migración 202610141500 (SIN APLICAR): en el seco real faltan o no tienen las columnas nuevas; se tratan como VACÍAS (y el informe lo dice) */
const DE_LA_MIGRACION_SIN_APLICAR = new Set(['cerebro_unidades_vistas', 'cerebro_portero_corridas', 'cerebro_fichas'])
/** una base «solo lectura»: select/eq/is/gte/like/order/limit por GET; cualquier escritura LANZA */
const db: Db = {
  from(tabla: string) {
    const params: string[] = []
    let columnas = '*'
    let escritura = false
    const q: Record<string, unknown> = {}
    const aplicar = (op: string) => (c: string, v: unknown) => { params.push(`${c}=${op}.${encodeURIComponent(v === null ? 'null' : String(v))}`); return q }
    q.select = (c?: string) => { if (c) columnas = c; return q }
    q.eq = aplicar('eq'); q.gte = aplicar('gte'); q.is = aplicar('is')
    q.like = (c: string, v: string) => { params.push(`${c}=like.${encodeURIComponent(v.replace(/%/g, '*'))}`); return q }
    q.order = (c: string, o?: { ascending?: boolean }) => { params.push(`order=${c}.${o?.ascending === false ? 'desc' : 'asc'}`); return q }
    q.limit = (n: number) => { params.push(`limit=${n}`); return q }
    for (const w of ['insert', 'update', 'delete', 'upsert']) q[w] = () => { escritura = true; throw new Error(`SECO SOLO LECTURA: se intentó ${w} en ${tabla}`) }
    q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      if (escritura) return Promise.reject(new Error('escritura en seco'))
      return fetch(`${URL_BASE}/rest/v1/${tabla}?select=${encodeURIComponent(columnas)}&${params.join('&')}`, { headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` } })
        .then(async (r) => (r.ok ? { data: await r.json(), error: null } : DE_LA_MIGRACION_SIN_APLICAR.has(tabla) ? { data: [], error: null } : { data: null, error: { message: `${r.status} ${(await r.text()).slice(0, 160)}` } }))
        .then(res, rej)
    }
    return q
  },
}

const TODO_ENCENDIDO = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }
async function main() {
  const ids = process.argv.slice(2)
  if (!ids.length) { console.error('uso: portero-alimenta-seco <client_id>…'); process.exit(2) }
  for (const id of ids) {
    const d = await rutaDescubrir({ db, interruptores: TODO_ENCENDIDO }, { client_id: id, dry_run: true })
    const plan = (d.body.plan ?? {}) as { hacer?: Array<{ fuente: string; funcion: string; usd_max: number; medido: boolean }>; omitidas?: unknown[]; no_cubiertas?: Array<{ fuente: string; por_que: string }>; costo_maximo_del_plan_usd?: number }
    const r = await alimentarCliente({ db, client_id: id, dry_run: true, interruptores: TODO_ENCENDIDO, forzar: true })
    console.log(JSON.stringify({
      cliente: id,
      pediria_hoy: (plan.hacer ?? []).map((a) => `${a.funcion}${a.medido ? '' : '*'} ≤US$${a.usd_max}`),
      costo_maximo_del_plan_usd: plan.costo_maximo_del_plan_usd ?? null,
      no_cubiertas: plan.no_cubiertas ?? [],
      omitidas: plan.omitidas ?? [],
      gasto_de_hoy: d.body.gasto_de_hoy ?? null,
      estado: r.estado, detalle: r.detalle ?? null,
      unidades: r.unidades, filtro: r.filtro, juez: r.juez,
      resumen_del_archivo: r.plan?.resumen ?? null,
      decisiones: r.decisiones.slice(0, 40),
      costo_modelo_usd: r.gasto.modelo_usd,
    }, null, 1))
  }
}
void main().catch((e) => { console.error(e); process.exit(1) })
