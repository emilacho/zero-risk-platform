/**
 * PLANTILLA `video_mesa` · el brazo de video DESDE LA OFICINA (parte 2 · 31-oct). Es DATO (se siembra INACTIVA; la enciende la config cuando Emilio dé «dale» a la prueba completa).
 * El equipo de la mesa escribe el GUION (dirección creativa + guionista `video-editor` + coach de video corto + especialista de YouTube + texto + curaduría de fotos propias);
 * lo que sigue es cola mecánica: guion → pedido al brazo → el video (Seedance, ≤ US$ 5, con descuento vigente) → chequeos → jefatura → entrega (mp4 + guion + pie) → cierre.
 * Tope de la pieza US$ 10 (no 5 como la mesa de láminas): el video solo cuesta ≈ 2,6–4,9 y la jefatura reserva 1,5; a la mesa le quedan ≈ 3.
 */
import type { Condicion, Plantilla } from '../tipos'

export const TOPE_DE_VIDEO_MESA_USD = 10
/** lo que el brazo puede cobrar por UN video (el mismo tope del brazo): el paso `video` lo reserva antes de enviar */
export const TOPE_DEL_PASO_VIDEO_USD = 5

const siempre: Condicion = { tipo: 'siempre' }
const cambioCopy: Condicion = { tipo: 'si_cambio', artefacto: 'copy_video' }

export const VIDEO_MESA: Plantilla = {
  tipo: 'video_mesa',
  familia: 'video_mesa',
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
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_video', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'mesa', tipo: 'codigo', quien: 'sala', funcion: 'mesa', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'mesa', tope_usd: 0 },
    { clave: 'pedido', tipo: 'codigo', quien: 'sala', funcion: 'pedido_de_video', condicion: siempre, entrada: ['guion', 'copy_video'], salida_artefacto: 'pedido_video', tope_usd: 0 },
    { clave: 'video', tipo: 'codigo', quien: 'sala', funcion: 'video', condicion: siempre, entrada: ['pedido_video'], salida_artefacto: 'video', tope_usd: TOPE_DEL_PASO_VIDEO_USD },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: siempre, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'jefatura', tipo: 'jefatura', quien: 'jefatura', condicion: siempre, entrada: ['guion', 'copy_video', 'video', 'chequeos'], salida_artefacto: 'respuesta_imagen', tope_usd: 0 },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: cambioCopy, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega_video', condicion: siempre, entrada: ['copy_video', 'video', 'chequeos', 'guion'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  indicaciones: {},
}
