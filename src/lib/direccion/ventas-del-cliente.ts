/**
 * GET /api/direccion/ventas · las ventas del negocio del cliente en su punto de venta, para Dinero y su ficha (Emilio 02-nov). Solo lectura, sin modelo, US$ 0.
 * Son ventas del cliente, no lo que la agencia cobra: no sirven para calcular margen de agencia. Los costos del punto de venta están en cero, así que aquí solo hay ingresos.
 * El plan de Loyverse no deja leer más de 31 días atrás (402, verificado 15-oct): lo pedido antes de eso se recorta y se declara. Un cliente propio (`config.cliente_propio`) no le paga a la agencia.
 */
import { credencialesDe, DESFASE_HORARIO_POR_DEFECTO_HORAS, diaLocalDe, inicioDelDiaLocal, leerTiendasDeLoyverse, leerVentasDeLoyverse, MAX_PAGINAS_DEL_RELLENO, type Fetch } from '../portero-alimenta/brazos/propios'
import { esObjeto, numero, redondear, sinSecretos, texto, type Contexto, type Fila } from './comun'

const DIA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DIAS_QUE_DEJA_LEER_EL_PLAN = 31
const MS_DEL_DIA = 86_400_000
const fechaValida = (d: unknown): d is string => {
  if (typeof d !== 'string' || !DIA.test(d)) return false
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}

interface Cifras { ingreso: number; tickets: number; reembolsos: number; anuladas: number }
const vacias = (): Cifras => ({ ingreso: 0, tickets: 0, reembolsos: 0, anuladas: 0 })
const sumar = (x: Cifras, r: Fila): void => {
  const total = numero(r.total_money)
  if (r.cancelled_at) x.anuladas++
  else if (String(r.receipt_type ?? 'SALE').toUpperCase() === 'REFUND') x.reembolsos += Math.abs(total)
  else { x.ingreso += total; x.tickets++ }
}
const redondas = (x: Cifras): Cifras => ({ ...x, ingreso: redondear(x.ingreso), reembolsos: redondear(x.reembolsos) })

export interface OpcionesDeVentas { client_id?: unknown; desde?: unknown; hasta?: unknown }

export async function leerVentasDelCliente(c: Contexto, o: OpcionesDeVentas): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const mal = (detalle: string) => ({ status: 400, cuerpo: { ok: false, error: 'entrada_invalida', detalle } })
  if (typeof o.client_id !== 'string' || !UUID.test(o.client_id)) return mal('`client_id` debe ser un uuid')
  if (!fechaValida(o.desde) || !fechaValida(o.hasta)) return mal('`desde` y `hasta` deben ser fechas AAAA-MM-DD')
  if (o.desde > o.hasta) return mal('`desde` no puede ser posterior a `hasta`')

  const f = await c.db.from('clients').select('id, slug, config').eq('id', o.client_id).limit(1)
  if (f.error) return { status: 500, cuerpo: { ok: false, error: 'direccion_error', detalle: sinSecretos(f.error.message) ?? 'error sin detalle' } }
  const cliente = ((f.data as Fila[] | null) ?? [])[0]
  if (!cliente) return { status: 404, cuerpo: { ok: false, error: 'cliente_no_existe' } }
  const config = esObjeto(cliente.config) ? cliente.config : {}
  const base = { ok: true, client_id: o.client_id, cliente_propio: config.cliente_propio === true, moneda: texto(config.moneda), desde: o.desde, hasta: o.hasta }

  const token = credencialesDe(String(cliente.slug ?? ''), c.env ?? process.env).loyverse_token
  if (!token) return { status: 200, cuerpo: { ...base, disponible: false, motivo: 'sin_punto_de_venta' } }

  const ahora = c.ahora()
  const hoy = diaLocalDe(ahora)
  const piso = new Date(ahora.getTime() - DIAS_QUE_DEJA_LEER_EL_PLAN * MS_DEL_DIA + 60_000)
  const pedido = inicioDelDiaLocal(o.desde, DESFASE_HORARIO_POR_DEFECTO_HORAS)
  const recortado_por_plan = pedido < piso
  const desde = recortado_por_plan ? piso : pedido
  const finPedido = new Date(inicioDelDiaLocal(o.hasta, DESFASE_HORARIO_POR_DEFECTO_HORAS).getTime() + MS_DEL_DIA - 1)
  const hasta = o.hasta >= hoy ? ahora : finPedido
  if (desde > hasta) return { status: 200, cuerpo: { ...base, disponible: true, leido_desde: null, recortado_por_plan, recortado_por_paginas: false, total: redondas(vacias()), por_dia: [], por_mes: [], por_tienda: [] } }

  const traer = (c.fetchImpl ?? fetch) as unknown as Fetch
  const leidos = await leerVentasDeLoyverse({ token, ahora: hasta, desde, fetch: traer, maxPaginas: MAX_PAGINAS_DEL_RELLENO })
  if (!leidos.ok) return { status: 502, cuerpo: { ...base, ok: false, error: 'punto_de_venta_error', detalle: sinSecretos(leidos.error) ?? 'error sin detalle' } }
  const tiendas = await leerTiendasDeLoyverse({ token, fetch: traer }).catch(() => new Map<string, string>())

  const total = vacias()
  const dias = new Map<string, Cifras>(), meses = new Map<string, Cifras>(), porTienda = new Map<string, Cifras>()
  const en = <K>(m: Map<K, Cifras>, k: K): Cifras => { const v = m.get(k) ?? vacias(); m.set(k, v); return v }
  for (const r of leidos.recibos) {
    const t = new Date(String(r.created_at ?? r.receipt_date ?? ''))
    if (Number.isNaN(t.getTime())) continue
    const d = diaLocalDe(t)
    if (d < o.desde || d > o.hasta) continue
    sumar(total, r); sumar(en(dias, d), r); sumar(en(meses, d.slice(0, 7)), r); sumar(en(porTienda, String(r.store_id ?? '')), r)
  }
  const ordenados = (m: Map<string, Cifras>, clave: string) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ [clave]: k, ...redondas(v) }))
  return {
    status: 200,
    cuerpo: {
      ...base, disponible: true, leido_desde: diaLocalDe(desde), recortado_por_plan, recortado_por_paginas: leidos.recortado,
      total: redondas(total), por_dia: ordenados(dias, 'd'), por_mes: ordenados(meses, 'mes'),
      por_tienda: [...porTienda.entries()].map(([id, v]) => ({ tienda: tiendas.get(id) ?? null, ...redondas(v) })).sort((a, b) => b.ingreso - a.ingreso),
    },
  }
}
