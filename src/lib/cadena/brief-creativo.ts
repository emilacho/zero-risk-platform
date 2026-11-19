/**
 * EL BRIEF CREATIVO DE CAMPAÑA · contrato `brief_creativo.v1` (31-oct · diseño «nuevo orden de la cadena» v5 §3 · plan de construcción v2 T1).
 * UN brief por campaña, corto, escrito por `campaign-brief-agent` como mesa de un miembro (`brief_mesa`): insight · UN mensaje · objetivo (y por red) · tono · obligatorios · faltantes
 * declarados · contradicciones plan vs manual · citas. Reemplaza al `brief_fila.v1` (brief por publicación), que nadie usa.
 * `leerBriefCreativo()` lo lee por código y aplica los chequeos portados de `brief-chequeos.js` (el nodo ④ del parte): un solo mensaje · la cita del plan es literal ·
 * ninguna palabra prohibida fuera de la lista «prohibido» · el público no es «todos» (si lo nombra) · secciones obligatorias presentes. Lo que falla deja el brief `devuelta`
 * (la cadena pide UNA vez más; si sigue, `necesita_humano`). Nada aquí sabe de un cliente ni habla con un modelo.
 */
import { citaAparece, normalizar, textoDelDocumento } from './texto'

// el lector común vive en ./texto (GO Lenovo 10-nov 18:48Z); se reexporta para quien ya lo importa desde aquí
export { textoDelDocumento }
import type { Canal, Hallazgo } from './tipos'
import type { ContextoDelCliente } from './almacen'
import { CONTRATO_BRIEF_CREATIVO, claveDeTexto, contienePalabraEntera, seccionesDe } from './conceptos'
import { formasDeOtroRegistro, nombreDelRegistro, type RegistroDelCliente } from './registro'

export { CONTRATO_BRIEF_CREATIVO }

export interface ObjetivoPorRed { red: string; objetivo: string; llamado: string }
/**
 * 19-nov · grupo D (condición de Lenovo 08:00Z): la marca de los avisos del brief que quedó vigente al tope con bloqueos sin arreglar. Vive aquí (y no en `mesas.ts`)
 * porque la usan la mesa que lo valida y la hoja que la copia en cada pieza, y la hoja no puede importar la mesa.
 */
export const PREFIJO_AVISO_DE_LA_MEJOR_VERSION = 'el brief quedó vigente con lo que la mesa no pudo arreglar: '
/** el campo de cada pieza de la hoja con esos avisos: llega a la jefatura dentro de «El brief de este entregable» */
export const CAMPO_AVISOS_DEL_BRIEF_CREATIVO = 'AVISOS DEL BRIEF CREATIVO (el revisor mira justo estos puntos)'

export interface BriefCreativoLeido {
  contrato: typeof CONTRATO_BRIEF_CREATIVO
  de_que_parte_del_plan: string
  insight: string
  /** 17-nov (Sprint 4 · C): «Lo único que hay que comunicar» (o «Mensaje», en un brief anterior) · una proposición, no un anuncio */
  mensaje: string
  /** 17-nov (Sprint 4 · C · vara IPA): secciones nuevas que pide la plantilla y el lector NO exige (fase 1 no agrega rejas) · ausentes en un leído guardado antes */
  problema_de_negocio?: string
  razones_para_creer?: string
  rutas_del_plan?: string
  /** 17-nov (ADENDA 2 de Emilio): los hechos clave de cada oferta, copiados de la ficha con su fuente · no obligatoria */
  hechos_de_las_ofertas?: string
  objetivo: string
  /** 10-nov (ADENDA de Emilio · 2): copiados del plan */
  publico: string
  como_sabremos: string
  por_red: ObjetivoPorRed[]
  tono: string
  obligatorios: { vocabulario: string[]; prohibido: string[]; no_se_dice: string[]; /** 17-nov (ADENDA 2): «- legales: …» · ausente en un leído guardado antes */ legales?: string[] }
  faltantes: Array<{ campo: string; que_falta: string }>
  contradicciones: string[]
  citas: string
  /** lo que se declara sin devolver (p. ej. «no nombra al público») */
  avisos: string[]
  /** lo que devuelve el brief (UNA re-petición; luego `necesita_humano`) */
  bloqueos: string[]
  estado: 'validada' | 'devuelta'
}
export interface InsumosDelBrief {
  /** el plan vigente (para comprobar que la cita es literal) */
  planTexto: string
  /** 10-nov (GO de Lenovo · todas las citas): el manual vigente · una cita atribuida al manual se comprueba contra él (sin manual, no se comprueba) */
  manualTexto?: string
  /** palabras prohibidas del manual */
  prohibidas: string[]
  /** las declaradas, con su cita: 02-nov, firma de Emilio: tampoco bloquean, se avisan con su propio texto */
  duras?: string[]
  /** redes principal/réplica de la estrategia: cada una necesita objetivo y llamado (falta ⇒ se declara) */
  redes?: string[]
  /** 10-nov (GO v3 · punto 5): el registro del cliente; las formas de OTRO registro se marcan, como en las piezas · sin dato no se marca nada */
  registro?: RegistroDelCliente
  /** 10-nov (tramo 2 del revisor de registro): la jefatura revisa el registro de ESTE documento ⇒ las formas de otro registro son PISTAS (aviso), nunca bloqueo · ausente = como siempre */
  registroSoloAviso?: boolean
}

// 10-nov (ADENDA de Emilio · 2): el brief COPIA del plan el público, el objetivo con su número y cómo sabremos que funcionó (la mesa de la gran idea solo lee el brief)
// 17-nov (Sprint 4 · C · el brief sin órdenes · vara IPA): «Mensaje» pasa a llamarse «Lo único que hay que comunicar» (el lector acepta los dos nombres) y se suman
// «Problema de negocio», «Razones para creer», «Rutas vivas del plan» y (ADENDA 2 de Emilio) «Hechos de las ofertas». Las nuevas NO son obligatorias: la fase 1 no agrega rejas y un brief ya validado no se devuelve al re-leerlo
export const SECCIONES_DEL_BRIEF = ['De qué parte del plan sale', 'Problema de negocio', 'Insight', 'Mensaje', 'Razones para creer', 'Rutas vivas del plan', 'Hechos de las ofertas', 'Público', 'Objetivo', 'Cómo sabremos que funcionó', 'Tono', 'Obligatorios', 'Faltantes', 'Contradicciones plan vs manual', 'Citas'] as const
const OBLIGATORIAS = ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Público', 'Objetivo', 'Cómo sabremos que funcionó', 'Tono', 'Obligatorios'] as const
type Seccion = (typeof SECCIONES_DEL_BRIEF)[number]
/** el nombre con que la plantilla pide cada sección (el que se nombra en una devolución) */
export const TITULO_DE_LA_SECCION: Partial<Record<Seccion, string>> = { Mensaje: 'Lo único que hay que comunicar' }
/** los otros nombres que el lector acepta para una sección */
const OTROS_NOMBRES: Partial<Record<Seccion, string[]>> = { Mensaje: ['Lo único que hay que comunicar'] }
const tituloVisible = (k: Seccion): string => TITULO_DE_LA_SECCION[k] ?? k
/**
 * 18-nov (T7 · DIAGNÓSTICO CC5 · GO Lenovo): LOS TÍTULOS QUE PIDE LA PLANTILLA, de UNA sola fuente. La mesa del brief recibía dos plantillas (la referencia del marco y la
 * convención vieja de la oficina, que pedía «## Mensaje», un llamado por red y nada de «Público»); ahora la convención de la mesa sale de aquí.
 */
export const TITULOS_DEL_BRIEF: readonly string[] = SECCIONES_DEL_BRIEF.map(tituloVisible)
export const TITULOS_OBLIGATORIOS_DEL_BRIEF: readonly string[] = OBLIGATORIAS.map(tituloVisible)
export const MAX_CARACTERES_DEL_MENSAJE = 260
export const MIN_CARACTERES_DE_CITA = 12
const CLICHES_DE_PUBLICO = ['todos', 'todo el mundo', 'toda la poblacion', 'publico general', 'cualquier persona', 'cualquiera', 'toda la gente', 'la gente']

type Sec = ReturnType<typeof seccionesDe>[number]
function nombreQueCoincide(s: Sec): { k: Seccion; nombre: string } | null {
  const t = claveDeTexto(s.titulo)
  for (const k of SECCIONES_DEL_BRIEF) for (const nombre of [k, ...(OTROS_NOMBRES[k] ?? [])]) { const c = claveDeTexto(nombre); if (t === c || t.startsWith(c + ' ')) return { k, nombre } }
  return null
}
function tituloConocido(s: Sec): Seccion | null {
  return nombreQueCoincide(s)?.k ?? null
}
/** el texto de una sección: lo que sigue al título en la misma línea + el cuerpo */
function textoDe(s: Sec | undefined, titulo: string): string {
  if (!s) return ''
  const nombre = nombreQueCoincide(s)?.nombre ?? titulo
  const resto = s.titulo.slice(nombre.length).replace(/^[\s·:—-]+/, '').trim()
  return [resto, s.cuerpo].filter(Boolean).join('\n').trim()
}
/** líneas `- clave: valor` de una sección (sin exigir mayúsculas) */
function lineasConClave(texto: string): Array<{ clave: string; valor: string }> {
  const out: Array<{ clave: string; valor: string }> = []
  // 17-nov (GO Lenovo · auditoría `07-hojas-piezas.md`): las negritas del brief («- **vocabulario:** …») no viajan como «**» a la hoja
  for (const l of texto.split('\n').map((x) => x.replace(/\*\*/g, ''))) {
    const m = /^\s*-\s*([^:·]{1,60}?)\s*:\s*(.*)$/.exec(l)
    if (m) out.push({ clave: m[1].trim(), valor: m[2].trim() })
  }
  return out
}
// 17-nov: las comillas se quitan solo si envuelven el item entero («premium» → premium); «el mejor X» sin citar reseña queda tal cual
const lista = (v: string): string[] => v.split(/[;·]|,(?![^(«]*[)»])/).map((x) => x.trim().replace(/^«([^«»]*)»$/, '$1')).filter(Boolean)
/** el número de frases de un mensaje (un brief = UN mensaje: máximo 2 frases, 260 caracteres) */
export const frasesDe = (s: string): number => s.split(/[.!?¡¿]+/).map((x) => x.trim()).filter(Boolean).length
/** ¿el público dice «todos»? (si lo nombra) */
/**
 * Los insumos del verificador del brief, armados UNA sola vez para todos los que lo leen (la mesa al recibirlo, la revalidación y los colaterales):
 * el plan y el manual vigentes, las prohibidas y duras del manual, las redes que la estrategia usa y el registro del cliente. Sin contexto, no se compara nada.
 */
export function insumosDelBrief(ctx: Pick<ContextoDelCliente, 'planTexto' | 'manualTexto' | 'forbiddenWords' | 'palabrasDuras' | 'registro'> | null | undefined, canales: Pick<Canal, 'red' | 'rol'>[] | null | undefined): InsumosDelBrief {
  return { planTexto: ctx?.planTexto ?? '', manualTexto: ctx?.manualTexto, prohibidas: ctx?.forbiddenWords ?? [], duras: ctx?.palabrasDuras, redes: (canales ?? []).filter((x) => x.rol !== 'no').map((x) => x.red), registro: ctx?.registro }
}

export function publicoEsTodos(publico: string): boolean {
  const p = normalizar(publico).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!p) return false
  return CLICHES_DE_PUBLICO.some((c) => p === c || p.startsWith(c + ' ') || (p.length < 40 && p.includes(c)))
}

/** el texto de cada sección conocida del brief (la primera con ese título), con el mismo criterio que el lector */
function textosPorSeccion(md: string): (k: (typeof SECCIONES_DEL_BRIEF)[number]) => string {
  const por = new Map<string, Sec>()
  for (const s of seccionesDe(md)) { const k = tituloConocido(s); if (k && !por.has(k)) por.set(k, s) }
  return (k) => textoDe(por.get(k), k)
}

/**
 * 19-nov · ADENDA 1 · P2b (CC5): lo que el CALENDARIO lee del brief validado: «Público» y «Hechos de las ofertas», ENTEROS (nada se recorta).
 * Con el mismo lector que valida el brief (los mismos títulos y sus otros nombres). Una sección ausente queda vacía: quien arma la tarea lo dice.
 */
export function delBriefParaElCalendario(md: string): { publico: string; hechos_de_las_ofertas: string } {
  const t = textosPorSeccion(md)
  return { publico: t('Público'), hechos_de_las_ofertas: t('Hechos de las ofertas') }
}

/**
 * LAS SECCIONES OBLIGATORIAS QUE LE FALTAN A UN BRIEF, con el MISMO criterio que el lector (ausente o vacía).
 * 10-nov · el brief v3 de Náufrago se devolvió porque el anterior (validado antes de #968) no tenía «Público» ni «Cómo sabremos que funcionó»
 * y la mesa lo conservó «tal cual»: el marco de un pedido de cambios lo usa para nombrar lo que hay que agregar.
 */
export function seccionesObligatoriasQueFaltan(md: string): string[] {
  const t = textosPorSeccion(md)
  return OBLIGATORIAS.filter((k) => !t(k)).map(tituloVisible)
}

/** ¿la cita está literal en el documento? Una elisión («…», «...», «[…]», «(…)») parte la cita: cada tramo tiene que estar */
const tramosDeLaCita = (cita: string): string[] => cita.split(/\s*(?:\[\s*(?:…|\.\.\.)\s*\]|\(\s*(?:…|\.\.\.)\s*\)|…|\.\.\.)\s*/).filter((x) => normalizar(x).length >= 4)
function citaLiteralEn(documento: string, cita: string): boolean {
  const tramos = tramosDeLaCita(cita)
  return tramos.length > 0 && tramos.every((x) => citaAparece(documento, x))
}

/**
 * HASTA DÓNDE COINCIDE una cita que no es literal (18-nov · T7 · DIAGNÓSTICO CC5 · GO Lenovo, punto 3): solo TEXTO para la devolución, no juzga ni bloquea nada.
 * En T7 la v2 del brief arregló unas citas y rompió otras porque solo sabía «no está literal». Devuelve las últimas palabras (máx. 6) del comienzo más largo del primer
 * tramo que no aparece; '' si ni su comienzo aparece; null si la cita sí es literal. Compara con la MISMA lectura que el chequeo (`citaAparece`).
 */
export function hastaDondeCoincide(documento: string, cita: string): string | null {
  const doc = textoDelDocumento(documento)
  const roto = tramosDeLaCita(cita).find((x) => !citaAparece(doc, x))
  if (roto == null) return null
  const palabras = roto.trim().split(/\s+/)
  let mejor = 0
  for (let m = 1; m <= palabras.length; m++) {
    if (citaAparece(doc, palabras.slice(0, m).join(' '))) mejor = m
    else if (mejor > 0) break
  }
  return mejor ? palabras.slice(Math.max(0, mejor - 6), mejor).join(' ') : ''
}
const pistaDeLaCita = (documento: string, cita: string, nombre: string): string => {
  const p = hastaDondeCoincide(documento, cita)
  return p == null ? '' : p ? ` · coincide con el ${nombre} hasta «…${p}» y desde ahí cambia` : ` · ni su comienzo está en el ${nombre}`
}

/**
 * LO QUE ESTÁ ENTRE COMILLAS en la cita de «De qué parte del plan sale» (10-nov 18:48Z · GO Lenovo · límite que declaró CC4 en #1005).
 * Antes, una sola regla aceptaba cualquier comilla de apertura con cualquiera de cierre: en «… el llamado "Cotiza hoy" …» la cita se cortaba en la primera
 * comilla recta y un final alterado pasaba. Ahora cada comilla se cierra con SU pareja: primero «…», después “…” y por último "…" en lo que queda fuera
 * de las anteriores (las rectas de DENTRO de una «…» son parte de la cita). Si no hay ninguna pareja, se usa la regla de siempre.
 */
export function citasEntreComillas(cita: string): string[] {
  const out: string[] = []
  let resto = cita
  for (const re of [/«([^»]{4,})»/g, /“([^”]{4,})”/g, /"([^"]{4,})"/g]) {
    for (const m of resto.matchAll(re)) out.push(m[1])
    resto = resto.replace(re, ' ')
  }
  return out.length ? out : [...cita.matchAll(/[«"“]([^»"”]{4,})[»"”]/g)].map((m) => m[1])
}

export interface CitaQueNoAparece { cita: string; seccion: string; fuente: 'plan' | 'manual' }

/** las citas de un bloque `>` (líneas seguidas ya unidas), como las lee el chequeo */
function partesDelBloque(b: string): string[] {
  // 17-nov (Sprint 4 · C): varias citas seguidas (`> «A»` + `> «B»`, p. ej. las rutas del plan) forman un bloque; cada «…» se comprueba sola, no el bloque entero
  const varias = /^\s*(?:«[^«»]*»\s*){2,}$/.test(b)
  const entera = varias ? null : /^\s*«([\s\S]*)»\s*$/.exec(b)
  const partes = entera ? [entera[1]] : [...b.matchAll(/«([^»]+)»/g)].map((m) => m[1])
  return partes.length ? partes : [b]
}

/**
 * TODAS LAS CITAS DEL BRIEF SON LITERALES (10-nov · GO de Lenovo tras el brief v4 de Náufrago, que puso «playa» DENTRO de una cita del plan que dice «costa»).
 * Se comprueban, en cualquier sección menos «De qué parte del plan sale» (tiene su propio chequeo):
 * · un bloque citado `> «…»`: tiene que estar en el plan o en el manual;
 * · una cita atribuida en la línea («el plan dice: «…»», «manual dice «…»»…): tiene que estar en ESE documento (la del manual, solo si hay manual).
 * Lo entre «» sin atribución (palabras, llamados) no es una cita a un documento y no se comprueba. Las citas cortas (< 12 caracteres) tampoco.
 */
export function citasQueNoAparecen(md: string, fuentes: { plan: string; manual?: string }): CitaQueNoAparece[] {
  const out: CitaQueNoAparece[] = []
  fuentes = { plan: textoDelDocumento(fuentes.plan), manual: fuentes.manual == null ? undefined : textoDelDocumento(fuentes.manual) }
  const enAlguno = (c: string) => citaLiteralEn(fuentes.plan, c) || (!!fuentes.manual && citaLiteralEn(fuentes.manual, c))
  for (const s of seccionesDe(md)) {
    const k = tituloConocido(s)
    if (k === 'De qué parte del plan sale') continue
    const seccion = k ?? s.titulo.trim()
    // bloques `>` (líneas seguidas = un bloque)
    const bloques: string[] = []
    let cur: string[] = []
    for (const l of s.cuerpo.split('\n')) {
      const m = /^\s*>\s?(.*)$/.exec(l)
      if (m) cur.push(m[1].trim())
      else if (cur.length) { bloques.push(cur.join(' ')); cur = [] }
    }
    if (cur.length) bloques.push(cur.join(' '))
    for (const b of bloques) {
      for (const c of partesDelBloque(b)) {
        if (normalizar(c).length < MIN_CARACTERES_DE_CITA) continue
        if (!enAlguno(c)) out.push({ cita: c, seccion, fuente: 'plan' })
      }
    }
    // citas atribuidas en la línea
    for (const m of `${s.titulo}\n${s.cuerpo}`.matchAll(/\b(plan|manual)\s+(?:dice|declara|indica|señala|afirma|pide|establece)(?:\s+que)?\s*:?\s*«([^»]+)»/giu)) {
      const fuente = m[1].toLowerCase() === 'manual' ? 'manual' : 'plan'
      const c = m[2]
      if (normalizar(c).length < MIN_CARACTERES_DE_CITA) continue
      if (fuente === 'manual' && !fuentes.manual) continue
      if (!citaLiteralEn(fuente === 'manual' ? fuentes.manual! : fuentes.plan, c)) out.push({ cita: c, seccion, fuente })
    }
  }
  return sinRepetidas(out)
}
function sinRepetidas(xs: CitaQueNoAparece[]): CitaQueNoAparece[] {
  const vistas = new Set<string>()
  return xs.filter((x) => { const k = `${x.fuente}|${normalizar(x.cita)}`; if (vistas.has(k)) return false; vistas.add(k); return true })
}

/**
 * 18-nov (T7 · GO Lenovo opción 3, para que Emilio la confirme o la revierta): tres briefs seguidos volvieron por UNA o DOS citas no literales entre ~30
 * (una palabra cambiada, el encabezado de una tabla pegado a la celda, un valor de la ficha). La regla NO cambia: lo que va entre comillas es literal y lo
 * verifica el código, exacto. Lo que cambia: hasta `TOPE_DE_CITAS_A_RESUMEN` citas no literales se BAJAN a prosa (sin `> «…»`, con la marca de resumen)
 * y se anotan en «Faltantes»; el brief sigue con un aviso por cada una. Con más, no se toca nada y el brief vuelve como siempre.
 * Detecta con LA MISMA lectura que `citasQueNoAparecen` (bloques `>` y citas atribuidas; no «De qué parte del plan sale», que tiene su propio chequeo).
 */
export const TOPE_DE_CITAS_A_RESUMEN = 3
const marcaDeResumen = (de: 'plan' | 'manual' | 'bloque'): string =>
  `*(resumen, no cita literal ${de === 'bloque' ? 'del plan ni del manual' : `del ${de}`})*`
export interface CitasBajadas { texto: string; bajadas: CitaQueNoAparece[] }
export function bajarCitasNoLiterales(md: string, fuentes: { plan: string; manual?: string }): CitasBajadas {
  const fallan = citasQueNoAparecen(md, fuentes)
  if (!fallan.length || fallan.length > TOPE_DE_CITAS_A_RESUMEN) return { texto: md, bajadas: [] }
  const doc = { plan: textoDelDocumento(fuentes.plan), manual: fuentes.manual == null ? undefined : textoDelDocumento(fuentes.manual) }
  const enAlguno = (c: string) => citaLiteralEn(doc.plan, c) || (!!doc.manual && citaLiteralEn(doc.manual, c))
  const bajadas: CitaQueNoAparece[] = []
  const trozos: Array<{ cabeza: string | null; k: Seccion | null; titulo: string; cuerpo: string[] }> = [{ cabeza: null, k: null, titulo: '', cuerpo: [] }]
  for (const l of md.replace(/\r/g, '').split('\n')) {
    const h = /^##\s+(.*\S)\s*$/.exec(l)
    if (h && !/^#/.test(h[1])) trozos.push({ cabeza: l, k: tituloConocido({ titulo: h[1], resto: '', cuerpo: '' }), titulo: h[1], cuerpo: [] })
    else trozos[trozos.length - 1].cuerpo.push(l)
  }
  for (const tz of trozos) {
    if (tz.cabeza == null || tz.k === 'De qué parte del plan sale') continue
    const seccion = tz.k ?? tz.titulo.trim()
    // bloques `>`: el bloque con una cita no literal pasa a prosa entera (las literales de ese bloque quedan con sus «»)
    const out: string[] = []
    for (let i = 0; i < tz.cuerpo.length; ) {
      if (!/^\s*>/.test(tz.cuerpo[i])) { out.push(tz.cuerpo[i]); i++; continue }
      const ini = i
      while (i < tz.cuerpo.length && /^\s*>/.test(tz.cuerpo[i])) i++
      const lineas = tz.cuerpo.slice(ini, i)
      const b = lineas.map((l) => /^\s*>\s?(.*)$/.exec(l)![1].trim()).join(' ')
      const malas = partesDelBloque(b).filter((c) => normalizar(c).length >= MIN_CARACTERES_DE_CITA && !enAlguno(c))
      if (!malas.length) { out.push(...lineas); continue }
      let prosa = b
      for (const c of malas) prosa = prosa.includes(`«${c}»`) ? prosa.replace(`«${c}»`, `${c} ${marcaDeResumen('bloque')}`) : `${prosa} ${marcaDeResumen('bloque')}`
      out.push(prosa)
      bajadas.push(...malas.map((c) => ({ cita: c, seccion, fuente: 'plan' as const })))
    }
    // citas atribuidas en la línea («el plan dice: «…»»): la que no es literal pierde sus «» (y así deja de leerse como cita)
    tz.cuerpo = out.join('\n').replace(/\b(plan|manual)(\s+(?:dice|declara|indica|señala|afirma|pide|establece)(?:\s+que)?\s*:?\s*)«([^»]+)»/giu, (todo, quien: string, medio: string, c: string) => {
      const fuente = quien.toLowerCase() === 'manual' ? 'manual' : 'plan'
      if (normalizar(c).length < MIN_CARACTERES_DE_CITA || (fuente === 'manual' && !doc.manual)) return todo
      if (citaLiteralEn(fuente === 'manual' ? doc.manual! : doc.plan, c)) return todo
      bajadas.push({ cita: c, seccion, fuente })
      return `${quien}${medio}${c} ${marcaDeResumen(fuente)}`
    }).split('\n')
  }
  const lista = sinRepetidas(bajadas)
  const faltantes = trozos.find((tz) => tz.k === 'Faltantes')
  if (faltantes) {
    // las líneas nuevas van después de lo que ya había, y antes de las líneas en blanco del final (que se conservan tal cual)
    let blancas = 0
    while (faltantes.cuerpo.length && !faltantes.cuerpo[faltantes.cuerpo.length - 1].trim()) { faltantes.cuerpo.pop(); blancas++ }
    for (const x of lista) faltantes.cuerpo.push(`- cita no literal (en «## ${x.seccion}»): se dejó como resumen, sin comillas · ${x.cita.replace(/[«»]/g, '').slice(0, 80)}…`)
    for (let i = 0; i < blancas; i++) faltantes.cuerpo.push('')
  }
  const texto = trozos.flatMap((tz) => (tz.cabeza == null ? tz.cuerpo : [tz.cabeza, ...tz.cuerpo])).join('\n')
  return { texto, bajadas: lista }
}
/** el aviso de cada cita que se bajó a resumen (el brief sigue; la gran idea lo ve) */
export const avisosDeCitasBajadas = (bajadas: CitaQueNoAparece[]): string[] =>
  bajadas.map((x) => `la cita «${x.cita.slice(0, 80)}» (en «## ${x.seccion}») no estaba literal en el ${x.fuente === 'manual' ? 'manual' : 'plan'} · se dejó como resumen, sin comillas, y se anotó en «Faltantes»`)

export function leerBriefCreativo(md: string, ins: InsumosDelBrief): BriefCreativoLeido {
  const secciones = seccionesDe(md)
  const t = textosPorSeccion(md)
  const avisos: string[] = []
  const bloqueos: string[] = []

  // secciones obligatorias presentes y con texto
  for (const k of OBLIGATORIAS) if (!t(k)) bloqueos.push(`falta la sección «## ${tituloVisible(k)}»`)

  // UN mensaje
  const mensaje = t('Mensaje').split('\n')[0]?.trim() ?? ''
  const lineasDeMensaje = t('Mensaje').split('\n').map((x) => x.trim()).filter(Boolean)
  if (mensaje) {
    if (lineasDeMensaje.length > 1) avisos.push(`el mensaje tiene ${lineasDeMensaje.length} líneas · un brief = UN mensaje`)
    const n = frasesDe(mensaje)
    if (n > 2) avisos.push(`el mensaje tiene ${n} frases · sospecha de varios mensajes (máximo 2 frases, una idea)`)
    if (mensaje.length > MAX_CARACTERES_DEL_MENSAJE) avisos.push(`el mensaje mide ${mensaje.length} caracteres · una idea cabe en ${MAX_CARACTERES_DEL_MENSAJE}`)
  }

  // la cita del plan es LITERAL
  const cita = t('De qué parte del plan sale')
  if (cita) {
    const entreComillas = citasEntreComillas(cita)
    const candidatas = entreComillas.length ? entreComillas : [cita]
    const literal = candidatas.some((c) => normalizar(c).length >= MIN_CARACTERES_DE_CITA && citaAparece(textoDelDocumento(ins.planTexto), c))
    if (normalizar(cita).length < MIN_CARACTERES_DE_CITA) bloqueos.push(`la cita al plan es demasiado corta para verificarse: «${cita.slice(0, 60)}»`)
    else if (!literal) bloqueos.push(`la cita «${cita.slice(0, 80)}» no se encuentra literal en el plan · no se puede verificar de qué parte sale`)
  }
  // 10-nov (GO de Lenovo): TODAS las citas son literales · una cita nunca se corrige
  for (const x of citasQueNoAparecen(md, { plan: ins.planTexto, manual: ins.manualTexto })) {
    const nombre = x.fuente === 'manual' ? 'manual' : 'plan'
    const pista = pistaDeLaCita(x.fuente === 'manual' ? ins.manualTexto ?? '' : ins.planTexto, x.cita, nombre)
    bloqueos.push(`la cita «${x.cita.slice(0, 80)}» (en «## ${x.seccion}») no está literal en el ${nombre}${pista} · una cita nunca se corrige: cópiala tal cual y, si el cambio pedido la contradice, explícalo fuera de la cita`)
  }

  // objetivo por red: «- ig: objetivo · llamado»
  const objetivoTexto = t('Objetivo')
  const por_red: ObjetivoPorRed[] = lineasConClave(objetivoTexto).map((l) => {
    const [objetivo, ...resto] = l.valor.split(/\s·\s/)
    return { red: l.clave.toLowerCase(), objetivo: (objetivo ?? '').trim(), llamado: resto.join(' · ').trim() }
  })
  const objetivo = objetivoTexto.split('\n').filter((l) => !/^\s*-\s*[^:·]{1,60}?\s*:/.test(l)).join('\n').trim()
  // 17-nov (Sprint 4 · C): el brief ya no fija el llamado de cada red (va en la ficha de la oferta: cómo se compra o contrata) · solo se declara la red sin objetivo.
  // Un brief anterior con «- ig: objetivo · llamado» se sigue leyendo igual (`por_red[].llamado`)
  for (const r of ins.redes ?? []) {
    const o = por_red.find((x) => claveDeTexto(x.red) === claveDeTexto(r))
    if (!o) avisos.push(`la red ${r} no tiene objetivo en el brief`)
  }

  // 10-nov (ADENDA de Emilio · 2): el objetivo de la campaña lleva su número (el del plan); si el plan no lo tiene, se declara en «Faltantes», nunca se inventa
  const faltaObjetivo = lineasConClave(t('Faltantes')).some((l) => /^objetivo/.test(claveDeTexto(l.clave)))
  if (objetivo && !/\d/.test(objetivo) && !faltaObjetivo) bloqueos.push('el objetivo de la campaña no trae su número del plan (cópialo del plan, o decláralo en «Faltantes» si el plan no lo tiene)')

  // obligatorios: vocabulario · prohibido · lo que no se dice
  const ob = lineasConClave(t('Obligatorios'))
  const de = (re: RegExp) => ob.filter((l) => re.test(claveDeTexto(l.clave))).flatMap((l) => lista(l.valor))
  const obligatorios = { vocabulario: de(/^vocabulario/), prohibido: de(/^prohibid/), no_se_dice: de(/^lo que no se dice|^no se dice/), legales: de(/^legal/) }

  // faltantes (declarados, nunca rellenados) y contradicciones
  const faltantes = lineasConClave(t('Faltantes')).map((l) => ({ campo: l.clave, que_falta: l.valor }))
  const contradicciones = t('Contradicciones plan vs manual').split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter((x) => x && !/^(ninguna|no hay)/i.test(x))

  // el público no es «todos» (si lo nombra): una línea «público:» / «- público:» en cualquier sección MENOS «Faltantes» (ahí «público: lo que falta» no es la audiencia)
  const textoSinFaltantes = secciones.filter((s) => tituloConocido(s) !== 'Faltantes').map((s) => `${s.titulo}\n${s.cuerpo}`).join('\n')
  const lineaPublico = /^\s*-?\s*p[úu]blico\s*:\s*(.+)$/imu.exec(textoSinFaltantes)
  if (lineaPublico && publicoEsTodos(lineaPublico[1])) avisos.push(`el público dice «${lineaPublico[1].trim().slice(0, 60)}» · no es una audiencia declarada`)

  // prohibidas fuera de la lista «prohibido» y de las contradicciones (ahí se citan para decir que NO se usan)
  // 11-nov (GO Lenovo · reglas rígidas #4): ya no hay parche «,77». Un precio real de US$ 4,77 es un dato; lo que verifica un dato es su fuente, no su terminación
  const loQuePide = secciones.filter((s) => tituloConocido(s) !== 'Contradicciones plan vs manual').map((s) => (tituloConocido(s) === 'Obligatorios' ? lineasConClave(textoDe(s, 'Obligatorios')).filter((l) => !/^prohibid|^lo que no se dice|^no se dice/.test(claveDeTexto(l.clave))).map((l) => l.valor).join('\n') : textoDe(s, tituloConocido(s) ?? s.titulo))).join('\n')
  // 01-nov · ADENDA de Emilio: una palabra de la lista es contexto de marca, no un bloqueo por coincidencia (una reseña citada y atribuida no es un superlativo propio)
  const duras = new Set((ins.duras ?? []).map(claveDeTexto))
  for (const p of ins.duras ?? []) if (contienePalabraEntera(loQuePide, p)) avisos.push(`usa «${p}», declarada por una norma o para este cliente: revisa si corresponde`)
  for (const p of ins.prohibidas) if (!duras.has(claveDeTexto(p)) && contienePalabraEntera(loQuePide, p)) avisos.push(`usa «${p}», que el manual evita: revisa si es un claim propio sin prueba`)
  for (const p of ins.prohibidas) if (!obligatorios.prohibido.some((x) => claveDeTexto(x) === claveDeTexto(p))) avisos.push(`la prohibida del manual «${p}» no está en la lista «prohibido» del brief`)
  // 10-nov (GO v3 · punto 5): el registro del cliente, como en las piezas; «Tono» se nombra aparte porque es la regla que heredan la gran idea y las piezas
  if (ins.registro) {
    const enTono = formasDeOtroRegistro(ins.registro, t('Tono'))
    const enTodo = formasDeOtroRegistro(ins.registro, md)
    // 10-nov (RESPUESTA de Lenovo por Emilio · decisión 1): «Tono» BLOQUEA (la heredan la gran idea y las piezas); el resto avisa. Se devuelve UNA vez; la segunda va a humano
    if (enTono.length) (ins.registroSoloAviso ? avisos : bloqueos).push(`«Tono» usa formas que no son ${nombreDelRegistro(ins.registro)}: ${enTono.join(', ')} · la gran idea y las piezas heredan esta regla`)
    if (enTodo.length) avisos.push(`el brief usa ${enTodo.length} forma(s) que no son ${nombreDelRegistro(ins.registro)}: ${enTodo.slice(0, 12).join(', ')}`)
  }

  return {
    contrato: CONTRATO_BRIEF_CREATIVO,
    de_que_parte_del_plan: cita, insight: t('Insight'), mensaje, problema_de_negocio: t('Problema de negocio'), razones_para_creer: t('Razones para creer'), rutas_del_plan: t('Rutas vivas del plan'), hechos_de_las_ofertas: t('Hechos de las ofertas'), objetivo, publico: t('Público'), como_sabremos: t('Cómo sabremos que funcionó'), por_red, tono: t('Tono'), obligatorios, faltantes, contradicciones, citas: t('Citas'),
    avisos, bloqueos, estado: bloqueos.length ? 'devuelta' : 'validada',
  }
}

/** los hallazgos para `cadena_validaciones` (objeto `brief_creativo`) */
export function hallazgosDelBrief(b: BriefCreativoLeido): Hallazgo[] {
  const ficha = (que: string, gravedad: 'bloquea' | 'aviso'): Hallazgo => ({ chequeo: 'brief_creativo', severidad: gravedad, fila_id: null, alcance: 'tanda', ficha: { que, donde: 'brief creativo', contra_que: CONTRATO_BRIEF_CREATIVO, gravedad, propuesta: gravedad === 'bloquea' ? 'se devuelve UNA vez con estos puntos; si sigue, necesita_humano' : 'se declara' } })
  return [...b.bloqueos.map((x) => ficha(x, 'bloquea')), ...b.avisos.map((x) => ficha(x, 'aviso'))]
}

/**
 * la referencia del brief creativo que recibe la mesa del brief en su marco · texto, sin cliente.
 * 17-nov (Sprint 4 · C · el brief sin órdenes · vara IPA «Better Briefs»): el brief dice el problema, el público, LO ÚNICO que hay que comunicar con sus razones para creer,
 * las rutas vivas del plan, los límites y cómo se medirá. NO escribe el anuncio, no fija llamados ni formatos, no elige fotos; precio, horario y plazos van a la ficha de la oferta.
 */
export const REGLA_DE_LA_CITA_DE_TABLA = 'Si lo que citas está en una TABLA del documento, cita UNA celda tal cual, cada una en su propio `> «…»`; la fila y la columna se nombran FUERA de la cita (por ejemplo, la línea «Fila 1, columna B:» y debajo `> «<el texto exacto de esa celda>»`). Nunca juntes una fila entera en una cita ni le agregues dentro los nombres de las columnas: así ya no está literal en el documento.'

/**
 * 18-nov (T7 segundo intento · GO Lenovo opción 1): el brief v2 de la campaña volvió devuelto porque puso un valor de la FICHA de la oferta dentro de `> «…»`.
 * La ficha no promete valores literales (su `fuente` dice de dónde viene el dato, que puede resumir el plan · `indicaciones.ts`), así que un `> «…»` con un valor
 * de la ficha nunca es literal del plan. El chequeo NO cambia (aceptar la ficha validaría un resumen como cita): se dice en la referencia dónde va cada cosa.
 */
export const REGLA_DE_LOS_HECHOS_DE_LA_FICHA = 'Un `> «…»` (o «el plan dice: «…»» / «el manual dice: «…»») cita SOLO frases literales del plan o del manual. Lo que sale de «# FICHAS DE LAS OFERTAS» NUNCA va dentro de una cita, aunque su fuente sea el plan (la ficha puede resumirlo): va solo en «Hechos de las ofertas», en su línea con «(fuente: …)». Si una ruta o una meta solo está en la ficha, nómbrala fuera de la cita y remite a «Hechos de las ofertas».'
/** 18-nov (T7 segundo intento · la (b) del DIAGNÓSTICO de CC5): el brief v1 unió cuatro viñetas del plan con «. » en una sola cita */
export const REGLA_DE_LA_CITA_DE_LISTA = 'Si lo que citas es una LISTA del documento (viñetas o números), cita UN punto por `> «…»`, tal cual; nunca juntes varios puntos en una sola cita ni los unas con un punto o una coma: así ya no está literal en el documento.'

/** 18-nov (T7 · GO Lenovo opción 3): el brief v2 del sobre c trajo 31 `> «…»` (números sueltos, citas repetidas); con tantas, una o dos fallan siempre */
export const REGLA_DE_CITAR_POCO = 'Cita POCO: solo la frase del plan o del manual que sostiene una decisión del brief y que los creativos necesitan leer tal cual. No cites números sueltos ni celdas de indicadores (escríbelos con su fuente, sin comillas), ni la misma frase dos veces; lo demás dilo con tus palabras, sin comillas.'

export const REFERENCIA_DEL_BRIEF_CREATIVO = [
  '# El brief creativo de campaña (brief_creativo.v1) · UNO por campaña, corto',
  'Escribe EXACTAMENTE estas secciones (markdown, `## Título`); lo que no sepas se declara en «Faltantes», nunca se rellena.',
  'Un brief dice QUÉ hay que lograr y POR QUÉ; el cómo (el anuncio, la escena, las fotos, el formato, el llamado) lo deciden los creativos. No prescribas la solución.',
  'Este brief es lo ÚNICO del plan que reciben los creativos (con el manual): trae todo lo que necesitan del plan, citado; el plan es la fuente, el brief cita y no inventa.',
  '## De qué parte del plan sale · una cita LITERAL del plan (entre «»), porque la pieza debe poder rastrearse al plan.',
  '## Problema de negocio · qué le pasa al negocio que esta campaña tiene que mover, tal como lo dice el plan, porque sin problema no hay forma de saber si una idea sirve.',
  '## Público · cópialo del PLAN (quién es, dónde está, qué le impide hoy actuar: sus dudas y barreras), porque la mesa de la gran idea solo lee este brief.',
  '## Insight · una verdad del público en 1–2 frases, porque sin insight no hay idea, solo decoración.',
  '## Lo único que hay que comunicar · UNA proposición, máximo 2 frases, en lenguaje llano: lo que el público tiene que llevarse. NO es un anuncio ni un eslogan: sin llamado, sin dirección web ni teléfono, sin precio. Dos mensajes = ninguno.',
  '## Razones para creer · los hechos del plan o del manual que sostienen esa proposición, cada uno con de dónde sale, porque una promesa sin prueba no convence.',
  '## Rutas vivas del plan · TODAS las rutas o hipótesis que el plan quiere probar, cada una como cita LITERAL del plan en un bloque `> «…»`, y cómo las prueba (por ejemplo, una contra otra por tanda), porque la mesa de la gran idea no ve el plan y tiene que crear para cada una; no elijas una por tu cuenta. Una ruta que solo está en la ficha de la oferta (no en el plan) NO se cita: nómbrala fuera de la cita y remite a «Hechos de las ofertas».',
  '## Hechos de las ofertas · de cada oferta que toca la campaña, los hechos clave copiados de «# FICHAS DE LAS OFERTAS» (qué es, para quién y dónde, oferta y precio, cómo se compra, qué mostrar y qué nunca, obligatorios legales), uno por línea: «- <oferta> · <hecho> (fuente: <la de la ficha>)», nunca dentro de una cita `> «…»` (la ficha no es el plan). Si una oferta no tiene ficha, escribe «sin ficha de la oferta»; nunca los escribas de memoria.',
  '## Objetivo · el de la campaña CON SU NÚMERO tal como lo da el plan, y por red una línea «- <red>: objetivo», porque cada red pide una acción distinta. Si el plan no trae número, decláralo en «Faltantes».',
  '## Cómo sabremos que funcionó · cópialo del PLAN (los indicadores y la regla de revisión), porque sin medida no se puede decidir si seguir, ajustar o parar.',
  '## Tono · voz y trato que fija el manual, en 2 líneas (responde en el idioma y con el trato del manual del cliente), porque la voz es del cliente, no tuya.',
  '## Obligatorios · «- vocabulario: …» · «- prohibido: …» · «- lo que no se dice: …» · «- legales: …» (los de la ficha y el manual), porque son los límites que la pieza no puede cruzar.',
  '## Faltantes · «- <campo>: <qué falta>» (declarado, no rellenado) · ## Contradicciones plan vs manual · «- qué · plan dice · manual dice · qué se hizo» · ## Citas · «A1 usé: …» (de qué documento sale cada cosa).',
  'Lo que NO va en el brief: el texto final de un anuncio; el llamado a la acción y los formatos de las piezas; las fotos (ni elegidas ni citadas por número: las mira la mesa de la gran idea); el precio, el horario y los plazos escritos de memoria (solo llegan copiados de la ficha de cada oferta, con su fuente, en «Hechos de las ofertas»).',
  'Toda cita (un bloque `> «…»` o «el plan dice: «…»» / «el manual dice: «…»») va LITERAL, copiada de su documento: una cita nunca se corrige; si algo la contradice, se explica fuera de ella.',
  // 18-nov (T7 · DIAGNÓSTICO CC5 · GO Lenovo): las rutas y metas de un plan suelen venir en tablas; el brief aplanaba la fila y le sumaba los nombres de las columnas, y la cita dejaba de ser literal
  REGLA_DE_LA_CITA_DE_TABLA,
  // 18-nov (T7 segundo intento · GO Lenovo opción 1): una lista se cita por punto, y lo de la ficha nunca va en una cita
  REGLA_DE_LA_CITA_DE_LISTA,
  REGLA_DE_LOS_HECHOS_DE_LA_FICHA,
  // 18-nov (T7 · GO Lenovo opción 3): la causa de fondo, un brief con 31 citas
  REGLA_DE_CITAR_POCO,
].join('\n')
