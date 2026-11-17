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

// ─────────────────────────────────────────────── los hechos del cerebro en la ficha (entrega 2 · nombres acordados con CC-CEREBRO 17-nov)
/**
 * UN hecho del negocio tal como lo sirve la consulta del cerebro (PROPUESTA-CC-CEREBRO-a-CC3-nombres-de-campo-del-hecho-por-oferta).
 * El cerebro es el DUEÑO del hecho: la ficha lo cita, no lo vuelve a deducir; si chocan, manda el cerebro. Solo `tipo`, nunca el campo de la ficha.
 */
export interface HechoDelNegocioPorOferta {
  /** la clave de la oferta (la de la fila); null = de todo el negocio */
  oferta: string | null
  sede_id?: string | null
  tipo: 'sede' | 'apertura' | 'cierre_retiro' | 'zona_de_entrega' | 'aun_no_existe'
  valor: string
  vigente_desde?: string | null
  vigente_hasta?: string | null
  /** el `provenance_tag` del cerebro, tal cual */
  fuente: string
  fecha_de_la_fuente?: string | null
  confianza?: 'alta' | 'media' | 'baja' | null
}

/** dónde cae cada tipo de hecho en la ficha (lo decide el lector, no el cerebro) */
const CAMPO_DEL_HECHO: Record<HechoDelNegocioPorOferta['tipo'], 'para_quien_y_donde' | 'se_puede_afirmar' | 'como_se_compra' | 'no_se_puede_afirmar'> = {
  sede: 'para_quien_y_donde',
  apertura: 'se_puede_afirmar',
  zona_de_entrega: 'como_se_compra',
  cierre_retiro: 'no_se_puede_afirmar',
  aun_no_existe: 'no_se_puede_afirmar',
}

/** el hecho como dato citado: la fecha de la fuente y la confianza viajan en el texto de la fuente (no se pierden) */
export function datoDelHecho(h: HechoDelNegocioPorOferta): DatoDeFicha | null {
  if (!limpio(h.valor) || !limpio(h.fuente) || !CAMPO_DEL_HECHO[h.tipo]) return null
  const extra = [limpio(h.fecha_de_la_fuente) ? `dicho el ${limpio(h.fecha_de_la_fuente)}` : '', h.confianza ? `confianza ${h.confianza}` : ''].filter(Boolean)
  return {
    valor: limpio(h.valor),
    fuente: [`cerebro:${limpio(h.fuente)}`, ...extra].join(' · '),
    ...(limpio(h.vigente_desde) ? { vigente_desde: limpio(h.vigente_desde) } : {}),
    ...(limpio(h.vigente_hasta) ? { vigente_hasta: limpio(h.vigente_hasta) } : {}),
  }
}

/**
 * Suma los hechos del cerebro a las fichas del lector. Manda el cerebro:
 * - `para_quien_y_donde` (un solo dato) lo reemplaza el del cerebro;
 * - en las listas, el hecho entra primero y un dato del lector con el MISMO valor sale (no se duplica);
 * - un hecho de una oferta sin ficha abre su ficha; uno de todo el negocio (`oferta: null`) va a todas.
 * Puro: no lee nada. Devuelve fichas nuevas (no toca las de entrada).
 */
export function fichasConHechos(fichas: ReadonlyArray<FichaDeOferta>, hechos: ReadonlyArray<HechoDelNegocioPorOferta> | null | undefined): FichaDeOferta[] {
  const out: FichaDeOferta[] = fichas.map((f) => ({ ...f }))
  for (const h of hechos ?? []) {
    const d = datoDelHecho(h)
    if (!d) continue
    const destino = h.oferta ? [out.find((f) => clave(f.clave) === clave(h.oferta)) ?? (out[out.push({ clave: limpio(h.oferta) }) - 1])] : out
    const campo = CAMPO_DEL_HECHO[h.tipo]
    for (const f of destino) {
      if (campo === 'para_quien_y_donde') { f.para_quien_y_donde = d; continue }
      const lista = (f[campo] ?? []).filter((x) => clave(x.valor) !== clave(d.valor))
      f[campo] = [d, ...lista]
    }
  }
  // 🟡 2 de CC6 a #1138 · el cerebro manda también sobre lo que el lector AFIRMA de una oferta que cierra o que todavía no existe
  for (const h of hechos ?? []) {
    if ((h.tipo !== 'cierre_retiro' && h.tipo !== 'aun_no_existe') || !datoDelHecho(h)) continue
    for (const f of h.oferta ? out.filter((x) => clave(x.clave) === clave(h.oferta)) : out) acotarAlCerebro(f, h)
  }
  return out
}

const AFIRMABLES = ['para_quien_y_donde', 'se_puede_afirmar', 'como_se_compra'] as const
const delCerebro = (d: DatoDeFicha): boolean => d.fuente.startsWith('cerebro:')
const masDias = (f: string, n: number): string => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Lo que el lector afirma de una oferta que el cerebro da por cerrada (`cierre_retiro`) o por inexistente (`aun_no_existe`):
 * - cierra el día D → lo del lector vale hasta D−1 (desde D la hoja lo marca VENCIDO);
 * - todavía no existe hasta E → lo del lector vale desde E+1 (antes, AÚN NO VIGENTE);
 * - sin fecha → lo del lector NO se afirma (sale de los campos afirmables).
 * Cuando algo cambió, la ficha DECLARA el choque en `no_se_puede_afirmar` (con la fuente del cerebro). Lo que dice el cerebro no se toca.
 */
function acotarAlCerebro(f: FichaDeOferta, h: HechoDelNegocioPorOferta): void {
  const desde = limpio(h.vigente_desde), hasta = limpio(h.vigente_hasta)
  const cierra = h.tipo === 'cierre_retiro'
  const fecha = cierra ? (esFecha(desde) ? desde : null) : (esFecha(hasta) ? hasta : null)
  let tocados = 0
  const acotar = (d: DatoDeFicha): DatoDeFicha | null => {
    if (delCerebro(d)) return d
    tocados++
    if (!fecha) return null
    if (cierra) { const tope = masDias(fecha, -1); return { ...d, vigente_hasta: d.vigente_hasta && esFecha(d.vigente_hasta) && d.vigente_hasta < tope ? d.vigente_hasta : tope } }
    const inicio = masDias(fecha, 1)
    return { ...d, vigente_desde: d.vigente_desde && esFecha(d.vigente_desde) && d.vigente_desde > inicio ? d.vigente_desde : inicio }
  }
  for (const campo of AFIRMABLES) {
    if (campo === 'para_quien_y_donde') {
      if (!f.para_quien_y_donde) continue
      const d = acotar(f.para_quien_y_donde)
      if (d) f.para_quien_y_donde = d
      else delete f.para_quien_y_donde
      continue
    }
    if (!f[campo]) continue
    const lista = f[campo]!.map(acotar).filter((d): d is DatoDeFicha => d !== null)
    if (lista.length) f[campo] = lista
    else delete f[campo]
  }
  if (!tocados) return
  const que = cierra ? `cierra desde ${fecha ?? '(sin fecha: ya cerrada)'}` : `todavía no existe${fecha ? ` (hasta ${fecha})` : ''}`
  const vale = !fecha ? 'no se afirma' : cierra ? `vale solo hasta ${masDias(fecha, -1)}` : `vale solo desde ${masDias(fecha, 1)}`
  f.no_se_puede_afirmar = [...(f.no_se_puede_afirmar ?? []), { valor: `choque con el cerebro: esta oferta ${que} · lo que se afirmaba de ella por otras fuentes ${vale}`, fuente: datoDelHecho(h)!.fuente }]
}

// ─────────────────────────────────────────────── lo que entrega el lector (contrato `fichas_de_oferta.v1`, modo estricto) → la forma de la ficha
/** el objeto tal como lo exige el modo estricto (todo obligatorio, «» = ninguno) */
export interface DatoEstricto { valor: string; fuente: string; vigente_desde: string; vigente_hasta: string; red: string }
export interface FichaEstricta {
  clave: string; nombre: string
  que_es: DatoEstricto[]; para_quien_y_donde: DatoEstricto[]; se_puede_afirmar: DatoEstricto[]; no_se_puede_afirmar: DatoEstricto[]; oferta_y_precio: DatoEstricto[]
  como_se_compra: DatoEstricto[]; que_mostrar: DatoEstricto[]; que_nunca_mostrar: DatoEstricto[]; obligatorios_legales: DatoEstricto[]
  objetivo_por_fecha: Array<{ desde: string; hasta: string; objetivo: string; fuente: string }>
}
export interface FichasLeidas { fichas: FichaDeOferta[]; pendientes: string[]; descartados: number; avisos: string[] }

const LISTAS = ['se_puede_afirmar', 'no_se_puede_afirmar', 'oferta_y_precio', 'como_se_compra', 'que_mostrar', 'que_nunca_mostrar', 'obligatorios_legales'] as const

/**
 * Lleva la salida del lector a `FichaDeOferta[]`. Un dato sin fuente NO entra y se cuenta (`descartados`); una ficha sin clave no entra y se avisa;
 * una clave repetida se junta con la primera (se avisa). Una fecha que no es AAAA-MM-DD se descarta (el dato queda, sin esa fecha). Puro.
 */
export function leerFichasDelLector(x: unknown): FichasLeidas {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<{ fichas: unknown; pendientes: unknown }>
  const avisos: string[] = []
  let descartados = 0
  const fecha = (s: unknown): string | null => (esFecha(limpio(s)) ? limpio(s) : null)
  const dato = (d: Partial<DatoEstricto> | null | undefined): DatoDeFicha | null => {
    if (!d || !limpio(d.valor)) return null
    if (!limpio(d.fuente)) { descartados++; return null }
    const desde = fecha(d.vigente_desde), hasta = fecha(d.vigente_hasta), red = limpio(d.red)
    return { valor: limpio(d.valor), fuente: limpio(d.fuente), ...(desde ? { vigente_desde: desde } : {}), ...(hasta ? { vigente_hasta: hasta } : {}), ...(red ? { red } : {}) }
  }
  const datos = (v: unknown): DatoDeFicha[] => (Array.isArray(v) ? v : []).map((d) => dato(d as Partial<DatoEstricto>)).filter((d): d is DatoDeFicha => d !== null)
  const fichas: FichaDeOferta[] = []
  for (const e of Array.isArray(o.fichas) ? (o.fichas as Array<Partial<FichaEstricta>>) : []) {
    if (!e || typeof e !== 'object') continue
    const k = limpio(e.clave)
    if (!k) { avisos.push('una ficha vino sin clave · no entra'); continue }
    const f: FichaDeOferta = { clave: k }
    if (limpio(e.nombre)) f.nombre = limpio(e.nombre)
    const qe = datos(e.que_es)[0], pq = datos(e.para_quien_y_donde)[0]
    if (qe) f.que_es = qe
    if (pq) f.para_quien_y_donde = pq
    for (const campo of LISTAS) { const l = datos(e[campo]); if (l.length) f[campo] = l }
    const obj: ObjetivoPorFecha[] = []
    for (const t of Array.isArray(e.objetivo_por_fecha) ? e.objetivo_por_fecha : []) {
      if (!t || !limpio(t.objetivo)) continue
      if (!limpio(t.fuente)) { descartados++; continue }
      obj.push({ objetivo: limpio(t.objetivo), fuente: limpio(t.fuente), ...(fecha(t.desde) ? { desde: fecha(t.desde) } : {}), ...(fecha(t.hasta) ? { hasta: fecha(t.hasta) } : {}) })
    }
    if (obj.length) f.objetivo_por_fecha = obj
    const previa = fichas.find((p) => clave(p.clave) === clave(k))
    if (previa) {
      avisos.push(`la oferta «${k}» vino dos veces · se juntan sus datos`)
      for (const campo of LISTAS) if (f[campo]) previa[campo] = [...(previa[campo] ?? []), ...f[campo]!]
      previa.que_es ??= f.que_es
      previa.para_quien_y_donde ??= f.para_quien_y_donde
      if (f.objetivo_por_fecha) previa.objetivo_por_fecha = [...(previa.objetivo_por_fecha ?? []), ...f.objetivo_por_fecha]
      continue
    }
    fichas.push(f)
  }
  if (descartados) avisos.push(`${descartados} ${descartados === 1 ? 'dato vino' : 'datos vinieron'} sin fuente · no ${descartados === 1 ? 'entra' : 'entran'}`)
  const pendientes = (Array.isArray(o.pendientes) ? o.pendientes : []).map(limpio).filter(Boolean)
  return { fichas, pendientes, descartados, avisos }
}

/** un hecho del cerebro como línea para el pedido del lector (para que no lo contradiga) */
export const hechoEnTexto = (h: HechoDelNegocioPorOferta): string =>
  `${h.oferta ? `[${limpio(h.oferta)}] ` : '[todo el negocio] '}${h.tipo}: ${limpio(h.valor)}${limpio(h.vigente_desde) ? ` · desde ${limpio(h.vigente_desde)}` : ''}${limpio(h.vigente_hasta) ? ` · hasta ${limpio(h.vigente_hasta)}` : ''} (fuente: cerebro:${limpio(h.fuente)})`
