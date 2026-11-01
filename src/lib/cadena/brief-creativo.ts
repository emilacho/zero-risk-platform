/**
 * EL BRIEF CREATIVO DE CAMPAÑA · contrato `brief_creativo.v1` (31-oct · diseño «nuevo orden de la cadena» v5 §3 · plan de construcción v2 T1).
 * UN brief por campaña, corto, escrito por `campaign-brief-agent` como mesa de un miembro (`brief_mesa`): insight · UN mensaje · objetivo (y por red) · tono · obligatorios · faltantes
 * declarados · contradicciones plan vs manual · citas. Reemplaza al `brief_fila.v1` (brief por publicación), que nadie usa.
 * `leerBriefCreativo()` lo lee por código y aplica los chequeos portados de `brief-chequeos.js` (el nodo ④ del parte): un solo mensaje · la cita del plan es literal · ninguna cifra `,77` ·
 * ninguna palabra prohibida fuera de la lista «prohibido» · el público no es «todos» (si lo nombra) · secciones obligatorias presentes. Lo que falla deja el brief `devuelta`
 * (la cadena pide UNA vez más; si sigue, `necesita_humano`). Nada aquí sabe de un cliente ni habla con un modelo.
 */
import { citaAparece, normalizar } from './texto'
import type { Hallazgo } from './tipos'
import { CONTRATO_BRIEF_CREATIVO, claveDeTexto, contienePalabraEntera, seccionesDe, tieneCifraInventada } from './conceptos'

export { CONTRATO_BRIEF_CREATIVO }

export interface ObjetivoPorRed { red: string; objetivo: string; llamado: string }
export interface BriefCreativoLeido {
  contrato: typeof CONTRATO_BRIEF_CREATIVO
  de_que_parte_del_plan: string
  insight: string
  mensaje: string
  objetivo: string
  por_red: ObjetivoPorRed[]
  tono: string
  obligatorios: { vocabulario: string[]; prohibido: string[]; no_se_dice: string[] }
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
  /** palabras prohibidas del manual */
  prohibidas: string[]
  /** redes principal/réplica de la estrategia: cada una necesita objetivo y llamado (falta ⇒ se declara) */
  redes?: string[]
}

export const SECCIONES_DEL_BRIEF = ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Objetivo', 'Tono', 'Obligatorios', 'Faltantes', 'Contradicciones plan vs manual', 'Citas'] as const
const OBLIGATORIAS = ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Objetivo', 'Tono', 'Obligatorios'] as const
export const MAX_CARACTERES_DEL_MENSAJE = 260
export const MIN_CARACTERES_DE_CITA = 12
const CLICHES_DE_PUBLICO = ['todos', 'todo el mundo', 'toda la poblacion', 'publico general', 'cualquier persona', 'cualquiera', 'toda la gente', 'la gente']

type Sec = ReturnType<typeof seccionesDe>[number]
function tituloConocido(s: Sec): (typeof SECCIONES_DEL_BRIEF)[number] | null {
  const t = claveDeTexto(s.titulo)
  for (const k of SECCIONES_DEL_BRIEF) { const c = claveDeTexto(k); if (t === c || t.startsWith(c + ' ')) return k }
  return null
}
/** el texto de una sección: lo que sigue al título en la misma línea + el cuerpo */
function textoDe(s: Sec | undefined, titulo: string): string {
  if (!s) return ''
  const resto = s.titulo.slice(titulo.length).replace(/^[\s·:—-]+/, '').trim()
  return [resto, s.cuerpo].filter(Boolean).join('\n').trim()
}
/** líneas `- clave: valor` de una sección (sin exigir mayúsculas) */
function lineasConClave(texto: string): Array<{ clave: string; valor: string }> {
  const out: Array<{ clave: string; valor: string }> = []
  for (const l of texto.split('\n')) {
    const m = /^\s*-\s*([^:·]{1,60}?)\s*:\s*(.*)$/.exec(l)
    if (m) out.push({ clave: m[1].trim(), valor: m[2].trim() })
  }
  return out
}
const lista = (v: string): string[] => v.split(/[;·]|,(?![^(]*\))/).map((x) => x.trim().replace(/^«|»$/g, '')).filter(Boolean)
/** el número de frases de un mensaje (un brief = UN mensaje: máximo 2 frases, 260 caracteres) */
export const frasesDe = (s: string): number => s.split(/[.!?¡¿]+/).map((x) => x.trim()).filter(Boolean).length
/** ¿el público dice «todos»? (si lo nombra) */
export function publicoEsTodos(publico: string): boolean {
  const p = normalizar(publico).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!p) return false
  return CLICHES_DE_PUBLICO.some((c) => p === c || p.startsWith(c + ' ') || (p.length < 40 && p.includes(c)))
}

export function leerBriefCreativo(md: string, ins: InsumosDelBrief): BriefCreativoLeido {
  const secciones = seccionesDe(md)
  const por = new Map<string, Sec>()
  for (const s of secciones) { const k = tituloConocido(s); if (k && !por.has(k)) por.set(k, s) }
  const t = (k: (typeof SECCIONES_DEL_BRIEF)[number]) => textoDe(por.get(k), k)
  const avisos: string[] = []
  const bloqueos: string[] = []

  // secciones obligatorias presentes y con texto
  for (const k of OBLIGATORIAS) if (!t(k)) bloqueos.push(`falta la sección «## ${k}»`)

  // UN mensaje
  const mensaje = t('Mensaje').split('\n')[0]?.trim() ?? ''
  const lineasDeMensaje = t('Mensaje').split('\n').map((x) => x.trim()).filter(Boolean)
  if (mensaje) {
    if (lineasDeMensaje.length > 1) bloqueos.push(`el mensaje tiene ${lineasDeMensaje.length} líneas · un brief = UN mensaje`)
    const n = frasesDe(mensaje)
    if (n > 2) bloqueos.push(`el mensaje tiene ${n} frases · sospecha de varios mensajes (máximo 2 frases, una idea)`)
    if (mensaje.length > MAX_CARACTERES_DEL_MENSAJE) bloqueos.push(`el mensaje mide ${mensaje.length} caracteres · una idea cabe en ${MAX_CARACTERES_DEL_MENSAJE}`)
  }

  // la cita del plan es LITERAL
  const cita = t('De qué parte del plan sale')
  if (cita) {
    const entreComillas = [...cita.matchAll(/[«"“]([^»"”]{4,})[»"”]/g)].map((m) => m[1])
    const candidatas = entreComillas.length ? entreComillas : [cita]
    const literal = candidatas.some((c) => normalizar(c).length >= MIN_CARACTERES_DE_CITA && citaAparece(ins.planTexto, c))
    if (normalizar(cita).length < MIN_CARACTERES_DE_CITA) bloqueos.push(`la cita al plan es demasiado corta para verificarse: «${cita.slice(0, 60)}»`)
    else if (!literal) bloqueos.push(`la cita «${cita.slice(0, 80)}» no se encuentra literal en el plan · no se puede verificar de qué parte sale`)
  }

  // objetivo por red: «- ig: objetivo · llamado»
  const objetivoTexto = t('Objetivo')
  const por_red: ObjetivoPorRed[] = lineasConClave(objetivoTexto).map((l) => {
    const [objetivo, ...resto] = l.valor.split(/\s·\s/)
    return { red: l.clave.toLowerCase(), objetivo: (objetivo ?? '').trim(), llamado: resto.join(' · ').trim() }
  })
  const objetivo = objetivoTexto.split('\n').filter((l) => !/^\s*-\s*[^:·]{1,60}?\s*:/.test(l)).join('\n').trim()
  for (const r of ins.redes ?? []) {
    const o = por_red.find((x) => claveDeTexto(x.red) === claveDeTexto(r))
    if (!o) avisos.push(`la red ${r} no tiene objetivo ni llamado en el brief`)
    else if (!o.llamado) avisos.push(`la red ${r} no tiene llamado («- ${r}: objetivo · llamado»)`)
  }

  // obligatorios: vocabulario · prohibido · lo que no se dice
  const ob = lineasConClave(t('Obligatorios'))
  const de = (re: RegExp) => ob.filter((l) => re.test(claveDeTexto(l.clave))).flatMap((l) => lista(l.valor))
  const obligatorios = { vocabulario: de(/^vocabulario/), prohibido: de(/^prohibid/), no_se_dice: de(/^lo que no se dice|^no se dice/) }

  // faltantes (declarados, nunca rellenados) y contradicciones
  const faltantes = lineasConClave(t('Faltantes')).map((l) => ({ campo: l.clave, que_falta: l.valor }))
  const contradicciones = t('Contradicciones plan vs manual').split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter((x) => x && !/^(ninguna|no hay)/i.test(x))

  // el público no es «todos» (si lo nombra): una línea «público:» / «- público:» en cualquier sección MENOS «Faltantes» (ahí «público: lo que falta» no es la audiencia)
  const textoSinFaltantes = secciones.filter((s) => tituloConocido(s) !== 'Faltantes').map((s) => `${s.titulo}\n${s.cuerpo}`).join('\n')
  const lineaPublico = /^\s*-?\s*p[úu]blico\s*:\s*(.+)$/imu.exec(textoSinFaltantes)
  if (lineaPublico && publicoEsTodos(lineaPublico[1])) bloqueos.push(`el público dice «${lineaPublico[1].trim().slice(0, 60)}» · no es una audiencia declarada`)

  // cifras ,77 y prohibidas fuera de la lista «prohibido» y de las contradicciones (ahí se citan para decir que NO se usan)
  if (tieneCifraInventada(md)) bloqueos.push('hay una cifra «,77» (dato inventado: copió el ejemplo en vez de pensar)')
  const loQuePide = secciones.filter((s) => tituloConocido(s) !== 'Contradicciones plan vs manual').map((s) => (tituloConocido(s) === 'Obligatorios' ? lineasConClave(textoDe(s, 'Obligatorios')).filter((l) => !/^prohibid|^lo que no se dice|^no se dice/.test(claveDeTexto(l.clave))).map((l) => l.valor).join('\n') : textoDe(s, tituloConocido(s) ?? s.titulo))).join('\n')
  for (const p of ins.prohibidas) if (contienePalabraEntera(loQuePide, p)) bloqueos.push(`usa «${p}», prohibida por el manual (fuera de la lista de prohibidas)`)
  for (const p of ins.prohibidas) if (!obligatorios.prohibido.some((x) => claveDeTexto(x) === claveDeTexto(p))) avisos.push(`la prohibida del manual «${p}» no está en la lista «prohibido» del brief`)

  return {
    contrato: CONTRATO_BRIEF_CREATIVO,
    de_que_parte_del_plan: cita, insight: t('Insight'), mensaje, objetivo, por_red, tono: t('Tono'), obligatorios, faltantes, contradicciones, citas: t('Citas'),
    avisos, bloqueos, estado: bloqueos.length ? 'devuelta' : 'validada',
  }
}

/** los hallazgos para `cadena_validaciones` (objeto `brief_creativo`) */
export function hallazgosDelBrief(b: BriefCreativoLeido): Hallazgo[] {
  const ficha = (que: string, gravedad: 'bloquea' | 'aviso'): Hallazgo => ({ chequeo: 'brief_creativo', severidad: gravedad, fila_id: null, alcance: 'tanda', ficha: { que, donde: 'brief creativo', contra_que: CONTRATO_BRIEF_CREATIVO, gravedad, propuesta: gravedad === 'bloquea' ? 'se devuelve UNA vez con estos puntos; si sigue, necesita_humano' : 'se declara' } })
  return [...b.bloqueos.map((x) => ficha(x, 'bloquea')), ...b.avisos.map((x) => ficha(x, 'aviso'))]
}

/** la referencia corta del brief creativo (6 campos con su porqué) que recibe la mesa del brief en su marco · texto, sin cliente */
export const REFERENCIA_DEL_BRIEF_CREATIVO = [
  '# El brief creativo de campaña (brief_creativo.v1) · UNO por campaña, corto',
  'Escribe EXACTAMENTE estas secciones (markdown, `## Título`); lo que no sepas se declara en «Faltantes», nunca se rellena.',
  '## De qué parte del plan sale · una cita LITERAL del plan (entre «»), porque la pieza debe poder rastrearse al plan.',
  '## Insight · una verdad del público en 1–2 frases, porque sin insight no hay idea, solo decoración.',
  '## Mensaje · UNO, máximo 2 frases, porque dos mensajes = ninguno.',
  '## Objetivo · el de la campaña, medible, y por red una línea «- ig: objetivo · llamado», porque cada red pide una acción distinta.',
  '## Tono · voz y trato que fija el manual, en 2 líneas (responde en el idioma y con el trato del manual del cliente), porque la voz es del cliente, no tuya.',
  '## Obligatorios · «- vocabulario: …» · «- prohibido: …» · «- lo que no se dice: …», porque son los límites que la pieza no puede cruzar.',
  '## Faltantes · «- <campo>: <qué falta>» (declarado, no rellenado) · ## Contradicciones plan vs manual · «- qué · plan dice · manual dice · qué se hizo» · ## Citas · «A1 usé: …».',
  'Sin cifras con decimales inventadas; sin datos con valor (precios, horarios) que no estén en el material con su referencia.',
].join('\n')
