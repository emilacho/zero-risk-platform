/**
 * POST /api/cadena/fichas · preparar · guardar · Sprint 4 · A entrega 2: el lector de las fichas de hechos por oferta (una vez por campaña · no es reja).
 * Llave interna + workflow_id + workflow_execution_id. Sin la migración de `cadena_fichas_de_oferta` aplicada y su flujo dado de alta, nadie la llama.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.fichas, almacenDeSupabase, undefined, checkInternalKey)
}
