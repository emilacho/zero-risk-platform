/**
 * DATOS DE SEDE QUE NO SON DEL CLIENTE · 02-nov · firma de Emilio («se trabaja un negocio y se le cargan horarios, direcciones y teléfonos de otro restaurante»).
 *
 * Una fila de `client_sede_datos` con `fuente = 'sitio'` solo vale si la página de donde salió es del cliente, con la MISMA regla única de todo el sistema (`propio/regla-propio.ts`:
 * su dominio, o la página de SU cuenta). Una tienda de una app de reparto (Uber Eats, Rappi, PedidosYa…) no es del cliente aunque lleve su nombre: es de quien la abrió.
 * Aquí viven dos cosas: la decisión (pura) y el retiro (con motivo; nunca se borra, la fila queda con `retirada_en` y `motivo_retirada`).
 * Lo recorre el recolector para su cliente en cada corrida y el relleno para todos los clientes (en seco primero).
 */
import { baseDeFicha, hostDe, veredictoDePagina, type BaseDelCliente } from '../propio/regla-propio'

/** anfitriones de apps de reparto y de directorios de comida: la página es de otro negocio por definición, salvo que sea el dominio del propio cliente */
const ANFITRIONES_DE_REPARTO = /(^|\.)(ubereats\.com|rappi\.(com|com\.[a-z]{2}|[a-z]{2})|pedidosya\.[a-z.]+|glovoapp\.com|glovo\.com|doordash\.com|grubhub\.com|justeat\.[a-z.]+|deliveroo\.[a-z.]+|didi-food\.com|tripadvisor\.[a-z.]+)$/

export const esPaginaDeReparto = (url: unknown): boolean => ANFITRIONES_DE_REPARTO.test(hostDe(url))

export interface FilaDeSede { id: string; client_id: string; fuente: string; fuente_ref: string | null; retirada_en?: string | null }

/** ¿esta fila dice «sitio» sin que la página sea del cliente? (las de Instagram, Mapas y el dueño tienen sus propias pruebas y no se tocan aquí) */
export function esFilaAjena(base: BaseDelCliente, f: Pick<FilaDeSede, 'fuente' | 'fuente_ref' | 'retirada_en'>): boolean {
  if (f.retirada_en) return false
  if (f.fuente !== 'sitio') return false
  if (!f.fuente_ref) return false
  return veredictoDePagina(base, f.fuente_ref) !== 'si'
}

export const motivoDeRetiro = (f: Pick<FilaDeSede, 'fuente_ref'>, quien: string, ahora: Date): string =>
  `la página no es del cliente (${esPaginaDeReparto(f.fuente_ref) ? 'tienda de una app de reparto' : 'otro dominio u otra cuenta'}: ${hostDe(f.fuente_ref) || 'sin dirección'}); rotulada «sitio» por error: ${quien} la retiró el ${ahora.toISOString().slice(0, 10)}`

interface Q { data: unknown; error: { message: string } | null }
/** lo mínimo de la base que se usa (el SupabaseClient real y la base falsa de las pruebas lo cumplen) */
export interface DbSedes { from(tabla: string): any }

export interface ResultadoDeRetiro {
  ok: boolean
  error?: string
  dry_run: boolean
  /** por cliente: filas ajenas encontradas (en seco) o retiradas */
  por_cliente: Array<{ client_id: string; ajenas: number; retiradas: number; ids: string[] }>
  total: number
}

async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<Q>, unaPagina = false): Promise<{ filas: T[]; error: string | null }> {
  const filas: T[] = []
  for (let i = 0; ; i += 1000) {
    const q = await pedir(i, i + 999)
    if (q.error) return { filas, error: q.error.message }
    const lote = Array.isArray(q.data) ? (q.data as T[]) : []
    filas.push(...lote)
    if (unaPagina || lote.length < 1000) return { filas, error: null }
  }
}

/** Retira (o, en seco, solo cuenta) las filas de sede hechas desde una página que la regla única marca ajena. Con `clientId` solo mira a ese cliente. */
export async function retirarSedeDatosAjenos(db: DbSedes, o: { clientId?: string | null; dry_run: boolean; ahora?: Date; quien?: string }): Promise<ResultadoDeRetiro> {
  const ahora = o.ahora ?? new Date()
  const quien = o.quien ?? 'el cerebro'
  const vacio: ResultadoDeRetiro = { ok: false, dry_run: o.dry_run, por_cliente: [], total: 0 }
  const filasQ = await todas<FilaDeSede>((a, b) => {
    let q = db.from('client_sede_datos').select('id, client_id, fuente, fuente_ref, retirada_en').eq('fuente', 'sitio')
    if (o.clientId) q = q.eq('client_id', o.clientId)
    q = q.order('id', { ascending: true })
    // un cliente cabe en una lectura; para todos se pagina de a mil
    return o.clientId ? q : q.range(a, b)
  }, !!o.clientId)
  if (filasQ.error) return { ...vacio, error: `leer los datos de sede: ${filasQ.error}` }
  const ids = [...new Set(filasQ.filas.map((f) => f.client_id))]
  const bases = new Map<string, BaseDelCliente>()
  for (let i = 0; i < ids.length; i += 100) {
    const c = await db.from('clients').select('id, website_url, config').in('id', ids.slice(i, i + 100))
    if (c.error) return { ...vacio, error: `leer las fichas de cliente: ${c.error.message}` }
    for (const x of (Array.isArray(c.data) ? c.data : []) as Array<{ id: string; website_url?: string | null; config?: unknown }>) bases.set(x.id, baseDeFicha(x))
  }
  const porCliente = new Map<string, { ajenas: FilaDeSede[]; retiradas: number }>()
  for (const f of filasQ.filas) {
    const base = bases.get(f.client_id)
    if (!base) continue // una fila sin ficha de cliente no se juzga aquí
    if (!esFilaAjena(base, f)) continue
    const g = porCliente.get(f.client_id) ?? { ajenas: [], retiradas: 0 }
    g.ajenas.push(f)
    porCliente.set(f.client_id, g)
  }
  for (const [cid, g] of porCliente) {
    if (o.dry_run) continue
    for (const f of g.ajenas) {
      const w = await db.from('client_sede_datos').update({ retirada_en: ahora.toISOString(), motivo_retirada: motivoDeRetiro(f, quien, ahora) }).eq('id', f.id).eq('client_id', cid).is('retirada_en', null)
      if (w.error) return { ...vacio, error: `retirar la fila ${f.id}: ${w.error.message}`, por_cliente: resumen(porCliente) }
      g.retiradas++
    }
  }
  const por_cliente = resumen(porCliente)
  return { ok: true, dry_run: o.dry_run, por_cliente, total: por_cliente.reduce((s, c) => s + (o.dry_run ? c.ajenas : c.retiradas), 0) }
}

function resumen(m: Map<string, { ajenas: FilaDeSede[]; retiradas: number }>): ResultadoDeRetiro['por_cliente'] {
  return [...m].map(([client_id, g]) => ({ client_id, ajenas: g.ajenas.length, retiradas: g.retiradas, ids: g.ajenas.map((f) => f.id) }))
}
