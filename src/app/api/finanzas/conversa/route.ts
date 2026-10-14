/**
 * POST /api/finanzas/conversa · la oficina financiera conversa (F8 · CC#1 · 14-oct). NACE APAGADA: `finanzas_config.conversa = 'apagado'` → 409 antes de leer, llamar al modelo o escribir.
 *  · `{ accion: 'abrir', client_id, dry_run (booleano), semilla }` → abre (o devuelve) la conversación del cliente.
 *  · `{ accion: 'avanzar', encargo_id, workflow_id }` → ejecuta UN paso (`workflow_id` = el id REAL del flujo de n8n que llama; sin él el turno de agente no se llama) (un turno de agente o una función de código) y lo guarda.
 *  · `{ accion: 'leer', encargo_id }` → estado, gasto y turnos.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca la llave de la sala). Slack: sin adaptador real en esta rama (puerto «no configurado»: no publica ni lee).
 * Modelo: solo si hay `FINANZAS_RUN_SDK_BASE` (nunca en la rama apagada).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { almacenDeConversa } from '@/lib/finanzas/conversa/almacen-supabase'
import { modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { abrirConversacion, avanzar } from '@/lib/finanzas/conversa/orquestador'
import type { PuertosDeConversa, SlackPuerto } from '@/lib/finanzas/conversa/puertos'
import { checkInternalKey } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** sin adaptador real: ni publica ni lee (la conversación sigue con supuestos). El adaptador de envío es una decisión de Emilio, no de esta rama. */
const slackNoConfigurado: SlackPuerto = {
  async publicar() { return { ok: false } },
  async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts, sin_acceso: 'no_configurado' } },
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const db = getSupabaseAdmin() as unknown as Db
  const tableros = almacenDeFinanzas(db)
  const P: PuertosDeConversa = {
    almacen: almacenDeConversa(db),
    modelo: modeloRunSdk({ base: process.env.FINANZAS_RUN_SDK_BASE, llave: process.env.INTERNAL_API_KEY, fetch, workflow_id: typeof cuerpo === 'object' && cuerpo !== null ? ((cuerpo as Record<string, unknown>).workflow_id as string | undefined) : undefined }),
    slack: slackNoConfigurado,
    tableros,
    config: () => tableros.leerConfig(),
    ahora: () => new Date(),
    canalDelHilo: process.env.FINANZAS_CANAL_HILO ?? '',
    emilio_id: process.env.FINANZAS_EMILIO_ID ?? '',
  }
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  let r: { status: number; cuerpo: Record<string, unknown> }
  if (c.accion === 'abrir') r = await abrirConversacion(P, c)
  else if (c.accion === 'avanzar' && typeof c.encargo_id === 'string') r = await avanzar(P, c.encargo_id)
  else if (c.accion === 'leer' && typeof c.encargo_id === 'string') {
    const cfg = await P.config().catch(() => null)
    if (!cfg || cfg.estado === 'apagada' || cfg.conversa === 'apagado') r = { status: 409, cuerpo: { error: 'conversa_apagada' } }
    else {
      const e = await P.almacen.leerEncargo(c.encargo_id)
      r = e ? { status: 200, cuerpo: { encargo_id: e.id, estado: e.estado, gasto_usd: e.gasto_usd, turnos: await P.almacen.turnos(e.id) } } : { status: 404, cuerpo: { error: 'encargo_inexistente' } }
    }
  } else r = { status: 400, cuerpo: { error: 'accion_invalida', acciones: ['abrir', 'avanzar', 'leer'] } }
  return NextResponse.json(r.cuerpo, { status: r.status })
}
