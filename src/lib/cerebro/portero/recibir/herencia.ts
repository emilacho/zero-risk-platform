/**
 * PASO 7 · herencia por FICHA COMPLETA (sin modelo), por POSICIÓN y no por texto (hallazgo H1 de CC#3).
 * Cada ficha viva busca SU secuencia ordenada de firmas en el material nuevo como tramo SEGUIDO; las posiciones que encuentra quedan CONSUMIDAS y ninguna otra ficha las puede usar. Así un precio o una
 * garantía con el mismo texto que los de otro producto no se esconde detrás de una ficha ajena: lo que no se consumió va al modelo.
 *  · se encuentra entera → se HEREDA (solo se renueva `reconfirmado_en`);
 *  · no se encuentra y NINGUNA de sus firmas está en lo que sobra → candidata a RETIRADA (solo si el ingreso trae TODA la fuente);
 *  · no se encuentra pero alguna de sus firmas está en lo que sobra → AFECTADA: se vuelve a fichar completa.
 * Al modelo va todo segmento limpio cuya posición NO fue consumida. Las fichas largas se procesan primero (una de una sola línea no le roba la posición a una larga).
 * Las fichas SUELTAS (una sola línea) se resuelven AL FINAL, tramo libre por tramo libre (H1b): solo heredan si el tramo ENTERO queda explicado por fichas sueltas (título + subtítulo, una
 * lista de patrocinadores); si en el tramo hay una línea que nadie reclama (un producto cambiado que va al modelo), ninguna suelta le quita líneas. Un re-ingreso idéntico hereda todo.
 */
import type { Segmento } from './segmentos'
import type { FichaViva } from './tipos'

export interface PlanDeHerencia {
  heredadas: FichaViva[]
  sinFirmas: FichaViva[]
  afectadas: FichaViva[]
  paraModelo: Segmento[]
}

/** posiciones donde está la secuencia COMO TRAMO SEGUIDO de posiciones libres (una búsqueda «en el mismo orden con otras líneas en medio» le robaba posiciones a otro producto) */
function buscar(firmas: string[], material: string[], consumido: boolean[]): number[] | null {
  const k = firmas.length
  for (let i = 0; i + k <= material.length; i++) {
    let sirve = true
    for (let j = 0; j < k && sirve; j++) sirve = !consumido[i + j] && material[i + j] === firmas[j]
    if (sirve) return Array.from({ length: k }, (_x, j) => i + j)
  }
  return null
}

export function planearHerencia(args: { limpios: Segmento[]; vivas: FichaViva[]; esCompleta: boolean }): PlanDeHerencia {
  const material = args.limpios.map((s) => s.firma)
  const consumido = material.map(() => false)
  const conFirmas = args.vivas.filter((f) => f.firmas.length > 0)
  const heredadasIds = new Set<string>()
  // las largas primero (orden estable entre las del mismo largo)
  const ordenadas = conFirmas.map((x, i) => ({ x, i })).sort((a, b) => b.x.firmas.length - a.x.firmas.length || a.i - b.i).map((e) => e.x)
  for (const f of ordenadas.filter((x) => x.firmas.length > 1)) {
    const posiciones = buscar(f.firmas, material, consumido)
    if (!posiciones) continue
    for (const p of posiciones) consumido[p] = true
    heredadasIds.add(f.id)
  }
  // las sueltas, tramo libre por tramo libre: o el tramo entero queda explicado por ellas, o ninguna toma nada de él
  const sueltas = ordenadas.filter((x) => x.firmas.length === 1)
  for (let i = 0; i < material.length; ) {
    if (consumido[i]) { i++; continue }
    let j = i
    while (j < material.length && !consumido[j]) j++
    const usadas = new Set<string>()
    const asignadas: Array<[number, FichaViva]> = []
    for (let p = i; p < j; p++) {
      const f = sueltas.find((x) => !heredadasIds.has(x.id) && !usadas.has(x.id) && x.firmas[0] === material[p])
      if (f) { usadas.add(f.id); asignadas.push([p, f]) }
    }
    if (asignadas.length === j - i) for (const [p, f] of asignadas) { consumido[p] = true; heredadasIds.add(f.id) }
    i = j
  }
  const sobra = new Set(material.filter((_f, i) => !consumido[i]))
  const heredadas: FichaViva[] = []
  const sinFirmas: FichaViva[] = []
  const afectadas: FichaViva[] = []
  for (const f of conFirmas) {
    if (heredadasIds.has(f.id)) heredadas.push(f)
    else if (f.firmas.some((x) => sobra.has(x))) afectadas.push(f)
    else if (args.esCompleta) sinFirmas.push(f)
  }
  return { heredadas, sinFirmas, afectadas, paraModelo: args.limpios.filter((_s, i) => !consumido[i]) }
}
