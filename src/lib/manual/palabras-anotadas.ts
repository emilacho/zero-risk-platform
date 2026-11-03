/**
 * PALABRAS DECLARADAS DEL MANUAL. PURO, agnóstico.
 * 02-nov, firma de Emilio: si el manual usa una palabra que él mismo declara por norma o por el dueño, el texto SE QUEDA y se anota (salvo que solo la MENCIONE: entre comillas o tras «nunca/evita/sin…»).
 * 03-nov, decisión de Emilio («quita esas reglas, para eso están mis observaciones»): aquí vivía la limpieza por código de nombres internos y oraciones rotas. Ya no se quita nada del texto: que salga limpio es trabajo de los empleados del manual y del panel.
 */
import { palabrasDuras } from './palabras-con-intencion'
import { normalizar } from './texto'

export interface PalabraAnotada { ruta: string; palabra: string; texto: string }

type Hoja = { ruta: string; valor: string }
const CAMPOS_QUE_NO_SON_PROSA = ['client_id', 'forbidden_words', 'palabras_con_intencion', 'required_terminology', 'primary_colors', 'typography', 'tagline', 'tagline_opciones', 'frases_propias', 'eslogan_literal', 'competitor_mentions_policy', 'logo_usage_notes']
const esMeta = (k: string) => k.startsWith('_') || ['gated_fields_only', 'campos_gateados', 'campos_provisionales', 'campos_ausentes', 'lentes_ok', 'provisional'].includes(k)

function hojas(valor: unknown, ruta: string, out: Hoja[]): void {
  if (typeof valor === 'string') { out.push({ ruta, valor }); return }
  if (Array.isArray(valor)) { valor.forEach((x, i) => hojas(x, `${ruta}[${i}]`, out)); return }
  if (valor && typeof valor === 'object') for (const [k, x] of Object.entries(valor as Record<string, unknown>)) hojas(x, `${ruta}.${k}`, out)
}
const prosaDe = (manual: Record<string, unknown>, incluirListasDeTerminos: boolean): Hoja[] => {
  const out: Hoja[] = []
  for (const [k, v] of Object.entries(manual)) {
    if (esMeta(k)) continue
    if (!incluirListasDeTerminos && CAMPOS_QUE_NO_SON_PROSA.includes(k)) continue
    hojas(v, k, out)
  }
  return out
}

const ABREVIATURAS = /(?:\b(?:vs|etc|ej|sr|sra|dr|dra|aprox|núm|num|av|pág|págs|tel)|\b\d)\.$/i
/** parte una línea en oraciones SIN romper abreviaturas ni citas entre «» */
function oraciones(linea: string): string[] {
  const out: string[] = []; let ini = 0; let enCita = 0
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '«') enCita++
    else if (c === '»') enCita = Math.max(0, enCita - 1)
    if (enCita === 0 && /[.!?…]/.test(c) && /\s/.test(linea[i + 1] ?? ' ') && !ABREVIATURAS.test(linea.slice(ini, i + 1))) {
      out.push(linea.slice(ini, i + 1)); ini = i + 1
      while (ini < linea.length && /\s/.test(linea[ini])) ini++
      i = ini - 1
    }
  }
  if (linea.slice(ini).trim()) out.push(linea.slice(ini))
  return out
}

const NEGACION_ANTES = /\b(nunca|jam[aá]s|evita\w*|evitar|prohib\w*|no\s+(?:uses?|usar|digas?|decir|emplees?|emplear|utilices?|utilizar)|sin)\b/i
/** palabras que el propio manual prohíbe (normalizadas, en minúscula, con su plural simple) */
export function palabrasProhibidasDelManual(manual: Record<string, unknown>): string[] {
  // solo lo declarado (norma o dueño) se anota; el resto de la lista es contexto de marca
  return palabrasDuras(manual).map((x) => normalizar(x)).filter((x) => x.length >= 3)
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

/** las oraciones del manual que usan una palabra declarada. El texto no se toca. */
export function palabrasDeclaradasEnUso(manual: Record<string, unknown>): PalabraAnotada[] {
  const prohibidas = palabrasProhibidasDelManual(manual)
  const anotadas: PalabraAnotada[] = []
  for (const h of prosaDe(manual, false)) {
    if (/^https?:\/\//.test(h.valor.trim())) continue
    if (h.ruta.startsWith('visual.') && !h.ruta.startsWith('visual.reglas')) continue // capas gráfica y de producto: salida de la visión, no prosa del autor
    for (const linea of h.valor.split('\n')) for (const o of oraciones(linea)) {
      const w = usaPalabraProhibida(o, prohibidas)
      if (w) anotadas.push({ ruta: h.ruta, palabra: w, texto: o.trim() })
    }
  }
  return anotadas
}
