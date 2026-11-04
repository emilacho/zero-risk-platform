/**
 * VENTAS DEL SITIO · salen de los pedidos, no de la analítica (firma de Emilio, 4-nov). Solo lectura.
 * Cada sitio guarda sus pedidos en el área de la base que lleva el slug del cliente (`<slug>.orders`). Cuenta lo no marcado como prueba y que no se quedó sin pagar o se canceló (`noEsVenta`).
 * «Sin ventas» solo se afirma si la tabla se pudo leer: un cliente sin tabla o una lectura fallida dicen que no se sabe. No se piden datos del comprador.
 */
import { estadoDeLaSede } from '../portero-alimenta/brazos/sedes'

export interface VentasDelSitio {
  readonly fuente: 'pedidos del sitio'
  readonly estado: 'medido' | 'sin_fuente' | 'no_se_pudo'
  readonly pedidos_reales: number
  readonly ingreso_usd: number
  /** qué es esa suma: finanzas no debe leerla como lo que le queda al local */
  readonly ingreso_es: string
  /** sin marca de prueba, pero sin pagar o cancelados: no son venta */
  readonly no_concretados: number
  readonly pruebas_excluidas: number
  readonly primera_venta: string | null
  readonly ultima_venta: string | null
  readonly sedes_por_abrir: readonly string[]
  readonly texto: string
}

interface RespuestaDb { data: unknown; error: { code?: string; message?: string } | null }
interface Consulta extends PromiseLike<RespuestaDb> {
  select(c: string): Consulta
  eq(c: string, v: unknown): Consulta
  in(c: string, v: unknown[]): Consulta
  order(c: string, o?: { ascending?: boolean }): Consulta
  range(a: number, b: number): Consulta
}
export interface DbDeVentas {
  from(t: string): unknown
  schema(s: string): { from(t: string): unknown }
}

type Fila = Record<string, unknown>
const POR_PAGINA = 1000
const MAX_PAGINAS = 100
const SLUG_DE_AREA = /^[a-z][a-z0-9_]{0,62}$/
/** el área o la tabla no existen: el cliente no tiene pedidos conectados, no es un fallo */
const NO_EXISTE = new Set(['PGRST106', 'PGRST205', '42P01', '3F000'])
const SE_CAYO = /^(CANCEL|FAIL|REJECT|EXPIR|REFUND|ABANDON)/i
/** `PENDING_PAYMENT`, `PENDING_LOCATION`, `PENDING_OPERATOR`…: el pedido espera algo. `PENDING` a secas NO entra: ahí está el pedido ya cobrado y despachado, y el de efectivo ya colocado */
const A_MEDIO_CAMINO = /^PENDING_/i
const PAGO_CAIDO = /^(FAILED|REFUNDED)$/i
const PAGO_COBRADO = /^(CAPTURED|PARTIAL_REFUND)$/i

/**
 * ¿Este pedido sin marca de prueba no llegó a ser venta? Lo cancelado no es venta aunque se haya cobrado; lo que espera algo solo es venta si ya se cobró.
 * El efectivo no se cobra hasta la entrega: si está colocado (`PENDING` o más adelante) cuenta como venta, y si se cae pasa a cancelado y deja de contar.
 */
const noEsVenta = (f: Fila): boolean => {
  const estado = String(f.status ?? '').trim()
  const pago = String(f.payment_status ?? '').trim()
  if (!estado || SE_CAYO.test(estado) || PAGO_CAIDO.test(pago)) return true
  return A_MEDIO_CAMINO.test(estado) && !PAGO_COBRADO.test(pago)
}

export const SIN_VENTAS_DEL_SITIO = 'sin ventas reales por el sitio todavía'
export const INGRESO_ES = 'lo que pagó el comprador en total, con el envío si el sitio lo cobra: no es lo que le queda al local'
export const NOTA_DE_LA_ANALITICA = 'Esta lectura es solo conducta de visitas: no cuenta ventas ni sirve para calcular una tasa de cierre. Las ventas del sitio están en `ventas_del_sitio`, con toda su historia y no con los días de esta lectura: no se dividen entre sí.'

const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const obj = (x: unknown): Fila => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Fila) : {})
const tablaDe = (db: { from(t: string): unknown }, t: string) => db.from(t) as Consulta
const r2 = (n: number) => Math.round(n * 100) / 100

const vacio = (estado: VentasDelSitio['estado'], texto: string, sedes_por_abrir: readonly string[] = []): VentasDelSitio => ({
  fuente: 'pedidos del sitio', estado, pedidos_reales: 0, ingreso_usd: 0, ingreso_es: INGRESO_ES, no_concretados: 0, pruebas_excluidas: 0, primera_venta: null, ultima_venta: null, sedes_por_abrir, texto,
})

const fraseDeSedes = (s: readonly string[]): string => {
  if (!s.length) return ''
  if (s.length === 1) return `la sede de ${s[0]} aún no abre`
  return `las sedes de ${s.slice(0, -1).join(', ')} y ${s[s.length - 1]} aún no abren`
}

/** Código puro: qué significan las filas de pedidos */
export function resumirPedidos(filas: readonly Fila[], sedes_por_abrir: readonly string[] = []): VentasDelSitio {
  let pedidos_reales = 0, ingreso = 0, no_concretados = 0, pruebas_excluidas = 0
  let primera_venta: string | null = null, ultima_venta: string | null = null
  for (const f of filas) {
    if (f.es_prueba === true) { pruebas_excluidas++; continue }
    if (noEsVenta(f)) { no_concretados++; continue }
    pedidos_reales++
    const total = Number(f.total_usd)
    if (Number.isFinite(total)) ingreso += total
    const cuando = typeof f.created_at === 'string' ? f.created_at : null
    if (cuando && (!primera_venta || cuando < primera_venta)) primera_venta = cuando
    if (cuando && (!ultima_venta || cuando > ultima_venta)) ultima_venta = cuando
  }
  const sedes = fraseDeSedes(sedes_por_abrir)
  const texto = pedidos_reales === 0
    ? SIN_VENTAS_DEL_SITIO + (sedes ? `; ${sedes}` : '')
    : `${pedidos_reales} ${pedidos_reales === 1 ? 'pedido real' : 'pedidos reales'} por el sitio, US$ ${r2(ingreso)} en total, del ${String(primera_venta).slice(0, 10)} al ${String(ultima_venta).slice(0, 10)}` + (sedes ? `; ${sedes}` : '')
  return { fuente: 'pedidos del sitio', estado: 'medido', pedidos_reales, ingreso_usd: r2(ingreso), ingreso_es: INGRESO_ES, no_concretados, pruebas_excluidas, primera_venta, ultima_venta, sedes_por_abrir, texto }
}

async function sedesPorAbrir(db: DbDeVentas, client_id: string, config: unknown): Promise<string[]> {
  const sedes = await tablaDe(db, 'client_sedes').select('id,clave,ciudad').eq('client_id', client_id)
  if (sedes.error) return []
  const filas = lista(sedes.data)
  if (!filas.length) return []
  const datos = await tablaDe(db, 'client_sede_datos').select('sede_id,campo,valor_texto,observado_en').eq('client_id', client_id).eq('campo', 'estado_de_la_sede')
  if (datos.error) return []
  // la ficha también lo dice, y manda: igual que en el contexto de quien planea
  const deLaFicha = obj(obj(obj(config).apify).sedes_estado)
  return filas.filter((s) => {
    const dicho = deLaFicha[String(s.clave)]
    if (dicho === 'por_abrir') return true
    if (dicho === 'abierta') return false
    return estadoDeLaSede(lista(datos.data).filter((d) => d.sede_id === s.id) as never) === 'por_abrir'
  }).map((s) => String(s.ciudad ?? s.clave))
}

export async function leerVentasDelSitio(db: DbDeVentas, client_id: string | null | undefined): Promise<VentasDelSitio> {
  const noSePudo = (por_abrir: readonly string[] = []) => vacio('no_se_pudo', 'no se pudieron leer los pedidos del sitio: no se sabe cuánto vendió', por_abrir)
  try {
    if (!client_id) return vacio('sin_fuente', 'no se indicó el cliente: no se sabe cuánto vende por el sitio')
    const c = await tablaDe(db, 'clients').select('slug,config').eq('id', client_id)
    const cliente = lista(c.data)[0]
    if (c.error || !cliente) return noSePudo()
    const por_abrir = await sedesPorAbrir(db, client_id, cliente.config).catch(() => [])
    const slug = String(cliente.slug ?? '')
    const sinTabla = () => vacio('sin_fuente', 'este cliente no tiene pedidos del sitio conectados: no se sabe cuánto vende por el sitio', por_abrir)
    if (!SLUG_DE_AREA.test(slug)) return sinTabla()
    const filas: Fila[] = []
    for (let i = 0; i < MAX_PAGINAS; i++) {
      const r = await (db.schema(slug).from('orders') as Consulta).select('status,payment_status,es_prueba,total_usd,created_at').order('created_at').range(i * POR_PAGINA, (i + 1) * POR_PAGINA - 1)
      if (r.error) return NO_EXISTE.has(String(r.error.code)) ? sinTabla() : noSePudo(por_abrir)
      const p = lista(r.data)
      filas.push(...p)
      if (p.length < POR_PAGINA) return resumirPedidos(filas, por_abrir)
    }
    return noSePudo(por_abrir)
  } catch {
    return noSePudo()
  }
}
