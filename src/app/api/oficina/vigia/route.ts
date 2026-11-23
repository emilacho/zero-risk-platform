/**
 * POST /api/oficina/vigia · el reloj de la oficina (cada 10 min, lo llama n8n): vence la bandeja de la oficina y da por muertos los pasos sin vuelta. SALA 1 · PR 4 · NADIE la llama todavía.
 * Solo toca filas DE LA OFICINA. Cuerpo opcional { dry_run?: boolean } (true = solo cuenta, no escribe). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Con la oficina APAGADA no hace nada (devuelve `apagada`): el vigía es parte de lo que se enciende al final.
 * ③ REINTENTO DE PIEZAS (21-oct · `cadena/reintento-piezas`): re-emite el sobre `producir` de los briefs cuya pieza nunca llegó a encargo (máx. 3, espaciados). NACE APAGADO (`cadena_config.reintento_piezas`).
 *    Cuerpo `{ reintento_en_seco: true }` = solo calcula el plan (sin emitir, sin anotar, sin avisar, sin tocar la bandeja ni los pasos): así se revisa a US$ 0.
 * ④ 21-nov · EL ARREGLO PROPIO DE «CREAR CAMPAÑA» (`cadena/reparar-pedidos`, GO Lenovo 10:28Z): re-emite el sobre de los pedidos que no nacieron (máx. 5, espaciados) y da por fallido el que no tiene arreglo.
 *    Va con el reintento en seco (`{ reintento_en_seco: true }` también lo calcula sin emitir). Nunca lanza ni frena al vigía.
 */
import { NextResponse } from 'next/server'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { revisarEsperasDeLaCadena, revisarPasosMuertos, vencerBandeja, vencerMesasPorPlazo } from '@/lib/oficina/vigia'
import { reintentoDeLaCadena } from '@/lib/oficina/reintento-adaptador'
import { reintentarLosPendientes } from '@/lib/notas-del-dueno/ruta'
import { cerrarDecisionesReemplazadas } from '@/lib/oficina/cerrar-decisiones-reemplazadas'
import { purgarTextosViejos } from '@/lib/oficina/purgar-textos'
import { almacenDeSupabase as almacenDeLaCadena } from '@/lib/cadena/almacen-supabase'
import { repararPedidos } from '@/lib/cadena/reparar-pedidos'

/** ④ nunca lanza: un fallo del arreglo de pedidos no frena el vigía */
async function arregloDePedidos(ahora: Date, ejecutar: boolean) {
  // también si armar el almacén lanza (sin credenciales, por ejemplo): eso pasa antes de la promesa, así que va dentro del try
  try { return await repararPedidos(almacenDeLaCadena(), ahora, { ejecutar }) } catch (e) { return { accion: 'error' as const, detalle: e instanceof Error ? e.message : String(e) } }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

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
    if (cuerpo.reintento_en_seco === true) return NextResponse.json({ accion: 'reintento_en_seco', reintento: await reintentoDeLaCadena(db, env, { ejecutar: false }), pedidos: await arregloDePedidos(P.ahora(), false) }, { status: 200 })
    if (cuerpo.dry_run === true) return NextResponse.json({ accion: 'dry_run', detalle: 'no se escribió nada' }, { status: 200 })
    const ahora = P.ahora()
    const v = await vencerBandeja(db, ahora)
    const m = await revisarPasosMuertos(P, db, ahora)
    const plazo = await vencerMesasPorPlazo(P, db, ahora)
    // eslabones 1 y 3 de #1150 · las piezas que esperan a la cadena (nunca lanza ni frena al vigía)
    const esperas = await revisarEsperasDeLaCadena(P, db)
    // el segundo cerebro: cada vuelta del reloj también sube al cerebro las notas del dueño que quedaron pendientes (solo con la bandera encendida; nunca frena al vigía)
    const notas = process.env.NOTAS_DEL_DUENO === '1' ? await reintentarLosPendientes(request) : undefined
    // ③ el reintento de piezas va DESPUÉS de lo demás y nunca lanza: si falla, el vencimiento de la bandeja y los pasos muertos ya quedaron hechos
    const reintento = await reintentoDeLaCadena(db, env, { ejecutar: true })
    const purga = await purgarTextosViejos(db, ahora)
    // ④ los pedidos de «Crear Campaña» que no nacieron
    const pedidos = await arregloDePedidos(ahora, true)
    // solo lo vigente pide firma: nunca lanza ni frena al vigía. Se apaga con DECISIONES_REEMPLAZADAS=apagado, sin publicar nada
    const reemplazadas = process.env.DECISIONES_REEMPLAZADAS === 'apagado' ? { cerradas: [], error: null } : await cerrarDecisionesReemplazadas(db, ahora)
    return NextResponse.json({ accion: 'vigilado', esperas_de_la_cadena: esperas.revisados, ...(esperas.error ? { esperas_de_la_cadena_error: esperas.error } : {}), decisiones_reemplazadas: reemplazadas.cerradas.length, ...(reemplazadas.error ? { decisiones_reemplazadas_error: reemplazadas.error } : {}), ...(purga.error ? { purga_de_textos_error: purga.error } : {}), vencidas: v.vencidas, mesas_vencidas_por_plazo: plazo.vencidas, reanudar: m.reanudar, fallidos: m.fallidos, cierres: m.cierres, ...(m.sin_dato ? { pasos_sin_dato: m.sin_dato } : {}), ...(notas ? { notas_del_dueno: notas } : {}), reintento, pedidos }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
