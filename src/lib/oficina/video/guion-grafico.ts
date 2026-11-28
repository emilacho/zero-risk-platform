/**
 * EL GUION GRÁFICO DE LA PIEZA TERMINADA · GO Lenovo 28-nov 09:54Z (Emilio aprobó el boceto `raw/evidencia/2026-11-27-boceto-ver-piezas-como-propuestas/`).
 * La pieza de video se mira como el boceto de su propuesta: escena por escena (los planos del guion), con fotos sacadas del VIDEO TERMINADO.
 * Cuántas fotos por escena depende de lo que dura la pieza, para cualquier cliente: segundos ÷ 20 redondeado hacia arriba, de 1 a 6
 * (15 s → 1 · 30 s → 2 · 1 min → 3 · 90 s → 5). Solo en la pieza terminada (US$ 0: las saca ffmpeg del mp4); NUNCA en el borrador de la propuesta.
 * Es aparte de los cuadros que mira el agente (`mirada.ts`, 3 por plano): esos no cambian.
 * Puro: sin red, sin base, sin ffmpeg (eso vive en `cuadros.ts`).
 */
import type { Plano } from './guion'

/** una foto por cada 20 s de pieza (Emilio 27-nov: «reel de 1 minuto, al menos 3 fotos por escena… 15 s → 1, 30 s → 2») */
export const SEGUNDOS_POR_FOTO = 20
/** el tope por escena: una pieza larga no se vuelve una lista sin fin */
export const FOTOS_POR_ESCENA_MAX = 6
/** el tope de fotos de toda la pieza (con muchas escenas se reparten: nunca menos de 1 por escena) */
export const MAX_FOTOS_DEL_GUION_GRAFICO = 72

/** cuántas fotos lleva cada escena de una pieza de `segundos` · sin duración legible, 1 */
export function fotosPorEscena(segundos: number | null | undefined): number {
  const s = Number(segundos)
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.max(1, Math.min(FOTOS_POR_ESCENA_MAX, Math.ceil(s / SEGUNDOS_POR_FOTO)))
}

export interface InstanteDelGuionGrafico { plano: number; segundo: number; /** 1… dentro de la escena */ k: number }

const redondo = (x: number) => Math.round(x * 100) / 100

/** el nombre del archivo de cada foto (único por escena y lugar) */
export const nombreDeLaFotoDelGuion = (i: { plano: number; k: number }) => `guion-plano-${i.plano}-${i.k}.jpg`

/**
 * los instantes de cada escena: una sola foto va al medio; con varias, la primera un poco después del arranque, la última un poco antes del final
 * (donde ya no hay transición) y las demás parejas entre ellas. Dentro de lo que dura el video de verdad (si se midió); dos en el mismo segundo quedan en una.
 * La duración que manda la cuenta es la del video medido; sin medida, el final del guion.
 */
export function instantesDelGuionGrafico(planos: Plano[], duracionReal?: number | null): InstanteDelGuionGrafico[] {
  const validos = planos.filter((p) => Number.isFinite(Number(p.desde)) && Number.isFinite(Number(p.hasta)) && Number(p.hasta) > Number(p.desde))
  if (!validos.length) return []
  const tope = duracionReal && duracionReal > 0 ? duracionReal : null
  const total = tope ?? Math.max(...validos.map((p) => Number(p.hasta)))
  const n = Math.max(1, Math.min(fotosPorEscena(total), Math.floor(MAX_FOTOS_DEL_GUION_GRAFICO / validos.length)))
  const dentro = (s: number) => (tope !== null ? Math.min(s, Math.max(0, tope - 0.1)) : s)
  const out: InstanteDelGuionGrafico[] = []
  for (const p of validos) {
    const desde = Number(p.desde), hasta = Number(p.hasta), largo = hasta - desde
    const cuantos = largo < 1 ? 1 : n
    const margen = Math.min(0.3, largo * 0.15)
    const crudos = cuantos === 1 ? [(desde + hasta) / 2] : Array.from({ length: cuantos }, (_, i) => desde + margen + (i * (largo - 2 * margen)) / (cuantos - 1))
    const vistos = new Set<number>()
    let k = 0
    for (const s of crudos) {
      const seg = redondo(dentro(s))
      if (vistos.has(seg)) continue
      vistos.add(seg)
      out.push({ plano: p.n, segundo: seg, k: ++k })
    }
  }
  return out
}
