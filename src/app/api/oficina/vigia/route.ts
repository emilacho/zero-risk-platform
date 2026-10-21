/**
 * POST /api/oficina/vigia · el reloj de la oficina (cada 10 min, lo llama n8n): vence la bandeja de la oficina y da por muertos los pasos sin vuelta. SALA 1 · PR 4 · NADIE la llama todavía.
 * Solo toca filas DE LA OFICINA. Cuerpo opcional { dry_run?: boolean } (true = solo cuenta, no escribe). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Con la oficina APAGADA no hace nada (devuelve `apagada`): el vigía es parte de lo que se enciende al final.
 * ③ REINTENTO DE PIEZAS (21-oct · `cadena/reintento-piezas`): re-emite el sobre `producir` de los briefs cuya pieza nunca llegó a encargo (máx. 3, espaciados). NACE APAGADO (`cadena_config.reintento_piezas`).
 *    Cuerpo `{ reintento_en_seco: true }` = solo calcula el plan (sin emitir, sin anotar, sin avisar, sin tocar la bandeja ni los pasos): así se revisa a US$ 0.
 */
import { NextResponse } from 'next/server'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { revisarPasosMuertos, vencerBandeja } from '@/lib/oficina/vigia'
import { reintentoDeLaCadena } from '@/lib/oficina/reintento-adaptador'
import { reintentarLosPendientes } from '@/lib/notas-del-dueno/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  const cuerpo: unknown = await request.json().catch(() => ({}))
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  if (cuerpo.dry_run !== undefined && typeof cuerpo.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', errores: ['`dry_run` debe ser verdadero o falso'] }, { status: 400 })
  try {
    const { P, db } = puertosReales(request)
    const config = await P.almacen.leerConfig()
    if (config.estado === 'apagada') return NextResponse.json({ accion: 'apagada', detalle: 'la oficina está apagada: el vigía no hace nada' }, { status: 200 })
    const env = { slackToken: process.env.SLACK_BOT_TOKEN, canalHilo: process.env.OFICINA_SLACK_CANAL }
    if (cuerpo.reintento_en_seco === true) return NextResponse.json({ accion: 'reintento_en_seco', reintento: await reintentoDeLaCadena(db, env, { ejecutar: false }) }, { status: 200 })
    if (cuerpo.dry_run === true) return NextResponse.json({ accion: 'dry_run', detalle: 'no se escribió nada' }, { status: 200 })
    const ahora = P.ahora()
    const v = await vencerBandeja(db, ahora)
    const m = await revisarPasosMuertos(P, db, ahora)
    // el segundo cerebro: cada vuelta del reloj también sube al cerebro las notas del dueño que quedaron pendientes (solo con la bandera encendida; nunca frena al vigía)
    const notas = process.env.NOTAS_DEL_DUENO === '1' ? await reintentarLosPendientes(request) : undefined
    // ③ el reintento de piezas va DESPUÉS de lo demás y nunca lanza: si falla, el vencimiento de la bandeja y los pasos muertos ya quedaron hechos
    const reintento = await reintentoDeLaCadena(db, env, { ejecutar: true })
    return NextResponse.json({ accion: 'vigilado', vencidas: v.vencidas, reanudar: m.reanudar, fallidos: m.fallidos, cierres: m.cierres, ...(notas ? { notas_del_dueno: notas } : {}), reintento }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
