/**
 * E4 · QUIEN VALIDA EL MANUAL ES LA JEFATURA (30-oct · firmado por Emilio: «el manual tiene que salir estructuralmente bien… poder corregirlo es solo una herramienta por si acaso»;
 * regla del 20-oct: la validación dentro del loop es de la jefatura, no del dueño). Antes, el borrador de la revisión esperaba una tarjeta en la bandeja de Emilio.
 *
 * La jefatura valida SOLO si se cumple TODO esto (si no, el borrador queda sin promover y se dice por qué; nada va a la bandeja del dueño):
 *  · el juez de fidelidad corrió con la fuente CRUDA y ningún campo que gatea quedó bajo el umbral (la vara objetiva decide; no se vota el cimiento);
 *  · el manual está completo (`evaluarCompletitud`): cada obligatorio lleno, propuesto por un agente y dicho, o NO hay huecos;
 *  · quedó una segunda mirada (la opinión del revisor externo respondió) — sin ella el manual sale como propuesta, no como validado;
 *  · no queda ningún `PENDIENTE` en los campos obligatorios (la puerta los deja así cuando retira algo sin fuente) ni dudas abiertas.
 * La firma del dueño sigue existiendo como herramienta opcional (B1 del tablero): `validado_por: 'dueno'`.
 * PURO.
 */
import type { Completitud } from './campos-del-manual'

export interface EntradaDeLaJefatura {
  fidelidad: { umbral: number; puntajes: Record<string, number | null>; bajo_umbral: string[] } | null | undefined
  completitud: Completitud
  /** el revisor externo respondió */
  segunda_mirada: boolean
  /** cuántas afirmaciones quedaron «con duda» (la puerta las conserva a la vista) */
  dudas_abiertas: number
}
export interface VeredictoDeLaJefatura { valida: boolean; motivos: string[] }

export function decidirLaJefatura(e: EntradaDeLaJefatura): VeredictoDeLaJefatura {
  const motivos: string[] = []
  if (!e.fidelidad) motivos.push('el juez de fidelidad no corrió con la fuente cruda')
  else if (e.fidelidad.bajo_umbral.length) motivos.push(`campos bajo el umbral de fidelidad ${e.fidelidad.umbral}: ${e.fidelidad.bajo_umbral.join(', ')}`)
  if (!e.completitud.completo) motivos.push(`faltan datos obligatorios: ${e.completitud.huecos.map((h) => h.etiqueta).join(', ')}`)
  if (!e.segunda_mirada) motivos.push('no hubo segunda mirada (el revisor externo no respondió)')
  if (e.dudas_abiertas > 0) motivos.push(`${e.dudas_abiertas} afirmación(es) con duda abierta`)
  return { valida: motivos.length === 0, motivos }
}
