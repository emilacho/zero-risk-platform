/**
 * LA APROBACIÓN DEL DUEÑO · 16-nov · Sprint 2 · S2-1 parte B (CC1) · decisión de Emilio 21:29 + adendas 21:35 y 21:42: UNA sola parada en todo el camino del video.
 * La mesa presentó N propuestas (`propuestas_video`, parte A); el paso `aprobar_propuestas` (función de código) deja el encargo ESPERANDO AL DUEÑO (turno `dueno`) y el tablero
 * contesta con una de dos decisiones:
 *  · `aprobar` una propuesta → la elegida pasa a ser el `guion` y el `copy_video` (igual que si la mesa hubiera escrito un solo guion) y todo lo que sigue corre solo, en final;
 *  · `cambios` con observaciones → la aprobación queda «observaciones» y el paso VUELVE A LA MESA (su `vuelve_a`, dato de la plantilla): la mesa recibe las observaciones,
 *    corrige y vuelve a presentar con la ronda siguiente. Agotadas las vueltas, solo queda aprobar (el tope existe para que no haya un ciclo sin fin; nunca decide un jefe).
 * Puro: sin base, sin red, sin modelo.
 */
import type { Estado, Paso, Plantilla } from '../tipos'
import type { ResultadoDePaso } from '../motor'
import type { AprobacionDePropuestas, PropuestaDeVideo, PropuestasDelVideo } from './propuestas'

/** la función de código del paso (registrada en `plantilla.ts`) */
export const FUNCION_APROBAR_PROPUESTAS = 'aprobar_propuestas'
/** el artefacto que deja el paso */
export const ARTEFACTO_APROBACION = 'aprobacion_propuestas'
/** el tipo de turno mientras el encargo espera al dueño (el vigía no lo da por muerto; el flujo termina sin error y despierta el tablero) */
export const TURNO_DEL_DUENO = 'dueno'
export const OBSERVACIONES_MAX = 2000

export type DecisionDelDueno =
  | { decision: 'aprobar'; ronda: number; propuesta_id: string }
  | { decision: 'cambios'; ronda: number; observaciones: string }

export type Rechazo = { ok: false; status: number; error: 'no_espera_al_dueno' | 'ronda_vieja' | 'propuesta_inexistente' | 'sin_vueltas' | 'entrada_invalida'; detalle: string }

type PropuestasGuardadas = PropuestasDelVideo & { texto?: string }
export const propuestasDe = (e: Pick<Estado, 'artefactos'>): PropuestasGuardadas | null => (e.artefactos?.propuestas_video?.datos as unknown as PropuestasGuardadas | undefined) ?? null

/** cuántas vueltas de cambios le quedan al dueño (el `vuelve_a.max` del paso menos las ya hechas; sin `vuelve_a`, ninguna) */
export function quedanVueltas(e: Pick<Estado, 'vueltas'>, paso: Pick<Paso, 'clave' | 'vuelve_a'> | undefined): number {
  const max = Number(paso?.vuelve_a?.max ?? 0)
  return Math.max(0, max - (e.vueltas?.[paso?.clave ?? ''] ?? 0))
}
export const pasoDeAprobacion = (pl: Pick<Plantilla, 'pasos'>): Paso | undefined => pl.pasos.find((p) => p.tipo === 'codigo' && p.funcion === FUNCION_APROBAR_PROPUESTAS)

/**
 * Al llegar al paso: sin propuestas (una plantilla que no las pide, o una mesa que escribió un solo guion) no hay nada que aprobar y el paso pasa de largo sin parar.
 * Con propuestas: se espera al dueño.
 */
export function alLlegarAlPaso(e: Pick<Estado, 'artefactos'>): { esperar: true; ronda: number } | { saltar: ResultadoDePaso } {
  const pv = propuestasDe(e)
  if (!pv || !pv.propuestas?.length) return { saltar: { costo_usd: 0, artefacto: { estado: 'sin_propuestas', ronda: 0, vuelve_a_la_mesa: false } } }
  return { esperar: true, ronda: pv.ronda }
}

/** lo que la mesa deja en el estado cuando escribe un solo guion (la elegida queda igual: los pasos que siguen no distinguen de dónde vino) */
function guionDeLaElegida(p: PropuestaDeVideo): Record<string, Record<string, unknown>> {
  return {
    guion: { ...p.guion, texto: p.texto } as unknown as Record<string, unknown>,
    copy_video: { pie_de_foto: p.guion.pie_de_foto, hashtags: p.guion.hashtags },
    visual_direction: { imagenes: [], refs_generadas: [], hay_generadas: false, requiere_mirar: false, reglas_de_imagen: { obligatorio: [], prohibido: [] }, reglas_rechazadas: [], origen: 'mesa' },
    prompts_validos: { por_ref: {}, ninguno: true },
  }
}

/** el aviso que vuelve a la dirección de la mesa con las observaciones del dueño */
export const avisoDeObservaciones = (ronda: number, n: number, obs: string): string =>
  `El dueño revisó las ${n} propuestas de la ronda ${ronda} y pidió cambios: «${obs}». Corrígelas según eso y vuelve a presentar ${n} propuestas completas (puedes conservar lo que no objetó).`

/** la decisión del dueño → el resultado del paso (o por qué no se puede) */
export function decidir(e: Pick<Estado, 'artefactos' | 'vueltas'>, paso: Pick<Paso, 'clave' | 'vuelve_a'>, d: DecisionDelDueno): { ok: true; res: ResultadoDePaso; aprobacion: AprobacionDePropuestas } | Rechazo {
  const pv = propuestasDe(e)
  if (!pv) return { ok: false, status: 409, error: 'no_espera_al_dueno', detalle: 'el encargo no tiene propuestas que decidir' }
  if (!Number.isInteger(d.ronda) || d.ronda !== pv.ronda) return { ok: false, status: 409, error: 'ronda_vieja', detalle: `la tarjeta muestra la ronda ${d.ronda} y la vigente es la ${pv.ronda}: recarga` }
  if (d.decision === 'aprobar') {
    const p = pv.propuestas.find((x) => x.id === d.propuesta_id)
    if (!p) return { ok: false, status: 409, error: 'propuesta_inexistente', detalle: `no hay una propuesta «${d.propuesta_id}» en la ronda ${pv.ronda}` }
    const aprobacion: AprobacionDePropuestas = { estado: 'aprobada', propuesta_id: p.id, ronda: pv.ronda }
    return { ok: true, aprobacion, res: { costo_usd: 0, artefacto: { ...aprobacion, vuelve_a_la_mesa: false }, otros_artefactos: guionDeLaElegida(p) } }
  }
  const obs = String(d.observaciones ?? '').trim()
  if (!obs || obs.length > OBSERVACIONES_MAX) return { ok: false, status: 400, error: 'entrada_invalida', detalle: `las observaciones deben tener de 1 a ${OBSERVACIONES_MAX} caracteres` }
  if (quedanVueltas(e, paso) <= 0) return { ok: false, status: 409, error: 'sin_vueltas', detalle: 'no quedan rondas de cambios: solo se puede aprobar una propuesta' }
  const aprobacion: AprobacionDePropuestas = { estado: 'observaciones', observaciones: obs, ronda: pv.ronda }
  return { ok: true, aprobacion, res: { costo_usd: 0, artefacto: { ...aprobacion, vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeObservaciones(pv.ronda, pv.propuestas.length, obs) } } }
}
