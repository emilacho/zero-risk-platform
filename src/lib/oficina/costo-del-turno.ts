/**
 * 21-nov · GO Lenovo 10:19Z · EL GASTO DE UN TURNO CORTADO SE ANOTA. El corte por tope llega como fallo con costo 0 (el flujo no recibe `cost_usd` en un fallo),
 * pero el corredor escribe lo gastado en el propio error («gastado ≈ US$ 0.8066», `tope-por-corrida.ts`). Si la vuelta no trae costo, se lee de ahí; nunca se inventa:
 * sin esa marca, 0. Si trae costo, manda el costo (nunca se suman los dos).
 */
const GASTADO_EN_EL_ERROR = /gastado ≈ US\$ (\d+(?:\.\d+)?)/
export function costoDelTurno(res: { costo_usd?: number | null; error?: string | null }): number {
  const declarado = Math.max(0, Number(res.costo_usd ?? 0))
  if (declarado > 0 || typeof res.error !== 'string') return Number.isFinite(declarado) ? declarado : 0
  const m = GASTADO_EN_EL_ERROR.exec(res.error)
  const leido = m ? Number(m[1]) : 0
  return Number.isFinite(leido) && leido > 0 ? leido : 0
}
