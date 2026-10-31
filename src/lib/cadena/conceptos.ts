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
import type { Fase, Hallazgo, Slot } from './tipos'

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
  /** ids de las fotos propias que existen (toda `foto:<id>` debe estar aquí) */
  fotos: string[]
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
  const m = /^\s*-\s+(C[A-Za-z0-9_]+-I\d{2,})\s*·\s*(.*)$/.exec(linea)
  if (!m || !RE_ID_DE_IDEA.test(m[1])) return null
  const partes = m[2].split(/\s·\s/).map((x) => x.trim()).filter(Boolean)
  const campos: Record<string, string> = {}
  const libres: string[] = []
  for (const p of partes) {
    const c = /^(mensaje|gancho|protagonista|serie|foto)\s*:\s*(.*)$/i.exec(p)
    if (c) campos[c[1].toLowerCase()] = c[2].trim()
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
/** las ideas de TODO el texto (integración + aportes de los miembros): la línea `- C<x>-I<nn> · …` se reconoce en cualquier sección */
export function ideasDelTexto(md: string): IdeaDelBanco[] {
  return md.replace(/\r/g, '').split('\n').map(leerIdea).filter((x): x is IdeaDelBanco => x !== null)
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
const ETIQUETAS = /(Qué cuenta|Objetivo de la fase(?:\s*\(cita\))?|Objetivo|Cómo se ve(?: en este capítulo)?|Series)\s*:/giu
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
    if (nombre?.trim()) gran_idea = { nombre: nombre.trim(), frase: frase.join(' · ').trim() }
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
  const vistos = new Set<string>()
  const mensajes = new Map<string, string>()
  const ganchos = new Map<string, string>()
  for (const i of ideasDelTexto(md)) {
    if (vistos.has(i.id)) {
      // la misma idea repetida tal cual (p. ej. integración + aporte) es una sola; dos líneas distintas con el mismo id es un error
      const previa = banco.find((b) => b.id === i.id)
      if (!previa || claveDeTexto(previa.linea) !== claveDeTexto(i.linea)) ideas_descartadas.push({ id: i.id, motivo: 'id duplicado (ya hay otra idea con ese id)', linea: i.linea })
      continue
    }
    vistos.add(i.id)
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
  for (const p of ins.prohibidas) if (contienePalabraEntera(md, p)) avisos.push(`palabra prohibida del manual: «${p}»`)
  for (const i of banco) if (tieneDatoConValor(`${i.idea} ${i.mensaje} ${i.gancho}`)) avisos.push(`la idea ${i.id} trae un dato con valor (precio, hora, cifra): el estratega lo pone con su referencia`)
  const fotos_citadas = fotosCitadas(md)
  const fotosQueExisten = new Set(ins.fotos.map(String))
  for (const f of fotos_citadas) if (!fotosQueExisten.has(f)) avisos.push(`la foto «${f}» no existe entre las fotos propias`)

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
