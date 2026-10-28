/**
 * EL TRADUCTOR TOLERANTE · pasa la pieza que entrega la dirección (Markdown con una CONVENCIÓN ligera, no un esquema que rechaza) a lo que dibuja el brazo.
 *  · Un largo NUNCA rechaza: queda un aviso para el equipo («esta lámina trae 400 caracteres») y el dibujo se ajusta.
 *  · Condición 7 de CC#3: como máximo UNA pregunta al autor por pieza; si no se entiende, la pieza completa pasa a la jefatura como TEXTO (`ok:false`), no se mata.
 *  · Convención: un encabezado por lámina o historia (`## Lámina 1 · hook`, `## <ref>`), líneas `Título:`, `Texto:`, `Llamado:`, `Sobre-título:`, `Imagen:`;
 *    luego `## Pie` y `## Etiquetas`. Las citas (`A3 usé: …`) las lee `libro.ts`.
 * Puro: sin base ni red.
 */
import { ROLES_DE_LAMINA } from '../salida'
import type { ElementoDeCopyKit, ElementoDeEstructura, Lamina } from '../laminas'
import type { TipoDePieza } from './tipos'

export type ImagenPedida = { ref: string; modo: 'real'; foto_id: string } | { ref: string; modo: 'generada'; descripcion: string } | { ref: string; modo: 'ninguna' }

export interface Traduccion {
  /** false = no se pudo traducir: la pieza completa va a la jefatura como texto */
  ok: boolean
  /** la única pregunta al autor (si falta lo mínimo en algunas secciones) */
  pregunta?: string
  motivo?: string
  pie_de_foto: string
  hashtags: string[]
  /** carrusel */
  laminas?: Lamina[]
  copy_carrusel?: { texto_base: string; pie_de_foto: string; hashtags: string[]; llamado?: string }
  /** kit */
  copy_kit?: ElementoDeCopyKit[]
  estructura?: ElementoDeEstructura[]
  imagenes: ImagenPedida[]
  /** avisos para el equipo (nunca rechazos) */
  avisos: string[]
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const CAMPOS: Array<[RegExp, 'headline' | 'body' | 'cta' | 'eyebrow' | 'imagen' | 'mood']> = [
  [/^(t[ií]tulo|titular|headline|gancho)$/, 'headline'],
  [/^(texto|cuerpo|body|desarrollo)$/, 'body'],
  [/^(llamado( a la acci[oó]n)?|cta|cierre)$/, 'cta'],
  [/^(sobre-?t[ií]tulo|eyebrow|antet[ií]tulo|etiqueta superior)$/, 'eyebrow'],
  [/^(imagen|foto|visual)$/, 'imagen'],
  [/^(ambiente|mood|tono visual)$/, 'mood'],
]

interface Seccion { titulo: string; lineas: string[] }

/** divide en secciones por encabezados Markdown (`#`…`####`) */
function secciones(md: string): Seccion[] {
  const out: Seccion[] = []
  let cur: Seccion | null = null
  for (const l of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const h = /^\s{0,3}#{1,4}\s+(.*?)\s*#*\s*$/.exec(l)
    if (h) { cur = { titulo: h[1].trim(), lineas: [] }; out.push(cur) } else if (cur) cur.lineas.push(l)
  }
  return out
}

/** `Campo: valor` (con o sin negritas / guion); el valor puede seguir en las líneas siguientes hasta el próximo campo */
function campos(lineas: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  let actual: string | null = null
  for (const raw of lineas) {
    const l = raw.replace(/^\s*[-*•]\s+/, '').trimEnd()
    const m = /^\*{0,2}([^:*\n]{2,32}?)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/.exec(l)
    const nombre = m ? sinTildes(m[1]).trim() : ''
    const tipo = CAMPOS.find(([re]) => re.test(nombre))?.[1]
    if (m && tipo) { actual = tipo; r[tipo] = (r[tipo] ? r[tipo] + '\n' : '') + m[2].trim(); continue }
    if (actual && l.trim()) r[actual] += '\n' + l.trim()
    else if (!actual && l.trim()) r.suelto = (r.suelto ? r.suelto + '\n' : '') + l.trim()
  }
  for (const k of Object.keys(r)) r[k] = r[k].trim()
  return r
}

function leerImagen(ref: string, texto: string | undefined): ImagenPedida {
  const t = (texto ?? '').trim()
  if (!t || /^(ninguna|sin imagen|no)\b/i.test(t)) return { ref, modo: 'ninguna' }
  const f = /^(?:foto(?: propia)?|real)\s*[:·-]\s*([A-Za-z0-9_.-]{4,80})/i.exec(t)
  if (f) return { ref, modo: 'real', foto_id: f[1] }
  const g = /^(?:generar|generada|generad[ao]|crear)\s*[:·-]?\s*([\s\S]+)$/i.exec(t)
  if (g && g[1].trim()) return { ref, modo: 'generada', descripcion: g[1].trim() }
  return { ref, modo: 'generada', descripcion: t }
}

const esSeccionDePie = (t: string) => /^(pie( de foto)?|caption|descripci[oó]n)\b/i.test(t.trim())
const esSeccionDeEtiquetas = (t: string) => /^(etiquetas|hashtags)\b/i.test(t.trim())
const esSeccionDeCitas = (t: string) => /^(citas|usé|use|aportes|qué usé|que use)\b/i.test(sinTildes(t).trim()) || /^(us[eé]|descart)/i.test(t.trim())

function hashtagsDe(lineas: string[]): string[] {
  return [...new Set((lineas.join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.trim()))]
}

/** asigna el rol de cada lámina: el del encabezado si es válido; si no, por posición (la última con llamado = cta) */
function rolDe(tituloSeccion: string, i: number, total: number, tieneCta: boolean): string {
  const t = sinTildes(tituloSeccion)
  const dado = (ROLES_DE_LAMINA as readonly string[]).find((r) => new RegExp(`\\b${r}\\b`).test(t))
  if (dado) return dado
  if (i === 0) return 'hook'
  if (i === total - 1) return tieneCta ? 'cta' : 'cierre'
  const medio = ['problem', 'reframe', 'proof', 'benefit', 'objection', 'social-proof']
  return medio[(i - 1) % medio.length]
}

const AVISO_LARGO = { headline: 90, body: 220, cta: 32, eyebrow: 24 } as const

export function traducirPieza(md: string, tipo: TipoDePieza, o: { refsDelKit?: string[]; tipoPorRef?: Record<string, 'historia' | 'estado'>; temaPorRef?: Record<string, string>; preguntasHechas?: number; maxPreguntas?: number } = {}): Traduccion {
  const maxP = o.maxPreguntas ?? 1
  const todas = secciones(md)
  const avisos: string[] = []
  let pie = ''
  let tags: string[] = []
  const cuerpo: Seccion[] = []
  for (const s of todas) {
    if (esSeccionDePie(s.titulo)) pie = s.lineas.join('\n').trim()
    else if (esSeccionDeEtiquetas(s.titulo)) tags = hashtagsDe(s.lineas)
    else if (esSeccionDeCitas(s.titulo)) continue
    else cuerpo.push(s)
  }
  // un `Pie:`/`Etiquetas:` suelto dentro de otra sección también vale
  if (!pie || !tags.length) {
    for (const s of todas) for (const l of s.lineas) {
      const p = /^\s*\*{0,2}(pie( de foto)?|caption)\*{0,2}\s*:\s*(.+)$/i.exec(l)
      if (p && !pie) pie = p[3].trim()
      if (/^\s*\*{0,2}(etiquetas|hashtags)\*{0,2}\s*:/i.test(l) && !tags.length) tags = hashtagsDe([l])
    }
  }
  const imagenes: ImagenPedida[] = []
  const falla = (motivo: string): Traduccion => ({ ok: false, motivo, pie_de_foto: pie, hashtags: tags, imagenes, avisos })

  if (tipo === 'carrusel') {
    const bloques = cuerpo.filter((s) => /^(l[aá]mina|slide|diapositiva|tarjeta|\d)/i.test(sinTildes(s.titulo).trim()) || Object.keys(campos(s.lineas)).some((k) => k === 'headline'))
    if (!bloques.length) return falla('no encontré láminas (un encabezado por lámina)')
    const laminas: Lamina[] = []
    const sinTitulo: number[] = []
    bloques.slice(0, 10).forEach((s, i) => {
      const c = campos(s.lineas)
      let headline = c.headline ?? ''
      let body = c.body ?? ''
      if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
      if (!headline) { sinTitulo.push(i + 1); return }
      const rol = rolDe(s.titulo, i, Math.min(bloques.length, 10), !!c.cta)
      const l: Lamina = { orden: i + 1, rol, headline, ...(body ? { body } : {}), ...(c.cta ? { cta: c.cta } : {}), ...(c.eyebrow ? { eyebrow: c.eyebrow } : {}) }
      laminas.push(l)
      imagenes.push(leerImagen(rol, c.imagen))
      for (const k of ['headline', 'body', 'cta', 'eyebrow'] as const) {
        const v = l[k]
        if (typeof v === 'string' && v.length > AVISO_LARGO[k]) avisos.push(`lámina ${i + 1}: «${k}» trae ${v.length} caracteres (referencia ${AVISO_LARGO[k]}); el dibujo se ajusta al texto`)
      }
    })
    if (sinTitulo.length && (o.preguntasHechas ?? 0) < maxP) return { ok: false, pregunta: `En ${sinTitulo.length === 1 ? 'la lámina' : 'las láminas'} ${sinTitulo.join(', ')} no encuentro el título. ¿Cuál es el texto principal de ${sinTitulo.length === 1 ? 'esa lámina' : 'esas láminas'}?`, pie_de_foto: pie, hashtags: tags, imagenes: [], avisos }
    if (!laminas.length) return falla('ninguna lámina trae título')
    // dos láminas con rol repetido: se desambigua por posición para que cada imagen tenga su ref
    const vistos = new Map<string, number>()
    laminas.forEach((l) => { const k = vistos.get(l.rol) ?? 0; vistos.set(l.rol, k + 1) })
    const llamado = laminas.find((l) => l.cta)?.cta
    const todoElTexto = laminas.flatMap((l) => [l.eyebrow, l.headline, l.body, l.cta].filter(Boolean)).join('\n')
    return {
      ok: true, pie_de_foto: pie || (laminas[0].headline), hashtags: tags, laminas, imagenes, avisos,
      copy_carrusel: { texto_base: todoElTexto, pie_de_foto: pie || laminas[0].headline, hashtags: tags, ...(llamado ? { llamado } : {}) },
    }
  }

  // kit de historias: una sección por elemento del brief (por ref, o por orden)
  const refs = o.refsDelKit ?? []
  if (!refs.length) return falla('el kit no tiene elementos de referencia')
  const copy: ElementoDeCopyKit[] = []
  const estructura: ElementoDeEstructura[] = []
  const faltan: string[] = []
  refs.forEach((ref, i) => {
    const s = cuerpo.find((x) => sinTildes(x.titulo).includes(sinTildes(ref))) ?? cuerpo[i]
    if (!s) { faltan.push(ref); return }
    const c = campos(s.lineas)
    let headline = c.headline ?? ''
    let body = c.body ?? ''
    if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
    if (!headline) { faltan.push(ref); return }
    copy.push({ ref, headline, ...(body ? { body } : {}), ...(c.cta ? { cta: c.cta } : {}), ...(c.eyebrow ? { eyebrow: c.eyebrow } : {}) })
    estructura.push({ ref, rol: o.tipoPorRef?.[ref] ?? 'historia', beat: o.temaPorRef?.[ref] ?? headline.slice(0, 60), mood: c.mood ?? '' })
    imagenes.push(leerImagen(ref, c.imagen))
    if (headline.length > 60) avisos.push(`«${ref}»: el titular trae ${headline.length} caracteres; el dibujo se ajusta al texto`)
  })
  if (faltan.length && (o.preguntasHechas ?? 0) < maxP) return { ok: false, pregunta: `No encuentro texto para ${faltan.map((r) => `«${r}»`).join(', ')}. ¿Cuál es el título de ${faltan.length === 1 ? 'ese elemento' : 'esos elementos'}?`, pie_de_foto: pie, hashtags: tags, imagenes: [], avisos }
  if (!copy.length) return falla('ningún elemento del kit trae título')
  return { ok: true, pie_de_foto: pie, hashtags: tags, copy_kit: copy, estructura, imagenes, avisos }
}

/** ¿la pieza pide generar alguna imagen? (para saber si la especialidad de imagen es pertinente) */
export function hayImagenesAGenerar(md: string, tipo: TipoDePieza, refsDelKit: string[] = []): boolean {
  const t = traducirPieza(md, tipo, { refsDelKit, preguntasHechas: 99 })
  return t.imagenes.some((i) => i.modo === 'generada')
}
