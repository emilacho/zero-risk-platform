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
import { CONFIG_DEL_BRAZO_POR_OMISION, conDescuento, leerConfigDelBrazo } from '@/lib/video/parametros'
import { costoEstimadoUsd, enviar as enviarAHiggsfield, estado as estadoEnHiggsfield, estimar, ESTADOS_TERMINALES } from '@/lib/video/higgsfield'
import { ANIMAR, entradaDeVarias, imagenDeVarias, precioDeVarias, VARIAS, archivoDe3D, clipsDeAnimacion, cotizarAnimacion, cotizarSinRed, entradaDe3D, entradaDeAnimacion, miniaturaDe3D, modeloDe3D, motivoDeAnimacion, promptDeImagenPara3D, TAMANO_POR_FORMATO, UUID, type Cotizacion, type Pedido, type PedidoDeAnimacion, type Referencia } from './catalogo'
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
  /** 11-nov · regla #18 · lector de la configuración de la cadena (tope y descuento del proveedor de video); sin él, la de por omisión (sin descuento) */
  leerConfig?: (clave: string) => Promise<unknown>
}

export const TABLA = 'estudio_piezas'
/** el almacén de la oficina admite 50 MB por archivo (GO-LENOVO 10-nov 14:55Z · antes 20 MB; 50 MB es también el tope del proyecto) */
export const TOPE_DEL_ARCHIVO_BYTES = 50 * 1024 * 1024
const COLUMNAS = 'id, client_id, tipo, estado, paso, prompt, modelo, parametros, foto_partida_url, costo_estimado_usd, costo_usd, archivo_url, archivo_tipo, miniatura_url, aviso, error, creado_en, terminado_en, en_papelera_desde'

export interface Pieza {
  id: string; client_id: string; tipo: string; estado: 'creando' | 'lista' | 'fallida'; paso: string | null; prompt: string; modelo: string
  parametros: Record<string, unknown>; foto_partida_url: string | null; costo_estimado_usd: number; costo_usd: number
  archivo_url: string | null; archivo_tipo: string | null; miniatura_url: string | null; aviso: string | null; error: string | null; creado_en: string; terminado_en: string | null
  /** en la papelera desde (null = en la galería) */
  en_papelera_desde: string | null
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
  // 11-nov · regla #18: el descuento del proveedor es configuración (sin ella, la lista)
  const usd = conDescuento(lista, p.modelo, d.ahora(), (d.leerConfig ? await leerConfigDelBrazo(d.leerConfig) : CONFIG_DEL_BRAZO_POR_OMISION).descuento).usd
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
async function resolverFoto(d: Deps, p: Pedido): Promise<Resultado<{ url: string; bytes: Buffer; tipo: string; rehecho_de?: string } | null>> {
  if (!p.foto) return { ok: true, valor: null }
  if (p.foto.tipo === 'rehacer') {
    // GO 09-nov: rehacer un modelo desde su misma imagen de partida; el original no se toca y el nuevo queda ligado a él
    const o = await leerPieza(d, p.foto.pieza_id)
    if (!o || o.client_id !== p.client_id || o.tipo !== '3d' || !o.foto_partida_url || !o.foto_partida_url.startsWith('https://')) return falla(400, 'foto_invalida', 'para rehacer, la pieza debe ser un modelo 3D de este mismo cliente con su imagen de partida')
    const b = await bajar(d, o.foto_partida_url, TOPE_DEL_ARCHIVO_BYTES)
    if (!b.ok) return b
    return { ok: true, valor: { url: o.foto_partida_url, bytes: b.valor, tipo: sniffImageFormat(b.valor).contentType, rehecho_de: o.id } }
  }
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
  if (!origen || origen.client_id !== p.client_id || origen.tipo !== 'imagen' || origen.estado !== 'lista' || !origen.archivo_url || origen.en_papelera_desde) return falla(400, 'foto_invalida', 'la imagen de partida debe ser una imagen lista de este mismo cliente')
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
  const prov = p.fotos.length ? 'fal' : PROVEEDOR[p.tipo]
  if (!d.llaves[prov]) return falla(500, 'llave_no_configurada', `falta la llave de ${prov}`)
  if (p.tipo === '3d' && !p.foto && !d.llaves.openai) return falla(500, 'llave_no_configurada', 'falta la llave de OpenAI para la imagen previa')
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')

  const cot = await cotizar(d, p)
  if (!cot.ok) return cot
  if (p.fotos.length) return crearConReferencias(d, p, cot.valor)
  const foto = await resolverFoto(d, p)
  if (!foto.ok) return foto

  const ins = await d.db.from(TABLA).insert({
    client_id: p.client_id, tipo: p.tipo, estado: 'creando', paso: p.tipo === '3d' && !foto.valor ? 'imagen' : p.tipo, prompt: p.prompt, modelo: p.modelo, clave: p.clave,
    parametros: { formato: p.formato, calidad: p.calidad, segundos: p.segundos || null, resolucion: p.resolucion || null, audio: p.tipo === 'video' ? p.audio : null, ...(p.tipo === '3d' ? { pose: p.pose ?? 'imagen' } : {}), cotizacion: cot.valor, ...(foto.valor?.rehecho_de ? { rehecho_de: foto.valor.rehecho_de } : {}) },
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
  const env = await enviarAFal(d.fetch, d.llaves.fal, m.endpoint, entradaDe3D(m, p.calidad, urlDeImagen, p.pose))
  if (!env.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `fal ${env.status} · ${env.error}`, gastado)) ?? pieza, ya_existia: false } }
  const fin = await actualizar(d, pieza.id, { paso: '3d', proveedor_request_id: env.envio.request_id, proveedor_status_url: env.envio.status_url, proveedor_response_url: env.envio.response_url }, true)
  return { ok: true, valor: { pieza: fin ?? pieza, ya_existia: false } }
}

// ── imagen con varias referencias (GO 09-nov 22:45Z) ─────────────────────
/** cada referencia a una dirección pública nuestra: la subida se guarda en el almacén; la de la galería debe ser una imagen lista del mismo cliente (fuera de la papelera) */
async function resolverReferencias(d: Deps, p: Pedido): Promise<Resultado<Array<{ numero: number; url: string }>>> {
  const salida: Array<{ numero: number; url: string }> = []
  for (const r of p.fotos as Referencia[]) {
    if (r.foto.tipo === 'subida') {
      const bytes = Buffer.from(r.foto.b64, 'base64')
      const esImagen = bytes.length > 12 && (bytes[0] === 0x89 || (bytes[0] === 0xff && bytes[1] === 0xd8) || bytes.subarray(8, 12).toString('ascii') === 'WEBP')
      if (!esImagen) return falla(400, 'foto_invalida', `la imagen ${r.numero} debe ser png, jpg o webp`)
      const fmt = sniffImageFormat(bytes)
      const up = await subir(d, `estudio/${p.client_id}/partidas/${p.clave}-${r.numero}.${fmt.ext}`, bytes, fmt.contentType)
      if (!up.ok) return up
      salida.push({ numero: r.numero, url: up.valor })
    } else {
      const o = await leerPieza(d, r.foto.pieza_id)
      if (!o || o.client_id !== p.client_id || o.tipo !== 'imagen' || o.estado !== 'lista' || !o.archivo_url || o.en_papelera_desde) return falla(400, 'foto_invalida', `la imagen ${r.numero} debe ser una imagen lista de este mismo cliente`)
      salida.push({ numero: r.numero, url: o.archivo_url })
    }
  }
  return { ok: true, valor: salida }
}

/** se encarga a fal (la pantalla pregunta como con el 3D); el costo se anota al cerrar, cuando fal entregó */
async function crearConReferencias(d: Deps, p: Pedido, cot: Cotizacion): Promise<Resultado<{ pieza: Pieza; ya_existia: boolean }>> {
  const refs = await resolverReferencias(d, p)
  if (!refs.ok) return refs
  const ins = await d.db.from(TABLA).insert({
    client_id: p.client_id, tipo: 'imagen', estado: 'creando', paso: 'imagen', prompt: p.prompt, modelo: VARIAS.id, clave: p.clave,
    parametros: { formato: p.formato, resolucion: VARIAS.resolucion, referencias: refs.valor, cotizacion: cot },
    foto_partida_url: refs.valor[0].url, costo_estimado_usd: cot.total_usd, costo_usd: 0,
  }).select(COLUMNAS)
  if (ins.error) {
    const otra = await porClave(d, p.clave)
    if (otra) return { ok: true, valor: { pieza: otra, ya_existia: true } }
    return falla(500, 'base_fallida', ins.error.message)
  }
  const pieza = ins.data[0] as Pieza
  const env = await enviarAFal(d.fetch, d.llaves.fal, VARIAS.endpoint, entradaDeVarias(p.prompt, refs.valor.map((r) => r.numero), refs.valor.map((r) => r.url), p.formato))
  if (!env.ok) return { ok: true, valor: { pieza: (await fallar(d, pieza.id, `fal ${env.status} · ${env.error}`)) ?? pieza, ya_existia: false } }
  const fin = await actualizar(d, pieza.id, { proveedor_request_id: env.envio.request_id, proveedor_status_url: env.envio.status_url, proveedor_response_url: env.envio.response_url }, true)
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
  // un fallo anota 0; el motivo de una animación se dice por su causa real (demasiadas caras, no es figura humana) o en simple si no se reconoce
  const motivo = (t: string) => (esAnimacion ? motivoDeAnimacion(t) : t)
  if (e.e.estado === 'fallido') return { ok: true, valor: (await fallar(d, id, motivo(`fal · ${e.e.error}`), yaGastado)) ?? pieza }
  const res = await resultadoDeFal(d.fetch, d.llaves.fal, responseUrl)
  if (!res.ok) return { ok: true, valor: (await fallar(d, id, motivo(`fal ${res.status} · ${res.error}`), yaGastado)) ?? pieza }
  if (esAnimacion) return cerrarAnimacion(d, pieza, res.salida, ahoraIso)
  if (pieza.modelo === VARIAS.id) {
    const precio = precioDeVarias(String(pieza.parametros?.resolucion ?? VARIAS.resolucion))
    const url = imagenDeVarias(res.salida)
    if (!url) {
      // fal terminó (y cobra) sin imagen: misma regla que el 3D sin archivo
      const f = await fallar(d, id, 'fal terminó sin imagen', yaGastado + precio)
      if (!f) return { ok: true, valor: (await leerPieza(d, id)) ?? pieza }
      const avisoLibro = await anotarCosto(d, { piezaId: id, clientId: pieza.client_id, proveedor: 'fal', modelo: pieza.modelo, parte: 'imagen', usd: precio, base: 'lista_publicada' })
      return { ok: true, valor: avisoLibro ? ((await actualizar(d, id, { aviso: [f.aviso, avisoLibro].filter(Boolean).join(' · ') })) ?? f) : f }
    }
    return cerrar(d, pieza, { urlProveedor: url, ruta: `estudio/${pieza.client_id}/${id}.png`, tipo: 'image/png', archivoTipo: 'image', miniatura: null, proveedor: 'fal', usd: precio, base: 'lista_publicada', previo: yaGastado, ahoraIso })
  }
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
  const cerrada = await actualizar(d, pieza.id, { estado: 'lista', paso: null, costo_usd: total, archivo_url: url, archivo_tipo: x.archivoTipo, miniatura_url: x.archivoTipo === 'image' && url ? url : x.miniatura && x.miniatura.startsWith('https://') && !/fal\.media/.test(x.miniatura) ? x.miniatura : pieza.foto_partida_url, aviso: [pieza.aviso, aviso].filter(Boolean).join(' · ') || null, terminado_en: x.ahoraIso() }, true)
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
  if (!o || o.client_id !== p.client_id || o.en_papelera_desde) return falla(404, 'modelo_no_existe', 'el modelo a animar no existe para este cliente')
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
  let q = d.db.from(TABLA).select(COLUMNAS).eq('client_id', clientId).is('en_papelera_desde', null)
  if (tipo) q = q.eq('tipo', tipo)
  const r = await q.order('creado_en', { ascending: false }).limit(Math.min(Math.max(limite, 1), 200))
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  return { ok: true, valor: (r.data ?? []) as Pieza[] }
}

// ── papelera (decisión B de Emilio · GO 09-nov 22:45Z) ────────────────────
/** cuánto vive una pieza en la papelera antes de borrarse sola */
export const DIAS_EN_LA_PAPELERA = 30
/** cuántas piezas vencidas borra una pasada del cron (lo que sobre queda para la siguiente) */
export const TOPE_POR_PASADA = 50

/** lo que está en la papelera de un cliente, lo más reciente primero */
export async function listarPapelera(d: Deps, clientId: string): Promise<Resultado<Pieza[]>> {
  if (!UUID.test(clientId)) return falla(400, 'client_id_invalido')
  const r = await d.db.from(TABLA).select(COLUMNAS).eq('client_id', clientId).not('en_papelera_desde', 'is', null).order('en_papelera_desde', { ascending: false }).limit(200)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  return { ok: true, valor: (r.data ?? []) as Pieza[] }
}

/** la ✕: la pieza sale de la galería y entra a la papelera. Una pieza que se está creando no (su cobro se anota al cerrar, y en la papelera nadie la pregunta) */
export async function moverAPapelera(d: Deps, clientId: string, id: string): Promise<Resultado<Pieza>> {
  if (!UUID.test(clientId) || !UUID.test(id)) return falla(400, 'id_invalido')
  const o = await leerPieza(d, id)
  if (!o || o.client_id !== clientId) return falla(404, 'pieza_no_existe')
  if (o.en_papelera_desde) return { ok: true, valor: o }
  if (o.estado === 'creando') return falla(409, 'pieza_creandose', 'espera a que termine de crearse')
  const ahora = new Date(d.ahora()).toISOString()
  const r = await d.db.from(TABLA).update({ en_papelera_desde: ahora, actualizado_en: ahora }).eq('id', id).eq('client_id', clientId).is('en_papelera_desde', null).select(COLUMNAS)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  return { ok: true, valor: (r.data?.[0] as Pieza | undefined) ?? (await leerPieza(d, id)) ?? o }
}

/** recuperar: vuelve a la galería tal cual estaba */
export async function recuperar(d: Deps, clientId: string, id: string): Promise<Resultado<Pieza>> {
  if (!UUID.test(clientId) || !UUID.test(id)) return falla(400, 'id_invalido')
  const o = await leerPieza(d, id)
  if (!o || o.client_id !== clientId) return falla(404, 'pieza_no_existe', 'ya no está: pasó su plazo en la papelera')
  if (!o.en_papelera_desde) return { ok: true, valor: o }
  // Pasados los 30 días la pieza es del vaciado: ya no se recupera. La condición va en la misma escritura, así una recuperación nunca se cruza con
  // una pasada que ya está borrando sus archivos (o recupera antes del plazo, o el vaciado la borra; nunca una fila que vuelve sin archivos).
  const limite = limiteDeLaPapelera(d)
  const r = await d.db.from(TABLA).update({ en_papelera_desde: null, actualizado_en: new Date(d.ahora()).toISOString() }).eq('id', id).eq('client_id', clientId).gte('en_papelera_desde', limite).select(COLUMNAS)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  const p = r.data?.[0] as Pieza | undefined
  if (!p) return falla(409, 'se_esta_borrando', 'ya pasó sus 30 días en la papelera y se está borrando')
  return { ok: true, valor: p }
}

/** días que le quedan en la papelera (0 = se borra en la próxima pasada) */
export function diasQueQuedan(desde: string, ahoraMs: number): number {
  const t = Date.parse(desde)
  if (!Number.isFinite(t)) return DIAS_EN_LA_PAPELERA
  return Math.max(0, Math.ceil((t + DIAS_EN_LA_PAPELERA * 86_400_000 - ahoraMs) / 86_400_000))
}

/**
 * Los archivos PROPIOS de una pieza en el almacén: los que llevan su id o su clave en el nombre, dentro de la carpeta de su cliente.
 * La imagen de la galería que se usó de partida es de OTRA pieza: no se toca (sigue la suerte de su propia pieza).
 */
export function archivosPropios(prefijoPublico: string, p: Pick<Pieza, 'id' | 'client_id' | 'archivo_url' | 'miniatura_url' | 'foto_partida_url' | 'parametros'> & { clave: string }): string[] {
  const carpeta = `estudio/${p.client_id}/`
  const urls: unknown[] = [p.archivo_url, p.miniatura_url, p.foto_partida_url]
  for (const k of ['archivos', 'referencias']) {
    const l = p.parametros?.[k]
    if (Array.isArray(l)) for (const x of l) if (x && typeof x === 'object') { const o = x as Record<string, unknown>; urls.push(o.glb, o.fbx, o.url) }
  }
  const rutas = new Set<string>()
  for (const u of urls) {
    if (typeof u !== 'string' || !u.startsWith(prefijoPublico)) continue
    let ruta: string
    try { ruta = decodeURIComponent(u.slice(prefijoPublico.length).split('?')[0]) } catch { continue }
    if (!ruta.startsWith(carpeta) || ruta.includes('..')) continue
    const nombre = ruta.slice(carpeta.length)
    if (nombre.startsWith(p.id) || nombre.startsWith(`partidas/${p.clave}.`) || nombre.startsWith(`partidas/${p.clave}-`)) rutas.add(ruta)
  }
  return [...rutas]
}

// ── rescate de archivos que quedaron en el proveedor (GO-LENOVO 10-nov 14:55Z) ──
const QUEDA = 'queda solo en el proveedor (vence en días): '
/** los errores de `bajar` que llevan detalle: en el aviso van como «<error> · <detalle>» */
const CON_DETALLE = ['archivo_muy_grande', 'descarga_fallida', 'descarga_rechazada']

/** el aviso sin los «queda solo en el proveedor…» (y su detalle); el resto de los avisos se conserva tal cual */
export function sinAvisosDeCopia(aviso: string | null): string | null {
  if (!aviso) return null
  const partes = aviso.split(' · ')
  const quedan: string[] = []
  for (let i = 0; i < partes.length; i++) {
    if (!partes[i].startsWith(QUEDA)) { quedan.push(partes[i]); continue }
    if (CON_DETALLE.includes(partes[i].slice(QUEDA.length)) && i + 1 < partes.length && !partes[i + 1].startsWith(QUEDA)) i++
  }
  return quedan.join(' · ') || null
}

/** dónde va el archivo principal según su tipo (las mismas rutas que usa `cerrar`) */
function destinoPrincipal(p: Pieza): { ruta: string; tipo: string } | null {
  const c = `estudio/${p.client_id}/${p.id}`
  switch (p.archivo_tipo) {
    case 'glb': return { ruta: `${c}.glb`, tipo: 'model/gltf-binary' }
    case 'fbx': return { ruta: `${c}.fbx`, tipo: 'application/octet-stream' }
    case 'obj': return { ruta: `${c}.obj`, tipo: 'model/obj' }
    case 'video': return { ruta: `${c}.mp4`, tipo: 'video/mp4' }
    case 'image': return { ruta: `${c}.png`, tipo: 'image/png' }
    default: return null
  }
}

export interface Rescate { revisadas: number; copiadas: string[]; archivos: number; siguen: Array<{ id: string; aviso: string }>; fallas: Array<{ id: string; error: string }>; dry_run: boolean }

/**
 * Lo que quedó solo en el proveedor (archivo más grande que el tope de ese día, almacén caído…) se vuelve a copiar mientras el proveedor lo tenga.
 * Corre con el cron diario de la papelera. Cada archivo copiado reemplaza su dirección; el aviso «queda solo en el proveedor» se quita solo
 * cuando ya no queda ningún archivo afuera. No gasta: el proveedor ya cobró. La fila se escribe solo si nadie la cambió mientras tanto.
 */
export async function rescatarArchivos(d: Deps, o: { dry_run: boolean }): Promise<Resultado<Rescate>> {
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')
  const r = await d.db.from(TABLA).select(COLUMNAS).eq('estado', 'lista').like('aviso', `%${QUEDA.slice(0, 26)}%`).order('creado_en', { ascending: true }).limit(TOPE_POR_PASADA)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  const piezas = (r.data ?? []) as Pieza[]
  const prefijo = d.db.storage.from(d.bucket).getPublicUrl('').data.publicUrl.replace(/\/?$/, '/')
  const afuera = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://') && !u.startsWith(prefijo)
  const res: Rescate = { revisadas: piezas.length, copiadas: [], archivos: 0, siguen: [], fallas: [], dry_run: o.dry_run }
  for (const p of piezas) {
    try {
      const clips = Array.isArray(p.parametros?.archivos) ? (p.parametros.archivos as Array<Record<string, unknown>>) : null
      const tareas: Array<{ url: string; ruta: string; tipo: string }> = []
      for (const c of clips ?? []) {
        const base = `estudio/${p.client_id}/${p.id}-${c.action_id}`
        if (afuera(c.glb)) tareas.push({ url: c.glb, ruta: `${base}.glb`, tipo: 'model/gltf-binary' })
        if (afuera(c.fbx)) tareas.push({ url: c.fbx, ruta: `${base}.fbx`, tipo: 'application/octet-stream' })
      }
      // en una animación el archivo principal es uno de sus clips: se copia una sola vez
      if (afuera(p.archivo_url) && !tareas.some((t) => t.url === p.archivo_url)) {
        const dest = destinoPrincipal(p)
        if (!dest) { res.siguen.push({ id: p.id, aviso: `tipo de archivo sin ruta conocida: ${p.archivo_tipo}` }); continue }
        tareas.push({ url: p.archivo_url, ...dest })
      }
      // nada que bajar (dirección que no es https pública…): no se toca, ni siquiera el aviso
      if (!tareas.length) { res.siguen.push({ id: p.id, aviso: 'ningún archivo del proveedor que se pueda bajar' }); continue }
      if (o.dry_run) { res.copiadas.push(p.id); res.archivos += tareas.length; continue }
      const hechas = new Map<string, string>()
      const avisos: string[] = []
      for (const t of tareas) {
        const c = await copiar(d, t.url, t.ruta, t.tipo)
        if (c.aviso) avisos.push(c.aviso)
        else hechas.set(t.url, c.url)
      }
      // nada se pudo copiar (el proveedor ya no lo tiene, sigue siendo muy grande…): la fila queda igual
      if (!hechas.size) { res.siguen.push({ id: p.id, aviso: [...new Set(avisos)].join(' · ') }); continue }
      const cambia = (u: unknown) => (typeof u === 'string' && hechas.get(u)) || u
      const cambios: Record<string, unknown> = {
        archivo_url: cambia(p.archivo_url),
        miniatura_url: cambia(p.miniatura_url),
        aviso: [sinAvisosDeCopia(p.aviso), ...new Set(avisos)].filter(Boolean).join(' · ') || null,
        actualizado_en: new Date(d.ahora()).toISOString(),
      }
      if (clips) cambios.parametros = { ...p.parametros, archivos: clips.map((c) => ({ ...c, glb: cambia(c.glb) ?? null, fbx: cambia(c.fbx) ?? null })) }
      // solo si nadie la cambió mientras se copiaba (mismo aviso, misma dirección)
      let q = d.db.from(TABLA).update(cambios).eq('id', p.id).eq('aviso', p.aviso as string)
      q = p.archivo_url === null ? q.is('archivo_url', null) : q.eq('archivo_url', p.archivo_url)
      const u = await q.select('id')
      if (u.error) { res.fallas.push({ id: p.id, error: `base: ${u.error.message}` }); continue }
      if (!u.data?.length) { res.fallas.push({ id: p.id, error: 'la pieza cambió durante la copia: queda para la próxima pasada' }); continue }
      res.archivos += hechas.size
      if (avisos.length) res.siguen.push({ id: p.id, aviso: [...new Set(avisos)].join(' · ') })
      else res.copiadas.push(p.id)
    } catch (e) {
      res.fallas.push({ id: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { ok: true, valor: res }
}

export interface Vaciado { revisadas: number; borradas: string[]; archivos: number; conservados: number; fallas: Array<{ id: string; error: string }>; dry_run: boolean }

/** el corte de la papelera: lo que entró antes de esta fecha ya pasó sus 30 días */
function limiteDeLaPapelera(d: Deps): string {
  return new Date(d.ahora() - DIAS_EN_LA_PAPELERA * 86_400_000).toISOString()
}

/** ¿otra pieza (viva o en la papelera) muestra este archivo, también como referencia 2 a 6 de una imagen hecha con varias? Entonces no se borra */
async function loUsaOtra(d: Deps, id: string, url: string): Promise<boolean> {
  for (const c of ['archivo_url', 'miniatura_url', 'foto_partida_url']) {
    const r = await d.db.from(TABLA).select('id').eq(c, url).neq('id', id).limit(1)
    if (r.error) throw new Error(r.error.message)
    if (r.data?.length) return true
  }
  const r = await d.db.from(TABLA).select('id').contains('parametros', { referencias: [{ url }] }).neq('id', id).limit(1)
  if (r.error) throw new Error(r.error.message)
  return Boolean(r.data?.length)
}

/**
 * El cron diario: borra lo que pasó 30 días en la papelera, fila y archivos propios. Primero los archivos; si el almacén falla, la fila queda para
 * la próxima pasada (nunca una fila borrada con sus archivos huérfanos). El libro de costos no se toca.
 */
export async function vaciarPapelera(d: Deps, o: { dry_run: boolean }): Promise<Resultado<Vaciado>> {
  if (!d.bucket) return falla(500, 'almacen_no_configurado', 'OFICINA_BUCKET no está en el entorno')
  const limite = limiteDeLaPapelera(d)
  const r = await d.db.from(TABLA).select(`${COLUMNAS}, clave`).lt('en_papelera_desde', limite).order('en_papelera_desde', { ascending: true }).limit(TOPE_POR_PASADA)
  if (r.error) return falla(500, 'base_fallida', r.error.message)
  const vencidas = (r.data ?? []) as Array<Pieza & { clave: string }>
  const prefijo = d.db.storage.from(d.bucket).getPublicUrl('').data.publicUrl.replace(/\/?$/, '/')
  const res: Vaciado = { revisadas: vencidas.length, borradas: [], archivos: 0, conservados: 0, fallas: [], dry_run: o.dry_run }
  for (const p of vencidas) {
    try {
      const borrar: string[] = []
      for (const ruta of archivosPropios(prefijo, p)) {
        if (await loUsaOtra(d, p.id, `${prefijo}${ruta}`)) res.conservados++
        else borrar.push(ruta)
      }
      if (o.dry_run) { res.borradas.push(p.id); res.archivos += borrar.length; continue }
      // relectura justo antes de borrar archivos: si ya no está vencida en la papelera (o ya no existe), no se toca nada
      const sigue = await d.db.from(TABLA).select('id').eq('id', p.id).lt('en_papelera_desde', limite).limit(1)
      if (sigue.error) { res.fallas.push({ id: p.id, error: `base: ${sigue.error.message}` }); continue }
      if (!sigue.data?.length) continue
      if (borrar.length) {
        const rm = await d.db.storage.from(d.bucket).remove(borrar)
        if (rm.error) { res.fallas.push({ id: p.id, error: `almacén: ${rm.error.message}` }); continue }
      }
      // solo si sigue en la papelera y vencida (alguien pudo recuperarla mientras tanto)
      const del = await d.db.from(TABLA).delete().eq('id', p.id).lt('en_papelera_desde', limite).select('id')
      if (del.error) { res.fallas.push({ id: p.id, error: `base: ${del.error.message}` }); continue }
      if (!del.data?.length) { res.fallas.push({ id: p.id, error: 'salió de la papelera durante la pasada: la fila queda' }); continue }
      res.borradas.push(p.id); res.archivos += borrar.length
    } catch (e) {
      res.fallas.push({ id: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { ok: true, valor: res }
}
