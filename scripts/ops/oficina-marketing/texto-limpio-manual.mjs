/**
 * 03-nov · ENCARGO LENOVO a CC2 (punto B) · el equipo del manual escribe SOLO el texto presentable al cliente. US$ 0, nada aplicado.
 * Las reglas de evidencia que viajan en la prosa de las tres lentes (`REGLAS_EVIDENCIA_R62`, «[BB] Fan-out prep») pedían «el cliente dice: «cita»» DENTRO del texto y no
 * prohibían los códigos de segmento ni las justificaciones pegadas («— responde a la objeción de S3/S5»). Aquí se cambia esa prosa (INSTRUCCIÓN, no código: sin rejas):
 *   · el texto lleva solo lo presentable; la fuente va en `_field_meta.<campo>.fuente` y la razón en `_field_meta.<campo>.razon`
 *   · lo que el cliente dice de sí mismo se escribe en la voz de la marca, sin atribución pegada (la atribución queda en el registro aparte)
 * Las otras mitades del punto B viven en `secciones-nuevas-y-mesa-manual.mjs` (REGLA de proponer, rótulo fuera del texto) y `reescritura-del-manual.mjs` (cómo corrigen).
 */
import { cambiarCodigo } from './lib.mjs'

export const NODO = '[BB] Fan-out prep'
export const SUSTITUCIONES = [
  [
    'ni etiquetas como «ICP …». Lo que el cliente dice de sí mismo se escribe «el cliente dice: «cita»», NUNCA como hecho comprobado.',
    'ni etiquetas como «ICP …», ni códigos de segmento (S1…), ni justificaciones pegadas («— responde a…», «· porque…»): el TEXTO, solo lo presentable; razón y fuente en `_field_meta.<campo>`. Lo que el cliente dice de sí mismo en la voz de la marca, sin «el cliente dice» ni la cita al inicio, jamás como hecho comprobado.',
  ],
]
export function construirTextoLimpio(f) {
  for (const [viejo, nuevo] of SUSTITUCIONES) cambiarCodigo(f, NODO, viejo, nuevo)
}
