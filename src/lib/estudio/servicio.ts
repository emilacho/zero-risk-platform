/**
 * EL ESTUDIO DE LA CÁMARA · servicio (cotizar · crear · avanzar · listar). Todo con dependencias inyectadas: las rutas solo pasan la base, `fetch` y las llaves.
 *
 * Reglas:
 *  · las llaves viven solo en el servidor; el navegador habla con nuestras rutas y nunca ve una dirección del proveedor con llave.
 *  · cada pieza pertenece a un cliente que existe; sin cliente no se crea.
 *  · `clave` del clic = idempotencia: la misma clave devuelve la misma pieza (índice único) y no cobra dos veces.
 *  · SIN tope ni freno de gasto (firma de Emilio 05-nov). El costo se cotiza antes; el real se anota en `costs` (una fila por proveedor y pieza,
 *    `amount_usd` a centavos + `amount_usd_exact`) y en la pieza (`costo_usd`). Un fallo del proveedor anota 0.
 *  · los archivos van al almacén de la oficina (`OFICINA_BUCKET`), carpeta `estudio/<client_id>/`. Nunca al de la web del cliente.
 *  · imagen: en el momento (≈ 20-60 s). Video y 3D: se encargan y la pantalla pregunta con `avanzar` cada pocos segundos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { costForImage } from '@/lib/image-pricing'
import { sniffImageFormat } from '@/lib/image-response'
import { destinoPublico, REQUEST_ID_VALIDO } from '@/lib/video/destino'
import { conDescuento } from '@/lib/video/parametros'
import { costoEstimadoUsd, enviar as enviarAHiggsfield, estado as estadoEnHiggsfield, estimar, ESTADOS_TERMINALES } from '@/lib/video/higgsfield'
import { ANIMAR, archivoDe3D, clipsDeAnimacion, cotizarAnimacion, cotizarSinRed, entradaDe3D, entradaDeAnimacion, miniaturaDe3D, modeloDe3D, motivoDeAnimacion, promptDeImagenPara3D, TAMANO_POR_FORMATO, UUID, type Cotizacion, type Pedido, type PedidoDeAnimacion } from './catalogo'
import { BIBLIOTECA_DE_MOVIMIENTOS } from './movimientos'
import { enviarAFal, estadoEnFal, resultadoDeFal } from './fal'
import { crearImagen } from './openai-imagen'

type Fetch = typeof fetch
export interface Deps {
  db: SupabaseClient
  fetch: Fetch
  llaves: { openai: string; higgsfield: string; fal: string }
  bucket: string | null
  modeloDeImagen: string
  ahora: () => number
}

export const TABLA = 'estudio_piezas'
/** el almacén de la oficina admite 20 MB por archivo */
export const TOPE_DEL_ARCHIVO_BYTES = 20 * 1024 * 1024
const COLUMNAS = 'id, client_id, tipo, estado, paso, prompt, modelo, parametros, foto_partida_url, costo_estimado_usd, costo_usd, archivo_url, archivo_tipo, miniatura_url, aviso, error, creado_en, terminado_en'

export interface Pieza {
  id: string; client_id: string; tipo: string; estado: 'creando' | 'lista' | 'fallida'; paso: string | null; prompt: string; modelo: string
  parametros: Record<string, unknown>; foto_partida_url: string | null; costo_estimado_usd: number; costo_usd: number
  archivo_url: string | null; archivo_tipo: string | null; miniatura_url: string | null; aviso: string | null; error: string | null; creado_en: string; terminado_en: string | null
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; error: string; detalle?: string }
const falla = (status: number, error: string, detalle?: string): { ok: false; status: number; error: string; detalle?: string } => ({ ok: false, status, error, ...(detalle ? { detalle } : {}) })

const PROVEEDOR = { imagen: 'openai', video: 'higgsfield', '3d': 'fal' } as const

// ── cotizar ───────────────────────────────────────────────────────────────
function rutaDeVideo(p: Pedido, conFoto: boolean) { return `${p.modelo}/${conFoto ? 'reference-to-video' : 'text-to-video'}` }
function cuerpoDeVideo(p: Pedido, fotoUrl: string | null): Record<string, unknown> {
  return { prompt: p.prompt, duration: p.segundos, resolution: p.resolucion, aspect_ratio: p.formato, generate_audio: p.audio, ...(fotoUrl ? { image_urls: [fotoUrl] } : {}) }
}

export async function cotizar(d: Deps, p: Pedido): Promise<Resultado<Cotizacion>> {
  const sinRed = cotizarSinRed(p)
  if (sinRed) return { ok: true, valor: sinRed }
  // video: la estimación del proveedor (gratis, no crea pedido). Sin cifra no se crea: el dueño ve el costo antes, siempre.
  if (!d.llaves.higgsfield) return falla(500, 'llave_no_configurada', 'falta la llave de Higgsfield')
  const conFoto = p.foto !== null
  // para cotizar alcanza una dirección de ejemplo: el precio depende de duración, resolución y cuadro, no de la foto
  const est = await estimar(d.fetch, d.llaves.higgsfield, rutaDeVideo(p, conFoto), cuerpoDeVideo(p, conFoto ? 'https://example.com/partida.png' : null))
  const lista = est.usd !== undefined ? est.usd : est.tarifas ? costoEstimadoUsd(est.tarifas, { resolucion: p.resolucion, relacion: p.formato, segundos: p.segundos }) : null
  if (lista === null) return falla(502, 'no_se_pudo_cotizar', est.error ?? 'el proveedor no dio precio')
  const usd = conDescuento(lista, p.modelo, d.ahora()).usd
  return { ok: true, valor: { total_usd: usd, partes: [{ que: `video · ${p.segundos} s · ${p.resolucion}`, usd }] } }
}

// ── archivos ──────────────────────────────────────────────────────────────
async function subir(d: Deps, ruta: string, bytes: Buffer, tipo: string): Promise<Resultado<string>> {
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')
  const up = await d.db.storage.from(d.bucket).upload(ruta, bytes, { contentType: tipo, upsert: true })
  if (up.error) return falla(502, 'subida_fallida', up.error.message)
  return { ok: true, valor: d.db.storage.from(d.bucket).getPublicUrl(ruta).data.publicUrl }
}

/** baja un archivo del proveedor (solo https público, con tope) */
async function bajar(d: Deps, url: string, tope: number): Promise<Resultado<Buffer>> {
  const rechazo = destinoPublico(url)
  if (rechazo) return falla(502, 'descarga_rechazada', rechazo)
  try {
    const r = await d.fetch(url)
    if (!r.ok) return falla(502, 'descarga_fallida', `el proveedor respondió ${r.status}`)
    const largo = Number(r.headers.get('content-length') ?? 0)
    if (largo > tope) return falla(413, 'archivo_muy_grande', `${(largo / 1048576).toFixed(1)} MB`)
    const b = Buffer.from(await r.arrayBuffer())
    if (!b.length) return falla(502, 'descarga_vacia')
    if (b.length > tope) return falla(413, 'archivo_muy_grande', `${(b.length / 1048576).toFixed(1)} MB`)
    return { ok: true, valor: b }
  } catch (e) {
    return falla(502, 'descarga_fallida', e instanceof Error ? e.message : String(e))
  }
}

// ── libro ─────────────────────────────────────────────────────────────────
/** una fila del libro de costos por parte cobrada; nunca lanza (la pieza ya existe): un fallo queda en la pieza como aviso */
export async function anotarCosto(d: Deps, x: { piezaId: string; clientId: string; proveedor: string; modelo: string; parte: string; usd: number; base: string }): Promise<string | null> {
  try {
    const fecha = new Date(d.ahora()).toISOString().slice(0, 10)
    const { error } = await d.db.from('costs').insert({
      category: 'api_call', service: `estudio:${x.proveedor}`, amount_usd: Math.round(x.usd * 100) / 100, amount_usd_exact: Math.round(x.usd * 1e6) / 1e6, date: fecha,
      description: JSON.stringify({ tipo: 'pieza_del_estudio', pieza_id: x.piezaId, client_id: x.clientId, modelo: x.modelo, parte: x.parte, base_del_costo: x.base }),
    })
    return error ? `el costo no entró al libro: ${error.message}` : null
  } catch (e) {
    return `el costo no entró al libro: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ── crear ─────────────────────────────────────────────────────────────────
async function porClave(d: Deps, clave: string): Promise<Pieza | null> {
  const r = await d.db.from(TABLA).select(COLUMNAS).eq('clave', clave).limit(1)
  if (r.error) throw new Error(r.error.message)
  return (r.data?.[0] as Pieza | undefined) ?? null
}
export async function leerPieza(d: Deps, id: string): Promise<Pieza | null> {
  const r = await d.db.from(TABLA).select(COLUMNAS).eq('id', id).limit(1)
  if (r.error) throw new Error(r.error.message)
  return (r.data?.[0] as Pieza | undefined) ?? null
}
async function actualizar(d: Deps, id: string, cambios: Record<string, unknown>, soloSiCreando = false): Promise<Pieza | null> {
  let q = d.db.from(TABLA).update({ ...cambios, actualizado_en: new Date(d.ahora()).toISOString() }).eq('id', id)
  if (soloSiCreando) q = q.eq('estado', 'creando')
  const r = await q.select(COLUMNAS)
  if (r.error) throw new Error(r.error.message)
  return (r.data?.[0] as Pieza | undefined) ?? null
}
async function fallar(d: Deps, id: string, error: string, costoUsd = 0) {
  return actualizar(d, id, { estado: 'fallida', error: error.slice(0, 500), costo_usd: costoUsd, terminado_en: new Date(d.ahora()).toISOString() }, true)
}

/** la foto de partida: subida (se guarda en el almacén) o una imagen ya creada del mismo cliente */
async function resolverFoto(d: Deps, p: Pedido): Promise<Resultado<{ url: string; bytes: Buffer; tipo: string } | null>> {
  if (!p.foto) return { ok: true, valor: null }
  if (p.foto.tipo === 'subida') {
    const bytes = Buffer.from(p.foto.b64, 'base64')
    const fmt = sniffImageFormat(bytes)
    // sniff devuelve png por omisión: se exige la firma real de una imagen
    const esImagen = bytes.length > 12 && (bytes[0] === 0x89 || (bytes[0] === 0xff && bytes[1] === 0xd8) || bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    if (!esImagen) return falla(400, 'foto_invalida', 'la foto de partida debe ser png, jpg o webp')
    const up = await subir(d, `estudio/${p.client_id}/partidas/${p.clave}.${fmt.ext}`, bytes, fmt.contentType)
    if (!up.ok) return up
    return { ok: true, valor: { url: up.valor, bytes, tipo: fmt.contentType } }
  }
  const origen = await leerPieza(d, p.foto.pieza_id)
  if (!origen || origen.client_id !== p.client_id || origen.tipo !== 'imagen' || origen.estado !== 'lista' || !origen.archivo_url) return falla(400, 'foto_invalida', 'la imagen de partida debe ser una imagen lista de este mismo cliente')
  const b = await bajar(d, origen.archivo_url, TOPE_DEL_ARCHIVO_BYTES)
  if (!b.ok) return b
  return { ok: true, valor: { url: origen.archivo_url, bytes: b.valor, tipo: sniffImageFormat(b.valor).contentType } }
}

/** crea la imagen con OpenAI, la guarda y anota su costo. Devuelve dirección, costo y aviso del libro */
// un fallo dice cuánto quedó cobrado (lo mismo que se anotó en el libro), para que la pieza y el libro digan la misma cifra
type FallaCobrada = ReturnType<typeof falla> & { cobrado_usd: number }
async function imagenGuardada(d: Deps, x: { piezaId: string; clientId: string; prompt: string; formato: string; foto: { bytes: Buffer; tipo: string } | null; ruta: string; parte: string }): Promise<{ ok: true; valor: { url: string; usd: number; aviso: string | null } } | FallaCobrada> {
  const tamano = TAMANO_POR_FORMATO[x.formato] ?? '1024x1024'
  const img = await crearImagen(d.fetch, d.llaves.openai, { prompt: x.prompt, modelo: d.modeloDeImagen, tamano, foto: x.foto })
  if (!img.ok) return { ...falla(502, 'imagen_fallida', `OpenAI ${img.status} · ${img.error}`), cobrado_usd: 0 }
  const costo = costForImage({ model: d.modeloDeImagen, size: tamano, usage: img.usage })
  const fmt = sniffImageFormat(img.bytes)
  // el cobro ya ocurrió: se anota antes de intentar guardar el archivo
  const aviso = await anotarCosto(d, { piezaId: x.piezaId, clientId: x.clientId, proveedor: 'openai', modelo: d.modeloDeImagen, parte: x.parte, usd: costo.cost_usd, base: costo.basis })
  const up = await subir(d, `${x.ruta}.${fmt.ext}`, img.bytes, fmt.contentType)
  if (!up.ok) return { ok: false, status: up.status, error: up.error, detalle: `imagen cobrada (US$ ${costo.cost_usd}) pero no guardada: ${up.detalle ?? ''}`, cobrado_usd: costo.cost_usd }
  return { ok: true, valor: { url: up.valor, usd: costo.cost_usd, aviso } }
}

export async function crear(d: Deps, p: Pedido): Promise<Resultado<{ pieza: Pieza; ya_existia: boolean }>> {
  const previa = await porClave(d, p.clave)
  if (previa) return { ok: true, valor: { pieza: previa, ya_existia: true } }
  const cli = await d.db.from('clients').select('id').eq('id', p.client_id).limit(1)
  if (cli.error) return falla(500, 'base_fallida', cli.error.message)
  if (!cli.data?.length) return falla(404, 'cliente_no_existe')
  const prov = PROVEEDOR[p.tipo]
  if (!d.llaves[prov === 'openai' ? 'openai' : prov]) return falla(500, 'llave_no_configurada', `falta la llave de ${prov}`)
  if (p.tipo === '3d' && !p.foto && !d.llaves.openai) return falla(500, 'llave_no_configurada', 'falta la llave de OpenAI para la imagen previa')
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')

  const cot = await cotizar(d, p)
  if (!cot.ok) return cot
  const foto = await resolverFoto(d, p)
  if (!foto.ok) return foto

  const ins = await d.db.from(TABLA).insert({
    client_id: p.client_id, tipo: p.tipo, estado: 'creando', paso: p.tipo === '3d' && !foto.valor ? 'imagen' : p.tipo, prompt: p.prompt, modelo: p.modelo, clave: p.clave,
    parametros: { formato: p.formato, calidad: p.calidad, segundos: p.segundos || null, resolucion: p.resolucion || null, audio: p.tipo === 'video' ? p.audio : null, cotizacion: cot.valor },
    foto_partida_url: foto.valor?.url ?? null, costo_estimado_usd: cot.valor.total_usd, costo_usd: 0,
  }).select(COLUMNAS)
  if (ins.error) {
    // dos clics con la misma clave a la vez: gana uno; el otro devuelve esa pieza
    const otra = await porClave(d, p.clave)
    if (otra) return { ok: true, valor: { pieza: otra, ya_existia: true } }
    return falla(500, 'base_fallida', ins.error.message)
  }
  const pieza = ins.data[0] as Pieza
  const base = `estudio/${p.client_id}/${pieza.id}`

  if (p.tipo === 'imagen') {
    const r = await imagenGuardada(d, { piezaId: pieza.id, clientId: p.client_id, prompt: p.prompt, formato: p.formato, foto: foto.valor, ruta: base, parte: 'imagen' })
    if (!r.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `${r.error}${r.detalle ? ` · ${r.detalle}` : ''}`, r.cobrado_usd)) ?? pieza, ya_existia: false } }
    const fin = await actualizar(d, pieza.id, { estado: 'lista', paso: null, costo_usd: r.valor.usd, archivo_url: r.valor.url, archivo_tipo: 'image', miniatura_url: r.valor.url, aviso: r.valor.aviso, terminado_en: new Date(d.ahora()).toISOString() }, true)
    return { ok: true, valor: { pieza: fin ?? pieza, ya_existia: false } }
  }

  if (p.tipo === 'video') {
    const conFoto = foto.valor !== null
    const env = await enviarAHiggsfield(d.fetch, d.llaves.higgsfield, rutaDeVideo(p, conFoto), cuerpoDeVideo(p, foto.valor?.url ?? null), `estudio-${p.clave}`)
    if (!env.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `Higgsfield ${env.status} · ${env.error}`)) ?? pieza, ya_existia: false } }
    const fin = await actualizar(d, pieza.id, { paso: 'video', proveedor_request_id: env.pedido.request_id }, true)
    return { ok: true, valor: { pieza: fin ?? pieza, ya_existia: false } }
  }

  // 3D: la imagen primero (si no hay foto), después la conversión en fal
  const m = modeloDe3D(p.modelo)!
  let urlDeImagen = foto.valor?.url ?? null
  let gastado = 0
  let aviso: string | null = null
  if (!urlDeImagen) {
    const r = await imagenGuardada(d, { piezaId: pieza.id, clientId: p.client_id, prompt: promptDeImagenPara3D(p.prompt), formato: '1:1', foto: null, ruta: `${base}-partida`, parte: 'imagen previa al 3D' })
    if (!r.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `${r.error}${r.detalle ? ` · ${r.detalle}` : ''}`, r.cobrado_usd)) ?? pieza, ya_existia: false } }
    urlDeImagen = r.valor.url
    gastado = r.valor.usd
    aviso = r.valor.aviso
    await actualizar(d, pieza.id, { foto_partida_url: urlDeImagen, costo_usd: gastado, aviso }, true)
  }
  const env = await enviarAFal(d.fetch, d.llaves.fal, m.endpoint, entradaDe3D(m, p.calidad, urlDeImagen))
  if (!env.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `fal ${env.status} · ${env.error}`, gastado)) ?? pieza, ya_existia: false } }
  const fin = await actualizar(d, pieza.id, { paso: '3d', proveedor_request_id: env.envio.request_id, proveedor_status_url: env.envio.status_url, proveedor_response_url: env.envio.response_url }, true)
  return { ok: true, valor: { pieza: fin ?? pieza, ya_existia: false } }
}

// ── avanzar (la pantalla pregunta) ────────────────────────────────────────
/** cuánto puede vivir una pieza «creando» antes de vencer (muy por encima de lo normal: 5 min imagen, 20 video y 3D) */
export const TOPE_DE_VIDA_MIN: Record<Pieza['tipo'], number> = { imagen: 60, video: 180, '3d': 180 }
/** respuestas del proveedor que dicen «ese pedido no existe» */
const PROVEEDOR_NO_LA_RECONOCE = new Set([404, 410])
export const vencioLaPieza = (p: Pick<Pieza, 'tipo' | 'creado_en'>, ahoraMs: number) => {
  const desde = Date.parse(p.creado_en)
  return Number.isFinite(desde) && ahoraMs - desde > TOPE_DE_VIDA_MIN[p.tipo] * 60_000
}

export async function avanzar(d: Deps, id: string): Promise<Resultado<Pieza>> {
  if (!UUID.test(id)) return falla(400, 'id_invalido')
  const r = await d.db.from(TABLA).select(`${COLUMNAS}, proveedor_request_id, proveedor_status_url, proveedor_response_url`).eq('id', id).limit(1)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  const fila = r.data?.[0] as (Pieza & { proveedor_request_id: string | null; proveedor_status_url: string | null; proveedor_response_url: string | null }) | undefined
  if (!fila) return falla(404, 'pieza_no_existe')
  const { proveedor_request_id: reqId, proveedor_status_url: statusUrl, proveedor_response_url: responseUrl, ...pieza } = fila
  if (pieza.estado !== 'creando') return { ok: true, valor: pieza }
  // pasado el tope de vida, una pieza que nunca llegó al proveedor, o que el proveedor ya no reconoce, vence (con lo ya gastado).
  // Si el proveedor dice «en curso» se sigue preguntando: puede terminar y cobrar, y ese cobro no se pierde.
  const vencida = vencioLaPieza(pieza, d.ahora())
  const vencer = async (motivo: string) => ({ ok: true as const, valor: (await fallar(d, id, `Venció: ${motivo} en ${TOPE_DE_VIDA_MIN[pieza.tipo]} min. No se registró ningún cobro más.`, Number(pieza.costo_usd) || 0)) ?? (await leerPieza(d, id)) ?? pieza })
  if (!reqId) return vencida ? vencer('no llegó al proveedor') : { ok: true, valor: pieza }
  const ahoraIso = () => new Date(d.ahora()).toISOString()

  if (pieza.tipo === 'video') {
    if (!REQUEST_ID_VALIDO.test(reqId)) return falla(500, 'pedido_invalido')
    // la dirección de estado se arma aquí, nunca se guarda ni se acepta de afuera (la llave viajaría a donde diga)
    const e = await estadoEnHiggsfield(d.fetch, d.llaves.higgsfield, `https://api.higgsfield.ai/requests/${reqId}/status`)
    if (!e.ok) return vencida && PROVEEDOR_NO_LA_RECONOCE.has(e.status) ? vencer('el proveedor ya no reconoce el pedido') : { ok: true, valor: pieza }
    if (!ESTADOS_TERMINALES.has(e.estado.status)) return { ok: true, valor: pieza }
    if (e.estado.status !== 'completed') return { ok: true, valor: (await fallar(d, id, `${e.estado.status}${e.estado.error ? ` · ${e.estado.error}` : ''}`)) ?? (await leerPieza(d, id)) ?? pieza }
    return cerrar(d, pieza, { urlProveedor: e.estado.video_url, ruta: `estudio/${pieza.client_id}/${id}.mp4`, tipo: 'video/mp4', archivoTipo: 'video', miniatura: pieza.foto_partida_url, proveedor: 'higgsfield', usd: Number(pieza.costo_estimado_usd), base: 'estimate_formula', ahoraIso })
  }

  // 3D
  if (!statusUrl || !responseUrl) return falla(500, 'pedido_sin_direcciones')
  const e = await estadoEnFal(d.fetch, d.llaves.fal, statusUrl)
  if (!e.ok) return vencida && PROVEEDOR_NO_LA_RECONOCE.has(e.status) ? vencer('el proveedor ya no reconoce el pedido') : { ok: true, valor: pieza }
  if (e.e.estado === 'en_cola' || e.e.estado === 'en_curso') return { ok: true, valor: pieza }
  const yaGastado = Number(pieza.costo_usd) || 0
  const esAnimacion = pieza.modelo === ANIMAR.id
  // un fallo anota 0; el motivo de una animación se dice por su causa real (demasiado detalle, no es figura humana) o en simple si no se reconoce
  const motivo = (t: string) => (esAnimacion ? motivoDeAnimacion(t) : t)
  if (e.e.estado === 'fallido') return { ok: true, valor: (await fallar(d, id, motivo(`fal · ${e.e.error}`), yaGastado)) ?? pieza }
  const res = await resultadoDeFal(d.fetch, d.llaves.fal, responseUrl)
  if (!res.ok) return { ok: true, valor: (await fallar(d, id, motivo(`fal ${res.status} · ${res.error}`), yaGastado)) ?? pieza }
  if (esAnimacion) return cerrarAnimacion(d, pieza, res.salida, ahoraIso)
  const archivo = archivoDe3D(res.salida)
  const m = modeloDe3D(pieza.modelo)
  const calidad = (pieza.parametros?.calidad === 'alta' ? 'alta' : 'normal') as 'normal' | 'alta'
  const precio = m ? m.precio[calidad] : Number(pieza.costo_estimado_usd)
  if (!archivo) {
    // fal terminó (y cobra) sin archivo: la pieza suma su precio y el libro anota esa misma fila; solo quien la marca fallida anota
    const f = await fallar(d, id, 'fal terminó sin archivo 3D', yaGastado + precio)
    if (!f) return { ok: true, valor: (await leerPieza(d, id)) ?? pieza }
    const avisoLibro = await anotarCosto(d, { piezaId: id, clientId: pieza.client_id, proveedor: 'fal', modelo: pieza.modelo, parte: pieza.tipo, usd: precio, base: 'lista_publicada' })
    return { ok: true, valor: avisoLibro ? ((await actualizar(d, id, { aviso: [f.aviso, avisoLibro].filter(Boolean).join(' · ') })) ?? f) : f }
  }
  const ext = archivo.tipo === 'model/obj' ? 'obj' : archivo.tipo.includes('gltf') || (archivo.nombre ?? archivo.url).toLowerCase().includes('.glb') ? 'glb' : 'bin'
  return cerrar(d, pieza, { urlProveedor: archivo.url, ruta: `estudio/${pieza.client_id}/${id}.${ext}`, tipo: ext === 'glb' ? 'model/gltf-binary' : archivo.tipo, archivoTipo: ext === 'glb' ? 'glb' : ext, miniatura: miniaturaDe3D(res.salida) ?? pieza.foto_partida_url, proveedor: 'fal', usd: precio, base: 'lista_publicada', previo: yaGastado, ahoraIso })
}

/** copia el archivo al almacén, cierra la pieza (solo una vez) y anota el costo del proveedor */
async function cerrar(d: Deps, pieza: Pieza, x: { urlProveedor: string | null; ruta: string; tipo: string; archivoTipo: string; miniatura: string | null; proveedor: string; usd: number; base: string; previo?: number; ahoraIso: () => string }): Promise<Resultado<Pieza>> {
  let url: string | null = null
  let aviso: string | null = null
  if (!x.urlProveedor) aviso = 'el proveedor terminó sin dirección del archivo'
  else {
    const b = await bajar(d, x.urlProveedor, TOPE_DEL_ARCHIVO_BYTES)
    if (!b.ok) { url = x.urlProveedor; aviso = `queda solo en el proveedor (vence en días): ${b.error}${b.detalle ? ` · ${b.detalle}` : ''}` }
    else {
      const up = await subir(d, x.ruta, b.valor, x.tipo)
      if (up.ok) url = up.valor
      else { url = x.urlProveedor; aviso = `queda solo en el proveedor (vence en días): ${up.detalle ?? up.error}` }
    }
  }
  // la miniatura de fal también vence: si es suya y no la podemos guardar, se usa la imagen de partida
  const total = +((x.previo ?? 0) + x.usd).toFixed(6)
  const cerrada = await actualizar(d, pieza.id, { estado: 'lista', paso: null, costo_usd: total, archivo_url: url, archivo_tipo: x.archivoTipo, miniatura_url: x.miniatura && x.miniatura.startsWith('https://') && !/fal\.media/.test(x.miniatura) ? x.miniatura : pieza.foto_partida_url, aviso: [pieza.aviso, aviso].filter(Boolean).join(' · ') || null, terminado_en: x.ahoraIso() }, true)
  // otra pregunta simultánea ya la cerró: no se anota dos veces
  if (!cerrada) return { ok: true, valor: (await leerPieza(d, pieza.id)) ?? pieza }
  const avisoLibro = await anotarCosto(d, { piezaId: pieza.id, clientId: pieza.client_id, proveedor: x.proveedor, modelo: pieza.modelo, parte: pieza.tipo, usd: x.usd, base: x.base })
  if (avisoLibro) return { ok: true, valor: (await actualizar(d, pieza.id, { aviso: [cerrada.aviso, avisoLibro].filter(Boolean).join(' · ') })) ?? cerrada }
  return { ok: true, valor: cerrada }
}

// ── animar ────────────────────────────────────────────────────────────────
export const movimientoExiste = (id: number) => BIBLIOTECA_DE_MOVIMIENTOS.some((m) => m[0] === id)
const nombreDelMovimiento = (id: number) => BIBLIOTECA_DE_MOVIMIENTOS.find((m) => m[0] === id)?.[1] ?? String(id)

/** el modelo que se anima: un 3D GLB listo, del mismo cliente, que no sea ya una animación */
async function modeloParaAnimar(d: Deps, p: PedidoDeAnimacion): Promise<Resultado<Pieza>> {
  const o = await leerPieza(d, p.origen_pieza_id)
  if (!o || o.client_id !== p.client_id) return falla(404, 'modelo_no_existe', 'el modelo a animar no existe para este cliente')
  if (o.tipo !== '3d' || o.estado !== 'lista' || o.archivo_tipo !== 'glb' || !o.archivo_url) return falla(400, 'modelo_no_animable', 'solo se anima un modelo 3D listo, en GLB')
  if (o.modelo === ANIMAR.id) return falla(400, 'modelo_no_animable', 'esta pieza ya es una animación: anima el modelo original')
  const rechazo = destinoPublico(o.archivo_url)
  if (rechazo) return falla(400, 'modelo_no_animable', `el archivo del modelo no es público: ${rechazo}`)
  return { ok: true, valor: o }
}

export async function cotizarLaAnimacion(d: Deps, p: PedidoDeAnimacion): Promise<Resultado<Cotizacion>> {
  const o = await modeloParaAnimar(d, p)
  if (!o.ok) return o
  return { ok: true, valor: cotizarAnimacion(p.movimientos.length) }
}

export async function crearAnimacion(d: Deps, p: PedidoDeAnimacion): Promise<Resultado<{ pieza: Pieza; ya_existia: boolean }>> {
  const previa = await porClave(d, p.clave)
  if (previa) return { ok: true, valor: { pieza: previa, ya_existia: true } }
  if (!d.llaves.fal) return falla(500, 'llave_no_configurada', 'falta la llave de fal')
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')
  const o = await modeloParaAnimar(d, p)
  if (!o.ok) return o
  const cot = cotizarAnimacion(p.movimientos.length)
  const nombres = p.movimientos.map(nombreDelMovimiento)
  const ins = await d.db.from(TABLA).insert({
    client_id: p.client_id, tipo: '3d', estado: 'creando', paso: '3d', prompt: `${o.valor.prompt || 'modelo 3D'} · animado: ${nombres.join(', ')}`.slice(0, 4000), modelo: ANIMAR.id, clave: p.clave,
    parametros: { origen_pieza_id: o.valor.id, movimientos: p.movimientos, altura_m: ANIMAR.altura_m, cotizacion: cot },
    foto_partida_url: o.valor.miniatura_url ?? o.valor.foto_partida_url, costo_estimado_usd: cot.total_usd, costo_usd: 0,
  }).select(COLUMNAS)
  if (ins.error) {
    const otra = await porClave(d, p.clave)
    if (otra) return { ok: true, valor: { pieza: otra, ya_existia: true } }
    return falla(500, 'base_fallida', ins.error.message)
  }
  const pieza = ins.data[0] as Pieza
  const env = await enviarAFal(d.fetch, d.llaves.fal, ANIMAR.endpoint, entradaDeAnimacion(o.valor.archivo_url!, p.movimientos))
  if (!env.ok) {
    const t = `fal ${env.status} · ${env.error}`
    return { ok: true, valor: { pieza: (await fallar(d, pieza.id, motivoDeAnimacion(t))) ?? pieza, ya_existia: false } }
  }
  const fin = await actualizar(d, pieza.id, { proveedor_request_id: env.envio.request_id, proveedor_status_url: env.envio.status_url, proveedor_response_url: env.envio.response_url }, true)
  return { ok: true, valor: { pieza: fin ?? pieza, ya_existia: false } }
}

/** copia un archivo del proveedor al almacén; si no se puede, queda la dirección del proveedor con aviso */
async function copiar(d: Deps, urlProveedor: string, ruta: string, tipo: string): Promise<{ url: string; aviso: string | null }> {
  const b = await bajar(d, urlProveedor, TOPE_DEL_ARCHIVO_BYTES)
  if (!b.ok) return { url: urlProveedor, aviso: `queda solo en el proveedor (vence en días): ${b.error}${b.detalle ? ` · ${b.detalle}` : ''}` }
  const up = await subir(d, ruta, b.valor, tipo)
  return up.ok ? { url: up.valor, aviso: null } : { url: urlProveedor, aviso: `queda solo en el proveedor (vence en días): ${up.detalle ?? up.error}` }
}

/** la animación terminó: guarda cada clip (GLB y FBX), cierra la pieza una sola vez y anota lo cobrado */
async function cerrarAnimacion(d: Deps, pieza: Pieza, salida: Record<string, unknown>, ahoraIso: () => string): Promise<Resultado<Pieza>> {
  const precio = Number(pieza.costo_estimado_usd)
  const clips = clipsDeAnimacion(salida)
  if (!clips.length) {
    // fal terminó (y cobra) sin clips: misma regla que el 3D sin archivo
    const f = await fallar(d, pieza.id, 'fal terminó sin ningún movimiento', precio)
    if (!f) return { ok: true, valor: (await leerPieza(d, pieza.id)) ?? pieza }
    const avisoLibro = await anotarCosto(d, { piezaId: pieza.id, clientId: pieza.client_id, proveedor: 'fal', modelo: pieza.modelo, parte: 'animación', usd: precio, base: 'lista_publicada' })
    return { ok: true, valor: avisoLibro ? ((await actualizar(d, pieza.id, { aviso: [f.aviso, avisoLibro].filter(Boolean).join(' · ') })) ?? f) : f }
  }
  const avisos: string[] = []
  const archivos: Array<{ action_id: number; nombre: string; glb: string | null; fbx: string | null }> = []
  for (const c of clips) {
    const base = `estudio/${pieza.client_id}/${pieza.id}-${c.action_id}`
    const glb = c.glb ? await copiar(d, c.glb, `${base}.glb`, 'model/gltf-binary') : null
    const fbx = c.fbx ? await copiar(d, c.fbx, `${base}.fbx`, 'application/octet-stream') : null
    for (const a of [glb?.aviso, fbx?.aviso]) if (a) avisos.push(a)
    archivos.push({ action_id: c.action_id, nombre: nombreDelMovimiento(c.action_id), glb: glb?.url ?? null, fbx: fbx?.url ?? null })
  }
  const pedidos = Array.isArray(pieza.parametros?.movimientos) ? (pieza.parametros.movimientos as number[]) : []
  const faltan = pedidos.filter((m) => !clips.some((c) => c.action_id === m))
  if (faltan.length) avisos.push(`el proveedor no devolvió: ${faltan.map(nombreDelMovimiento).join(', ')}`)
  const principal = archivos.find((a) => a.glb) ?? archivos[0]
  const cerrada = await actualizar(d, pieza.id, {
    estado: 'lista', paso: null, costo_usd: +(precio + (Number(pieza.costo_usd) || 0)).toFixed(6),
    archivo_url: principal.glb ?? principal.fbx, archivo_tipo: principal.glb ? 'glb' : 'fbx', miniatura_url: pieza.foto_partida_url,
    parametros: { ...pieza.parametros, archivos }, aviso: [pieza.aviso, ...new Set(avisos)].filter(Boolean).join(' · ') || null, terminado_en: ahoraIso(),
  }, true)
  // otra pregunta simultánea ya la cerró: no se anota dos veces
  if (!cerrada) return { ok: true, valor: (await leerPieza(d, pieza.id)) ?? pieza }
  const avisoLibro = await anotarCosto(d, { piezaId: pieza.id, clientId: pieza.client_id, proveedor: 'fal', modelo: pieza.modelo, parte: 'animación', usd: precio, base: 'lista_publicada' })
  if (avisoLibro) return { ok: true, valor: (await actualizar(d, pieza.id, { aviso: [cerrada.aviso, avisoLibro].filter(Boolean).join(' · ') })) ?? cerrada }
  return { ok: true, valor: cerrada }
}

// ── listar ────────────────────────────────────────────────────────────────
export async function listar(d: Deps, clientId: string, tipo: string | null, limite = 60): Promise<Resultado<Pieza[]>> {
  if (!UUID.test(clientId)) return falla(400, 'client_id_invalido')
  let q = d.db.from(TABLA).select(COLUMNAS).eq('client_id', clientId)
  if (tipo) q = q.eq('tipo', tipo)
  const r = await q.order('creado_en', { ascending: false }).limit(Math.min(Math.max(limite, 1), 200))
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  return { ok: true, valor: (r.data ?? []) as Pieza[] }
}
