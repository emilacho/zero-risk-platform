/**
 * POST /api/tablero/{accion} · lo que Emilio maneja desde el dashboard (30-oct · contrato CC1→CC2).
 * Llave interna (`x-api-key`). Cuerpo: los campos de la acción + `reviewer` (quién firma) + `origen:"dashboard"`; las que gastan, además `confirmo_gasto:true` y `tope_usd`.
 * 200 `{ok:true,…}` · 409 `{detalle}` (regla de negocio) · 400 entrada inválida · 404 acción que todavía no existe (el tablero dice «todavía no está disponible»).
 * TODA acción conocida deja su fila en `eventos_de_emilio` (accion `tablero`), salga bien o mal.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { ACCIONES } from '@/lib/oficina/tablero/acciones'
import { cuerpoSeguro, rastroDelTablero } from '@/lib/oficina/tablero/comun'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request, ctx: { params: { accion: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const accion = ctx.params.accion
  const manejador = Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? ACCIONES[accion] : undefined
  if (!manejador) return NextResponse.json({ ok: false, error: 'accion_no_disponible', detalle: `la acción «${accion}» todavía no está disponible` }, { status: 404 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json', detalle: 'el cuerpo no es JSON' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ ok: false, error: 'entrada_invalida', detalle: 'el cuerpo debe ser un objeto' }, { status: 400 })
  const reviewer = cuerpo.reviewer === undefined ? 'emilio' : cuerpo.reviewer
  if (typeof reviewer !== 'string' || !reviewer.trim() || reviewer.length > 80) return NextResponse.json({ ok: false, error: 'entrada_invalida', detalle: '`reviewer` debe ser un texto corto' }, { status: 400 })
  try {
    const { P, db } = puertosReales(request)
    const ahora = () => new Date()
    const s = await manejador({ db, puertos: () => P, ahora }, { cuerpo, reviewer: reviewer.trim() })
    await rastroDelTablero(db, { accion, autor: reviewer.trim(), toca: s.toca, resultado: { status: s.status, ...s.cuerpo }, crudo: cuerpoSeguro(cuerpo), ahora: ahora() })
    let salida = s.cuerpo
    if (s.despertar && s.status === 200) {
      const { encargo_id, turno } = s.despertar
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, encargo_id, turno)
      salida = { ...salida, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }
    }
    return NextResponse.json(salida, { status: s.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'tablero_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
