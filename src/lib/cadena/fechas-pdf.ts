/**
 * FECHAS ESPECIALES · leer el texto de los PDF oficiales (GO Lenovo 11-nov 19:30 · opción b, para cualquier país · certifica CC7).
 * Muchos gobiernos publican sus feriados en PDF. El nodo «② Juntar» del proceso de fechas los descarta como «no es texto»; esta acción baja SOLO esas
 * direcciones y les saca el texto con el lector de PDF del CEREBRO (proceso aparte, reloj duro, tope de memoria, falla cerrado; un PDF escaneado se DECLARA, no se inventa).
 * Lo que vuelve es una página más `{url, texto}`: viaja igual que una de HTML y la cita literal se comprueba contra ese mismo texto en «guardar».
 *
 * Lista blanca: solo se baja una dirección que esté EXACTA en `dominios_fechas` para ese tipo y país (o «*|país»). Nada de pedidos a cualquier lado.
 * Una redirección solo se sigue dentro del MISMO sitio (como mucho 3); tope de bytes y de tiempo; tiene que empezar con `%PDF`. En seco se lee igual que en real, como el HTML
 * (bajar y leer no llaman a ningún modelo: US$ 0); el simulacro del proceso no pasa por aquí.
 */
import type { Almacen } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { claveDeFecha, dominiosDe } from './fechas-del-cliente'
import { leerPdf } from '@/lib/cerebro/archivos/pdf'
import { TOPES } from '@/lib/cerebro/archivos/topes'
import type { LecturaDeArchivo } from '@/lib/cerebro/archivos/tipos'

/** cuántos PDF se leen por llamada (uno por uno, de a UN proceso) */
export const PDF_POR_LLAMADA = 3
export const TIEMPO_DE_DESCARGA_MS = 20_000
export const REDIRECCIONES_MAX = 3
/** el texto que vuelve se corta igual que una página de HTML en «② Juntar» */
export const TEXTO_MAX = 60_000

export interface Bajada { ok: true; bytes: Buffer; tipo: string }
export type ResultadoDeBajada = Bajada | { ok: false; razon: string }
export interface DependenciasDePdf {
  bajar: (url: string) => Promise<ResultadoDeBajada>
  leer: (buf: Buffer, nombre: string) => Promise<LecturaDeArchivo>
}

/** la MISMA llave que usa la cobertura (`datos.ts`): «Feriados locales» → «feriados_locales» */
const clave = claveDeFecha

/** baja una dirección con tope de tiempo y de bytes, siguiendo redirecciones SOLO dentro del mismo sitio */
export async function bajarPdf(url: string, f: typeof fetch = fetch, topeBytes = TOPES.pdf_bytes): Promise<ResultadoDeBajada> {
  let actual: URL
  try { actual = new URL(url) } catch { return { ok: false, razon: 'la dirección no es válida' } }
  const sitio = actual.hostname
  for (let salto = 0; salto <= REDIRECCIONES_MAX; salto++) {
    if (actual.protocol !== 'https:' && actual.protocol !== 'http:') return { ok: false, razon: `protocolo no admitido (${actual.protocol})` }
    let r: Response
    try { r = await f(actual.toString(), { redirect: 'manual', signal: AbortSignal.timeout(TIEMPO_DE_DESCARGA_MS) }) } catch (e) { return { ok: false, razon: `no se pudo bajar (${String((e as Error)?.name === 'TimeoutError' ? 'tiempo agotado' : (e as Error)?.message ?? e).slice(0, 120)})` } }
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location')
      if (!destino) return { ok: false, razon: `redirección ${r.status} sin destino` }
      let sig: URL
      try { sig = new URL(destino, actual) } catch { return { ok: false, razon: 'redirección a una dirección no válida' } }
      if (sig.hostname !== sitio) return { ok: false, razon: `redirige a otro sitio (${sig.hostname}): no se sigue` }
      actual = sig
      continue
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, razon: `respondió ${r.status}` }
    const largo = Number(r.headers.get('content-length') ?? NaN)
    if (Number.isFinite(largo) && largo > topeBytes) return { ok: false, razon: `pesa ${largo} bytes (tope ${topeBytes})` }
    // se lee por partes para cortar en el tope aunque el sitio no diga el tamaño
    const partes: Uint8Array[] = []
    let total = 0
    const lector = r.body?.getReader()
    if (!lector) return { ok: false, razon: 'respuesta vacía' }
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      total += value.byteLength
      if (total > topeBytes) { try { await lector.cancel() } catch { /* ya cerró */ } return { ok: false, razon: `pesa más de ${topeBytes} bytes (tope)` } }
      partes.push(value)
    }
    return { ok: true, bytes: Buffer.concat(partes), tipo: r.headers.get('content-type') ?? '' }
  }
  return { ok: false, razon: `más de ${REDIRECCIONES_MAX} redirecciones` }
}

const DEPENDENCIAS: DependenciasDePdf = { bajar: (u) => bajarPdf(u), leer: (b, n) => leerPdf(b, n) }

/** por qué un PDF leído no sirve como página (en palabras); null = sirve */
function razonDeLectura(l: LecturaDeArchivo): string | null {
  if (l.estado === 'ok' && l.texto.trim().length >= 30) return null
  if (l.estado === 'ok') return 'el PDF casi no trae texto'
  if (l.estado === 'escaneado') return 'el PDF es escaneado (imágenes, sin texto): no se inventa'
  if (l.estado === 'protegido') return 'el PDF está protegido con clave'
  if (l.estado === 'vacio') return 'el PDF no trae texto'
  return `el PDF no se pudo leer (${l.estado}${l.motivo ? `: ${l.motivo.slice(0, 120)}` : ''})`
}

export async function fechasLeerPdf(al: Almacen, cuerpo: Record<string, unknown>, d: DependenciasDePdf = DEPENDENCIAS): Promise<Respuesta> {
  const pais = cadena(cuerpo.pais), tipo = cadena(cuerpo.tipo), id = cadena(cuerpo.campana_id)
  const urls = Array.isArray(cuerpo.urls) ? [...new Set((cuerpo.urls as unknown[]).filter((u): u is string => typeof u === 'string' && u.trim() !== ''))] : []
  if (!pais || !tipo || !id) return err(400, 'E-CAMPOS', 'faltan campana_id, pais o tipo')
  if (!urls.length) return err(400, 'E-CAMPOS', 'faltan las direcciones de los PDF (urls)')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const paginas: Array<{ url: string; texto: string }> = []
  const descartadas: Array<{ url: string; razon: string }> = []
  const permitidas = new Set(dominiosDe(await al.leerConfig('dominios_fechas'), clave(tipo), clave(pais)))
  let leidos = 0
  for (const url of urls) {
    if (!permitidas.has(url)) { descartadas.push({ url, razon: 'no está entre las fuentes oficiales cargadas para este tipo y país: no se baja' }); continue }
    if (leidos++ >= PDF_POR_LLAMADA) { descartadas.push({ url, razon: `más de ${PDF_POR_LLAMADA} PDF en una llamada: este no se leyó` }); continue }
    const b = await d.bajar(url)
    if (!b.ok) { descartadas.push({ url, razon: b.razon }); continue }
    if (b.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') { descartadas.push({ url, razon: `no es un PDF (${b.tipo.split(';')[0].trim() || 'sin tipo'})` }); continue }
    let l: LecturaDeArchivo
    try { l = await d.leer(b.bytes, url) } catch (e) { descartadas.push({ url, razon: `el PDF no se pudo leer (${String((e as Error)?.message ?? e).slice(0, 120)})` }); continue }
    const razon = razonDeLectura(l)
    if (razon) descartadas.push({ url, razon })
    else paginas.push({ url, texto: l.texto.replace(/\s+/g, ' ').trim().slice(0, TEXTO_MAX) })
  }
  return { status: 200, cuerpo: { paginas, descartadas } }
}
