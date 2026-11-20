/**
 * 20-nov · EL SEGUNDO DOCTOR CREATIVO de la pieza (PLAN v3 de CC4 · aclaración de Emilio 11:56–11:59 Zúrich, LENOVO 11:00Z · 🟢 CC7 y 🟢 condicionado CC6).
 *  · GPT opina sobre lo VISUAL y lo CREATIVO de la pieza (color, luz, composición, ritmo, tono, la idea). NO busca errores de información: esos se arreglan en el paso que los causó.
 *  · Si igual ve un dato equivocado, lo pone aparte en `datos` con el paso de donde cree que viene: es diagnóstico para la corrida (CC7), NUNCA llega al creativo.
 *  · Juzgar es de GPT (qué ve, por qué, de dónde viene); el código solo VERIFICA EXACTO: que la cita exista en la fuente que GPT recibió y que la parte que nombra exista en la versión A.
 *    «cita_encontrada» quiere decir que la frase existe, NO que pruebe lo que GPT dice (punto 5 de CC6).
 * Puro: sin red ni base.
 */
import { createHash } from 'node:crypto'
import type { ContextoDelRevisor } from '../../revision-comun'

/** el bloque del informe, entre marcas (como el bloque de resolución del plan) */
export const MARCA_DE_INICIO_DEL_INFORME = '<<<INFORME_CREATIVO>>>'
export const MARCA_DE_FIN_DEL_INFORME = '<<<FIN_INFORME_CREATIVO>>>'

/** regla de la cita (condición 1 de CC7): lo más corto que esto no cuenta como cita, aunque aparezca */
export const PALABRAS_MINIMAS_DE_UNA_CITA = 6
export const CARACTERES_MINIMOS_DE_UNA_CITA = 30

/** DATO · ¿la sola opinión de GPT hace volver la pieza a la mesa? Apagado = (b): viaja solo si la pieza ya vuelve por otra cosa (sin gasto extra).
 *  La pregunta (A) es de Emilio (casi duplica el costo de cada pieza, dato de CC7): se enciende SOLO con su firma, cambiando este dato. */
export const LA_OPINION_SOLA_HACE_VOLVER = false

/** el texto honesto que acompaña la opinión al creativo (ADENDA 2 · Emilio): sin firma ni peso */
export const TEXTO_HONESTO_AL_CREATIVO = 'Esto es una opinión extra que puede ayudarte a mejorar tu trabajo; tómala o déjala. Anota en una línea qué hiciste con cada una.'

/** lo que se le pide a GPT (la mirada creativa + el formato del informe). La pregunta D3 de siempre va antes; esto la acota a lo creativo */
export const PEDIDO_CREATIVO = [
  '## Tu mirada en esta revisión: creativa y visual',
  'Eres el segundo doctor CREATIVO de esta pieza. Opina sobre lo visual y lo creativo: color, luz, composición, encuadre, ritmo, tono, la idea y cómo se cuenta.',
  'Ejemplos del tipo de observación que sirve: «el color está muy liviano»; «es atardecer, el sol debería estar más bajo».',
  'NO revises datos, precios, platos ni hechos: eso ya lo revisaron antes. Si igual ves un dato que te parece equivocado, ponlo aparte en "datos" y di de qué paso crees que viene (por ejemplo: brief, gran idea, guion, propuestas, render, manual, foto); no lo mezcles con lo creativo.',
  'Si una observación se apoya en un documento (el manual, la ficha, el brief, el plan), contrasta: ¿dónde dice esto? Copia la frase TAL CUAL está en el documento, en "cita", y en "fuente" el título del documento tal como aparece arriba (después de «### »). Si no se apoya en un documento, deja "cita" y "fuente" vacíos: es tu mirada, y está bien.',
  'En "parte" di qué parte de la pieza toca: copia el texto de la pieza tal cual, o escribe «imagen 1», «imagen 2»… según el orden de las imágenes que recibiste.',
  `Responde con tu lectura en texto libre y, AL FINAL, este bloque exacto:\n${MARCA_DE_INICIO_DEL_INFORME}\n{"observaciones":[{"que":"…","por_que":"…","parte":"…","fuente":"","cita":""}],"datos":[{"que":"…","paso_de_origen":"…","parte":"…"}]}\n${MARCA_DE_FIN_DEL_INFORME}`,
].join('\n')

// ───────────────────────── la regla de comparación (verificar exacto = código)
/**
 * La MISMA normalización en la cita y en el original (condición 1 de CC7, sabotajes de CC6 paso por paso):
 * sin tildes ni diéresis (NFD sin marcas) · minúsculas · comillas tipográficas → rectas y luego ninguna · guiones largos → guion · todo espacio o salto seguido → un espacio · sin bordes.
 */
export function normalizarParaCitar(t: string): string {
  return String(t ?? '')
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[«»“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'")
    .replace(/["'`]/g, '')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export type EstadoDeLaCita = 'cita_encontrada' | 'no_encontrada' | 'corta' | 'sin_verificar' | 'sin_cita'
/** ¿la cita (ya normalizada su regla) está en ese original? Lo corto no cuenta aunque aparezca */
export function estadoDeLaCita(cita: string, original: string): Exclude<EstadoDeLaCita, 'sin_verificar' | 'sin_cita'> {
  const c = normalizarParaCitar(cita)
  if (c.split(' ').filter(Boolean).length < PALABRAS_MINIMAS_DE_UNA_CITA || c.length < CARACTERES_MINIMOS_DE_UNA_CITA) return 'corta'
  return normalizarParaCitar(original).includes(c) ? 'cita_encontrada' : 'no_encontrada'
}

export const huella = (t: string): string => createHash('sha256').update(String(t ?? ''), 'utf8').digest('hex')

// ───────────────────────── el informe
export type EstadoDeLaParte = 'encontrada' | 'no_encontrada' | 'corta' | 'imagen' | 'imagen_inexistente' | 'sin_parte'
export interface ParteQueToca { texto: string; estado: EstadoDeLaParte; imagen?: { n: number; url: string } }
export interface ObservacionCreativa { id: string; que: string; por_que: string; parte: ParteQueToca; fuente: string | null; cita: string | null; estado_de_la_cita: EstadoDeLaCita }
export interface DatoDeInformacion { que: string; paso_de_origen: string; parte: ParteQueToca }
export interface InformeCreativo {
  /** el bloque se pudo leer; si no, todo el texto quedó como UNA observación creativa sin cita (nada frena) */
  legible: boolean
  observaciones: ObservacionCreativa[]
  /** errores de información que vio GPT: diagnóstico para la corrida, NUNCA al creativo */
  datos: DatoDeInformacion[]
}
export interface MaterialDelDoctor {
  /** los documentos TAL CUAL fueron en el pedido a GPT (la cita se busca aquí, no en otra lectura: CC6 4 · CC7 detalle a) */
  contexto: ContextoDelRevisor[]
  /** la versión A de la pieza (la que leyó GPT) */
  version_a: string
  /** las imágenes que recibió GPT, en orden (imagen 1 = la primera) */
  imagenes: string[]
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** la parte que toca: «imagen n» existe entre las que recibió GPT (CC6 7); un texto se busca en la versión A con la misma regla (CC7 detalle b) */
export function parteQueToca(parte: string, m: Pick<MaterialDelDoctor, 'version_a' | 'imagenes'>): ParteQueToca {
  const p = texto(parte)
  if (!p) return { texto: '', estado: 'sin_parte' }
  const im = /^(?:la\s+)?(?:imagen|foto)\s*(?:n[.ºo°]?\s*)?(\d{1,2})$/iu.exec(normalizarParaCitar(p))
  if (im) {
    const n = Number(im[1])
    return n >= 1 && n <= m.imagenes.length ? { texto: p, estado: 'imagen', imagen: { n, url: m.imagenes[n - 1] } } : { texto: p, estado: 'imagen_inexistente' }
  }
  const e = estadoDeLaCita(p, m.version_a)
  return { texto: p, estado: e === 'cita_encontrada' ? 'encontrada' : e }
}

/** la cita se busca SOLO en la fuente que nombra (por su título, normalizado igual); una fuente que no está entre las enviadas ⇒ no_encontrada; una foto ⇒ sin_verificar */
export function verificarCita(fuente: string, cita: string, m: Pick<MaterialDelDoctor, 'contexto'>): EstadoDeLaCita {
  const c = texto(cita)
  if (!c) return 'sin_cita'
  const f = normalizarParaCitar(fuente)
  if (/^(?:la\s+)?(?:imagen|foto)\b/u.test(f)) return 'sin_verificar'
  const doc = m.contexto.find((d) => normalizarParaCitar(d.titulo) === f)
  if (!doc) return estadoDeLaCita(c, '') === 'corta' ? 'corta' : 'no_encontrada'
  return estadoDeLaCita(c, doc.texto)
}

/** saca el bloque del informe; sin él (o ilegible) ⇒ null */
function bloqueDelInforme(t: string): Record<string, unknown> | null {
  const i = t.lastIndexOf(MARCA_DE_INICIO_DEL_INFORME)
  if (i < 0) return null
  // lo que va entre las dos marcas (sin la de cierre, hasta el final): no se recorta nada del informe
  const [entreMarcas] = t.substring(i + MARCA_DE_INICIO_DEL_INFORME.length).split(MARCA_DE_FIN_DEL_INFORME)
  const crudo = entreMarcas.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    const v = JSON.parse(crudo) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

/** lee lo que contestó GPT. Nunca frena: un bloque ilegible deja el texto entero como UNA observación creativa sin cita */
export function leerInformeCreativo(respuesta: string, m: MaterialDelDoctor): InformeCreativo {
  const t = String(respuesta ?? '')
  const b = bloqueDelInforme(t)
  const obs = b && Array.isArray(b.observaciones) ? b.observaciones : null
  if (!b || !obs) {
    const solo = t.split(MARCA_DE_INICIO_DEL_INFORME)[0].trim()
    return { legible: false, observaciones: solo ? [{ id: 'O1', que: solo, por_que: '', parte: { texto: '', estado: 'sin_parte' }, fuente: null, cita: null, estado_de_la_cita: 'sin_cita' }] : [], datos: [] }
  }
  const observaciones: ObservacionCreativa[] = []
  for (const o of obs) {
    if (!o || typeof o !== 'object') continue
    const x = o as Record<string, unknown>
    const que = texto(x.que)
    if (!que) continue
    const fuente = texto(x.fuente), cita = texto(x.cita)
    observaciones.push({ id: `O${observaciones.length + 1}`, que, por_que: texto(x.por_que), parte: parteQueToca(texto(x.parte), m), fuente: fuente || null, cita: cita || null, estado_de_la_cita: verificarCita(fuente, cita, m) })
  }
  const datos: DatoDeInformacion[] = (Array.isArray(b.datos) ? b.datos : []).flatMap((d) => {
    if (!d || typeof d !== 'object') return []
    const x = d as Record<string, unknown>
    const que = texto(x.que)
    return que ? [{ que, paso_de_origen: texto(x.paso_de_origen) || 'sin decir', parte: parteQueToca(texto(x.parte), m) }] : []
  })
  return { legible: true, observaciones, datos }
}

// ───────────────────────── al creativo de la mesa (sin firma ni peso) · y su respuesta
/** una línea por observación: lo que ve, por qué, la parte y, si la hay, la cita. Sin decir quién ni cuánto pesa. `datos` NUNCA entra aquí */
export function lineaParaElCreativo(o: ObservacionCreativa): string {
  const parte = o.parte.estado === 'sin_parte' ? '' : ` · en: ${o.parte.texto}`
  const cita = o.cita && o.estado_de_la_cita === 'cita_encontrada' ? ` · ${o.fuente}: «${o.cita}»` : ''
  return `[${o.id}] ${o.que}${o.por_que ? ` — ${o.por_que}` : ''}${parte}${cita}`
}

/** el bloque que viaja en la vuelta a la mesa (vacío si no hay observaciones) */
export function bloqueParaElCreativo(obs: ObservacionCreativa[]): string[] {
  if (!obs.length) return []
  return [
    TEXTO_HONESTO_AL_CREATIVO,
    ...obs.map(lineaParaElCreativo),
    'Responde cada una [O…] en una línea aparte, al final de tu integración: «RESPUESTA A LA JEFATURA O1: tomada», «RESPUESTA A LA JEFATURA O1: tomada en parte: <qué hiciste>» o «RESPUESTA A LA JEFATURA O1: no tomada: <por qué>». Esas líneas no salen en la pieza.',
  ]
}

// ───────────────────────── el resumen para medir (CC7 4 · CC6 3)
export interface ResumenDelDoctor {
  observaciones: number
  citas_encontradas: number
  partes_encontradas: number
  datos: number
  /** el modelo que contestó de verdad (de la respuesta del proveedor); null si no lo dijo */
  modelo_efectivo: string | null
  /** false si contestó un modelo de Anthropic: «la segunda mirada no fue de otro proveedor» */
  otro_proveedor: boolean | null
}
export const esDeAnthropic = (modelo: string | null): boolean => !!modelo && /claude|anthropic|sonnet|opus|haiku/i.test(modelo)
export function resumenDelDoctor(inf: InformeCreativo, modelo_efectivo: string | null): ResumenDelDoctor {
  return {
    observaciones: inf.observaciones.length,
    citas_encontradas: inf.observaciones.filter((o) => o.estado_de_la_cita === 'cita_encontrada').length,
    partes_encontradas: inf.observaciones.filter((o) => o.parte.estado === 'encontrada' || o.parte.estado === 'imagen').length,
    datos: inf.datos.length,
    modelo_efectivo,
    otro_proveedor: modelo_efectivo ? !esDeAnthropic(modelo_efectivo) : null,
  }
}
