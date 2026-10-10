/** ayuda de pruebas: recorre una plantilla con el motor y respuestas simuladas por clave de paso (sin modelo, sin red) */
import { estadoInicial, registrarPaso, siguientePaso } from '../index'
import type { Estado, Plantilla } from '../index'
import type { ResultadoDePaso } from '../motor'

export type Respuestas = Record<string, ResultadoDePaso | ((veces: number, e: Estado) => ResultadoDePaso)>

export function simular(p: Plantilla, resp: Respuestas, max = 100): { claves: string[]; estado: Estado; final: ReturnType<typeof siguientePaso> } {
  let e = estadoInicial()
  const claves: string[] = []
  const veces: Record<string, number> = {}
  for (let i = 0; i < max; i++) {
    const s = siguientePaso(e, p)
    if (s.accion !== 'ejecutar') return { claves, estado: e, final: s }
    claves.push(s.paso.clave)
    veces[s.paso.clave] = (veces[s.paso.clave] ?? 0) + 1
    const r = resp[s.paso.clave]
    const base: ResultadoDePaso = typeof r === 'function' ? r(veces[s.paso.clave], e) : r ?? { costo_usd: 0, artefacto: {} }
    e = registrarPaso(e, p, s.indice, { ...base, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
  }
  throw new Error('la simulación no terminó')
}
