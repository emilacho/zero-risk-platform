/**
 * EL VALIDADOR DE FORMA DEL PLAN DE 90 DÍAS · 31-oct · T1 «lo afectado por la auditoría» (plan v3 firmado por CC#3) · CC#1.
 *
 * Qué mira (y SOLO esto · la forma, no el fondo): que el plan que volvió del redactor tenga
 *   F1 · un calendario con las semanas FECHADAS (o fases con días «de–a»): sin eso la cadena no puede poner una sola pieza en el tiempo;
 *   F2 · una META con cifra POR SEMANA: sin eso nadie puede medir si el plan cumple;
 *   F3 · al menos un CANAL nombrado: sin eso no hay dónde publicar;
 *   F4 · ninguna cifra terminada en «,77»: son los centinelas de los ejemplos del documento de referencia; si aparecen, el redactor copió en vez de calcular.
 * Lo que NO mira: fondo, fuentes, topes internos, personas, moneda, colores (eso lo hace el chequeo P1–P10 del nodo «¿Llegó la vuelta?» y la jefatura).
 *
 * Contrato (propuesto a CC#2 el 31-oct · lo consume el flujo de planeación):
 *   `{ ok: true, hallazgos: [] , correccion: null }` o `{ ok: false, hallazgos: [{ que, donde }], correccion: '<texto que se pega al pedido del reintento>' }`.
 *   El reintento (1) → `fallo` → alerta en #alertas + `necesita_humano` los hace el FLUJO con esta respuesta; aquí no se llama a ningún modelo (US$ 0).
 * Agnóstico: ningún nombre, ciudad ni rubro de un cliente; las listas de canales son las redes canónicas + los canales directos genéricos.
 */

export interface HallazgoDeForma { que: string; donde: string }
export interface ResultadoDeForma { ok: boolean; hallazgos: HallazgoDeForma[]; correccion: string | null }
export interface OpcionesDeForma { /** semanas que debe fechar el calendario (por omisión 12) */ semanas?: number }

export const SEMANAS_DEL_PLAN = 12
/** un plan de 90 días de verdad no cabe en menos que esto (el real de 12-oct mide ~35.000 caracteres) */
export const LARGO_MINIMO = 1500

/** canales que el plan puede nombrar: redes canónicas (Instagram · Facebook · TikTok · LinkedIn · YouTube) + canales directos genéricos */
export const CANALES = [
  'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'google ads', 'google maps', 'búsqueda', 'busqueda', 'correo', 'email', 'newsletter', 'sms', 'pinterest', 'telegram', 'twitter', 'meta ads', 'anuncios',
] as const

const RE_ENCABEZADO = /^#{1,4}\s+(.+?)\s*$/
const RE_SEPARADOR_DE_TABLA = /^\|?[\s:|\-–—]+\|?$/
/** un período: «14-20 oct» · «28 oct - 3 nov» · «2026-10-14» · «días 1–30» · «del 1 al 7» */
const RE_PERIODO = /\d{1,2}\s*(?:[-–—]|al?\b|hasta)\s*\d{1,2}|\d{1,2}\s*(?:de\s+)?[a-záéíóú]{3,}\.?\b|\d{4}-\d{2}-\d{2}|d[ií]as?\s*\d/i
/** una fase con días: «Fase 2 · días 31–60» · «fase de arranque (días 1 a 30)» */
const RE_FASE_CON_DIAS = /\bfase\b[^\n]{0,80}?d[ií]as?\s*\d{1,3}\s*(?:[-–—]|al?\b|hasta)\s*\d{1,3}|d[ií]as?\s*\d{1,3}\s*(?:[-–—]|al?\b|hasta)\s*\d{1,3}[^\n]{0,80}?\bfase\b/gi
/** «Semana 3 · 28 oct - 3 nov» fuera de una tabla */
const RE_SEMANA_FECHADA = /\b(?:semana|sem\.?)\s*(\d{1,2})\b[^\n|]{0,60}?(?:\d{1,2}\s*(?:[-–—]|al?\b|hasta)\s*\d{1,2}\s*(?:de\s+)?[a-záéíóú]{3,}|\d{1,2}\s+(?:de\s+)?[a-záéíóú]{3,}\s*(?:[-–—]|al?\b)|\d{4}-\d{2}-\d{2}|d[ií]as?\s*\d{1,3}\s*(?:[-–—]|al?\b)\s*\d{1,3})/gi
/** la meta con cifra por semana: «meta … por semana: 15» · «15 pedidos por semana … meta» (misma ventana corta) */
const RE_META_POR_SEMANA = /\bmetas?\b[\s\S]{0,400}?(?:por semana|semanal(?:es)?|a la semana|cada semana|\/\s*sem(?:ana)?\b)[^\n]{0,60}?\d|(?:por semana|semanal(?:es)?|a la semana|cada semana|\/\s*sem(?:ana)?\b)[^\n]{0,60}?\d[\s\S]{0,200}?\bmetas?\b|\d[^\n]{0,40}?(?:por semana|semanal(?:es)?|a la semana|cada semana)[\s\S]{0,200}?\bmetas?\b/i
/** las cifras centinela del documento de referencia: todo dinero de los ejemplos termina en ,77 */
const RE_CENTINELA = /\d,77(?![\d])/g

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** el encabezado de markdown más cercano por encima de la posición `i` (para decir DÓNDE está el hallazgo) */
export function seccionDe(texto: string, i: number): string {
  const antes = texto.slice(0, Math.max(0, i)).split('\n')
  for (let k = antes.length - 1; k >= 0; k--) {
    const m = RE_ENCABEZADO.exec(antes[k].trim())
    if (m) return m[1].replace(/[*_`]/g, '').trim().slice(0, 80)
  }
  return 'inicio del plan'
}

/** cuántas semanas distintas trae el calendario con un período al lado (filas de tabla «| N | período |» o líneas «Semana N · período») */
export function semanasFechadas(texto: string): number {
  const semanas = new Set<number>()
  const lineas = texto.split('\n').map((l) => l.trim())
  lineas.forEach((l, i) => {
    if (l.charAt(0) !== '|' || RE_SEPARADOR_DE_TABLA.test(l)) return
    if (i + 1 < lineas.length && RE_SEPARADOR_DE_TABLA.test(lineas[i + 1]) && /-/.test(lineas[i + 1])) return // la fila de encabezados
    const celdas = l.split('|').map((c) => c.trim())
    if (celdas[0] === '') celdas.shift()
    if (celdas.length < 2) return
    const n = /^(?:sem(?:ana)?\.?\s*)?(\d{1,2})$/i.exec(celdas[0])
    if (!n) return
    const periodo = celdas.slice(1, 3).some((c) => RE_PERIODO.test(c))
    if (periodo) semanas.add(Number(n[1]))
  })
  let m: RegExpExecArray | null
  const re = new RegExp(RE_SEMANA_FECHADA.source, RE_SEMANA_FECHADA.flags)
  while ((m = re.exec(texto)) !== null) semanas.add(Number(m[1]))
  return semanas.size
}

/** cuántas fases con días «de–a» nombra el plan */
export function fasesConDias(texto: string): number {
  const re = new RegExp(RE_FASE_CON_DIAS.source, RE_FASE_CON_DIAS.flags)
  let n = 0
  while (re.exec(texto) !== null) n++
  return n
}

/** los canales que el plan nombra (sin tildes, en minúsculas; cada uno una vez) */
export function canalesNombrados(texto: string): string[] {
  const t = sinTildes(texto.toLowerCase())
  const out: string[] = []
  for (const c of CANALES) {
    const re = new RegExp('(^|[^a-z0-9])' + sinTildes(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])')
    if (re.test(t) && !out.includes(c)) out.push(c)
  }
  return out
}

/** las cifras centinela «,77» con la sección donde están (hasta `max`) */
export function cifrasCentinela(texto: string, max = 4): Array<{ cifra: string; donde: string }> {
  const out: Array<{ cifra: string; donde: string }> = []
  const re = new RegExp(RE_CENTINELA.source, RE_CENTINELA.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null && out.length < max) {
    const desde = Math.max(0, m.index - 12)
    const cifra = texto.slice(desde, m.index + m[0].length).replace(/\s+/g, ' ').trim()
    out.push({ cifra: /[\d.,$€£]/.test(cifra.charAt(0)) ? cifra : cifra.replace(/^[^\d$€£]*/, ''), donde: seccionDe(texto, m.index) })
  }
  return out
}

/** el texto que se pega al pedido del reintento (una sola corrección; el flujo decide después del reintento) */
export function correccionDeForma(hallazgos: HallazgoDeForma[]): string | null {
  if (!hallazgos.length) return null
  return [
    '# CORRECCIÓN DE FORMA (única)',
    'Tu plan anterior falló estos chequeos de FORMA. Corrige SOLO esto, sin rehacer lo demás, sin acortarlo y sin cambiar lo que ya estaba bien:',
    ...hallazgos.map((h, i) => `${i + 1}. [${h.donde}] ${h.que}`),
    'Devuelve el plan COMPLETO corregido, en el mismo idioma y con el mismo trato que el manual del cliente fija.',
  ].join('\n')
}

/** la forma del plan: F1 calendario fechado o fases con días · F2 meta con cifra por semana · F3 un canal nombrado · F4 sin cifras «,77» */
export function validarFormaDelPlan(texto: unknown, opciones: OpcionesDeForma = {}): ResultadoDeForma {
  const semanas = Number.isInteger(opciones.semanas) && (opciones.semanas as number) > 0 ? (opciones.semanas as number) : SEMANAS_DEL_PLAN
  const t = typeof texto === 'string' ? texto.replace(/\r\n?/g, '\n') : ''
  const hallazgos: HallazgoDeForma[] = []
  if (t.trim().length < LARGO_MINIMO) {
    hallazgos.push({ que: `el plan vino vacío o demasiado corto (${t.trim().length} caracteres; un plan de 90 días completo pasa de ${LARGO_MINIMO})`, donde: 'todo el plan' })
    return { ok: false, hallazgos, correccion: correccionDeForma(hallazgos) }
  }
  // F1 · calendario fechado (las N semanas con período) o fases con días
  const nSemanas = semanasFechadas(t)
  const nFases = fasesConDias(t)
  if (nSemanas < semanas && nFases < 2) {
    hallazgos.push({
      que: `falta el calendario fechado: ${nSemanas} de ${semanas} semanas traen su período (p. ej. «| 3 | 28 oct - 3 nov | …») y no hay fases con días («fase 2 · días 31–60»); escribe las ${semanas} semanas con su fecha, o las fases con sus días de inicio y fin`,
      donde: 'calendario',
    })
  }
  // F2 · meta con cifra por semana
  if (!RE_META_POR_SEMANA.test(t)) {
    hallazgos.push({ que: 'falta la meta con cifra POR SEMANA (p. ej. «meta: 15 pedidos por semana»); sin una cifra semanal nadie puede medir si el plan cumple', donde: 'metas' })
  }
  // F3 · al menos un canal nombrado
  const canales = canalesNombrados(t)
  if (!canales.length) {
    hallazgos.push({ que: `el plan no nombra ningún canal (${['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'WhatsApp', 'correo', 'búsqueda'].join(' · ')}…); di en qué canales se publica y cuál es el principal`, donde: 'canales' })
  }
  // F4 · cifras centinela
  for (const c of cifrasCentinela(t)) {
    hallazgos.push({ que: `la cifra «${c.cifra}» termina en ,77: es un centinela de los ejemplos, no un dato de este negocio; calcula la cifra real o declara el rango con su fuente`, donde: c.donde })
  }
  return { ok: hallazgos.length === 0, hallazgos, correccion: correccionDeForma(hallazgos) }
}
