/**
 * POST /api/cadena/calendario · preparar · guardar · diseño v2 (docs/DISENO-2026-10-09-cadena-calendario-a-brief-v2.md).
 * Llave interna + workflow_id + workflow_execution_id. Nadie la llama todavía: la migración de `cadena_*` NO está aplicada y los flujos están apagados.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { calendarioGuardar, calendarioPreparar } from '@/lib/cadena/pasos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, { preparar: calendarioPreparar, guardar: calendarioGuardar }, almacenDeSupabase)
}
