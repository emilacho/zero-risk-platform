/**
 * POST /api/cadena/hojas · escribir · 31-oct (nuevo orden · T3). Llave interna + workflow_id + workflow_execution_id.
 * La HOJA DE PRODUCCIÓN la escribe el código (`hoja.v1`) con el brief creativo validado, la gran idea aprobada y las filas del lote (por `fila_ids` o por `semana`); no llama a ningún modelo.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.hojas, almacenDeSupabase, undefined, checkInternalKey)
}
