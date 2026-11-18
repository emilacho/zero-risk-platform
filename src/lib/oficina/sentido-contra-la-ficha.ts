/**
 * CAMBIO 4 · LA JEFATURA DE PIEZAS REVISA EL SENTIDO CONTRA LA FICHA DE HECHOS POR OFERTA (GO Lenovo 17-nov · firma de Emilio 17:22 · sigue de #1122) · puro: sin red ni base.
 * PLAN: raw/tasks/2026-11-17-PLAN-CC4-…-cambio-4-…ficha.md (+ ADENDA 1 con lo de CC7 y CC3).
 *
 *  · LA FICHA se lee TAL CUAL de la hoja de la pieza: la hoja (cadena · `hoja.ts`) ya escribe `- OFERTA:` y `- FICHA DE LA OFERTA:` con `fichaEnLineas(ficha, fecha_de_la_fila)`,
 *    así que las marcas VENCIDO / AÚN NO VIGENTE ya están puestas con la fecha DE LA FILA (nunca con hoy). Nada se copia aparte ni se vuelve a deducir.
 *  · SIN FICHA (campaña sin fichas, oferta sin ficha, sin oferta, hoja sin el campo): «sin ficha para esta oferta» · la revisión mira solo la forma, como hoy,
 *    NO se agrega ningún documento (el pedido al jefe queda igual al de antes) y NADA vuelve a ningún paso (regla de CC3, ADENDA 1).
 *  · LO EXACTO por código (precio, dato vencido que se usa igual) vive APARTE en `exactos-de-la-ficha.ts`: Emilio decide antes de meter verificaciones por código (punto 2, en rama).
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
/** D1 · la hoja lo escribe SOLO si `ofertaCerradaOInexistenteEn(ficha, fecha_de_la_fila)` (cadena · CC3 #1145) devuelve un dato: «<valor> (fuente: …)». Sin el campo, D1 no dispara */
export const CAMPO_CIERRE_DE_LA_HOJA = 'OFERTA CERRADA EN SU FECHA'

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
  /** D1 · el dato del cerebro que cierra la oferta en la fecha de la fila (lo decidió el código de la cadena); también va como línea de la ficha para poder citarlo */
  cierre?: string
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
  let cierre: string | null = null
  for (const l of lineas) {
    const item = /^\s{2,}-\s+(.*\S)\s*$/.exec(l)
    if (enLaFicha && item) { items.push(limpio(item[1])); continue }
    enLaFicha = false
    const c = /^-\s+([^:]+):\s*(.*)$/.exec(l)
    if (c && limpio(c[1]) === CAMPO_OFERTA_DE_LA_HOJA) oferta = limpio(c[2]) || null
    if (c && limpio(c[1]) === CAMPO_CIERRE_DE_LA_HOJA) { cierre = limpio(c[2]) || null; continue }
    if (c && limpio(c[1]) === CAMPO_FICHA_DE_LA_HOJA) {
      vista = true
      if (limpio(c[2])) declarado = limpio(c[2])
      else enLaFicha = true
      continue
    }
    resto.push(l)
  }
  const ofertaReal = oferta && !/declarado\s*$/i.test(oferta) ? oferta : null
  // 18-nov · #1147 · el cierre viaja también SIN ficha: la hoja lo escribe con los hechos vivos del cerebro aunque no haya foto de la oferta
  const base = { oferta: ofertaReal, resto: resto.join('\n'), ...(cierre ? { cierre } : {}) }
  const lineaDelCierre = cierre ? [`${CAMPO_CIERRE_DE_LA_HOJA.toLowerCase()}: ${cierre}`] : []
  if (!vista) return { ...base, estado: 'sin_ficha', lineas: lineaDelCierre, motivo: 'la hoja no trae la ficha de la oferta' }
  if (!items.length) return { ...base, estado: 'sin_ficha', lineas: lineaDelCierre, motivo: declarado ?? 'la ficha llegó vacía' }
  return { ...base, estado: 'con_ficha', lineas: [...items, ...lineaDelCierre] }
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
  /** solo destino `hoja`: el rótulo de la hoja donde aparece el dato (el insumo al que vuelve · lo reparte el receptor de CC3) */
  campo_de_la_hoja?: string
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

// ───────────────────────── el regreso (firma de Emilio 17-nov 20:34 · automático, sin persona en el medio: el creador del paso responde)
/** regla dura = lo que verifica el código (D2 · D3 firmadas): el creador la toma SÍ O SÍ. Lo del jefe es criterio: el creador la toma, en parte o no, con motivo */
export const esDura = (h: Pick<Hallazgo, 'origen'>): boolean => h.origen === 'codigo'
export interface Devolucion { llave: string; fila_id: string; destino: Exclude<Destino, 'pieza'>; motivo: string; linea_de_la_ficha: string | null; encargo_id: string; origen: Hallazgo['origen']; dura: boolean; campo_de_la_hoja?: string }
/** UNA devolución por fila y destino (la llave); repetirla no duplica */
export const llaveDeDevolucion = (filaId: string, destino: Destino): string => `${filaId}:${destino}`
/** una corrección que vuelve a la mesa (al creador de la pieza), con su número para que la responda */
export interface Enviada { id: string; texto: string; dura: boolean }

export interface Regreso {
  /** líneas que vuelven a la mesa como corrección (destino pieza), cada una con su número [S1]… */
  a_la_mesa: string[]
  enviadas: Enviada[]
  /** devoluciones nuevas a la cadena (una por fila y destino) */
  devoluciones: Devolucion[]
  /** ese destino ya se devolvió y su creador ya respondió: la jefatura NO reabre lo de CRITERIO; queda registrado y sigue (firma de Emilio) */
  no_reabre: Hallazgo[]
  /** REGLA DURA cuyo destino ya se devolvió y sigue rota: no abre otra devolución pero SIGUE FRENANDO (se toma sí o sí · CC7 🟡 1) */
  duras_pendientes: Hallazgo[]
  /** los destinos de la cadena a los que vuelve ahora (para la marca informativa de la bandeja) */
  vuelve_a: Destino[]
  cita_no_verificada: boolean
}

/** reparte los hallazgos por destino. `yaDevueltas`: las llaves que ya existen (del encargo o de la cadena) */
export function repartir(hallazgos: Hallazgo[], filaId: string | null, encargoId: string, yaDevueltas: ReadonlySet<string>): Regreso {
  const r: Regreso = { a_la_mesa: [], enviadas: [], devoluciones: [], no_reabre: [], duras_pendientes: [], vuelve_a: [], cita_no_verificada: hallazgos.some((h) => h.cita_no_verificada) }
  const nuevas = new Set<string>()
  for (const h of hallazgos) {
    const dura = esDura(h)
    if (h.destino === 'pieza' || !filaId) {
      const id = `S${r.enviadas.length + 1}`
      const texto = `[${id}] ${ROTULO_DE_SENTIDO} · ${h.destino}: ${h.que}${h.linea_de_la_ficha ? ` — ficha: «${h.linea_de_la_ficha}»` : ''}${h.cita_no_verificada ? ' (cita no verificada)' : ''}${dura ? ' (regla dura: se toma sí o sí)' : ''}`
      r.enviadas.push({ id, texto, dura })
      r.a_la_mesa.push(texto)
      continue
    }
    const llave = llaveDeDevolucion(filaId, h.destino)
    if (yaDevueltas.has(llave)) { (dura ? r.duras_pendientes : r.no_reabre).push(h); continue }
    if (nuevas.has(llave)) continue
    nuevas.add(llave)
    r.devoluciones.push({ llave, fila_id: filaId, destino: h.destino, motivo: h.que, linea_de_la_ficha: h.linea_de_la_ficha, encargo_id: encargoId, origen: h.origen, dura, ...(h.campo_de_la_hoja ? { campo_de_la_hoja: h.campo_de_la_hoja } : {}) })
    if (!r.vuelve_a.includes(h.destino)) r.vuelve_a.push(h.destino)
  }
  return r
}

// ───────────────────────── la respuesta del creador (firma de Emilio: «tomada», «tomada en parte: …» o «no tomada: …», con motivo)
export const ROTULO_DE_RESPUESTA = 'RESPUESTA A LA JEFATURA'
export type QueHizo = 'tomada' | 'tomada_en_parte' | 'no_tomada'
export interface RespuestaDelCreador { id: string; respuesta: QueHizo | 'no_dicha'; motivo: string | null; dura: boolean; texto: string; declarado?: string }
const RE_RESPUESTA = /^[\s>*•\-–—]*\*{0,2}RESPUESTA A LA JEFATURA\s*\[?\s*(S\d{1,2})\s*\]?\s*\*{0,2}\s*[:·–—-]\s*(.*)$/iu
/** lo que el autor escribe para pedirle la respuesta (va al final del aviso de la vuelta; solo si hay correcciones de sentido) */
export function pedidoDeRespuesta(enviadas: Enviada[]): string[] {
  if (!enviadas.length) return []
  return [
    `Responde cada corrección marcada [S…] en una línea aparte, al final de tu integración: «${ROTULO_DE_RESPUESTA} S1: tomada», «${ROTULO_DE_RESPUESTA} S1: tomada en parte: <por qué>» o «${ROTULO_DE_RESPUESTA} S1: no tomada: <por qué>». Esas líneas no salen en la pieza.`,
    ...(enviadas.some((x) => x.dura) ? ['Las marcadas «regla dura» se toman sí o sí: corrígelas en la pieza.'] : []),
  ]
}
/** separa las líneas de respuesta del texto de la integración: la pieza queda SIN ellas (si no hay, el texto es el mismo) */
export function separarRespuestas(texto: string): { pieza: string; lineas: string[] } {
  const todas = String(texto ?? '').split(/\r?\n/)
  const lineas = todas.filter((l) => RE_RESPUESTA.test(l)).map((l) => l.trim())
  if (!lineas.length) return { pieza: String(texto ?? ''), lineas: [] }
  return { pieza: todas.filter((l) => !RE_RESPUESTA.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(), lineas }
}
/**
 * lee la respuesta del creador para cada corrección enviada. Falta, no se entiende o viene sin motivo (en parte / no tomada) ⇒ «no_dicha», declarada: NUNCA se da por tomada.
 * Una regla dura respondida «no tomada» o «en parte» se declara: la regla dura no se negocia (la revisión siguiente la vuelve a medir por código).
 */
export function leerRespuestas(enviadas: Enviada[], lineas: string[]): RespuestaDelCreador[] {
  const por = new Map<string, string>()
  for (const l of lineas) { const m = RE_RESPUESTA.exec(l); if (m && !por.has(m[1].toUpperCase())) por.set(m[1].toUpperCase(), m[2].trim()) }
  return enviadas.map((x) => {
    const base = { id: x.id, dura: x.dura, texto: x.texto }
    const dicho = por.get(x.id)
    if (dicho === undefined) return { ...base, respuesta: 'no_dicha', motivo: null, declarado: 'el creador no respondió esta corrección' }
    const n = normal(dicho)
    const conMotivo = (pref: string): string | null => { const r = dicho.replace(new RegExp(`^\\s*${pref}\\s*[:·–—-]?\\s*`, 'iu'), '').trim(); return r.length >= 3 ? r : null }
    let respuesta: QueHizo | null = null
    let motivo: string | null = null
    if (/^tomada en parte(?!\p{L})/u.test(n)) { respuesta = 'tomada_en_parte'; motivo = conMotivo('tomada en parte') }
    else if (/^no tomada(?!\p{L})/u.test(n)) { respuesta = 'no_tomada'; motivo = conMotivo('no tomada') }
    else if (/^tomada(?!\p{L})/u.test(n)) { respuesta = 'tomada'; motivo = conMotivo('tomada') }
    if (!respuesta) return { ...base, respuesta: 'no_dicha', motivo: null, declarado: `respuesta que no se entiende: «${dicho.slice(0, 120)}»` }
    if (respuesta !== 'tomada' && !motivo) return { ...base, respuesta: 'no_dicha', motivo: null, declarado: `«${respuesta === 'no_tomada' ? 'no tomada' : 'tomada en parte'}» sin motivo: no cuenta` }
    return { ...base, respuesta, motivo, ...(x.dura && respuesta !== 'tomada' ? { declarado: 'regla dura: no se puede dejar de tomar; la revisión la vuelve a medir' } : {}) }
  })
}

/** la marca de la bandeja: «⚠️ VUELVE A HOJA · CALENDARIO · » (vacía si no vuelve a la cadena) */
export const marcaDeVuelta = (vuelveA: Destino[]): string => (vuelveA.length ? `⚠️ VUELVE A ${vuelveA.map((d) => d.toUpperCase()).join(' Y ')} · ` : '')
