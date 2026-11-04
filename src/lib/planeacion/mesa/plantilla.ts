/**
 * LA MESA DE ESTRATEGIA DEL PLAN (DATO sobre el motor de la oficina). Emilio aprobó el armado el 04-nov (17:46–17:57Z): marketing decide estrategia, canales y su peso, una sola vez.
 * Apertura (código) → planteo (el jefe de marketing) → aportes, cada uno en su escritorio y sin leerse entre sí → consolidar (la reunión) → el acta.
 * La clave de cada paso es el `paso` de la llamada: la escena abre la sala de reuniones con `mesa-estrategia-consolida`. Los aportes son trabajo de escritorio.
 * Si finanzas devuelve el plan, se vuelve a consolidar UNA vez, con el mismo paso.
 *
 * QUÉ CUBRE CADA TOPE (punto 1 de la revisión de CC3):
 *   · `limites.tope_encargo_usd` = US$ 3: SOLO esta mesa. La oficina financiera tiene su propio tope de US$ 5 y el plan completo se calcula en US$ 10. Ninguno corta a otro.
 *   · `tope_usd` de cada paso: lo que se reserva para ese turno antes de lanzarlo.
 */
import type { Paso, Plantilla } from '../../oficina/tipos'

export const TOPE_DE_LA_MESA_USD = 3
export const TOPE_DEL_PLAN_COMPLETO_USD = 10
export const PASO_CONSOLIDA = 'mesa-estrategia-consolida'
export const MAX_DEVOLUCIONES = 1

export const INTEGRANTES = {
  jefe: 'jefe-marketing',
  redes: 'paid_media_paid_social_strategist',
  busqueda: 'paid_media_ppc_strategist',
  seo: 'seo-specialist',
  organico: 'social-media-strategist',
  medicion: 'tracking-specialist',
  crecimiento: 'growth-hacker',
} as const

const siempre = { tipo: 'siempre' } as const
const si = (campo: string): Paso['condicion'] => ({ tipo: 'si_artefacto', artefacto: 'planteo', campo, igual: true })
const agente = (clave: string, quien: string, entrada: string[], salida: string, tope: number, condicion: Paso['condicion'], esquema: string): Paso =>
  ({ clave, tipo: 'agente', quien, condicion, entrada, salida_artefacto: salida, tope_usd: tope, ronda: 1, salida: { esquema, reintento_formato: 1 } })
const APORTE = (clave: string, quien: string, condicion: Paso['condicion'] = siempre, tope = 0.4): Paso => agente(`mesa-estrategia-${clave}`, quien, ['expediente', 'planteo'], `aporte_${clave}`, tope, condicion, 'aporte.v1')

const ENTRADA_DE_LA_REUNION = ['expediente', 'planteo', 'aporte_redes', 'aporte_busqueda', 'aporte_seo', 'aporte_organico', 'aporte_medicion', 'aporte_crecimiento', 'devolucion']

export const PLANTILLA_MESA: Plantilla = {
  tipo: 'mesa_estrategia.v1',
  familia: 'mesa_estrategia',
  pasos: [
    { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir_mesa', condicion: siempre, entrada: [], salida_artefacto: 'expediente', tope_usd: 0, ronda: 1 },
    agente('mesa-estrategia-jefe-marketing', INTEGRANTES.jefe, ['expediente'], 'planteo', 0.5, siempre, 'planteo_mesa.v1'),
    APORTE('redes', INTEGRANTES.redes),
    APORTE('busqueda', INTEGRANTES.busqueda, si('habla.busqueda')),
    APORTE('seo', INTEGRANTES.seo, si('habla.seo')),
    APORTE('organico', INTEGRANTES.organico, si('habla.organico')),
    APORTE('medicion', INTEGRANTES.medicion),
    APORTE('crecimiento', INTEGRANTES.crecimiento),
    agente(PASO_CONSOLIDA, INTEGRANTES.jefe, ENTRADA_DE_LA_REUNION, 'acta', 0.7, siempre, 'acta.v1'),
  ],
  limites: { margen: 3, tope_encargo_usd: TOPE_DE_LA_MESA_USD, max_rondas: 1 },
  indicaciones: {},
}

export interface CanalDelPlanteo { canal?: unknown; activo?: unknown }
/** quién opina más allá de los de siempre: lo decide el código con lo que propuso el jefe, sin nombrar clientes. Redes pagas, medición y crecimiento van siempre */
export function quienHablaEnLaMesa(canales: CanalDelPlanteo[], negocio_local: boolean): { busqueda: boolean; seo: boolean; organico: boolean } {
  const nombres = canales.filter((c) => typeof c?.canal === 'string').map((c) => String(c.canal).toLowerCase())
  return {
    busqueda: nombres.some((n) => /busqueda_pagada|search|ppc/.test(n)),
    seo: negocio_local || nombres.some((n) => /busqueda_local|seo|mapas|maps/.test(n)),
    organico: nombres.some((n) => /organic/.test(n)),
  }
}

const SIEMPRE_EN_TUTEO = 'Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin bloques de código), en español y tuteando. Todo el contexto va en este mensaje.'

export const INSTRUCCION_POR_PASO: Record<string, string> = {
  planteo_mesa: `${SIEMPRE_EN_TUTEO}\nEres quien dirige la mesa de estrategia de marketing. Con el manual, los datos y la investigación, propón: objetivo, tesis, audiencia, oferta, y los canales que el objetivo pide con su peso. No fijes montos: eso lo revisa finanzas después. Devuelve {"objetivo", "tesis", "audiencia", "oferta", "canales":[{"canal","peso","razon"}], "negocio_local": true|false, "no_se":[...]}. El peso sale del objetivo del negocio, no de una costumbre de canal.`,
  aporte: `${SIEMPRE_EN_TUTEO}\nEres especialista y opinas de tu parte sobre el planteo del jefe de marketing. Di qué harías y por qué, y qué cambiarías. Si tu canal se paga, da el costo por resultado con un rango y dilo como supuesto. Devuelve {"resumen", "recomendaciones":[{"que","razon"}], "costo_por_resultado"?:{"min","max","base"?}, "alertas":[...]}. Si no tienes base para un costo, no lo pongas: no lo inventes.`,
  acta: `${SIEMPRE_EN_TUTEO}\nConsolidas la reunión: lee los aportes y decide. Di cada canal con su peso y su razón, y lo que no se hace con su porqué: quien escriba el plan no volverá a decidirlo. Si el contexto trae \`devolucion\`, finanzas te devuelve el plan con su motivo: ajusta el reparto o la meta para resolverlo. Devuelve el esquema acta.v1 exacto: {"numero":{"meta":<número>,"por_que"}, "servicio", "audiencia", "oferta", "canales":[{"canal","peso":<0 a 1>,"razon","activo"?,"condicion"?}], "camino", "prueba", "no_se_hace":[{"que","por_que"}], "no_se":[...]}. Los pesos de los canales activos suman 1.`,
}
