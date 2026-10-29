/**
 * LO COMÚN de las dos rutas de Slack (botones y eventos): el interruptor, la firma, la lista de autorizados y los puertos reales.
 * APAGADO por omisión: sin `NOTAS_DEL_DUENO=1` las rutas responden 503 y no tocan nada. Sin `SLACK_SIGNING_SECRET` nada se acepta (falla cerrado).
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { verificarFirmaDeSlack } from './firma-slack'
import { enviarNotaAlCerebro, puertosDeNotas, reintentarPendientes } from './adaptadores'
import type { ConfiguracionDeNotas, PuertosDeNotas } from './tipos'

export const encendido = (): boolean => process.env.NOTAS_DEL_DUENO === '1'

export function autorizadosDelEntorno(): string[] {
  return (process.env.NOTAS_AUTORIZADOS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export function firmaDeLaPeticion(request: Request, cuerpo: string) {
  return verificarFirmaDeSlack({ secreto: process.env.SLACK_SIGNING_SECRET, firma: request.headers.get('x-slack-signature'), marca: request.headers.get('x-slack-request-timestamp'), cuerpo, ahoraMs: Date.now() })
}

export function configuracionReal(): ConfiguracionDeNotas { return { autorizados: autorizadosDelEntorno() } }

export const entornoDeNotas = (request: Request) => ({ baseUrl: new URL(request.url).origin, internalKey: process.env.INTERNAL_API_KEY ?? '', slackToken: process.env.SLACK_BOT_TOKEN, alCerebro: process.env.NOTAS_AL_CEREBRO === '1' })

/** el empuje al cerebro de lo que Emilio dice en el dashboard (misma cola y mismos reintentos que Slack); sin `NOTAS_AL_CEREBRO=1` queda encolado */
export const empujeDelDashboard = (request: Request) => (nota: Parameters<NonNullable<PuertosDeNotas['enviarAlCerebro']>>[0], ctx: { ts: string; canal_slack: string; respondido_en: string }) =>
  enviarNotaAlCerebro(getSupabaseAdmin(), entornoDeNotas(request), fetch, nota, ctx)

/** la siguiente vuelta: sube al cerebro las notas que quedaron pendientes. Nunca lanza. */
export async function reintentarLosPendientes(request: Request) {
  try { return await reintentarPendientes(getSupabaseAdmin(), entornoDeNotas(request)) } catch (e) { return { intentadas: 0, enviadas: 0, siguen: 0, rechazadas: 0, error: e instanceof Error ? e.message : String(e) } }
}

export function puertosReales(request: Request): PuertosDeNotas {
  return puertosDeNotas(getSupabaseAdmin(), entornoDeNotas(request))
}
