/**
 * PLANTILLA `carrusel_ig_v1` · SALA 2 «carrusel» · es DATO (se siembra INACTIVA en `oficina_tipos_de_grupo`; nada la enciende).
 * Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §2. Mismo motor que la sala 1: lo único nuevo es el vocabulario de FUNCIONES de código y de ESQUEMAS (listas cerradas).
 * Agnóstica: ningún texto nombra a un cliente, un producto ni una ciudad. «ref» de una imagen = el ROL de lámina (hook · problem · …).
 * Dueños de cada hallazgo (donde): texto/hashtags → content-creator · laminas → carousel-designer · imagen → el curador, solo en el paso «mirar».
 */
import type { Condicion, Plantilla, ReglaDeIndicacion } from '../tipos'
import { POST_IMG } from './post-img'

const siempre: Condicion = { tipo: 'siempre' }
const generada: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'hay_generadas', igual: true }
const requiereMirar: Condicion = { tipo: 'si_artefacto', artefacto: 'visual_direction', campo: 'requiere_mirar', igual: true }
const jefeTexto: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', donde: ['texto', 'hashtags'], gravedad: 'bloquea' }
const jefeLaminas: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', donde: 'laminas', gravedad: 'bloquea' }
// la opinión libre del revisor externo llega como UNA ficha `externa` en «texto»: el autor decide qué toma (y si cambia el texto, el diseñador vuelve a recortar)
const externaTexto: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa', donde: 'texto' }
const cambioCopia: Condicion = { tipo: 'si_cambio', artefacto: 'copy_carrusel' }
const cambioPieza: Condicion = { tipo: 'si_cambio', artefacto: ['copy_carrusel', 'laminas'] }
const cambioArmado: Condicion = { tipo: 'si_cambio', artefacto: 'laminas_armadas' }
const cambioRender: Condicion = { tipo: 'si_cambio', artefacto: 'render' }

const regla = (r: string, aplica: string): ReglaDeIndicacion => ({ regla: r, aplica })

export const CARRUSEL_IG_V1: Plantilla = {
  tipo: 'carrusel_ig_v1',
  familia: 'carrusel_ig_v1',
  limites: {
    // 30 pasos definidos; vueltas: prompts (1) + imagen (2) ⇒ margen 3 + 3
    margen: 6,
    tope_encargo_usd: 10,
    max_rondas: 2,
    imagenes_generadas_max: 2,
    versiones_por_ref: 2,
    reuso_dias: 14,
    // una plataforma por encargo; el tamaño lo pone el brazo
    plataforma: 'instagram-feed',
    laminas_min: 5,
    laminas_max: 10,
    // a verificar contra la documentación vigente de cada red antes de bloquear con ellos: mientras `limites_verificados` sea false, el chequeo avisa y no bloquea
    pie_de_foto_max: 2200,
    hashtags_max: 30,
    limites_verificados: false,
    formato_por_omision: '4:5',
  },
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_laminas', condicion: siempre, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
    { clave: 'paquete', tipo: 'portero', quien: 'portero', condicion: siempre, entrada: ['encargo'], salida_artefacto: 'material_portero', tope_usd: 0.06 },
    { clave: 'asignar_fotos', tipo: 'codigo', quien: 'sala', funcion: 'asignar_fotos', condicion: siempre, entrada: ['material_portero'], salida_artefacto: 'candidatas_foto', tope_usd: 0 },
    {
      clave: 'direccion_visual', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: siempre,
      entrada: ['material_portero', 'candidatas_foto'], salida_artefacto: 'visual_direction', tope_usd: 0.25,
      salida: { esquema: 'direccion_imagenes.v1', reintento_formato: 1 }, valida: ['citas_existen', 'refs_validos'],
    },
    {
      clave: 'prompts', tipo: 'agente', quien: 'design-image-prompt-engineer', condicion: generada,
      entrada: ['visual_direction'], salida_artefacto: 'prompts', tope_usd: 0.2,
      salida: { esquema: 'prompts_por_ref.v1', reintento_formato: 1 }, valida: ['refs_validos'],
    },
    {
      // pasan solo los prompts que cubren cada obligatorio y no nombran ningún prohibido, por imagen; si ninguna imagen tiene un prompt válido, UNA repetición del ingeniero
      clave: 'chequear_prompts', tipo: 'codigo', quien: 'sala', funcion: 'chequear_prompts_ref', condicion: generada,
      entrada: ['prompts', 'visual_direction'], salida_artefacto: 'prompts_validos', tope_usd: 0,
      vuelve_a: { paso: 'prompts', max: 1, si: { tipo: 'si_artefacto', artefacto: 'prompts_validos', campo: 'ninguno', igual: true } },
    },
    { clave: 'imagen', tipo: 'codigo', quien: 'sala', funcion: 'imagen_ref', condicion: generada, entrada: ['prompts_validos'], salida_artefacto: 'imagenes', tope_usd: 0.2 },
    {
      // el curador SOLO describe; el código decide contra obligatorio/prohibido; si falla y se puede regenerar: vuelve a `imagen` (≤ 2 veces)
      clave: 'mirar', tipo: 'agente', quien: 'marketing_instagram_curator', condicion: requiereMirar,
      entrada: ['imagenes', 'visual_direction'], salida_artefacto: 'observacion_imagen', tope_usd: 0.2,
      salida: { esquema: 'observacion_imagenes.v1', reintento_formato: 1 }, valida: ['decide_imagen'],
      vuelve_a: { paso: 'imagen', max: 2, si: { tipo: 'si_artefacto', artefacto: 'observacion_imagen', campo: 'veredicto.regenerar', igual: true } },
    },
    { clave: 'elegir_version', tipo: 'codigo', quien: 'sala', funcion: 'elegir_version_ref', condicion: siempre, entrada: ['imagenes', 'observacion_imagen', 'visual_direction'], salida_artefacto: 'imagenes_elegidas', tope_usd: 0 },
    {
      clave: 'texto', tipo: 'agente', quien: 'content-creator', condicion: siempre,
      entrada: ['material_portero', 'visual_direction', 'imagenes_elegidas'], salida_artefacto: 'copy_carrusel', tope_usd: 0.22,
      salida: { esquema: 'copy_base.v1', reintento_formato: 1 },
    },
    {
      clave: 'laminas', tipo: 'agente', quien: 'carousel-designer', condicion: siempre,
      entrada: ['copy_carrusel', 'visual_direction', 'imagenes_elegidas'], salida_artefacto: 'laminas', tope_usd: 0.5,
      salida: { esquema: 'laminas.v1', reintento_formato: 1 }, valida: ['texto_laminas_en_copy', 'contrato_de_lamina'],
    },
    { clave: 'armar', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: siempre, entrada: ['copy_carrusel', 'laminas', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: siempre, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: siempre, entrada: ['copy_carrusel', 'laminas', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revision_jefe', tipo: 'agente', quien: 'jefe-marketing', condicion: siempre, ronda: 1,
      entrada: ['copy_carrusel', 'laminas', 'render', 'chequeos'], salida_artefacto: 'fichas_jefe', tope_usd: 0.22,
      salida: { esquema: 'fichas.v1', reintento_formato: 1 },
    },
    {
      clave: 'corrige_texto', tipo: 'agente', quien: 'content-creator', condicion: jefeTexto, ronda: 1,
      entrada: ['fichas_jefe', 'copy_carrusel'], salida_artefacto: 'copy_carrusel', tope_usd: 0.25,
      salida: { esquema: 'resolucion_copy_base.v1', reintento_formato: 1 },
    },
    {
      // si el autor cambió el texto, el diseñador vuelve a recortar las láminas de ESE texto (y atiende de paso los hallazgos de lámina)
      clave: 'ajusta_laminas', tipo: 'agente', quien: 'carousel-designer', condicion: cambioCopia, ronda: 1,
      entrada: ['fichas_jefe', 'copy_carrusel', 'laminas'], salida_artefacto: 'laminas', tope_usd: 0.5,
      salida: { esquema: 'resolucion_laminas.v1', reintento_formato: 1 }, valida: ['texto_laminas_en_copy', 'contrato_de_lamina'],
    },
    {
      clave: 'corrige_laminas', tipo: 'agente', quien: 'carousel-designer', condicion: jefeLaminas, ronda: 1,
      entrada: ['fichas_jefe', 'copy_carrusel', 'laminas'], salida_artefacto: 'laminas', tope_usd: 0.5,
      salida: { esquema: 'resolucion_laminas.v1', reintento_formato: 1 }, valida: ['texto_laminas_en_copy', 'contrato_de_lamina'],
    },
    { clave: 'armar_2', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: cambioPieza, entrada: ['copy_carrusel', 'laminas', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render_2', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: cambioArmado, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos_2', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: cambioRender, entrada: ['copy_carrusel', 'laminas', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    {
      clave: 'revisor_externo', tipo: 'externo', quien: 'GPT', condicion: siempre, ronda: 2,
      entrada: ['copy_carrusel', 'laminas', 'render', 'visual_direction', 'material_portero'], salida_artefacto: 'fichas_externas', tope_usd: 0.6,
      salida: { esquema: 'opinion_libre.v1', reintento_formato: 0 },
    },
    {
      clave: 'decide_texto', tipo: 'agente', quien: 'content-creator', condicion: externaTexto, ronda: 2,
      entrada: ['fichas_externas', 'copy_carrusel'], salida_artefacto: 'copy_carrusel', tope_usd: 0.25,
      salida: { esquema: 'resolucion_copy_base.v1', reintento_formato: 1 },
    },
    {
      clave: 'ajusta_laminas_2', tipo: 'agente', quien: 'carousel-designer', condicion: cambioCopia, ronda: 2,
      entrada: ['fichas_externas', 'copy_carrusel', 'laminas'], salida_artefacto: 'laminas', tope_usd: 0.5,
      salida: { esquema: 'resolucion_laminas.v1', reintento_formato: 1 }, valida: ['texto_laminas_en_copy', 'contrato_de_lamina'],
    },
    { clave: 'armar_3', tipo: 'codigo', quien: 'sala', funcion: 'armar_laminas', condicion: cambioPieza, entrada: ['copy_carrusel', 'laminas', 'imagenes_elegidas'], salida_artefacto: 'laminas_armadas', tope_usd: 0 },
    { clave: 'render_3', tipo: 'codigo', quien: 'sala', funcion: 'render_laminas', condicion: cambioArmado, entrada: ['laminas_armadas'], salida_artefacto: 'render', tope_usd: 0 },
    { clave: 'chequeos_3', tipo: 'codigo', quien: 'sala', funcion: 'chequeos_laminas', condicion: cambioRender, entrada: ['copy_carrusel', 'laminas', 'laminas_armadas', 'render', 'imagenes_elegidas', 'observacion_imagen'], salida_artefacto: 'chequeos', tope_usd: 0 },
    { clave: 'entrega', tipo: 'codigo', quien: 'sala', funcion: 'empaquetar_entrega_laminas', condicion: siempre, entrada: ['copy_carrusel', 'render', 'chequeos', 'imagenes_elegidas'], salida_artefacto: 'entrega', tope_usd: 0 },
    { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: siempre, entrada: ['entrega'], salida_artefacto: 'cierre', tope_usd: 0 },
  ],
  indicaciones: {
    marketing_instagram_curator: [
      ...POST_IMG.indicaciones.marketing_instagram_curator,
      regla('Asignas las imágenes por ROL de lámina (hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre), no por número de lámina.', 'codigo:refs_validos'),
    ],
    'content-creator': [
      ...POST_IMG.indicaciones['content-creator'].filter((r) => !r.regla.startsWith('Entregas el pie de foto')),
      regla('Entregas el texto base de la pieza, el pie de foto y los hashtags en campos aparte; el texto de cada lámina lo recorta el diseñador LITERALMENTE de lo que escribiste, así que escribe ahí todo lo que irá en las láminas.', 'codigo:texto_laminas_en_copy'),
    ],
    'carousel-designer': [
      regla('Armas UNA plataforma por encargo, la que te indica la sala; el tamaño y la plataforma los pone la sala y lo que escribas sobre ellos se ignora.', 'codigo:salida'),
      regla('La dirección visual te llega del curador, no de creative-director (la frase de tu identidad no se edita; esta línea gana por orden).', 'guia'),
      regla('La familia de verbos del llamado a la acción y el registro los dicta el manual del cliente (tu identidad ejemplifica con un registro: ignóralo).', 'codigo:chequeos_laminas'),
      regla('No escribes texto nuevo: recortas LITERALMENTE el texto del autor; cada titular, texto o llamado de una lámina debe ser un trozo exacto de lo que escribió content-creator.', 'codigo:texto_laminas_en_copy'),
      regla('Lo que no puedas resolver se declara en `necesito`; nunca preguntas al cliente (las preguntas abiertas se descartan). Devuelves solo el JSON de tu contrato.', 'codigo:salida'),
    ],
    'jefe-marketing': [
      ...POST_IMG.indicaciones['jefe-marketing'],
    ],
    'design-image-prompt-engineer': [
      ...POST_IMG.indicaciones['design-image-prompt-engineer'],
    ],
  },
}
