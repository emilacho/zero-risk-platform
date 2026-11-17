/**
 * LA FICHA DE HECHOS POR OFERTA · Sprint 4 · arreglo A (GO Lenovo 17-nov · firma de Emilio 17:01 Zúrich · 🟢 CC6 a los 4 diseños · CC3).
 *
 * Como la orden de trabajo de una agencia (Clients & Profits: una ficha por trabajo · Rock.so: cada obligatorio con su fuente): los DATOS de lo que
 * la pieza vende, cada uno con su fuente y su vigencia. La OFERTA es la unidad agnóstica: lo que la pieza vende (un lugar, un producto, un plan,
 * un servicio, una línea o un evento). Su clave es la que trae la fila del calendario (hoy la columna `sede`); el código no sabe de qué rubro es.
 *
 * Aquí vive la FORMA (el contrato que usan la hoja, la mesa de la gran idea · D, la crítica · E y el brief · C) y UNA sola función de texto,
 * `fichasEnTexto`, que todos usan tal cual. Quién la llena: un lector (opción 1, RESPUESTA-LENOVO-a-CC3-CC6-sprint4-quien-llena-la-ficha).
 * La ficha NO es una reja: no bloquea, no juzga ni corrige; es un insumo. Puro: sin red, sin base, sin modelo.
 */

/**
 * un dato de la ficha: el valor, de dónde sale (id de referencia `ficha:…`/`manual:…`/`plan:…` o una cita) y, si se sabe, hasta cuándo vale (AAAA-MM-DD).
 * `vigente_desde` (16:32Z · CC6): lo que empieza después de la fecha de la pieza (p. ej. una apertura futura) llega «AÚN NO VIGENTE», nunca como presente.
 * `red`: solo para lo que cambia por red (p. ej. cómo se compra desde una red u otra); sin `red` vale para todas.
 */
export interface DatoDeFicha { valor: string; fuente: string; vigente_desde?: string | null; vigente_hasta?: string | null; red?: string | null }
/** el objetivo de la oferta para un tramo de fechas (AAAA-MM-DD, ambos incluidos; sin `desde` o `hasta` = abierto) */
export interface ObjetivoPorFecha { desde?: string | null; hasta?: string | null; objetivo: string; fuente: string }

export interface FichaDeOferta {
  /** la clave de la oferta (la que trae la fila del calendario) */
  clave: string
  nombre?: string | null
  que_es?: DatoDeFicha | null
  para_quien_y_donde?: DatoDeFicha | null
  se_puede_afirmar?: DatoDeFicha[]
  no_se_puede_afirmar?: DatoDeFicha[]
  oferta_y_precio?: DatoDeFicha[]
  como_se_compra?: DatoDeFicha[]
  que_mostrar?: DatoDeFicha[]
  que_nunca_mostrar?: DatoDeFicha[]
  obligatorios_legales?: DatoDeFicha[]
  objetivo_por_fecha?: ObjetivoPorFecha[]
}

/** el nombre del bloque en el pedido de una mesa (D, E) y en la hoja: el mismo texto para todos */
export const TITULO_DEL_BLOQUE = '# FICHAS DE LAS OFERTAS'

const limpio = (s: unknown): string => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
const clave = (s: unknown): string => limpio(s).toLowerCase()
const esFecha = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s)
/** un dato sin valor o SIN FUENTE no entra (no se escribe «sin fuente»: se descarta y quien llama lo avisa) */
export const datoValido = (d: Partial<DatoDeFicha> | null | undefined): d is DatoDeFicha => !!d && !!limpio(d.valor) && !!limpio(d.fuente)

/** la ficha de la oferta de una fila (por su clave, sin distinguir mayúsculas); sin clave o sin ficha = null */
export function fichaDeLaOferta(fichas: ReadonlyArray<FichaDeOferta> | null | undefined, oferta: string | null | undefined): FichaDeOferta | null {
  const k = clave(oferta)
  if (!k || !fichas?.length) return null
  return fichas.find((f) => clave(f.clave) === k) ?? null
}

/** el objetivo que vale para la fecha de la pieza (el tramo más angosto que la contiene); sin fecha legible o sin tramo = null */
export function objetivoParaLaFecha(ficha: Pick<FichaDeOferta, 'objetivo_por_fecha'>, fecha: string | null | undefined): ObjetivoPorFecha | null {
  const f = limpio(fecha)
  if (!esFecha(f)) return null
  const dentro = (ficha.objetivo_por_fecha ?? []).filter((o) => limpio(o.objetivo) && limpio(o.fuente) && (!o.desde || o.desde <= f) && (!o.hasta || f <= o.hasta))
  if (!dentro.length) return null
  const largo = (o: ObjetivoPorFecha) => (o.hasta ? Date.parse(o.hasta) : 8.64e15) - (o.desde ? Date.parse(o.desde) : -8.64e15)
  return dentro.slice().sort((a, b) => largo(a) - largo(b))[0]
}

/** ¿el dato ya no vale en la fecha de la pieza? (solo si ambas fechas se leen) */
export const vencido = (d: Pick<DatoDeFicha, 'vigente_hasta'>, fecha?: string | null): boolean => {
  const h = limpio(d.vigente_hasta), f = limpio(fecha)
  return esFecha(h) && esFecha(f) && f > h
}

/** ¿el dato todavía no vale en la fecha de la pieza? (empieza después; solo si ambas fechas se leen) · el simétrico de `vencido` */
export const aunNoVigente = (d: Pick<DatoDeFicha, 'vigente_desde'>, fecha?: string | null): boolean => {
  const desde = limpio(d.vigente_desde), f = limpio(fecha)
  return esFecha(desde) && esFecha(f) && f < desde
}

/** «valor (fuente: x · vale hasta AAAA-MM-DD)»; un dato vencido para la fecha de la pieza llega marcado VENCIDO, nunca como vigente (no se borra: la mesa decide) */
export function datoEnTexto(d: DatoDeFicha, fechaDeLaPieza?: string | null): string {
  const hasta = limpio(d.vigente_hasta)
  const red = limpio(d.red)
  const desde = limpio(d.vigente_desde)
  const futuro = aunNoVigente(d, fechaDeLaPieza)
  const marca = futuro ? 'AÚN NO VIGENTE · ' : vencido(d, fechaDeLaPieza) ? 'VENCIDO · ' : ''
  const vence = hasta ? ` · ${marca === 'VENCIDO · ' ? 'venció el' : 'vale hasta'} ${hasta}` : ''
  // sin fecha de referencia, «desde» neutro (🟡 3 de CC6 a #1131): «vale desde», leído hoy, suena a presente
  const conFecha = esFecha(limpio(fechaDeLaPieza))
  return `${marca}${limpio(d.valor)} (fuente: ${limpio(d.fuente)}${red ? ` · solo en ${red}` : ''}${desde ? ` · ${futuro ? 'empieza el' : conFecha ? 'vale desde' : 'desde'} ${desde}` : ''}${vence})`
}

const CAMPOS: ReadonlyArray<{ k: Exclude<keyof FichaDeOferta, 'clave' | 'nombre' | 'objetivo_por_fecha'>; etiqueta: string }> = [
  { k: 'que_es', etiqueta: 'qué es' },
  { k: 'para_quien_y_donde', etiqueta: 'para quién y dónde está disponible' },
  { k: 'se_puede_afirmar', etiqueta: 'se puede afirmar' },
  { k: 'no_se_puede_afirmar', etiqueta: 'NO se puede afirmar' },
  { k: 'oferta_y_precio', etiqueta: 'oferta y precio' },
  { k: 'como_se_compra', etiqueta: 'cómo se compra o contrata' },
  { k: 'que_mostrar', etiqueta: 'qué mostrar' },
  { k: 'que_nunca_mostrar', etiqueta: 'qué NUNCA mostrar' },
  { k: 'obligatorios_legales', etiqueta: 'obligatorios legales' },
]
const datosDe = (ficha: FichaDeOferta, k: (typeof CAMPOS)[number]['k']): Array<Partial<DatoDeFicha>> => {
  const v = ficha[k] as DatoDeFicha | DatoDeFicha[] | null | undefined
  return Array.isArray(v) ? v : v ? [v] : []
}

/** cuántos datos de la ficha se descartaron por no traer fuente (o valor) · para que quien escribe la hoja lo AVISE */
export function datosSinFuente(ficha: FichaDeOferta): number {
  let n = 0
  for (const { k } of CAMPOS) for (const d of datosDe(ficha, k)) if (!datoValido(d) && limpio(d?.valor)) n++
  for (const o of ficha.objetivo_por_fecha ?? []) if (limpio(o.objetivo) && !limpio(o.fuente)) n++
  return n
}

/**
 * las líneas de UNA ficha (una por dato: «<campo>: <valor> (fuente: …)»), más el objetivo para la fecha de la pieza si se da.
 * Un dato sin fuente no entra. Un campo sin datos se declara una vez al final («sin dato: …»), nunca se inventa.
 * Sin `fechaDeLaPieza` (el pedido de una mesa, que no es de una pieza) se listan todos los tramos de objetivo.
 */
export function fichaEnLineas(ficha: FichaDeOferta, fechaDeLaPieza?: string | null, opciones: { todosLosTramos?: boolean } = {}): string[] {
  const out: string[] = []
  const sinDato: string[] = []
  for (const { k, etiqueta } of CAMPOS) {
    const lista = datosDe(ficha, k).filter(datoValido)
    if (!lista.length) { sinDato.push(etiqueta); continue }
    for (const d of lista) out.push(`${etiqueta}: ${datoEnTexto(d, fechaDeLaPieza)}`)
  }
  const tramo = (o: ObjetivoPorFecha) => (o.desde || o.hasta ? ` · del ${o.desde ?? '…'} al ${o.hasta ?? '…'}` : '')
  if (limpio(fechaDeLaPieza) && !opciones.todosLosTramos) {
    const obj = objetivoParaLaFecha(ficha, fechaDeLaPieza)
    if (obj) out.push(`objetivo para esta fecha: ${limpio(obj.objetivo)} (fuente: ${limpio(obj.fuente)}${tramo(obj)})`)
    else sinDato.push('objetivo para esta fecha')
  } else {
    const tramos = (ficha.objetivo_por_fecha ?? []).filter((o) => limpio(o.objetivo) && limpio(o.fuente))
    for (const o of tramos) out.push(`objetivo: ${limpio(o.objetivo)} (fuente: ${limpio(o.fuente)}${tramo(o)})`)
    if (!tramos.length) sinDato.push('objetivo por fecha')
  }
  if (sinDato.length) out.push(`sin dato: ${sinDato.join(', ')}`)
  return out
}

/**
 * EL BLOQUE para el pedido de una mesa (gran idea · D, crítica · E): todas las fichas, con su clave y nombre. Lo usan todos tal cual.
 * Sin fichas, lo DICE (nunca un bloque vacío en silencio).
 * `hoy` (🟡 3 de CC6 a #1131): la fecha de referencia · marca «VENCIDO» y «AÚN NO VIGENTE» igual que la hoja; los tramos de objetivo van todos.
 */
export function fichasEnTexto(fichas: ReadonlyArray<FichaDeOferta> | null | undefined, hoy?: string | null): string {
  if (!fichas?.length) return `${TITULO_DEL_BLOQUE}\n(sin fichas de hechos todavía: trabaja con el manual y el brief, y no inventes datos de la oferta)`
  const ref = esFecha(limpio(hoy)) ? limpio(hoy) : null
  const titulo = ref ? `${TITULO_DEL_BLOQUE}\n(vigencias leídas al ${ref})` : TITULO_DEL_BLOQUE
  return [titulo, ...fichas.map((f) => [`## ${limpio(f.clave)}${f.nombre ? ` · ${limpio(f.nombre)}` : ''}`, ...fichaEnLineas(f, ref, { todosLosTramos: true }).map((l) => `- ${l}`)].join('\n'))].join('\n\n')
}

/**
 * el dato de «cómo se compra» que vale para la red de la pieza: primero el de ESA red, después el general (sin red). Vencidos y aún no vigentes no.
 * Escribir el llamado es trabajo creativo: esto es el HECHO (Rock.so: el llamado es un obligatorio con fuente).
 */
export function comoSeCompraParaLaRed(ficha: FichaDeOferta | null, red: string | null | undefined, fecha?: string | null): DatoDeFicha | null {
  const datos = (ficha?.como_se_compra ?? []).filter(datoValido).filter((d) => !vencido(d, fecha) && !aunNoVigente(d, fecha))
  const r = clave(red)
  return datos.find((d) => r && clave(d.red) === r) ?? datos.find((d) => !limpio(d.red)) ?? null
}
