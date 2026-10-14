/**
 * `repartirPresupuesto` (F5) · reparte un total en partes por peso con la invariante del v1: la suma de las partes es EXACTAMENTE el total (en centavos),
 * el centavo que sobra va a la parte de mayor peso (la primera en empate), nada es negativo y lo que no tiene dónde ir queda como `sin_asignar` declarado.
 * Puro. Sin dependencias.
 */
export interface Parte { clave: string; peso: number }
export interface ParteRepartida { clave: string; monto: number }
export interface Reparto { partes: ParteRepartida[]; sin_asignar: number; total: number }

const aCentavos = (x: number) => Math.round(x * 100)

export function repartirPresupuesto(total: number, partes: Parte[]): Reparto {
  if (!Number.isFinite(total) || total < 0) throw new Error('el total debe ser un número finito ≥ 0')
  for (const p of partes) if (!Number.isFinite(p.peso) || p.peso < 0) throw new Error(`peso inválido en «${p.clave}»`)
  const T = aCentavos(total)
  const suma = partes.reduce((a, p) => a + p.peso, 0)
  if (!partes.length || suma <= 0) return { partes: partes.map((p) => ({ clave: p.clave, monto: 0 })), sin_asignar: T / 100, total: T / 100 }
  const crudas = partes.map((p) => Math.floor((T * p.peso) / suma))
  let resto = T - crudas.reduce((a, c) => a + c, 0)
  // el centavo que sobra va a la parte de mayor peso (la primera en empate)
  let i = 0
  for (let k = 1; k < partes.length; k++) if (partes[k].peso > partes[i].peso) i = k
  crudas[i] += resto
  resto = 0
  return { partes: partes.map((p, k) => ({ clave: p.clave, monto: crudas[k] / 100 })), sin_asignar: 0, total: T / 100 }
}

/** reparto por SEMANA: el total del horizonte según el factor de cada semana (las semanas con factor 0 no reciben nada) */
export function repartirPorSemana(total: number, factores: number[]): number[] {
  const r = repartirPresupuesto(total, factores.map((f, i) => ({ clave: String(i), peso: Math.max(0, f) })))
  return r.partes.map((p) => p.monto)
}

/**
 * F5 · reparto por PIEZA: la pauta de rendimiento de cada semana (del bloque) baja a las piezas del calendario.
 *  · dentro de la semana, se reparte entre las ZONAS por su peso (si no hay zonas, una sola), y dentro de cada zona entre sus piezas por `peso` (1 por omisión);
 *  · una semana con pauta y SIN piezas queda como `sin_asignar` declarado (nunca se pierde ni se oculta);
 *  · invariante: Σ piezas + sin_asignar = Σ semanas, exacta en centavos; nada negativo.
 */
export interface PiezaDelCalendario { pieza_id: string; semana: number; zona?: string; peso?: number }
export interface ResultadoPorPieza {
  piezas: Array<{ pieza_id: string; semana: number; zona: string | null; monto: number }>
  por_semana: Array<{ semana: number; total: number; sin_asignar: number }>
  sin_asignar_total: number
  total: number
}

export function repartirPorPieza(porSemana: number[], piezas: PiezaDelCalendario[], pesoZonas: Record<string, number> = {}): ResultadoPorPieza {
  for (const p of piezas) {
    if (!p.pieza_id) throw new Error('pieza sin id')
    if (!Number.isInteger(p.semana) || p.semana < 1) throw new Error(`semana inválida en «${p.pieza_id}»`)
    if (p.peso != null && (!Number.isFinite(p.peso) || p.peso < 0)) throw new Error(`peso inválido en «${p.pieza_id}»`)
  }
  const salida: ResultadoPorPieza = { piezas: [], por_semana: [], sin_asignar_total: 0, total: 0 }
  let totalCent = 0
  let sinCent = 0
  porSemana.forEach((monto, i) => {
    const semana = i + 1
    const delaSemana = piezas.filter((p) => p.semana === semana)
    const semCent = Number.isFinite(monto) ? aCentavos(Math.max(0, monto)) : 0
    totalCent += semCent
    if (semCent === 0) { salida.por_semana.push({ semana, total: 0, sin_asignar: 0 }); return }
    if (!delaSemana.length) { sinCent += semCent; salida.por_semana.push({ semana, total: semCent / 100, sin_asignar: semCent / 100 }); return }
    const zonas = [...new Set(delaSemana.map((p) => p.zona ?? ''))]
    const pesos = zonas.map((z) => ({ clave: z, peso: z === '' ? 1 : Math.max(0, pesoZonas[z] ?? 1) }))
    const rz = repartirPresupuesto(semCent / 100, pesos)
    let sinSemana = rz.sin_asignar
    for (const z of rz.partes) {
      const enZona = delaSemana.filter((p) => (p.zona ?? '') === z.clave)
      const rp = repartirPresupuesto(z.monto, enZona.map((p) => ({ clave: p.pieza_id, peso: p.peso ?? 1 })))
      sinSemana += rp.sin_asignar
      for (const p of rp.partes) salida.piezas.push({ pieza_id: p.clave, semana, zona: z.clave === '' ? null : z.clave, monto: p.monto })
    }
    sinCent += aCentavos(sinSemana)
    salida.por_semana.push({ semana, total: semCent / 100, sin_asignar: aCentavos(sinSemana) / 100 })
  })
  salida.total = totalCent / 100
  salida.sin_asignar_total = sinCent / 100
  return salida
}
