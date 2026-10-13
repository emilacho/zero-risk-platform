/**
 * CÓMO CIERRA UNA REVISIÓN (diseño v4 §2 y §3, reglas 2–5 y 10) · puro.
 *   resultado: 'limpia' | 'con_desacuerdo' | 'sin_segunda_mirada' | 'incompleta_por_tope' | 'fallida'; las marcas pueden venir las dos.
 *  · regla 2: una corrección de FONDO (ficha de `jefe-marketing` que bloquea) no tomada o sin dueño ⇒ `con_desacuerdo`; sin otra vuelta.
 *  · regla 3: un hallazgo de GPT no tomado lleva una línea de razón y NUNCA es desacuerdo.
 *  · regla 4: GPT sin respuesta tras los reintentos ⇒ `sin_segunda_mirada` (más el aviso); no frena.
 *  · brief (solo marca): no tiene correccion ni decision ⇒ su ficha que bloquea queda sin tomar ⇒ `con_desacuerdo` por falta de camino.
 */
import type { Estado, Ficha } from '../../revision-comun'
import type { Marcas, RespuestaDeFicha, Resultado } from './contrato'

export interface Cierre {
  resultado: Resultado
  marcas: Marcas
  /** una línea por ficha de fondo que sigue sin tomarse (rótulo para el aviso agregado y para la bandeja) */
  desacuerdos: string[]
  respuestas: RespuestaDeFicha[]
}

const datos = (e: Estado, n: string): Record<string, unknown> | undefined => e.artefactos[n]?.datos

/** las fichas de FONDO (origen jefe, gravedad bloquea) que siguen abiertas o no tomadas */
export const desacuerdosDe = (fichas: Ficha[]): Ficha[] => fichas.filter((f) => f.origen === 'jefe' && f.gravedad === 'bloquea' && (f.estado === 'abierta' || f.estado === 'no_tomada'))

export function resolverCierre(e: Estado, o: { tope: boolean; fallida: boolean }): Cierre {
  const dd = desacuerdosDe(e.fichas)
  const sin_segunda_mirada = datos(e, 'fichas_externas')?.sin_revision === true
  const marcas: Marcas = { con_desacuerdo: dd.length > 0, sin_segunda_mirada }
  const resultado: Resultado = o.fallida ? 'fallida' : o.tope ? 'incompleta_por_tope' : marcas.con_desacuerdo ? 'con_desacuerdo' : marcas.sin_segunda_mirada ? 'sin_segunda_mirada' : 'limpia'
  return {
    resultado, marcas,
    desacuerdos: dd.map((f) => `${f.donde}: ${f.que ?? ''}${f.estado === 'no_tomada' && f.razon ? ` (no tomada: ${f.razon})` : f.estado === 'abierta' ? ' (sin dueño o sin camino de corrección)' : ''}`.trim()),
    respuestas: e.fichas.map((f) => ({ ficha_id: f.id, origen: f.origen, donde: f.donde, estado: f.estado, razon: f.razon ?? null })),
  }
}

/** ¿hace falta avisar a #alertas? UN solo aviso agregado por revisión (no uno por ficha), para cualquier marca o cierre que no sea limpio */
export const hayQueAvisar = (c: Cierre): boolean => c.resultado !== 'limpia'

export function textoDelAviso(c: Cierre, o: { tipo: string; artifact_id: string; gasto_usd: number; simulado: boolean }): string {
  const cab = o.simulado ? '🧪 (seco) ' : ''
  const quien = `${o.tipo} ${o.artifact_id}`
  switch (c.resultado) {
    case 'fallida': return `${cab}🛑 Revisión fallida · ${quien}: no se pudo completar; el artefacto sigue con la marca «sin revisar»`
    case 'incompleta_por_tope': return `${cab}🛑 Revisión incompleta por tope · ${quien} · gastó US$ ${o.gasto_usd.toFixed(3)}: sigue con la marca «revisión incompleta»`
    case 'con_desacuerdo': return `${cab}⚠️ Revisión con desacuerdo · ${quien}${c.marcas.sin_segunda_mirada ? ' · y sin segunda mirada' : ''}: ${c.desacuerdos.slice(0, 3).join(' | ')}${c.desacuerdos.length > 3 ? ` (+${c.desacuerdos.length - 3} más)` : ''}`
    case 'sin_segunda_mirada': return `${cab}⚠️ Sin segunda mirada · ${quien}: el revisor externo no respondió tras los reintentos; sigue sin su opinión`
    default: return ''
  }
}
