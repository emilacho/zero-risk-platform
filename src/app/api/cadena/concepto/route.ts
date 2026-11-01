/**
 * POST /api/cadena/concepto · abrir · entregar · decidir · 31-oct (nuevo orden · T3). Llave interna + workflow_id + workflow_execution_id.
 * `decidir` es la puerta de la tarjeta «Gran idea» del dashboard (aprobar · cambios con nota y a qué apunta); la bandeja de piezas NO decide conceptos (`PATCH /api/hitl/[id]` → 409).
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { ACCIONES } from '@/lib/cadena/acciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, ACCIONES.concepto, almacenDeSupabase, undefined, checkInternalKey)
}
