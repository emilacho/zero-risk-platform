/**
 * POST /api/finanzas/conversa · la oficina financiera conversa (F8 · CC#1 · 14-oct). NACE APAGADA: `finanzas_config.conversa = 'apagado'` → 409 antes de leer, llamar al modelo o escribir.
 *  · `{ accion: 'abrir', client_id, dry_run (booleano), semilla }` → abre (o devuelve) la conversación del cliente.
 *  · `{ accion: 'avanzar', encargo_id, workflow_id }` → ejecuta UN paso (`workflow_id` = el id REAL del flujo de n8n que llama; sin él el turno de agente no se llama) (un turno de agente o una función de código) y lo guarda.
 *  · `{ accion: 'leer', encargo_id }` → estado, gasto y turnos.
 *  · `{ accion: 'cerrar', encargo_id }` → cierra por plazo un encargo abandonado (estado terminal `cierre_por_tope`, sin firma, US$ 0); idempotente.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca la llave de la sala). Slack del hilo: sin adaptador real (puerto «no configurado»). BUZÓN (MD al dueño): `{ accion: 'preguntar'|'recoger', encargo_id, workflow_id, workflow_execution_id }`, apagado salvo `preguntas_slack = 'envia'`.
 * Modelo: solo si hay `FINANZAS_RUN_SDK_BASE` (nunca en la rama apagada).
 * SECO (CC#2 · 14-oct): `{ accion: 'avanzar', encargo_id, simulacion }` → los agentes contestan el guion (SOLO con un encargo `dry_run = true`; con uno real, 409): el seco a US$ 0, sin modelo.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeFinanzas, type Db } from '@/lib/finanzas/almacen-supabase'
import { almacenDeConversa } from '@/lib/finanzas/conversa/almacen-supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { abrirConversacion, avanzar, cerrarPorPlazo, leerConversacion } from '@/lib/finanzas/conversa/orquestador'
import { avanzarConSimulacion } from '@/lib/finanzas/conversa/simulado'
import type { PuertosDeConversa, SlackPuerto } from '@/lib/finanzas/conversa/puertos'
import { preguntarAlDueno, recogerRespuestas } from '@/lib/finanzas/conversa/buzon'
import { slackMdPuerto } from '@/lib/buzon-dueno/slack-md'
import { cerebroDelDueno } from '@/lib/buzon-dueno/cerebro-dueno'
import { checkInternalKey } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// un turno de agente puede tardar minutos (la llamada al corredor va dentro de esta función)
// intento 4: el jefe tarda 115–260 s por llamada y con el reintento de formato pasaba de 300 s (502, turno perdido, cobrado). El límite del reintento (150 s) y este techo lo hacen caber.
export const maxDuration = 800

/** sin adaptador real: ni publica ni lee (la conversación sigue con supuestos). El adaptador de envío es una decisión de Emilio, no de esta rama. */
const slackNoConfigurado: SlackPuerto = {
  async publicar() { return { ok: false } },
  async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts, sin_acceso: 'no_configurado' } },
}

/** la base de esta misma aplicación (donde vive la puerta del dueño): el mismo orden que el modelo de la oficina */
const baseDelCerebro = baseDeRunSdk

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const db = getSupabaseAdmin() as unknown as Db
  const tableros = almacenDeFinanzas(db)
  const P: PuertosDeConversa = {
    almacen: almacenDeConversa(db),
    modelo: modeloRunSdk({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY, fetch, workflow_id: typeof cuerpo === 'object' && cuerpo !== null ? ((cuerpo as Record<string, unknown>).workflow_id as string | undefined) : undefined }),
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
  else if (c.accion === 'avanzar' && typeof c.encargo_id === 'string') r = c.simulacion !== undefined ? await avanzarConSimulacion(P, c.encargo_id, c.simulacion) : await avanzar(P, c.encargo_id)
  else if (c.accion === 'leer' && typeof c.encargo_id === 'string') r = await leerConversacion(P, c.encargo_id)
  else if (c.accion === 'cerrar' && typeof c.encargo_id === 'string') r = await cerrarPorPlazo(P, c.encargo_id)
  else if ((c.accion === 'preguntar' || c.accion === 'recoger') && typeof c.encargo_id === 'string') {
    // BUZÓN por MD: apagado = 0 envíos y 0 lecturas (`preguntas_slack` ≠ 'envia'); el id del dueño y las llaves salen del entorno, nunca del cuerpo
    // una configuración que no se pudo leer NO es «apagada» (503), igual que en abrir/avanzar/leer
    let cfg
    let fallo: { status: number; cuerpo: Record<string, unknown> } | null = null
    try { cfg = await P.config() } catch (e) { cfg = null; fallo = { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
    if (cfg === null) r = fallo ?? { status: 503, cuerpo: { error: 'config_ilegible' } }
    else if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') r = { status: 409, cuerpo: { error: 'conversa_apagada' } }
    else if (typeof c.workflow_id !== 'string' || !c.workflow_id.trim() || typeof c.workflow_execution_id !== 'string' || !c.workflow_execution_id.trim()) r = { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`workflow_id` y `workflow_execution_id` son obligatorios (la puerta del dueño en el cerebro los exige)'] } }
    else {
      const crudo = (process.env.FINANZAS_CANAL_PREGUNTAS ?? '').trim()
      const canalDelBuzon = /^[CG][A-Z0-9]{8,}$/.test(crudo) ? crudo : undefined
      const B = {
        almacen: P.almacen,
        // CANAL del buzón (opcional): `FINANZAS_CANAL_PREGUNTAS` = id del canal privado (C…/G…); sin él (o mal formado) se usa el MD al dueño
        canal: canalDelBuzon,
        slack: slackMdPuerto({ token: process.env.SLACK_BOT_TOKEN ?? '', dueno_id: P.emilio_id, ...(canalDelBuzon ? { canal: canalDelBuzon } : {}) }),
        cerebro: cerebroDelDueno({ base: baseDelCerebro(process.env), llave: process.env.INTERNAL_API_KEY ?? '', workflow_id: c.workflow_id, workflow_execution_id: c.workflow_execution_id, ...(canalDelBuzon ? { canal_etiqueta: 'canal privado de Slack «buzon-de-preguntas»' } : {}) }),
        modo: cfg.preguntas_slack,
        ahora: P.ahora,
      }
      r = c.accion === 'preguntar' ? await preguntarAlDueno(B, c.encargo_id) : await recogerRespuestas(B, c.encargo_id)
    }
  }
  else r = { status: 400, cuerpo: { error: 'accion_invalida', acciones: ['abrir', 'avanzar', 'leer', 'cerrar', 'preguntar', 'recoger'] } }
  return NextResponse.json(r.cuerpo, { status: r.status })
}
