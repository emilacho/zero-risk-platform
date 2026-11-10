/**
 * MOTOR DE COLATERALES · tramo 2a · la RED DE PALABRAS (CC1 · certifica CC7 · CRITERIOS v2 §2 + adendas 1-4).
 *
 * De la frase ENTERA del «antes» salen los pedazos de aguas abajo que el agente DEBE revisar uno por uno.
 * Cada pedazo lleva su documento, su SECCIÓN (título markdown o ruta de la llave JSON) y su OCURRENCIA:
 * un mismo texto puede repetirse en un documento («el encebollado que conoces de la costa» está 2 veces en la gran idea),
 * y el retoque se aplica DENTRO de su pedazo, nunca reemplazando en todo el documento (hallazgo del ensayo 3).
 *
 * Medido en el ensayo 3 (10-nov · corrida real · PASA 4/4): el pedido bajó de ≈ 66.790 fichas (documentos enteros) a 4.707 (solo pedazos).
 * Función pura, sin red ni base.
 */
import { afectados, type Documento } from '../cadena/dependencias-de-documentos'

export interface Pedazo {
  /** id estable dentro de una edición: C1, C2… (en el orden de la cadena y del documento) */
  id: string
  documento: Documento
  /** título markdown vigente o ruta de la llave JSON (`fases[1].objetivo`) */
  seccion: string
  texto: string
  /** markdown: n-ésima vez (0, 1…) que este MISMO texto aparece en el documento · JSON: siempre 0 (la ruta ya es única) */
  ocurrencia: number
  /** JSON: la ruta de la llave (para escribir por ruta, no por texto) · markdown: null */
  ruta: string | null
}

export interface Edicion {
  documento: Documento
  seccion: string
  antes: string
  despues: string
}

export const normalizar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const VACIAS = new Set('que la el los las de del a al y o en un una no sea es por para con se su sus lo como mas muy desde este esta ese esa son hay'.split(' '))
/** palabras de ≥ 4 letras y números con decimales («3,50»), sin vacías, sin repetir */
export const claves = (t: string): string[] => [...new Set(normalizar(t).match(/\d+[.,:]\d+|[a-zñ]{4,}/g) ?? [])].filter((w) => !VACIAS.has(w))

/** una palabra clave es «rara» si aparece en ≤ 40 pedazos; si ninguna lo es, las 2 menos frecuentes */
export const TOPE_DE_FRECUENCIA = 40

function json(texto: string): unknown {
  const t = texto.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

/** los pedazos de UN documento, con su sección y su ocurrencia (sin id todavía) */
export function pedazosDe(documento: Documento, texto: string): Omit<Pedazo, 'id'>[] {
  const out: Omit<Pedazo, 'id'>[] = []
  const j = json(texto)
  if (j !== null) {
    const recorrer = (v: unknown, ruta: string): void => {
      if (typeof v === 'string') {
        if (v.trim().length > 8) out.push({ documento, seccion: ruta, texto: v, ocurrencia: 0, ruta })
      } else if (Array.isArray(v)) v.forEach((x, i) => recorrer(x, `${ruta}[${i}]`))
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, ruta ? `${ruta}.${k}` : k)
    }
    recorrer(j, '')
    return out
  }
  let seccion = '(inicio)'
  const vistas = new Map<string, number>()
  for (const linea of texto.split(/\n+/)) {
    const s = linea.trim()
    if (/^#{1,6}\s/.test(s)) {
      seccion = s.replace(/^#+\s*/, '')
      continue
    }
    for (const p of s.length > 400 ? s.split(' · ') : [s]) {
      const t = p.trim()
      if (t.length <= 8) continue
      const n = vistas.get(t) ?? 0
      vistas.set(t, n + 1)
      out.push({ documento, seccion, texto: t, ocurrencia: n, ruta: null })
    }
  }
  return out
}

/**
 * Los candidatos de una edición: los pedazos de TODOS los documentos de aguas abajo (lista única del tramo 1) que comparten
 * una palabra rara del «antes». Nunca aguas arriba (regla «nunca» n.º 7). Un documento sin texto (abierto, vacío) no aporta pedazos.
 */
export function red(e: Edicion, textos: Partial<Record<Documento, string>>): { claves: string[]; candidatos: Pedazo[] } {
  const todos = afectados(e.documento).flatMap((d) => (textos[d] ? pedazosDe(d, textos[d]!) : []))
  const ks = claves(e.antes)
  const frec = new Map(ks.map((k) => [k, todos.filter((p) => normalizar(p.texto).includes(k)).length]))
  let raras = ks.filter((k) => (frec.get(k) ?? 0) > 0 && (frec.get(k) ?? 0) <= TOPE_DE_FRECUENCIA)
  if (!raras.length) raras = ks.filter((k) => (frec.get(k) ?? 0) > 0).sort((a, b) => frec.get(a)! - frec.get(b)!).slice(0, 2)
  const candidatos = todos.filter((p) => raras.some((k) => normalizar(p.texto).includes(k))).map((p, i) => ({ id: `C${i + 1}`, ...p }))
  return { claves: raras, candidatos }
}
