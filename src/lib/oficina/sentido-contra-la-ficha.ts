/**
 * CAMBIO 4 · LA JEFATURA DE PIEZAS REVISA EL SENTIDO CONTRA LA FICHA DE HECHOS POR OFERTA (GO Lenovo 17-nov · firma de Emilio 17:22 · sigue de #1122) · puro: sin red ni base.
 * PLAN: raw/tasks/2026-11-17-PLAN-CC4-…-cambio-4-…ficha.md (+ ADENDA 1 con lo de CC7 y CC3).
 *
 *  · LA FICHA se lee TAL CUAL de la hoja de la pieza: la hoja (cadena · `hoja.ts`) ya escribe `- OFERTA:` y `- FICHA DE LA OFERTA:` con `fichaEnLineas(ficha, fecha_de_la_fila)`,
 *    así que las marcas VENCIDO / AÚN NO VIGENTE ya están puestas con la fecha DE LA FILA (nunca con hoy). Nada se copia aparte ni se vuelve a deducir.
 *  · SIN FICHA (campaña sin fichas, oferta sin ficha, sin oferta, hoja sin el campo): «sin ficha para esta oferta» · la revisión mira solo la forma, como hoy,
 *    NO se agrega ningún documento (el pedido al jefe queda igual al de antes) y NADA vuelve a ningún paso (regla de CC3, ADENDA 1).
 *  · LO EXACTO lo compara el código (regla de Emilio «juzgar = agente; verificar exacto = código»): el precio con moneda que no está en la ficha y el dato VENCIDO / AÚN NO VIGENTE
 *    que la hoja o la pieza usan igual. Ante la duda NO dispara y lo declara.
 *  · EL SENTIDO lo juzga el jefe con una línea de la ficha citada: `sentido · <destino>: <qué> — ficha: «<línea>»`. El código verifica la cita (igualdad tras limpiar) y el destino
 *    (uno de cuatro). Cita que no está en la ficha ⇒ «cita no verificada», va a la PIEZA (nunca a un paso de atrás) y no cuenta como aprobada.
 *  · DESTINOS: `pieza` (la vuelta a la mesa que ya existe) · `hoja` · `calendario` · `banco` (los tres de la cadena: la oficina NO los rehace; deja una DEVOLUCIÓN con llave única
 *    por fila y destino, y la pieza va a la bandeja marcada «⚠️ VUELVE A …»).
 *  · Agnóstico: oferta, nunca un rubro. Ninguna rama por cliente.
 */
import type { ContextoDelRevisor } from './ciego'

export const DESTINOS = ['pieza', 'hoja', 'calendario', 'banco'] as const
export type Destino = (typeof DESTINOS)[number]
export const DESTINOS_DE_LA_CADENA: readonly Destino[] = ['hoja', 'calendario', 'banco']

/** los nombres de la hoja (los escribe `src/lib/cadena/hoja.ts`: `campo('OFERTA', …)` y `CAMPO_FICHA`) */
export const CAMPO_OFERTA_DE_LA_HOJA = 'OFERTA'
export const CAMPO_FICHA_DE_LA_HOJA = 'FICHA DE LA OFERTA'

export const TITULO_DE_LA_FICHA = 'Ficha de la oferta'
export const FUNCION_DE_LA_FICHA = 'los hechos de lo que esta pieza vende, cada uno con su fuente y su vigencia en la fecha de la pieza: contra esto se comprueba el sentido'
/** el rótulo con que el jefe abre un hallazgo de sentido (lo pide la vara; el código lo lee por dato) */
export const ROTULO_DE_SENTIDO = 'sentido'

const limpio = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const sinTildes = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** forma de comparar dos textos: sin tildes, sin mayúsculas, sin comillas ni puntuación de borde, espacios simples */
export const normal = (s: unknown): string => sinTildes(limpio(s)).replace(/[«»"“”'‘’`]/g, '').replace(/^[\s\-–—*·.:;,]+|[\s\-–—*·.:;,]+$/g, '').replace(/\s+/g, ' ')

// ───────────────────────── la ficha que trae la hoja
export interface FichaDeLaHoja {
  /** con_ficha: la hoja trae la lista de datos · sin_ficha: no hay (y se dice por qué) */
  estado: 'con_ficha' | 'sin_ficha'
  oferta: string | null
  /** las líneas tal cual las escribió la hoja (`<campo>: <valor> (fuente: …)`) */
  lineas: string[]
  /** lo que declaró la hoja o el motivo de «sin ficha» */
  motivo?: string
  /** el resto de la hoja (todo menos la lista de la ficha): ahí se busca si la hoja USA un dato */
  resto: string
}

/** lee `- OFERTA:` y `- FICHA DE LA OFERTA:` (lista) de la sección de la hoja de esta pieza */
export function fichaDeLaHoja(seccion: string | null | undefined): FichaDeLaHoja {
  const lineas = String(seccion ?? '').split('\n')
  let oferta: string | null = null
  let declarado: string | null = null
  const items: string[] = []
  const resto: string[] = []
  let enLaFicha = false
  let vista = false
  for (const l of lineas) {
    const item = /^\s{2,}-\s+(.*\S)\s*$/.exec(l)
    if (enLaFicha && item) { items.push(limpio(item[1])); continue }
    enLaFicha = false
    const c = /^-\s+([^:]+):\s*(.*)$/.exec(l)
    if (c && limpio(c[1]) === CAMPO_OFERTA_DE_LA_HOJA) oferta = limpio(c[2]) || null
    if (c && limpio(c[1]) === CAMPO_FICHA_DE_LA_HOJA) {
      vista = true
      if (limpio(c[2])) declarado = limpio(c[2])
      else enLaFicha = true
      continue
    }
    resto.push(l)
  }
  const ofertaReal = oferta && !/declarado\s*$/i.test(oferta) ? oferta : null
  const base = { oferta: ofertaReal, resto: resto.join('\n') }
  if (!vista) return { ...base, estado: 'sin_ficha', lineas: [], motivo: 'la hoja no trae la ficha de la oferta' }
  if (!items.length) return { ...base, estado: 'sin_ficha', lineas: [], motivo: declarado ?? 'la ficha llegó vacía' }
  return { ...base, estado: 'con_ficha', lineas: items }
}

/** el documento para el revisor: SOLO con ficha (sin ficha no se agrega nada · el pedido queda como antes) */
export function contextoDeLaFicha(f: FichaDeLaHoja): ContextoDelRevisor | null {
  if (f.estado !== 'con_ficha') return null
  return { titulo: TITULO_DE_LA_FICHA, funcion: FUNCION_DE_LA_FICHA, texto: [`oferta: ${f.oferta ?? '(la hoja no la nombra)'}`, ...f.lineas.map((l) => `- ${l}`)].join('\n') }
}

/** un dato de la ficha partido: el campo, si está VENCIDO o AÚN NO VIGENTE en la fecha de la fila, y el valor (sin la fuente) */
export interface DatoLeido { linea: string; campo: string; marca: 'vencido' | 'aun_no_vigente' | null; valor: string }
export function leerDato(linea: string): DatoLeido | null {
  const i = linea.indexOf(': ')
  if (i <= 0) return null
  const campo = limpio(linea.slice(0, i))
  let resto = linea.slice(i + 2)
  let marca: DatoLeido['marca'] = null
  if (/^VENCIDO · /.test(resto)) { marca = 'vencido'; resto = resto.slice('VENCIDO · '.length) }
  else if (/^AÚN NO VIGENTE · /.test(resto)) { marca = 'aun_no_vigente'; resto = resto.slice('AÚN NO VIGENTE · '.length) }
  const f = resto.lastIndexOf(' (fuente: ')
  const valor = limpio(f > 0 ? resto.slice(0, f) : resto)
  return valor ? { linea, campo, marca, valor } : null
}

// ───────────────────────── el precio (exacto, por código)
/**
 * un número de precio a centavos: `12,50` = `12.5` = 1250 · `1.200` = `1200` = 120000 · `1,2` = 120. La ÚLTIMA separación con 1 o 2 cifras detrás es la de decimales;
 * con 3 cifras detrás es de miles. Lo que no se lee = null (no se compara).
 */
export function centavos(num: string): number | null {
  const s = num.replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const m = /^(.*?)([.,])(\d+)$/.exec(s)
  let entero = s
  let dec = ''
  if (m && m[3].length <= 2) { entero = m[1]; dec = m[3] }
  const e = entero.replace(/[.,]/g, '')
  if (!/^\d+$/.test(e)) return null
  return Number(e) * 100 + (dec ? Number(dec.padEnd(2, '0')) : 0)
}

const MONEDA_ANTES = String.raw`(?:US\$|USD|U\$S|\$|€|£|S\/\.?|R\$|Q|₡|₲|Bs\.?)`
const MONEDA_DESPUES = String.raw`(?:dólares|dolares|usd|eur|euros|soles|pesos|€|\$)`
const RE_PRECIO = new RegExp(String.raw`${MONEDA_ANTES}\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?${MONEDA_DESPUES}(?![a-z])`, 'gi')
/**
 * los precios del texto: SOLO cifras con moneda (antes o después). Fechas «21/11», horas, «20 %», teléfonos y «2x1» no tienen moneda: no cuentan (CC7 · ante la duda, no disparar).
 * Devuelve los centavos y el texto tal cual se vio.
 */
export function preciosDelTexto(texto: string): Array<{ centavos: number; visto: string }> {
  const out: Array<{ centavos: number; visto: string }> = []
  for (const m of String(texto ?? '').matchAll(RE_PRECIO)) {
    const c = centavos(m[1] ?? m[2] ?? '')
    if (c !== null) out.push({ centavos: c, visto: limpio(m[0]) })
  }
  return out
}
/** los precios de un dato de la ficha: con moneda si la trae; si el dato de precio no trae moneda, sus cifras sueltas (el dato YA es un precio) */
function preciosDelDato(valor: string): number[] {
  const conMoneda = preciosDelTexto(valor).map((p) => p.centavos)
  if (conMoneda.length) return conMoneda
  return [...valor.matchAll(/\d[\d.,]*\d|\d/g)].map((m) => centavos(m[0])).filter((c): c is number => c !== null)
}

// ───────────────────────── los hallazgos
export interface Hallazgo {
  destino: Destino
  /** qué está mal, en una línea */
  que: string
  /** la línea de la ficha que lo respalda (verificada), si hay */
  linea_de_la_ficha: string | null
  /** quién lo encontró: el código (exacto) o el jefe (sentido) */
  origen: 'codigo' | 'jefe'
  /** el jefe citó algo que no está en la ficha: va a la pieza y no cuenta como aprobado */
  cita_no_verificada?: true
}
export interface ResultadoExacto { hallazgos: Hallazgo[]; declarado: string[] }

const contieneNormal = (texto: string, valor: string): boolean => { const v = normal(valor); return v.length >= 4 && normal(texto).includes(v) }

/**
 * LO EXACTO · solo con ficha. Sin ficha: nada (y lo declara).
 *  1. precio con moneda en la pieza que NO está entre los precios VIGENTES de «oferta y precio» ⇒ `hoja` si la hoja (fuera de la ficha) trae ese mismo precio, si no `pieza`.
 *     Sin precios vigentes en la ficha ⇒ no se compara y se declara.
 *  2. dato VENCIDO o AÚN NO VIGENTE en la fecha de la fila cuyo valor aparece tal cual (limpio) en la hoja fuera de la ficha ⇒ `hoja`; si no, en la pieza ⇒ `pieza`.
 */
export function chequeosExactos(f: FichaDeLaHoja, textoDeLaPieza: string): ResultadoExacto {
  if (f.estado !== 'con_ficha') return { hallazgos: [], declarado: [`sin ficha para esta oferta (${f.motivo ?? 'sin motivo'}): solo se revisa la forma`] }
  const datos = f.lineas.map(leerDato).filter((d): d is DatoLeido => !!d)
  const hallazgos: Hallazgo[] = []
  const declarado: string[] = []
  const deprecio = datos.filter((d) => normal(d.campo) === 'oferta y precio')
  const vigentes = new Set(deprecio.filter((d) => !d.marca).flatMap((d) => preciosDelDato(d.valor)))
  const enLaPieza = preciosDelTexto(textoDeLaPieza)
  if (enLaPieza.length && !vigentes.size) declarado.push('la ficha no trae un precio vigente: el precio de la pieza no se compara')
  else {
    const enLaHoja = new Set(preciosDelTexto(f.resto).map((p) => p.centavos))
    const vistos = new Set<number>()
    for (const p of enLaPieza) {
      if (vigentes.has(p.centavos) || vistos.has(p.centavos)) continue
      vistos.add(p.centavos)
      const origen = enLaHoja.has(p.centavos) ? 'hoja' : 'pieza'
      hallazgos.push({ destino: origen, origen: 'codigo', que: `el precio «${p.visto}» no está entre los precios vigentes de la ficha${origen === 'hoja' ? ' y viene de la hoja' : ''}`, linea_de_la_ficha: deprecio.find((d) => !d.marca)?.linea ?? null })
    }
  }
  for (const d of datos) {
    if (!d.marca) continue
    const como = d.marca === 'vencido' ? 'VENCIDO' : 'AÚN NO VIGENTE'
    if (contieneNormal(f.resto, d.valor)) hallazgos.push({ destino: 'hoja', origen: 'codigo', que: `la hoja usa un dato ${como} en la fecha de la pieza: «${d.valor}»`, linea_de_la_ficha: d.linea })
    else if (contieneNormal(textoDeLaPieza, d.valor)) hallazgos.push({ destino: 'pieza', origen: 'codigo', que: `la pieza usa un dato ${como} en su fecha: «${d.valor}»`, linea_de_la_ficha: d.linea })
  }
  return { hallazgos, declarado }
}

// ───────────────────────── el sentido (jefe) · lectura y verificación exacta
const RE_SENTIDO = /(?:^|[^\p{L}])sentido\s*·\s*(\p{L}+)\s*:\s*(.*)$/iu
/** ¿la línea es un hallazgo de sentido? devuelve el destino tal como lo escribió el jefe (sin tildes ni mayúsculas), el qué y la cita (o null si no lo es) */
export function leerHallazgoDeSentido(linea: string): { destino_dicho: string; que: string; cita: string | null } | null {
  const m = RE_SENTIDO.exec(String(linea ?? ''))
  if (!m) return null
  const c = /^(.*?)\s*[—–]+\s*ficha\s*:\s*[«"“]?(.+?)[»"”]?\s*$/i.exec(m[2])
  return { destino_dicho: sinTildes(m[1]), que: limpio(c ? c[1] : m[2]), cita: c ? limpio(c[2]) : null }
}

/** ¿la cita está en la ficha? igualdad tras limpiar con una línea entera o con su valor (sin marca ni fuente) */
export function citaVerificada(cita: string | null, f: FichaDeLaHoja): string | null {
  if (!cita || f.estado !== 'con_ficha') return null
  const c = normal(cita)
  if (!c) return null
  for (const l of f.lineas) {
    if (normal(l) === c) return l
    const d = leerDato(l)
    if (d && normal(d.valor) === c) return l
  }
  return null
}
export const esDestino = (s: string): s is Destino => (DESTINOS as readonly string[]).includes(s)

/**
 * los hallazgos de sentido del jefe, verificados. Sin ficha: el jefe no tiene contra qué citar ⇒ ninguno se lee como de sentido (siguen como desacuerdos comunes).
 * Destino fuera de los cuatro, o cita que no está en la ficha ⇒ va a la PIEZA marcado «cita no verificada» (nunca a un paso de atrás).
 */
export function hallazgosDelJefe(lineas: string[], f: FichaDeLaHoja): { hallazgos: Hallazgo[]; resto: string[] } {
  if (f.estado !== 'con_ficha') return { hallazgos: [], resto: lineas }
  const hallazgos: Hallazgo[] = []
  const resto: string[] = []
  for (const l of lineas) {
    const h = leerHallazgoDeSentido(l)
    if (!h) { resto.push(l); continue }
    const linea = citaVerificada(h.cita, f)
    const ok = !!linea && esDestino(h.destino_dicho)
    hallazgos.push({ destino: ok ? (h.destino_dicho as Destino) : 'pieza', origen: 'jefe', que: h.que || l, linea_de_la_ficha: linea, ...(ok ? {} : { cita_no_verificada: true as const }) })
  }
  return { hallazgos, resto }
}

// ───────────────────────── el regreso
export interface Devolucion { llave: string; fila_id: string; destino: Exclude<Destino, 'pieza'>; motivo: string; linea_de_la_ficha: string | null; encargo_id: string; origen: Hallazgo['origen'] }
/** UNA devolución por fila y destino (la llave); repetirla no duplica */
export const llaveDeDevolucion = (filaId: string, destino: Destino): string => `${filaId}:${destino}`

export interface Regreso {
  /** líneas que vuelven a la mesa como corrección (destino pieza) */
  a_la_mesa: string[]
  /** devoluciones nuevas a la cadena (una por fila y destino) */
  devoluciones: Devolucion[]
  /** lo que ya se había devuelto a ese destino: va a una PERSONA (tope · §16), no abre otra devolución */
  a_humano: Hallazgo[]
  /** los destinos de la cadena a los que vuelve (para la marca de la bandeja) */
  vuelve_a: Destino[]
  cita_no_verificada: boolean
}

/** reparte los hallazgos por destino. `yaDevueltas`: las llaves que ya existen (del encargo o de la cadena) */
export function repartir(hallazgos: Hallazgo[], filaId: string | null, encargoId: string, yaDevueltas: ReadonlySet<string>): Regreso {
  const r: Regreso = { a_la_mesa: [], devoluciones: [], a_humano: [], vuelve_a: [], cita_no_verificada: hallazgos.some((h) => h.cita_no_verificada) }
  const nuevas = new Set<string>()
  for (const h of hallazgos) {
    const texto = `${ROTULO_DE_SENTIDO} · ${h.destino}: ${h.que}${h.linea_de_la_ficha ? ` — ficha: «${h.linea_de_la_ficha}»` : ''}${h.cita_no_verificada ? ' (cita no verificada)' : ''}`
    if (h.destino === 'pieza' || !filaId) { r.a_la_mesa.push(texto); continue }
    const llave = llaveDeDevolucion(filaId, h.destino)
    if (yaDevueltas.has(llave)) { r.a_humano.push(h); continue }
    if (nuevas.has(llave)) continue
    nuevas.add(llave)
    r.devoluciones.push({ llave, fila_id: filaId, destino: h.destino, motivo: h.que, linea_de_la_ficha: h.linea_de_la_ficha, encargo_id: encargoId, origen: h.origen })
    if (!r.vuelve_a.includes(h.destino)) r.vuelve_a.push(h.destino)
  }
  for (const h of r.a_humano) if (!r.vuelve_a.includes(h.destino)) r.vuelve_a.push(h.destino)
  return r
}

/** la marca de la bandeja: «⚠️ VUELVE A HOJA · CALENDARIO · » (vacía si no vuelve a la cadena) */
export const marcaDeVuelta = (vuelveA: Destino[]): string => (vuelveA.length ? `⚠️ VUELVE A ${vuelveA.map((d) => d.toUpperCase()).join(' Y ')} · ` : '')
