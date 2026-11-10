/**
 * EL CONCEPTO DE CAMPAÑA · contrato `concepto.v1` (31-oct · diseño «nuevo orden de la cadena» v5 §4 · plan de construcción v2 T1).
 * La mesa de creativos (`concepto_mesa`, UNA por campaña) entrega un markdown con secciones fijas: la gran idea paraguas, por qué funciona, cómo se ve, cómo suena,
 * un capítulo por fase de la estrategia (con sus series) y el banco de ideas (líneas `- C<fase>-I<nn> · …`, escritas por los miembros en sus aportes).
 * `leerConcepto()` lo lee por código, gratis, y aplica los chequeos del diseño: lo que falta SE DECLARA (no se rellena); solo dos cosas lo dejan en `sin_concepto`:
 * no hay «## Gran idea» o no hay banco con al menos una idea válida. Nada aquí sabe de un cliente ni de un rubro, ni habla con un modelo ni con la base.
 *
 * Quién lo consume: la mesa de CC2 (`mesa/concepto.ts`) lo llama al entregar; la cadena guarda `leido` en `cadena_conceptos`; la hoja de la pieza (`hoja.ts`) toma
 * `banco[idea_ref].mensaje` como MENSAJE de la pieza; la tarjeta de Emilio muestra el resumen (`resumenDelBanco`).
 */
import { normalizar } from './texto'
import { formasDeOtroRegistro, nombreDelRegistro, type RegistroDelCliente } from './registro'
import type { Fase, Hallazgo, Slot } from './tipos'
import { frasesDelPublicoSinFuente } from '../perfil-del-publico/lectores'

export const CONTRATO_CONCEPTO = 'concepto.v1'
export const CONTRATO_BRIEF_CREATIVO = 'brief_creativo.v1'

/** ids de las piezas de la cadena para la oficina: `con-<campaña12>-v<n>` (mesa de concepto) · `brf-<campaña12>-v<n>` (mesa del brief) */
export const idDeConcepto = (campanaId: string, version: number): string => `con-${campanaId.replace(/-/g, '').slice(0, 12)}-v${version}`
export const idDeBrief = (campanaId: string, version: number): string => `brf-${campanaId.replace(/-/g, '').slice(0, 12)}-v${version}`

export const RE_ID_DE_IDEA = /^C([A-Za-z0-9_]+)-I(\d{2,})$/
export const RE_ID_DE_SERIE = /^S\d+$/

/** una idea del banco: la unidad que la pieza cita (`idea_ref`) y de la que toma su MENSAJE (nunca el mensaje de campaña) */
export interface IdeaDelBanco {
  id: string
  /** a qué capítulo apunta (`C<x>`): la clave del capítulo resuelta; `null` si apunta a uno que no existe */
  capitulo: string | null
  red: string
  formato: string
  idea: string
  mensaje: string
  gancho: string
  protagonista: string
  serie: string | null
  foto: string | null
  /** la línea tal cual (lo que se cita) */
  linea: string
}
export interface SerieDelCapitulo { id: string; nombre: string; que_cuenta: string; redes: string[] }
export interface CapituloDelConcepto {
  /** la clave con la que se nombró el capítulo («## Capítulo <clave> · <nombre>») */
  clave: string
  /** la clave de la fase de la estrategia a la que corresponde (por clave o por orden); `null` si no casa con ninguna */
  fase: string | null
  nombre: string
  que_cuenta: string
  objetivo_cita: string
  como_se_ve: string
  series: SerieDelCapitulo[]
}
export interface BancoParcial { red: string; capitulo: string; faltan: number; esperadas: number; hay: number }
export interface ConceptoLeido {
  contrato: typeof CONTRATO_CONCEPTO
  gran_idea: { nombre: string; frase: string } | null
  por_que_funciona: string
  como_se_ve: string
  como_suena: string
  capitulos: CapituloDelConcepto[]
  /** las ideas VÁLIDAS (con mensaje y gancho propios, id único, no listadas en «Ideas que salen») */
  banco: IdeaDelBanco[]
  /** las ideas que NO entran al banco y por qué (sin mensaje, sin gancho, repetida, id duplicado): se declaran, no se arreglan */
  ideas_descartadas: Array<{ id: string; motivo: string; linea: string }>
  ideas_que_salen: Array<{ id: string; motivo: string }>
  caminos_descartados: string
  /** solo si la dirección devolvió el brief (primer turno): los puntos de los 6 criterios que fallan; `null` si no hay devolución */
  devolucion_del_brief: string | null
  citas: string
  fotos_citadas: string[]
  /** «banco parcial: faltan N ideas (red × capítulo)»: la mesa entrega lo que hay y el estratega trabaja con eso */
  banco_parcial: BancoParcial[]
  /** lo que se DECLARA (capítulo que falta, red sin idea, cifra `,77`, palabra prohibida, dato con valor, foto que no existe…): nunca bloquea */
  avisos: string[]
  /** lo que deja el concepto en `sin_concepto` */
  bloqueos: string[]
  estado: 'ok' | 'sin_concepto'
}

export interface InsumosDelConcepto {
  /** las fases de la estrategia (clave, nombre y cuántas semanas abarca cada una); un capítulo por fase */
  fases: Array<{ clave: string; nombre?: string; semanas: number }>
  /** las redes principal/réplica con los huecos del patrón semanal de cada una (mínimo de ideas = huecos × semanas de la fase) */
  redes: Array<{ red: string; huecos_por_semana: number }>
  /** palabras prohibidas del manual */
  prohibidas: string[]
  /** las declaradas, con su cita: 02-nov, firma de Emilio: tampoco bloquean, se avisan con su propio texto */
  duras?: string[]
  /** ids de las fotos propias que existen (toda `foto:<id>` debe estar aquí; se acepta el prefijo de ≥ 8 caracteres si es de UNA sola foto) */
  fotos: string[]
  /** 10-nov (GO v3 · punto 5): el registro del cliente (tú · vos · usted); las formas de OTRO registro se marcan · sin dato no se marca nada */
  registro?: RegistroDelCliente
  /** 10-nov (tramo 2 del revisor de registro): la jefatura revisa el registro de ESTE documento ⇒ «Cómo suena» en otro registro es PISTA (aviso), nunca bloqueo · ausente = como siempre */
  registroSoloAviso?: boolean
  /** 10-nov (GO v3 · punto 7): el texto del que la mesa debe sacar sus datos (el brief validado). Un dato con valor de una idea que no está aquí se marca «sin fuente» · sin texto no se mira */
  fuente?: string
  /** 10-nov · perfil del público T2: el texto del perfil vigente (null = no hay o no se pudo leer). Una frase que la gran idea ATRIBUYE al público y no está textual aquí se avisa · ausente = no se mira */
  perfil_del_publico?: string | null
}

// ───────────────────────────────────────────────────────── texto
/** la MISMA normalización que las láminas: sin tildes, sin mayúsculas, sin puntuación, espacios colapsados (B1 de CC3) */
export function claveDeTexto(s: string): string {
  return normalizar(s).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** ¿aparece la palabra (o frase) entera, no como parte de otra? */
export function contienePalabraEntera(texto: string, palabra: string): boolean {
  const p = claveDeTexto(palabra)
  if (!p) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(p)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(claveDeTexto(texto))
}
/**
 * 10-nov (GO v3 · punto 4): ¿la palabra aparece FUERA de una frase que la prohíbe? «Sin «premium», «gourmet» ni superlativos» no es usarla.
 * Una aparición cuenta como prohibición si, en la misma frase y antes de ella, hay «sin», «nunca», «jamás», «ni», «no uses/usar/decir…», «evita/evitar…» o «prohibid…».
 */
const PROHIBE = /(?:^|[^\p{L}])(?:sin|nunca|jamas|ni|no (?:use|uses|usar|usa|usamos|decir|digas|diga|dice|poner|pongas|escribir|escribas)|evit\p{L}*|prohib\p{L}*)(?=$|[^\p{L}])/u
export function apareceFueraDeProhibicion(texto: string, palabra: string): boolean {
  const p = claveDeTexto(palabra)
  if (!p) return false
  for (const frase of texto.split(/[.!?\n]+/)) {
    const f = claveDeTexto(frase)
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(p)}(?=$|[^\\p{L}\\p{N}])`, 'gu')
    // solo cuenta lo que está cerca (las 8 palabras anteriores): «Sin «premium», «gourmet», «artesanal»» sí; «encebollado sin espera … premium» no
    for (const m of f.matchAll(re)) if (!PROHIBE.test(f.slice(0, m.index! + m[1].length).trim().split(' ').slice(-8).join(' '))) return true
  }
  return false
}
/** 10-nov (aviso de CC1 en #969): quita negrita y cursiva de markdown (`**x**`, `__x__`, `*x*`, `_x_`); no toca un asterisco suelto ni un guion bajo dentro de una palabra */
export function sinMarcasDeFormato(t: string): string {
  return t.replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|[^\p{L}\p{N}*_])([*_])([^*_\n]+?)\2(?![\p{L}\p{N}*_])/gu, '$1$3').trim()
}

/** 10-nov (GO v3 · punto 2): ¿existe la foto? id completo, o un prefijo de ≥ 8 caracteres que sea de UNA sola foto propia (la mesa cita `foto:4f09cef2`) */
export function fotoExiste(id: string, fotos: string[]): boolean {
  const i = id.toLowerCase()
  if (fotos.some((f) => f.toLowerCase() === i)) return true
  return i.length >= 8 && fotos.filter((f) => f.toLowerCase().startsWith(i)).length === 1
}
/** 10-nov (GO v3 · punto 7): los datos con valor de un texto (cifras con decimales, precios, horas, porcentajes, días de atención) */
export function datosConValor(t: string): string[] {
  const out: string[] = []
  const re = /(?:\$|US\$|USD)\s?\d+(?:[.,]\d+)?|\b\d{1,2}:\d{2}\b|\b\d+(?:[.,]\d+)?\s?%|\b\d+[.,]\d+\b|\bde lunes a (?:viernes|sabado|sábado|domingo)s?\b|\btodos los dias\b|\btodos los días\b|\b24\s?(?:horas|h|\/7)\b/giu
  // una duración de montaje («texto retardado 1,5 s», «0–3 s») no es un dato del negocio
  for (const m of t.matchAll(re)) if (!/^\s?(?:s|seg|segundos?)(?!\p{L})/iu.test(t.slice(m.index! + m[0].length)) && !out.includes(m[0])) out.push(m[0])
  return out
}
/** ¿el dato está en la fuente? cifras con coma o punto valen igual («4,9» = «4.9») */
export function datoEnLaFuente(dato: string, fuente: string): boolean {
  const n = (x: string) => normalizar(x).replace(/(\d)[.,](\d)/g, '$1.$2').replace(/\s+/g, ' ')
  return n(fuente).includes(n(dato))
}
/** una cifra inventada con decimales «,77» / «.77» (el molde del redactor cuando no tiene el dato) */
export const tieneCifraInventada = (t: string): boolean => /\d[.,]77\b/.test(t)
/** un dato con valor que una idea NO debe traer (el estratega lo pone con su referencia): precio, hora, porcentaje, cifra con decimales */
export const tieneDatoConValor = (t: string): boolean => /(?:\$|US\$|USD)\s?\d|\b\d{1,2}:\d{2}\b|\d\s?%|\b\d+[.,]\d+\b/i.test(t)
/** cada `foto:<id>` del texto (sin «ninguna»; sin repetir) */
export function fotosCitadas(t: string): string[] {
  const out: string[] = []
  for (const m of t.matchAll(/foto:\s*([A-Za-z0-9][A-Za-z0-9_.-]*)/g)) if (!/^ninguna$/i.test(m[1]) && !out.includes(m[1])) out.push(m[1])
  return out
}

// ───────────────────────────────────────────────────────── secciones
interface Seccion { titulo: string; resto: string; cuerpo: string }
/** las secciones `## …` en orden; `resto` = lo que sigue al título en la misma línea («## Gran idea  <nombre> · <frase>») */
export function seccionesDe(md: string): Seccion[] {
  const out: Seccion[] = []
  for (const l of md.replace(/\r/g, '').split('\n')) {
    const h = /^##\s+(.*\S)\s*$/.exec(l)
    if (h && !/^#/.test(h[1])) { out.push({ titulo: h[1], resto: '', cuerpo: '' }); continue }
    if (out.length) out[out.length - 1].cuerpo += (out[out.length - 1].cuerpo ? '\n' : '') + l
  }
  return out.map((s) => ({ ...s, cuerpo: s.cuerpo.trim() }))
}
const TITULOS = ['Gran idea', 'Por qué funciona', 'Cómo se ve', 'Cómo suena', 'Banco de ideas', 'Ideas que salen', 'Caminos descartados y por qué', 'Devolución del brief', 'Citas'] as const
/** separa el título conocido de lo que lo sigue en la misma línea */
function titularDe(s: Seccion): { titulo: string; resto: string } {
  const t = claveDeTexto(s.titulo)
  for (const conocido of TITULOS) {
    const k = claveDeTexto(conocido)
    if (t === k || t.startsWith(k + ' ')) return { titulo: conocido, resto: s.titulo.slice(conocido.length).replace(/^[\s·:—-]+/, '').trim() }
  }
  const cap = /^cap[ií]tulo\s+(\S+)\s*(?:·|-|—)?\s*(.*)$/i.exec(s.titulo)
  if (cap) return { titulo: 'Capítulo', resto: s.titulo.slice(s.titulo.toLowerCase().indexOf('cap') + 8).trim() }
  return { titulo: s.titulo, resto: '' }
}
const textoDe = (s: Seccion | undefined): string => (s ? [titularDe(s).resto, s.cuerpo].filter(Boolean).join('\n').trim() : '')

// ───────────────────────────────────────────────────────── el banco
/** lee UNA línea de idea `- C1-I01 · <red> · <formato> · <idea> · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna`; `null` si no es una idea */
export function leerIdea(linea: string): IdeaDelBanco | null {
  // reserva 2 de CC3 (31-oct): la viñeta puede ser «-», «*», «•» o «1.», y el id puede ir en negrita; el id sigue siendo exacto (mayúsculas)
  const m = /^\s*(?:[-*•]|\d+[.)])\s+\**(C[A-Za-z0-9_]+-I\d{2,})\**\s*·\s*(.*)$/.exec(linea)
  if (!m || !RE_ID_DE_IDEA.test(m[1])) return null
  const partes = m[2].split(/\s·\s/).map((x) => x.trim()).filter(Boolean)
  const campos: Record<string, string> = {}
  const libres: string[] = []
  let ultimo: string | null = null
  for (const p of partes) {
    const c = /^(mensaje|gancho|protagonista|serie|foto)\s*:\s*(.*)$/i.exec(p)
    if (c) { ultimo = c[1].toLowerCase(); campos[ultimo] = c[2].trim() }
    // reserva 3 de CC3: un « · » DENTRO de un campo etiquetado no lo corta: el fragmento sin etiqueta se queda en ese campo
    else if (ultimo) campos[ultimo] = `${campos[ultimo]} · ${p}`
    else libres.push(p)
  }
  const foto = (campos.foto ?? '').trim()
  const serie = (campos.serie ?? '').trim()
  return {
    id: m[1], capitulo: null, red: libres[0] ?? '', formato: libres[1] ?? '', idea: libres.slice(2).join(' · '),
    mensaje: campos.mensaje ?? '', gancho: campos.gancho ?? '', protagonista: campos.protagonista ?? '',
    serie: serie && RE_ID_DE_SERIE.test(serie.toUpperCase()) ? serie.toUpperCase() : serie || null,
    foto: foto && !/^ninguna$/i.test(foto) ? foto : null, linea: linea.trim(),
  }
}
/**
 * 10-nov (Lenovo por Emilio · FASE 2, opción A con las 2 condiciones de CC7): el RESUMEN de la versión anterior que va a la mesa cuando el cliente pidió cambios
 * («quédense con la idea»). Nunca el texto entero (decenas de miles de caracteres, leídos por cada miembro en cada ronda): la gran idea, por qué funciona, cómo se ve,
 * cómo suena (cada una acotada) y SOLO id · red · idea de cada línea del banco, para COMPLETARLO en vez de repetirlo.
 */
export const LARGO_MAXIMO_POR_SECCION_DEL_RESUMEN = 1200
export function resumenDeLaVersionAnterior(md: string, version: number): string {
  const secciones = seccionesDe(md)
  const de = (t: (typeof TITULOS)[number]) => sinMarcasDeFormato(textoDe(secciones.find((s) => titularDe(s).titulo === t))).slice(0, LARGO_MAXIMO_POR_SECCION_DEL_RESUMEN)
  const vistos = new Set<string>()
  const banco = ideasDelTexto(md).filter((i) => !vistos.has(i.id) && vistos.add(i.id)).map((i) => `- ${i.id} · ${i.red} · ${sinMarcasDeFormato(i.idea).slice(0, 120)}`)
  return [
    `# LA VERSIÓN ANTERIOR (v${version}), sobre la que el cliente pidió cambios: CONSERVA su gran idea y corrige SOLO lo pedido`,
    `## Gran idea\n${de('Gran idea').split('\n')[0] ?? ''}`,
    `## Por qué funciona\n${de('Por qué funciona')}`,
    `## Cómo se ve\n${de('Cómo se ve')}`,
    `## Cómo suena\n${de('Cómo suena')}`,
    `## El banco que ya existe (${banco.length} ideas): COMPLÉTALO; no repitas estas, suma las que faltan (puedes corregir una si lo pedido lo exige, con el mismo id)`,
    ...banco,
  ].join('\n')
}

/** las ideas de TODO el texto (integración + aportes de los miembros): la línea `- C<x>-I<nn> · …` se reconoce en cualquier sección */
export function ideasDelTexto(md: string): IdeaDelBanco[] {
  return md.replace(/\r/g, '').split('\n').map(leerIdea).filter((x): x is IdeaDelBanco => x !== null)
}
/**
 * reserva 2 de CC3 (31-oct): una línea que TRAE algo con forma de id de idea junto a un « · » pero que `leerIdea` no reconoce (viñeta rara, id en minúscula, sin « · » tras el id…)
 * NO desaparece: se declara como descartada «formato de línea no reconocido». Las líneas de «Ideas que salen» (`- C1-I04: motivo`) no llevan « · » y no caen aquí.
 */
export function lineasDeIdeaNoReconocidas(md: string): Array<{ id: string; linea: string }> {
  const out: Array<{ id: string; linea: string }> = []
  for (const l of md.replace(/\r/g, '').split('\n')) {
    if (/^\s*#/.test(l) || leerIdea(l)) continue
    const m = /\b(C[A-Za-z0-9_]+-I\d{2,})\b/i.exec(l)
    if (m && /·/.test(l)) out.push({ id: m[1], linea: l.trim() })
  }
  return out
}
const capituloDeId = (id: string): string => RE_ID_DE_IDEA.exec(id)?.[1] ?? ''

function leerSerie(linea: string): SerieDelCapitulo | null {
  const m = /^\s*-\s+(S\d+)\s*·\s*(.*)$/i.exec(linea)
  if (!m) return null
  const partes = m[2].split(/\s·\s/).map((x) => x.trim())
  let redes: string[] = []
  const libres: string[] = []
  for (const p of partes) {
    const r = /^redes?\s*:\s*(.*)$/i.exec(p)
    if (r) redes = r[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean)
    else if (p) libres.push(p)
  }
  return { id: m[1].toUpperCase(), nombre: libres[0] ?? '', que_cuenta: libres.slice(1).join(' · '), redes }
}
// 10-nov (GO v3 · punto 3): la etiqueta puede venir en negrita («**Qué cuenta:**») y con paréntesis («Objetivo de la fase (cita del plan):»); la negrita no entra al campo
const ETIQUETAS = /(?:\*\*|__)?(Qué cuenta|Objetivo de la fase(?:\s*\([^)\n]*\))?|Objetivo|Cómo se ve(?: en este capítulo)?|Series)\s*:\s*(?:\*\*|__)?/giu
function leerCapitulo(s: Seccion): Omit<CapituloDelConcepto, 'fase'> {
  const cab = /^cap[ií]tulo\s+(\S+)\s*(?:·|-|—)?\s*(.*)$/iu.exec(s.titulo)
  const clave = (cab?.[1] ?? '').replace(/[·:]+$/, '')
  const nombre = (cab?.[2] ?? '').trim()
  const cuerpo = s.cuerpo
  const marcas = [...cuerpo.matchAll(ETIQUETAS)]
  const campo = (nombres: RegExp): string => {
    const i = marcas.findIndex((m) => nombres.test(m[1]))
    if (i < 0) return ''
    const ini = marcas[i].index! + marcas[i][0].length
    const fin = i + 1 < marcas.length ? marcas[i + 1].index! : cuerpo.length
    return cuerpo.slice(ini, fin).replace(/\s*·\s*$/, '').trim()
  }
  // las series pueden ir en la misma línea de la etiqueta («Series: - S1 · …») o una por línea debajo
  const series = cuerpo.replace(/Series\s*:\s*-\s+/giu, '\n- ').split('\n').map(leerSerie).filter((x): x is SerieDelCapitulo => x !== null)
  return { clave, nombre, que_cuenta: campo(/^qué cuenta$/iu), objetivo_cita: campo(/^objetivo/iu), como_se_ve: campo(/^cómo se ve/iu), series }
}

// ───────────────────────────────────────────────────────── la lectura
export function leerConcepto(md: string, ins: InsumosDelConcepto): ConceptoLeido {
  const secciones = seccionesDe(md)
  const porTitulo = (t: (typeof TITULOS)[number]) => secciones.find((s) => titularDe(s).titulo === t)
  const avisos: string[] = []
  const bloqueos: string[] = []

  // gran idea: «<nombre> · <frase>» en la misma línea o en la primera del cuerpo
  const gi = porTitulo('Gran idea')
  let gran_idea: ConceptoLeido['gran_idea'] = null
  if (gi) {
    const t = textoDe(gi).split('\n')[0] ?? ''
    const [nombre, ...frase] = t.split(/\s·\s/)
    // 10-nov (aviso de CC1 en #969): el título que ve Emilio no lleva las marcas de formato de la mesa («**El oro…**», «*Salió…*»)
    if (nombre?.trim()) gran_idea = { nombre: sinMarcasDeFormato(nombre), frase: sinMarcasDeFormato(frase.join(' · ')) }
  }
  if (!gran_idea) bloqueos.push('sin «## Gran idea» (nombre · frase paraguas)')
  else if (!gran_idea.frase) avisos.push('la gran idea no trae frase paraguas (solo nombre)')

  // capítulos: uno por fase (por clave o por orden)
  const capitulos: CapituloDelConcepto[] = secciones.filter((s) => titularDe(s).titulo === 'Capítulo').map((s) => {
    const c = leerCapitulo(s)
    const porClave = ins.fases.find((f) => claveDeTexto(f.clave) === claveDeTexto(c.clave))
    const n = Number(c.clave)
    const porOrden = !porClave && Number.isInteger(n) && n >= 1 && n <= ins.fases.length ? ins.fases[n - 1] : undefined
    return { ...c, fase: (porClave ?? porOrden)?.clave ?? null }
  })
  for (const f of ins.fases) if (!capitulos.some((c) => c.fase === f.clave)) avisos.push(`falta el capítulo de la fase ${f.clave}${f.nombre ? ` (${f.nombre})` : ''}`)
  for (const c of capitulos) {
    if (c.fase === null) avisos.push(`el capítulo «${c.clave}» no corresponde a ninguna fase de la estrategia`)
    if (!c.que_cuenta) avisos.push(`el capítulo ${c.clave} no dice qué cuenta`)
    if (!c.objetivo_cita) avisos.push(`el capítulo ${c.clave} no cita el objetivo de la fase`)
  }
  const faseDeCapitulo = (x: string): string | null => {
    const c = capitulos.find((k) => claveDeTexto(k.clave) === claveDeTexto(x))
    if (c) return c.fase ?? c.clave
    const f = ins.fases.find((k) => claveDeTexto(k.clave) === claveDeTexto(x))
    if (f) return f.clave
    const n = Number(x)
    return Number.isInteger(n) && n >= 1 && n <= ins.fases.length ? ins.fases[n - 1].clave : null
  }

  // ideas que salen (por referencia)
  const ideas_que_salen: ConceptoLeido['ideas_que_salen'] = []
  // (la primera puede ir en la misma línea del título: «## Ideas que salen   - C1-I04: <por qué>»)
  for (const l of textoDe(porTitulo('Ideas que salen')).split('\n')) {
    const m = /^\s*(?:-\s+)?(C[A-Za-z0-9_]+-I\d{2,})\s*[:·—-]?\s*(.*)$/.exec(l)
    if (m) ideas_que_salen.push({ id: m[1], motivo: m[2].trim() })
  }
  const salen = new Set(ideas_que_salen.map((x) => x.id))

  // el banco: de todo el texto; se descarta lo que no cumple y SE DECLARA
  const banco: IdeaDelBanco[] = []
  const ideas_descartadas: ConceptoLeido['ideas_descartadas'] = []
  const mensajes = new Map<string, string>()
  const ganchos = new Map<string, string>()
  const mismaLinea = (a: string, b: string) => claveDeTexto(a) === claveDeTexto(b)
  for (const i of ideasDelTexto(md)) {
    // la misma idea repetida tal cual (p. ej. integración + aporte) es una sola; dos líneas distintas con el mismo id YA EN EL BANCO es un error.
    // reserva 1 de CC3 (31-oct): el duplicado solo cuenta contra una idea que SÍ entró; si la previa fue descartada (p. ej. sin gancho), la corregida se evalúa normal
    const previa = banco.find((b) => b.id === i.id)
    if (previa) {
      if (!mismaLinea(previa.linea, i.linea)) ideas_descartadas.push({ id: i.id, motivo: 'id duplicado (ya hay otra idea con ese id)', linea: i.linea })
      continue
    }
    if (ideas_descartadas.some((d) => d.id === i.id && mismaLinea(d.linea, i.linea))) continue
    if (salen.has(i.id)) continue
    const faltas: string[] = []
    if (!i.mensaje.trim()) faltas.push('sin `mensaje:`')
    if (!i.gancho.trim()) faltas.push('sin `gancho:`')
    if (!i.red) faltas.push('sin red')
    const km = claveDeTexto(i.mensaje)
    const kg = claveDeTexto(i.gancho)
    if (km && mensajes.has(km)) faltas.push(`mensaje repetido (igual al de ${mensajes.get(km)})`)
    if (kg && ganchos.has(kg)) faltas.push(`gancho repetido (igual al de ${ganchos.get(kg)})`)
    if (faltas.length) { ideas_descartadas.push({ id: i.id, motivo: faltas.join(' · '), linea: i.linea }); continue }
    mensajes.set(km, i.id)
    ganchos.set(kg, i.id)
    const cap = faseDeCapitulo(capituloDeId(i.id))
    if (cap === null) avisos.push(`la idea ${i.id} apunta a un capítulo que no existe`)
    banco.push({ ...i, capitulo: cap })
  }
  for (const l of lineasDeIdeaNoReconocidas(md)) if (!salen.has(l.id)) ideas_descartadas.push({ id: l.id, motivo: 'formato de línea no reconocido (se espera «- C<fase>-I<nn> · red · formato · idea · mensaje: … · gancho: …»)', linea: l.linea })
  if (!banco.length) bloqueos.push(ideasDelTexto(md).length ? 'sin banco de ideas válido (ninguna idea con mensaje y gancho propios)' : 'sin banco de ideas (ninguna línea `- C<fase>-I<nn> · …`)')

  // ≥ 1 idea por red y capítulo, y el mínimo huecos × semanas
  const banco_parcial: BancoParcial[] = []
  for (const f of ins.fases) {
    for (const r of ins.redes) {
      const hay = banco.filter((i) => i.capitulo === f.clave && claveDeTexto(i.red) === claveDeTexto(r.red)).length
      const esperadas = Math.max(0, Math.round(r.huecos_por_semana * f.semanas))
      if (hay === 0 && capitulos.some((c) => c.fase === f.clave)) avisos.push(`ninguna idea para ${r.red} en el capítulo de la fase ${f.clave}`)
      if (hay < esperadas) banco_parcial.push({ red: r.red, capitulo: f.clave, faltan: esperadas - hay, esperadas, hay })
    }
  }
  if (banco_parcial.length) avisos.push(`banco parcial: faltan ${banco_parcial.reduce((s, b) => s + b.faltan, 0)} ideas (${banco_parcial.map((b) => `${b.red} × ${b.capitulo}: ${b.faltan}`).join(' · ')})`)

  // texto: cifras inventadas, prohibidas, datos con valor en las ideas, fotos
  if (tieneCifraInventada(md)) avisos.push('hay una cifra «,77» (dato inventado)')
  const duras = new Set((ins.duras ?? []).map((x) => x.trim().toLowerCase()))
  for (const p of ins.duras ?? []) if (apareceFueraDeProhibicion(md, p)) avisos.push(`usa «${p}», declarada por una norma o para este cliente: revisa si corresponde`)
  for (const p of ins.prohibidas) if (!duras.has(p.trim().toLowerCase()) && apareceFueraDeProhibicion(md, p)) avisos.push(`usa «${p}», que el manual evita: revisa si es un claim propio sin prueba`)
  for (const i of banco) if (tieneDatoConValor(`${i.idea} ${i.mensaje} ${i.gancho}`)) avisos.push(`la idea ${i.id} trae un dato con valor (precio, hora, cifra): el estratega lo pone con su referencia`)
  // 10-nov (GO v3 · punto 7): un dato con valor que no está en el brief no tiene fuente (la mesa lo sacó de otro lado o lo inventó)
  if (ins.fuente) for (const i of banco) for (const d of datosConValor(`${i.idea} ${i.mensaje} ${i.gancho}`)) if (!datoEnLaFuente(d, ins.fuente)) avisos.push(`la idea ${i.id} trae «${d}», que no está en el brief: dato sin fuente`)
  // 10-nov · perfil del público T2: frase del público sin fuente (AVISO, nunca bloqueo)
  if (ins.perfil_del_publico !== undefined) for (const x of frasesDelPublicoSinFuente(md, ins.perfil_del_publico)) avisos.push(`frase del público sin fuente: «${x.frase}» (${x.motivo})`)
  const fotos_citadas = fotosCitadas(md)
  for (const f of fotos_citadas) if (!fotoExiste(f, ins.fotos.map(String))) avisos.push(`la foto «${f}» no existe entre las fotos propias`)
  // 10-nov (GO v3 · punto 5): el registro del cliente, como en las piezas; «Cómo suena» se nombra aparte porque todas las piezas la siguen
  if (ins.registro) {
    const enSuena = formasDeOtroRegistro(ins.registro, textoDe(porTitulo('Cómo suena')))
    const enTodo = formasDeOtroRegistro(ins.registro, md)
    // 10-nov (RESPUESTA de Lenovo por Emilio · decisión 1): «Cómo suena» BLOQUEA (es la regla que heredan todas las piezas); el resto del texto avisa. El tope de vueltas de siempre manda: dos sin_mesa → humano
    if (enSuena.length) (ins.registroSoloAviso ? avisos : bloqueos).push(`«Cómo suena» usa formas que no son ${nombreDelRegistro(ins.registro)}: ${enSuena.join(', ')} · todas las piezas siguen esta regla`)
    if (enTodo.length) avisos.push(`el concepto usa ${enTodo.length} forma(s) que no son ${nombreDelRegistro(ins.registro)}: ${enTodo.slice(0, 12).join(', ')}`)
  }

  const dev = porTitulo('Devolución del brief')
  const devolucion = dev ? textoDe(dev) : ''
  return {
    contrato: CONTRATO_CONCEPTO,
    gran_idea,
    por_que_funciona: textoDe(porTitulo('Por qué funciona')),
    como_se_ve: textoDe(porTitulo('Cómo se ve')),
    como_suena: textoDe(porTitulo('Cómo suena')),
    capitulos, banco, ideas_descartadas, ideas_que_salen,
    caminos_descartados: textoDe(porTitulo('Caminos descartados y por qué')),
    devolucion_del_brief: devolucion ? devolucion : null,
    citas: textoDe(porTitulo('Citas')),
    fotos_citadas, banco_parcial, avisos, bloqueos,
    estado: bloqueos.length ? 'sin_concepto' : 'ok',
  }
}

// ───────────────────────────────────────────────────────── insumos desde la estrategia (puros)
/** semanas que abarca una fase (día 1–30 = 5 semanas: se redondea hacia arriba) */
export const semanasDeFase = (f: Pick<Fase, 'dia_desde' | 'dia_hasta'>): number => Math.max(1, Math.ceil((f.dia_hasta - f.dia_desde + 1) / 7))
/** huecos del patrón semanal por red (cuántas piezas a la semana pide el patrón en cada red) */
export function huecosPorRed(patron: Pick<Slot, 'red'>[]): Array<{ red: string; huecos_por_semana: number }> {
  const por = new Map<string, number>()
  for (const s of patron) por.set(s.red, (por.get(s.red) ?? 0) + 1)
  return [...por.entries()].map(([red, huecos_por_semana]) => ({ red, huecos_por_semana }))
}
/** los insumos del concepto a partir de la estrategia: fases con semanas y redes principal/réplica con sus huecos */
export function insumosDesdeEstrategia(e: { fases: Fase[]; patron_semanal: Slot[]; canales: Array<{ red: string; rol: string }> }, prohibidas: string[], fotos: string[]): InsumosDelConcepto {
  const redesQuePublican = new Set(e.canales.filter((c) => c.rol === 'principal' || c.rol === 'replica').map((c) => c.red))
  return {
    fases: e.fases.map((f) => ({ clave: f.clave, semanas: semanasDeFase(f) })),
    redes: huecosPorRed(e.patron_semanal).filter((r) => redesQuePublican.size === 0 || redesQuePublican.has(r.red)),
    prohibidas, fotos,
  }
}

// ───────────────────────────────────────────────────────── salidas
/** los hallazgos para `cadena_validaciones` (objeto `concepto`): los bloqueos bloquean; los avisos avisan */
export function hallazgosDelConcepto(c: ConceptoLeido): Hallazgo[] {
  const ficha = (que: string, gravedad: 'bloquea' | 'aviso'): Hallazgo => ({ chequeo: 'concepto', severidad: gravedad, fila_id: null, alcance: 'tanda', ficha: { que, donde: 'concepto', contra_que: CONTRATO_CONCEPTO, gravedad, propuesta: gravedad === 'bloquea' ? 'la mesa vuelve a entregar (versión nueva)' : 'se declara; el estratega trabaja con lo que hay' } })
  return [...c.bloqueos.map((b) => ficha(b, 'bloquea')), ...c.avisos.map((a) => ficha(a, 'aviso'))]
}

export interface ResumenDelBanco { total: number; por_red: Record<string, number>; por_capitulo: Record<string, number>; ejemplos: Record<string, Array<{ id: string; idea: string; mensaje: string; gancho: string }>>; parcial: BancoParcial[] }
/** lo que ve Emilio: conteo por red y por capítulo + hasta 3 ejemplos por capítulo (idea · mensaje · gancho); si el banco quedó parcial, lo dice */
export function resumenDelBanco(c: ConceptoLeido, ejemplosPorCapitulo = 3): ResumenDelBanco {
  const por_red: Record<string, number> = {}
  const por_capitulo: Record<string, number> = {}
  const ejemplos: ResumenDelBanco['ejemplos'] = {}
  for (const i of c.banco) {
    por_red[i.red] = (por_red[i.red] ?? 0) + 1
    const k = i.capitulo ?? '?'
    por_capitulo[k] = (por_capitulo[k] ?? 0) + 1
    ;(ejemplos[k] ??= [])
    if (ejemplos[k].length < ejemplosPorCapitulo) ejemplos[k].push({ id: i.id, idea: i.idea, mensaje: i.mensaje, gancho: i.gancho })
  }
  return { total: c.banco.length, por_red, por_capitulo, ejemplos, parcial: c.banco_parcial }
}

/** la idea que cita una fila (`idea_ref`), o `null` si no está en el banco */
export const ideaDelBanco = (c: Pick<ConceptoLeido, 'banco'>, idea_ref: string | null | undefined): IdeaDelBanco | null => (idea_ref ? c.banco.find((i) => i.id === idea_ref) ?? null : null)
