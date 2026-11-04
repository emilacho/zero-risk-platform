/**
 * POST /api/finanzas/pausar · el plan guarda su pedido y el material ya pagado, y termina (04-nov · Emilio: «debe haber una pausa en el flujo hasta que yo conteste»).
 * Cuerpo: `{ encargo_id, sobre, material, workflow_id, workflow_execution_id }`. Llave: `x-api-key` = `INTERNAL_API_KEY`. Solo con la oficina encendida y con las preguntas por Slack activas.
 * La pausa la suelta la respuesta del dueño: el vigía del buzón llama a `recoger` en `/api/finanzas/conversa`.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { almacenDeConversa } from '@/lib/finanzas/conversa/almacen-supabase'
import { baseDeRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { nombreDelClienteDe } from '@/lib/finanzas/conversa/nombre'
import { pausarOficina } from '@/lib/finanzas/conversa/pausa'
import { despertarPorElFlujo, esperasDeFinanzas } from '@/lib/finanzas/conversa/esperas-supabase'
import { slackMdPuerto } from '@/lib/buzon-dueno/slack-md'
import { cerebroDelDueno } from '@/lib/buzon-dueno/cerebro-dueno'
import { avisarAAlertas } from '@/lib/buzon-dueno/alertas'
import { checkInternalKey } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return NextResponse.json({ error: 'entrada_invalida' }, { status: 400 })
  const c = cuerpo as Record<string, unknown>
  if (typeof c.workflow_id !== 'string' || !c.workflow_id.trim() || typeof c.workflow_execution_id !== 'string' || !c.workflow_execution_id.trim()) return NextResponse.json({ error: 'entrada_invalida', errores: ['`workflow_id` y `workflow_execution_id` son obligatorios'] }, { status: 400 })
  const db = getSupabaseAdmin() as unknown as Db
  let cfg
  try { cfg = await almacenDeFinanzas(db).leerConfig() } catch (e) { return NextResponse.json({ error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) }, { status: 503 }) }
  if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') return NextResponse.json({ error: 'conversa_apagada' }, { status: 409 })
  const crudo = (process.env.FINANZAS_CANAL_PREGUNTAS ?? '').trim()
  const canal = /^[CG][A-Z0-9]{8,}$/.test(crudo) ? crudo : undefined
  try {
    const r = await pausarOficina({
      almacen: almacenDeConversa(db),
      canal,
      slack: slackMdPuerto({ token: process.env.SLACK_BOT_TOKEN ?? '', dueno_id: process.env.FINANZAS_EMILIO_ID ?? '', ...(canal ? { canal } : {}) }),
      cerebro: cerebroDelDueno({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY ?? '', workflow_id: c.workflow_id, workflow_execution_id: c.workflow_execution_id, ...(canal ? { canal_etiqueta: 'canal privado de Slack «buzon-de-preguntas»' } : {}) }),
      modo: cfg.preguntas_slack,
      ahora: () => new Date(),
      nombreDelCliente: nombreDelClienteDe(db),
      avisar: avisarAAlertas({ token: process.env.SLACK_BOT_TOKEN ?? '', canal: process.env.FINANZAS_CANAL_ALERTAS }),
      esperas: esperasDeFinanzas(db),
      despertar: despertarPorElFlujo({ base: process.env.N8N_BASE_URL, llave: process.env.INTERNAL_API_KEY }),
    }, c)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pausar_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
