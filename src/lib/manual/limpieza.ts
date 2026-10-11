/**
 * LIMPIEZA DEL MANUAL POR CÓDIGO (ronda 68). PURO, agnóstico: el formato y los hechos los chequea el código; lo creativo es libre.
 *
 *  1 · NOMBRES INTERNOS CITADOS COMO FUENTE: «(discovery_summary)», «(icp_signals)», «[responde a pain point S4; … discovery_summary]», «ICP buying_process S3»… son etiquetas del sistema, no fuentes
 *      para un lector. Se quitan de la prosa (la fuente vive en los metadatos del campo). Se reconocen por FORMA (identificador con guion bajo, «ICP <campo>»), no por una lista de nombres.
 *  2 · FRAGMENTOS: al quitar una cita puede quedar «Según el análisis competitivo del mercado local. , lo que le otorga…» (oración sin sujeto + continuación huérfana). La oración sale entera.
 *  3 · PALABRAS PROHIBIDAS PROPIAS: ninguna parte del manual usa las palabras que el mismo manual lista en `forbidden_words` (salvo para MENCIONARLAS: entre comillas o tras «nunca/evita/sin…»).
 * Todo lo que sale va SOLO al registro interno (nunca a la bandeja ni a Slack).
 */
import { normalizar } from './texto'

export interface QuitadoPorLimpieza { ruta: string; texto: string; motivo: 'nombre_interno_citado' | 'fragmento' | 'palabra_prohibida_propia' }

// ───────────────────────── recorrido de textos (con ruta «campo», «campo[2]», «campo.sub»)
type Hoja = { ruta: string; valor: string }
const CAMPOS_QUE_NO_SON_PROSA = ['client_id', 'forbidden_words', 'required_terminology', 'primary_colors', 'typography', 'tagline', 'tagline_opciones', 'frases_propias', 'eslogan_literal', 'competitor_mentions_policy', 'logo_usage_notes']
const esMeta = (k: string) => k.startsWith('_') || ['gated_fields_only', 'campos_gateados', 'campos_provisionales', 'campos_ausentes', 'lentes_ok', 'provisional'].includes(k)

function hojas(valor: unknown, ruta: string, out: Hoja[]): void {
  if (typeof valor === 'string') { out.push({ ruta, valor }); return }
  if (Array.isArray(valor)) { valor.forEach((x, i) => hojas(x, `${ruta}[${i}]`, out)); return }
  if (valor && typeof valor === 'object') for (const [k, x] of Object.entries(valor as Record<string, unknown>)) hojas(x, `${ruta}.${k}`, out)
}
const partesDeRuta = (ruta: string): Array<string | number> => [...ruta.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]))
function escribir<T>(obj: T, ruta: string, valor: unknown): T {
  const ps = partesDeRuta(ruta)
  let cur = obj as unknown as Record<string | number, unknown>
  for (let i = 0; i < ps.length - 1; i++) cur = cur[ps[i]] as Record<string | number, unknown>
  cur[ps[ps.length - 1]] = valor
  return obj
}
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const prosaDe = (manual: Record<string, unknown>, incluirListasDeTerminos = false): Hoja[] => {
  const out: Hoja[] = []
  for (const [k, v] of Object.entries(manual)) {
    if (esMeta(k)) continue
    if (!incluirListasDeTerminos && CAMPOS_QUE_NO_SON_PROSA.includes(k)) continue
    hojas(v, k, out)
  }
  return out
}

// ───────────────────────── 1 · nombres internos
/** identificador de campo/fuente del sistema: palabras en minúscula unidas por guion bajo (no un @usuario, ni una dirección, ni una parte de una URL) */
const IDENT = String.raw`(?<![@/.\w-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-])`
const RE_IDENT = new RegExp(IDENT, 'g')
/** «ICP goals», «ICP objections S1»: la etiqueta del documento interno de perfil de cliente */
const RE_ETIQUETA_ICP = /\bICP\s+(?:[a-z_]+\s+)?(?:S\d+\b)?/g
const tieneNombreInterno = (s: string): boolean => new RegExp(IDENT).test(s) || /\bICP\s+[a-z_]+\b/.test(s)

export function quitarNombresInternos(texto: string): { texto: string; cambio: boolean } {
  let t = texto
  // paréntesis y corchetes que nombran fuentes internas, enteros
  // si el bloque iba pegado a un punto, queda un espacio: así «local. (x), lo que…» se ve como «local. , lo que…» y el reparador de fragmentos la reconoce
  const quitaBloque = (re: RegExp) => { t = t.replace(re, (m: string, dentro: string, off: number, todo: string) => (tieneNombreInterno(dentro) ? (/[.!?…]/.test(todo[off - 1] ?? '') ? ' ' : '') : m)) }
  quitaBloque(/\s*\(([^()]*)\)/g)
  quitaBloque(/\s*\[([^\[\]]*)\]/g)
  // anotaciones del autor «[responde a …]» aunque no nombren un campo
  t = t.replace(/\s*\[\s*responde\s+a\b[^\[\]]*\]/gi, '')
  // lo que quede suelto en la prosa
  t = t.replace(RE_ETIQUETA_ICP, '').replace(RE_IDENT, '')
  return { texto: arreglarPuntuacion(t), cambio: t !== texto }
}
function arreglarPuntuacion(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(?<![.!?…])[ \t]+([,;:.!?])/g, '$1') // sin espacio antes de la puntuación, salvo tras un punto (ahí queda «local. , lo que…»: la señal de la oración rota)
    .replace(/\(\s*\)/g, '')
    .replace(/([,;:])\s*([,;:])/g, '$2')
    .replace(/[ \t]+$/gm, '')
}

// ───────────────────────── 2 · fragmentos
const ABREVIATURAS = /(?:\b(?:vs|etc|ej|sr|sra|dr|dra|aprox|núm|num|av|pág|págs|tel)|\b\d)\.$/i
/** parte una línea en oraciones SIN romper abreviaturas ni citas entre «» */
function oraciones(linea: string): string[] {
  const out: string[] = []; let ini = 0; let enCita = 0
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '«') enCita++
    else if (c === '»') enCita = Math.max(0, enCita - 1)
    if (enCita === 0 && /[.!?…]/.test(c) && (i + 1 >= linea.length || /\s/.test(linea[i + 1])) && !ABREVIATURAS.test(linea.slice(ini, i + 1))) {
      out.push(linea.slice(ini, i + 1)); ini = i + 1
      while (ini < linea.length && /\s/.test(linea[ini])) ini++
      i = ini - 1
    }
  }
  if (ini < linea.length) out.push(linea.slice(ini))
  return out
}
/** quita las oraciones rotas: la que empieza en minúscula o con puntuación (huérfana) y, si empieza con coma/punto y coma, también la anterior (la introducción sin sujeto) */
export function repararFragmentos(texto: string): { texto: string; quitadas: string[] } {
  const quitadas: string[] = []
  const lineas = texto.split('\n').map((linea) => {
    const os = oraciones(linea)
    if (os.length === 0) return linea
    const mantener = os.map(() => true)
    os.forEach((o, i) => {
      if (i === 0) return // el PRIMER renglón de un campo no es «la continuación de otra oración» (puede ser un valor corto: «producto»); si quedó cortado lo marca la puerta (campo mutilado → PENDIENTE)
      const t0 = o.trim()
      const huerfana = /^[,;:]/.test(t0) || (/^[a-záéíóúñ]/.test(t0) && /^[a-záéíóúñ]+(?=[\s,;:]|$)/.test(t0))
      if (!huerfana) return
      mantener[i] = false
      if (/^[,;:]/.test(o.trim()) && i > 0) mantener[i - 1] = false // «Según el análisis… local.» + «, lo que le otorga…»
    })
    // el primer renglón del campo que arranca en minúscula también es resto de algo cortado, pero solo si no es el único texto
    if (mantener.every(Boolean)) return linea
    os.forEach((o, i) => { if (!mantener[i]) quitadas.push(o.trim()) })
    return os.filter((_, i) => mantener[i]).join(' ')
  })
  return { texto: lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim(), quitadas }
}

// ───────────────────────── 3 · palabras prohibidas propias
const NEGACION_ANTES = /\b(nunca|jam[aá]s|evita\w*|evitar|prohib\w*|no\s+(?:uses?|usar|digas?|decir|emplees?|emplear|utilices?|utilizar)|sin)\b/i
/** palabras que el propio manual prohíbe (normalizadas, en minúscula, con su plural simple) */
export function palabrasProhibidasDelManual(manual: Record<string, unknown>): string[] {
  const l = manual.forbidden_words
  return (Array.isArray(l) ? l : []).filter((x): x is string => typeof x === 'string').map((x) => normalizar(x)).filter((x) => x.length >= 3)
}
/** ¿esta oración USA (no menciona) alguna palabra prohibida? devuelve la palabra */
export function usaPalabraProhibida(oracion: string, prohibidas: string[]): string | null {
  const t = oracion.replace(/«[^»]*»/g, ' ').replace(/"[^"]*"/g, ' ')
  const n = normalizar(t)
  for (const w of prohibidas) {
    const re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?(?=\\s|$)`)
    const m = re.exec(n)
    if (!m) continue
    const antes = n.slice(Math.max(0, m.index - 70), m.index)
    if (NEGACION_ANTES.test(antes)) continue // «nunca digas X»: la nombra para prohibirla
    return w
  }
  return null
}

// ───────────────────────── todo junto
export interface ResultadoDeLimpieza { manual: Record<string, unknown>; quitados: QuitadoPorLimpieza[] }

export function limpiarManual(manualEntrada: Record<string, unknown>): ResultadoDeLimpieza {
  const manual = clonar(manualEntrada)
  const quitados: QuitadoPorLimpieza[] = []
  const prohibidas = palabrasProhibidasDelManual(manual)
  const listas = new Map<string, number[]>()
  for (const h of prosaDe(manual, false)) {
    if (/^https?:\/\//.test(h.valor.trim())) continue
    if (h.ruta.startsWith('visual.') && !h.ruta.startsWith('visual.reglas')) continue // capas gráfica y de producto: salida de la visión, no prosa del autor
    let t = h.valor
    // 1 · nombres internos
    const q = quitarNombresInternos(t)
    if (q.cambio) { quitados.push({ ruta: h.ruta, texto: diferencia(t, q.texto), motivo: 'nombre_interno_citado' }); t = q.texto }
    // 2 · fragmentos
    const f = repararFragmentos(t)
    for (const x of f.quitadas) quitados.push({ ruta: h.ruta, texto: x, motivo: 'fragmento' })
    t = f.texto
    // 3 · palabras prohibidas propias (oración por oración; en listas, el elemento entero)
    if (prohibidas.length) {
      const enLista = /\[(\d+)\]$/.exec(h.ruta)
      const partes = t.split('\n').map((linea) => oraciones(linea).filter((o) => {
        const w = usaPalabraProhibida(o, prohibidas)
        if (w) quitados.push({ ruta: h.ruta, texto: o.trim(), motivo: 'palabra_prohibida_propia' })
        return !w
      }).join(' '))
      const nuevo = partes.join('\n').trim()
      if (nuevo !== t.trim()) t = nuevo
      void enLista
    }
    if (t !== h.valor) {
      escribir(manual, h.ruta, t)
      if (!t.trim()) { const m = /^(.*)\[(\d+)\]$/.exec(h.ruta); if (m) listas.set(m[1], [...(listas.get(m[1]) ?? []), Number(m[2])]) }
    }
  }
  // la lista que se queda con un elemento vacío lo pierde entero
  for (const [padre, idx] of listas) {
    const lista = leer(manual, padre)
    if (Array.isArray(lista)) escribir(manual, padre, lista.filter((_, i) => !idx.includes(i)))
  }
  return { manual, quitados }
}
function leer(obj: unknown, ruta: string): unknown {
  let cur: unknown = obj
  for (const p of partesDeRuta(ruta)) { if (cur == null || typeof cur !== 'object') return undefined; cur = (cur as Record<string | number, unknown>)[p] }
  return cur
}
/** lo que se quitó, para el registro interno */
function diferencia(antes: string, despues: string): string {
  const a = [...antes.matchAll(/\([^()]*\)|\[[^\[\]]*\]/g)].map((m) => m[0]).filter((x) => !despues.includes(x))
  return (a.length ? a.join(' ') : antes.length > 200 ? antes.slice(0, 200) : antes).trim()
}
