/**
 * PLANTILLA `kit_historias` · SALA 3 «historia y estado de WhatsApp» · es DATO (se siembra INACTIVA; nada la enciende).
 * Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §3. UN encargo = el kit de una semana: N láminas fijas 9:16, cada una con su destino (historia o estado). El estado es la MISMA imagen con otro destino.
 * Reparto: `design-visual-storyteller` pone solo la ESTRUCTURA (esquema sin campos de texto); `content-creator` escribe TODO texto que aparece en una imagen o en un acompañamiento; el brazo dibuja.
 * «ref» de una imagen = el elemento del kit (e01, e02, …). Agnóstica: ningún texto nombra a un cliente, un producto ni una ciudad.
 */
import type { Condicion, Plantilla, ReglaDeIndicacion } from '../tipos'
import { CARRUSEL_IG_V1 } from './carrusel-ig-v1'
import { POST_IMG } from './post-img'

const siempre: Condicion = { tipo: 'siempre' }
const generada: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'hay_generadas', igual: true }
const requiereMirar: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'requiere_mirar', igual: true }
const jefeTexto: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', donde: ['texto', 'hashtags'], gravedad: 'bloquea' }
const jefeEstructura: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', donde: 'estructura', gravedad: 'bloquea' }
// la opinión libre del revisor externo llega como UNA ficha `externa` en «texto»: el autor decide qué toma
const externaTexto: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa', donde: 'texto' }
// y llega también a quien estructura (narrador) y al curador (imagen): cada uno decide sobre su parte, con razón
const externaEstructura: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa', donde: 'estructura' }
const externaImagen: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa', donde: 'imagen' }
const cambioKit: Condicion = { tipo: 'si_cambio', artefacto: ['copy_kit', 'estructura', 'imagenes_elegidas'] }
// la opinión «tomada» del curador dispara UNA re-imagen (con los controles de siempre) si al encargo le queda margen; cada paso siguiente corre solo si el anterior dejó algo nuevo
const reImagen: Condicion = { tipo: 'si_artefacto', artefacto: 'respuesta_imagen', campo: 're_imagen', igual: true }
const cambioPrompts: Condicion = { tipo: 'si_cambio', artefacto: 'prompts' }
const cambioPromptsValidos: Condicion = { tipo: 'si_cambio', artefacto: 'prompts_validos' }
const cambioImagenes: Condicion = { tipo: 'si_cambio', artefacto: 'imagenes' }
const cambioObservacion: Condicion = { tipo: 'si_cambio', artefacto: 'observacion_imagen' }

const cambioArmado: Condicion = { tipo: 'si_cambio', artefacto: 'laminas_armadas' }
const cambioRender: Condicion = { tipo: 'si_cambio', artefacto: 'render' }

const regla = (r: string, aplica: string): ReglaDeIndicacion => ({ regla: r, aplica })

export const KIT_HISTORIAS: Plantilla = {
  tipo: 'kit_historias',
  familia: 'kit_historias',
  limites: {
    // 29 pasos definidos; vueltas: prompts (1) + imagen (2) ⇒ margen 3 + 3
    margen: 6,
    tope_encargo_usd: 10,
    max_rondas: 2,
    imagenes_generadas_max: 3,
    versiones_por_ref: 2,
    reuso_dias: 14,
    // el molde de 1080×1920 del motor de láminas; una historia suelta no lleva «n · N» ni «desliza»
    plataforma: 'instagram-reel',
    // se lee en segundos: topes de texto por lámina (dato; el manual o el brief pueden cambiarlos)
    headline_historia: 60,
    body_historia: 140,
    // unverified: el límite del acompañamiento del estado de WhatsApp; mientras no se verifique, solo avisa
    acompanamiento_max: 700,
    pie_de_foto_max: 2200,
    hashtags_max: 30,
    limites_verificados: false,
    formato_por_omision: '9:16',
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_laminas', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'paquete', tipo: 'portero', quien: 'portero', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'material_portero', tope_usd: 0.08 },
    { clave: 'asignar_fotos', tipo: 'codigo', quien: 'sala', funcion: 'asignar_fotos', condicion: siempre, entrada: ['material_portero'], salida_artefacto: 'candidatas_foto', tope_usd: 0 },
    {
      clave: 'direccion_visual', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: siempre,
      entrada: ['material_portero', 'candidatas_foto'], salida_artefacto: 'visual_direction', tope_usd: 0.3,
      salida: { esquema: 'direccion_imagenes.v1', reintento_formato: 1 }, valida: ['citas_existen', 'refs_validos'],
    },
    {
      clave: 'narrativa', tipo: 'agente', quien: 'design-visual-storyteller', condicion: siempre,
      entrada: ['visual_direction', 'material_portero'], salida_artefacto: 'estructura', tope_usd: 0.2,
      salida: { esquema: 'estructura.v1', reintento_formato: 1 }, valida: ['sin_texto_en_estructura', 'refs_validos'],
    },
    {
      clave: 'prompts', tipo: 'agente', quien: 'design-image-prompt-engineer', condicion: generada,
      entrada: ['visual_direction'], salida_artefacto: 'prompts', tope_usd: 0.2,
      salida: { esquema: 'prompts_por_ref.v1', reintento_formato: 1 }, valida: ['refs_validos'],
    },
    {
      clave: 'chequear_prompts', tipo: 'codigo', quien: 'sala', funcion: 'chequear_prompts_ref', condicion: generada,
      entrada: ['prompts', 'visual_direction'], salida_artefacto: 'prompts_validos', tope_usd: 0,
      vuelve_a: { paso: 'prompts', max: 1, si: { tipo: 'si_artefacto', artefacto: 'prompts_validos', campo: 'ninguno', igual: true } },
    },
    { clave: 'imagen', tipo: 'codigo', quien: 'sala', funcion: 'imagen_ref', condicion: generada, entrada: ['prompts_validos'], salida_artefacto: 'imagenes', tope_usd: 0.2 },
    {
      clave: 'mirar', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: requiereMirar,
      entrada: ['imagenes', 'visual_direction'], salida_artefacto: 'observacion_imagen', tope_usd: 0.2,
      salida: { esquema: 'observacion_imagenes.v1', reintento_formato: 1 }, valida: ['decide_imagen'],
      vuelve_a: { paso: 'imagen', max: 2, si: { tipo: 'si_artefacto', artefacto: 'observacion_imagen', campo: 'veredicto.regenerar', igual: true } },
    },
    { clave: 'elegir_version', tipo: 'codigo', quien: 'sala', funcion: 'elegir_version_ref', condicion: siempre, entrada: ['imagenes', 'observacion_imagen', 'visual_direction'], salida_artefacto: 'imagenes_elegidas', tope_usd: 0 },
    {
      clave: 'texto', tipo: 'agente', quien: 'content-creator', condicion: siempre,
      entrada: ['material_portero', 'estructura', 'imagenes_elegidas'], salida_artefacto: 'copy_kit', tope_usd: 0.3,
      salida: { esquema: 'copy_kit.v1', reintento_formato: 1 }, valida: ['contrato_de_lamina', 'refs_validos'],
    },
    { clave: 'armar', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: siempre, entrada: ['copy_kit', 'estructura', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: siempre, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: siempre, entrada: ['copy_kit', 'estructura', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revision_jefe', tipo: 'agente', quien: 'jefe-marketing', condicion: siempre, ronda: 1,
      entrada: ['copy_kit', 'estructura', 'render', 'chequeos'], salida_artefacto: 'fichas_jefe', tope_usd: 0.25,
      salida: { esquema: 'fichas.v1', reintento_formato: 1 },
    },
    {
      clave: 'corrige_texto', tipo: 'agente', quien: 'content-creator', condicion: jefeTexto, ronda: 1,
      entrada: ['fichas_jefe', 'copy_kit'], salida_artefacto: 'copy_kit', tope_usd: 0.25,
      salida: { esquema: 'resolucion_copy_kit.v1', reintento_formato: 1 }, valida: ['contrato_de_lamina', 'refs_validos'],
    },
    {
      clave: 'corrige_estructura', tipo: 'agente', quien: 'design-visual-storyteller', condicion: jefeEstructura, ronda: 1,
      entrada: ['fichas_jefe', 'estructura'], salida_artefacto: 'estructura', tope_usd: 0.2,
      salida: { esquema: 'resolucion_estructura.v1', reintento_formato: 1 }, valida: ['sin_texto_en_estructura', 'refs_validos'],
    },
    { clave: 'armar_2', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: cambioKit, entrada: ['copy_kit', 'estructura', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render_2', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: cambioArmado, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: cambioRender, entrada: ['copy_kit', 'estructura', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revisor_externo', tipo: 'externo', quien: 'GPT', condicion: siempre, ronda: 2,
      entrada: ['copy_kit', 'estructura', 'render', 'visual_direction', 'material_portero'], salida_artefacto: 'fichas_externas', tope_usd: 0.7,
      salida: { esquema: 'opinion_libre.v1', reintento_formato: 0 },
    },
    {
      clave: 'decide_texto', tipo: 'agente', quien: 'content-creator', condicion: externaTexto, ronda: 2,
      entrada: ['fichas_externas', 'copy_kit'], salida_artefacto: 'copy_kit', tope_usd: 0.25,
      salida: { esquema: 'resolucion_copy_kit.v1', reintento_formato: 1 }, valida: ['contrato_de_lamina', 'refs_validos'],
    },
    {
      clave: 'decide_estructura', tipo: 'agente', quien: 'design-visual-storyteller', condicion: externaEstructura, ronda: 2,
      entrada: ['fichas_externas', 'estructura'], salida_artefacto: 'estructura', tope_usd: 0.2,
      salida: { esquema: 'resolucion_estructura.v1', reintento_formato: 1 }, valida: ['sin_texto_en_estructura', 'refs_validos'],
    },
    {
      clave: 'decide_imagen', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: externaImagen, ronda: 2,
      entrada: ['fichas_externas', 'visual_direction', 'render'], salida_artefacto: 'respuesta_imagen', tope_usd: 0.1,
      salida: { esquema: 'resolucion_solo.v1', reintento_formato: 1 },
    },
    {
      clave: 'reimagen_prompts', tipo: 'agente', quien: 'design-image-prompt-engineer', condicion: reImagen, ronda: 2,
      entrada: ['visual_direction', 'fichas_externas', 'respuesta_imagen'], salida_artefacto: 'prompts', tope_usd: 0.2,
      salida: { esquema: 'prompts_por_ref.v1', reintento_formato: 1 }, valida: ['refs_validos'],
    },
    { clave: 'reimagen_chequear_prompts', tipo: 'codigo', quien: 'sala', funcion: 'chequear_prompts_ref', condicion: cambioPrompts, ronda: 2, entrada: ['prompts', 'visual_direction'], salida_artefacto: 'prompts_validos', tope_usd: 0 },
    { clave: 'reimagen_imagen', tipo: 'codigo', quien: 'sala', funcion: 'imagen_ref', condicion: cambioPromptsValidos, ronda: 2, entrada: ['prompts_validos'], salida_artefacto: 'imagenes', tope_usd: 0.2 },
    {
      clave: 'reimagen_mirar', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: cambioImagenes, ronda: 2,
      entrada: ['imagenes', 'visual_direction'], salida_artefacto: 'observacion_imagen', tope_usd: 0.2,
      salida: { esquema: 'observacion_imagenes.v1', reintento_formato: 1 }, valida: ['decide_imagen'],
    },
    { clave: 'reimagen_elegir_version', tipo: 'codigo', quien: 'sala', funcion: 'elegir_version_ref', condicion: cambioObservacion, ronda: 2, entrada: ['imagenes', 'observacion_imagen', 'visual_direction'], salida_artefacto: 'imagenes_elegidas', tope_usd: 0 },
    { clave: 'armar_3', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: cambioKit, entrada: ['copy_kit', 'estructura', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render_3', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: cambioArmado, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos_3', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: cambioRender, entrada: ['copy_kit', 'estructura', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega_laminas', condicion: siempre, entrada: ['copy_kit', 'render', 'chequeos', 'imagenes_elegidas'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  indicaciones: {
    marketing_instagram_curator: [
      ...POST_IMG.indicaciones.marketing_instagram_curator,
      regla('Decides la imagen de CADA elemento del kit (identificado por su ref: e01, e02, …) y una sola dirección visual para toda la semana: paleta, motivo y ritmo.', 'codigo:refs_validos'),
    ],
    'content-creator': [
      ...CARRUSEL_IG_V1.indicaciones['content-creator'].filter((r) => !r.regla.startsWith('Entregas el texto base')),
      regla('Escribes TODO texto que aparece en una imagen o en un acompañamiento (titular, texto, llamado, acompañamiento y hashtags de cada elemento, por su ref); nadie más escribe texto.', 'codigo:salida'),
      regla('Una historia se lee en segundos: titular y texto breves, dentro de los topes que fija la sala.', 'codigo:contrato_de_lamina'),
    ],
    'design-visual-storyteller': [
      regla('Entregas solo piezas fijas 9:16; nada de video, animación ni medios interactivos.', 'codigo:salida'),
      regla('Entregas únicamente la ESTRUCTURA de cada elemento (rol, beat, foto_slot, mood, sugerencia_interactiva opcional). No escribes ningún texto que aparezca en la imagen: lo escribe content-creator.', 'guia'),
      regla('El arco, el ritmo, el tono y las emociones los deciden el manual y el brief de este cliente; aquí no hay estructura obligatoria.', 'guia'),
      regla('No uses cifras, porcentajes ni resultados que no estén en el manual, el plan o el brief (ignora los de tu identidad).', 'codigo:chequeos_laminas'),
      regla('Devuelves solo el JSON del contrato.', 'codigo:salida'),
    ],
    'jefe-marketing': [...POST_IMG.indicaciones['jefe-marketing']],
    'design-image-prompt-engineer': [...POST_IMG.indicaciones['design-image-prompt-engineer']],
  },
}
