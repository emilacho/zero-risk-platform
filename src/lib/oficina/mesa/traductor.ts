/**
 * EL TRADUCTOR TOLERANTE · pasa la pieza que entrega la dirección (Markdown con una CONVENCIÓN ligera, no un esquema que rechaza) a lo que dibuja el brazo.
 *  · Un largo NUNCA rechaza: queda un aviso para el equipo («esta lámina trae 400 caracteres») y el dibujo se ajusta.
 *  · Condición 7 de CC#3: como máximo UNA pregunta al autor por pieza; si no se entiende, la pieza completa pasa a la jefatura como TEXTO (`ok:false`), no se mata.
 *  · Convención: un encabezado por lámina o historia (`## Lámina 1 · hook`, `## <ref>`), líneas `Título:`, `Texto:`, `Llamado:`, `Sobre-título:`, `Imagen:`;
 *    luego `## Pie` y `## Etiquetas`. Las citas (`A3 usé: …`) las lee `libro.ts`.
 *  · 29-oct (P1/P2) · a las láminas llega SOLO el texto final: las NOTAS del director («Titular nativo FB (≤40 car.)», «Texto en imagen:», «Variante A/B», markdown, «≤») nunca se dibujan.
 *    Si el director dejó dos variantes, se usa la que marcó como elegida y, si no marcó ninguna, la primera; la otra queda anotada como alternativa (no se dibuja).
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
  /** las variantes que el director dejó y NO se usaron (quedan anotadas; no se dibujan) */
  alternativas?: string[]
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const CAMPOS: Array<[RegExp, 'headline' | 'body' | 'cta' | 'eyebrow' | 'imagen' | 'mood']> = [
  [/^(t[ií]tulo|titular|headline|gancho)$/, 'headline'],
  [/^(texto|cuerpo|body|desarrollo)$/, 'body'],
  [/^(llamado( a la acci[oó]n)?|cta|cierre)$/, 'cta'],
  [/^(sobre-?t[ií]tulo|eyebrow|antet[ií]tulo|etiqueta superior|descripci[oó]n)$/, 'eyebrow'],
  [/^(imagen|foto|visual)$/, 'imagen'],
  [/^(ambiente|mood|tono visual)$/, 'mood'],
]

/** el nombre de un campo sin lo que el director le pone al lado: «Titular nativo FB (≤40 car.)» → «titular»; «Cuerpo (texto nativo debajo de imagen)» → «cuerpo» */
export function nombreDeCampo(crudo: string): string {
  return sinTildes(crudo).replace(/\([^)]*\)/g, ' ').replace(/\b(nativo|nativa|fb|facebook|instagram|ig|linkedin|tiktok|youtube)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

/** lo que el director anota para el equipo de dibujo y NO es texto de la pieza */
const NOTA_DEL_DIRECTOR = /variante\s+[a-z0-9]\b|titular nativo|descripci[oó]n nativa|texto en imagen|\([^)]*(?:≤|\bcar\.)[^)]*\)|≤\s*\d|\*\*|`/i

/** el texto sin markdown ni los límites entre paréntesis; `parrafos` conserva los saltos de línea (el pie y el cuerpo largo) */
export function limpiarTexto(v: string, parrafos = false): string {
  const sin = String(v ?? '')
    .replace(/`/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\s*\([^()]*(?:≤|<=|\bcar\.|\bcaracteres\b|\bm[aá]x\.)[^()]*\)/gi, '')
    .replace(/≤\s*/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
  return parrafos ? sin.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : sin.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

/** ¿esto sigue siendo una nota del director aunque se haya limpiado? (no se dibuja) */
export const esNotaDelDirector = (v: string): boolean => NOTA_DEL_DIRECTOR.test(v)

interface Variante { letra: string; texto: string; elegida: boolean }
const ELEGIDA = /\((?:elegid[ao]|final|recomendad[ao]|principal)\)|\[(?:elegid[ao]|final)\]|[✓✔]|←\s*(?:elegid[ao]|final|recomendad[ao])/i
const RE_VARIANTE_EN_LINEA = /variante\s+([A-Za-z0-9])\s*[:.\-–)]\s*/gi

/** de varias variantes, la marcada como elegida; si ninguna lo está, la primera (la dirección no decidió: manda el orden en que las escribió) */
export function elegirVariante(vs: Variante[]): { usada: Variante; otras: Variante[] } | null {
  if (!vs.length) return null
  const usada = vs.find((v) => v.elegida) ?? vs[0]
  return { usada, otras: vs.filter((v) => v !== usada) }
}

/** «Variante A: x Variante B: y» escritas en una sola línea → variantes */
function variantesEnLinea(valor: string): Variante[] {
  const marcas = [...valor.matchAll(RE_VARIANTE_EN_LINEA)]
  if (!marcas.length) return []
  return marcas.map((m, i) => {
    const ini = (m.index ?? 0) + m[0].length
    const fin = i + 1 < marcas.length ? (marcas[i + 1].index ?? valor.length) : valor.length
    const texto = valor.slice(ini, fin).trim()
    return { letra: m[1].toUpperCase(), texto, elegida: ELEGIDA.test(texto) }
  })
}

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

interface CamposLeidos { valores: Record<string, string>; alternativas: string[]; avisos: string[] }

/**
 * `Campo: valor` (con o sin negritas / guion); el valor puede seguir en las líneas siguientes hasta el próximo campo.
 * Una línea «Etiqueta: …» que NO es un campo de la pieza (p. ej. «Texto en imagen:», una nota para el equipo de dibujo) corta el campo anterior y no se guarda en ninguno.
 */
function campos(lineas: string[], rotulo = ''): CamposLeidos {
  const r: Record<string, string> = {}
  const variantes: Record<string, Variante[]> = {}
  const avisos: string[] = []
  let actual: string | null = null
  let ignorando = false
  for (const raw of lineas) {
    const l = raw.replace(/^\s*[-*•]\s+/, '').trimEnd()
    const v = /^\*{0,2}variante\s+([A-Za-z0-9])\*{0,2}\s*[:.\-–)]\s*\*{0,2}\s*(.*)$/i.exec(l)
    if (v && actual && !ignorando) { (variantes[actual] ??= []).push({ letra: v[1].toUpperCase(), texto: v[2].trim(), elegida: ELEGIDA.test(l) }); continue }
    const m = /^\*{0,2}([^:*\n]{2,60}?)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/.exec(l)
    const nombre = m ? nombreDeCampo(m[1]) : ''
    const tipo = CAMPOS.find(([re]) => re.test(nombre))?.[1]
    if (m && tipo) { actual = tipo; ignorando = false; r[tipo] = (r[tipo] ? r[tipo] + '\n' : '') + m[2].trim(); continue }
    if (m && (/^\s*\*\*/.test(l) || nombre.split(' ').length <= 3)) { actual = null; ignorando = true; continue } // una nota para el equipo: no es texto de la pieza
    if (ignorando) continue
    if (actual && l.trim()) r[actual] += '\n' + l.trim()
    else if (!actual && l.trim()) r.suelto = (r.suelto ? r.suelto + '\n' : '') + l.trim()
  }
  const alternativas: string[] = []
  for (const k of Object.keys(r)) {
    const lista = variantes[k]?.length ? variantes[k] : variantesEnLinea(r[k])
    if (lista.length) {
      const el = elegirVariante(lista)!
      // lo que el campo traía ANTES de las variantes (si lo había) no es texto de la pieza: manda la variante
      r[k] = el.usada.texto
      if (el.otras.length) {
        alternativas.push(...el.otras.map((o) => `${rotulo ? rotulo + ' · ' : ''}${k === 'headline' ? 'título' : k === 'body' ? 'texto' : k} (variante ${o.letra}): ${limpiarTexto(o.texto)}`))
        avisos.push(`${rotulo ? rotulo + ': ' : ''}el director dejó ${lista.length} variantes del ${k === 'headline' ? 'título' : k === 'body' ? 'texto' : k}; se usó la ${el.usada.letra}${lista.some((x) => x.elegida) ? ' (la marcada como elegida)' : ' (la primera: no marcó una)'} y la otra queda anotada como alternativa`)
      }
    }
    r[k] = r[k].trim()
  }
  return { valores: r, alternativas, avisos }
}

function leerImagen(ref: string, texto: string | undefined): ImagenPedida {
  // el director escribe la foto entre comillas inversas («foto:`0443a42d`») y a veces deja una condición («si resiste: usar recorte. Si no: generar: …»)
  let t = String(texto ?? '').replace(/`/g, '').replace(/\*\*/g, '').trim()
  if (!t || /^(ninguna|sin imagen|no)\b/i.test(t)) return { ref, modo: 'ninguna' }
  const f = /^(?:foto(?: propia)?|real)\s*[:·-]\s*([A-Za-z0-9_.-]{4,80})/i.exec(t)
  if (f) return { ref, modo: 'real', foto_id: f[1] }
  const g = /^(?:generar|generada|generad[ao]|crear)\s*[:·-]?\s*([\s\S]+)$/i.exec(t)
  if (g && g[1].trim()) return { ref, modo: 'generada', descripcion: g[1].trim() }
  const despues = /\bgenerar\s*:\s*([\s\S]+)$/i.exec(t)
  if (despues && despues[1].trim()) t = despues[1].trim()
  return { ref, modo: 'generada', descripcion: t }
}

const esSeccionDePie = (t: string) => /^(pie( de foto)?|caption|descripci[oó]n)\b/i.test(t.trim())
const esSeccionDeTextoDePublicacion = (t: string) => /^texto de publicaci[oó]n\b/i.test(sinTildes(t).trim()) || /^texto de publicacion\b/i.test(sinTildes(t).trim())
const esSeccionDeEtiquetas = (t: string) => /^(etiquetas|hashtags)\b/i.test(t.trim())
const esSeccionDeCitas = (t: string) => /^(citas|usé|use|aportes|qué usé|que use|alternativas?)\b/i.test(sinTildes(t).trim()) || /^(us[eé]|descart)/i.test(t.trim())

function hashtagsDe(lineas: string[]): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const h of (lineas.join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? []).map((x) => x.trim())) {
    const k = h.toLowerCase()
    if (!vistos.has(k)) { vistos.add(k); out.push(h) }
  }
  return out
}

/** el pie que dejó el director sin sus notas: líneas «(…)» o «*(…)*», separadores «---» y las líneas que son solo hashtags (esos van en `Etiquetas`) */
export function limpiarPie(crudo: string): string {
  const lineas = String(crudo ?? '').replace(/\r/g, '').split('\n')
    .filter((l) => !/^\s*[*_]*\([^)]*\)[*_]*\s*$/.test(l) && !/^\s*[-_*]{3,}\s*$/.test(l))
    .filter((l) => !(l.trim() && l.trim().split(/\s+/).every((p) => /^#[\p{L}\p{N}_]+$/u.test(p))))
  return limpiarTexto(lineas.join('\n'), true)
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

/** un llamado que es una INSTRUCCIÓN para quien publica («Botón nativo de Facebook “Enviar mensaje”…») no es texto que se dibuje */
const esInstruccionDeBoton = (v: string) => /^\s*(bot[oó]n|button)\b/i.test(v)

export function traducirPieza(md: string, tipo: TipoDePieza, o: { refsDelKit?: string[]; tipoPorRef?: Record<string, 'historia' | 'estado'>; temaPorRef?: Record<string, string>; preguntasHechas?: number; maxPreguntas?: number } = {}): Traduccion {
  const maxP = o.maxPreguntas ?? 1
  const todas = secciones(md)
  const avisos: string[] = []
  const alternativas: string[] = []
  let pie = ''
  let tags: string[] = []
  const publicaciones: Variante[] = []
  const cuerpo: Seccion[] = []
  for (const s of todas) {
    if (esSeccionDePie(s.titulo)) pie = s.lineas.join('\n').trim()
    else if (esSeccionDeTextoDePublicacion(s.titulo)) {
      const letra = /variante\s+([A-Za-z0-9])\b/i.exec(s.titulo)?.[1]?.toUpperCase() ?? String(publicaciones.length + 1)
      publicaciones.push({ letra, texto: s.lineas.join('\n').trim(), elegida: ELEGIDA.test(s.titulo) })
    }
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
  // P2 · el texto de publicación es el que INTEGRÓ el director: la variante elegida (o la primera) y, debajo, su cierre (`## Pie`); los hashtags van aparte y una sola vez
  const elegidaPub = elegirVariante(publicaciones.filter((p) => p.texto))
  if (elegidaPub) {
    for (const otra of elegidaPub.otras) alternativas.push(`texto de publicación (variante ${otra.letra}): ${limpiarPie(otra.texto)}`)
    if (elegidaPub.otras.length) avisos.push(`el director dejó ${publicaciones.length} variantes del texto de publicación; se usó la ${elegidaPub.usada.letra}${publicaciones.some((p) => p.elegida) ? ' (la marcada como elegida)' : ' (la primera: no marcó una)'} y las otras quedan anotadas como alternativa`)
  }
  const pieLimpio = limpiarPie(pie)
  const principal = elegidaPub ? limpiarPie(elegidaPub.usada.texto) : ''
  pie = [principal, pieLimpio].filter(Boolean).join('\n\n')
  const imagenes: ImagenPedida[] = []
  const falla = (motivo: string): Traduccion => ({ ok: false, motivo, pie_de_foto: pie, hashtags: tags, imagenes, avisos })

  if (tipo === 'carrusel') {
    const bloques = cuerpo.filter((s) => /^(l[aá]mina|slide|diapositiva|tarjeta|\d)/i.test(sinTildes(s.titulo).trim()) || Object.keys(campos(s.lineas).valores).some((k) => k === 'headline'))
    if (!bloques.length) return falla('no encontré láminas (un encabezado por lámina)')
    const laminas: Lamina[] = []
    const sinTitulo: number[] = []
    bloques.slice(0, 10).forEach((s, i) => {
      const leidos = campos(s.lineas, `lámina ${i + 1}`)
      const c = leidos.valores
      alternativas.push(...leidos.alternativas); avisos.push(...leidos.avisos)
      let headline = c.headline ?? ''
      let body = c.body ?? ''
      if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
      // P1 · solo texto final: sin markdown, sin límites entre paréntesis y sin notas del director
      const limpio = (campo: string, v: string, parrafos = false): string => {
        const t = limpiarTexto(v, parrafos)
        if (t && esNotaDelDirector(t)) { avisos.push(`lámina ${i + 1}: el ${campo} traía una nota del director y no se dibujó`); return '' }
        return t
      }
      headline = limpio('título', headline); body = limpio('texto', body, true)
      const cta = esInstruccionDeBoton(c.cta ?? '') ? '' : limpio('llamado', c.cta ?? '')
      const eyebrow = limpio('sobre-título', c.eyebrow ?? '')
      if (!headline) { sinTitulo.push(i + 1); return }
      const rol = rolDe(s.titulo, i, Math.min(bloques.length, 10), !!cta)
      const l: Lamina = { orden: i + 1, rol, headline, ...(body ? { body } : {}), ...(cta ? { cta } : {}), ...(eyebrow ? { eyebrow } : {}) }
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
      ok: true, pie_de_foto: pie || (laminas[0].headline), hashtags: tags, laminas, imagenes, avisos, ...(alternativas.length ? { alternativas } : {}),
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
    const leidos = campos(s.lineas, `«${ref}»`)
    const c = leidos.valores
    alternativas.push(...leidos.alternativas); avisos.push(...leidos.avisos)
    let headline = c.headline ?? ''
    let body = c.body ?? ''
    if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
    const limpio = (campo: string, v: string, parrafos = false): string => {
      const t = limpiarTexto(v, parrafos)
      if (t && esNotaDelDirector(t)) { avisos.push(`«${ref}»: el ${campo} traía una nota del director y no se dibujó`); return '' }
      return t
    }
    headline = limpio('título', headline); body = limpio('texto', body, true)
    const cta = esInstruccionDeBoton(c.cta ?? '') ? '' : limpio('llamado', c.cta ?? '')
    const eyebrow = limpio('sobre-título', c.eyebrow ?? '')
    if (!headline) { faltan.push(ref); return }
    copy.push({ ref, headline, ...(body ? { body } : {}), ...(cta ? { cta } : {}), ...(eyebrow ? { eyebrow } : {}) })
    estructura.push({ ref, rol: o.tipoPorRef?.[ref] ?? 'historia', beat: o.temaPorRef?.[ref] ?? headline.slice(0, 60), mood: c.mood ?? '' })
    imagenes.push(leerImagen(ref, c.imagen))
    if (headline.length > 60) avisos.push(`«${ref}»: el titular trae ${headline.length} caracteres; el dibujo se ajusta al texto`)
  })
  if (faltan.length && (o.preguntasHechas ?? 0) < maxP) return { ok: false, pregunta: `No encuentro texto para ${faltan.map((r) => `«${r}»`).join(', ')}. ¿Cuál es el título de ${faltan.length === 1 ? 'ese elemento' : 'esos elementos'}?`, pie_de_foto: pie, hashtags: tags, imagenes: [], avisos }
  if (!copy.length) return falla('ningún elemento del kit trae título')
  return { ok: true, pie_de_foto: pie, hashtags: tags, copy_kit: copy, estructura, imagenes, avisos, ...(alternativas.length ? { alternativas } : {}) }
}

/** ¿la pieza pide generar alguna imagen? (para saber si la especialidad de imagen es pertinente) */
export function hayImagenesAGenerar(md: string, tipo: TipoDePieza, refsDelKit: string[] = []): boolean {
  const t = traducirPieza(md, tipo, { refsDelKit, preguntasHechas: 99 })
  return t.imagenes.some((i) => i.modo === 'generada')
}
