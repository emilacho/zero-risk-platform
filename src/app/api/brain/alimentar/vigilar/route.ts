/**
 * POST /api/brain/alimentar/vigilar · el VIGILANTE dentro del sistema: el flujo del portero lo llama al cerebro de cada corrida (después de ⑤ Cierre). Revisa las condiciones de salud;
 * si alguna falla DESACTIVA el flujo (reversible) y AVISA a #alertas con el motivo en una línea; si todo va bien, silencio (solo rastro).
 * `dry_run` obligatorio (true = solo evalúa, no escribe, no apaga, no avisa). Con false exige workflow_id + workflow_execution_id. US$ 0 (ni Apify ni modelo). Llave interna.
 * Solo apaga flujos cuyo nombre contenga «portero» (no es una puerta para apagar cualquier flujo).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno, umbralesDeGastoDelEntorno } from '@/lib/portero-alimenta/datos'
import { avisarAAlertas, apagarFlujoDelPortero } from '@/lib/portero-alimenta/avisos'
import { rutaVigilar } from '@/lib/portero-alimenta/vigilante'
import { modoDelEntorno } from '@/lib/portero-alimenta/modo'
import { umbralesDeAnomaliaDelEntorno } from '@/lib/portero-alimenta/anomalia'
import { hechosDeLaCorridaDelVigilante, preguntarPorHttp } from '@/lib/portero-alimenta/hechos-preguntas'
import { origenDeLaCorridaDelVigilante } from '@/lib/portero-alimenta/origen-de-lo-ajeno'
import { relevanciaDeLaCorridaDelVigilante } from '@/lib/portero-alimenta/relevancia'
import { depsDeRelevanciaDelEntorno } from '@/lib/portero-alimenta/relevancia-entorno'
import { baseDeRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  // la hora en que entró el pedido: el juicio de lo ajeno termina antes de que se acabe el tiempo de la ruta (maxDuration 300 s, con 20 s de margen)
  const hasta = Date.now() + (maxDuration - 20) * 1000
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaVigilar({ db, interruptores: interruptoresDelEntorno(), apagar: apagarFlujoDelPortero(), avisar: avisarAAlertas({ db }), umbrales: umbralesDeGastoDelEntorno(), modo: modoDelEntorno().modo, anomalia: umbralesDeAnomaliaDelEntorno() }, cuerpo)
    // 17-nov (ENCARGO 2 de Cerebro): en cada corrida, los HECHOS DEL NEGOCIO de cada cliente revisado y las preguntas de sus huecos. Va DESPUÉS del vigilante y aparte:
    // nunca cambia lo que el vigilante decidió ni su código de respuesta; si falla, lo dice en su propio campo
    const hechos = await hechosDeLaCorridaDelVigilante({ db, preguntar: preguntarPorHttp({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY ?? '' }) }, cuerpo, r.body).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
    // 17-nov (ENCARGO 3 de Cerebro, fase B): de dónde viene cada foto y video ajeno (papel, vía, nivel, motivo). Igual: aparte, nunca cambia al vigilante
    const origen = await origenDeLaCorridaDelVigilante(db, cuerpo, r.body).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
    // 18-nov (ENCARGO 4 de Cerebro): el JUICIO DE RELEVANCIA de lo ajeno ya clasificado (Haiku 4.5, tope diario). Apagado salvo PORTERO_RELEVANCIA=on; aparte, nunca cambia al vigilante
    const relevancia = await relevanciaDeLaCorridaDelVigilante(depsDeRelevanciaDelEntorno({ db, origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '' }), cuerpo, r.body, process.env, hasta).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
    return NextResponse.json({ ...r.body, ...(hechos ? { hechos_del_negocio: hechos } : {}), ...(origen ? { origen_de_lo_ajeno: origen } : {}), ...(relevancia ? { relevancia_de_lo_ajeno: relevancia } : {}) }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'vigilante_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
