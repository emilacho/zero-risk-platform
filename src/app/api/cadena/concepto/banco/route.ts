/**
 * POST /api/cadena/concepto/banco · editar · retirar · 17-nov (GO Lenovo · Emilio aprobó el boceto del Banco de Ideas). Llave interna + `workflow_id: 'tablero'` + workflow_execution_id.
 * Solo el tablero, solo la gran idea APROBADA vigente; no reescribe ni gasta. La lógica vive en `@/lib/cadena/banco-de-ideas`.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.banco, almacenDeSupabase, undefined, checkInternalKey)
}
