/**
 * POST /api/planeacion/mesa · la mesa de estrategia del plan. NACE APAGADA: `finanzas_config.mesa_de_estrategia` en false → 409 antes de leer, llamar al modelo o escribir.
 *  · `{ accion: 'abrir', client_id, dry_run, trabajo_id, semilla, workflow_id }`: abre la de esa corrida o devuelve la que hay.
 *  · `{ accion: 'avanzar', encargo_id, workflow_id }`: ejecuta UN paso. `paso` es el del turno (`mesa-estrategia-<rol>`).
 *  · `{ accion: 'leer', encargo_id }` · `{ accion: 'devolver', encargo_id, motivo, cifra? }`: finanzas la devuelve, una sola vez.
 *  · `{ accion: 'vivas' }`: las mesas abiertas ahora mismo, encendida o no. Publicar la plataforma las mata (punto 5 de CC3): cuenta en el «0 corridas vivas».
 * Llave: `x-api-key` = `INTERNAL_API_KEY`.
 * 05-nov · con `x-zr-latido: 1` la conexión no queda en silencio mientras trabaja un empleado, y el turno termina aunque quien llamó se vaya.
 */
import { trabajoDeLaLlamada } from '@/lib/trabajo-de-la-llamada'
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { pideLatido, responderConLatido } from '@/lib/latido-hacia-quien-llama'
import { turnoEnVueloEnElCorredor } from '@/lib/planeacion/mesa/turno-en-vuelo'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/finanzas/almacen-supabase'
import { almacenDeMesa } from '@/lib/finanzas/conversa/almacen-supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { mesaEncendida } from '@/lib/planeacion/mesa/interruptor'
import { abrirMesa, avanzarMesa, devolverALaMesa, leerMesa, type PuertosDeMesa } from '@/lib/planeacion/mesa/orquestador'
import { checkInternalKey } from '@/lib/finanzas/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  if (!pideLatido(request)) return atender(request)
  return responderConLatido(() => atender(request), { mantenerVivo: waitUntil })
}

async function atender(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const db = getSupabaseAdmin() as unknown as Db
  const P: PuertosDeMesa = {
    almacen: almacenDeMesa(db),
    modelo: modeloRunSdk({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY, fetch, trabajo: trabajoDeLaLlamada(cuerpo, (nombre) => request.headers.get(nombre)).columnas, workflow_id: typeof c.workflow_id === 'string' ? c.workflow_id : undefined }),
    encendida: () => mesaEncendida(db),
    ahora: () => new Date(),
    turnoEnVuelo: async (clave, client_id, desde) => (typeof c.workflow_id === 'string' ? turnoEnVueloEnElCorredor(db, { workflow_id: c.workflow_id, client_id, clave, desde }, new Date()) : null),
    // #927 · la espera creciente antes de repetir un turno pasajero (a lo más 30 s: cabe de sobra en los 800 s de la ruta)
    esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  }
  try {
    if (c.accion === 'vivas') {
      const v = await db.from('estrategia_encargos').select('id,client_id,estado,actualizado_en').in('estado', ['abierto', 'en_curso'])
      if (v.error) return NextResponse.json({ error: 'mesa_error', detalle: v.error.message }, { status: 500 })
      return NextResponse.json({ vivas: (v.data as unknown[]).length, mesas: v.data })
    }
    const id = typeof c.encargo_id === 'string' ? c.encargo_id : ''
    const r = c.accion === 'abrir' ? await abrirMesa(P, c)
      : c.accion === 'avanzar' && id ? await avanzarMesa(P, id)
      : c.accion === 'leer' && id ? await leerMesa(P, id)
      : c.accion === 'devolver' && id ? await devolverALaMesa(P, id, c)
      : { status: 400, cuerpo: { error: 'accion_invalida', acciones: ['abrir', 'avanzar', 'leer', 'devolver', 'vivas'] } }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'mesa_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
