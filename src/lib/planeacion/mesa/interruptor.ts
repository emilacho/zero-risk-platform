/** el interruptor de la mesa de estrategia. Una base sin la columna deja la mesa apagada (es el plan de hoy); cualquier otro error no se lee como «apagada», y lanza */
import type { Db } from '../../finanzas/almacen-supabase'

export async function mesaEncendida(db: Db): Promise<boolean> {
  const r = await db.from('finanzas_config').select('mesa_de_estrategia').eq('id', 1).maybeSingle()
  if (r.error) { if (r.error.code === '42703' || /mesa_de_estrategia/.test(r.error.message)) return false; throw new Error(r.error.message) }
  return (r.data as { mesa_de_estrategia?: unknown } | null)?.mesa_de_estrategia === true
}
