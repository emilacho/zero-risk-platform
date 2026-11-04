/**
 * 04-nov · FINANZAS SOBRE EL ACTA DE LA MESA (Emilio 18:42Z, opción A: «quita la regla»). Puro.
 * Marketing ya decidió canales y peso: aquí no se reparte. Se pasa el acta a la forma que entiende el cálculo, y se dice si el plan se paga.
 *  · Cualquier canal entra: el que no tiene clave conocida pasa con su nombre. La lista cerrada es de la conversación sin mesa, no de lo que la mesa decide.
 *  · Lo que falta se declara como hueco, no bloquea ni se inventa.
 */
import type { ActaV1, RangoDeCosto } from '../../planeacion/mesa/acta'
import type { Bloque } from '../tipos'
import { especialistasQueHablan } from './omision'
import type { PlanteoV1 } from './esquemas'

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** el nombre que escribió marketing, en la clave que conoce finanzas. Lo que no se reconoce sigue con su nombre: también entra al reparto */
export function claveDeCanal(nombre: string): string {
  const n = sinTildes(nombre)
  if (/whats ?app/.test(n)) return 'whatsapp'
  if (/organic|contenido|comunidad/.test(n)) return nombre.trim()
  if (/busqueda[ _]local|(^|[^a-z])seo([^a-z]|$)|mapas|maps|perfil de google/.test(n)) return 'busqueda_local'
  if (/busqueda|search|ppc|adwords|google[ _]ads|(^|[^a-z])sem([^a-z]|$)/.test(n)) return 'busqueda_pagada'
  if (/influencer/.test(n)) return 'influencers'
  if (/linked ?in|b2b/.test(n)) return 'profesional_b2b'
  if (/you ?tube|video_largo|video largo/.test(n)) return 'video_largo'
  if (/tik ?tok|video_corto|video corto|reels/.test(n)) return 'video_corto'
  if (/(^|[^a-z])meta([^a-z]|$)|meta_|instagram|facebook/.test(n)) return 'meta_ig'
  if (/base_propia|base propia|correo|e-?mail|referid/.test(n)) return 'base_propia'
  return nombre.trim()
}

/** de qué especialista de la mesa sale el costo de cada canal */
const APORTE_DEL_CANAL: Readonly<Record<string, string>> = { meta_ig: 'redes', video_corto: 'redes', video_largo: 'redes', influencers: 'redes', profesional_b2b: 'redes', busqueda_pagada: 'busqueda', busqueda_local: 'seo' }

export interface CanalSinCosto { canal: string; peso: number }
/** el costo por resultado del plan: el de cada canal con costo, ponderado por su peso entre los que lo tienen. Los demás quedan declarados: el total se calcula sin saber lo que cuestan */
export function costoDeLaMesa(canales: Array<{ canal: string; peso: number; activo?: boolean }>, costos: Readonly<Record<string, RangoDeCosto>> | undefined): { rango: RangoDeCosto | null; sin_costo: CanalSinCosto[] } {
  const activos = canales.filter((c) => c.activo !== false && c.peso > 0)
  const con = activos.map((c) => ({ c, r: costos?.[APORTE_DEL_CANAL[c.canal] ?? ''] })).filter((x): x is { c: typeof x.c; r: RangoDeCosto } => !!x.r)
  const sin_costo = activos.filter((c) => !con.some((x) => x.c === c)).map((c) => ({ canal: c.canal, peso: c.peso }))
  const w = con.reduce((s, x) => s + x.c.peso, 0)
  if (!w) return { rango: null, sin_costo }
  const prom = (f: (r: RangoDeCosto) => number) => con.reduce((s, x) => s + f(x.r) * x.c.peso, 0) / w
  return { rango: { min: prom((r) => r.min), max: prom((r) => r.max), base: prom((r) => r.base ?? (r.min + r.max) / 2) }, sin_costo }
}

export interface ExpedienteDelPlanteo { planteo_inicial?: Partial<PlanteoV1> }
/** el planteo sale del acta, sin un agente que vuelva a decidir. Lo que el acta no trae (producción, marca) queda con lo que el cálculo ya declara como sin base */
export function planteoDelActa(acta: ActaV1, expediente: ExpedienteDelPlanteo): Record<string, unknown> {
  const inicial = expediente.planteo_inicial ?? {}
  const porClave = new Map<string, { canal: string; peso: number; activo?: boolean; condicion?: string }>()
  for (const c of acta.canales) {
    const clave = claveDeCanal(c.canal)
    const ya = porClave.get(clave)
    if (!ya) porClave.set(clave, { canal: clave, peso: c.peso, ...(c.activo === false ? { activo: false } : {}), ...(c.condicion ? { condicion: c.condicion } : {}) })
    else if ((ya.activo === false) === (c.activo === false)) ya.peso += c.peso
    else if (c.activo !== false) { ya.peso = c.peso; delete ya.activo; delete ya.condicion }
  }
  const canales = [...porClave.values()]
  const { rango, sin_costo } = costoDeLaMesa(canales, acta.costos_de_la_mesa)
  const huecos = [
    ...(sin_costo.length ? [`sin costo por resultado: ${sin_costo.map((c) => `${c.canal} (${Math.round(c.peso * 100)} %)`).join(', ')}. El total supone que su parte compra resultados al costo de los demás`] : []),
    ...(acta.aportes_que_faltan?.length ? [`no llegó el aporte de: ${acta.aportes_que_faltan.join(', ')}`] : []),
  ]
  return {
    meta_por_semana: acta.numero.meta,
    zonas: inicial.zonas ?? [],
    dias_y_horarios: inicial.dias_y_horarios ?? { dias_activos_por_semana: 7 },
    evento: inicial.evento ?? 'mensaje',
    canales,
    no_se: [...acta.no_se, ...huecos],
    reparto_de_la_mesa: true,
    ...(rango ? { referencia_de_la_mesa: rango } : {}),
    huecos_de_la_mesa: huecos,
    habla: especialistasQueHablan(canales),
  }
}

export interface Viabilidad { no_viable: boolean; motivo: string | null; cifra: number | null }
/**
 * ¿el plan se paga? Lo mide el código, no una opinión: la meta cubre el equilibrio y el costo esperado no pasa el umbral de paro.
 * No bloquea (lo financiero nunca dice «no sale»): `no_viable` le da a la mesa UNA vuelta con el motivo; si vuelve igual, se firma con la alerta. Sin cálculo no hay veredicto: `motivo` lo dice.
 */
export function viabilidadDelBloque(b: Bloque | null | undefined): Viabilidad {
  if (!b) return { no_viable: false, motivo: 'sin cálculo: no se pudo medir', cifra: null }
  if (b.veredictos.base === 'paro') return { no_viable: true, motivo: `el costo esperado por resultado (${b.costos.base}) pasa el umbral de paro con un techo de ${b.techo.por_resultado}`, cifra: b.costos.base }
  if (b.equilibrio.cubre === false) return { no_viable: true, motivo: `la meta de ${b.equilibrio.meta_actual} por semana no paga el plan: el equilibrio está en ${b.equilibrio.meta_de_equilibrio_semana}`, cifra: b.equilibrio.meta_de_equilibrio_semana }
  return { no_viable: false, motivo: null, cifra: null }
}

/** lo que leen el analista y el jefe: la decisión de canales ya está tomada */
export const LA_MESA_YA_DECIDIO = 'La mesa de estrategia de marketing ya decidió canales y peso (ver `acta` en el expediente). No los cambies ni propongas otros: revisa si cuesta lo que dice y si se paga. Si no se paga, dilo con la cifra.'
