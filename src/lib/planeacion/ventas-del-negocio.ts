/**
 * VENTAS DEL NEGOCIO · la cifra total es la de su caja, y lo del sitio es un desglose de ella (Emilio, 4-nov: «¿no sería un dato más real las ventas en Loyverse?»). Solo lectura.
 * La caja se mide a diario y queda en las fichas `metrica:<proveedor>:ingreso|tickets:<periodo>`: aquí no se llama a la caja, ni hace falta su llave, y sirve para cualquier proveedor.
 * NUNCA se suman: cada pedido entregado por el sitio también entra a la caja. «No se sabe» nunca se dice como «sin ventas».
 */
import { leerVentasDelSitio, type DbDeVentas, type VentasDelSitio } from './ventas-del-sitio'

export interface PeriodoDeCaja {
  readonly periodo: string
  readonly ingreso: number
  readonly tickets: number | null
  /** el último día que cubre la medición */
  readonly medido_al: string | null
  readonly en_curso: boolean
}

export interface VentasDelNegocio {
  readonly fuente: 'caja del negocio'
  readonly estado: 'medido' | 'sin_fuente' | 'no_se_pudo'
  readonly proveedor: string | null
  readonly moneda: 'la del punto de venta'
  readonly ultimos_30_dias: PeriodoDeCaja | null
  /** del más nuevo al más viejo; la cifra de todo el negocio, no por tienda */
  readonly meses: readonly PeriodoDeCaja[]
  /** qué parte vino por la web: ya está dentro de la caja, no se suma */
  readonly por_la_web: VentasDelSitio | null
  readonly regla: string
  readonly texto: string
}

type Fila = Record<string, unknown>
interface RespuestaDb { data: unknown; error: { message?: string } | null }
interface Consulta extends PromiseLike<RespuestaDb> {
  select(c: string): Consulta
  eq(c: string, v: unknown): Consulta
  is(c: string, v: null): Consulta
  or(f: string): Consulta
  limit(n: number): Consulta
}

const MESES_QUE_VIAJAN = 3
const VENTANA = 'ultimos_30_dias'
/** sin tienda al final: la cifra de una tienda ya está dentro de la del negocio */
const CIFRA_DE_CAJA = /^metrica:([^:]+):(ingreso|tickets):(\d{4}-\d{2}|ultimos_30_dias)$/
export const REGLA_DE_LAS_VENTAS = 'La cifra total es la de la caja. Lo que vino por la web y las cifras por tienda ya están dentro de ella: son desgloses y nunca se suman.'

const obj = (x: unknown): Fila => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Fila) : {})
const cifra = (n: number) => n.toFixed(2)
const dia = (x: unknown) => (typeof x === 'string' && x.length >= 10 ? x.slice(0, 10) : null)

/** Código puro: de las fichas a los periodos. Dos vivas del mismo periodo (corrida a medias): manda la más nueva, como en quien lee los datos del plan */
export function periodosDeCaja(fichas: readonly Fila[]): { proveedor: string | null; periodos: PeriodoDeCaja[] } {
  const elegidas = new Map<string, Fila>()
  for (const f of fichas) {
    if (f.retirada_en || f.descartada === true || f.prueba === true) continue
    const m = CIFRA_DE_CAJA.exec(String(f.atributo ?? ''))
    if (!m) continue
    if (typeof obj(obj(f.provenance_tag).metrica).valor !== 'number') continue
    const ya = elegidas.get(String(f.atributo))
    if (!ya || String(f.creado_en ?? '') > String(ya.creado_en ?? '')) elegidas.set(String(f.atributo), f)
  }
  const valor = (f: Fila | undefined) => (f ? (obj(obj(f.provenance_tag).metrica).valor as number) : null)
  const periodos: PeriodoDeCaja[] = []
  let proveedor: string | null = null
  for (const [atributo, f] of elegidas) {
    const [, prov, medida, periodo] = CIFRA_DE_CAJA.exec(atributo) as RegExpExecArray
    if (medida !== 'ingreso') continue
    proveedor = proveedor ?? prov
    const datos = obj(obj(f.provenance_tag).datos)
    periodos.push({
      periodo,
      ingreso: valor(f) as number,
      tickets: valor(elegidas.get(`metrica:${prov}:tickets:${periodo}`)),
      medido_al: dia(datos.ventana_hasta) ?? dia(datos.hasta) ?? dia(f.fecha_fuente),
      en_curso: datos.en_curso === true,
    })
  }
  return { proveedor, periodos: periodos.sort((a, b) => b.periodo.localeCompare(a.periodo)) }
}

const fraseDeLaCaja = (proveedor: string | null, ventana: PeriodoDeCaja | null, meses: readonly PeriodoDeCaja[]): string => {
  const partes: string[] = []
  if (ventana) partes.push(`${cifra(ventana.ingreso)}${ventana.tickets === null ? '' : ` en ${ventana.tickets} tickets`} en los últimos 30 días${ventana.medido_al ? `, medido al ${ventana.medido_al}` : ''}`)
  const cerrado = meses.find((m) => !m.en_curso)
  if (cerrado) partes.push(`${cerrado.periodo} cerró en ${cifra(cerrado.ingreso)}`)
  const enCurso = meses.find((m) => m.en_curso)
  if (enCurso) partes.push(`${enCurso.periodo} va en ${cifra(enCurso.ingreso)}${enCurso.medido_al ? ` al ${enCurso.medido_al}` : ''}`)
  return `ventas del negocio según su caja (${proveedor}): ${partes.join('; ')}`
}

/** Código puro: junta la caja con lo del sitio */
export function armarVentasDelNegocio(caja: { proveedor: string | null; periodos: readonly PeriodoDeCaja[] } | null, por_la_web: VentasDelSitio | null): VentasDelNegocio {
  const web = por_la_web ? `Por la web: ${por_la_web.texto}.` : 'Por la web: no se pudo leer.'
  const base = { fuente: 'caja del negocio' as const, moneda: 'la del punto de venta' as const, por_la_web, regla: REGLA_DE_LAS_VENTAS }
  if (!caja) return { ...base, estado: 'no_se_pudo', proveedor: null, ultimos_30_dias: null, meses: [], texto: `no se pudo leer la caja del negocio: no se sabe cuánto vende en total. ${web}` }
  if (!caja.periodos.length) return { ...base, estado: 'sin_fuente', proveedor: null, ultimos_30_dias: null, meses: [], texto: `este cliente no tiene una caja conectada: no se sabe cuánto vende en total. ${web}` }
  const ultimos_30_dias = caja.periodos.find((p) => p.periodo === VENTANA) ?? null
  const meses = caja.periodos.filter((p) => p.periodo !== VENTANA).slice(0, MESES_QUE_VIAJAN)
  return { ...base, estado: 'medido', proveedor: caja.proveedor, ultimos_30_dias, meses, texto: `${fraseDeLaCaja(caja.proveedor, ultimos_30_dias, meses)}. ${web} Lo de la web ya está dentro de la caja: no se suma.` }
}

async function leerCaja(db: DbDeVentas, client_id: string) {
  const r = await (db.from('cerebro_fichas') as Consulta)
    .select('atributo,provenance_tag,fecha_fuente,creado_en,retirada_en,descartada,prueba')
    .eq('client_id', client_id)
    .is('retirada_en', null)
    .or('atributo.like.metrica:*:ingreso:*,atributo.like.metrica:*:tickets:*')
    .limit(1000)
  if (r.error || !Array.isArray(r.data)) return null
  return periodosDeCaja(r.data as Fila[])
}

export async function leerVentasDelNegocio(db: DbDeVentas, client_id: string | null | undefined): Promise<VentasDelNegocio> {
  const por_la_web = await leerVentasDelSitio(db, client_id).catch(() => null)
  const caja = client_id ? await leerCaja(db, client_id).catch(() => null) : null
  return armarVentasDelNegocio(caja, por_la_web)
}
