/**
 * LA TABLA POR TIPO (`jefatura_grading_policies`, filas de clase `revision`) hecha tipo y plantilla (diseño v4 §4 y §3). Puro.
 * La plantilla de UNA revisión se arma como DATO para el motor de pasos que ya usa la `oficina` (`siguientePaso` / `registrarPaso`, vía `revision-comun`):
 *   revision_fondo → correccion:<dueño> (solo si hay ficha que bloquea Y el tipo tiene re-entrega) → segunda_mirada (GPT ciego) → decision:<dueño> (solo si GPT dejó texto Y el tipo tiene re-entrega) → cierre.
 * Un tipo con `reentrega = 'ninguna'` (brief) NO tiene correccion ni decision: «solo marca» (F17).
 */
import type { Condicion, Paso, Plantilla } from '../../revision-comun'
import { TIPOS_DE_REVISION, type Productor, type TipoDeRevision } from './contrato'

export type Reentrega = 'ninguna' | 'parcial' | 'completa' | 'version_nueva'
export type DestinoDeCierre = 'bandeja' | 'siguiente_paso'

export interface DocumentoContraElQueSeRevisa { clave: string; titulo: string; funcion: string }

export interface PoliticaDeRevision {
  artifact_type: TipoDeRevision
  /** quién revisa el fondo (no fijo a `jefe-marketing`: la columna admite a la `oficina financiera` más adelante); null solo en `manual` (no-circularidad) */
  revisor_fondo: string | null
  revisor_ciego: boolean
  /** NOMBRE de la variable de entorno con el modelo del revisor ciego (nunca el valor) */
  revisor_ciego_modelo_env: string | null
  contra_que: DocumentoContraElQueSeRevisa[]
  productores: Productor[]
  esquema_correccion: string | null
  huecos_pregunta: { que_es?: string; uso?: string } | null
  indicacion_fondo: string | null
  chequeos_previos: string[]
  tope_revision_usd: number
  tope_paso_usd: { revision_fondo?: number; correccion?: number; segunda_mirada?: number; decision?: number }
  destino_cierre: DestinoDeCierre
  reentrega: Reentrega
  is_active: boolean
}

export const TOPE_MAXIMO_DE_REVISION_USD = 10
const TOPES_POR_OMISION = { revision_fondo: 0.2, correccion: 0.2, segunda_mirada: 0.5, decision: 0.2 }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** una fila de la tabla → la política, o el motivo por el que NO sirve (un renglón mal armado no se usa a medias) */
export function politicaDeFila(f: Record<string, unknown>): { ok: true; politica: PoliticaDeRevision } | { ok: false; error: string } {
  const tipo = String(f.artifact_type ?? '')
  if (!(TIPOS_DE_REVISION as readonly string[]).includes(tipo)) return { ok: false, error: `tipo «${tipo}» no es una revisión de la jefatura` }
  if (f.artifact_class !== 'revision') return { ok: false, error: `«${tipo}» no es de clase revision (es ${String(f.artifact_class)}): el cimiento y el contenido de julio no pasan por aquí` }
  if (f.judgment_enabled === true) return { ok: false, error: `«${tipo}»: una revisión nunca vota` }
  if (tipo === 'manual' || !f.revisor_fondo) return { ok: false, error: `«${tipo}» no tiene revisor de fondo (el manual no lo juzga \`jefe-marketing\`: no-circularidad)` }
  const reentrega = String(f.reentrega ?? '')
  if (!['ninguna', 'parcial', 'completa', 'version_nueva'].includes(reentrega)) return { ok: false, error: `«${tipo}»: re-entrega «${reentrega}» no válida` }
  const destino = String(f.destino_cierre ?? '')
  if (destino !== 'bandeja' && destino !== 'siguiente_paso') return { ok: false, error: `«${tipo}»: destino de cierre «${destino}» no válido` }
  const tope = num(f.tope_revision_usd)
  if (tope === null || tope <= 0 || tope > TOPE_MAXIMO_DE_REVISION_USD) return { ok: false, error: `«${tipo}»: tope de revisión ${String(f.tope_revision_usd)} fuera de (0, ${TOPE_MAXIMO_DE_REVISION_USD}]` }
  const productores = Array.isArray(f.productores) ? f.productores.filter((x): x is Productor => esObjeto(x) && typeof x.donde === 'string' && typeof x.agente === 'string') : []
  if (reentrega !== 'ninguna' && productores.length === 0) return { ok: false, error: `«${tipo}»: con re-entrega hace falta al menos un productor` }
  if (reentrega !== 'ninguna' && typeof f.esquema_correccion !== 'string') return { ok: false, error: `«${tipo}»: con re-entrega hace falta el esquema de corrección` }
  const docs = esObjeto(f.contra_que) && Array.isArray(f.contra_que.documentos) ? (f.contra_que.documentos as unknown[]).filter((d): d is DocumentoContraElQueSeRevisa => esObjeto(d) && typeof d.clave === 'string' && typeof d.titulo === 'string') : []
  const topes = esObjeto(f.tope_paso_usd) ? f.tope_paso_usd : {}
  const tp: PoliticaDeRevision['tope_paso_usd'] = {}
  for (const k of ['revision_fondo', 'correccion', 'segunda_mirada', 'decision'] as const) { const v = num(topes[k]); if (v !== null && v >= 0) tp[k] = v }
  return {
    ok: true,
    politica: {
      artifact_type: tipo as TipoDeRevision,
      revisor_fondo: String(f.revisor_fondo),
      revisor_ciego: f.revisor_ciego === true,
      revisor_ciego_modelo_env: typeof f.revisor_ciego_modelo_env === 'string' ? f.revisor_ciego_modelo_env : null,
      contra_que: docs.map((d) => ({ clave: d.clave, titulo: d.titulo, funcion: String(d.funcion ?? '') })),
      productores,
      esquema_correccion: typeof f.esquema_correccion === 'string' ? f.esquema_correccion : null,
      huecos_pregunta: esObjeto(f.huecos_pregunta) ? { ...(typeof f.huecos_pregunta.que_es === 'string' ? { que_es: f.huecos_pregunta.que_es } : {}), ...(typeof f.huecos_pregunta.uso === 'string' ? { uso: f.huecos_pregunta.uso } : {}) } : null,
      indicacion_fondo: typeof f.indicacion_fondo === 'string' ? f.indicacion_fondo : null,
      chequeos_previos: Array.isArray(f.chequeos_previos) ? f.chequeos_previos.map(String) : [],
      tope_revision_usd: tope,
      tope_paso_usd: tp,
      destino_cierre: destino,
      reentrega: reentrega as Reentrega,
      is_active: f.is_active === true,
    },
  }
}

export const topeDelPaso = (p: PoliticaDeRevision, paso: 'revision_fondo' | 'correccion' | 'segunda_mirada' | 'decision'): number => p.tope_paso_usd[paso] ?? TOPES_POR_OMISION[paso]

/** los dueños distintos de la revisión, cada uno con los `donde` que le tocan (`*` = comodín: el único dueño de todo, p. ej. el plan) */
export interface Dueno { agente: string; dondes: string[]; comodin: boolean }
export function duenosDe(productores: Productor[]): Dueno[] {
  const por = new Map<string, Dueno>()
  for (const p of productores) {
    const d = por.get(p.agente) ?? { agente: p.agente, dondes: [], comodin: false }
    if (p.donde === '*') d.comodin = true
    else if (!d.dondes.includes(p.donde)) d.dondes.push(p.donde)
    por.set(p.agente, d)
  }
  return [...por.values()]
}
/** el `donde` con el que se rotula la opinión del revisor ciego para ese dueño (la opinión llega a TODOS los que hicieron algo) */
export const dondeDeLaOpinion = (d: Dueno): string[] => (d.comodin ? ['general'] : d.dondes)

/** ¿el dueño atiende esa ficha? (comodín: cualquier `donde`) */
export const atiende = (d: Dueno, donde: string): boolean => d.comodin || d.dondes.includes(donde)

/** pliega para comparar: minúsculas, sin tildes, espacios recortados */
const plegarTexto = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const escaparRe = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface DondeNormalizado { donde: string; original: string | null; ambiguo: boolean }
/**
 * J6 cuarto · el jefe escribe `donde` LIBRE («texto — etiquetas», «Imagen: composición», «texto, primera línea») y `atiende()` compara EXACTO: la ficha se quedaba sin dueño y sin corrección.
 * Se toma el prefijo antes de « — », «:», «,», «;» o «(» y, si coincide (pliegue de mayúsculas y tildes) con EXACTAMENTE un `donde` de algún dueño, ese es el `donde`; el texto original se
 * conserva (`original`). Si el texto nombra más de un `donde` conocido («texto e imagen») es AMBIGUO: no se adivina y se declara. Con un dueño comodín no hace falta (atiende todo).
 */
export function normalizarDonde(donde: string, duenos: Dueno[]): DondeNormalizado {
  const igual: DondeNormalizado = { donde, original: null, ambiguo: false }
  if (duenos.some((d) => d.comodin)) return igual
  const conocidos = [...new Set(duenos.flatMap((d) => d.dondes))]
  if (conocidos.includes(donde)) return igual
  const f = plegarTexto(donde)
  const cabeza = f.split(/\s+[—–-]\s+|\s*[:;,(]\s*/)[0].trim()
  // lo que dice la cabeza: si nombra MÁS de un `donde` conocido («texto e imagen») es ambiguo y no se adivina
  const nombrados = conocidos.filter((k) => new RegExp(`(^|[^a-z0-9])${escaparRe(plegarTexto(k))}([^a-z0-9]|$)`).test(cabeza))
  if (nombrados.length > 1) return { donde, original: null, ambiguo: true }
  const porCabeza = conocidos.filter((k) => plegarTexto(k) === cabeza)
  if (porCabeza.length === 1) return { donde: porCabeza[0], original: donde, ambiguo: false }
  const porInicio = conocidos.filter((k) => cabeza.startsWith(plegarTexto(k) + ' '))
  if (porInicio.length === 1) return { donde: porInicio[0], original: donde, ambiguo: false }
  return { donde, original: null, ambiguo: false }
}

/** el `id` que el modelo devuelve para una ficha puede venir con corchetes, comillas, comillas invertidas, punto final o en otras mayúsculas: se casa solo si coincide con EXACTAMENTE un id real */
export function casarId(idDelModelo: string, idsReales: string[]): string | null {
  if (idsReales.includes(idDelModelo)) return idDelModelo
  const limpiar = (x: string): string => x.normalize('NFC').toLowerCase().replace(/^[\s`'"“”‘’«»[(]+|[\s`'"“”‘’«»\])\.,;:]+$/g, '')
  const m = idsReales.filter((r) => limpiar(r) === limpiar(idDelModelo))
  return m.length === 1 ? m[0] : null
}

/** el esquema en que responde cada dueño: en la pieza, solo el texto entrega pieza corregida; quien dirige la imagen únicamente responde a la opinión */
export function esquemaDelDueno(p: PoliticaDeRevision, d: Dueno): string {
  const base = p.esquema_correccion ?? 'resolucion_solo.v1'
  if (base === 'resolucion.v1' && !(d.comodin || d.dondes.includes('texto'))) return 'resolucion_solo.v1'
  return base
}

export const CLAVE_DE_CORRECCION = (agente: string) => `correccion:${agente}`
export const CLAVE_DE_DECISION = (agente: string) => `decision:${agente}`

/** la plantilla de UNA revisión: pasos como dato para el motor común */
export function plantillaDePolitica(p: PoliticaDeRevision, productores: Productor[], tope_usd: number): Plantilla {
  const duenos = duenosDe(productores)
  const sinWildcard = (d: Dueno): { donde?: string[] } => (d.comodin ? {} : { donde: d.dondes })
  const conRe = p.reentrega !== 'ninguna'
  const pasos: Paso[] = [
    {
      clave: 'revision_fondo', tipo: 'agente', quien: p.revisor_fondo ?? 'jefe-marketing', condicion: { tipo: 'siempre' }, ronda: 1, entrada: ['revision'], salida_artefacto: 'fichas_jefe',
      tope_usd: topeDelPaso(p, 'revision_fondo'), salida: { esquema: 'fichas.v1', reintento_formato: 1 },
    },
  ]
  if (conRe) {
    for (const d of duenos) {
      const c: Condicion = { tipo: 'si_fichas_abiertas', origen: 'jefe', gravedad: 'bloquea', ...sinWildcard(d) }
      pasos.push({ clave: CLAVE_DE_CORRECCION(d.agente), tipo: 'agente', quien: d.agente, condicion: c, ronda: 1, entrada: ['fichas_jefe', 'revision'], salida_artefacto: 'revision', tope_usd: topeDelPaso(p, 'correccion'), salida: { esquema: esquemaDelDueno(p, d), reintento_formato: 1 } })
    }
  }
  pasos.push({ clave: 'segunda_mirada', tipo: 'externo', quien: 'GPT', condicion: { tipo: 'siempre' }, ronda: 2, entrada: ['revision'], salida_artefacto: 'fichas_externas', tope_usd: topeDelPaso(p, 'segunda_mirada') })
  if (conRe) {
    for (const d of duenos) {
      const c: Condicion = { tipo: 'si_fichas_abiertas', origen: 'externa', ...sinWildcard(d) }
      pasos.push({ clave: CLAVE_DE_DECISION(d.agente), tipo: 'agente', quien: d.agente, condicion: c, ronda: 2, entrada: ['fichas_externas', 'revision'], salida_artefacto: 'revision', tope_usd: topeDelPaso(p, 'decision'), salida: { esquema: esquemaDelDueno(p, d), reintento_formato: 1 } })
    }
  }
  pasos.push({ clave: 'cierre', tipo: 'codigo', quien: 'jefatura', funcion: 'cierre', condicion: { tipo: 'siempre' }, entrada: ['revision'], salida_artefacto: 'cierre', tope_usd: 0 })
  return {
    tipo: p.artifact_type, familia: p.artifact_type, pasos, indicaciones: {},
    limites: { margen: 6, tope_encargo_usd: Math.min(tope_usd, p.tope_revision_usd, TOPE_MAXIMO_DE_REVISION_USD), max_rondas: 2 },
  }
}
