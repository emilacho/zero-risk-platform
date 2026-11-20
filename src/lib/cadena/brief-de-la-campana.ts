/**
 * EL BRIEF DE LA CAMPAÑA (20-nov · «Crear Campaña» · GO Lenovo, entrega 3 · respuestas de Emilio 20:04 Zúrich).
 * La campaña que nace del botón «Crear Campaña» trae lo que se contestó al pedirla (CC1 · `cadena_pedidos_de_campana`, una fila por `campana_id`):
 * nombre · cambio · fechas · tope · su brief libre (con la oferta). Aquí se arma UN documento, `# BRIEF DE LA CAMPAÑA`, ENTERO (nada se recorta), que reciben:
 *   · la estrategia, el brief creativo y la gran idea (que sigue SIN el plan: `LA_GRAN_IDEA_SIN_PLAN` no cambia);
 *   · la jefatura de las piezas, para no marcar como inventado lo que se pidió;
 *   · el validador del brief, como TERCERA fuente citable (`brief-creativo.ts`).
 * Si choca con el plan, MANDA el brief de la campaña (solo en esa campaña) y el choque se dice en «Faltantes».
 * Una campaña sin pedido (las que nacen del plan, o una con llave antes de esta entrega) no recibe nada: su pedido queda idéntico al de hoy.
 * El tope del pedido NO entra al documento: es dinero, no indicación creativa (lo usa la apertura · entrega 2 de CC1).
 * Nada aquí habla con un modelo ni con la base, ni sabe de un cliente.
 */
import { documentoDeLaCadena } from './indicaciones'
import type { Almacen } from './almacen'

/** lo que se lee de la fila del pedido (los nombres de CC1, confirmados 19:06Z) */
export interface PedidoDeLaCampana {
  nombre: string | null
  cambio: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  fechas_clave: unknown
  brief_libre: string | null
}

export const TITULO_DEL_BRIEF_DE_LA_CAMPANA = '# BRIEF DE LA CAMPAÑA'
/** la fuente con que se nombra el documento (la misma en todos los pedidos: así el validador y la jefatura hablan del mismo texto) */
export const FUENTE_DEL_BRIEF_DE_LA_CAMPANA = 'el brief de la campaña'
/** qué manda y qué se hace con un choque (respuesta 2 de Emilio) */
export const REGLA_DEL_BRIEF_DE_LA_CAMPANA =
  'Esta campaña se pidió con este brief. Para ESTA campaña, lo que dice el brief de la campaña MANDA sobre el plan. Si choca con el plan, sigue al brief de la campaña y escribe el choque en «Faltantes» (qué dice el plan, qué dice el brief de la campaña y qué se hizo). Si lo citas, cópialo literal: `> «…»` o «el brief de la campaña dice: «…»».'

const linea = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** las fechas clave como líneas «- fecha · qué» (lo que no tiene forma de fecha clave se descarta, sin inventar) */
function fechasClave(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const f = linea((x as Record<string, unknown>).fecha)
    const q = linea((x as Record<string, unknown>).que)
    if (f && q) out.push(`- ${f} · ${q}`)
    else if (f) out.push(`- ${f}`)
  }
  return out
}

/**
 * El documento de la campaña, con las respuestas TAL CUAL (el brief libre entero). null si no dijo nada que sirva (ni cambio ni brief).
 * El nombre y las fechas van como datos; el cambio y el brief, como los escribió.
 */
export function briefDeLaCampanaEnTexto(p: PedidoDeLaCampana | null | undefined): string | null {
  if (!p) return null
  const cambio = linea(p.cambio)
  const brief = typeof p.brief_libre === 'string' && p.brief_libre.trim() ? p.brief_libre : null
  if (!cambio && !brief) return null
  const desde = linea(p.fecha_inicio), hasta = linea(p.fecha_fin)
  const claves = fechasClave(p.fechas_clave)
  return [
    ...(linea(p.nombre) ? [`## Nombre de la campaña\n${linea(p.nombre)}`, ''] : []),
    ...(cambio ? ['## El cambio que busca (qué tiene que hacer o pensar distinto la gente después de la campaña)', cambio, ''] : []),
    ...(desde || hasta || claves.length ? ['## Fechas', ...(desde || hasta ? [`- de ${desde ?? '(sin inicio)'} a ${hasta ?? '(sin fin)'}`] : []), ...(claves.length ? ['- fechas clave:', ...claves.map((c) => `  ${c}`)] : []), ''] : []),
    ...(brief ? ['## Su brief (entero, con la oferta)', brief] : []),
  ].join('\n').trim()
}

/** el brief de la campaña de ESA campaña, en texto · null sin pedido (o con un almacén que no sabe leerlo). Un error de la base NO se traga: la cadena no sigue sin el brief de la campaña en silencio */
export async function briefPedidoDeLaCampana(al: Pick<Almacen, 'pedidoDeLaCampana'>, campanaId: string): Promise<string | null> {
  if (!al.pedidoDeLaCampana) return null
  return briefDeLaCampanaEnTexto(await al.pedidoDeLaCampana(campanaId))
}

/** el bloque que se agrega a un pedido: nada sin brief de la campaña (el pedido queda idéntico al de hoy) */
export function bloqueDelBriefDeLaCampana(texto: string | null | undefined): string[] {
  if (!texto || !texto.trim()) return []
  return ['', TITULO_DEL_BRIEF_DE_LA_CAMPANA, REGLA_DEL_BRIEF_DE_LA_CAMPANA, documentoDeLaCadena(FUENTE_DEL_BRIEF_DE_LA_CAMPANA, texto)]
}
