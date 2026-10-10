/**
 * PLANTILLA `post_img` · SALA 1 «post con foto + texto» · es DATO (se siembra INACTIVA en `oficina_tipos_de_grupo`; nada la enciende).
 * Diseño: docs/DISENO-2026-10-09-oficina-v1-1-sala-1-post-con-foto.md §4 + §16.4 (los 3 controles) · docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §1.
 * Agnóstica: ningún texto nombra a un cliente, un producto ni una ciudad.
 */
import { QUIEN_DINAMICO } from '../plantilla'
import type { Condicion, Plantilla } from '../tipos'

const siempre: Condicion = { tipo: 'siempre' }
const generada: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'decision.modo', igual: 'generada' }
const requiereMirar: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'decision.requiere_mirar', igual: true }
const fichasJefe: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', gravedad: 'bloquea' }
const fichasExterna: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa' }
const cambioPieza: Condicion = { tipo: 'si_cambio', artefacto: 'pieza_post' }

export const POST_IMG: Plantilla = {
  tipo: 'post_img',
  familia: 'post_img',
  limites: {
    // 19 pasos definidos; vueltas: prompts (1) + imagen (2) ⇒ margen 3 + 3
    margen: 6,
    tope_encargo_usd: 10,
    max_rondas: 2,
    imagenes_generadas_max: 3,
    reuso_dias: 14,
    // a verificar contra la documentación vigente de cada red antes de bloquear con ellos (sala 4): mientras `verificado` sea false, el chequeo avisa y no bloquea
    pie_de_foto_max: 2200,
    hashtags_max: 30,
    limites_verificados: false,
    formato_por_omision: '1:1',
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'paquete', tipo: 'portero', quien: 'portero', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'material_portero', tope_usd: 0.06 },
    { clave: 'elegir_foto', tipo: 'codigo', quien: 'sala', funcion: 'elegir_foto', condicion: siempre, entrada: ['material_portero'], salida_artefacto: 'candidatas_foto', tope_usd: 0 },
    {
      clave: 'direccion_visual', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: siempre,
      entrada: ['material_portero', 'candidatas_foto'], salida_artefacto: 'visual_direction', tope_usd: 0.25,
      salida: { esquema: 'visual_direction.v1', reintento_formato: 1 }, valida: ['citas_existen'],
    },
    {
      clave: 'prompts', tipo: 'agente', quien: 'design-image-prompt-engineer', condicion: generada,
      entrada: ['visual_direction'], salida_artefacto: 'prompts', tope_usd: 0.2,
      salida: { esquema: 'prompts.v1', reintento_formato: 1 },
    },
    {
      // pasan solo los prompts que cubren cada obligatorio y no nombran ningún prohibido; si no queda ninguno, UNA repetición del ingeniero
      clave: 'chequear_prompts', tipo: 'codigo', quien: 'sala', funcion: 'chequear_prompts', condicion: generada,
      entrada: ['prompts', 'visual_direction'], salida_artefacto: 'prompts_validos', tope_usd: 0,
      vuelve_a: { paso: 'prompts', max: 1, si: { tipo: 'si_artefacto', artefacto: 'prompts_validos', campo: 'ninguno', igual: true } },
    },
    { clave: 'imagen', tipo: 'codigo', quien: 'sala', funcion: 'imagen', condicion: generada, entrada: ['prompts_validos'], salida_artefacto: 'imagenes', tope_usd: 0.1 },
    {
      // el curador SOLO describe; el código decide contra obligatorio/prohibido; si falla y se puede regenerar: vuelve a `imagen` (≤ 2 veces)
      clave: 'mirar', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: requiereMirar,
      entrada: ['imagenes', 'visual_direction'], salida_artefacto: 'observacion_imagen', tope_usd: 0.2,
      salida: { esquema: 'observacion_imagen.v1', reintento_formato: 1 }, valida: ['decide_imagen'],
      vuelve_a: { paso: 'imagen', max: 2, si: { tipo: 'si_artefacto', artefacto: 'observacion_imagen', campo: 'veredicto.regenerar', igual: true } },
    },
    { clave: 'elegir_version', tipo: 'codigo', quien: 'sala', funcion: 'elegir_version', condicion: generada, entrada: ['imagenes', 'observacion_imagen'], salida_artefacto: 'imagen_elegida', tope_usd: 0 },
    { clave: 'acabado', tipo: 'codigo', quien: 'sala', funcion: 'acabado_imagen', condicion: siempre, entrada: ['imagen_elegida', 'candidatas_foto'], salida_artefacto: 'imagen_final', tope_usd: 0 },
    {
      clave: 'texto', tipo: 'agente', quien: 'content-creator', condicion: siempre,
      entrada: ['material_portero', 'visual_direction', 'observacion_imagen'], salida_artefacto: 'pieza_post', tope_usd: 0.2,
      salida: { esquema: 'pieza_post.v1', reintento_formato: 1 },
    },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos', condicion: siempre, entrada: ['pieza_post', 'imagen_final', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revision_jefe', tipo: 'agente', quien: 'jefe-marketing', condicion: siempre, ronda: 1,
      entrada: ['pieza_post', 'imagen_final', 'chequeos'], salida_artefacto: 'fichas_jefe', tope_usd: 0.2,
      salida: { esquema: 'fichas.v1', reintento_formato: 1 },
    },
    {
      clave: 'corrige', tipo: 'agente', quien: QUIEN_DINAMICO, condicion: fichasJefe, ronda: 1,
      entrada: ['fichas_jefe', 'pieza_post'], salida_artefacto: 'pieza_post', tope_usd: 0.2,
      salida: { esquema: 'resolucion.v1', reintento_formato: 1 },
    },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos', condicion: cambioPieza, entrada: ['pieza_post', 'imagen_final'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revisor_externo', tipo: 'externo', quien: 'GPT', condicion: siempre, ronda: 2,
      entrada: ['pieza_post', 'imagen_final', 'visual_direction', 'material_portero'], salida_artefacto: 'fichas_externas', tope_usd: 0.5,
      salida: { esquema: 'fichas.v1', reintento_formato: 1 },
    },
    {
      clave: 'decide', tipo: 'agente', quien: QUIEN_DINAMICO, condicion: fichasExterna, ronda: 2,
      entrada: ['fichas_externas', 'pieza_post'], salida_artefacto: 'pieza_post', tope_usd: 0.2,
      salida: { esquema: 'resolucion.v1', reintento_formato: 1 },
    },
    { clave: 'chequeos_3', tipo: 'codigo', quien: 'sala', funcion: 'chequeos', condicion: cambioPieza, entrada: ['pieza_post', 'imagen_final'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega', condicion: siempre, entrada: ['pieza_post', 'imagen_final', 'chequeos'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  indicaciones: {
    marketing_instagram_curator: [
      { regla: 'Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.', aplica: 'codigo:citas_existen' },
      { regla: 'Partes del manual y de las fotos candidatas que te pasa la sala: si una foto cumple, indica su identificador; si ninguna sirve, pides una generada.', aplica: 'codigo:salida' },
      { regla: 'No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.', aplica: 'codigo:chequeos' },
      { regla: 'Cuando miras una imagen, describes por cada regla si está presente, ausente o no se ve, con la evidencia; no opinas ni la apruebas.', aplica: 'codigo:decide_imagen' },
      { regla: 'El idioma, el registro y el estilo son los del manual y el brief del cliente.', aplica: 'guia' },
    ],
    'content-creator': [
      { regla: 'Escribes en el idioma y el registro que fija el manual del cliente (si no lo dice, los del país y el idioma del cliente) y no los mezclas.', aplica: 'codigo:chequeos' },
      { regla: 'Lees el manual, el plan y el brief; el brief es guía, no regla; la estructura del texto la dicta el brief.', aplica: 'guia' },
      { regla: 'No inventes precios, horarios, sedes, reseñas ni nombres; si falta un dato, decláralo.', aplica: 'codigo:chequeos' },
      { regla: 'Entregas el pie de foto y los hashtags en campos aparte.', aplica: 'codigo:salida' },
      { regla: 'Ante correcciones, respondes ítem por ítem: tomada o no tomada, con la razón.', aplica: 'codigo:salida' },
    ],
    'jefe-marketing': [
      { regla: 'No repartes trabajo ni asignas tareas a otros.', aplica: 'codigo:motor' },
      { regla: 'Revisas una sola vez.', aplica: 'codigo:motor' },
      { regla: 'Entregas fichas con qué, dónde, contra qué, gravedad y propuesta.', aplica: 'codigo:salida' },
      { regla: 'No reescribes la pieza: señalas y propones.', aplica: 'codigo:salida' },
      { regla: 'La imagen también es parte de la pieza: revísala contra el manual y el brief.', aplica: 'guia' },
    ],
    'design-image-prompt-engineer': [
      { regla: 'Propones 2 o 3 prompts de imagen distintos en lenguaje natural (sujeto, entorno, luz, cámara, estilo); el curador elige.', aplica: 'codigo:salida' },
      { regla: 'Personas, texto dentro de la imagen y estilo los deciden el manual de marca y el brief de este cliente; nunca logos ni marcas de otro negocio.', aplica: 'codigo:chequear_prompts' },
      { regla: 'El tamaño lo fija la sala; no escribas relaciones de aspecto ni parámetros.', aplica: 'codigo:salida' },
      { regla: 'No nombres marcas, fotógrafos ni personas reales.', aplica: 'codigo:chequear_prompts' },
      { regla: 'Devuelves solo el JSON del contrato.', aplica: 'codigo:salida' },
    ],
  },
}
