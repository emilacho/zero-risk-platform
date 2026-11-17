/**
 * REVISIÓN 2 · DECISION-EMILIO reglas duras de la jefatura (17-nov 20:37 · puntos 8 y 9) + RESPUESTA-LENOVO (preguntas 1 a 5) · puro.
 * EL ÚNICO LUGAR donde el cierre decide qué hace cada ficha que quedó abierta:
 *  · FRENA (ni salida ni bandeja, UNA alarma): una regla dura de la lista (`dura: true`, solo la pone el código de la regla) que sigue rota
 *    después de la vuelta del creador. Las reglas duras se toman sí o sí.
 *  · EN LA CADENA («con desacuerdo», marca «VUELVE A …»): una regla dura devuelta a un paso de la cadena (hoja o calendario). Su freno es del receptor.
 *  · OBSERVACIÓN DECLARADA (la pieza sigue, con su marca; sin «con desacuerdo» y sin alarma): todo lo demás. Lo de criterio
 *    (el jefe, la segunda mirada, cualquier agente) y lo que antes decía «una persona decide» ya volvió a su creador: nada fuera de la lista bloquea.
 */
import type { Estado, Ficha } from './tipos'

/** las fichas del sentido que vuelven a un paso de la cadena (#1148): las devoluciones nuevas y las ya devueltas que siguen rotas */
export const esDeLaCadena = (f: Pick<Ficha, 'id'>): boolean => /^sentido-(dura-)?\d+-\d+$/.test(f.id)

export interface CierreDeFichas {
  /** reglas duras rotas que se quedaron en la pieza: la pieza NO se publica */
  frenan: Ficha[]
  /** reglas duras devueltas a la cadena: la pieza va marcada «con desacuerdo» y la frena el receptor */
  en_la_cadena: Ficha[]
  /** lo demás que quedó abierto: se declara en la bandeja; la pieza sigue */
  observaciones: Ficha[]
}

const abierta = (f: Ficha): boolean => f.estado === 'abierta' || f.estado === 'no_tomada'

export function fichasAlCierre(e: Pick<Estado, 'fichas'>): CierreDeFichas {
  const quedan = (e.fichas ?? []).filter((f) => f.gravedad === 'bloquea' && abierta(f))
  return {
    frenan: quedan.filter((f) => f.dura === true && !esDeLaCadena(f)),
    en_la_cadena: quedan.filter((f) => f.dura === true && esDeLaCadena(f)),
    observaciones: quedan.filter((f) => f.dura !== true),
  }
}

/** la marca de la bandeja para las observaciones declaradas (vacía si no hay) */
export const marcaDeObservaciones = (obs: ReadonlyArray<Ficha>): string => (obs.length ? `📝 CON ${obs.length} OBSERVACI${obs.length === 1 ? 'ÓN' : 'ONES'} · ` : '')
