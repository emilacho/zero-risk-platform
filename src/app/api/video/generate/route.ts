/**
 * EL BRAZO DE VIDEO · `POST /api/video/generate` (enviar) y `GET /api/video/generate?request_id=…` (leer estado y, al terminar, copiar el MP4 a nuestro almacén).
 * Fase 2 del encargo `2026-10-31-ENCARGO-LENOVO-a-CC1-CC3-brazo-de-video-seedance.md` · parámetros aprobados en `src/lib/video/parametros.ts`.
 *
 * Orden del POST (nada se gasta antes del paso 4): 1 llave interna · 2 pedido válido dentro de lo aprobado · 3 ESTIMACIÓN gratis con la fórmula del proveedor
 * y TOPE por video (si pasa el tope: 409 sin gastar; si no se pudo estimar: 502 sin gastar — fallo cerrado) · 4 envío con `Idempotency-Key` (= `clave` del pedido:
 * repetir el mismo pedido devuelve el mismo `request_id`, no cobra dos veces) · 5 fila `running` en el libro con el costo reservado.
 * `dry_run: true` → nada sale a la red: devuelve el costo estimado con una respuesta simulada. El video se COBRA en el proveedor solo si termina `completed`.
 *
 * GET: lee el estado; en `completed` descarga el MP4 (el proveedor lo borra a los 7 días) y lo sube al bucket de la oficina (`OFICINA_BUCKET`, público, 20 MB),
 * cierra la fila del libro y devuelve `video_url` (la nuestra) + `url_proveedor` + `expires_at`. En `failed`/`nsfw`/`canceled` cierra con costo 0.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { sanitizeString } from '@/lib/validation'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { VARIABLE_DE_LA_LLAVE, costoEstimadoUsd, enviar, estado, estimar, ESTADOS_TERMINALES } from '@/lib/video/higgsfield'
import { TOPE_POR_VIDEO_USD, armarPedido, conDescuento, cuerpoParaHiggsfield, rutaDelModelo } from '@/lib/video/parametros'
import { cerrarEnElLibro, cierreDeFila, registrarEnvioEnElLibro, sessionIdDeVideo } from '@/lib/video/libro'
import { destinoPublico, REQUEST_ID_VALIDO } from '@/lib/video/destino'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** el bucket donde se copia el MP4 (el de la oficina, público): sin él la copia se omite y se devuelve solo la URL del proveedor, con aviso */
const bucket = () => sanitizeString(process.env.OFICINA_BUCKET, 100) || null
const LIMITE_DE_COPIA_BYTES = 20 * 1024 * 1024
const llave = () => process.env[VARIABLE_DE_LA_LLAVE] || ''

const json = (status: number, cuerpo: Record<string, unknown>) => NextResponse.json(cuerpo, { status })

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return json(401, { error: 'unauthorized', detail: auth.reason })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json(400, { error: 'invalid_json' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_json' })

  const armado = armarPedido(body)
  if (!armado.ok) return json(400, { error: 'pedido_invalido', errores: armado.errores })
  const pedido = armado.pedido
  const dryRun = body.dry_run === true
  const clientId = resolveClientIdFromBody(body)
  const agentSlug = sanitizeString(body.agent_slug as string | undefined, 60) || null
  const caller = sanitizeString(body.caller as string | undefined, 40) || 'api'
  // condición 2 de CC3 (31-oct): lo que gasta no corre sin contexto de flujo, y la clave idempotente la pone SIEMPRE el llamador
  // (`clave`, p. ej. `<encargo>:<fila>:v<n>`): un reintento con la misma clave devuelve el mismo pedido y no cobra dos veces; sin clave no se envía.
  const workflowId = sanitizeString(body.workflow_id as string | undefined, 120) || null
  const workflowExecutionId = sanitizeString(body.workflow_execution_id as string | undefined, 120) || null
  if (!workflowId || !workflowExecutionId) return json(400, { error: 'falta_contexto_de_flujo', detail: 'workflow_id y workflow_execution_id son obligatorios: el brazo solo corre dentro de un flujo' })
  const claveIdempotente = sanitizeString(body.clave as string | undefined, 200)
  if (!claveIdempotente) return json(400, { error: 'falta_clave', detail: 'clave (Idempotency-Key) es obligatoria: sin ella un reintento cobraría dos veces' })
  const tope = typeof body.tope_usd === 'number' && body.tope_usd > 0 ? Math.min(body.tope_usd, TOPE_POR_VIDEO_USD) : TOPE_POR_VIDEO_USD
  const ruta = rutaDelModelo(pedido)
  const cuerpo = cuerpoParaHiggsfield(pedido)
  const base = { ruta, modelo: pedido.modelo, segundos: pedido.segundos, resolucion: pedido.resolucion, relacion: pedido.relacion, audio: pedido.audio, fotos: pedido.fotos.length, tope_usd: tope, clave: claveIdempotente }

  const k = llave()
  if (!k) return json(500, { error: 'llave_no_configurada', detail: `${VARIABLE_DE_LA_LLAVE} no está en el entorno` })

  // 3 · estimación (gratis) y tope
  const est = await estimar(fetch, k, ruta, cuerpo)
  if (est.error && est.usd === undefined) return json(502, { error: 'no_se_pudo_estimar', detail: est.error, upstream_status: est.status, correlation_id: est.correlacion, ...base })
  const costoLista = est.usd !== undefined ? est.usd : costoEstimadoUsd(est.tarifas!, { resolucion: pedido.resolucion, relacion: pedido.relacion, segundos: pedido.segundos })
  if (costoLista === null) return json(502, { error: 'no_se_pudo_estimar', detail: 'fórmula sin tarifa para esta resolución', ...base })
  // el descuento vigente del proveedor (medido en la corrida real del 31-oct): lo que se compara con el tope y se reserva es lo que de verdad se cobra
  const desc = conDescuento(costoLista, pedido.modelo, Date.now())
  const costo = desc.usd
  const costos = { costo_estimado_usd: costo, costo_lista_usd: costoLista, descuento_pct: desc.pct }
  if (costo > tope) return json(409, { error: 'tope_por_video', detail: `el video costaría US$ ${costo.toFixed(4)} (lista US$ ${costoLista.toFixed(4)}) y el tope es US$ ${tope}`, ...costos, ...base })

  if (dryRun) return json(200, { ok: true, dry_run: true, request_id: `dry-${claveIdempotente}`, status: 'simulado', ...costos, ...base })

  // 4 · envío idempotente
  const env = await enviar(fetch, k, ruta, cuerpo, claveIdempotente)
  if (!env.ok) return json(env.status === 429 ? 429 : 502, { error: 'envio_fallido', detail: env.error, upstream_status: env.status, correlation_id: env.correlacion, ...base })

  // 5 · libro (costo reservado)
  const libro = await registrarEnvioEnElLibro(getSupabaseAdmin() as never, {
    requestId: env.pedido.request_id, clientId, agentSlug, modelo: pedido.modelo, ruta, segundos: pedido.segundos, resolucion: pedido.resolucion, relacion: pedido.relacion, conFotos: pedido.fotos.length,
    caller, costoEstimadoUsd: costo, startedAtMs: Date.now(), workflowId, workflowExecutionId, claveIdempotente, correlacion: env.pedido.correlacion,
  })
  return json(202, { ok: true, request_id: env.pedido.request_id, status: env.pedido.status, status_url: env.pedido.status_url, ...costos, libro: libro.ok ? (libro.existia ? 'ya_estaba' : 'anotado') : `no_anotado: ${libro.error}`, ...base })
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return json(401, { error: 'unauthorized', detail: auth.reason })
  const url = new URL(request.url)
  const requestId = sanitizeString(url.searchParams.get('request_id') ?? undefined, 120)
  if (!requestId) return json(400, { error: 'falta_request_id' })
  if (requestId.startsWith('dry-')) return json(200, { ok: true, request_id: requestId, status: 'simulado', dry_run: true })
  if (!REQUEST_ID_VALIDO.test(requestId)) return json(400, { error: 'request_id_invalido' })
  const k = llave()
  if (!k) return json(500, { error: 'llave_no_configurada' })
  // condición 1 de CC3 (31-oct): la dirección de estado se arma SIEMPRE aquí; nunca se acepta del llamador (la llave viajaría a donde él diga)
  const statusUrl = `https://api.higgsfield.ai/requests/${requestId}/status`

  const e = await estado(fetch, k, statusUrl)
  if (!e.ok) return json(502, { error: 'estado_fallido', detail: e.error, upstream_status: e.status, request_id: requestId })
  const s = e.estado
  if (!ESTADOS_TERMINALES.has(s.status)) return json(200, { ok: true, request_id: requestId, status: s.status, terminal: false })

  const db = getSupabaseAdmin()
  if (s.status !== 'completed') {
    await cerrarEnElLibro(db as never, requestId, cierreDeFila(s.status, { error: s.error, endedAtMs: Date.now() }))
    return json(200, { ok: true, request_id: requestId, status: s.status, terminal: true, cobrado: false, error: s.error })
  }

  // completado: copiar a nuestro almacén (el proveedor lo borra a los 7 días)
  let copia: { url: string | null; aviso: string | null } = { url: null, aviso: null }
  const b = bucket()
  if (!s.video_url) copia.aviso = 'completado sin video.url'
  else if (!b) copia.aviso = 'OFICINA_BUCKET no configurado: queda solo la URL del proveedor (vence en 7 días)'
  else copia = await copiarAlBucket(db, b, requestId, s.video_url)

  const fila = await db.from('agent_invocations').select('cost_usd, client_id').eq('session_id', sessionIdDeVideo(requestId)).limit(1)
  const costo = Array.isArray(fila.data) && fila.data[0] && typeof (fila.data[0] as { cost_usd?: number }).cost_usd === 'number' ? (fila.data[0] as { cost_usd: number }).cost_usd : null
  await cerrarEnElLibro(db as never, requestId, cierreDeFila('completed', { videoUrl: s.video_url, urlCopiada: copia.url, expiresAt: s.expires_at, costoUsd: costo, endedAtMs: Date.now() }))
  return json(200, { ok: true, request_id: requestId, status: 'completed', terminal: true, cobrado: true, costo_usd: costo, video_url: copia.url ?? s.video_url, url_proveedor: s.video_url, expires_at: s.expires_at, copia: copia.url ? 'bucket' : 'solo_proveedor', aviso: copia.aviso })
}

async function copiarAlBucket(db: ReturnType<typeof getSupabaseAdmin>, b: string, requestId: string, urlProveedor: string): Promise<{ url: string | null; aviso: string | null }> {
  // condición 1 de CC3: solo se descarga por https hacia anfitriones públicos (nunca IP privadas, metadatos de nube ni nombres internos)
  const rechazo = destinoPublico(urlProveedor)
  if (rechazo) return { url: null, aviso: `no se descarga: ${rechazo}` }
  try {
    const r = await fetch(urlProveedor)
    if (!r.ok) return { url: null, aviso: `descarga del proveedor falló (${r.status})` }
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length === 0) return { url: null, aviso: 'descarga vacía' }
    if (bytes.length > LIMITE_DE_COPIA_BYTES) return { url: null, aviso: `el MP4 pesa ${(bytes.length / 1048576).toFixed(1)} MB y el bucket admite 20 MB: queda solo la URL del proveedor` }
    const ruta = `videos/${requestId}.mp4`
    const up = await db.storage.from(b).upload(ruta, bytes, { contentType: 'video/mp4', upsert: true })
    if (up.error) return { url: null, aviso: `subida al bucket falló: ${up.error.message}` }
    return { url: db.storage.from(b).getPublicUrl(ruta).data.publicUrl, aviso: null }
  } catch (err) {
    return { url: null, aviso: `copia falló: ${err instanceof Error ? err.message : String(err)}` }
  }
}
