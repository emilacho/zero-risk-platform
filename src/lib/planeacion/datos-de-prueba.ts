/**
 * DATOS DE PRUEBA POR CLIENTE · una sola convención (orden Lenovo 01-nov 12:36Z, tramo 1, ítem 4). Agnóstica: no sabe de ningún cliente.
 *
 * Quién prueba un negocio (el dueño pidiendo en su propio sitio, la agencia ensayando un cobro) deja rastro en la analítica y en el punto de venta que NO son clientes.
 * Sin separarlo, el plan lee «3 pedidos» donde eran pruebas del dueño. La convención vive en la ficha, `clients.config.datos_de_prueba`:
 *
 *   {
 *     "distinct_ids":   ["id-interno-1", …],            // cuentas / visitantes internos de la analítica (máx. 50)
 *     "rangos":         [{ "desde": "2026-10-02", "hasta": "2026-10-03", "nota": "ensayo de cobro" }, …],  // ventanas en que TODO lo registrado es prueba (máx. 10; hasta exclusivo)
 *     "evento_bandera": "es_prueba",                    // propiedad del evento que, valiendo true/1, lo marca como prueba
 *     "pedidos_de_prueba_hasta": "2026-11-04",           // antes de esta fecha, todo lo de venta (carrito, cobro, pedido) es prueba; las visitas sí cuentan (hasta exclusivo)
 *     "nota":           "texto libre para quien lea la carpeta"
 *   }
 *
 * Ausente o sin nada utilizable ⇒ NADA se excluye y el comportamiento es el de hoy. Lo malformado se DESCARTA y se declara (`descartado`): una exclusión a medias que borra datos reales
 * es peor que no excluir. Nunca se escribe en la ficha del cliente desde aquí: la ficha la llena quien sabe (el dueño / el alta), no el sistema.
 */

export interface RangoDePrueba { readonly desde: string; readonly hasta: string; readonly nota?: string }
export interface DatosDePrueba {
  readonly distinct_ids: readonly string[]
  readonly rangos: readonly RangoDePrueba[]
  readonly evento_bandera: string | null
  readonly pedidos_de_prueba_hasta: string | null
  readonly nota: string | null
  /** lo que venía en la ficha y no se pudo usar (para decirlo, no para ocultarlo) */
  readonly descartado: readonly string[]
}

export const MAX_IDS = 50
export const MAX_RANGOS = 10
const RE_FECHA = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z)?)?$/
const RE_BANDERA = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const RE_ID = /^[^\u0000-\u001f]{1,200}$/

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Lee `config.datos_de_prueba` (o el objeto mismo). Devuelve null si no hay nada utilizable. */
export function leerDatosDePrueba(entrada: unknown): DatosDePrueba | null {
  const crudo = esObjeto(entrada) && esObjeto(entrada.datos_de_prueba) ? entrada.datos_de_prueba : entrada
  if (!esObjeto(crudo)) return null
  const descartado: string[] = []

  const ids: string[] = []
  if (crudo.distinct_ids !== undefined) {
    if (!Array.isArray(crudo.distinct_ids)) descartado.push('distinct_ids no es una lista')
    else {
      for (const v of crudo.distinct_ids) {
        if (typeof v === 'string' && RE_ID.test(v.trim()) && !ids.includes(v.trim())) ids.push(v.trim())
        else descartado.push('distinct_id inválido o repetido')
      }
      if (ids.length > MAX_IDS) { descartado.push(`más de ${MAX_IDS} distinct_ids: se usaron los primeros ${MAX_IDS}`); ids.length = MAX_IDS }
    }
  }

  const rangos: RangoDePrueba[] = []
  if (crudo.rangos !== undefined) {
    if (!Array.isArray(crudo.rangos)) descartado.push('rangos no es una lista')
    else {
      for (const r of crudo.rangos) {
        const d = esObjeto(r) ? String(r.desde ?? '').trim() : ''
        const h = esObjeto(r) ? String(r.hasta ?? '').trim() : ''
        const ok = RE_FECHA.test(d) && RE_FECHA.test(h) && Date.parse(d) < Date.parse(h)
        if (ok) rangos.push({ desde: d, hasta: h, ...(esObjeto(r) && typeof r.nota === 'string' && r.nota.trim() ? { nota: r.nota.trim().slice(0, 200) } : {}) })
        else descartado.push('rango inválido (fechas mal escritas o "desde" no es anterior a "hasta")')
      }
      if (rangos.length > MAX_RANGOS) { descartado.push(`más de ${MAX_RANGOS} rangos: se usaron los primeros ${MAX_RANGOS}`); rangos.length = MAX_RANGOS }
    }
  }

  let bandera: string | null = null
  if (crudo.evento_bandera !== undefined && crudo.evento_bandera !== null) {
    if (typeof crudo.evento_bandera === 'string' && RE_BANDERA.test(crudo.evento_bandera.trim())) bandera = crudo.evento_bandera.trim()
    else descartado.push('evento_bandera inválida (solo letras, números y _)')
  }
  const nota = typeof crudo.nota === 'string' && crudo.nota.trim() ? crudo.nota.trim().slice(0, 300) : null

  let pedidosHasta: string | null = null
  if (crudo.pedidos_de_prueba_hasta !== undefined && crudo.pedidos_de_prueba_hasta !== null) {
    const f = String(crudo.pedidos_de_prueba_hasta).trim()
    if (RE_FECHA.test(f)) pedidosHasta = f
    else descartado.push('pedidos_de_prueba_hasta no es una fecha')
  }
  if (!ids.length && !rangos.length && !bandera && !pedidosHasta) return descartado.length ? { distinct_ids: [], rangos: [], evento_bandera: null, pedidos_de_prueba_hasta: null, nota, descartado } : null
  return { distinct_ids: ids, rangos, evento_bandera: bandera, pedidos_de_prueba_hasta: pedidosHasta, nota, descartado }
}

// lo que hace un comprador, no un visitante. Agnóstico: los nombres de evento de los sitios que construimos y los habituales
const PATRON_DE_VENTA = '^(cart|checkout|order|payment|purchase|pedido|pago|compra)'
// para cualquier cliente: todo pedido cuenta salvo el que apenas se abre, se mira o se cae
const ES_VENTA_CERRADA = /^(order_(?!viewed|created|started|opened|abandoned|failed|cancel)|payment_(succeeded|completed|confirmed)|checkout_completed|purchase|pedido(?!_(iniciado|abierto|visto|cancelado|fallido))|pago(?!_(iniciado|fallido|rechazado))|compra(?!_(iniciada|cancelada|fallida)))/i

const lit = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'"

/**
 * Condiciones HogQL (cada una empieza por « and ») que dejan FUERA lo que es prueba. Vacío si no hay nada que excluir.
 * `timestamp` es el de PostHog; el rango es [desde, hasta).
 */
export function condicionesHogQL(dp: DatosDePrueba | null): string {
  if (!dp) return ''
  let q = ''
  if (dp.distinct_ids.length) q += ' and distinct_id not in (' + dp.distinct_ids.map(lit).join(', ') + ')'
  for (const r of dp.rangos) q += ' and not (timestamp >= parseDateTimeBestEffort(' + lit(r.desde) + ') and timestamp < parseDateTimeBestEffort(' + lit(r.hasta) + '))'
  if (dp.evento_bandera) q += " and coalesce(toString(properties." + dp.evento_bandera + "), '') not in ('true', '1')"
  if (dp.pedidos_de_prueba_hasta) q += " and not (match(event, '" + PATRON_DE_VENTA + "') and timestamp < parseDateTimeBestEffort(" + lit(dp.pedidos_de_prueba_hasta) + '))'
  return q
}

/**
 * 04-nov · para cualquier sitio, sin tocar su ficha: un evento que el sitio marque `es_prueba` nunca cuenta (la marca es parte de la plantilla de los sitios).
 * Sin marca, el evento pasa: una propiedad ausente no excluye nada.
 */
export const BANDERA_DE_LA_CASA = 'es_prueba'
export const condicionDeLaCasa = (): string => " and coalesce(toString(properties." + BANDERA_DE_LA_CASA + "), '') not in ('true', '1')"

/** ¿queda algo de venta en lo que se contó? Si no, el plan debe saberlo en vez de leer un embudo vacío */
export const hayVentasEnElEmbudo = (eventos: readonly string[]): boolean => eventos.some((e) => ES_VENTA_CERRADA.test(e))
export const SIN_VENTAS_DEL_SITIO = 'sin ventas reales por el sitio todavía'

/** Lo que viaja pegado al dato para que quien lo lea sepa qué se dejó fuera. */
export function rotuloDeExclusion(dp: DatosDePrueba | null): string | null {
  if (!dp) return null
  const partes: string[] = []
  if (dp.distinct_ids.length) partes.push(`${dp.distinct_ids.length} cuenta(s) interna(s)`)
  if (dp.rangos.length) partes.push(`${dp.rangos.length} ventana(s) de prueba`)
  if (dp.evento_bandera) partes.push(`eventos marcados «${dp.evento_bandera}»`)
  if (dp.pedidos_de_prueba_hasta) partes.push(`lo de venta anterior al ${dp.pedidos_de_prueba_hasta.slice(0, 10)}`)
  if (!partes.length) return null
  return 'Se dejó fuera lo que son pruebas del dueño o de la agencia, no clientes: ' + partes.join(' · ') + '.'
}
