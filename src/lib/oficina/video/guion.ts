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

/**
 * 16-nov · Sprint 2 · S2-1 (CC1) · HOJA DE PLANOS · los roles que un plano cumple en la historia (método rea-video, reescrito). Es una GUÍA para la mesa, no una
 * lista cerrada: un rol que no está aquí se conserva tal cual lo escribió la dirección (sin aviso). Sirve para que la mirada y la jefatura juzguen cada plano contra
 * lo que tenía que hacer, no contra las tomas de la fila.
 */
// 17-nov · la lista es UNA: la de la biblioteca de planos de CC4 (S2-2); aquí solo se re-exporta para quien la importaba del guion
import { ROLES_DEL_PLANO } from './biblioteca'
export { ROLES_DEL_PLANO }

/** lo que escribió la dirección → la clave del rol (la misma de la biblioteca de planos de CC4, S2-2) si coincide; si no, el texto tal cual (guía, no lista cerrada) */
export function rolDelPlano(texto: string): string {
  const t = sinTildes(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const alias: Array<[RegExp, (typeof ROLES_DEL_PLANO)[number]]> = [
    [/^(captar|gancho|enganchar|atrapar)\b/, 'captar'],
    [/^(situar|ubicar|contexto|presentar)\b/, 'situar'],
    [/^(informar|explicar|mostrar)\b/, 'informar'],
    [/^(dar prueba|prueba|demostrar|demostracion)\b/, 'prueba'],
    [/^(giro|sorpresa|revelacion)\b/, 'giro'],
    [/^(conclusion|cierre|cerrar|remate)\b/, 'conclusion'],
    [/^(llamado|llamada|cta|call to action)\b/, 'llamado'],
    [/^(ambiente|atmosfera|clima)\b/, 'ambiente'],
  ]
  return alias.find(([re]) => re.test(t))?.[1] ?? texto.trim()
}

export interface Plano {
  n: number
  /** segundo en que empieza y en que termina (enteros; el último termina en `segundos`) */
  desde: number
  hasta: number
  se_ve: string
  movimiento?: string
  /** el texto que se COMPONE en edición sobre el plano (Sprint 2 · S2-5: lo dibuja el código con la plantilla de marca; la IA no escribe letras) */
  texto_en_pantalla?: string
  /** id de una foto PROPIA del cliente que sirve de referencia para este plano */
  foto_id?: string
  // ── Sprint 2 · S2-1 · la hoja de planos (todo opcional: el traductor sigue tolerante; lo que falta se avisa, no se rechaza) ──
  /** el rol del plano en la historia (ver `ROLES_DEL_PLANO`; guía, no lista cerrada) */
  rol?: string
  /** la información NUEVA que da este plano (si no da nada nuevo, sobra) */
  dice?: string
  /** lo que el plano tiene que lograr en quien mira */
  intencion?: string
  /** tamaño de plano: general, medio, primer plano, detalle… */
  tamano?: string
  lente?: string
  luz?: string
  /** ¿sale el producto en cuadro? (true = plano de producto: la foto real del cliente es la vara; false = ambiente, no recibe foto del producto) */
  producto?: boolean
  /** cómo termina el cuadro (posición, luz, utilería): el clip siguiente lo repite porque el modelo no ve el anterior */
  estado_final?: string
  /** el pedido de la IMAGEN CLAVE del plano (S2-3 · CC2): qué cuadro dibujar */
  prompt_imagen?: string
  /** el pedido del CLIP desde su imagen clave (S2-4 · CC3): solo movimiento y cámara, el proceso de la acción y su estado final */
  prompt_video?: string
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

type CampoDelPlano = 'se_ve' | 'movimiento' | 'texto_en_pantalla' | 'foto' | 'rol' | 'dice' | 'intencion' | 'tamano' | 'lente' | 'luz' | 'producto' | 'estado_final' | 'prompt_imagen' | 'prompt_video'
const CAMPOS: Array<[RegExp, CampoDelPlano]> = [
  [/^(se ve|imagen|descripcion|accion|escena|visual|que se ve)$/, 'se_ve'],
  [/^(movimiento|camara|camara y movimiento|ritmo|movimiento de camara)$/, 'movimiento'],
  [/^(texto en pantalla|texto|rotulo|sobreimpreso|texto compuesto|texto que se compone)$/, 'texto_en_pantalla'],
  [/^(foto|referencia|foto de referencia|foto propia|foto ancla)$/, 'foto'],
  // Sprint 2 · S2-1 · la hoja de planos
  [/^(rol|rol en la historia|funcion|funcion del plano)$/, 'rol'],
  [/^(dice|que dice|informacion nueva|que informacion nueva da|aporta)$/, 'dice'],
  [/^(intencion|objetivo del plano|lo que logra)$/, 'intencion'],
  [/^(tamano|tamano de plano|plano|encuadre)$/, 'tamano'],
  [/^(lente|optica|objetivo de camara)$/, 'lente'],
  [/^(luz|iluminacion)$/, 'luz'],
  [/^(producto|sale el producto|producto en cuadro)$/, 'producto'],
  [/^(estado final|termina|termina en|como termina|continuidad)$/, 'estado_final'],
  [/^(prompt de imagen|prompt imagen|imagen clave|pedido de imagen)$/, 'prompt_imagen'],
  [/^(prompt de video|prompt video|pedido de video|prompt del clip)$/, 'prompt_video'],
]

/** «sí», «si», «yes», «true» → true · «no», «false» → false · otra cosa → sin dato (no se adivina) */
function leerSiNo(v: string | undefined): boolean | undefined {
  const t = sinTildes(String(v ?? '').replace(/[`*]/g, '')).trim()
  if (/^(si|yes|true|sale|aparece)\b/.test(t)) return true
  if (/^(no|false|ninguno)\b/.test(t)) return false
  return undefined
}

/** la etiqueta de un campo del plano al principio de un trozo («Lente: 85 mm») o null */
function campoAlPrincipio(t: string): CampoDelPlano | null {
  const m = /^\*{0,2}([^:*\n]{2,40}?)\*{0,2}\s*:/.exec(t.trim())
  if (!m) return null
  const nombre = sinTildes(m[1]).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  return CAMPOS.find(([re]) => re.test(nombre))?.[1] ?? null
}

/** Sprint 2 · S2-1 · «Tamaño: detalle · Lente: 85 mm · Luz: lateral» → tres líneas. Solo se parte donde lo que sigue al «·» es OTRO campo del plano (un «·» dentro de «Se ve» no se toca) */
function partirCamposEnLinea(l: string): string[] {
  const trozos = l.split(/\s+·\s+/)
  if (trozos.length < 2 || !campoAlPrincipio(trozos[0])) return [l]
  const out = [trozos[0]]
  for (const t of trozos.slice(1)) { if (campoAlPrincipio(t)) out.push(t); else out[out.length - 1] += ` · ${t}` }
  return out
}

function campos(lineas: string[]): Record<string, string> {
  const r: Record<string, string> = {}
  let actual: string | null = null
  for (const raw of lineas.flatMap((x) => partirCamposEnLinea(x))) {
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

export function traducirGuion(md: string, o: { preguntasHechas?: number; maxPreguntas?: number; /** Sprint 2 · S2-1 · la duración aprobada es DATO de la plantilla (`limites.video.segundos_min/max`); sin ella, la de siempre (8–15 s) */ segundosMin?: number; segundosMax?: number } = {}): TraduccionDeGuion {
  const maxP = o.maxPreguntas ?? 1
  const MIN = Number.isFinite(o.segundosMin) && (o.segundosMin as number) > 0 ? Math.round(o.segundosMin as number) : DURACION_MIN_S
  const MAX = Number.isFinite(o.segundosMax) && (o.segundosMax as number) >= MIN ? Math.round(o.segundosMax as number) : Math.max(MIN, DURACION_MAX_S)
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
  const vacio = (motivo: string): TraduccionDeGuion => ({ ok: false, motivo, planos: [], segundos: MIN, audio, pie_de_foto: pie, hashtags: tags, fotos_ids: [], avisos })
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
    // Sprint 2 · S2-1 · los campos de la hoja (lo que no viene, no se inventa)
    for (const k of ['dice', 'intencion', 'tamano', 'lente', 'luz', 'estado_final'] as const) { const v = limpiarTexto(c[k] ?? ''); if (v) p[k] = v }
    const rol = limpiarTexto(c.rol ?? '')
    if (rol) p.rol = rolDelPlano(rol)
    for (const k of ['prompt_imagen', 'prompt_video'] as const) { const v = limpiarTexto(c[k] ?? '', true); if (v) p[k] = v }
    const prod = leerSiNo(c.producto)
    if (prod !== undefined) p.producto = prod
    planos.push(p)
  })
  if (sinQueVer.length && (o.preguntasHechas ?? 0) < maxP) {
    return { ...vacio('planos sin «Se ve»'), pregunta: `En ${sinQueVer.length === 1 ? 'el plano' : 'los planos'} ${sinQueVer.join(', ')} no encuentro qué se ve. ¿Qué muestra ${sinQueVer.length === 1 ? 'ese plano' : 'cada uno'}?` }
  }
  if (!planos.length) return vacio('ningún plano dice qué se ve')
  if (sinQueVer.length) avisos.push(`${sinQueVer.length} plano(s) sin «Se ve» se descartaron (${sinQueVer.join(', ')})`)

  // la duración: la del último plano con tiempos; sin tiempos, el mínimo aprobado repartido en partes iguales
  const conTiempos = planos.every((p) => p.desde >= 0 && p.hasta > p.desde)
  let total = conTiempos ? Math.max(...planos.map((p) => p.hasta)) : MIN
  if (total < MIN) { avisos.push(`el guion dura ${total} s y lo aprobado es de ${MIN} a ${MAX} s: se alarga a ${MIN} s`); total = MIN }
  if (total > MAX) { avisos.push(`el guion dura ${total} s y lo aprobado es de ${MIN} a ${MAX} s: se encaja en ${MAX} s`); total = MAX }
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
  // Sprint 2 · S2-1 · la hoja incompleta se AVISA en una sola línea por campo (no un aviso por plano: cada aviso es una sugerencia en los chequeos)
  const faltan = (nums: number[], que: string) => `${nums.length === planos.length ? 'ningún plano dice' : `${nums.length === 1 ? 'el plano' : 'los planos'} ${nums.join(', ')} no dice${nums.length === 1 ? '' : 'n'}`} ${que}`
  const sinRol = planos.filter((p) => !p.rol).map((p) => p.n)
  if (sinRol.length) avisos.push(faltan(sinRol, 'su rol en la historia: la mirada lo juzga contra lo que se ve'))
  const sinProducto = planos.filter((p) => p.producto === undefined).map((p) => p.n)
  if (sinProducto.length) avisos.push(faltan(sinProducto, 'si sale el producto: se toma de la foto (con foto propia, sí; sin foto, no)'))
  if (!audio) avisos.push('el guion no dice nada del audio: el modelo pone música o ambiente a su criterio')
  return { ok: true, planos, segundos: total, audio, pie_de_foto: pie, hashtags: tags, fotos_ids: fotos, avisos }
}

/**
 * el texto del pedido al modelo: un renglón por plano con sus segundos, y el audio; lo que el guion no dice no se inventa.
 * S2-5 · el «Texto en pantalla» del plano NO va al modelo: se compone después, por código, con la marca (`video-html.ts`); el modelo no escribe letras.
 */
export function promptDelGuion(t: Pick<TraduccionDeGuion, 'planos' | 'audio' | 'segundos'>, max = 3600): { prompt: string; recortado: boolean } {
  const lineas = t.planos.map((p) => `Plano ${p.n} (${p.desde}–${p.hasta} s): ${p.se_ve}${p.movimiento ? ` Cámara: ${p.movimiento}.` : ''}`)
  lineas.push(t.audio ? `Audio: ${t.audio}` : 'Audio: música o sonido ambiente acorde a la escena.')
  lineas.push(`Duración total: ${t.segundos} s.`)
  const prompt = lineas.join('\n')
  return prompt.length <= max ? { prompt, recortado: false } : { prompt: prompt.slice(0, max), recortado: true }
}

/** el guion legible para quien revisa o aprueba (la jefatura y la hoja de entrega) */
export function guionLegible(t: Pick<TraduccionDeGuion, 'planos' | 'audio' | 'segundos'>): string {
  return [
    // Sprint 2 · S2-1 · el rol, lo que dice y lo que logra van primero: quien revisa juzga el plano contra lo que tenía que hacer en la historia
    ...t.planos.map((p) => `Plano ${p.n} · ${p.desde}–${p.hasta} s${p.rol ? ` · ${p.rol}` : ''}${p.dice ? `\n  Dice: ${p.dice}` : ''}${p.intencion ? `\n  Intención: ${p.intencion}` : ''}\n  Se ve: ${p.se_ve}${p.producto === undefined ? '' : `\n  Producto en cuadro: ${p.producto ? 'sí' : 'no'}`}${p.movimiento ? `\n  Movimiento: ${p.movimiento}` : ''}${p.texto_en_pantalla ? `\n  Texto en pantalla: ${p.texto_en_pantalla}` : ''}${p.foto_id ? `\n  Foto de referencia: ${p.foto_id}` : ''}${p.estado_final ? `\n  Termina en: ${p.estado_final}` : ''}`),
    `Audio: ${t.audio || '(a criterio del modelo: música o ambiente)'}`,
    `Duración: ${t.segundos} s`,
  ].join('\n')
}
