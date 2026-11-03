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

// ── 03-nov · decisión de Lenovo 13:54Z (opción 1 + opción A) ─────────────────────────────────────────────────────────────────────────────
// Opción 1: el texto va limpio y la propuesta se declara APARTE (`_meta.<campo>.fuente = «propuesta»`). Instrucciones + vara + reparos cambian JUNTOS.
// Opción A: los nodos de `content-creator` del flujo del manual saltan al editor (`x-skip-editor-middleware`): la jefatura es el único control.
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, nodo } from './lib.mjs'

const STAGING = path.join(AQUI, '..', '..', 'worker-staging', 'ssLtwYPt7zxuvnM2')
const bloque = (a) => fs.readFileSync(path.join(STAGING, a), 'utf8').replace(/\r\n/g, '\n')
export const BLOQUE_VIEJO = () => bloque('bloque-uso-de-lo-disponible-2026-10-20.js').trim()
export const BLOQUE_NUEVO = () => bloque('bloque-uso-de-lo-disponible-2026-11-03.js').trim()
export const JUECES_DE_USO = ['[BB] Faithfulness judge', '[BB] Uso · ¿usó lo disponible?']
export const NODOS_CONTENT_CREATOR = ['Lente · editor-en-jefe', '[BB] Uso · pedir la voz otra vez (editor-en-jefe)']
export const REGLA_VIEJA = 'escribe cada campo así armado EMPEZANDO por «PROPUESTA (no es dato del cliente): …» (en `_meta.<campo>.fuente` pon «propuesta»). Lo que SÍ viene del cliente lleva su cita literal. Esta es la única excepción a «sin cita no lo escribas»: una PROPUESTA rotulada.'
export const REGLA_NUEVA = 'escribe cada campo así armado como texto limpio, en voz de la marca y sin prefijo; declara la propuesta aparte: `_meta.<campo>.fuente` = «propuesta». Lo que SÍ viene del cliente lleva su cita literal. Única excepción a «sin cita no lo escribas».'
export const REPAROS = [
  ["(voz.rotulo ? 'sin rotular como PROPUESTA' : 'vacía o PENDIENTE')", "(voz.rotulo ? 'sin declarar como propuesta' : 'vacía o PENDIENTE')"],
  ['es una PROPUESTA y empieza por «PROPUESTA (no es dato del cliente): …». NUNCA', 'es una propuesta: escríbela limpia, sin prefijo, y decláralo en `_meta.voice_description.fuente` = «propuesta». NUNCA'],
  ["(voz.rotulo ? 'sin rotular PROPUESTA' : 'PENDIENTE')", "(voz.rotulo ? 'sin declarar propuesta' : 'PENDIENTE')"],
  ['sin texto propio, empieza por «PROPUESTA (no es dato del cliente): …».', 'sin texto propio, texto limpio y `_meta.voice_description.fuente` = «propuesta».'],
]
export const CABECERA_SALTO = { name: 'x-skip-editor-middleware', value: '1' }

export function construirPropuestaAparte(f) {
  cambiarCodigo(f, NODO, REGLA_VIEJA, REGLA_NUEVA)
  for (const j of JUECES_DE_USO) cambiarCodigo(f, j, BLOQUE_VIEJO(), BLOQUE_NUEVO())
  for (const [v, n] of REPAROS) cambiarCodigo(f, JUECES_DE_USO[1], v, n)
  for (const nombre of NODOS_CONTENT_CREATOR) {
    const ps = nodo(f, nombre).parameters.headerParameters.parameters
    if (!ps.some((h) => h.name === CABECERA_SALTO.name)) ps.push({ ...CABECERA_SALTO })
  }
}
