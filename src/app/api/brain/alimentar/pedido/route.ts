/**
 * POST /api/brain/alimentar/pedido · pedido LIBRE de una oficina o su director al portero («completar con huecos»). Responde al instante con `pedido_id` y sigue en segundo plano.
 * GET  /api/brain/alimentar/pedido?id=<pedido_id> · el resultado (quién pidió, huecos, estado, costo, fichas, lo que no se pudo llenar con su motivo).
 * Llave interna (`INTERNAL_API_KEY`), nunca `SALA_DISPATCH_KEY`. `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. Detrás de `PORTERO_PEDIDOS` (apagado por omisión).
 * Sin lista de autorizados ni límite de qué se pide: se registra quién pidió y para qué. Misma cadena, mismo filtro, mismo vigilante; el gasto es del portero (`portero_pedido`).
 */
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { modeloRegistrado, puenteAlIndice } from '@/lib/portero-alimenta/entorno'
import { ANFITRIONES_DE_AVISO_POR_OMISION, rutaLeerPedido, rutaPedido } from '@/lib/portero-alimenta/pedidos'
import { listarFotos } from '@/lib/cerebro/portero/fotos-pendientes'
import { listarTendencias } from '@/lib/cerebro/portero/tendencias-lectura'
import { listarVideos } from '@/lib/cerebro/portero/videos-lectura'
import { firmarVideoDelEntorno } from '@/lib/portero-alimenta/videos-del-cerebro'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { etiquetarPendientesDelEntorno } from '@/lib/cerebro/portero/etiquetar-entorno'
import { avisoReal, buscarReal, dispararCadenaReal, leerPaginaReal } from '@/lib/portero-alimenta/pedidos-entorno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const num = (k: string): number | undefined => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : undefined }

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
    const real = b.dry_run === false && typeof b.workflow_id === 'string' && typeof b.workflow_execution_id === 'string' && typeof b.client_id === 'string'
    const db = getSupabaseAdmin() as unknown as Db
    const origen = new URL(request.url).origin
    const llave = process.env.INTERNAL_API_KEY ?? ''
    const r = await rutaPedido({
      db, interruptores: interruptoresDelEntorno(), activo: String(process.env.PORTERO_PEDIDOS ?? '').trim().toLowerCase() === 'on',
      razonar: real ? modeloRegistrado({ origen, llaveInterna: llave, workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, comando: 'portero.pedido' }) : undefined,
      buscar: real ? buscarReal(process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY) : undefined,
      leerPagina: real ? leerPaginaReal() : undefined,
      dispararCadena: real ? dispararCadenaReal({ url: process.env.PORTERO_COMPLETAR_URL, llaveInterna: llave }) : undefined,
      puente: real ? puenteAlIndice({ origen, llaveInterna: llave, db }) : undefined,
      segundoPlano: real ? (t) => waitUntil(t) : undefined,
      topePorPedidoUsd: num('PORTERO_PEDIDO_TOPE_USD'), topePorOficinaYDiaUsd: num('PORTERO_PEDIDO_TOPE_OFICINA_DIA_USD'),
      enviarAviso: real ? avisoReal(llave) : undefined,
      fotos: {
        listar: (clientId) => listarFotos(consultaDelEntorno(), { cliente: clientId, limite: 200 }),
        etiquetar: real ? async (clientId) => {
          const x = await etiquetarPendientesDelEntorno({ origen, llaveInterna: llave, workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string }, { clientes: [clientId], dry_run: false })
          return { etiquetadas: x.etiquetadas, costo_usd: x.costo_usd }
        } : undefined,
      },
      tendencias: { listar: (clientId, o) => listarTendencias(consultaDelEntorno(), { cliente: clientId, bodega: o.bodega, limite: 50 }) },
      videos: { listar: (clientId) => listarVideos(consultaDelEntorno(), { cliente: clientId, limite: 30 }, firmarVideoDelEntorno()) },
      anfitrionesDeAviso: [...ANFITRIONES_DE_AVISO_POR_OMISION, ...String(process.env.PORTERO_AVISAR_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)],
    }, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pedido_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = await rutaLeerPedido({ db }, new URL(request.url).searchParams.get('id') ?? '')
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'pedido_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
