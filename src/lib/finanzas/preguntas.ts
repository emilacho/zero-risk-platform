/**
 * EL CANAL DE PREGUNTAS A EMILIO (F7 · CC#1 · 14-oct · rev. 9) · diseño v2 §9b y §6b.6. Puro: nada se envía, nada llama a Slack.
 * Solo sube a Emilio lo que NO se resuelve con una firma ni con un «supuesto» y CAMBIA el resultado. Un solo mensaje agrupado por cliente.
 * Estados: borrador → enviada → respondida | vencida | sin_necesidad. Nace apagado (`finanzas_config.preguntas_slack`).
 */
import type { Veredicto } from './tipos'
// las formas «imperativo + pronombre» («separalo», «dejame»…) que genera la barredora de la casa: el mismo diccionario que convierte es el que detecta (20-oct · el buzón dejó pasar «Separalo en dos»)
import { FORMAS_CON_PRONOMBRE } from '../../../scripts/ops/barrer-voseo.mjs'

export type EstadoDePregunta = 'borrador' | 'enviada' | 'respondida' | 'vencida' | 'sin_necesidad'

export interface Pregunta {
  clave: string
  texto: string
  recomendacion: string
  supuesto_si_no_responde: string
}

/** el resultado de calcular con el mínimo y con el máximo de lo que no se sabe */
export interface Extremos { veredicto_min: Veredicto; veredicto_max: Veredicto; reparto_min: number; reparto_max: number; quien_paga_cambia?: boolean }

export interface ContextoDeFiltro {
  extremos: Extremos | null
  resuelta_por_firma: boolean
  es_de_afinar_despues: boolean
  ya_respondida: boolean
  /** el hilo del cliente ya la resolvió (condición 7) */
  resuelta_en_el_hilo: boolean
  cliente_real: boolean
  modo: 'apagado' | 'borrador' | 'envia'
  /** mensajes ya enviados por este cliente en las últimas 24 h y entre todos hoy */
  enviados_cliente_24h: number
  enviados_hoy_total: number
}

export const TOPE_POR_CLIENTE_24H = 1
export const TOPE_POR_DIA_TOTAL = 3
export const MAX_PREGUNTAS_POR_MENSAJE = 3
export const MAX_CARACTERES_POR_PREGUNTA = 600
export const HORAS_PARA_VENCER = 72

/** ¿cambia el resultado? (veredicto, reparto o quién paga distintos entre el mínimo y el máximo de lo que no se sabe) */
export function cambiaElResultado(x: Extremos | null): boolean {
  if (!x) return false
  const tol = 0.005 * Math.max(Math.abs(x.reparto_min), Math.abs(x.reparto_max), 1)
  return x.veredicto_min !== x.veredicto_max || Math.abs(x.reparto_min - x.reparto_max) > tol || x.quien_paga_cambia === true
}

/** las 7 condiciones; deben cumplirse TODAS. Devuelve el motivo si no. */
export function esPreguntaNecesaria(c: ContextoDeFiltro): { si: boolean; motivo?: string } {
  if (c.modo === 'apagado') return { si: false, motivo: 'canal apagado' }
  if (!cambiaElResultado(c.extremos)) return { si: false, motivo: 'no cambia el resultado: se resuelve con el supuesto' }
  if (c.resuelta_por_firma) return { si: false, motivo: 'la resuelve una firma' }
  if (c.es_de_afinar_despues) return { si: false, motivo: 'es de «afinar después» (backlog)' }
  if (c.ya_respondida) return { si: false, motivo: 'ya se respondió' }
  if (c.resuelta_en_el_hilo) return { si: false, motivo: 'el hilo ya la resolvió' }
  if (!c.cliente_real) return { si: false, motivo: 'cliente de práctica o en seco: solo borrador' }
  if (c.enviados_cliente_24h >= TOPE_POR_CLIENTE_24H) return { si: false, motivo: 'tope: un mensaje por cliente cada 24 h' }
  if (c.enviados_hoy_total >= TOPE_POR_DIA_TOTAL) return { si: false, motivo: 'tope: 3 mensajes por día entre todos los clientes' }
  return { si: true }
}

/**
 * «¿se envía AHORA?»: que la pregunta sea necesaria NO basta. En `borrador` la función `esPreguntaNecesaria` dice «sí» y aun así NO se envía: lo garantiza esta guarda
 * (y la ausencia de un adaptador de envío). El envío real (F8) debe pasar por aquí.
 */
export function puedeEnviarAhora(modo: ContextoDeFiltro['modo'], necesaria: { si: boolean }): boolean {
  return modo === 'envia' && necesaria.si === true
}

// ───────────────────────────────────────────────────────── jerga y voseo
/** palabras de jerga que NO pueden aparecer en el mensaje a Emilio. `prefijo: true` = nombres con guion bajo (finanzas_…); lo demás, PALABRA COMPLETA («api» no rechaza «apicultura») */
export const JERGA_PROHIBIDA: Array<{ palabra: string; prefijo?: boolean }> = [
  { palabra: 'dry_run' }, { palabra: 'finanzas_', prefijo: true }, { palabra: 'client_id' }, { palabra: 'supuestos.v2' },
  { palabra: 'workflow' }, { palabra: 'endpoint' }, { palabra: 'webhook' }, { palabra: 'supabase' }, { palabra: 'n8n' }, { palabra: 'mcp' }, { palabra: 'rls' },
  { palabra: 'sprint' }, { palabra: 'merge' }, { palabra: 'commit' }, { palabra: 'json' }, { palabra: 'api' }, { palabra: 'payload' }, { palabra: 'jefatura' },
  { palabra: 'tablero' }, { palabra: 'huella' }, { palabra: 'p8' }, { palabra: 'p9' },
]
const LETRA = 'a-záéíóúüñ0-9_'
const ESCAPAR = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function jergaEn(texto: string): string[] {
  const bajo = texto.toLowerCase()
  return JERGA_PROHIBIDA.filter((j) => new RegExp(`(?<![${LETRA}])${ESCAPAR(j.palabra)}${j.prefijo ? '' : `(?![${LETRA}])`}`).test(bajo)).map((j) => j.palabra)
}

// voseo: formas explícitas (lista) + terminaciones -ás/-ís (con excepciones del tuteo). Sin `\b` junto a vocal acentuada (en JS nunca coincide).
const VOSEO_EXPLICITO = [
  'vos', 'sos', 'sabés', 'tenés', 'querés', 'podés', 'hacés', 'ponés', 'decís', 'venís', 'salís', 'vivís', 'necesitás', 'cobrás', 'mirás', 'pagás', 'tomás', 'elegís',
  'mirá', 'andá', 'hacé', 'poné', 'respondé', 'elegí', 'confirmá', 'decime', 'decilo', 'decí', 'contame', 'avisame', 'avisá', 'fijate', 'tené', 'vení', 'salí', 'pasame', 'pasá',
  'enviá', 'revisá', 'probá', 'usá', 'esperá', 'mandá', 'cargá', 'buscá', 'dejá', 'tomá', 'llamá', 'ayudá', 'aclará', 'aprobá', 'rechazá', 'seleccioná', 'completá', 'cambiá',
  'corregí', 'corré', 'comprá', 'vendé', 'pagá', 'cobrá', 'escribí', 'decidí', 'firmá', 'cerrá', 'abrí', 'subí', 'bajá', 'pedí', 'mostrame', 'dame', 'dale',
]
// formas que la barredora de la casa (`scripts/ops/barrer-voseo.mjs`, TABLA) conoce y esta lista no tenía (la prueba las compara una a una)
const VOSEO_DE_LA_CASA = [
  'creés', 'leés', 'conocés', 'entendés', 'usás', 'agregá', 'declará', 'priorizá', 'tratá', 'comprobá', 'diagnosticá', 'verificá',
  'explicá', 'calculá', 'marcá', 'ignorá', 'aplicá', 'ejecutá', 'publicá', 'activá', 'apagá', 'guardá', 'sacá', 'quitá',
  'generá', 'creá', 'armá', 'cuidá', 'evitá', 'contá', 'empezá', 'pensá', 'ubicá', 'separá', 'juntá', 'compará',
  'limitá', 'respetá', 'citá', 'copiá', 'pegá', 'nombrá', 'listá', 'anotá', 'registrá', 'clasificá', 'identificá', 'determiná',
  'estimá', 'validá', 'contrastá', 'cotejá', 'adjuntá', 'incorporá', 'agrupá', 'filtrá', 'asigná', 'reservá', 'cancelá', 'continuá',
  'terminá', 'finalizá', 'entregá', 'preguntá', 'trabajá', 'utilizá', 'informá', 'recomendá', 'sugerí', 'hablá', 'fijá', 'asegurá',
  'acordá', 'devolvé', 'mantené', 'leé', 'volvé', 'resolvé', 'rehacé', 'rehacelo', 'sumá', 'dividí', 'ofrecé', 'conocé',
  'comprendé', 'prometé', 'emití', 'construí', 'describí', 'definí', 'incluí', 'seguí', 'descubrí', 'resumí', 'medí', 'repetí',
  'recibí', 'dirigí', 'invitá', 'distinguí', 'cumplí', 'sumate', 'elegilo', 'hacelo', 'asegurate', 'acordate', 'olvidate', 'andate',
  'quedate', 'cuidate', 'ponete', 'animate', 'apurate', 'calmate', 'mirate', 'sentate', 'enterate', 'avisate', 'pedilo', 'pedila',
  'decila', 'decíles', 'usalo', 'usala', 'usalas', 'usalos', 'mandalo', 'escribinos', 'dejalo', 'tomalo', 'mandame', 'escribilo',
  'buscalo', 'seás', 'corrés', 'rompés', 'completés', 'metés', 'parate', 'apoyate', 'estructurá', 'procurá', 'ahorrá', 'enumerá',
  'orientá', 'imaginá', 'marcalo', 'marcala', 'consultalo', 'repetilo', 'perdé', 'entendé', 'seguinos', 'contanos', 'llamanos', 'etiquetanos',
  'perdés', 'tirás', 'tirala', 'tirame', 'dependés', 'recordá', 'mostrale', 'dejalos', 'dejala', 'dejalas', 'hacelos', 'ponelo',
  'ponela', 'generás', 'declarás', 'mantenés', 'integrá', 'reescribí', 'mejorá', 'elaborá', 'explorá', 'borrá', 'ilustrá', 'demostrá',
  'mostrá', 'considerá', 'prepará', 'analizá', 'evaluá', 'reevaluá', 'enfocá', 'ordená', 'ponderá', 'apoyá', 'basá', 'fundá',
  'corregilo', 'podes', 'tenes', 'queres', 'decis',
]
const NO_IMPERATIVO_A = new Set(['está', 'allá', 'acá', 'papá', 'mamá', 'sofá', 'ojalá', 'maná', 'quizá', 'alá', 'ahá'])
const EXCEPCIONES_DE_TUTEO = new Set(['más', 'además', 'detrás', 'atrás', 'jamás', 'demás', 'quizás', 'estás', 'país', 'anís', 'maíz', 'raíz', 'baúl', 'luís', 'compás', 'sagitás', 'adiós', 'dale'])
const FUTURO_TUTEO = /(?:[aei]rás|tendrás|vendrás|pondrás|saldrás|habrás|podrás|querrás|sabrás|cabrás|valdrás|harás|dirás)$/
const PALABRA = new RegExp(`(?<![${LETRA}])[${LETRA}]+(?![${LETRA}])`, 'g')
export function voseoEn(texto: string): string[] {
  const hallados = new Set<string>()
  const lista = new Set([...VOSEO_EXPLICITO, ...VOSEO_DE_LA_CASA, ...FORMAS_CON_PRONOMBRE])
  for (const m of texto.toLowerCase().match(PALABRA) ?? []) {
    if (EXCEPCIONES_DE_TUTEO.has(m)) continue
    if (lista.has(m) && m !== 'dale') hallados.add(m)
    else if (m.length >= 5 && /ás$/.test(m) && !FUTURO_TUTEO.test(m)) hallados.add(m)
    else if (m.length >= 5 && /ís$/.test(m)) hallados.add(m)
    // imperativo voseante de los verbos en -ar (regular): «escuchá», «contestá»; el futuro («-rá») y las palabras que no son verbos quedan fuera
    else if (m.length >= 4 && m.endsWith('á') && !m.endsWith('rá') && !NO_IMPERATIVO_A.has(m)) hallados.add(m)
  }
  return [...hallados]
}

/**
 * LIMPIAR LA JERGA EN VEZ DE RECHAZAR TODO (31-oct): el jefe de finanzas escribió «tablero» en una recomendación y el filtro frenó las TRES preguntas en silencio.
 * Cada palabra con equivalente llano se cambia por él; los nombres internos con guion bajo (dry_run, finanzas_…, client_id, p8…) NO tienen equivalente: ésos siguen rechazándose.
 */
const EQUIVALENTE_LLANO: Record<string, string> = {
  tablero: 'cuadro de cifras', huella: 'identificador', jefatura: 'revisión', json: 'archivo de datos', api: 'conexión técnica', workflow: 'proceso',
  endpoint: 'conexión', webhook: 'aviso automático', supabase: 'base de datos', n8n: 'proceso automático', mcp: 'conector', rls: 'permisos',
  sprint: 'ciclo', merge: 'publicación', commit: 'cambio guardado', payload: 'datos enviados',
}
export function limpiarJerga(texto: string): { texto: string; cambiado: boolean } {
  let t = texto
  for (const [palabra, llano] of Object.entries(EQUIVALENTE_LLANO)) {
    t = t.replace(new RegExp(`(?<![${LETRA}])(${ESCAPAR(palabra)})(?![${LETRA}])`, 'gi'), (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? llano[0].toUpperCase() + llano.slice(1) : llano))
  }
  return { texto: t, cambiado: t !== texto }
}
/** la pregunta con la jerga cambiada por lo llano en sus tres campos; solo se usa si así queda SIN errores (si no, se conserva la original y se rechaza con su motivo) */
export function limpiarPregunta(p: Pregunta): { q: Pregunta; cambiada: boolean } {
  const n: Pregunta = { ...p, texto: limpiarJerga(p.texto ?? '').texto, recomendacion: limpiarJerga(p.recomendacion ?? '').texto, supuesto_si_no_responde: limpiarJerga(p.supuesto_si_no_responde ?? '').texto }
  const cambiada = n.texto !== p.texto || n.recomendacion !== p.recomendacion || n.supuesto_si_no_responde !== p.supuesto_si_no_responde
  return cambiada && erroresDePregunta(n).length === 0 ? { q: n, cambiada: true } : { q: p, cambiada: false }
}

export function erroresDePregunta(p: Pregunta): string[] {
  const e: string[] = []
  if (!p.clave?.trim()) e.push('falta la clave')
  for (const [campo, v] of [['texto', p.texto], ['recomendacion', p.recomendacion], ['supuesto_si_no_responde', p.supuesto_si_no_responde]] as const) {
    if (!v || !v.trim()) e.push(`falta ${campo}`)
    else {
      for (const j of jergaEn(v)) e.push(`${campo}: jerga «${j}»`)
      if (voseoEn(v).length) e.push(`${campo}: voseo (tuteo, siempre): ${voseoEn(v).join(', ')}`)
    }
  }
  // lo que el dueño lee primero (pregunta + recomendación) cabe en MAX; el «si no respondes» cabe en MAX aparte (si no entra junto, va como primera respuesta del hilo)
  const principal = `${p.texto} ${p.recomendacion}`.length, supuesto = (p.supuesto_si_no_responde ?? '').length
  if (principal > MAX_CARACTERES_POR_PREGUNTA) e.push(`la pregunta pasa de ${MAX_CARACTERES_POR_PREGUNTA} caracteres (${principal})`)
  if (supuesto > MAX_CARACTERES_POR_PREGUNTA) e.push(`el «si no respondes» pasa de ${MAX_CARACTERES_POR_PREGUNTA} caracteres (${supuesto})`)
  return e
}

/** UN solo mensaje agrupado por cliente: máximo 3 preguntas, numeradas, cada una con su recomendación y su «si no respondes» */
export const cabeJunto = (q: Pregunta): boolean => `${q.texto} ${q.recomendacion} ${q.supuesto_si_no_responde}`.length <= MAX_CARACTERES_POR_PREGUNTA

/** si alguna pregunta no cabe entera en MAX, el «si no respondes» de TODAS sale aparte (`supuestos`), para mandarlo como primera respuesta del hilo; si todas caben, un solo mensaje como siempre */
export function armarMensaje(p: { cliente: string; preguntas: Pregunta[]; enlace_al_hilo?: string }): { ok: true; texto: string; claves: string[]; supuestos?: string } | { ok: false; errores: string[] } {
  if (!p.cliente?.trim()) return { ok: false, errores: ['falta el nombre del cliente'] }
  if (!p.preguntas.length) return { ok: false, errores: ['no hay preguntas'] }
  if (p.preguntas.length > MAX_PREGUNTAS_POR_MENSAJE) return { ok: false, errores: [`máximo ${MAX_PREGUNTAS_POR_MENSAJE} preguntas por mensaje`] }
  const claves = p.preguntas.map((q) => q.clave)
  if (new Set(claves).size !== claves.length) return { ok: false, errores: ['claves repetidas'] }
  const errores = p.preguntas.flatMap((q, i) => erroresDePregunta(q).map((x) => `pregunta ${i + 1}: ${x}`))
  if (errores.length) return { ok: false, errores }
  const n = p.preguntas.length
  const aparte = !p.preguntas.every(cabeJunto)
  const cuerpo = p.preguntas.map((q, i) => `${i + 1}) ${q.texto.trim()}\n   Lo que recomiendo: ${q.recomendacion.trim()}${aparte ? '' : `\n   Si no respondes: ${q.supuesto_si_no_responde.trim()}`}`).join('\n')
  const supuestos = aparte ? `Si no respondes, esto es lo que supondré:\n${p.preguntas.map((q, i) => `${i + 1}) ${q.supuesto_si_no_responde.trim()}`).join('\n')}` : undefined
  const respuesta = n === 1 ? 'Responde «1 sí», «1 no» o escribe tu cifra' : 'Responde con el número de cada pregunta y «sí», «no» o tu cifra'
  const enlace = p.enlace_al_hilo ? `\nResponde en este hilo: ${p.enlace_al_hilo}` : ''
  return { ok: true, claves, ...(supuestos ? { supuestos } : {}), texto: `Hola Emilio. Para el plan de ${p.cliente.trim()} necesito tu decisión en ${n === 1 ? 'una cosa' : n + ' cosas'}:\n${cuerpo}\n${respuesta}.${enlace}` }
}

/** a las 72 h una pregunta enviada y sin respuesta pasa a `vencida`; el plan sigue con el supuesto. No se reenvía. */
export function estadoTrasElTiempo(p: { estado: EstadoDePregunta; enviada_en: string | null }, ahora: Date): EstadoDePregunta {
  if (p.estado !== 'enviada' || !p.enviada_en) return p.estado
  const t = Date.parse(p.enviada_en)
  if (!Number.isFinite(t)) return p.estado
  return ahora.getTime() - t >= HORAS_PARA_VENCER * 3600_000 ? 'vencida' : 'enviada'
}

const TRANSICIONES: Record<EstadoDePregunta, EstadoDePregunta[]> = {
  borrador: ['enviada', 'sin_necesidad'],
  enviada: ['respondida', 'vencida', 'sin_necesidad'],
  respondida: [],
  vencida: [],
  sin_necesidad: [],
}
export const transicionValida = (de: EstadoDePregunta, a: EstadoDePregunta): boolean => TRANSICIONES[de].includes(a)

// ───────────────────────────────────────────────────────── leer lo que Emilio contesta (R5 de CC#3: NUNCA deformar una cifra)
export type Valor = 'si' | 'no' | { cifra: number }
export type LecturaDeRespuesta =
  | { tipo: 'respuesta'; clave: string; valor: Valor; literal: string }
  | { tipo: 'nota'; literal: string }
  | { tipo: 'no_entendida'; literal: string; motivo: string }

/**
 * Una cifra: entero o decimal con UN solo separador (`.` o `,`), con «$», «US$» o «USD» opcionales. `12` es 12, `1.5` y `1,5` son 1,5, `0,5` es 0,5.
 * `1.234,50` y `1,234.50` (el último separador es el decimal) valen 1234,5. Un grupo de EXACTAMENTE tres dígitos tras un solo separador (`1.500`) es AMBIGUO (¿1,5 o 1500?): no se adivina.
 */
export function leerCifra(texto: string): { ok: true; cifra: number } | { ok: false; motivo: string } {
  // el espacio NO es un separador cualquiera: solo separa la moneda de la cifra o los MILES en grupos de exactamente 3 («12 000»); «10 20» o «1 2 3» no son una cifra
  const t = texto.trim().toLowerCase()
  const m = /^(?:(?:us\$|usd|\$)\s*)?(\d[\d., ]*?)(?:\s*(?:usd|us\$|\$|dólares?|dolares?))?$/.exec(t)
  if (!m) return { ok: false, motivo: 'no es una cifra' }
  let n = m[1]
  if (n.includes(' ')) {
    if (!/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(n)) return { ok: false, motivo: 'no es una cifra (los espacios solo separan miles en grupos de 3)' }
    n = n.replace(/ /g, '')
  }
  if (/^0\d/.test(n)) return { ok: false, motivo: 'no es una cifra (ceros a la izquierda)' }
  if (n.replace(/\D/g, '').length > 9) return { ok: false, motivo: 'cifra fuera de rango' }
  const puntos = (n.match(/\./g) ?? []).length, comas = (n.match(/,/g) ?? []).length
  if (puntos === 0 && comas === 0) return { ok: true, cifra: Number(n) }
  if (puntos + comas === 1) {
    const sep = puntos ? '.' : ','
    const [ent, dec] = n.split(sep)
    if (!dec) return { ok: false, motivo: 'separador sin decimales' }
    if (dec.length === 3) return { ok: false, motivo: `«${n}» es ambiguo (¿${ent},${dec} o ${ent}${dec}?)` }
    if (dec.length > 3) return { ok: false, motivo: 'demasiados decimales' }
    return { ok: true, cifra: Number(`${ent}.${dec}`) }
  }
  // varios separadores: con los dos tipos, el último es el decimal y los demás son miles (grupos de 3)
  const mal = { ok: false as const, motivo: 'cifra con separadores mal puestos' }
  if (puntos > 0 && comas > 0) {
    const ult = Math.max(n.lastIndexOf('.'), n.lastIndexOf(','))
    const dec = n.slice(ult + 1)
    const grupos = n.slice(0, ult).split(/[.,]/)
    const bien = /^\d{1,2}$/.test(dec) && /^\d{1,3}$/.test(grupos[0]) && grupos.slice(1).every((g) => /^\d{3}$/.test(g))
    return bien ? { ok: true, cifra: Number(`${grupos.join('')}.${dec}`) } : mal
  }
  // solo puntos o solo comas, varios: miles
  const miles = n.split(/[.,]/)
  return /^\d{1,3}$/.test(miles[0]) && miles.slice(1).every((g) => /^\d{3}$/.test(g)) ? { ok: true, cifra: Number(miles.join('')) } : mal
}

const SI = /^(s[ií]|dale|ok|de acuerdo|vale|claro)$/i
const NO = /^no$/i
function leerValor(t: string): { ok: true; valor: Valor } | { ok: false; motivo: string } {
  const x = t.trim().replace(/[.!¡]+$/g, '').trim()
  if (SI.test(x)) return { ok: true, valor: 'si' }
  if (NO.test(x)) return { ok: true, valor: 'no' }
  const c = leerCifra(x)
  return c.ok ? { ok: true, valor: { cifra: c.cifra } } : { ok: false, motivo: c.motivo }
}

/**
 * «1 sí», «1) no», «1: 25», «1 1.5», «2 0,5». El número de pregunta SOLO cuenta si lo sigue un separador (`)`, `:`, `-`, `. ` o un espacio): «12», «10» y «1.5» NO se parten.
 * Con UNA sola pregunta se acepta la respuesta sola («sí», «25», «1,5», «12»). Con varias, una cifra o un sí/no sin número queda «no entendida» (no se adivina a qué pregunta va).
 * Lo que no se entiende NO cambia nada. Una nota suelta (texto) es nota del dueño, NUNCA un dato confirmado.
 */
export function leerRespuesta(texto: string, claves: string[]): LecturaDeRespuesta[] {
  const out: LecturaDeRespuesta[] = []
  const lineas = String(texto ?? '').split(/\n|;/).map((l) => l.trim()).filter(Boolean)
  for (const l of lineas) {
    // 1 · ¿trae «número de pregunta + separador + valor»?
    const m = /^(\d{1,2})(?:\s*[):\-]\s*|\.\s+|\s+)(.+)$/.exec(l)
    if (m) {
      const idx = Number(m[1]) - 1
      // «1 500»: ¿pregunta 1 con 500, o mil quinientos? No se adivina (si el primer número no puede ser una pregunta, es una cifra con miles: «12 000»)
      if (idx >= 0 && idx < claves.length && /^\d{1,3}(?: \d{3})+(?:,\d{1,2})?$/.test(l)) { out.push({ tipo: 'no_entendida', literal: l, motivo: `«${l}» es ambiguo (¿pregunta ${m[1]} o una cifra con miles?)` }); continue }
      const v = leerValor(m[2])
      if (idx >= 0 && idx < claves.length && v.ok) { out.push({ tipo: 'respuesta', clave: claves[idx], valor: v.valor, literal: l }); continue }
      // «1 12» con una sola pregunta (1 = la pregunta) ya entró arriba; si el número no es una pregunta, sigue como valor entero
      if (idx >= claves.length || idx < 0) {
        const entero = leerValor(l)
        if (claves.length === 1 && entero.ok) { out.push({ tipo: 'respuesta', clave: claves[0], valor: entero.valor, literal: l }); continue }
        out.push({ tipo: 'no_entendida', literal: l, motivo: `no hay pregunta ${m[1]}` })
        continue
      }
      out.push({ tipo: 'no_entendida', literal: l, motivo: v.ok ? 'sin pregunta' : v.motivo })
      continue
    }
    // 2 · un valor solo
    const v = leerValor(l)
    if (v.ok) {
      if (claves.length === 1) out.push({ tipo: 'respuesta', clave: claves[0], valor: v.valor, literal: l })
      else out.push({ tipo: 'no_entendida', literal: l, motivo: 'varias preguntas: falta el número de la pregunta' })
      continue
    }
    // 3 · una cifra mal puesta cuenta como no entendida (no como nota); lo demás es una nota del dueño
    if (/^[\s$]*(?:us\$)?\d[\d.,]*\s*(?:usd)?$/i.test(l)) { out.push({ tipo: 'no_entendida', literal: l, motivo: v.motivo }); continue }
    out.push({ tipo: 'nota', literal: l })
  }
  return out
}
