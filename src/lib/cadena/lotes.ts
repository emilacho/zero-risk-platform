/**
 * LOS LOTES VENCIDOS (CC#2): el cálculo que comparten el reloj (`filasLotes`) y el arranque por evento (`arrancarAlActivar`). Módulo aparte para que `pasos`, `revision-jefatura` y `arranque` puedan usarlo sin ciclos.
 */
import { createHash } from 'node:crypto'
import type { Almacen, Campana } from './almacen'
import { restarDias, semanaIso } from './fechas'
import type { Fila } from './tipos'

export interface LoteVencido { lote: string; fila_ids: string[]; idempotency_key: string }
export const huellaDeLote = (filaIds: string[]): string => createHash('sha256').update([...filaIds].sort().join(',')).digest('hex').slice(0, 8)

/** los lotes vencidos de una campaña ACTIVA a la fecha `hoy` (AAAA-MM-DD) · lo usan el reloj (`filasLotes`) y el arranque por evento: el MISMO cálculo */
export async function lotesVencidos(al: Almacen, c: Campana, hoy: string): Promise<{ lotes: LoteVencido[]; version: number }> {
  const formatos = await al.formatos()
  const holgura = typeof (await al.leerConfig('holgura_dias')) === 'number' ? ((await al.leerConfig('holgura_dias')) as number) : 3
  const version = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
  const conHuella = (await al.leerConfig('arranque_por_evento')) === true
  const vencen = (await al.filas(c.id, version)).filter((f) => {
    if (f.estado !== 'validada' && f.estado !== 'lista_para_brief') return false
    const lead = (formatos[f.red] ?? []).find((x) => x.formato === f.formato)?.lead_dias ?? 3
    return restarDias(f.fecha, lead + holgura) <= hoy && f.fecha >= hoy
  })
  const porSemana = new Map<string, Fila[]>()
  for (const f of vencen) porSemana.set(semanaIso(f.fecha), [...(porSemana.get(semanaIso(f.fecha)) ?? []), f])
  const lotes = [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([lote, fs]) => {
    const fila_ids = fs.map((f) => f.id)
    return { lote, fila_ids, idempotency_key: conHuella ? `${c.id}:${lote}:${version}:${huellaDeLote(fila_ids)}` : `${c.id}:${lote}:${version}` }
  })
  return { lotes, version }
}
