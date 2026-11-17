/**
 * 10-nov (GO v3 · punto 2): los ids de las fotos PROPIAS de un cliente, con la MISMA regla que la oficina (`separarFotos`: competencia y referencia no cuentan).
 * Vive en la oficina porque la cadena no nombra columnas del origen de la foto (guarda `generalidad`); la cadena solo recibe la lista de ids.
 * Si la lectura falla devuelve [] (es un aviso, no un bloqueo: la entrega de la mesa no se pierde).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { separarFotos } from './material'
import { esCapturaDeLaWeb } from '../cerebro/portero/procedencia'

export async function idsDeFotosPropias(db: SupabaseClient, clientId: string): Promise<string[]> {
  try {
    const r = (await db.from('client_social_images').select('id, owner_role, papel, sin_motivo, duplicado_de, tipo, clase').eq('client_id', clientId).eq('estado', 'ok').limit(5000)) as { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
    if (r.error) return []
    // 17-nov · Sprint 4 · D · las capturas de la web no son fotos propias (regla del cerebro, #1135)
    return separarFotos(((r.data ?? []) as Array<Record<string, unknown>>).filter((f) => !esCapturaDeLaWeb(f)) as never).propias.map((f) => f.id)
  } catch { return [] }
}
