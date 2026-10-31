/**
 * EL TRADUCTOR DEL GUION · parte 2 del brazo de video (31-oct · orden «construir todo antes de probar»). Pasa el GUION que integra la dirección creativa de la mesa
 * (Markdown con una convención ligera, como la pieza de láminas) a lo que el brazo de video entiende: planos con segundos, qué se ve en cada uno, la foto propia de
 * referencia, el audio, y el pie y las etiquetas de la publicación.
 *  · Un largo NUNCA rechaza: queda un aviso y la duración se encaja en lo aprobado (8–15 s).
 *  · Como máximo UNA pregunta a la dirección por pieza (la misma regla que el traductor de láminas); si aun así no se entiende, el texto completo va a la jefatura.
 *  · Convención: `## Plano 1 · 0–3 s` + líneas `Se ve:`, `Movimiento:`, `Texto en pantalla:`, `Foto: foto:<id> | ninguna`; luego `## Audio`, `## Pie`, `## Etiquetas`, `## Citas`.
 * Puro: sin base, sin red, sin modelo.
 */
import { DURACION_MAX_S, DURACION_MIN_S } from '../../video/parametros'
import { limpiarPie, limpiarTexto } from '../mesa/traductor'

export interface Plano {
  n: number
  /** segundo en que empieza y en que termina (enteros; el último termina en `segundos`) */
  desde: number
  hasta: number
  se_ve: string
  movimiento?: string
  texto_en_pantalla?: string
  /** id de una foto PROPIA del cliente que sirve de referencia para este plano */
  foto_id?: string
}

export interface TraduccionDeGuion {
  /** false = no se pudo traducir: el texto completo va a la jefatura y la pieza se cierra marcada */
  ok: boolean
  pregunta?: string
  motivo?: string
  planos: Plano[]
  /** duración total del video (8–15 s) */
  segundos: number
  audio: string
  pie_de_foto: string
  hashtags: string[]
  /** las fotos de referencia en el orden de los planos, sin repetir */
  fotos_ids: string[]
  avisos: string[]
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
interface Seccion { titulo: string; lineas: string[] }

function secciones(md: string): Seccion[] {
  const out: Seccion[] = []
  let cur: Seccion | null = null
  for (const l of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const h = /^\s{0,3}#{1,4}\s+(.*?)\s*#*\s*$/.exec(l)
    if (h) { cur = { titulo: h[1].trim(), lineas: [] }; out.push(cur) } else if (cur) cur.lineas.push(l)
  }
  return out
}

const esPlano = (t: string) => /^(plano|toma|escena|shot|cuadro)\b/i.test(sinTildes(t).trim()) || /\b\d+\s*[–-]\s*\d+\s*s\b/.test(t)
const esAudio = (t: string) => /^(audio|sonido|m[uú]sica)\b/i.test(t.trim())
const esPie = (t: string) => /^(pie( de foto)?|caption|texto de publicaci[oó]n|descripci[oó]n)\b/i.test(t.trim())
const esEtiquetas = (t: string) => /^(etiquetas|hashtags)\b/i.test(t.trim())

const CAMPOS: Array<[RegExp, 'se_ve' | 'movimiento' | 'texto_en_pantalla' | 'foto']> = [
  [/^(se ve|imagen|descripcion|accion|escena|visual|que se ve)$/, 'se_ve'],
  [/^(movimiento|camara|camara y movimiento|ritmo)$/, 'movimiento'],
  [/^(texto en pantalla|texto|rotulo|sobreimpreso)$/, 'texto_en_pantalla'],
  [/^(foto|referencia|foto de referencia|foto propia)$/, 'foto'],
]

function campos(lineas: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  let actual: string | null = null
  for (const raw of lineas) {
    const l = raw.replace(/^\s*[-*•]\s+/, '').trimEnd()
    const m = /^\*{0,2}([^:*\n]{2,40}?)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/.exec(l)
    const nombre = m ? sinTildes(m[1]).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() : ''
    const tipo = CAMPOS.find(([re]) => re.test(nombre))?.[1]
    if (m && tipo) { actual = tipo; r[tipo] = (r[tipo] ? r[tipo] + '\n' : '') + m[2].trim(); continue }
    if (m) { actual = null; continue } // otra etiqueta: no es un campo del plano
    if (actual && l.trim()) r[actual] += '\n' + l.trim()
    else if (!actual && l.trim()) r.suelto = (r.suelto ? r.suelto + '\n' : '') + l.trim()
  }
  return r
}

/** «0–3 s», «0-3s», «de 3 a 8 s» en el título del plano */
function tiempos(titulo: string): { desde: number; hasta: number } | null {
  const m = /(\d+)\s*(?:[–-]|a)\s*(\d+)\s*s\b/i.exec(titulo)
  if (!m) return null
  const a = Number(m[1]), b = Number(m[2])
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { desde: a, hasta: b } : null
}

function hashtagsDe(lineas: string[]): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const h of (lineas.join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? [])) { const k = h.toLowerCase(); if (!vistos.has(k)) { vistos.add(k); out.push(h) } }
  return out
}

function leerFoto(texto: string | undefined): string | undefined {
  const t = String(texto ?? '').replace(/`/g, '').replace(/\*\*/g, '').trim()
  if (!t || /^(ninguna|sin foto|no)\b/i.test(t)) return undefined
  const f = /^(?:foto(?: propia)?|real|referencia)?\s*[:·-]?\s*([A-Za-z0-9_.-]{4,80})/i.exec(t)
  return f ? f[1] : undefined
}

export function traducirGuion(md: string, o: { preguntasHechas?: number; maxPreguntas?: number } = {}): TraduccionDeGuion {
  const maxP = o.maxPreguntas ?? 1
  const todas = secciones(md)
  const avisos: string[] = []
  let pie = '', audio = ''
  let tags: string[] = []
  const bloques: Seccion[] = []
  for (const s of todas) {
    if (esAudio(s.titulo)) audio = limpiarTexto(s.lineas.join('\n'), true)
    else if (esPie(s.titulo)) pie = s.lineas.join('\n').trim()
    else if (esEtiquetas(s.titulo)) tags = hashtagsDe(s.lineas)
    else if (esPlano(s.titulo)) bloques.push(s)
  }
  if (!pie || !tags.length) {
    for (const s of todas) for (const l of s.lineas) {
      const p = /^\s*\*{0,2}(pie( de foto)?|caption)\*{0,2}\s*:\s*(.+)$/i.exec(l)
      if (p && !pie) pie = p[3].trim()
      if (/^\s*\*{0,2}(etiquetas|hashtags)\*{0,2}\s*:/i.test(l) && !tags.length) tags = hashtagsDe([l])
    }
  }
  pie = limpiarPie(pie)
  const vacio = (motivo: string): TraduccionDeGuion => ({ ok: false, motivo, planos: [], segundos: DURACION_MIN_S, audio, pie_de_foto: pie, hashtags: tags, fotos_ids: [], avisos })
  if (!bloques.length) {
    if ((o.preguntasHechas ?? 0) < maxP) return { ...vacio('no encontré planos'), pregunta: 'No encuentro los planos del guion. Escribe un encabezado por plano («## Plano 1 · 0–3 s») con «Se ve:» y, si aplica, «Foto: foto:<id>».' }
    return vacio('no encontré planos (un encabezado por plano)')
  }

  const planos: Plano[] = []
  const sinQueVer: number[] = []
  bloques.slice(0, 12).forEach((s, i) => {
    const c = campos(s.lineas)
    const seVe = limpiarTexto(c.se_ve ?? c.suelto ?? '', true)
    if (!seVe) { sinQueVer.push(i + 1); return }
    const t = tiempos(s.titulo)
    const p: Plano = { n: i + 1, desde: t?.desde ?? -1, hasta: t?.hasta ?? -1, se_ve: seVe }
    const mov = limpiarTexto(c.movimiento ?? '')
    if (mov) p.movimiento = mov
    const txt = limpiarTexto(c.texto_en_pantalla ?? '')
    if (txt) p.texto_en_pantalla = txt
    const foto = leerFoto(c.foto)
    if (foto) p.foto_id = foto
    planos.push(p)
  })
  if (sinQueVer.length && (o.preguntasHechas ?? 0) < maxP) {
    return { ...vacio('planos sin «Se ve»'), pregunta: `En ${sinQueVer.length === 1 ? 'el plano' : 'los planos'} ${sinQueVer.join(', ')} no encuentro qué se ve. ¿Qué muestra ${sinQueVer.length === 1 ? 'ese plano' : 'cada uno'}?` }
  }
  if (!planos.length) return vacio('ningún plano dice qué se ve')
  if (sinQueVer.length) avisos.push(`${sinQueVer.length} plano(s) sin «Se ve» se descartaron (${sinQueVer.join(', ')})`)

  // la duración: la del último plano con tiempos; sin tiempos, el mínimo aprobado repartido en partes iguales
  const conTiempos = planos.every((p) => p.desde >= 0 && p.hasta > p.desde)
  let total = conTiempos ? Math.max(...planos.map((p) => p.hasta)) : DURACION_MIN_S
  if (total < DURACION_MIN_S) { avisos.push(`el guion dura ${total} s y lo aprobado es de ${DURACION_MIN_S} a ${DURACION_MAX_S} s: se alarga a ${DURACION_MIN_S} s`); total = DURACION_MIN_S }
  if (total > DURACION_MAX_S) { avisos.push(`el guion dura ${total} s y lo aprobado es de ${DURACION_MIN_S} a ${DURACION_MAX_S} s: se encaja en ${DURACION_MAX_S} s`); total = DURACION_MAX_S }
  total = Math.round(total)
  if (!conTiempos) {
    avisos.push('los planos no traen tiempos: se reparten en partes iguales')
    const paso = total / planos.length
    planos.forEach((p, i) => { p.desde = Math.round(i * paso); p.hasta = i === planos.length - 1 ? total : Math.round((i + 1) * paso) })
  } else if (Math.max(...planos.map((p) => p.hasta)) !== total) {
    const factor = total / Math.max(...planos.map((p) => p.hasta))
    planos.forEach((p, i) => { p.desde = Math.round(p.desde * factor); p.hasta = i === planos.length - 1 ? total : Math.round(p.hasta * factor) })
  }
  const fotos: string[] = []
  for (const p of planos) if (p.foto_id && !fotos.includes(p.foto_id)) fotos.push(p.foto_id)
  if (!audio) avisos.push('el guion no dice nada del audio: el modelo pone música o ambiente a su criterio (sin voz, por regla)')
  return { ok: true, planos, segundos: total, audio, pie_de_foto: pie, hashtags: tags, fotos_ids: fotos, avisos }
}

/** el texto del pedido al modelo: un renglón por plano con sus segundos, y el audio; lo que el guion no dice no se inventa */
export function promptDelGuion(t: Pick<TraduccionDeGuion, 'planos' | 'audio' | 'segundos'>, max = 3600): { prompt: string; recortado: boolean } {
  const lineas = t.planos.map((p) => `Plano ${p.n} (${p.desde}–${p.hasta} s): ${p.se_ve}${p.movimiento ? ` Cámara: ${p.movimiento}.` : ''}${p.texto_en_pantalla ? ` Texto en pantalla, literal: «${p.texto_en_pantalla}».` : ''}`)
  lineas.push(t.audio ? `Audio: ${t.audio}` : 'Audio: música o sonido ambiente acorde a la escena.')
  lineas.push(`Duración total: ${t.segundos} s.`)
  const prompt = lineas.join('\n')
  return prompt.length <= max ? { prompt, recortado: false } : { prompt: prompt.slice(0, max), recortado: true }
}

/** el guion legible para quien revisa o aprueba (la jefatura y la hoja de entrega) */
export function guionLegible(t: Pick<TraduccionDeGuion, 'planos' | 'audio' | 'segundos'>): string {
  return [
    ...t.planos.map((p) => `Plano ${p.n} · ${p.desde}–${p.hasta} s\n  Se ve: ${p.se_ve}${p.movimiento ? `\n  Movimiento: ${p.movimiento}` : ''}${p.texto_en_pantalla ? `\n  Texto en pantalla: ${p.texto_en_pantalla}` : ''}${p.foto_id ? `\n  Foto de referencia: ${p.foto_id}` : ''}`),
    `Audio: ${t.audio || '(a criterio del modelo: música o ambiente, sin voz)'}`,
    `Duración: ${t.segundos} s`,
  ].join('\n')
}
