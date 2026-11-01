/**
 * POST /api/cadena/brief · abrir · entregar · 31-oct (nuevo orden · T3). Llave interna + workflow_id + workflow_execution_id.
 * `abrir` devuelve el SOBRE que el flujo le lleva a la oficina (`POST /api/oficina/encargos`, `origen: 'cadena'`); `entregar` es la misma recepción que el puerto en proceso.
 * Nadie la llama todavía: la palanca `nuevo_orden` está vacía y los flujos se publican en T9.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.brief, almacenDeSupabase, undefined, checkInternalKey)
}
