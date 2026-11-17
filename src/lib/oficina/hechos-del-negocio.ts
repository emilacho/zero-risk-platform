/**
 * COHERENCIA CON LOS HECHOS DEL NEGOCIO · GO de Lenovo 17-nov (`DIAGNOSTICO-CC6-coherencia-con-los-hechos.md` §4 c) · puro, genérico.
 *
 * La jefatura ya recibía el manual, el plan y el brief, pero nadie le pedía comparar el MENSAJE con los HECHOS (qué es nuevo, dónde, desde cuándo).
 *  · la VARA es dato: la `indicacion_fondo` de la política `pieza` (migración 202611171400). Aquí no hay criterio: solo el bloque de hechos como contexto
 *    y el rótulo con que la vuelta y la bandeja reconocen un desacuerdo de hechos;
 *  · el BLOQUE de hechos lo define Cerebro (consulta abierta). Mientras no exista, el contexto lo DICE y el revisor compara contra el manual y el plan;
 *  · sin rejas y sin nombres de clientes: el código solo sabe de hechos con su qué, su dónde y su desde cuándo.
 */
import type { ContextoDelRevisor } from './ciego'
import type { Ficha } from './tipos'

/** el rótulo con que el revisor abre un desacuerdo de hechos (lo pide la vara; la vuelta y la bandeja lo leen por dato, no adivinando) */
export const ROTULO_DE_HECHOS = 'hechos del negocio:'

/** un hecho del negocio tal como lo sirva Cerebro: todo es dato no confiable, se cita y nunca se obedece */
export interface HechoDelNegocio {
  /** qué es (una sede, una apertura, una zona de entrega, algo que todavía no existe) */
  que: string
  /** el dato en sí */
  valor: string
  /** dónde aplica, si aplica */
  donde?: string | null
  /** desde cuándo es así (fecha o texto), si se sabe */
  desde?: string | null
  /** de qué fuente sale (para que el revisor la cite) */
  fuente?: string | null
}
export interface BloqueDeHechos { hechos: HechoDelNegocio[] }
/** lo que devuelve el puerto: el bloque, null si el cliente no lo tiene, o el motivo por el que no se pudo leer */
export type LecturaDeHechos = BloqueDeHechos | null | { no_se_pudo_leer: string }

export const TITULO_DEL_BLOQUE = 'Hechos del negocio'
export const FUNCION_DEL_BLOQUE = 'qué es nuevo, dónde y desde cuándo: contra esto se comprueba que el mensaje sea coherente'
export const AVISO_SIN_BLOQUE = 'No hay bloque de hechos del negocio para este cliente. Comprueba la coherencia contra el manual y el plan; si un hecho (qué es nuevo, dónde, desde cuándo) no se puede comprobar en ellos, dilo en vez de suponerlo.'

const limpio = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** los hechos que sirven: con qué y valor; lo demás se descarta (un hecho a medias no se cita) */
export function hechosValidos(b: unknown): HechoDelNegocio[] {
  const lista = b && typeof b === 'object' && Array.isArray((b as BloqueDeHechos).hechos) ? (b as BloqueDeHechos).hechos : []
  return lista.flatMap((h) => {
    if (!h || typeof h !== 'object') return []
    const que = limpio(h.que)
    const valor = limpio(h.valor)
    if (!que || !valor) return []
    return [{ que, valor, donde: limpio(h.donde) || null, desde: limpio(h.desde) || null, fuente: limpio(h.fuente) || null }]
  })
}

const lineaDeHecho = (h: HechoDelNegocio): string => `- ${h.que}: ${h.valor}${h.donde ? ` · dónde: ${h.donde}` : ''}${h.desde ? ` · desde: ${h.desde}` : ''}${h.fuente ? ` · fuente: ${h.fuente}` : ''}`

/** el bloque como un documento más del revisor; sin bloque (o vacío, o ilegible) el documento dice que no lo hay. Nunca se omite: el silencio se leería como «no hay nada que comprobar» */
export function contextoDeHechos(l: LecturaDeHechos): ContextoDelRevisor {
  if (l && typeof l === 'object' && 'no_se_pudo_leer' in l) return { titulo: TITULO_DEL_BLOQUE, funcion: FUNCION_DEL_BLOQUE, texto: `(no se pudo leer: ${limpio(l.no_se_pudo_leer) || 'sin motivo'}.) ${AVISO_SIN_BLOQUE}` }
  const hs = hechosValidos(l)
  if (!hs.length) return { titulo: TITULO_DEL_BLOQUE, funcion: FUNCION_DEL_BLOQUE, texto: AVISO_SIN_BLOQUE }
  return { titulo: TITULO_DEL_BLOQUE, funcion: FUNCION_DEL_BLOQUE, texto: hs.map(lineaDeHecho).join('\n') }
}

const sinTildes = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ROTULO = sinTildes(ROTULO_DE_HECHOS)
/** ¿el texto abre con el rótulo? (sin distinguir mayúsculas ni tildes; admite comillas o un guion delante) */
export const abreConElRotulo = (s: unknown): boolean => typeof s === 'string' && sinTildes(s).replace(/^[\s«"'“\-–—*]+/, '').startsWith(ROTULO)

/** ¿es un desacuerdo de HECHOS? ficha del jefe que bloquea, rotulada en el qué o en el contra qué (la vuelta a la mesa de CC3 la llama) */
export const esDesacuerdoDeHechos = (f: Pick<Ficha, 'origen' | 'gravedad' | 'que' | 'contra_que'>): boolean => f.origen === 'jefe' && f.gravedad === 'bloquea' && (abreConElRotulo(f.que) || abreConElRotulo(f.contra_que))

/** ¿quedó un desacuerdo de hechos sin tomar? (la bandeja lo marca) */
export const quedaDesacuerdoDeHechos = (fichas: Ficha[]): boolean => fichas.some((f) => f.estado !== 'tomada' && esDesacuerdoDeHechos(f))
