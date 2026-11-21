/**
 * «CREAR CAMPAÑA» · entrega 2 (GO Lenovo a CC1 y CC3, 20-nov 20:05 Zúrich · contrato con CC2 de las 21:04Z y 21:15Z). Lo de atrás del botón del tablero:
 *   · EL MÍNIMO (solo lectura): lo menos que puede ser el tope de una campaña nueva = su planificación + una pieza en su peor caso + la jefatura de sus documentos.
 *     El tope es obligatorio al crear y no puede quedar debajo (Emilio 20:04, por Lenovo 19:06Z).
 *   · CREAR: valida las 5 respuestas del dueño, compara el tope con el mínimo, guarda el pedido (`cadena_pedidos_de_campana`) y deja el sobre de «plan listo» en la sala
 *     con la llave del pedido: la puerta abre la campaña NUEVA con esa llave y `abrirCampana` lee el pedido (fechas, tope y nombre, origen `emilio`).
 * Nada gasta aquí: lo que gasta es la planificación de la campaña, que ya frena con su bolsa y su tope.
 * 🔴 CC5 (21:48Z): todo rechazo (400 · 409) sale ANTES de guardar. La llave del formulario solo se usa cuando el pedido queda guardado, así que el reintento con la misma llave crea.
 */
import type { Almacen } from './almacen'
import type { SobreDePlan } from './campanas'
import { hoyEnZona, LARGO_DE_NOMBRE, leerNombreDeCampana, nombreGenericoDelPlan, ventanaDeLaCampana } from './campanas'
import { CLAVE_LIBRETA_DE_PEDIDOS, libretaDe, type AnotacionDelPedido } from './libreta-de-pedidos'
import { compuerta, type Respuesta } from './autorizar'
import { bolsaDePlanificacion, DIAS_DE_CAMPANA, DIAS_MAXIMOS_DE_CAMPANA, medidaDeCampana } from './constantes'
import { diasEntre, esFechaIso } from './fechas'
import { costoEsperadoDeLaPieza } from './tope-de-campana'
import { topesConMesa } from '../oficina/mesa/con-mesa'

export const LARGO_DEL_CAMBIO = 4000
export const LARGO_DEL_BRIEF = 100000
export const MAXIMO_DE_FECHAS_CLAVE = 20
export const LARGO_DEL_QUE = 120
/** el tope más alto que se acepta (la columna es numeric(10,2)); no es un límite de negocio, ataja un número absurdo */
export const TOPE_MAXIMO_DEL_PEDIDO_USD = 1_000_000
/** los documentos de la primera tanda que pasan por la revisión de registro de la jefatura: brief, concepto y calendario */
export const DOCUMENTOS_DE_REGISTRO_POR_TANDA = 3
/** la llave del pedido = la de la campaña: `crear-<uuid del formulario>` */
export const PREFIJO_DE_LA_LLAVE = 'crear-'
export const DESDE_EL_TABLERO = 'tablero/crear-campana'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface FechaClave { fecha: string; que: string }
export interface PedidoGuardado {
  id: string
  client_id: string
  seco: boolean
  llave: string
  nombre: string
  cambio: string
  fecha_inicio: string | null
  fecha_fin: string | null
  fechas_clave: FechaClave[]
  tope_usd: number
  brief_libre: string
  pedido_por: string
  creado_en: string
  campana_id: string | null
}
export interface CostosDelMinimo { topes: Record<string, number>; reservas?: Record<string, number>; tope_registro_usd: number }
export interface Minimo { minimo_usd: number; detalle: { planificacion_usd: number; pieza_peor_usd: number; jefatura_usd: number } }

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * El mínimo de una campaña (pura): la bolsa de su planificación (la misma de `abrirCampana`, por sus tandas) + lo que el freno de la campaña le reserva a la pieza
 * más cara (la misma cuenta del freno: `costoEsperadoDeLaPieza` con las versiones con mesa) + la revisión de registro de los documentos de la primera tanda.
 * Es lo menos con que la campaña llega a su primera pieza; redondeado HACIA ARRIBA al dólar. Sin topes de familia legibles, LANZA (un mínimo ilegible no es cero).
 */
export function minimoDeCampana(totalTandas: number, c: CostosDelMinimo): Minimo {
  const planificacion = bolsaDePlanificacion(totalTandas)
  const con = topesConMesa(c.topes, c.reservas)
  const familias = Object.keys(con.topes).filter((f) => typeof con.topes[f] === 'number' && Number.isFinite(con.topes[f]) && con.topes[f] > 0)
  if (!familias.length) throw new Error('no hay topes de familia legibles')
  const pieza = Math.max(...familias.map((f) => costoEsperadoDeLaPieza(con.topes, con.reservas, f)))
  if (!(Number.isFinite(c.tope_registro_usd) && c.tope_registro_usd > 0)) throw new Error('el tope de la revisión de registro no es legible')
  const jefatura = DOCUMENTOS_DE_REGISTRO_POR_TANDA * c.tope_registro_usd
  return { minimo_usd: Math.ceil(r2(planificacion + pieza + jefatura)), detalle: { planificacion_usd: r2(planificacion), pieza_peor_usd: r2(pieza), jefatura_usd: r2(jefatura) } }
}

type Mal = { ok: false; status: number; cuerpo: Record<string, unknown> }
const invalida = (campo: string, detalle: string): Mal => ({ ok: false, status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo, detalle } })
const texto = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null)
const vacio = (v: unknown): boolean => v === undefined || v === null || v === ''

export interface EntradaValida {
  /** 21-nov · null = el dueño no puso nombre: se guarda el genérico del Plan de Marketing (Emilio 10:30Z) */
  client_id: string; seco: boolean; llave: string; nombre: string | null; cambio: string; brief_libre: string
  fecha_inicio: string | null; fecha_fin: string | null; fechas_clave: FechaClave[]; tope_usd: number; ensayo: boolean
}
/** las 5 preguntas, sin leer la base (pura). El `detalle` nombra la pregunta, porque el `campo` no llega a la pantalla (CC2 21:15Z). Las fechas contra «hoy» se miran después. */
export function validarEntrada(c: Record<string, unknown>): { ok: true; e: EntradaValida } | Mal {
  const client_id = typeof c.client_id === 'string' && UUID.test(c.client_id.trim()) ? c.client_id.trim() : null
  if (!client_id) return invalida('client_id', 'cliente: falta el cliente (client_id debe ser un uuid)')
  if (c.seco !== undefined && typeof c.seco !== 'boolean') return invalida('seco', 'seco debe ser true o false')
  if (c.ensayo !== undefined && typeof c.ensayo !== 'boolean') return invalida('ensayo', 'ensayo debe ser true o false')
  const lf = typeof c.llave_formulario === 'string' && UUID.test(c.llave_formulario.trim()) ? c.llave_formulario.trim().toLowerCase() : null
  if (!lf) return invalida('llave_formulario', 'formulario: falta la llave del formulario (un uuid que el tablero genera al abrirlo)')
  const nombre = leerNombreDeCampana(c.nombre)
  // 21-nov · Emilio 10:30Z: sin nombre la campaña nace con el genérico del plan; un nombre escrito y malo sigue siendo un 400
  if (nombre === false) return invalida('nombre', `nombre: el nombre de la campaña va de 1 a ${LARGO_DE_NOMBRE} caracteres, en una sola línea`)
  const cambio = texto(c.cambio, 1, LARGO_DEL_CAMBIO)
  if (!cambio) return invalida('cambio', `qué cambia: escribe qué tiene que cambiar con esta campaña (de 1 a ${LARGO_DEL_CAMBIO} caracteres)`)
  const brief_libre = texto(c.brief_libre, 1, LARGO_DEL_BRIEF)
  if (!brief_libre) return invalida('brief_libre', `brief: escribe el brief de la campaña (de 1 a ${LARGO_DEL_BRIEF} caracteres)`)
  const sinInicio = vacio(c.fecha_inicio), sinFin = vacio(c.fecha_fin)
  if (sinInicio !== sinFin) return invalida(sinInicio ? 'fecha_inicio' : 'fecha_fin', 'fechas: van las dos (inicio y fin) o ninguna')
  if (!sinInicio && !esFechaIso(c.fecha_inicio)) return invalida('fecha_inicio', 'fechas: el inicio debe ser una fecha AAAA-MM-DD')
  if (!sinFin && !esFechaIso(c.fecha_fin)) return invalida('fecha_fin', 'fechas: el fin debe ser una fecha AAAA-MM-DD')
  const fecha_inicio = sinInicio ? null : (c.fecha_inicio as string), fecha_fin = sinFin ? null : (c.fecha_fin as string)
  if (fecha_inicio && fecha_fin) {
    if (fecha_fin <= fecha_inicio) return invalida('fecha_fin', 'fechas: el fin va después del inicio')
    if (diasEntre(fecha_inicio, fecha_fin) > DIAS_MAXIMOS_DE_CAMPANA) return invalida('fecha_fin', `fechas: la campaña dura como mucho ${DIAS_MAXIMOS_DE_CAMPANA} días`)
  }
  const fc = c.fechas_clave === undefined || c.fechas_clave === null ? [] : c.fechas_clave
  if (!Array.isArray(fc)) return invalida('fechas_clave', 'fechas clave: deben ir en una lista')
  if (fc.length > MAXIMO_DE_FECHAS_CLAVE) return invalida('fechas_clave', `fechas clave: hasta ${MAXIMO_DE_FECHAS_CLAVE}`)
  const fechas_clave: FechaClave[] = []
  for (const [i, x] of fc.entries()) {
    const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
    const que = texto(o.que, 1, LARGO_DEL_QUE)
    if (!esFechaIso(o.fecha) || !que) return invalida('fechas_clave', `fechas clave: la ${i + 1}.ª necesita una fecha AAAA-MM-DD y qué pasa ese día (de 1 a ${LARGO_DEL_QUE} caracteres)`)
    fechas_clave.push({ fecha: o.fecha as string, que })
  }
  const t = c.tope_usd
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return invalida('tope_usd', 'tope: escribe cuánto puede gastar la campaña como máximo (un número mayor que 0)')
  if (t > TOPE_MAXIMO_DEL_PEDIDO_USD) return invalida('tope_usd', `tope: como mucho US$ ${TOPE_MAXIMO_DEL_PEDIDO_USD}`)
  if (Math.round(t * 100) !== t * 100) return invalida('tope_usd', 'tope: como mucho dos decimales (centavos)')
  return { ok: true, e: { client_id, seco: c.seco === true, llave: PREFIJO_DE_LA_LLAVE + lf, nombre, cambio, brief_libre, fecha_inicio, fecha_fin, fechas_clave, tope_usd: t, ensayo: c.ensayo === true } }
}

export type LecturaDelMinimo =
  | { ok: true; plan_id: string; minimo: Minimo; fecha_inicio: string; fecha_fin: string; hoy: string; nombre_generico: string }
  | { ok: false; status: number; cuerpo: Record<string, unknown> }
const sinPlan = (): LecturaDelMinimo => ({ ok: false, status: 409, cuerpo: { ok: false, error: 'sin_plan_aprobado', detalle: 'tope: el cliente no tiene un plan aprobado; sin plan no hay campaña nueva' } })
const ilegible = (motivo: string): LecturaDelMinimo => ({ ok: false, status: 503, cuerpo: { ok: false, error: 'minimo_ilegible', detalle: `tope: no se pudo calcular el mínimo (${motivo}); todavía no se puede crear` } })

/**
 * El mínimo de ESTA campaña: el plan vigente y aprobado del cliente; las tandas salen de las fechas pedidas o, sin fechas, de la ventana del plan desde hoy (la misma de `abrirCampana`).
 * Un fallo de lectura es «ilegible» (503), nunca un mínimo bajo.
 */
export async function leerMinimo(al: Almacen, clientId: string, fechas: { inicio: string; fin: string } | null, ahora: string): Promise<LecturaDelMinimo> {
  try {
    const plan = await al.resolverPlan(clientId, null)
    if (!plan) return sinPlan()
    if (!al.planAprobado || !(await al.planAprobado(plan.plan_id))) return sinPlan()
    const ctx = await al.cargarContexto(clientId, plan.plan_id)
    if (!ctx) return ilegible('no se pudo leer el plan del cliente')
    const hoy = hoyEnZona(ahora, ctx.zonaHoraria)
    const v = fechas ?? (() => { const w = ventanaDeLaCampana(ctx.planTexto, hoy, DIAS_DE_CAMPANA, false); return { inicio: w.fecha_inicio, fin: w.fecha_fin } })()
    if (!al.costosDelMinimo) return ilegible('el almacén no sabe leer los costos')
    const minimo = minimoDeCampana(medidaDeCampana({ fecha_inicio: v.inicio, fecha_fin: v.fin }).totalTandas, await al.costosDelMinimo())
    return { ok: true, plan_id: plan.plan_id, minimo, fecha_inicio: v.inicio, fecha_fin: v.fin, hoy, nombre_generico: nombreGenericoDelPlan(ctx.planTexto) }
  } catch (e) {
    return ilegible(e instanceof Error ? e.message : String(e))
  }
}

/** GET del mínimo (la ruta de solo lectura del formulario). Fechas opcionales: las dos o ninguna (sin ellas, la ventana del plan). */
export async function minimoParaElFormulario(al: Almacen, q: { client_id: unknown; fecha_inicio?: unknown; fecha_fin?: unknown }, ahora: string): Promise<Respuesta> {
  const clientId = typeof q.client_id === 'string' && UUID.test(q.client_id.trim()) ? q.client_id.trim() : null
  if (!clientId) return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo: 'client_id', detalle: 'cliente: falta el cliente (client_id debe ser un uuid)' } }
  const sinI = vacio(q.fecha_inicio), sinF = vacio(q.fecha_fin)
  if (sinI !== sinF || (!sinI && (!esFechaIso(q.fecha_inicio) || !esFechaIso(q.fecha_fin) || (q.fecha_fin as string) <= (q.fecha_inicio as string)))) {
    return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo: 'fecha_inicio', detalle: 'fechas: van las dos (AAAA-MM-DD, el fin después del inicio) o ninguna' } }
  }
  const l = await leerMinimo(al, clientId, sinI ? null : { inicio: q.fecha_inicio as string, fin: q.fecha_fin as string }, ahora)
  if (!l.ok) return { status: l.status, cuerpo: l.cuerpo }
  return { status: 200, cuerpo: { ok: true, minimo_usd: l.minimo.minimo_usd, detalle: l.minimo.detalle, fechas: { inicio: l.fecha_inicio, fin: l.fecha_fin } } }
}

/**
 * 21-nov · GET del estado del pedido (contrato con CC2, GO Lenovo 10:28Z): el tablero lo lee mientras el botón dice «Campaña en proceso».
 *   200 `{ ok: true, estado_del_pedido: 'en_proceso' | 'nacida' (+ campana_id) | 'fallida' (+ codigo) }` · 404 `sin_pedido` (esa llave nunca llegó: se puede volver a mandar con la misma) · 400 entrada.
 */
export async function estadoParaElTablero(al: Almacen, q: { client_id: unknown; llave_formulario: unknown; seco?: unknown }): Promise<Respuesta> {
  const clientId = typeof q.client_id === 'string' && UUID.test(q.client_id.trim()) ? q.client_id.trim() : null
  if (!clientId) return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo: 'client_id', detalle: 'cliente: falta el cliente (client_id debe ser un uuid)' } }
  const lf = typeof q.llave_formulario === 'string' && UUID.test(q.llave_formulario.trim()) ? q.llave_formulario.trim().toLowerCase() : null
  if (!lf) return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo: 'llave_formulario', detalle: 'formulario: falta la llave del formulario (un uuid)' } }
  if (q.seco !== undefined && q.seco !== null && q.seco !== 'true' && q.seco !== 'false') return { status: 400, cuerpo: { ok: false, error: 'entrada_invalida', campo: 'seco', detalle: 'seco: true o false' } }
  if (!al.pedidoPorLlave) return { status: 503, cuerpo: { ok: false, error: 'pedidos_no_disponibles', detalle: 'todavía no se puede leer: falta la tabla de pedidos' } }
  const p = await al.pedidoPorLlave(clientId, PREFIJO_DE_LA_LLAVE + lf, q.seco === 'true')
  if (!p) return { status: 404, cuerpo: { ok: false, error: 'sin_pedido', detalle: 'ese pedido no llegó: se puede volver a mandar con la misma llave' } }
  const a = libretaDe(await al.leerConfig(CLAVE_LIBRETA_DE_PEDIDOS))[p.id]
  return { status: 200, cuerpo: { ok: true, pedido_id: p.id, ...estadoDelPedido(p, a) } }
}

/** el sobre que deja el pedido: el mismo «plan listo» de siempre, con la llave y el nombre de la campaña nueva (la puerta se los pasa a `abrirCampana`) */
export function sobreDelPedido(p: Pick<PedidoGuardado, 'client_id' | 'seco' | 'llave' | 'nombre'>, planId: string): SobreDePlan {
  return {
    source: 'planeacion/plan-listo', intent: 'briefear',
    payload: { client_id: p.client_id, plan_id: planId, dry_run: p.seco, desde_worker: DESDE_EL_TABLERO, llave_de_campana: p.llave, nombre_de_campana: p.nombre },
    idempotency_key: `${p.client_id}:crear-campana:${p.llave}`, logical_period: `crear-campana:${p.llave}`, tenant_id: p.client_id, client_id: p.client_id,
  }
}

/**
 * 21-nov · «Crear Campaña» sin vuelta atrás (GO Lenovo 10:28Z) · el estado del pedido que lee el tablero: `nacida` (tiene campaña) · `fallida` (el arreglo propio se rindió, con su código)
 * · `en_proceso` (todo lo demás: el sistema sigue intentando y el botón sigue en «Campaña en proceso»). Va en `estado_del_pedido`: `estado` ya dice pedida o ya_pedida.
 */
export type EstadoDelPedido = { estado_del_pedido: 'nacida'; campana_id: string } | { estado_del_pedido: 'fallida'; codigo: string } | { estado_del_pedido: 'en_proceso' }
export function estadoDelPedido(p: Pick<PedidoGuardado, 'campana_id'>, a: AnotacionDelPedido | undefined): EstadoDelPedido {
  if (p.campana_id) return { estado_del_pedido: 'nacida', campana_id: p.campana_id }
  if (a?.fallida) return { estado_del_pedido: 'fallida', codigo: a.fallida.codigo }
  return { estado_del_pedido: 'en_proceso' }
}
const yaPedida = (p: PedidoGuardado, a: AnotacionDelPedido | undefined, extra: Record<string, unknown> = {}): Respuesta => ({ status: 200, cuerpo: { ok: true, estado: 'ya_pedida', pedido_id: p.id, llave: p.llave, ...(p.campana_id ? { campana_id: p.campana_id } : {}), ...extra, ...estadoDelPedido(p, a) } })
/**
 * 21-nov · CC5 10:32Z: dejar el sobre ocurre DESPUÉS de guardar el pedido. Si eso LANZA (la base de la sala cae), el pedido ya quedó guardado: no se contesta un 500 («no se creó nada» sería falso),
 * sino lo guardado con `despertado: false`; el arreglo propio del vigía (`reparar-pedidos.ts`) lo vuelve a pedir.
 */
async function dejarElSobre(al: Almacen, sobre: SobreDePlan): Promise<Record<string, unknown>> {
  try { return despertado(await al.emitirSobre(sobre)) } catch (e) { return { despertado: false, motivo_sin_despertar: `no se pudo dejar el sobre: ${e instanceof Error ? e.message : String(e)}; el sistema lo vuelve a pedir solo` } }
}
const despertado = (r: Awaited<ReturnType<Almacen['emitirSobre']>>): Record<string, unknown> => (r.resultado === 'rechazado' ? { despertado: false, motivo_sin_despertar: String(r.detalle ?? 'la sala no aceptó el sobre') } : { despertado: true })

/**
 * POST crear-campana: valida → la misma llave ya guardada = «ya pedida» → la cadena admite al cliente → plan aprobado → fechas desde hoy → tope ≥ mínimo → (ensayo: lo que haría,
 * sin escribir) → guarda el pedido → deja el sobre. Un pedido guardado cuyo sobre no entró se vuelve a mandar al repetir (la sala no duplica la misma llave).
 */
export async function crearCampana(al: Almacen, cuerpo: Record<string, unknown>, pedidoPor: string, ahora: string): Promise<Respuesta> {
  const v = validarEntrada(cuerpo)
  if (!v.ok) return { status: v.status, cuerpo: v.cuerpo }
  const e = v.e
  if (!al.pedidoPorLlave || !al.insertarPedidoDeCampana) return { status: 503, cuerpo: { ok: false, error: 'pedidos_no_disponibles', detalle: 'todavía no se puede crear: falta la tabla de pedidos' } }
  const previo = await al.pedidoPorLlave(e.client_id, e.llave, e.seco)
  if (previo) {
    // 21-nov · un pedido que el arreglo propio ya dio por fallido no se vuelve a mandar: el tablero muestra «El intento falló · Crear nuevamente» (con otra llave)
    const anotacion = libretaDe(await al.leerConfig(CLAVE_LIBRETA_DE_PEDIDOS))[previo.id]
    if (previo.campana_id || e.ensayo || anotacion?.fallida) return yaPedida(previo, anotacion)
    const plan = await al.resolverPlan(e.client_id, null)
    if (!plan) return yaPedida(previo, anotacion, { despertado: false, motivo_sin_despertar: 'el cliente ya no tiene plan vigente' })
    return yaPedida(previo, anotacion, await dejarElSobre(al, sobreDelPedido(previo, plan.plan_id)))
  }
  const cerrada = await compuerta(al, e.client_id, e.seco)
  if (cerrada) return { status: 409, cuerpo: { ok: false, error: 'cadena_no_admite', detalle: `todavía no se puede crear: ${String(cerrada.cuerpo.detalle ?? 'la cadena no admite a este cliente')}` } }
  const m = await leerMinimo(al, e.client_id, e.fecha_inicio && e.fecha_fin ? { inicio: e.fecha_inicio, fin: e.fecha_fin } : null, ahora)
  if (!m.ok) return { status: m.status, cuerpo: m.cuerpo }
  if (e.fecha_inicio && e.fecha_inicio < m.hoy) return invalidaR('fecha_inicio', `fechas: el inicio no puede ser antes de hoy (${m.hoy})`)
  for (const [i, f] of e.fechas_clave.entries()) if (f.fecha < m.fecha_inicio || f.fecha > m.fecha_fin) return invalidaR('fechas_clave', `fechas clave: la ${i + 1}.ª (${f.fecha}) queda fuera de la campaña (${m.fecha_inicio} a ${m.fecha_fin})`)
  if (e.tope_usd < m.minimo.minimo_usd) return { status: 409, cuerpo: { ok: false, error: 'tope_bajo_minimo', minimo_usd: m.minimo.minimo_usd, detalle: `tope: el mínimo para esta campaña es US$ ${m.minimo.minimo_usd}`, desglose: m.minimo.detalle } }
  const fila = { client_id: e.client_id, seco: e.seco, llave: e.llave, nombre: e.nombre ?? m.nombre_generico, cambio: e.cambio, fecha_inicio: e.fecha_inicio, fecha_fin: e.fecha_fin, fechas_clave: e.fechas_clave, tope_usd: e.tope_usd, brief_libre: e.brief_libre, pedido_por: pedidoPor }
  if (e.ensayo) return { status: 200, cuerpo: { ok: true, ensayo: true, escrituras: 0, haria: { pedido: fila, sobre: sobreDelPedido(fila, m.plan_id), minimo_usd: m.minimo.minimo_usd, desglose: m.minimo.detalle, fechas: { inicio: m.fecha_inicio, fin: m.fecha_fin } } } }
  let p: PedidoGuardado
  try { p = await al.insertarPedidoDeCampana(fila) } catch (x) {
    // otra pestaña con la MISMA llave ganó la carrera: es el mismo pedido
    const ganador = /23505|duplicate key/i.test(String((x as { code?: string })?.code ?? '') + String((x as Error)?.message ?? '')) ? await al.pedidoPorLlave(e.client_id, e.llave, e.seco) : null
    if (ganador) return yaPedida(ganador, undefined)
    throw x
  }
  return { status: 200, cuerpo: { ok: true, estado: 'pedida', pedido_id: p.id, llave: p.llave, minimo_usd: m.minimo.minimo_usd, ...(await dejarElSobre(al, sobreDelPedido(p, m.plan_id))), estado_del_pedido: 'en_proceso' } }
}
const invalidaR = (campo: string, detalle: string): Respuesta => { const m = invalida(campo, detalle); return { status: m.status, cuerpo: m.cuerpo } }
