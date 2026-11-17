/**
 * CÓMO CIERRA UNA REVISIÓN (diseño v4 §2 y §3, reglas 2–5 y 10) · puro.
 *   resultado: 'limpia' | 'con_desacuerdo' | 'sin_segunda_mirada' | 'incompleta_por_tope' | 'fallida'; las marcas pueden venir las dos.
 *  · regla 2 (revisión 2 = A · RESPUESTA-LENOVO 17-nov, todos los tipos · LA MISMA regla que la oficina, en `duroYCriterio`): el «bloquea» de criterio
 *    (un jefe, la segunda mirada, cualquier agente) que el creador no toma es OBSERVACIÓN DECLARADA: sin `con_desacuerdo` y sin #alertas.
 *    `con_desacuerdo` queda para lo que sí es falla: una regla DURA (`dura: true`, solo la pone el código) que sigue rota, o una ficha SIN DUEÑO
 *    (nadie la puede corregir). Plan y manual muestran las observaciones en la tarjeta de aprobación, con la respuesta del creador.
 *  · regla 3: un hallazgo de GPT no tomado lleva una línea de razón y NUNCA es desacuerdo.
 *  · regla 4: GPT sin respuesta tras los reintentos ⇒ `sin_segunda_mirada` (más el aviso); no frena.
 *  · brief (solo marca): no tiene correccion ni decision ⇒ su ficha de criterio queda sin tomar ⇒ observación declarada (antes: `con_desacuerdo`).
 */
import { duroYCriterio, type Estado, type Ficha } from '../../revision-comun'
import type { Marcas, RespuestaDeFicha, Resultado } from './contrato'
import { atiende, type Dueno } from './politicas'

export interface Cierre {
  resultado: Resultado
  marcas: Marcas
  /** una línea por falla que sigue: regla dura rota o ficha sin dueño (rótulo para el aviso agregado y para la bandeja) */
  desacuerdos: string[]
  /** revisión 2 = A · una línea por ficha de criterio que no se tomó, con la respuesta del creador: se declara (plan y manual: en la tarjeta de aprobación) */
  observaciones: string[]
  respuestas: RespuestaDeFicha[]
}

const datos = (e: Estado, n: string): Record<string, unknown> | undefined => e.artefactos[n]?.datos

/** las fichas de FONDO (origen jefe, gravedad bloquea) que siguen abiertas o no tomadas · lo que la vuelta del creador tiene que atender */
export const desacuerdosDe = (fichas: Ficha[]): Ficha[] => fichas.filter((f) => f.origen === 'jefe' && f.gravedad === 'bloquea' && (f.estado === 'abierta' || f.estado === 'no_tomada'))

/** una ficha de FONDO que bloquea, sigue abierta y NINGÚN dueño atiende su `donde`: nadie puede corregirla (J6 cuarto: nunca en silencio) */
export const fichasSinDueno = (fichas: Ficha[], duenos: Dueno[]): Ficha[] =>
  desacuerdosDe(fichas).filter((f) => f.estado === 'abierta' && !duenos.some((d) => atiende(d, f.donde)))

const rotulo = (f: Ficha, sinDueno: Set<string>): string =>
  `${f.donde}: ${f.que ?? ''}${f.estado === 'no_tomada' && f.razon ? ` (no tomada: ${f.razon})` : f.estado === 'abierta' ? (sinDueno.has(f.id) ? ` (sin dueño: ningún empleado atiende «${f.donde}»)` : ' (sin respuesta del creador)') : ''}`.trim()

export function resolverCierre(e: Estado, o: { tope: boolean; fallida: boolean; duenos?: Dueno[] }): Cierre {
  const sinDueno = o.duenos ? new Set(fichasSinDueno(e.fichas, o.duenos).map((f) => f.id)) : new Set<string>()
  // A · la regla única: falla = regla dura rota o sin dueño; lo demás (criterio) se declara
  const { duras, observaciones: criterio } = duroYCriterio(e.fichas)
  const dd = [...duras, ...criterio.filter((f) => sinDueno.has(f.id))]
  const obs = criterio.filter((f) => !sinDueno.has(f.id))
  const sin_segunda_mirada = datos(e, 'fichas_externas')?.sin_revision === true
  const marcas: Marcas = { con_desacuerdo: dd.length > 0, sin_segunda_mirada, ...(sinDueno.size > 0 ? { ficha_sin_dueno: true } : {}) }
  const resultado: Resultado = o.fallida ? 'fallida' : o.tope ? 'incompleta_por_tope' : marcas.con_desacuerdo ? 'con_desacuerdo' : marcas.sin_segunda_mirada ? 'sin_segunda_mirada' : 'limpia'
  return {
    resultado, marcas,
    desacuerdos: dd.map((f) => rotulo(f, sinDueno)),
    observaciones: obs.map((f) => rotulo(f, sinDueno)),
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
    case 'con_desacuerdo': return `${cab}⚠️ Revisión con desacuerdo · ${quien}${c.marcas.sin_segunda_mirada ? ' · y sin segunda mirada' : ''}${c.marcas.ficha_sin_dueno ? ' · ficha sin dueño' : ''}: ${c.desacuerdos.slice(0, 3).join(' | ')}${c.desacuerdos.length > 3 ? ` (+${c.desacuerdos.length - 3} más)` : ''}`
    case 'sin_segunda_mirada': return `${cab}⚠️ Sin segunda mirada · ${quien}: el revisor externo no respondió tras los reintentos; sigue sin su opinión`
    default: return ''
  }
}
