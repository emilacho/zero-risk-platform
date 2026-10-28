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
    tipo, familia: tipo, pasos,
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
export const KIT_MESA: Plantilla = deLaMesa(KIT_HISTORIAS_CON_JEFATURA, 'kit_mesa')
