/**
 * PASO 7 · herencia por FICHA COMPLETA (sin modelo). Para cada ficha viva de la misma fuente se cuentan cuántas de sus firmas aparecen en el material nuevo:
 *  · todas → se HEREDA (solo se renueva `reconfirmado_en`);
 *  · ninguna → candidata a RETIRADA (solo si el ingreso trae TODA la fuente);
 *  · algunas, no todas → AFECTADA: se vuelve a fichar completa.
 * Al modelo va todo segmento limpio que NO pertenece a una ficha heredada (los nuevos, los cambiados y los que no cambiaron pero eran de una afectada).
 * No hay cercanía de orden ni palabras ni dependencia de la numeración: solo firmas.
 */
import type { Segmento } from './segmentos'
import type { FichaViva } from './tipos'

export interface PlanDeHerencia {
  heredadas: FichaViva[]
  sinFirmas: FichaViva[]
  afectadas: FichaViva[]
  paraModelo: Segmento[]
}

export function planearHerencia(args: { limpios: Segmento[]; vivas: FichaViva[]; esCompleta: boolean }): PlanDeHerencia {
  const nuevas = new Set(args.limpios.map((s) => s.firma))
  const heredadas: FichaViva[] = []
  const sinFirmas: FichaViva[] = []
  const afectadas: FichaViva[] = []
  const deHeredadas = new Set<string>()
  for (const f of args.vivas) {
    const propias = [...new Set(f.firmas)]
    if (propias.length === 0) continue
    const presentes = propias.filter((x) => nuevas.has(x)).length
    if (presentes === propias.length) { heredadas.push(f); for (const x of propias) deHeredadas.add(x) }
    else if (presentes === 0) { if (args.esCompleta) sinFirmas.push(f) }
    else afectadas.push(f)
  }
  return { heredadas, sinFirmas, afectadas, paraModelo: args.limpios.filter((s) => !deHeredadas.has(s.firma)) }
}
