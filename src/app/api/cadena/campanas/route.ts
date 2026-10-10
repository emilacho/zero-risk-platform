/**
 * POST /api/cadena/campanas · abrir · avanzar · cierre · diseño v2 (docs/DISENO-2026-10-09-cadena-calendario-a-brief-v2.md).
 * Llave interna + workflow_id + workflow_execution_id. Nadie la llama todavía: la migración de `cadena_*` NO está aplicada y los flujos están apagados.
 */
import { atender } from '@/lib/cadena/puerta-http'
import { checkInternalKey } from '@/lib/internal-auth'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { abrirCampana, avanzarCampana, cierreDeCampana } from '@/lib/cadena/campanas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return atender(request, { abrir: abrirCampana, avanzar: avanzarCampana, cierre: (al, c) => cierreDeCampana(al, c) }, almacenDeSupabase, undefined, checkInternalKey)
}
