/** (vive aquí, junto al otro escritor de cerebro_consultas · el portero solo lee) El registrador real del rastro de la pieza (encargo 9): una fila en `cerebro_consultas` con la llave de servicio del servidor. Devuelve su id. */
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Registrar } from '@/lib/cerebro/portero/segun-la-pieza'

export const registrarEnLaBase: Registrar = async (fila) => {
  const r = await getSupabaseAdmin().from('cerebro_consultas').insert(fila).select('id').limit(1)
  if (r.error) return { error: `cerebro_consultas: ${String(r.error.message)}` }
  const id = Array.isArray(r.data) && r.data[0] ? String((r.data[0] as { id?: unknown }).id ?? '') : ''
  return { id: id || null }
}
