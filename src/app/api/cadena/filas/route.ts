/**
 * POST /api/cadena/filas · listar · lotes · marcar · diseño v2 (docs/DISENO-2026-10-09-cadena-calendario-a-brief-v2.md).
 * Llave interna + workflow_id + workflow_execution_id. Nadie la llama todavía: la migración de `cadena_*` NO está aplicada y los flujos están apagados.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { filasListar, filasLotes, filasMarcar } from '@/lib/cadena/datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, { listar: (al, c) => filasListar(al, c), lotes: filasLotes, marcar: filasMarcar }, almacenDeSupabase, undefined, checkInternalKey)
}
