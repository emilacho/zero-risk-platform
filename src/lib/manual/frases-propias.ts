/**
 * R1 · LAS FRASES PROPIAS DEL CLIENTE SE EXTRAEN POR CÓDIGO Y SE TRANSCRIBEN LITERAL. PURO.
 *
 * Fuentes propias = lo que el cliente publicó de sí mismo (sitio, su red, su perfil de mapas, título/meta). Candidatas: la biografía de la red propia, el título y la descripción del
 * sitio, y todo trozo de ≥ 4 palabras que aparezca TAL CUAL en ≥ 2 CANALES propios distintos, fundido en su frase maximal. El eslogan es la candidata que además vive en la
 * biografía o en el título/descripción. Si no hay candidata: hueco declarado, nunca inventado ni parafraseado.
 */
import { esPrimaria, type CanalDeFuente, type Fuente, type RolDeFuente } from './procedencia'

/** frases que se repiten en cualquier sitio y no son la voz del cliente (dato por idioma, se amplía sin tocar la lógica) */
export const FRASES_VACIAS_ES = [
  'todos los derechos reservados', 'politica de privacidad', 'terminos y condiciones', 'aviso legal', 'politica de cookies', 'sitio creado con', 'desarrollado por', 'powered by',
  'siguenos en', 'siguenos en redes', 'suscribete a nuestro', 'contactanos', 'haz clic aqui', 'ver mas', 'leer mas', 'inicio nosotros contacto',
]

export interface UbicacionDeFrase { fuente_id: string; canal: CanalDeFuente; rol: RolDeFuente; rotulo: string }
export interface FrasePropia { literal: string; tipo: 'biografia' | 'titulo' | 'repetida'; fuentes: UbicacionDeFrase[] }
export interface FrasesPropias { eslogan: FrasePropia | null; estado_eslogan: 'hallado' | 'sin_dato'; repetidas: FrasePropia[]; fuentes_propias_leidas: number }

interface Normalizado { norm: string; mapa: number[] }
/** normaliza y recuerda de qué posición del texto ORIGINAL viene cada carácter normalizado (para devolver la frase literal con sus tildes y signos) */
export function normalizarConIndices(original: string): Normalizado {
  let norm = ''
  const mapa: number[] = []
  let sep = true
  for (let i = 0; i < original.length; i++) {
    const base = original[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const c of base) {
      if (/[a-z0-9ñ$%@#]/.test(c)) { norm += c; mapa.push(i); sep = false } else if (!sep) { norm += ' '; mapa.push(i); sep = true }
    }
  }
  if (norm.endsWith(' ')) { norm = norm.slice(0, -1); mapa.pop() }
  return { norm, mapa }
}

/** el trozo ORIGINAL que corresponde a un trozo normalizado; extiende al final los signos de cierre (… ! ? » ”) y junta saltos de línea en un espacio */
export function literalDe(original: string, n: Normalizado, desde: number, hasta: number): string {
  const ini = n.mapa[desde]
  let fin = n.mapa[hasta - 1] + 1
  while (fin < original.length && /[.…!?»”"')]/.test(original[fin])) fin++
  return original.slice(ini, fin).replace(/\s+/g, ' ').trim()
}

const N = 4
const palabrasDe = (norm: string) => (norm ? norm.split(' ') : [])

export function frasesPropias(fuentes: Fuente[], opciones: { maxRepetidas?: number; frasesVacias?: string[] } = {}): FrasesPropias {
  const propias = fuentes.filter((f) => f.tipo === 'primaria_propia' && f.canal !== 'alta' && f.texto.trim())
  const vacias = (opciones.frasesVacias ?? FRASES_VACIAS_ES).map((x) => x.trim())
  const info = propias.map((f) => ({ f, n: normalizarConIndices(f.texto) }))
  info.forEach((x) => { (x as { w?: string[] }).w = palabrasDe(x.n.norm) })
  // gramas de N palabras → en qué canales aparecen
  const canalesDe = new Map<string, Set<CanalDeFuente>>()
  for (const x of info) {
    const w = (x as unknown as { w: string[] }).w
    for (let i = 0; i + N <= w.length; i++) {
      const g = w.slice(i, i + N).join(' ')
      ;(canalesDe.get(g) ?? canalesDe.set(g, new Set()).get(g)!).add(x.f.canal)
    }
  }
  const compartido = (g: string) => (canalesDe.get(g)?.size ?? 0) >= 2
  // frases maximales: tramos de palabras cuyos gramas se comparten, sobre cada fuente
  const maximales = new Map<string, { norm: string; apariciones: Array<{ f: Fuente; desde: number; hasta: number; n: Normalizado }> }>()
  for (const x of info) {
    const w = (x as unknown as { w: string[] }).w
    let i = 0
    while (i + N <= w.length) {
      if (!compartido(w.slice(i, i + N).join(' '))) { i++; continue }
      let j = i + N
      while (j < w.length && compartido(w.slice(j - N + 1, j + 1).join(' '))) j++
      const norm = w.slice(i, j).join(' ')
      // posición en el texto normalizado de la fuente
      const antes = w.slice(0, i).join(' ')
      const desde = antes ? antes.length + 1 : 0
      const e = maximales.get(norm) ?? maximales.set(norm, { norm, apariciones: [] }).get(norm)!
      e.apariciones.push({ f: x.f, desde, hasta: desde + norm.length, n: x.n })
      i = j
    }
  }
  const esVacia = (norm: string) => vacias.some((v) => norm.includes(v))
  const todas: Array<FrasePropia & { norm: string; privilegiada: boolean; prioridad: number; largo: number }> = []
  for (const m of maximales.values()) {
    if (esVacia(m.norm)) continue
    const canales = new Set(m.apariciones.map((a) => a.f.canal))
    if (canales.size < 2) continue
    const enBio = m.apariciones.find((a) => a.f.rol === 'biografia')
    const enTitulo = m.apariciones.find((a) => a.f.rol === 'titulo' || a.f.rol === 'meta')
    const base = enBio ?? enTitulo ?? m.apariciones[0]
    const literal = literalDe(base.f.texto, base.n, base.desde, base.hasta)
    const vistas = new Map<string, UbicacionDeFrase>()
    for (const a of m.apariciones) vistas.set(a.f.id, { fuente_id: a.f.id, canal: a.f.canal, rol: a.f.rol, rotulo: a.f.rotulo })
    todas.push({ literal, tipo: enBio ? 'biografia' : enTitulo ? 'titulo' : 'repetida', fuentes: [...vistas.values()], norm: m.norm, privilegiada: !!(enBio || enTitulo), prioridad: enBio ? 0 : enTitulo ? 1 : 2, largo: m.norm.length })
  }
  // el eslogan: la candidata privilegiada más larga; empate → la que está en más canales
  const priv = todas.filter((t) => t.privilegiada).sort((a, b) => b.largo - a.largo || b.fuentes.length - a.fuentes.length || a.prioridad - b.prioridad)
  const elegido = priv[0] ?? null
  const limpia = (t: (typeof todas)[number]): FrasePropia => ({ literal: t.literal, tipo: t.tipo, fuentes: t.fuentes })
  const repetidas = todas
    .filter((t) => t !== elegido && !(elegido && elegido.norm.includes(t.norm)))
    .sort((a, b) => b.largo - a.largo)
    .slice(0, opciones.maxRepetidas ?? 10)
    .map(limpia)
  return { eslogan: elegido ? limpia(elegido) : null, estado_eslogan: elegido ? 'hallado' : 'sin_dato', repetidas, fuentes_propias_leidas: propias.length }
}

/** el código escribe el eslogan en `tagline` SOLO si está vacío (nunca pisa lo que ya hay) y sin pasar por el modelo */
export function aplicarEslogan<T extends Record<string, unknown>>(manual: T, fp: FrasesPropias): { manual: T; aplicado: boolean; motivo?: 'sin_eslogan' | 'tagline_ocupado' } {
  if (!fp.eslogan) return { manual, aplicado: false, motivo: 'sin_eslogan' }
  const actual = manual.tagline
  if (typeof actual === 'string' && actual.trim()) return { manual, aplicado: false, motivo: 'tagline_ocupado' }
  return { manual: { ...manual, tagline: fp.eslogan.literal }, aplicado: true }
}

export { esPrimaria }
