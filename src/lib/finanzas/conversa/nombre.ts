/**
 * EL NOMBRE DEL CLIENTE PARA EL MENSAJE AL DUEÑO (20-oct · tercera prueba): el buzón escribió «Para el plan de df7e47cc-bec4-4fa2-bc24-ff97ba5213a5» porque el puerto `nombreDelCliente` no estaba cableado
 * en la ruta. Lee el nombre de la ficha (`clients.name`); si no hay, devuelve null y el mensaje dice «tu negocio» (nunca un id).
 */
import type { Db } from '../almacen-supabase'

export const NOMBRE_SIN_FICHA = 'tu negocio'

/** un id no es un nombre: uuid o texto sin letras */
export const pareceUnId = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim()) || !/\p{L}/u.test(s)

export function nombreDelClienteDe(db: Db): (client_id: string) => Promise<string | null> {
  return async (client_id: string) => {
    try {
      const r = (await db.from('clients').select('name').eq('id', client_id).limit(1)) as { data: Array<Record<string, unknown>> | null; error: unknown }
      if (r.error || !Array.isArray(r.data)) return null
      const n = typeof r.data[0]?.name === 'string' ? r.data[0].name.trim() : ''
      return n && !pareceUnId(n) ? n.slice(0, 80) : null
    } catch { return null }
  }
}
