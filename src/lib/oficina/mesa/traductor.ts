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
import { refDeCuadro, type ElementoDeCopyKit, type ElementoDeEstructura, type Lamina } from '../laminas'
import type { TipoDePieza } from './tipos'

/**
 * 16-nov · Sprint 1 · Mejoras 1 y 2 · lo que la pieza tiene que LOGRAR y la escena que se pensó para ella viajan con cada imagen hasta el brazo
 * (antes el brazo recibía solo la frase «Imagen: generar: …» y los planos sueltos del brief). Todo opcional: lo que falta se avisa, nunca bloquea.
 */
export interface ConceptoDeImagen {
  /** la idea de ESTA lámina o elemento (o la de la pieza, si la lámina no trae una propia) */
  idea?: string
  /** la escena de ESTA lámina: qué se ve */
  que_se_ve?: string
  /** el mensaje que la imagen acompaña (el título de la lámina) */
  mensaje?: string
  /** la emoción que la escena tiene que dar (GO Sprint 1 · «concepto, mensaje, emoción, plato/foto a usar») */
  emocion?: string
  /** lo que la pieza tiene que lograr (lo declaró la dirección o, si no, el brief) */
  objetivo?: string
}
type ConConcepto = { concepto?: ConceptoDeImagen }
export type ImagenPedida = ({ ref: string; modo: 'real'; foto_id: string } & ConConcepto) | ({ ref: string; modo: 'generada'; descripcion: string } & ConConcepto) | ({ ref: string; modo: 'ninguna' } & ConConcepto)

export interface Traduccion {
  /** false = no se pudo traducir: la pieza completa va a la jefatura como texto */
  ok: boolean
  /** 16-nov · Mejora 1 · lo que la pieza tiene que lograr: el que declaró la dirección o, si no lo declaró, el del brief (con aviso) */
  objetivo?: string
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
  /** 17-nov · post (foto con mesa): la pieza con la forma que lee la cola de la sala 1 (`pieza_post.v1`) */
  pieza_post?: { pie_de_foto: string; hashtags: string[]; llamado?: string; texto_en_imagen: { etiqueta?: string; titular?: string; bajada?: string; boton?: string } }
  /** avisos para el equipo (nunca rechazos) */
  avisos: string[]
  /** las variantes que el director dejó y NO se usaron (quedan anotadas; no se dibujan) */
  alternativas?: string[]
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const CAMPOS: Array<[RegExp, 'headline' | 'body' | 'cta' | 'eyebrow' | 'imagen' | 'mood' | 'concepto' | 'que_se_ve' | 'objetivo' | 'emocion' | 'firma']> = [
  // 17-nov · GO Lenovo (c) · la firma o pie del cuadro (marca, zona, web, en letra chica abajo): campo PROPIO; antes iba dentro de «Qué se ve» y se perdía
  [/^(firma|pie de (la )?lamina|pie del cuadro|firma de (la )?lamina)$/, 'firma'],
  // 16-nov · Mejora 2 · el concepto y la escena de la lámina: NO se dibujan como texto; viajan con la imagen
  [/^(concepto|idea)$/, 'concepto'],
  [/^(que se ve|se ve|escena)$/, 'que_se_ve'],
  [/^(emocion|sensacion)$/, 'emocion'],
  // 16-nov · Mejora 1 · «Objetivo (de la pieza): …» dentro de una lámina es de la PIEZA (lo lee `objetivoDeclarado`): se guarda aparte para que no se pegue al campo anterior
  [/^objetivo( de (la|esta) pieza)?$/, 'objetivo'],
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
    .replace(NOTA_EN_CURSIVA, '')
    .replace(/\*\*|__/g, '')
    .replace(/\s*\([^()]*(?:≤|<=|\bcar\.|\bcaracteres\b|\bm[aá]x\.)[^()]*\)/gi, '')
    .replace(/≤\s*/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
  return parrafos ? sin.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : sin.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

/** 11-nov · fila #20 · «<nota del director>: <texto>» → «<texto>»; sin rótulo al principio, o sin texto después, devuelve lo mismo */
export function sinRotuloDelDirector(v: string): string {
  const m = /^\s*([^:–—\n]{1,60}?)\s*[:–—]\s*([\s\S]+)$/.exec(v)
  if (!m || !NOTA_DEL_DIRECTOR.test(m[1]) || !m[2].trim()) return v
  return m[2].trim()
}

/** 28-nov · GO Lenovo · una ficha de diseño (tabla markdown: «| Bloque | Contenido |» con su «|---|») es para quien compone, no se dibuja */
const FICHA_EN_TABLA = /\|\s*:?-{3,}|^\s*\|[^|\n]*\|[^|\n]*\|/m

/** ¿esto sigue siendo una nota del director aunque se haya limpiado? (no se dibuja) */
export const esNotaDelDirector = (v: string): boolean => NOTA_DEL_DIRECTOR.test(v) || FICHA_EN_TABLA.test(v)

/** 28-nov · GO Lenovo · las notas en cursiva entre paréntesis («*(publicar si … antes del 6-dic)*»): el director habla al equipo; `limpiarTexto` las quita y quien llama avisa */
const NOTA_EN_CURSIVA = /\s*(?:\*|_)\([^()]*\)(?:\*|_)/g
export const notasEnCursiva = (v: string): string[] => [...String(v ?? '').matchAll(NOTA_EN_CURSIVA)].map((m) => m[0].trim())

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
/**
 * 17-nov · un solo molde «nada se pierde sin aviso» (REAPERTURA de CC6 · GO Lenovo 13:00Z) · un título pegado al texto anterior («…las citas.**# Propuesta 1 · …»)
 * pasa a su propia línea: si no, su sección desaparece dentro de la anterior. Solo corta `#`–`####` + espacio DESPUÉS de un signo de cierre o de `**` (un «#etiqueta» sin espacio no se toca).
 * Lo reusan el reel y el corte de propuestas en imagen (CC1). Puro.
 */
export function separarTitulosPegados(md: string): string {
  return String(md ?? '').replace(/\r/g, '').replace(/([.!?…:;»"”)\]]|\*\*)[ \t]*(#{1,4}[ \t]+\S)/g, '$1\n$2')
}

/** lo que la pieza trae ANTES de su primer título (sin títulos pegados): ahí no hay sección y el corte no lo lee. Puro */
export function textoAntesDelPrimerTitulo(md: string): string {
  const lineas = separarTitulosPegados(md).split('\n')
  const i = lineas.findIndex((l) => /^\s{0,3}#{1,4}\s+\S/.test(l))
  return (i < 0 ? [] : lineas.slice(0, i)).join('\n').trim()
}

/** ¿ese texto trae campos de la pieza («Título: …», «Imagen: …»)? (si es solo la narración del agente, no) */
export const traeCamposDeLaPieza = (texto: string): boolean => Object.keys(campos(texto.split('\n')).valores).some((k) => k !== 'suelto')

function secciones(md: string): Seccion[] {
  const out: Seccion[] = []
  let cur: Seccion | null = null
  for (const l of separarTitulosPegados(md).split('\n')) {
    const h = /^\s{0,3}#{1,4}\s+(.*?)\s*#*\s*$/.exec(l)
    if (h) { cur = { titulo: h[1].trim(), lineas: [] }; out.push(cur) } else if (cur) cur.lineas.push(l)
  }
  return out
}

/** un campo que solo trae un guion («—», «–», «-», «−») está vacío */
const ES_GUION_SOLO = /^[\s—–\-−]+$/

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
    // 17-nov · GO Lenovo (b) · «—» (o un guion solo) es VACÍO, nunca texto: en un campo de texto no se dibuja; en «Imagen» vale «ninguna»
    if (ES_GUION_SOLO.test(r[k])) r[k] = k === 'imagen' ? 'ninguna' : ''
  }
  return { valores: r, alternativas, avisos }
}

/** el concepto que viaja con la imagen: solo las partes que existen (sin claves vacías) */
function conceptoDe(c: ConceptoDeImagen): ConceptoDeImagen | undefined {
  const out: ConceptoDeImagen = {}
  for (const k of ['idea', 'que_se_ve', 'mensaje', 'emocion', 'objetivo'] as const) { const v = limpiarTexto(c[k] ?? ''); if (v) out[k] = v }
  return Object.keys(out).length ? out : undefined
}

function leerImagen(ref: string, texto: string | undefined, concepto: ConceptoDeImagen = {}): ImagenPedida {
  // el director escribe la foto entre comillas inversas («foto:`0443a42d`») y a veces deja una condición («si resiste: usar recorte. Si no: generar: …»)
  let t = String(texto ?? '').replace(/`/g, '').replace(/\*\*/g, '').trim()
  const con = conceptoDe(concepto)
  const extra = con ? { concepto: con } : {}
  // 17-nov · nada se pierde sin aviso (REAPERTURA · observación de CC1 en #1125 · GO Lenovo): sin imagen, pero la dirección visual de la lámina («Qué se ve», idea) se conserva
  if (t && /^(ninguna|sin imagen|no)\b/i.test(t)) return { ref, modo: 'ninguna', ...extra }
  // 16-nov · Mejora 2 · sin «Imagen:» pero con la escena de la lámina («Qué se ve:»): se genera esa escena (antes: ninguna imagen)
  if (!t) return con?.que_se_ve ? { ref, modo: 'generada', descripcion: con.que_se_ve, ...extra } : { ref, modo: 'ninguna' }
  const f = /^(?:foto(?: propia)?|real)\s*[:·-]\s*([A-Za-z0-9_.-]{4,80})/i.exec(t)
  if (f) return { ref, modo: 'real', foto_id: f[1], ...extra }
  const g = /^(?:generar|generada|generad[ao]|crear)\s*[:·-]?\s*([\s\S]+)$/i.exec(t)
  if (g && g[1].trim()) return { ref, modo: 'generada', descripcion: g[1].trim(), ...extra }
  const despues = /\bgenerar\s*:\s*([\s\S]+)$/i.exec(t)
  if (despues && despues[1].trim()) t = despues[1].trim()
  return { ref, modo: 'generada', descripcion: t, ...extra }
}

/** 16-nov · Mejora 1 · el objetivo de la pieza que declaró la dirección: sección `## Objetivo` o línea `Objetivo (de la pieza): …` en cualquier parte */
function objetivoDeclarado(todas: Seccion[]): string {
  const sec = todas.find((s) => esSeccionDeObjetivo(s.titulo))
  if (sec) { const t = limpiarTexto(sec.lineas.join('\n')); if (t) return t }
  for (const s of todas) for (const l of s.lineas) {
    const m = /^\s*[-*•]?\s*\*{0,2}objetivo(?: de (?:la|esta) pieza)?\*{0,2}\s*:\s*(.+)$/i.exec(l)
    if (m && limpiarTexto(m[1])) return limpiarTexto(m[1])
  }
  return ''
}
/** la idea de la pieza entera (`## Concepto`), para las láminas que no traen la suya */
function conceptoDeLaPieza(todas: Seccion[]): string {
  const sec = todas.find((s) => esSeccionDeConcepto(s.titulo))
  return sec ? limpiarTexto(sec.lineas.join('\n')) : ''
}

const esSeccionDePie = (t: string) => /^(pie( de foto)?|caption|descripci[oó]n)\b/i.test(t.trim())
const esSeccionDeTextoDePublicacion = (t: string) => /^texto de publicaci[oó]n\b/i.test(sinTildes(t).trim()) || /^texto de publicacion\b/i.test(sinTildes(t).trim())
const esSeccionDeEtiquetas = (t: string) => /^(etiquetas|hashtags)\b/i.test(t.trim())
const esSeccionDeObjetivo = (t: string) => /^objetivo\b/.test(sinTildes(t).trim())
const esSeccionDeConcepto = (t: string) => /^concepto( de la pieza)?\s*$/.test(sinTildes(t).trim())
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

export interface OpcionesDeTraduccion { refsDelKit?: string[]; tipoPorRef?: Record<string, 'historia' | 'estado'>; temaPorRef?: Record<string, string>; preguntasHechas?: number; maxPreguntas?: number; /** 11-nov · fila #20 · el máximo de láminas del formato (dato de la plantilla); sin dato, 10 */ maxLaminas?: number; /** 16-nov · Mejora 1 · el OBJETIVO del brief de la pieza (la hoja): se usa si la dirección no declaró uno */ objetivoDelBrief?: string; /** 16-nov · Mejora 2 · la IDEA DE LA PIEZA que trae la fila (la hoja): para las láminas sin idea propia cuando la dirección no dejó `## Concepto` */ ideaDelBrief?: string; /** 17-nov · GO Lenovo (a) · el máximo de cuadros por elemento del kit (dato de la plantilla: `cuadros_por_elemento_max`); sin dato, 10 */ maxCuadros?: number }

export function traducirPieza(md: string, tipo: TipoDePieza, o: OpcionesDeTraduccion = {}): Traduccion {
  const t = traducir(md, tipo, o)
  // 16-nov · Mejora 1 · sin objetivo declarado: aviso para el equipo, al final de la lista, y la pieza sigue (no es reja)
  if (!objetivoDeclarado(secciones(md))) t.avisos.push(limpiarTexto(o.objetivoDelBrief ?? '') ? 'la dirección no declaró el objetivo de la pieza; se usa el del brief' : 'ni la dirección ni el brief declaran el objetivo de la pieza')
  return t
}

function traducir(md: string, tipo: TipoDePieza, o: OpcionesDeTraduccion): Traduccion {
  const maxP = o.maxPreguntas ?? 1
  const todas = secciones(md)
  const avisos: string[] = []
  // 16-nov · Mejora 1 · la dirección declara lo que la pieza tiene que lograr; si no lo hizo, se avisa y se usa el del brief (nunca bloquea)
  const declarado = objetivoDeclarado(todas)
  const delBrief = limpiarTexto(o.objetivoDelBrief ?? '')
  const objetivo = declarado || delBrief
  // el aviso de objetivo sin declarar va AL FINAL de la lista (los avisos de la pieza mandan primero): lo agrega la envoltura `traducirPieza`
  const ideaDeLaPieza = conceptoDeLaPieza(todas) || limpiarTexto(o.ideaDelBrief ?? '')
  const conObjetivo = objetivo ? { objetivo } : {}
  const alternativas: string[] = []
  // 17-nov · un solo molde «nada se pierde sin aviso»: el título pegado se separa (y se dice); lo que trae campos ANTES del primer título no se dibuja, se dice y queda anotado
  if (separarTitulosPegados(md) !== String(md ?? '').replace(/\r/g, '')) avisos.push('un título venía pegado al texto anterior: se separó para no perder su sección')
  const antes = textoAntesDelPrimerTitulo(md)
  if (antes && traeCamposDeLaPieza(antes)) {
    avisos.push(`texto antes del primer título: ${antes.split('\n').filter((l) => l.trim()).length} línea(s) sin título; no se dibujaron y quedan anotadas como alternativa`)
    alternativas.push(`texto sin título: ${limpiarTexto(antes)}`.slice(0, 600))
  }
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
    // 16-nov · el objetivo y el concepto de la pieza no son láminas ni elementos (en el kit, contarlos correría el orden)
    else if (esSeccionDeObjetivo(s.titulo) || esSeccionDeConcepto(s.titulo)) continue
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
  const falla = (motivo: string): Traduccion => ({ ok: false, motivo, pie_de_foto: pie, hashtags: tags, imagenes, avisos, ...conObjetivo })

  if (tipo === 'carrusel') {
    const bloques = cuerpo.filter((s) => /^(l[aá]mina|slide|diapositiva|tarjeta|\d)/i.test(sinTildes(s.titulo).trim()) || Object.keys(campos(s.lineas).valores).some((k) => k === 'headline'))
    if (!bloques.length) return falla('no encontré láminas (un encabezado por lámina)')
    const laminas: Lamina[] = []
    const sinTitulo: number[] = []
    // 11-nov · fila #20 del barrido de reglas rígidas (GO Lenovo 03:55Z): el máximo sale del dato del formato y, si el director dejó más, se AVISA y las que sobran quedan anotadas (antes se cortaba en 10 sin decir nada)
    const maxLam = typeof o.maxLaminas === 'number' && Number.isInteger(o.maxLaminas) && o.maxLaminas > 0 ? o.maxLaminas : 10
    if (bloques.length > maxLam) {
      avisos.push(`el director dejó ${bloques.length} láminas y el formato admite ${maxLam}: se dibujan las primeras ${maxLam}; las otras ${bloques.length - maxLam} quedan anotadas como alternativa`)
      for (const s of bloques.slice(maxLam)) alternativas.push(`lámina que no entró (${s.titulo.trim()}): ${limpiarTexto(s.lineas.join(' '))}`.slice(0, 600))
    }
    bloques.slice(0, maxLam).forEach((s, i) => {
      const leidos = campos(s.lineas, `lámina ${i + 1}`)
      const c = leidos.valores
      alternativas.push(...leidos.alternativas); avisos.push(...leidos.avisos)
      let headline = c.headline ?? ''
      let body = c.body ?? ''
      if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
      // P1 · solo texto final: sin markdown, sin límites entre paréntesis y sin notas del director
      const limpio = (campo: string, v: string, parrafos = false): string => {
        let t = limpiarTexto(v, parrafos)
        for (const n of notasEnCursiva(v)) avisos.push(`lámina ${i + 1}: el ${campo} traía la nota «${n}» del director y no se dibujó`)
        // 11-nov · fila #20 · una nota del director usada como RÓTULO («Texto en imagen: Oferta de la semana») ya no vacía el campo: se quita el rótulo y queda el texto
        const r = sinRotuloDelDirector(t)
        if (r !== t) { avisos.push(`lámina ${i + 1}: el ${campo} traía el rótulo «${t.slice(0, t.length - r.length).replace(/[\s:–—-]+$/, '')}» del director; se dibujó solo el texto`); t = r }
        if (t && esNotaDelDirector(t)) { avisos.push(`lámina ${i + 1}: el ${campo} traía una nota del director y no se dibujó`); return '' }
        return t
      }
      headline = limpio('título', headline); body = limpio('texto', body, true)
      const cta = esInstruccionDeBoton(c.cta ?? '') ? '' : limpio('llamado', c.cta ?? '')
      const eyebrow = limpio('sobre-título', c.eyebrow ?? '')
      if (!headline) { sinTitulo.push(i + 1); return }
      const rol = rolDe(s.titulo, i, Math.min(bloques.length, maxLam), !!cta)
      const l: Lamina = { orden: i + 1, rol, headline, ...(body ? { body } : {}), ...(cta ? { cta } : {}), ...(eyebrow ? { eyebrow } : {}) }
      laminas.push(l)
      imagenes.push(leerImagen(rol, c.imagen, { idea: c.concepto || ideaDeLaPieza, que_se_ve: c.que_se_ve, mensaje: headline, emocion: c.emocion, ...conObjetivo }))
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
      ok: true, pie_de_foto: pie || (laminas[0].headline), hashtags: tags, laminas, imagenes, avisos, ...conObjetivo, ...(alternativas.length ? { alternativas } : {}),
      copy_carrusel: { texto_base: todoElTexto, pie_de_foto: pie || laminas[0].headline, hashtags: tags, ...(llamado ? { llamado } : {}) },
    }
  }

  // 17-nov · la FOTO con mesa (tramo B): UNA pieza · lo que va escrito sobre la imagen (etiqueta, titular, bajada, botón), su imagen y el texto de la publicación
  if (tipo === 'post') {
    const lineas = cuerpo.flatMap((s) => s.lineas)
    const leidos = campos(lineas, 'la pieza')
    const c = leidos.valores
    alternativas.push(...leidos.alternativas); avisos.push(...leidos.avisos)
    const limpio = (campo: string, v: string, parrafos = false): string => {
      const t = limpiarTexto(v, parrafos)
      for (const n of notasEnCursiva(v)) avisos.push(`el ${campo} traía la nota «${n}» del director y no se escribió sobre la imagen`)
      if (t && esNotaDelDirector(t)) { avisos.push(`el ${campo} traía una nota del director y no se escribió sobre la imagen`); return '' }
      return t
    }
    const titular = limpio('título', c.headline ?? '')
    const bajada = limpio('texto', c.body ?? '', true)
    const etiqueta = limpio('sobre-título', c.eyebrow ?? '')
    const llamado = esInstruccionDeBoton(c.cta ?? '') ? '' : limpio('llamado', c.cta ?? '')
    // sin texto de publicación ni titular no hay pieza: UNA pregunta a la dirección; después, lo que haya
    if (!pie && !titular && (o.preguntasHechas ?? 0) < maxP) return { ok: false, pregunta: 'No encuentro ni el texto de la publicación (## Pie) ni el titular de la imagen. ¿Cuál es el texto de esta publicación?', pie_de_foto: pie, hashtags: tags, imagenes: [], avisos }
    const pieFinal = pie || [titular, bajada].filter(Boolean).join('\n\n')
    if (!pieFinal) return falla('la pieza no trae texto de publicación ni titular')
    if (!pie) avisos.push('la dirección no dejó texto de publicación (## Pie): se usa el titular y el texto de la imagen')
    imagenes.push(leerImagen('pieza', c.imagen, { idea: c.concepto || ideaDeLaPieza, que_se_ve: c.que_se_ve, mensaje: titular || pieFinal.slice(0, 120), emocion: c.emocion, ...conObjetivo }))
    const texto_en_imagen = { ...(etiqueta ? { etiqueta } : {}), ...(titular ? { titular } : {}), ...(bajada ? { bajada } : {}), ...(llamado ? { boton: llamado } : {}) }
    return { ok: true, pie_de_foto: pieFinal, hashtags: tags, imagenes, avisos, ...conObjetivo, ...(alternativas.length ? { alternativas } : {}), pieza_post: { pie_de_foto: pieFinal, hashtags: tags, ...(llamado ? { llamado } : {}), texto_en_imagen } }
  }

  // kit de historias · 17-nov · GO Lenovo (a) «el traductor del kit no tira nada»: cada elemento del brief recibe TODAS las secciones que la dirección le escribió, como cuadros
  //   de su historia (el 1.º con el ref del elemento; los siguientes, `<ref>-c2`, `-c3`…, del mismo destino, día y hora). El máximo es dato del formato (`maxCuadros`; sin dato, 10):
  //   lo que pasa del máximo se AVISA y queda anotado como alternativa, igual que en el carrusel. Antes: una sección por elemento y la sobrante desaparecía sin aviso.
  const refs = o.refsDelKit ?? []
  if (!refs.length) return falla('el kit no tiene elementos de referencia')
  const maxC = typeof o.maxCuadros === 'number' && Number.isInteger(o.maxCuadros) && o.maxCuadros > 0 ? o.maxCuadros : 10
  const grupos = gruposDelKit(cuerpo, refs)
  if (grupos.repartidas) avisos.push(`la dirección escribió ${cuerpo.length} secciones sin nombrar su elemento y el brief tiene ${refs.length}: ${grupos.repartidas}`)
  const copy: ElementoDeCopyKit[] = []
  const estructura: ElementoDeEstructura[] = []
  const faltan: string[] = []
  const sinTituloExtra: Array<{ ref: string; s: Seccion }> = []
  refs.forEach((ref) => {
    const suyas = grupos.porRef.get(ref) ?? []
    if (!suyas.length) { faltan.push(ref); return }
    if (suyas.length > maxC) {
      avisos.push(`«${ref}»: la dirección dejó ${suyas.length} cuadros y el formato admite ${maxC}: se dibujan los primeros ${maxC}; los otros ${suyas.length - maxC} quedan anotados como alternativa`)
      for (const s of suyas.slice(maxC)) alternativas.push(`cuadro de «${ref}» que no entró (${s.titulo.trim()}): ${limpiarTexto(s.lineas.join(' '))}`.slice(0, 600))
    }
    suyas.slice(0, maxC).forEach((s, j) => {
      const refC = j === 0 ? ref : refDeCuadro(ref, j + 1)
      const leidos = campos(s.lineas, `«${refC}»`)
      const c = leidos.valores
      alternativas.push(...leidos.alternativas); avisos.push(...leidos.avisos)
      let headline = c.headline ?? ''
      let body = c.body ?? ''
      if (!headline && c.suelto) { const [primera, ...resto] = c.suelto.split('\n'); headline = primera; body = body || resto.join(' ').trim() }
      const limpio = (campo: string, v: string, parrafos = false): string => {
        const t = limpiarTexto(v, parrafos)
        for (const n of notasEnCursiva(v)) avisos.push(`«${refC}»: el ${campo} traía la nota «${n}» del director y no se dibujó`)
        if (t && esNotaDelDirector(t)) { avisos.push(`«${refC}»: el ${campo} traía una nota del director y no se dibujó`); return '' }
        return t
      }
      headline = limpio('título', headline); body = limpio('texto', body, true)
      const cta = esInstruccionDeBoton(c.cta ?? '') ? '' : limpio('llamado', c.cta ?? '')
      const eyebrow = limpio('sobre-título', c.eyebrow ?? '')
      const firma = limpio('firma', c.firma ?? '')
      if (!headline) { if (j === 0) faltan.push(ref); else { faltan.push(refC); sinTituloExtra.push({ ref: refC, s }) } return }
      copy.push({ ref: refC, ...(j > 0 ? { de: ref, cuadro: j + 1 } : {}), headline, ...(body ? { body } : {}), ...(cta ? { cta } : {}), ...(eyebrow ? { eyebrow } : {}), ...(firma ? { firma } : {}) })
      estructura.push({ ref: refC, ...(j > 0 ? { de: ref } : {}), rol: o.tipoPorRef?.[ref] ?? 'historia', beat: (j === 0 ? o.temaPorRef?.[ref] : undefined) ?? headline.slice(0, 60), mood: c.mood ?? '' })
      imagenes.push(leerImagen(refC, c.imagen, { idea: c.concepto || ideaDeLaPieza, que_se_ve: c.que_se_ve, mensaje: headline, emocion: c.emocion, ...conObjetivo }))
      if (headline.length > 60) avisos.push(`«${refC}»: el titular trae ${headline.length} caracteres; el dibujo se ajusta al texto`)
    })
  })
  if (faltan.length && (o.preguntasHechas ?? 0) < maxP) return { ok: false, pregunta: `No encuentro texto para ${faltan.map((r) => `«${r}»`).join(', ')}. ¿Cuál es el título de ${faltan.length === 1 ? 'ese elemento' : 'esos elementos'}? Escríbelo en su sección (## <ref>, con «Título: …»).`, pie_de_foto: pie, hashtags: tags, imagenes, avisos, ...conObjetivo }
  // un cuadro de más que sigue sin título tras la pregunta NO se pierde en silencio: se avisa y queda como alternativa
  for (const x of sinTituloExtra) {
    avisos.push(`«${x.ref}»: el cuadro no trae título y no se dibujó; queda anotado como alternativa`)
    alternativas.push(`cuadro sin título (${x.s.titulo.trim()}): ${limpiarTexto(x.s.lineas.join(' '))}`.slice(0, 600))
  }
  if (!copy.length) return falla('ningún elemento del kit trae título')
  return { ok: true, pie_de_foto: pie, hashtags: tags, copy_kit: copy, estructura, imagenes, avisos, ...conObjetivo, ...(alternativas.length ? { alternativas } : {}) }
}

/**
 * 17-nov · GO Lenovo (a) · qué secciones de la pieza son de qué elemento del kit (puro):
 *  · una sección que NOMBRA un ref es de ese elemento;
 *  · una que no nombra ninguno va, en orden, al próximo elemento que ninguna sección nombra (como antes: por orden); si ya no queda ninguno, es un cuadro más del elemento de la sección anterior;
 *  · si NINGUNA nombra un ref: una por elemento en orden y las de más, como cuadros del ÚLTIMO elemento (se avisa).
 */
export function gruposDelKit<S extends { titulo: string }>(cuerpo: S[], refs: string[]): { porRef: Map<string, S[]>; repartidas: string | null } {
  const porRef = new Map<string, S[]>(refs.map((r) => [r, [] as S[]]))
  if (!refs.length) return { porRef, repartidas: null }
  const nombra = cuerpo.map((s) => refs.find((r) => sinTildes(s.titulo).includes(sinTildes(r))) ?? null)
  if (!nombra.some(Boolean)) {
    cuerpo.forEach((s, i) => porRef.get(refs[Math.min(i, refs.length - 1)])!.push(s))
    const de = cuerpo.length - refs.length
    return { porRef, repartidas: de > 0 && refs.length > 1 ? `las ${de} de más quedaron como cuadros de «${refs[refs.length - 1]}»` : null }
  }
  const libres = refs.filter((r) => !nombra.includes(r))
  let previo: string | null = null
  cuerpo.forEach((s, i) => {
    const ref = nombra[i] ?? libres.shift() ?? previo ?? refs[0]
    porRef.get(ref)!.push(s)
    previo = ref
  })
  return { porRef, repartidas: null }
}

/**
 * 16-nov · Mejora 2 · el pedido al generador de imagen: la escena que pidió la dirección y, debajo, el concepto de la pieza como CONTEXTO (no se escribe en la imagen).
 * Sin concepto, el pedido es la descripción tal cual (como antes). Cuando exista el ingeniero de prompts (Mejora 4), él recibe el mismo `concepto` por la misma vía.
 */
export function pedidoDeImagen(descripcion: string, concepto?: ConceptoDeImagen): string {
  const d = String(descripcion ?? '').trim()
  if (!concepto) return d
  const partes = [
    concepto.idea ? `idea: ${concepto.idea}` : '',
    concepto.que_se_ve && concepto.que_se_ve !== d ? `qué se ve: ${concepto.que_se_ve}` : '',
    concepto.mensaje ? `mensaje que acompaña: ${concepto.mensaje}` : '',
    concepto.emocion ? `emoción: ${concepto.emocion}` : '',
    concepto.objetivo ? `lo que la pieza tiene que lograr: ${concepto.objetivo}` : '',
  ].filter(Boolean)
  if (!partes.length) return d
  return `${d}\n\nContexto de la pieza (solo para entender la escena; no se escribe en la imagen): ${partes.join(' · ')}.\nLa imagen no lleva textos, letras, logos ni marcas de agua: el texto lo pone la composición.`
}

/** ¿la pieza pide generar alguna imagen? (para saber si la especialidad de imagen es pertinente) */
export function hayImagenesAGenerar(md: string, tipo: TipoDePieza, refsDelKit: string[] = []): boolean {
  const t = traducirPieza(md, tipo, { refsDelKit, preguntasHechas: 99 })
  return t.imagenes.some((i) => i.modo === 'generada')
}
