/**
 * EL BRIEF CREATIVO DE CAMPAÑA · contrato `brief_creativo.v1` (31-oct · diseño «nuevo orden de la cadena» v5 §3 · plan de construcción v2 T1).
 * UN brief por campaña, corto, escrito por `campaign-brief-agent` como mesa de un miembro (`brief_mesa`): insight · UN mensaje · objetivo (y por red) · tono · obligatorios · faltantes
 * declarados · contradicciones plan vs manual · citas. Reemplaza al `brief_fila.v1` (brief por publicación), que nadie usa.
 * `leerBriefCreativo()` lo lee por código y aplica los chequeos portados de `brief-chequeos.js` (el nodo ④ del parte): un solo mensaje · la cita del plan es literal · ninguna cifra `,77` ·
 * ninguna palabra prohibida fuera de la lista «prohibido» · el público no es «todos» (si lo nombra) · secciones obligatorias presentes. Lo que falla deja el brief `devuelta`
 * (la cadena pide UNA vez más; si sigue, `necesita_humano`). Nada aquí sabe de un cliente ni habla con un modelo.
 */
import { citaAparece, normalizar, textoDelDocumento } from './texto'

// el lector común vive en ./texto (GO Lenovo 10-nov 18:48Z); se reexporta para quien ya lo importa desde aquí
export { textoDelDocumento }
import type { Canal, Hallazgo } from './tipos'
import type { ContextoDelCliente } from './almacen'
import { CONTRATO_BRIEF_CREATIVO, claveDeTexto, contienePalabraEntera, seccionesDe, tieneCifraInventada } from './conceptos'
import { formasDeOtroRegistro, nombreDelRegistro, type RegistroDelCliente } from './registro'

export { CONTRATO_BRIEF_CREATIVO }

export interface ObjetivoPorRed { red: string; objetivo: string; llamado: string }
export interface BriefCreativoLeido {
  contrato: typeof CONTRATO_BRIEF_CREATIVO
  de_que_parte_del_plan: string
  insight: string
  mensaje: string
  objetivo: string
  /** 10-nov (ADENDA de Emilio · 2): copiados del plan */
  publico: string
  como_sabremos: string
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
export const SECCIONES_DEL_BRIEF = ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Público', 'Objetivo', 'Cómo sabremos que funcionó', 'Tono', 'Obligatorios', 'Faltantes', 'Contradicciones plan vs manual', 'Citas'] as const
const OBLIGATORIAS = ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Público', 'Objetivo', 'Cómo sabremos que funcionó', 'Tono', 'Obligatorios'] as const
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
 * LAS SECCIONES OBLIGATORIAS QUE LE FALTAN A UN BRIEF, con el MISMO criterio que el lector (ausente o vacía).
 * 10-nov · el brief v3 de Náufrago se devolvió porque el anterior (validado antes de #968) no tenía «Público» ni «Cómo sabremos que funcionó»
 * y la mesa lo conservó «tal cual»: el marco de un pedido de cambios lo usa para nombrar lo que hay que agregar.
 */
export function seccionesObligatoriasQueFaltan(md: string): string[] {
  const t = textosPorSeccion(md)
  return OBLIGATORIAS.filter((k) => !t(k))
}

/** ¿la cita está literal en el documento? Una elisión («…», «...», «[…]», «(…)») parte la cita: cada tramo tiene que estar */
function citaLiteralEn(documento: string, cita: string): boolean {
  const tramos = cita.split(/\s*(?:\[\s*(?:…|\.\.\.)\s*\]|\(\s*(?:…|\.\.\.)\s*\)|…|\.\.\.)\s*/).filter((x) => normalizar(x).length >= 4)
  return tramos.length > 0 && tramos.every((x) => citaAparece(documento, x))
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
      const entera = /^\s*«([\s\S]*)»\s*$/.exec(b)
      const partes = entera ? [entera[1]] : [...b.matchAll(/«([^»]+)»/g)].map((m) => m[1])
      for (const c of partes.length ? partes : [b]) {
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
  const vistas = new Set<string>()
  return out.filter((x) => { const k = `${x.fuente}|${normalizar(x.cita)}`; if (vistas.has(k)) return false; vistas.add(k); return true })
}

export function leerBriefCreativo(md: string, ins: InsumosDelBrief): BriefCreativoLeido {
  const secciones = seccionesDe(md)
  const t = textosPorSeccion(md)
  const avisos: string[] = []
  const bloqueos: string[] = []

  // secciones obligatorias presentes y con texto
  for (const k of OBLIGATORIAS) if (!t(k)) bloqueos.push(`falta la sección «## ${k}»`)

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
    bloqueos.push(`la cita «${x.cita.slice(0, 80)}» (en «## ${x.seccion}») no está literal en el ${x.fuente === 'manual' ? 'manual' : 'plan'} · una cita nunca se corrige: cópiala tal cual y, si el cambio pedido la contradice, explícalo fuera de la cita`)
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

  // 10-nov (ADENDA de Emilio · 2): el objetivo de la campaña lleva su número (el del plan); si el plan no lo tiene, se declara en «Faltantes», nunca se inventa
  const faltaObjetivo = lineasConClave(t('Faltantes')).some((l) => /^objetivo/.test(claveDeTexto(l.clave)))
  if (objetivo && !/\d/.test(objetivo) && !faltaObjetivo) bloqueos.push('el objetivo de la campaña no trae su número del plan (cópialo del plan, o decláralo en «Faltantes» si el plan no lo tiene)')

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
  if (lineaPublico && publicoEsTodos(lineaPublico[1])) avisos.push(`el público dice «${lineaPublico[1].trim().slice(0, 60)}» · no es una audiencia declarada`)

  // cifras ,77 y prohibidas fuera de la lista «prohibido» y de las contradicciones (ahí se citan para decir que NO se usan)
  if (tieneCifraInventada(md)) bloqueos.push('hay una cifra «,77» (dato inventado: copió el ejemplo en vez de pensar)')
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
    de_que_parte_del_plan: cita, insight: t('Insight'), mensaje, objetivo, publico: t('Público'), como_sabremos: t('Cómo sabremos que funcionó'), por_red, tono: t('Tono'), obligatorios, faltantes, contradicciones, citas: t('Citas'),
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
  '## Público · cópialo del PLAN (quién es, dónde está, qué duda tiene), porque la mesa de la gran idea solo lee este brief.',
  '## Objetivo · el de la campaña CON SU NÚMERO tal como lo da el plan, y por red una línea «- ig: objetivo · llamado», porque cada red pide una acción distinta. Si el plan no trae número, decláralo en «Faltantes».',
  '## Cómo sabremos que funcionó · cópialo del PLAN (los indicadores y la regla de revisión), porque sin medida no se puede decidir si seguir, ajustar o parar.',
  '## Tono · voz y trato que fija el manual, en 2 líneas (responde en el idioma y con el trato del manual del cliente), porque la voz es del cliente, no tuya.',
  '## Obligatorios · «- vocabulario: …» · «- prohibido: …» · «- lo que no se dice: …», porque son los límites que la pieza no puede cruzar.',
  '## Faltantes · «- <campo>: <qué falta>» (declarado, no rellenado) · ## Contradicciones plan vs manual · «- qué · plan dice · manual dice · qué se hizo» · ## Citas · «A1 usé: …».',
  'Sin cifras con decimales inventadas; sin datos con valor (precios, horarios) que no estén en el material con su referencia.',
  'Toda cita (un bloque `> «…»` o «el plan dice: «…»» / «el manual dice: «…»») va LITERAL, copiada de su documento: una cita nunca se corrige; si algo la contradice, se explica fuera de ella.',
].join('\n')
