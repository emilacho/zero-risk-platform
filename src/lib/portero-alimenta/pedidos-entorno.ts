/**
 * Las dependencias REALES de los pedidos libres al portero (búsqueda en la web, lectura de páginas, disparo de la cadena). Nada de esto corre en pruebas: allí se inyectan moldes.
 *  · búsqueda: el actor de búsqueda de Google de Apify (mismo costo medido que `google_serp_scraper`: US$ 0,003), con la llave `APIFY_API_TOKEN` del servidor;
 *  · lectura: `fetch` directo (gratis, 8 s, hasta 600 KB, solo texto/HTML); lo que no se deja leer se declara, no se inventa;
 *  · cadena: la MISMA entrada «completar despertar» del flujo del portero (`INTERNAL_API_KEY`, nunca `SALA_DISPATCH_KEY`).
 */
import { ApifyClient } from '../apify/client'
import { COSTO_MAXIMO_POR_FUNCION } from './gasto'
import type { ResultadoDeBusqueda } from './pedidos'

export const URL_DE_LA_CADENA_POR_OMISION = 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/cerebro-completar-despertar'
export const ACTOR_DE_BUSQUEDA = 'apify/google-search-scraper'
const MAX_BYTES = 600_000
const MAX_CARACTERES = 12_000

/** HTML → texto plano legible (sin scripts, estilos ni etiquetas) */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n\s*\n+/g, '\n').trim().slice(0, MAX_CARACTERES)
}

export function leerPaginaReal(fetchImpl: (u: string, i?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)) {
  return async (url: string): Promise<string | null> => {
    try {
      const r = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ZeroRiskPortero/1.0)', accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (!r.ok) return null
      const tipo = r.headers.get('content-type') ?? ''
      if (tipo && !/text\/|html|xml/i.test(tipo)) return null
      const buf = await r.arrayBuffer()
      if (buf.byteLength > MAX_BYTES) return textoDeHtml(new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BYTES)))
      return textoDeHtml(new TextDecoder('utf-8', { fatal: false }).decode(buf))
    } catch { return null }
  }
}

export function buscarReal(token: string | undefined) {
  return async (consulta: string): Promise<ResultadoDeBusqueda> => {
    if (!token) throw new Error('APIFY_API_TOKEN no está configurada en el servidor')
    const params = { queries: consulta, maxPagesPerQuery: 1, resultsPerPage: 6, languageCode: 'es' }
    const x = await new ApifyClient({ token }).runActorAndCollect(ACTOR_DE_BUSQUEDA, params, 90_000, 3000, 10)
    const resultados: ResultadoDeBusqueda['resultados'] = []
    for (const it of x.items as Array<Record<string, unknown>>) {
      const org = Array.isArray(it.organicResults) ? (it.organicResults as Array<Record<string, unknown>>) : []
      for (const o of org) if (typeof o.url === 'string') resultados.push({ titulo: String(o.title ?? ''), url: o.url, descripcion: String(o.description ?? '') })
    }
    return { resultados, costo_usd: COSTO_MAXIMO_POR_FUNCION.google_serp_scraper.usd, fila_cruda: { apify_function: 'google_serp_scraper', params, respuesta: x.items.slice(0, 5) } }
  }
}

export function dispararCadenaReal(o: { url?: string; llaveInterna: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (clientId: string): Promise<{ ok: boolean; detalle: string }> => {
    if (!o.llaveInterna) return { ok: false, detalle: 'INTERNAL_API_KEY no está configurada' }
    try {
      const r = await traer(o.url || URL_DE_LA_CADENA_POR_OMISION, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.llaveInterna }, body: JSON.stringify({ client_id: clientId, pedir_ahora: true }), signal: AbortSignal.timeout(15_000) })
      return r.ok ? { ok: true, detalle: `la cadena respondió ${r.status}` } : { ok: false, detalle: `la cadena respondió ${r.status}` }
    } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
}

/** el aviso real del pedido: UN POST con la llave interna a la dirección de quien pidió (ya validada contra los anfitriones permitidos) */
export function avisoReal(llaveInterna: string, fetchImpl: (u: string, i?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)) {
  return async (url: string, cuerpo: Record<string, unknown>): Promise<{ ok: boolean; http?: number; detalle: string }> => {
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': llaveInterna }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(15_000), redirect: 'error' })
      return r.ok ? { ok: true, http: r.status, detalle: 'entregado' } : { ok: false, http: r.status, detalle: `respondió ${r.status}` }
    } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
}
