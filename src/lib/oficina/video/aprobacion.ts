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
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestaDeImagen, type PropuestasDeImagen } from '../mesa/propuestas-imagen'

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

export type Rechazo = { ok: false; status: number; error: 'no_espera_al_dueno' | 'ronda_vieja' | 'propuesta_inexistente' | 'propuesta_incompleta' | 'sin_vueltas' | 'entrada_invalida'; detalle: string }

type PropuestasGuardadas = PropuestasDelVideo & { texto?: string }
export const propuestasDe = (e: Pick<Estado, 'artefactos'>): PropuestasGuardadas | null => (e.artefactos?.propuestas_video?.datos as unknown as PropuestasGuardadas | undefined) ?? null
/** 17-nov · propuestas también en IMAGEN (contrato CC5 v1): las de kit, carrusel o foto que dejó la mesa */
export const propuestasDeImagenDe = (e: Pick<Estado, 'artefactos'>): (PropuestasDeImagen & { texto?: string }) | null =>
  (e.artefactos?.[ARTEFACTO_PROPUESTAS_IMAGEN]?.datos as unknown as (PropuestasDeImagen & { texto?: string }) | undefined) ?? null

/**
 * lo que el dueño decide, de video o de imagen: la ronda y, por propuesta, lo que pasa a la cola si se aprueba (video: su guion y su copy, como hasta hoy; imagen: SUS
 * artefactos, los mismos de una pieza sola). Si hay propuestas de video, mandan ellas: el video no cambia en nada.
 */
interface Elegibles { ronda: number; propuestas: Array<{ id: string; otros: () => Record<string, Record<string, unknown>> | null }> }
function elegiblesDe(e: Pick<Estado, 'artefactos'>): Elegibles | null {
  const pv = propuestasDe(e)
  if (pv) return { ronda: pv.ronda, propuestas: (pv.propuestas ?? []).map((p) => ({ id: p.id, otros: () => guionDeLaElegida(p) })) }
  const pi = propuestasDeImagenDe(e)
  if (pi) return { ronda: pi.ronda, propuestas: (pi.propuestas ?? []).map((p) => ({ id: p.id, otros: () => (p.artefactos && Object.keys(p.artefactos).length ? p.artefactos : null) })) }
  return null
}

/** cuántas vueltas de cambios le quedan al dueño (el `vuelve_a.max` del paso menos las ya hechas; sin `vuelve_a`, ninguna) */
export function quedanVueltas(e: Pick<Estado, 'vueltas'>, paso: Pick<Paso, 'clave' | 'vuelve_a'> | undefined): number {
  const max = Number(paso?.vuelve_a?.max ?? 0)
  return Math.max(0, max - (e.vueltas?.[paso?.clave ?? ''] ?? 0))
}
export const pasoDeAprobacion = (pl: Pick<Plantilla, 'pasos'>): Paso | undefined => pl.pasos.find((p) => p.tipo === 'codigo' && p.funcion === FUNCION_APROBAR_PROPUESTAS)

/**
 * Al llegar al paso: sin propuestas (una plantilla que no las pide, o una mesa que escribió un solo guion) no hay nada que aprobar y el paso pasa de largo sin parar.
 * Con propuestas: se espera al dueño.
 * 17-nov · DECISIÓN Lenovo 00:51 · la parada es ÚNICA: si el dueño YA aprobó (la revisión o la jefatura devolvieron el trabajo a la mesa y la mesa corrigió la elegida),
 * el paso pasa de largo y deja la aprobación tal cual (la fase sigue «final»; el guion corregido de la mesa NO se pisa con la propuesta vieja).
 */
export function alLlegarAlPaso(e: Pick<Estado, 'artefactos'>): { esperar: true; ronda: number } | { saltar: ResultadoDePaso } {
  const pv = elegiblesDe(e)
  if (!pv || !pv.propuestas.length) return { saltar: { costo_usd: 0, artefacto: { estado: 'sin_propuestas', ronda: 0, vuelve_a_la_mesa: false } } }
  const ya = aprobacionDe(e)
  if (ya?.estado === 'aprobada' && pv.propuestas.some((p) => p.id === ya.propuesta_id)) return { saltar: { costo_usd: 0, artefacto: { ...ya, vuelve_a_la_mesa: false, ya_aprobada: true } } }
  return { esperar: true, ronda: pv.ronda }
}

/** la aprobación guardada por el paso (o null) */
export const aprobacionDe = (e: Pick<Estado, 'artefactos'>): AprobacionDePropuestas | null => (e.artefactos?.[ARTEFACTO_APROBACION]?.datos as unknown as AprobacionDePropuestas | undefined) ?? null

/** la propuesta que el dueño aprobó (null si no hay propuestas o todavía no aprobó ninguna) */
export function propuestaAprobada(e: Pick<Estado, 'artefactos'>): PropuestaDeVideo | null {
  const a = aprobacionDe(e)
  if (a?.estado !== 'aprobada') return null
  return propuestasDe(e)?.propuestas?.find((p) => p.id === a.propuesta_id) ?? null
}
/** 17-nov · la propuesta de IMAGEN que el dueño aprobó (null si no hay propuestas de imagen o todavía no aprobó ninguna) */
export function propuestaDeImagenAprobada(e: Pick<Estado, 'artefactos'>): PropuestaDeImagen | null {
  const a = aprobacionDe(e)
  if (a?.estado !== 'aprobada') return null
  return propuestasDeImagenDe(e)?.propuestas?.find((p) => p.id === a.propuesta_id) ?? null
}

/** la línea con la que la dirección declara que la corrección pedía cambiar el concepto aprobado (excepción de la decisión de Lenovo 17-nov 00:51) */
export const ROTULO_AVISO_DE_CONCEPTO = 'Aviso de concepto:'

/**
 * 17-nov · la mesa vuelve DESPUÉS de la aprobación: corrige SOLO la elegida (un guion; no vuelve a presentar propuestas ni a parar). Lo que la dirección recibe al reabrir.
 * Si corregir obligaría a cambiar el concepto aprobado (no solo la ejecución), no lo cambia: escribe la mejor versión fiel al concepto y lo dice en una línea (va a la ficha).
 */
export function avisoDeLaParadaUnica(p: PropuestaDeVideo): string {
  return [
    `El dueño YA APROBÓ la propuesta ${p.id} · «${p.nombre}» (concepto: ${p.concepto || 'el de la propuesta'}). Ya no se presentan propuestas ni se vuelve a pedir aprobación.`,
    'Corrige SOLO esa propuesta con lo que te devuelven: escribe UN guion (su hoja de planos completa), fiel a su concepto. No escribas «# Propuesta N».',
    `Si la corrección obligaría a cambiar el concepto aprobado (no solo la ejecución), NO lo cambies: escribe la mejor versión fiel al concepto y explícalo en una línea que empiece con «${ROTULO_AVISO_DE_CONCEPTO}».`,
    '',
    'La propuesta aprobada, tal como la escribió la mesa:',
    p.texto,
  ].join('\n')
}

/** el aviso tal como lo ve quien revisa (va a los avisos del guion) */
export const PREFIJO_AVISO_DE_CONCEPTO = 'la corrección pedía cambiar el concepto aprobado: '
/** las líneas «Aviso de concepto: …» de la dirección, con el prefijo de los avisos del guion */
export const avisosDeConcepto = (texto: string): string[] => textosDeConcepto(texto).map((t) => PREFIJO_AVISO_DE_CONCEPTO + t)

/**
 * 17-nov · lo que la ficha de la pieza muestra (pedido de CC5 · RESPUESTA-CC5-a-CC1-aviso-de-concepto-en-la-ficha): la fila de la bandeja lleva
 * `metadata.avisos_de_concepto: string[]` con el texto SIN el rótulo; sin aviso, el campo no va.
 */
export function metadataDeAvisosDeConcepto(e: Pick<Estado, 'artefactos'>): { avisos_de_concepto?: string[] } {
  const g = e.artefactos?.guion?.datos as { avisos_de_concepto?: unknown } | undefined
  const t = Array.isArray(g?.avisos_de_concepto) ? g!.avisos_de_concepto.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []
  return t.length ? { avisos_de_concepto: t } : {}
}

/** las líneas «Aviso de concepto: …» que dejó la dirección en su guion corregido, SIN el rótulo (vacío si no hay) */
export function textosDeConcepto(texto: string): string[] {
  const rotulo = ROTULO_AVISO_DE_CONCEPTO.replace(/:$/, '').toLowerCase()
  const fuera: string[] = []
  for (const cruda of String(texto ?? '').split('\n')) {
    const linea = cruda.replace(/^[\s*_>-]+/, '')
    if (!linea.toLowerCase().startsWith(rotulo)) continue
    const tras = linea.slice(rotulo.length)
    const resto = tras.replace(/^\s*:/, '')
    if (resto.length === tras.length) continue
    const dice = resto.replace(/^[\s*_]+/, '').replace(/[\s*_]+$/, '')
    if (dice) fuera.push(dice)
  }
  return fuera
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
  const pv = elegiblesDe(e)
  if (!pv) return { ok: false, status: 409, error: 'no_espera_al_dueno', detalle: 'el encargo no tiene propuestas que decidir' }
  if (!Number.isInteger(d.ronda) || d.ronda !== pv.ronda) return { ok: false, status: 409, error: 'ronda_vieja', detalle: `la tarjeta muestra la ronda ${d.ronda} y la vigente es la ${pv.ronda}: recarga` }
  if (d.decision === 'aprobar') {
    const p = pv.propuestas.find((x) => x.id === d.propuesta_id)
    if (!p) return { ok: false, status: 409, error: 'propuesta_inexistente', detalle: `no hay una propuesta «${d.propuesta_id}» en la ronda ${pv.ronda}` }
    // imagen: una propuesta sin sus artefactos no se puede fabricar; se dice y no se toca nada (nunca se aprueba algo que la cola no puede producir)
    const otros = p.otros()
    if (!otros) return { ok: false, status: 409, error: 'propuesta_incompleta', detalle: `la propuesta «${p.id}» no trae lo que necesita la producción: pide cambios para que la mesa la rehaga` }
    const aprobacion: AprobacionDePropuestas = { estado: 'aprobada', propuesta_id: p.id, ronda: pv.ronda }
    return { ok: true, aprobacion, res: { costo_usd: 0, artefacto: { ...aprobacion, vuelve_a_la_mesa: false }, otros_artefactos: otros } }
  }
  const obs = String(d.observaciones ?? '').trim()
  if (!obs || obs.length > OBSERVACIONES_MAX) return { ok: false, status: 400, error: 'entrada_invalida', detalle: `las observaciones deben tener de 1 a ${OBSERVACIONES_MAX} caracteres` }
  if (quedanVueltas(e, paso) <= 0) return { ok: false, status: 409, error: 'sin_vueltas', detalle: 'no quedan rondas de cambios: solo se puede aprobar una propuesta' }
  const aprobacion: AprobacionDePropuestas = { estado: 'observaciones', observaciones: obs, ronda: pv.ronda }
  return { ok: true, aprobacion, res: { costo_usd: 0, artefacto: { ...aprobacion, vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeObservaciones(pv.ronda, pv.propuestas.length, obs) } } }
}
