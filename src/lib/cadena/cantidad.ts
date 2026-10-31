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

/** Un V08 que bloquea con real < meta pasa a `aviso`; todo lo demás queda igual. */
export function bajarFaltantesDeCantidad(hs: Hallazgo[]): Hallazgo[] {
  return hs.map((x) => {
    if (x.chequeo !== 'V08' || x.severidad !== 'bloquea') return x
    const c = leerV08(x.ficha.que)
    if (!c || c.real >= c.meta) return x
    return {
      ...x, severidad: 'aviso',
      ficha: { ...x.ficha, gravedad: 'aviso', que: `por confirmar · ${x.ficha.que}`, propuesta: 'la campaña sigue con lo que tiene; el faltante viaja al brief' },
    }
  })
}

/** Solo tras la corrección: en la primera pasada el faltante sigue pidiendo la única corrección. */
export function sinFaltantesSiCorrige(corrige: boolean, hs: Hallazgo[]): Hallazgo[] {
  return corrige ? bajarFaltantesDeCantidad(hs) : hs
}
