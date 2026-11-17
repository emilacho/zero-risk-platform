/**
 * PLANTILLAS DE LA MESA · `carrusel_mesa` y `kit_mesa` · son DATO derivado de las plantillas v1 con jefatura (se siembran INACTIVAS; nada las enciende).
 * Lo que cambia: el trabajo creativo (dirección visual, texto, láminas, estructura) lo hace UN paso `mesa` donde el equipo trabaja sobre un tablero; lo que queda es la cola mecánica de siempre
 * (generar imágenes → observar → elegir → armar → dibujar → chequeos → jefatura → entrega). No hay reglas de forma sobre lo que escribe cada empleado.
 */
import type { Paso, Plantilla } from '../tipos'
import { CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA } from './con-jefatura'

/** el tope de una pieza de la mesa (Emilio, 28-oct): US$ 5 incluyendo jefatura y herramientas; el techo absoluto ×1,2 lo pone la mesa */
export const TOPE_DE_LA_MESA_USD = 5

const CLAVES_QUE_SE_QUEDAN = ['abrir', 'asignar_fotos', 'imagen', 'elegir_version', 'armar', 'render', 'chequeos', 'jefatura', 'armar_2', 'render_2', 'chequeos_2', 'entrega', 'cierre']

function deLaMesa(v1: Plantilla, tipo: 'carrusel_mesa' | 'kit_mesa'): Plantilla {
  const de = (clave: string): Paso => v1.pasos.find((p) => p.clave === clave) as Paso
  const generada = de('imagen').condicion
  const pasos: Paso[] = []
  for (const clave of CLAVES_QUE_SE_QUEDAN) {
    const p = structuredClone(de(clave))
    if (clave === 'asignar_fotos') p.entrada = ['encargo']
    pasos.push(p)
    if (clave === 'asignar_fotos') {
      pasos.push({ clave: 'mesa', tipo: 'codigo', quien: 'sala', funcion: 'mesa', condicion: { tipo: 'siempre' }, entrada: ['candidatas_foto'], salida_artefacto: 'mesa', tope_usd: 0 })
    }
    if (clave === 'imagen') {
      // el observador es de OTRO proveedor y NO participa en la mesa; sin vuelta de regeneración (lo que no pasa el cotejo no se elige y se declara)
      pasos.push({ clave: 'observar', tipo: 'codigo', quien: 'sala', funcion: 'mesa_observar', condicion: generada, entrada: ['imagenes', 'visual_direction'], salida_artefacto: 'observacion_imagen', tope_usd: 0.1 })
    }
  }
  // la mesa produce a la vez los artefactos que antes salían de cuatro pasos de agente: `elegir_version` y `armar` los consumen como siempre
  const imagen = pasos.find((p) => p.clave === 'imagen')!
  imagen.entrada = ['prompts_validos']
  const elegir = pasos.find((p) => p.clave === 'elegir_version')!
  elegir.entrada = ['imagenes', 'observacion_imagen', 'visual_direction']
  return {
    tipo, familia: tipo, clase: v1.clase, pasos,
    limites: {
      ...v1.limites,
      tope_encargo_usd: TOPE_DE_LA_MESA_USD,
      // el margen cubre los turnos de la mesa (≤ 24) además de la cola mecánica
      margen: 50,
      imagenes_generadas_max: 8,
      mesa: true,
    },
    indicaciones: {},
  }
}

export const CARRUSEL_MESA: Plantilla = deLaMesa(CARRUSEL_IG_CON_JEFATURA, 'carrusel_mesa')
/**
 * 17-nov · «creativos en cada paso» (GO Lenovo · firma de Emilio 07:18 · punto 1) · la mesa CORTA de las historias: 3 asientos (dirección visual, prompts, texto) y UNA ronda de aportes.
 * Quien dirige (la dirección creativa) y el portero no son asientos: dirigen o traen material. El tope por pieza es el de siempre (`TOPE_DE_LA_MESA_USD`, techo ×1,2).
 * Ni la jefatura entra a la mesa ni la mesa revisa a otra mesa: la jefatura revisa la PIEZA después, como siempre.
 */
export const ASIENTOS_DE_LA_MESA_CORTA = ['marketing_instagram_curator', 'design-image-prompt-engineer', 'content-creator'] as const
export const RONDAS_DE_LA_MESA_CORTA = 1
/**
 * 17-nov (🟡 1 de CC7 sobre #1088) · lo que la fila VIVA de `kit_historias` tiene y `kit_mesa` también debe tener, con el MISMO valor de hoy (leído en producción):
 * pedir material al portero, generar imagen cuando falta foto, roles sin imagen. Sin esto, con la palanca encendida las historias perderían algo que hoy hacen.
 */
export const DE_LA_LINEA_DE_HISTORIAS = {
  material_activo: true, material_tope_usd: 0.4, material_plazo_min: 20, material_techo_min: 30, material_max_pedidos_por_encargo: 1,
  generar_cuando_no_hay_foto: true, roles_sin_imagen: ['cta', 'cierre'],
} as const
/**
 * las ÚNICAS diferencias permitidas entre los límites de `kit_mesa` y los de `kit_historias` (una prueba las nombra):
 *  · `mesa`, `asientos`, `rondas_de_la_mesa`: es la línea con mesa corta;
 *  · `margen`: la mesa conversa varios turnos (margen de pasos de la mesa, 50);
 *  · `reserva_por_pieza_usd`: sin ese dato el freno de la campaña reserva el tope ENTERO de la mesa (5), que es lo seguro mientras no haya historia de lo que cuesta.
 */
export const DIFERENCIAS_CON_LAS_HISTORIAS = ['mesa', 'asientos', 'rondas_de_la_mesa', 'margen', 'reserva_por_pieza_usd'] as const
const KIT_MESA_BASE = deLaMesa(KIT_HISTORIAS_CON_JEFATURA, 'kit_mesa')
export const KIT_MESA: Plantilla = { ...KIT_MESA_BASE, limites: { ...KIT_MESA_BASE.limites, ...DE_LA_LINEA_DE_HISTORIAS, roles_sin_imagen: [...DE_LA_LINEA_DE_HISTORIAS.roles_sin_imagen], asientos: [...ASIENTOS_DE_LA_MESA_CORTA], rondas_de_la_mesa: RONDAS_DE_LA_MESA_CORTA } }

/**
 * 31-oct · nuevo orden de la cadena · `brief_mesa` y `concepto_mesa`: las dos mesas de la CADENA. Un solo paso `mesa`: no hay imágenes, observador, traductor ni jefatura de pieza;
 * la entrega la hace el propio orquestador de la mesa a la cadena (que valida por código). Topes: brief US$ 1,60 (UN miembro + portero, una ronda); concepto US$ 5,00 PROVISIONAL
 * (dos rondas mínimas; el tope real se fija DESPUÉS del ensayo en seco, M1 de CC3; plazo de la mesa entera 90 min, fuera del barrido de la bandeja). El techo ×1,2 lo pone la mesa.
 * Se siembran ACTIVAS: la palanca por cliente vive en la cadena (`cadena_config.nuevo_orden`).
 */
export const TOPE_DE_LA_MESA_DE_BRIEF_USD = 1.6
/** 17-nov · 5 → 7 (202611170900): un encargo real terminado gastó 6,15 y la mesa corta en 1,2 × tope (= 6 con 5) · ADENDA 08:06 de Lenovo */
export const TOPE_DE_LA_MESA_DE_CONCEPTO_USD = 7
const PASO_DE_LA_MESA: Plantilla['pasos'][number] = { clave: 'mesa', tipo: 'codigo', quien: 'sala', funcion: 'mesa', condicion: { tipo: 'siempre' }, entrada: [], salida_artefacto: 'mesa', tope_usd: 0 }
export const BRIEF_MESA: Plantilla = {
  tipo: 'brief_mesa', familia: 'brief_mesa', clase: 'interna',
  pasos: [{ ...PASO_DE_LA_MESA }],
  limites: { margen: 60, tope_encargo_usd: TOPE_DE_LA_MESA_DE_BRIEF_USD, max_rondas: 1, mesa: true, plazo_mesa_min: 30 },
  indicaciones: {},
}
export const CONCEPTO_MESA: Plantilla = {
  tipo: 'concepto_mesa', familia: 'concepto_mesa', clase: 'interna',
  pasos: [{ ...PASO_DE_LA_MESA }],
  limites: { margen: 60, tope_encargo_usd: TOPE_DE_LA_MESA_DE_CONCEPTO_USD, max_rondas: 2, rondas_minimas: 2, mesa: true, plazo_mesa_min: 90 },
  indicaciones: {},
}

/**
 * 10-nov · `reubicacion_mesa` (GO de Lenovo 18:14Z · camino A aceptado 18:24Z): las filas del calendario que quedaron atrás sin producir. Un solo paso `mesa`, la dirige jefe-marketing,
 * sin miembros ni portero. Tope al máximo razonable (regla de Emilio: límites al máximo): US$ 3,00 por decisión; el gasto real queda en el libro de costos. Plazo de la mesa 30 min.
 * Nace INACTIVA (la migración la siembra con activo=false): encenderla es otro GO.
 */
export const TOPE_DE_LA_MESA_DE_REUBICACION_USD = 3
export const REUBICACION_MESA: Plantilla = {
  tipo: 'reubicacion_mesa', familia: 'reubicacion_mesa', clase: 'interna',
  pasos: [{ ...PASO_DE_LA_MESA }],
  limites: { margen: 60, tope_encargo_usd: TOPE_DE_LA_MESA_DE_REUBICACION_USD, max_rondas: 1, mesa: true, plazo_mesa_min: 30 },
  indicaciones: {},
}

/**
 * 11-nov · `fallidos_mesa` (GO de Lenovo 16:46 Zúrich · decisión de Emilio 16:43): revisa los encargos fallidos que ya gastaron contra los arreglos publicados después del fallo. Un solo paso `mesa`,
 * la dirige jefe-marketing, sin miembros ni portero. Tope US$ 2,00 por revisión; plazo 30 min. Nace INACTIVA (la migración la siembra con activo=false): encenderla es otro GO.
 */
export const TOPE_DE_LA_MESA_DE_FALLIDOS_USD = 2
export const FALLIDOS_MESA: Plantilla = {
  tipo: 'fallidos_mesa', familia: 'fallidos_mesa', clase: 'interna',
  pasos: [{ ...PASO_DE_LA_MESA }],
  limites: { margen: 60, tope_encargo_usd: TOPE_DE_LA_MESA_DE_FALLIDOS_USD, max_rondas: 1, mesa: true, plazo_mesa_min: 30 },
  indicaciones: {},
}
