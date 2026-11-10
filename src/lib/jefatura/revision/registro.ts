/**
 * LA REVISIÓN DEL REGISTRO (10-nov · corrección de Emilio 13:13Z «nada de reglas ni listas para JUZGAR» · GO de Lenovo 13:42Z «A′» · 🟢 de CC7 al plan por tramos). Puro.
 * Quién habla con quién (tú, vos o usted) lo JUZGA un agente que lee el documento entero con el registro del manual del cliente. El CÓDIGO solo verifica lo exacto:
 *  · cada frase señalada está LITERAL en el documento (si no, no es una ficha: se anota y se descarta);
 *  · una frase dentro de una CITA no se corrige nunca: la cita es literal por regla (#984). Va como aviso «el documento de origen usa otro registro». Qué es una cita lo dicen
 *    solo marcas EXACTAS (bloque `>`, sección «Citas») o el REVISOR (`es_cita` + `cita_de`), y el código comprueba que la frase esté literal en ese documento de origen
 *    (si el sobre no lo trae, la ficha se corrige). Nada de listas de verbos: si unas comillas son la línea de una pieza o una cita de otro documento lo juzga el agente (CC7 · 10-nov);
 *  · la corrección son REEMPLAZOS exactos (antes → después) que aplica el código fuera de las citas: así nada fuera de las frases señaladas puede cambiar.
 * Agnóstico: el registro llega en el sobre (lo resuelve quien abre la revisión desde el manual o el país del cliente). Sin registro no se abre (nada de «tuteo por omisión»).
 */
import type { PayloadDeRevision } from './contrato'

export const TRATOS = ['tu', 'vos', 'usted'] as const
export type Trato = (typeof TRATOS)[number]
export const NOMBRE_DEL_TRATO: Record<Trato, string> = { tu: 'tuteo (tú)', vos: 'voseo (vos)', usted: 'usted' }
export const CLAVE_DE_REVISION_DE_REGISTRO = 'revision_registro'
export const ESQUEMA_DE_REEMPLAZOS = 'reemplazos.v1'
export const ESQUEMA_DE_FICHAS_DE_REGISTRO = 'fichas_de_registro.v1'

export interface RegistroDelSobre { trato: Trato; fuente?: string; evidencia?: string }

// ───────────────────────── lo citado (no se corrige)
/** los tramos [inicio, fin) del texto marcados como cita por el PROPIO documento (marcas exactas): bloques `>` y el cuerpo de una sección «Citas». Las comillas sueltas no cuentan: eso lo juzga el revisor */
export function tramosCitados(texto: string): Array<[number, number]> {
  const t: Array<[number, number]> = []
  // bloques `>`: la línea entera
  for (const m of texto.matchAll(/^[ \t]*>.*$/gm)) t.push([m.index!, m.index! + m[0].length])
  // la sección «Citas» (encabezado markdown que se llama así): todo su cuerpo, hasta el siguiente encabezado del mismo nivel o mayor
  for (const m of texto.matchAll(/^(#{1,6})[ \t]+Citas\b[^\n]*$/gim)) {
    const nivel = m[1].length
    const desde = m.index! + m[0].length
    const resto = texto.slice(desde)
    const sig = new RegExp(`^#{1,${nivel}}[ \\t]+\\S`, 'm').exec(resto)
    t.push([desde, sig ? desde + sig.index : texto.length])
  }
  return t
}

const dentro = (i: number, largo: number, tramos: Array<[number, number]>): boolean => tramos.some(([a, b]) => i >= a && i + largo <= b)

const LETRA = /[\p{L}\p{N}]/u
/** la frase como palabra(s) entera(s): «pedís» no aparece dentro de «despedís» */
const bordeLimpio = (texto: string, i: number, frase: string): boolean =>
  (!LETRA.test(frase[0]) || i === 0 || !LETRA.test(texto[i - 1])) && (!LETRA.test(frase[frase.length - 1]) || i + frase.length >= texto.length || !LETRA.test(texto[i + frase.length]))

/** los tramos de las citas que señaló el REVISOR y el código comprobó: cada aparición literal (palabras enteras) del fragmento citado */
export function tramosDeFragmentos(texto: string, fragmentos: string[]): Array<[number, number]> {
  const t: Array<[number, number]> = []
  for (const f of fragmentos) {
    if (!f) continue
    for (let i = texto.indexOf(f); i >= 0; i = texto.indexOf(f, i + 1)) if (bordeLimpio(texto, i, f)) t.push([i, i + f.length])
  }
  return t
}

/** dónde aparece la frase (literal, como palabras enteras), separando lo que está fuera de citas de lo que está dentro (marcas exactas + citas comprobadas del revisor) */
export function ocurrencias(texto: string, frase: string, citasDelRevisor: string[] = []): { fuera: number[]; en_citas: number[] } {
  const out = { fuera: [] as number[], en_citas: [] as number[] }
  if (!frase) return out
  const tr = [...tramosCitados(texto), ...tramosDeFragmentos(texto, citasDelRevisor)]
  for (let i = texto.indexOf(frase); i >= 0; i = texto.indexOf(frase, i + 1)) {
    if (!bordeLimpio(texto, i, frase)) continue
    ;(dentro(i, frase.length, tr) ? out.en_citas : out.fuera).push(i)
  }
  // apariciones que se solapan (una frase que se repite pegada a sí misma) cuentan una vez: se queda la primera de cada tramo
  const sinSolape = (xs: number[]) => xs.filter((x, k) => k === 0 || x >= xs[k - 1] + frase.length)
  return { fuera: sinSolape(out.fuera), en_citas: sinSolape(out.en_citas) }
}

// ───────────────────────── lo que señaló el revisor
export interface FichaDeRegistro { que: string; donde: string; contra_que: string; gravedad: 'bloquea' | 'sugerencia'; propuesta: string; /** el revisor juzga que la frase reproduce otro documento */ es_cita?: boolean; /** el título de ese documento */ cita_de?: string; /** el fragmento citado ENTERO, literal (contiene la frase): es el tramo que no se toca */ cita_texto?: string }
/** un documento del que el texto puede citar (lo trae el sobre); sirve para comprobar, literal, una cita que señala el revisor */
export interface DocumentoDeOrigen { titulo: string; texto: string }
export interface Clasificacion { corregibles: FichaDeRegistro[]; en_citas: string[]; no_literales: string[]; /** los fragmentos citados que el código comprobó: tramos intocables al clasificar Y al reemplazar */ citas_del_revisor: string[] }

/**
 * Las fichas del revisor, comprobadas contra el texto (código, exacto): `que` es la FRASE LITERAL. Lo que no está tal cual en el documento no es una ficha (el revisor parafraseó o inventó).
 * Lo que solo aparece dentro de citas marcadas (`>`, «Citas») no se corrige: queda como aviso. Si el REVISOR dice que es cita (`es_cita`), el código lo comprueba: la frase tiene que estar
 * literal en el documento de origen que nombra (o en alguno, si no nombra) entre los que trae el sobre, dentro del fragmento citado (`cita_texto`, que también tiene que estar literal en el texto);
 * si se comprueba, es aviso y ese FRAGMENTO pasa a ser un tramo intocable (así la misma frase en una línea de pieza se sigue corrigiendo y la cita no); si no, se corrige.
 * Una misma frase cuenta una vez como cita y una vez como no-cita (caso mixto de CC7). Toda ficha corregible bloquea (el creador la resuelve una vez; el cierre nunca bloquea la cadena).
 */
export function clasificarFichas(texto: string, fichas: FichaDeRegistro[], origenes: DocumentoDeOrigen[] = []): Clasificacion {
  const frases = fichas.map((f) => String(f.que ?? '').trim())
  const citas = fichas.map((f, k) => citaDelRevisor(f, frases[k], texto, origenes))
  const citas_del_revisor = [...new Set(citas.filter((x): x is string => x !== null))]
  const c: Clasificacion = { corregibles: [], en_citas: [], no_literales: [], citas_del_revisor }
  const vistas = new Set<string>()
  fichas.forEach((f, k) => {
    const frase = frases[k]
    const clave = `${frase}\u0000${citas[k] !== null}`
    if (!frase || vistas.has(clave)) return
    vistas.add(clave)
    if (citas[k] !== null) { c.en_citas.push(frase); return }
    const o = ocurrencias(texto, frase, citas_del_revisor)
    if (o.fuera.length) c.corregibles.push({ ...f, que: frase, gravedad: 'bloquea' })
    else if (o.en_citas.length) c.en_citas.push(frase)
    else c.no_literales.push(frase)
  })
  c.en_citas = [...new Set(c.en_citas)]
  return c
}

const normalTitulo = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const literalEn = (texto: string, fragmento: string): boolean => { for (let i = texto.indexOf(fragmento); i >= 0; i = texto.indexOf(fragmento, i + 1)) if (bordeLimpio(texto, i, fragmento)) return true; return false }
/**
 * La cita que señala el revisor, COMPROBADA: devuelve el fragmento citado (`cita_texto`, o la frase si no lo dio) si contiene la frase, está literal en el texto y literal en su documento
 * de origen (el que nombra `cita_de`, o cualquiera del sobre). Sin documentos en el sobre no se puede comprobar: `null` (no es cita).
 */
export function citaDelRevisor(f: Pick<FichaDeRegistro, 'es_cita' | 'cita_de' | 'cita_texto'>, frase: string, texto: string, origenes: DocumentoDeOrigen[]): string | null {
  if (f.es_cita !== true || !frase) return null
  const fragmento = f.cita_texto?.trim() || frase
  if (!fragmento.includes(frase) || !literalEn(texto, fragmento)) return null
  const de = f.cita_de?.trim() ? origenes.filter((d) => normalTitulo(d.titulo) === normalTitulo(f.cita_de!)) : origenes
  return de.some((d) => literalEn(d.texto, fragmento)) ? fragmento : null
}

export const avisoDeCita = (frase: string): string => `«${frase}» está dentro de una cita: el documento de origen usa otro registro (la cita no se corrige)`

// ───────────────────────── la corrección: reemplazos exactos
export interface Reemplazo { id: string; antes: string; despues: string }

/**
 * Aplica los reemplazos FUERA de las citas (todas las apariciones de esa frase). Cada `antes` tiene que ser la frase de una ficha tomada y estar literal fuera de citas;
 * si no, devuelve el error (el orquestador pide un reintento). Nunca toca nada más del texto.
 */
export function aplicarReemplazos(texto: string, reemplazos: Reemplazo[], frasesTomadas: Map<string, string>, citasDelRevisor: string[] = []): { ok: true; texto: string; aplicados: number } | { ok: false; error: string } {
  let t = texto
  let aplicados = 0
  for (const r of reemplazos) {
    const frase = frasesTomadas.get(r.id)
    if (frase === undefined) return { ok: false, error: `el reemplazo «${r.id}» no es de una ficha que tomaste` }
    if (r.antes.trim() !== frase) return { ok: false, error: `en el reemplazo «${r.id}», «antes» tiene que ser EXACTAMENTE la frase de la ficha: «${frase}»` }
    if (!r.despues.trim()) return { ok: false, error: `en el reemplazo «${r.id}», «despues» está vacío: un reemplazo no borra la frase; da la frase en el registro del cliente` }
    if (r.despues.trim() === frase) return { ok: false, error: `en el reemplazo «${r.id}», «despues» es igual a «antes»: si no la cambias, responde «no_tomada»` }
    const o = ocurrencias(t, frase, citasDelRevisor)
    if (!o.fuera.length) return { ok: false, error: `la frase «${frase}» ya no está fuera de las citas` }
    // de atrás hacia adelante, así los índices siguen valiendo
    for (const i of [...o.fuera].reverse()) { t = t.slice(0, i) + r.despues.trim() + t.slice(i + frase.length); aplicados++ }
  }
  return { ok: true, texto: t, aplicados }
}

// ───────────────────────── los pedidos
const bloqueDeVoz = (p: PayloadDeRevision): string => {
  const r = p.registro!
  const partes = [`## El registro del cliente\n${NOMBRE_DEL_TRATO[r.trato]}${r.fuente ? ` · lo fija: ${r.fuente}` : ''}${r.evidencia ? `\nLo que dice: «${r.evidencia}»` : ''}`]
  if (p.seccion_de_voz?.trim()) partes.push(`## La voz del manual del cliente (tal cual)\n${p.seccion_de_voz.trim()}`)
  return partes.join('\n\n')
}

/** el revisor (Editor en jefe): lee el documento ENTERO y devuelve cada frase que no cumple el registro del cliente, literal */
export function tareaDeRevisionDeRegistro(a: { payload: PayloadDeRevision; texto: string }): { task: string; indicacion: string; esquema: string } {
  const doc = a.payload.documento?.trim() || 'el documento'
  const linea = `Revisas SOLO el registro de ${doc}: cómo se le habla al público (tú, vos o usted), según el manual del cliente. Lee el documento ENTERO, también los bancos de ideas y las líneas de piezas. Juzga por el sentido: un futuro («pedirás»), un pretérito («compré»), un sustantivo o un nombre no son otro registro. No revises nada más: ni contenido, ni estilo, ni ortografía.`
  const pistas = a.payload.pistas_de_registro?.length ? `## Pistas de un detector barato (pueden estar equivocadas o incompletas: tú decides)\n${a.payload.pistas_de_registro.map((x) => `- ${x}`).join('\n')}` : ''
  const formato = `Formato: devuelve solo el JSON {"fichas":[{"que":"…","donde":"…","contra_que":"…","gravedad":"bloquea","propuesta":"…"}]}. En "que" va la FRASE copiada LITERAL del documento (exacta, corta: solo las palabras que hay que cambiar y lo mínimo alrededor para que se entienda), en "donde" la sección, en "contra_que" qué registro usa y por qué no es el del cliente, y en "propuesta" esa misma frase en el registro del cliente. Las líneas que la agencia escribe para las piezas (titulares, textos, ganchos), aunque vayan entre comillas, NO son citas: se corrigen. Solo si la frase reproduce LITERAL otro documento (lo que escribió el dueño, una reseña, el manual) agrega "es_cita":true, "cita_de":"<título de ese documento>" y "cita_texto":"<el fragmento citado ENTERO, copiado literal del documento>"; esa no se corrige, se avisa. Si la misma frase aparece en una cita y también en una línea de pieza, da dos fichas: una con "es_cita" y otra sin. Si todo cumple: {"fichas":[]}.`
  const origenes = a.payload.documentos_de_origen?.length ? `## Documentos de los que se puede citar (para "cita_de")\n${a.payload.documentos_de_origen.map((d) => `- ${d.titulo}`).join('\n')}` : ''
  return { task: [linea, bloqueDeVoz(a.payload), `## Lo que revisas (${doc})\n${a.texto.trim()}`, origenes, pistas, formato].filter(Boolean).join('\n\n'), indicacion: linea, esquema: ESQUEMA_DE_FICHAS_DE_REGISTRO }
}

/** el creador: recibe SUS fichas y responde ítem por ítem; si toma una, entrega el reemplazo exacto (el sistema lo aplica, él no reescribe el documento) */
export function tareaDeCorreccionDeRegistro(a: { payload: PayloadDeRevision; texto: string; fichas: Array<{ id: string; que?: string; propuesta?: string; contra_que?: string; donde: string }> }): { task: string; indicacion: string; esquema: string } {
  const doc = a.payload.documento?.trim() || 'el documento'
  const indicacion = 'Respondes ítem por ítem: tomada o no tomada, con la razón. Si tomas una, das el reemplazo exacto de esa frase en el registro del cliente; no cambias nada más.'
  const fichas = `## Frases que no cumplen el registro del cliente\n${a.fichas.map((f) => `- [${f.id}] en ${f.donde}: «${f.que ?? ''}»${f.contra_que ? ` · por qué: ${f.contra_que}` : ''}${f.propuesta ? ` · propuesta del revisor: «${f.propuesta}»` : ''}`).join('\n')}`
  const formato = 'Devuelve solo el JSON {"respuestas":[{"id":"…","estado":"tomada|no_tomada","razon":"…"}],"reemplazos":[{"id":"…","antes":"…","despues":"…"}]}. En "antes" va EXACTAMENTE la frase de la ficha; en "despues", la frase en el registro del cliente, con el mismo sentido. Un reemplazo por ficha tomada; ninguno por las no tomadas. El campo "estado" vale EXACTAMENTE "tomada" o "no_tomada".'
  return { task: [indicacion, bloqueDeVoz(a.payload), `## ${doc.replace(/^./, (c) => c.toUpperCase())} (para que veas cada frase en su lugar)\n${a.texto.trim()}`, fichas, formato].join('\n\n'), indicacion, esquema: ESQUEMA_DE_REEMPLAZOS }
}

/** la entrada de una revisión de registro: sin registro (del manual o del país) no se abre; nunca hay uno por omisión */
export function erroresDeLaEntradaDeRegistro(p: Record<string, unknown>): string[] {
  const e: string[] = []
  const r = p.registro as Record<string, unknown> | undefined
  if (!r || typeof r !== 'object' || !(TRATOS as readonly string[]).includes(String(r.trato))) e.push('`payload.registro.trato` es obligatorio en una revisión de registro (tu | vos | usted, resuelto del manual o del país del cliente): sin registro no se abre, no hay uno por omisión')
  else {
    if (r.fuente !== undefined && typeof r.fuente !== 'string') e.push('`payload.registro.fuente` debe ser texto')
    if (r.evidencia !== undefined && typeof r.evidencia !== 'string') e.push('`payload.registro.evidencia` debe ser texto')
  }
  if (p.seccion_de_voz !== undefined && typeof p.seccion_de_voz !== 'string') e.push('`payload.seccion_de_voz` debe ser texto')
  if (p.documento !== undefined && typeof p.documento !== 'string') e.push('`payload.documento` debe ser texto')
  if (p.documentos_de_origen !== undefined && !(Array.isArray(p.documentos_de_origen) && p.documentos_de_origen.every((d) => !!d && typeof d === 'object' && typeof (d as Record<string, unknown>).titulo === 'string' && typeof (d as Record<string, unknown>).texto === 'string'))) e.push('`payload.documentos_de_origen` debe ser una lista de {titulo, texto}')
  if (p.pistas_de_registro !== undefined && !(Array.isArray(p.pistas_de_registro) && p.pistas_de_registro.every((x) => typeof x === 'string'))) e.push('`payload.pistas_de_registro` debe ser una lista de textos')
  return e
}
