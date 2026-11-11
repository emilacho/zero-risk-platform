/**
 * PLANTILLA `video_mesa` · el brazo de video DESDE LA OFICINA (parte 2 · 31-oct · T8 «video sobre la hoja»). Es DATO (se siembra INACTIVA en 202610312012; la enciende la config cuando Emilio dé «dale» a la prueba completa).
 * El equipo de la mesa es DATO del directorio (`oficina_directorio`, 2008 + 2012 + 202611011300): dirección `creative-director-mesa` (`video:dirige`) · `video-editor` (guion y pedido al generador; integra el gancho)
 * · `marketing_short_video_editing_coach` (la ÚNICA voz del gancho, con el método `short-video-scripter` en su tarea · FIRMA 01-nov) · `design-visual-storyteller` (storyboard) · `content-creator` (pie y etiquetas)
 * · `marketing_instagram_curator` (`video:si_instagram`) · `tiktok-strategist` (`video:si_tiktok_o_reels`) · portero.
 * `whimsy-injector` (FIRMA 01-nov punto 2, CC#2 · 202610312013 `si_whimsy`) entra a carrusel y kit; en video queda pendiente (`video:si_whimsy` + calcular `si_whimsy` al abrir) para después de unir las ramas.
 * La retención (`marketing_video_optimization_specialist`) NO está aquí: aporta en la familia propia del video largo de YouTube (`video_largo`, sala pendiente · FIRMA 01-nov punto 4).
 * Lo que sigue a la mesa es cola mecánica: guion → pedido al brazo → el video (Seedance, ≤ US$ 5, con descuento vigente) → chequeos → jefatura → entrega (mp4 + guion + pie) → cierre.
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
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_video', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'mesa', tipo: 'codigo', quien: 'sala', funcion: 'mesa', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'mesa', tope_usd: 0 },
    // 11-nov · GO Lenovo 16:34 · si el guion nombra fotos que no existen, el pedido vuelve UNA vez a la mesa con el aviso (202611111700); a la segunda sigue de largo
    { clave: 'pedido', tipo: 'codigo', quien: 'sala', funcion: 'pedido_de_video', condicion: siempre, entrada: ['guion', 'copy_video'], salida_artefacto: 'pedido_video', tope_usd: 0,
      vuelve_a: { paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'pedido_video', campo: 'vuelve_a_la_mesa', igual: true } } },
    { clave: 'video', tipo: 'codigo', quien: 'sala', funcion: 'video', condicion: siempre, entrada: ['pedido_video'], salida_artefacto: 'video', tope_usd: TOPE_DEL_PASO_VIDEO_USD },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: siempre, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'jefatura', tipo: 'jefatura', quien: 'jefatura', condicion: siempre, entrada: ['guion', 'copy_video', 'video', 'chequeos'], salida_artefacto: 'respuesta_imagen', tope_usd: 0 },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_video', condicion: cambioCopy, entrada: ['video', 'copy_video', 'pedido_video'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega_video', condicion: siempre, entrada: ['copy_video', 'video', 'chequeos', 'guion'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  indicaciones: {},
}
