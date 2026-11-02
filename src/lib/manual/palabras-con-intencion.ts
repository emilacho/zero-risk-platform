/**
 * PALABRAS DEL MANUAL CON INTENCIÓN Y FUENTE (01-nov · firma de Emilio). Agnóstico. Puro.
 * `forbidden_words` sigue siendo la lista completa de textos, como siempre: nada se borra y quien la lee no cambia.
 * `palabras_con_intencion` va al lado y solo dice lo que NO es la omisión:
 *   · `legal`: la prohíbe una norma; exige la cita de la norma. Bloquea.
 *   · `del_dueno`: la prohibió el dueño; exige su cita y su fecha. Bloquea.
 *   · `estilo`: contexto de marca, con su porqué si lo hay. Nunca bloquea. Es lo que es toda palabra que no diga otra cosa.
 * Una palabra dura sin su cita se lee como `estilo`. Y `del_dueno` solo entra por la decisión del dueño: lo que llega de una corrida baja a `estilo` (`deUnaCorrida`), aunque traiga cita y fecha, porque un modelo puede inventarlas.
 */
export type Intencion = 'legal' | 'del_dueno' | 'estilo'
export interface FuenteDeLaPalabra { cita: string; origen?: string; fecha?: string; por?: string }
export interface PalabraConIntencion { texto: string; intencion: Intencion; porque?: string; fuente?: FuenteDeLaPalabra }

type Fila = Record<string, unknown>
const clave = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const texto = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** ¿esta entrada trae lo que su intención exige? */
function fuenteValida(intencion: unknown, f: unknown): FuenteDeLaPalabra | null {
  if (typeof f !== 'object' || f === null) return null
  const o = f as Fila
  const cita = texto(o.cita)
  if (!cita) return null
  const fecha = texto(o.fecha)
  if (intencion === 'del_dueno' && (!fecha || Number.isNaN(Date.parse(fecha)))) return null
  return { cita, ...(texto(o.origen) ? { origen: texto(o.origen) } : {}), ...(fecha ? { fecha } : {}), ...(texto(o.por) ? { por: texto(o.por) } : {}) }
}

/** una entrada de la columna, ya comprobada; lo que no se entiende se descarta */
function leerEntrada(x: unknown): PalabraConIntencion | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Fila
  const t = texto(o.texto)
  if (!t) return null
  const porque = texto(o.porque)
  const base = { texto: t, ...(porque ? { porque } : {}) }
  if (o.intencion === 'legal' || o.intencion === 'del_dueno') {
    const fuente = fuenteValida(o.intencion, o.fuente)
    if (fuente) return { ...base, intencion: o.intencion, fuente }
  }
  return { ...base, intencion: 'estilo' }
}

/** todas las palabras con su intención: la unión de las dos columnas, sin repetir. Una palabra de la lista sin más datos es `estilo` */
export function leerPalabras(manual: { forbidden_words?: unknown; palabras_con_intencion?: unknown } | null | undefined): PalabraConIntencion[] {
  const salida = new Map<string, PalabraConIntencion>()
  for (const x of Array.isArray(manual?.palabras_con_intencion) ? manual!.palabras_con_intencion as unknown[] : []) {
    const e = leerEntrada(x)
    if (!e) continue
    const previa = salida.get(clave(e.texto))
    if (!previa || (previa.intencion === 'estilo' && e.intencion !== 'estilo')) salida.set(clave(e.texto), e)
  }
  for (const x of Array.isArray(manual?.forbidden_words) ? manual!.forbidden_words as unknown[] : []) {
    const t = texto(x)
    if (t && !salida.has(clave(t))) salida.set(clave(t), { texto: t, intencion: 'estilo' })
  }
  return [...salida.values()]
}

/** las únicas palabras que bloquean por coincidencia */
export function palabrasDuras(manual: Parameters<typeof leerPalabras>[0]): string[] {
  return leerPalabras(manual).filter((p) => p.intencion !== 'estilo').map((p) => p.texto)
}

/** las que viajan como contexto de marca */
export function palabrasDeEstilo(manual: Parameters<typeof leerPalabras>[0]): string[] {
  return leerPalabras(manual).filter((p) => p.intencion === 'estilo').map((p) => p.texto)
}

/** 02-nov · el dueño reescribió la lista entera: lo declarado sigue si la palabra sigue; la que quitó deja de contar; la nueva es contexto, como toda palabra sin intención */
export function declaradasQueSiguen(manual: Parameters<typeof leerPalabras>[0], listaNueva: string[]): PalabraConIntencion[] {
  const siguen = new Set(listaNueva.map(clave))
  return leerPalabras(manual).filter((p) => (p.intencion !== 'estilo' || p.porque) && siguen.has(clave(p.texto)))
}

/** lo que manda una corrida de agentes: nunca puede declarar por el dueño */
export function deUnaCorrida(x: unknown): PalabraConIntencion[] {
  return (Array.isArray(x) ? x : []).map(leerEntrada).filter((p): p is PalabraConIntencion => !!p).map((p) => {
    if (p.intencion !== 'del_dueno') return p
    return { texto: p.texto, intencion: 'estilo' as const, ...(p.porque ? { porque: p.porque } : {}) }
  })
}

/** lo que una corrida nueva no puede perder: las palabras duras de la versión anterior siguen, aunque el borrador nuevo no las traiga */
export function conservarPalabrasDuras(previa: Parameters<typeof leerPalabras>[0], nueva: { forbidden_words?: unknown; palabras_con_intencion?: unknown }): { forbidden_words: string[]; palabras_con_intencion: PalabraConIntencion[] } {
  const duras = leerPalabras(previa).filter((p) => p.intencion !== 'estilo')
  const propias = deUnaCorrida(nueva.palabras_con_intencion)
  const anotadas = new Map<string, PalabraConIntencion>()
  for (const p of propias) anotadas.set(clave(p.texto), p)
  for (const p of duras) anotadas.set(clave(p.texto), p) // manda lo declarado antes
  const lista = (Array.isArray(nueva.forbidden_words) ? nueva.forbidden_words as unknown[] : []).map(texto).filter(Boolean)
  const vistas = new Set(lista.map(clave))
  for (const p of duras) if (!vistas.has(clave(p.texto))) { lista.push(p.texto); vistas.add(clave(p.texto)) }
  return { forbidden_words: lista, palabras_con_intencion: [...anotadas.values()] }
}

export type DecisionDelDueno = 'prohibir' | 'contexto' | 'quitar'
/** lo que decide el dueño en su tablero: subirla a dura (con su cita y su fecha), dejarla como contexto, o quitarla de la lista */
export function aplicarDecisionDelDueno(manual: Parameters<typeof leerPalabras>[0], d: { texto: string; decision: DecisionDelDueno; por: string; en: string; cita?: string | null }): { forbidden_words: string[]; palabras_con_intencion: PalabraConIntencion[] } {
  const t = d.texto.trim()
  const sinElla = leerPalabras(manual).filter((p) => clave(p.texto) !== clave(t))
  const nueva: PalabraConIntencion[] = d.decision === 'quitar' ? [] : d.decision === 'prohibir'
    ? [{ texto: t, intencion: 'del_dueno', fuente: { cita: d.cita?.trim() || `El dueño la prohibió desde su tablero: «${t}»`, origen: 'tablero', fecha: d.en, por: d.por } }]
    : [{ texto: t, intencion: 'estilo' }]
  const todas = [...sinElla, ...nueva]
  // la columna guarda solo lo que no es la omisión; `forbidden_words` sigue siendo la lista completa
  return { forbidden_words: todas.map((p) => p.texto), palabras_con_intencion: todas.filter((p) => p.intencion !== 'estilo' || p.porque) }
}
