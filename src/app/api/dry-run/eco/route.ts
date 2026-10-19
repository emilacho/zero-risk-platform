/**
 * POST /api/dry-run/eco
 *
 * El «eco» del MODO SECO del alta (CC#1 · noche del 19-oct). En una corrida en seco, los nodos de n8n que tocarían algo REAL y no tienen modo seco propio (Notion, la reserva de Cal.com,
 * el aviso a Slack, el Servicio de Apify, el pase a canon del manual, la copia a Drive, el flujo del portero) apuntan aquí en lugar de a su destino. Esta ruta NO hace nada: no lee ni escribe
 * la base, no llama a ningún servicio. Contesta una respuesta de forma conocida que los nodos siguientes leen como «hecho, sin datos»: `{ ok, dry_run, simulado, eco }` más los campos
 * de identificador que esos nodos suelen leer, todos con el valor `dry-run`.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`.   Cualquier cuerpo.   200 siempre que la llave sea válida.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { respuestaDeEco } from '@/lib/dry-run/eco'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const cuerpo: unknown = await request.json().catch(() => null)
  return NextResponse.json(respuestaDeEco(cuerpo), { status: 200 })
}
