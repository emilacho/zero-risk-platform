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
 * Idioma (reserva 2 de CC#3 · 31-oct): el plan sale en el idioma que fija el manual del cliente, así que las reglas entienden español E inglés
 * (semana/week · meses en los dos idiomas · fase/phase · días/days · meta/objetivo/goal/target · por semana/per week/weekly).
 * Período (reserva 3 de CC#3): solo cuenta como fecha un MES conocido, una fecha ISO o «días N–M»; «5 de promo» ya no es un período.
 */

export interface HallazgoDeForma { que: string; donde: string }
export interface ResultadoDeForma { ok: boolean; hallazgos: HallazgoDeForma[]; correccion: string | null }
export interface OpcionesDeForma { /** semanas que debe fechar el calendario (por omisión 12) */ semanas?: number }

export const SEMANAS_DEL_PLAN = 12
/** un plan de 90 días de verdad no cabe en menos que esto (el real de 12-oct mide ~35.000 caracteres) */
export const LARGO_MINIMO = 1500

/** canales que el plan puede nombrar: redes canónicas (Instagram · Facebook · TikTok · LinkedIn · YouTube) + canales directos genéricos */
export const CANALES = [
  'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'google ads', 'google maps', 'búsqueda', 'busqueda', 'search', 'correo', 'email', 'newsletter', 'sms', 'pinterest', 'telegram', 'twitter', 'meta ads', 'anuncios', 'ads',
] as const

const RE_ENCABEZADO = /^#{1,4}\s+(.+?)\s*$/
const RE_SEPARADOR_DE_TABLA = /^\|?[\s:|\-–—]+\|?$/
/** un mes conocido, en español o inglés, entero o abreviado («oct» · «octubre» · «Oct.» · «October» · «set»/«sept») */
const MES = '(?:ene(?:ro)?|jan(?:uary)?|feb(?:rero|ruary)?|mar(?:zo|ch)?|abr(?:il)?|apr(?:il)?|mayo?|jun(?:io|e)?|jul(?:io|y)?|ago(?:sto)?|aug(?:ust)?|sept?(?:iembre|ember)?|set(?:iembre)?|oct(?:ubre|ober)?|nov(?:iembre|ember)?|dic(?:iembre)?|dec(?:ember)?)\\b\\.?'
const RANGO = '\\d{1,2}\\s*(?:[-–—]|al?\\b|hasta\\b|to\\b)\\s*\\d{1,2}'
/** un período CON mes conocido o fecha ISO o días: «14-20 oct» · «28 oct - 3 nov» · «Oct 14-20» · «3 de noviembre» · «2026-10-14» · «días 1–30» · «days 1-30» (reserva 3: «5 de promo» NO es un período) */
const RE_PERIODO = new RegExp(`(?:${RANGO}|\\b\\d{1,2})\\s*(?:de\\s+|of\\s+)?${MES}|\\b${MES}\\s*\\d{1,2}\\b|\\d{4}-\\d{2}-\\d{2}|\\b(?:d[ií]as?|days?)\\s*\\d`, 'i')
const DIAS_DE_A = '\\b(?:d[ií]as?|days?)\\s*\\d{1,3}\\s*(?:[-–—]|al?\\b|hasta\\b|to\\b|through\\b)\\s*\\d{1,3}'
/** una fase con días: «Fase 2 · días 31–60» · «fase de arranque (días 1 a 30)» · «Phase 2 · days 31-60» */
const RE_FASE_CON_DIAS = new RegExp(`\\b(?:fase|phase|etapa|stage)\\b[^\\n]{0,80}?${DIAS_DE_A}|${DIAS_DE_A}[^\\n]{0,80}?\\b(?:fase|phase|etapa|stage)\\b`, 'gi')
/** «Semana 3 · 28 oct - 3 nov» · «Week 3 · Oct 14-20» fuera de una tabla */
const RE_SEMANA_FECHADA = new RegExp(`\\b(?:semana|sem\\.?|week|wk\\.?)\\s*(\\d{1,2})\\b[^\\n|]{0,60}?(?:${RE_PERIODO.source})`, 'gi')
/** la primera celda de una fila del calendario: «3» · «Sem. 3» · «Semana 3» · «Week 3» · «W3» */
const RE_CELDA_DE_SEMANA = /^(?:sem(?:ana)?\.?|week|wk\.?|w)?\s*(\d{1,2})$/i
const RE_CABECERA_DE_SEMANA = /^(?:semana|sem\.?|week|wk\.?|w)$/i
/** la palabra que anuncia una meta (español e inglés) */
const RE_PALABRA_META = /\b(?:metas?|objetivos?|goals?|targets?|kpis?)\b/i
/** «por semana» en sus formas (español e inglés) */
const RE_POR_SEMANA = /\b(?:por semana|semanal(?:es|mente)?|a la semana|cada semana|per week|weekly|a week|each week|every week)\b|\/\s*(?:sem(?:ana)?|w(?:ee)?k)\b/gi
/** las cifras centinela del documento de referencia: todo dinero de los ejemplos termina en ,77 (con borde: «1.234,77» sí · «,777» y «,775» no) */
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

/** las celdas de una fila de tabla markdown (null si la línea no es una fila) */
function celdasDe(linea: string): string[] | null {
  const l = linea.trim()
  if (l.charAt(0) !== '|' || RE_SEPARADOR_DE_TABLA.test(l)) return null
  const celdas = l.split('|').map((c) => c.trim())
  if (celdas[0] === '') celdas.shift()
  if (celdas[celdas.length - 1] === '') celdas.pop()
  return celdas.length ? celdas : null
}
const esFilaDeEncabezados = (lineas: string[], i: number) => i + 1 < lineas.length && RE_SEPARADOR_DE_TABLA.test(lineas[i + 1].trim()) && /-/.test(lineas[i + 1])

/** cuántas semanas distintas trae el calendario con un período al lado (filas de tabla «| N | período |» o líneas «Semana N · período») */
export function semanasFechadas(texto: string): number {
  const semanas = new Set<number>()
  const lineas = texto.split('\n')
  lineas.forEach((l, i) => {
    const celdas = celdasDe(l)
    if (!celdas || celdas.length < 2 || esFilaDeEncabezados(lineas, i)) return
    const n = RE_CELDA_DE_SEMANA.exec(celdas[0])
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

/**
 * ¿hay una meta con cifra POR SEMANA? Vale en cualquier orden (reserva 1 de CC#3): «meta: 15 pedidos por semana» · «Meta semanal: 15» · «15 pedidos por semana … meta» ·
 * «Goal: 15 orders per week»; la cifra va en la misma línea que «por semana» (≤60 caracteres) y la palabra meta/objetivo/goal/target a ≤400 caracteres antes o ≤200 después
 * (un encabezado «Meta prudente…» cuenta). También vale una tabla cuya cabecera tenga «Semana»/«Week» y «Meta»/«Goal» con una cifra en la celda de la meta.
 */
export function metaPorSemana(texto: string): boolean {
  const re = new RegExp(RE_POR_SEMANA.source, RE_POR_SEMANA.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const ini = texto.lastIndexOf('\n', m.index) + 1
    const finDeLinea = texto.indexOf('\n', m.index)
    const linea = texto.slice(ini, finDeLinea < 0 ? texto.length : finDeLinea)
    const pos = m.index - ini
    if (!/\d/.test(linea.slice(Math.max(0, pos - 60), pos + m[0].length + 60))) continue
    if (RE_PALABRA_META.test(texto.slice(Math.max(0, m.index - 400), m.index + m[0].length + 200))) return true
  }
  const lineas = texto.split('\n')
  for (let i = 0; i + 2 < lineas.length; i++) {
    const cabecera = celdasDe(lineas[i])
    if (!cabecera || !esFilaDeEncabezados(lineas, i)) continue
    const col = cabecera.findIndex((c) => RE_PALABRA_META.test(c))
    if (col < 0 || !cabecera.some((c) => RE_CABECERA_DE_SEMANA.test(c))) continue
    for (let k = i + 2; k < lineas.length; k++) {
      const fila = celdasDe(lineas[k])
      if (!fila) break
      if (/\d/.test(fila[col] ?? '')) return true
    }
  }
  return false
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
      que: `falta el calendario fechado: ${nSemanas} de ${semanas} semanas traen su período con mes (p. ej. «| 3 | 28 oct - 3 nov | …» · «| Week 3 | Oct 14-20 | …») y no hay fases con días («fase 2 · días 31–60»); escribe las ${semanas} semanas con su fecha, o las fases con sus días de inicio y fin`,
      donde: 'calendario',
    })
  }
  // F2 · meta con cifra por semana
  if (!metaPorSemana(t)) {
    hallazgos.push({ que: 'falta la meta con cifra POR SEMANA (p. ej. «meta: 15 pedidos por semana» · «goal: 15 orders per week»); sin una cifra semanal nadie puede medir si el plan cumple', donde: 'metas' })
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
