/**
 * PLANTILLA `video_mesa` · el brazo de video DESDE LA OFICINA (parte 2 · 31-oct · T8 «video sobre la hoja»). Es DATO (se siembra INACTIVA en 202610312012; la enciende la config cuando Emilio dé «dale» a la prueba completa).
 * El equipo de la mesa es DATO del directorio (`oficina_directorio`, 2008 + 2012 + 202611011300): dirección `creative-director-mesa` (`video:dirige`) · `video-editor` (guion y pedido al generador; integra el gancho)
 * · `marketing_short_video_editing_coach` (la ÚNICA voz del gancho, con el método `short-video-scripter` en su tarea · FIRMA 01-nov) · `design-visual-storyteller` (storyboard) · `content-creator` (pie y etiquetas)
 * · `marketing_instagram_curator` (`video:si_instagram`) · `tiktok-strategist` (`video:si_tiktok_o_reels`) · portero.
 * `whimsy-injector` (FIRMA 01-nov punto 2, CC#2 · 202610312013 `si_whimsy`) entra a carrusel y kit; en video queda pendiente (`video:si_whimsy` + calcular `si_whimsy` al abrir) para después de unir las ramas.
 * La retención (`marketing_video_optimization_specialist`) NO está aquí: aporta en la familia propia del video largo de YouTube (`video_largo`, sala pendiente · FIRMA 01-nov punto 4).
 * Lo que sigue a la mesa es cola mecánica: guion → pedido al brazo → el video (Seedance, ≤ US$ 5, con descuento vigente) → chequeos → jefatura → entrega (mp4 + guion + pie) → cierre.
 * Tope de la pieza US$ 10 (no 5 como la mesa de láminas): el video solo cuesta ≈ 2,6–4,9 y la jefatura reserva 1,5; a la mesa le quedan ≈ 3.
 * 11-nov · GO Lenovo 18:56 + 19:44 Zúrich (regla premium: la SEGUNDA filmación tiene que caber): video US$ 15 · encargo US$ 35 (mesa + video + mirada + segundo video, con margen)
 * · lo esperado por pieza para el freno de la campaña US$ 12 (`reserva_por_pieza_usd`, mientras no haya historia). Migración 202611111930 (dato; se baja después).
 */
import type { Condicion, Plantilla } from '../tipos'
import { CALIDAD_DE_IMAGEN_CLAVE, ESQUEMA_REVISION_IMAGENES_CLAVE, PASO_IMAGENES_CLAVE, PASO_REVISAR_IMAGENES_CLAVE } from '../video/imagen-clave'

// 16-nov · S2-3 (CC2) · 35 → 45: las imágenes clave (≤ 3) y su revisión (0,5) van ANTES del video y también se repiten en la vuelta de la mirada; con 35 la segunda filmación
//   (regla premium del 11-nov) ya no cabría. 45 ≥ lo gastado al mirar (≈ 22) + volver (≈ 19,6). Necesita GO de Lenovo al aplicar (es dinero); el máximo de la base es 50.
export const TOPE_DE_VIDEO_MESA_USD = 45
/** lo que el brazo puede cobrar por UN video (el mismo tope del brazo): el paso `video` lo reserva antes de enviar */
export const TOPE_DEL_PASO_VIDEO_USD = 15
/** lo ESPERADO por video para el freno de la campaña mientras la familia no tenga historia (`gasto-de-encargos.ts` · `reservasDesdeLaHistoria`) */
// 17-nov · DECISION Lenovo 05:07 + CORRECCIÓN 05:16 · 12 → 30: que un video no se frene por la reserva de la campaña (el costo real medido de un video es ≈ 12–25).
//   El tope del encargo se queda en 45 y el del paso video en 15. Migración 202611170520 (solo este dato).
export const RESERVA_POR_VIDEO_USD = 30

const siempre: Condicion = { tipo: 'siempre' }
const cambioCopy: Condicion = { tipo: 'si_cambio', artefacto: 'copy_video' }
/** 11-nov · el agente mira el video solo si salieron cuadros (sin cuadros queda una ficha que bloquea: una persona lo mira) */
const hayCuadros: Condicion = { tipo: 'si_artefacto', artefacto: 'cuadros_video', campo: 'hay_cuadros', igual: true }
/** quién mira el video terminado (DATO: se cambia aquí y en la migración, no en el código).
 *  11-nov · GO Lenovo 18:50: un ojo INDEPENDIENTE, que no participó en el guion (regla premium). `marketing_video_optimization_specialist` es del directorio
 *  (especialista en retención del video corto, con visión) y solo es pertinente en `video_largo`: no se sienta en esta mesa ni corrige el guion en la jefatura. */
export const AGENTE_QUE_MIRA_EL_VIDEO = 'marketing_video_optimization_specialist'
/** lo que se le deja gastar al agente que mira (regla premium de Emilio 11-nov: material premium mientras se construye) */
export const TOPE_DE_LA_MIRADA_USD = 0.5
/** S2-3 · lo que pueden costar las imágenes clave de un video (una por plano; en final, a la máxima calidad) */
export const TOPE_DE_LAS_IMAGENES_CLAVE_USD = 3
/** S2-3 · quién revisa las imágenes clave antes de filmar (DATO): el mismo ojo independiente que mira el video, que no escribe la hoja */
export const AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE = AGENTE_QUE_MIRA_EL_VIDEO
/** S2-3 · la revisión mira solo si salió alguna imagen clave */
const hayImagenesClave: Condicion = { tipo: 'si_artefacto', artefacto: 'imagenes_clave', campo: 'hay_imagenes', igual: true }

export const VIDEO_MESA: Plantilla = {
  tipo: 'video_mesa',
  familia: 'video_mesa',
  clase: 'video',
  limites: {
    // 9 pasos definidos; el margen cubre los turnos de la mesa (≤ 24) y el turno del brazo
    margen: 50,
    tope_encargo_usd: TOPE_DE_VIDEO_MESA_USD,
    max_rondas: 2,
    imagenes_generadas_max: 0,
    reuso_dias: 14,
    plataforma: 'instagram-reel',
    pie_de_foto_max: 2200,
    hashtags_max: 30,
    limites_verificados: false,
    formato_por_omision: '9:16',
    mesa: true,
    video: { resolucion: '720p', segundos_min: 8, segundos_max: 15, tope_por_video_usd: TOPE_DEL_PASO_VIDEO_USD },
    reserva_por_pieza_usd: RESERVA_POR_VIDEO_USD,
    // S2-3 · la calidad de la imagen clave por fase (DATO): borrador barato en las propuestas, final al máximo con la propuesta aprobada; el mismo camino
    imagen_clave: CALIDAD_DE_IMAGEN_CLAVE,
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_video', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'mesa', tipo: 'codigo', quien: 'sala', funcion: 'mesa', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'mesa', tope_usd: 0 },
    // 16-nov · S2-3 · una imagen clave por plano (el storyboard) antes de filmar; un agente con visión la revisa contra la hoja y AVISA: devuelve UNA vez a la mesa y luego sigue
    { clave: PASO_IMAGENES_CLAVE, tipo: 'codigo', quien: 'sala', funcion: 'imagenes_clave', condicion: siempre, entrada: ['guion', 'encargo'], salida_artefacto: 'imagenes_clave', tope_usd: TOPE_DE_LAS_IMAGENES_CLAVE_USD },
    { clave: PASO_REVISAR_IMAGENES_CLAVE, tipo: 'agente', quien: AGENTE_QUE_REVISA_LAS_IMAGENES_CLAVE, condicion: hayImagenesClave, entrada: ['imagenes_clave', 'guion'], salida_artefacto: 'revision_imagenes_clave', tope_usd: TOPE_DE_LA_MIRADA_USD, salida: { esquema: ESQUEMA_REVISION_IMAGENES_CLAVE, reintento_formato: 1 },
      vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'revision_imagenes_clave', campo: 'vuelve_a_la_mesa', igual: true } } },
    // 11-nov · GO Lenovo 16:34 · si el guion nombra fotos que no existen, el pedido vuelve UNA vez a la mesa con el aviso (202611111700); a la segunda sigue de largo
    { clave: 'pedido', tipo: 'codigo', quien: 'sala', funcion: 'pedido_de_video', condicion: siempre, entrada: ['guion', 'copy_video'], salida_artefacto: 'pedido_video', tope_usd: 0,
      vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'pedido_video', campo: 'vuelve_a_la_mesa', igual: true } } },
    { clave: 'video', tipo: 'codigo', quien: 'sala', funcion: 'video', condicion: siempre, entrada: ['pedido_video'], salida_artefacto: 'video', tope_usd: TOPE_DEL_PASO_VIDEO_USD },
    // 11-nov · GO Lenovo 16:43 · un agente con visión mira el video terminado (un cuadro por plano) contra el guion y la fila; juzga él (ver `video/mirada.ts`)
    { clave: 'cuadros_video', tipo: 'codigo', quien: 'sala', funcion: 'cuadros_video', condicion: siempre, entrada: ['video', 'guion'], salida_artefacto: 'cuadros_video', tope_usd: 0 },
    { clave: 'mirar_video', tipo: 'agente', quien: AGENTE_QUE_MIRA_EL_VIDEO, condicion: hayCuadros, entrada: ['cuadros_video', 'guion'], salida_artefacto: 'mirada_video', tope_usd: TOPE_DE_LA_MIRADA_USD, salida: { esquema: 'mirada_video.v1', reintento_formato: 1 },
      // si no coincide, el video vuelve UNA vez a la mesa con lo que faltó (adenda Emilio 16:43); a la segunda sigue de largo con la ficha que bloquea
      vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'mirada_video', campo: 'vuelve_a_la_mesa', igual: true } } },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: siempre, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'jefatura', tipo: 'jefatura', quien: 'jefatura', condicion: siempre, entrada: ['guion', 'copy_video', 'video', 'chequeos'], salida_artefacto: 'respuesta_imagen', tope_usd: 0 },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: cambioCopy, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega_video', condicion: siempre, entrada: ['copy_video', 'video', 'chequeos', 'guion'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  // 11-nov · la indicación de quien mira el video (va SOLO con su pedido: la mesa no lee las indicaciones del tipo de grupo); el texto de su identidad no cambia
  indicaciones: {
    [AGENTE_QUE_MIRA_EL_VIDEO]: [
      { regla: 'Cuando miras el video terminado, juzgas tú si cuenta lo que pide el guion y la fila: describe lo que de verdad se ve en cada cuadro, sin suponer lo que no se ve, y di qué falta para que el video cuente la historia.', aplica: 'guia' },
      { regla: 'Cuando revisas las imágenes clave antes de filmar, juzgas tú si cada una cumple el rol y la intención de su plano y, en los planos de producto, si el producto es el de la foto real; si no, das la corrección concreta para la hoja.', aplica: 'guia' },
    ],
  },
}
