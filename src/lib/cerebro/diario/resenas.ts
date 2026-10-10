/**
 * RESEÑAS Y COMENTARIOS · SOLO SEÑALES AGREGADAS (C3 de CC#3, D-2 firmada). PURO.
 * Una reseña o un comentario es dato de un TERCERO: NO se cita ni se reescribe en una pieza. Esta función devuelve conteos y términos repetidos; el TEXTO de una reseña nunca sale de aquí
 * (ni el autor ni el nombre). Un término solo cuenta como «queja repetida» si aparece en al menos `minimoQueja` reseñas distintas de pocas estrellas.
 */
import { contenidoDe } from '../../manual/texto'
import { TOPE_DE_RESENAS_POR_CORRIDA } from './topes'

export interface ResenaCruda { stars?: unknown; rating?: unknown; text?: unknown; [otro: string]: unknown }
export interface SenalesDeResenas {
  total: number
  por_estrellas: Record<'1' | '2' | '3' | '4' | '5', number>
  proporcion_5: number | null
  proporcion_baja: number | null
  quejas_repetidas: Array<{ termino: string; resenas: number }>
  descartadas: number
}
export const ESTRELLAS_DE_QUEJA = 2

const estrellas = (r: ResenaCruda): number | null => {
  const v = typeof r.stars === 'number' ? r.stars : typeof r.rating === 'number' ? r.rating : typeof r.stars === 'string' ? Number(r.stars) : NaN
  return Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v) : null
}

export function senalesDeResenas(resenas: ResenaCruda[], o: { minimoQueja?: number; maxResenas?: number; maxQuejas?: number } = {}): SenalesDeResenas {
  const minimo = o.minimoQueja ?? 3
  const lote = resenas.slice(0, o.maxResenas ?? TOPE_DE_RESENAS_POR_CORRIDA)
  const por: SenalesDeResenas['por_estrellas'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  let descartadas = resenas.length - lote.length
  const bajas: string[][] = []
  for (const r of lote) {
    const e = estrellas(r)
    if (e === null) { descartadas++; continue }
    por[String(e) as keyof typeof por]++
    if (e <= ESTRELLAS_DE_QUEJA && typeof r.text === 'string' && r.text.trim()) bajas.push([...new Set(contenidoDe(r.text))])
  }
  const total = Object.values(por).reduce((a, b) => a + b, 0)
  const cuenta = new Map<string, number>()
  for (const ts of bajas) for (const t of ts) cuenta.set(t, (cuenta.get(t) ?? 0) + 1)
  const quejas = [...cuenta.entries()].filter(([, n]) => n >= minimo).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, o.maxQuejas ?? 5).map(([termino, resenas]) => ({ termino, resenas }))
  const prop = (n: number) => (total ? Math.round((n / total) * 1000) / 1000 : null)
  return { total, por_estrellas: por, proporcion_5: prop(por['5']), proporcion_baja: prop(por['1'] + por['2']), quejas_repetidas: quejas, descartadas }
}

/** frase agregada para una oportunidad: sin nombre, sin texto citable */
export function frasePorSenales(s: SenalesDeResenas): string {
  if (!s.total) return 'sin reseñas leídas'
  const base = `${s.por_estrellas['5']} de ${s.total} reseñas de 5 estrellas`
  return s.quejas_repetidas.length ? `${base}; queja repetida: ${s.quejas_repetidas.map((q) => q.termino).join(', ')}` : base
}

// ───────────────────────── comentarios de las publicaciones propias (sin estrellas): solo temas repetidos
export interface SenalesDeComentarios { total: number; temas_repetidos: Array<{ termino: string; comentarios: number }>; descartados: number }
export function senalesDeComentarios(textos: unknown[], o: { minimoTema?: number; maxComentarios?: number; maxTemas?: number } = {}): SenalesDeComentarios {
  const minimo = o.minimoTema ?? 3
  const lote = textos.slice(0, o.maxComentarios ?? 50)
  const cuenta = new Map<string, number>()
  let total = 0
  for (const t of lote) {
    if (typeof t !== 'string' || !t.trim()) continue
    total++
    for (const w of new Set(contenidoDe(t))) cuenta.set(w, (cuenta.get(w) ?? 0) + 1)
  }
  const temas = [...cuenta.entries()].filter(([, n]) => n >= minimo).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, o.maxTemas ?? 5).map(([termino, comentarios]) => ({ termino, comentarios }))
  return { total, temas_repetidos: temas, descartados: textos.length - total }
}
export function frasePorComentarios(s: SenalesDeComentarios): string {
  if (!s.total) return 'sin comentarios leídos'
  return s.temas_repetidos.length ? `${s.total} comentarios leídos; tema repetido: ${s.temas_repetidos.map((t) => t.termino).join(', ')}` : `${s.total} comentarios leídos`
}
