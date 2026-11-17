/**
 * POST /api/cadena/correcciones · recibir · del_encargo · cambio 4 · entrega 2: la jefatura de piezas devuelve una corrección a un paso de la cadena.
 * Llave interna + workflow_id + workflow_execution_id (un flujo autorizado de la cadena o un viaje del cliente). Idempotente por llave «fila_id:destino».
 * Sin la migración de `cadena_correcciones` aplicada, recibir falla ruidoso y la oficina conserva la devolución en el encargo (la vigía la recoge después).
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.correcciones, almacenDeSupabase, undefined, checkInternalKey)
}
