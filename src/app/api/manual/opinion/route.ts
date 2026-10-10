/**
 * POST /api/manual/opinion · S6 · la opinión de GPT ciego (una sola pregunta, módulo común). `dry_run: true` arma el pedido y NO llama. Llaves: interna + de despacho.
 * La revisión del manual nace APAGADA: nadie la llama todavía (el flujo n8n es inactivo).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { autorizar } from '@/lib/manual/rutas'
import { rutaOpinion, type EntornoDeRutas } from '@/lib/manual/rutas'
import type { Db } from '@/lib/manual/revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const entorno = (): EntornoDeRutas => {
  const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined)
  return { openaiKey: process.env.OPENAI_API_KEY, modelo: process.env.OFICINA_REVISOR_MODEL, precioEntrada: num(process.env.OFICINA_REVISOR_PRECIO_ENTRADA_USD_M), precioSalida: num(process.env.OFICINA_REVISOR_PRECIO_SALIDA_USD_M) }
}

export async function POST(request: Request) {
  const no = autorizar(request, true)
  if (no) return NextResponse.json(no.body, { status: no.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const r = await rutaOpinion(getSupabaseAdmin() as unknown as Db, cuerpo, entorno())
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'manual_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
