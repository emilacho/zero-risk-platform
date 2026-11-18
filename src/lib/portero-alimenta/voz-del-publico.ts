/**
 * LA VOZ DEL PÚBLICO por la consulta del cerebro (encargo 5 · parte B · 18-nov · firma de Emilio: «el portero junta y ordena; el especialista analiza»).
 * `GET /api/brain/consultar?client_id=&oficina=&agente=&publico=consumo|profesional` entrega, por cliente y por TIPO de público, lo que el portero YA juntó
 * (reseñas, comentarios en publicaciones propias y de la competencia, menciones, foros; los comentarios de TikTok vienen dentro de esas clases con su `red`),
 * cada pieza con su fuente, su fecha y su vigencia. Sin raspado nuevo, sin modelo: US$ 0.
 * Regla de personas privadas: nunca el nombre ni la cuenta de quien comenta. El texto pasa por `sinDatosPersonales` (correos, teléfonos, @usuarios)
 * y, en las menciones, se corta la cola «etiquetado …» (la lista de cuentas etiquetadas). Ningún dato de autor viaja en la procedencia.
 * Las clases de cada tipo las fija el cerebro (antes vivían en el perfil de CC3: `VOZ_POR_TIPO`); la que no tenga material se DECLARA, nunca se rellena.
 */
import { sinDatosPersonales } from './dueno'

type Fila = Record<string, unknown>
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const objeto = (v: unknown): Fila => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Fila) : {})

export type TipoDePublico = 'consumo' | 'profesional'
export const TIPOS_DE_PUBLICO: readonly TipoDePublico[] = ['consumo', 'profesional']
/** las clases del cerebro donde vive el habla de cada tipo de público (los foros no hablan como el público de consumo; los comentarios en la competencia no son del profesional) */
export const VOZ_POR_TIPO: Readonly<Record<TipoDePublico, readonly string[]>> = {
  consumo: ['resenas', 'comentarios', 'mencion', 'competidor_comentarios'],
  profesional: ['resenas', 'comentarios', 'mencion', 'foro'],
}
/** cómo se llama cada fuente para quien lee el informe */
export const FUENTE_DE_LA_CLASE: Readonly<Record<string, string>> = {
  resenas: 'reseña',
  comentarios: 'comentario en una publicación propia',
  mencion: 'mención en redes',
  competidor_comentarios: 'comentario en una publicación de la competencia',
  foro: 'foro',
}
/** lo que el cerebro todavía no junta como clase y este público necesitaría: se declara siempre */
export const FUENTES_SIN_CLASE: Readonly<Record<TipoDePublico, readonly string[]>> = { consumo: [], profesional: ['linkedin'] }
export const REGLA_DE_PRIVACIDAD = 'personas privadas: sin nombre ni cuenta de quien comenta (correos, teléfonos, @usuarios y cuentas etiquetadas se omiten)'

export const tipoDePublico = (x: unknown): TipoDePublico | null => (TIPOS_DE_PUBLICO as readonly string[]).includes(txt(x)) ? (txt(x) as TipoDePublico) : null

/** las clases que se leen para este público: las suyas; si además piden `clase`, solo las que estén en ambas */
export function clasesDelPublico(tipo: TipoDePublico, clasePedida: string): string[] {
  const pedidas = clasePedida.split(',').map((x) => x.trim()).filter(Boolean)
  return pedidas.length ? VOZ_POR_TIPO[tipo].filter((c) => pedidas.includes(c)) : [...VOZ_POR_TIPO[tipo]]
}

/** el texto de una voz sin datos de personas privadas. En las menciones, la cola «etiquetado …» es la lista de cuentas etiquetadas: se corta entera */
export function textoSinPersonas(clase: string, texto: string): { texto: string; omitido: boolean } {
  let t = texto
  let omitido = false
  if (clase === 'mencion') {
    const i = t.search(/(^|\s)etiquetad[oa]s?(\s|$)/i)
    if (i >= 0) { t = t.slice(0, i); omitido = true }
  }
  const s = sinDatosPersonales(t)
  return { texto: s.texto, omitido: omitido || s.redactado }
}

/** la red de donde viene la voz, si la ficha la trae (p. ej. los comentarios de TikTok en la competencia) */
export const redDeLaFicha = (provenance: unknown): string | null => txt(objeto(objeto(provenance).datos).red).toLowerCase() || null

/** lo que el cerebro declara para este público: qué clases leyó, cuáles no tienen material y qué fuentes no junta todavía */
export function declaracionDelPublico(tipo: TipoDePublico, clases: string[], resultados: ReadonlyArray<{ clase: string }>, cortada: boolean) {
  const hay = new Set(resultados.map((r) => r.clase))
  return {
    publico: tipo,
    clases_del_publico: clases,
    // con la lectura cortada, una clase que no salió en esta página puede estar en la siguiente: no se declara faltante
    clases_sin_material: cortada ? [] : clases.filter((c) => !hay.has(c)),
    fuentes_que_el_cerebro_no_junta: [...FUENTES_SIN_CLASE[tipo]],
    privacidad: REGLA_DE_PRIVACIDAD,
  }
}
