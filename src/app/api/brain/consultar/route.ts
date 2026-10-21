/**
 * GET /api/brain/consultar · lectura instantánea del cerebro (sin modelo, US$ 0). Llave interna (`x-api-key`).
 * ?client_id=&oficina=&agente=&que=&atributo=&clase=&sede_clave=&limite= · devuelve fichas vigentes con procedencia, fecha y `vencida`; sin nada: `sin_dato: true`. Registra quién consultó.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { rutaConsultar } from '@/lib/portero-alimenta/consultar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const u = new URL(request.url).searchParams
    const r = await rutaConsultar({ db: getSupabaseAdmin() as unknown as Db }, { client_id: u.get('client_id'), oficina: u.get('oficina'), agente: u.get('agente'), que: u.get('que'), atributo: u.get('atributo'), clase: u.get('clase'), sede_clave: u.get('sede_clave'), limite: u.get('limite') })
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'consultar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
