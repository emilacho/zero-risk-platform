/**
 * Cantidad por semana (V08): un faltante NO detiene la campaña (31-oct, regla de Emilio: «que falte algo no tiene que parar el proceso»).
 * Tras la única corrección, si lo que queda por debajo de lo que pide la estrategia es solo una CANTIDAD (real < meta), pasa a `aviso`
 * y viaja con la tanda; el exceso (real > meta) y cualquier otro bloqueo siguen su camino (`necesita_humano`).
 */
import type { Hallazgo } from './tipos'

export function mensajeV08(semana: number, red: string, clase: string, real: number, meta: number): string {
  return `semana ${semana}, ${red}, ${clase}: ${real} piezas y la estrategia pide ${meta}`
}

const FORMA_V08 = /^semana (\d+), (.+), (feed|historias|anuncios): (\d+) piezas y la estrategia pide (\d+)$/

export function leerV08(que: string): { semana: number; red: string; clase: string; real: number; meta: number } | null {
  const m = FORMA_V08.exec(que)
  return m ? { semana: Number(m[1]), red: m[2], clase: m[3], real: Number(m[4]), meta: Number(m[5]) } : null
}

/** Un V08 que bloquea pasa a `aviso`: el faltante (31-oct) y, desde el 01-nov por firma de Emilio, también el exceso. Cuántas piezas por semana es una guía. Lo que no se pueda leer queda igual. */
export function bajarFaltantesDeCantidad(hs: Hallazgo[]): Hallazgo[] {
  return hs.map((x) => {
    if (x.chequeo !== 'V08' || x.severidad !== 'bloquea') return x
    const c = leerV08(x.ficha.que)
    if (!c) return x
    return {
      ...x, severidad: 'aviso',
      ficha: { ...x.ficha, gravedad: 'aviso', que: `por confirmar · ${x.ficha.que}`, propuesta: 'la campaña sigue con lo que tiene; la diferencia viaja al brief' },
    }
  })
}

/** Solo tras la corrección: en la primera pasada el faltante sigue pidiendo la única corrección. */
export function sinFaltantesSiCorrige(corrige: boolean, hs: Hallazgo[]): Hallazgo[] {
  return corrige ? bajarFaltantesDeCantidad(hs) : hs
}
