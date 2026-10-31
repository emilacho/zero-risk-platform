/**
 * LOS PDF QUE EL SITIO ENLAZA (menús, catálogos) · 31-oct (guardar todo, parte 2)
 * El lector del sitio de Apify NO extrae texto de un PDF (medido: 0 caracteres), así que el portero lo lee él mismo con el lector de archivos del cerebro (proceso aparte, topes, falla cerrado).
 *  · sitio PROPIO → el texto del PDF entra como una página más de ese sitio (fuente `sitio`, su origen es la dirección del PDF) y sigue el camino normal: filtro, juez, fichas.
 *  · sitio de un COMPETIDOR → se guarda como página del competidor en `client_web_pages` (rol `competidor`, con su `competitor_id`); jamás entra a las fichas del cliente.
 * Solo PDF del MISMO dominio base que la página que lo enlaza (un PDF de un tercero no es del sitio). Nunca tumba la corrida.
 */
import { leerArchivo } from '../cerebro/archivos/leer'
import { TOPES } from '../cerebro/archivos/topes'
import type { FilaCruda } from './unidades'

export const MAX_PDF_POR_CORRIDA = 5
const MS_DE_DESCARGA = 15_000

type Traer = (url: string, init?: RequestInit) => Promise<Response>
type Fila = Record<string, unknown>
const arr = (v: unknown): Fila[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Fila[]) : [])
const txt = (v: unknown): string => (typeof v === 'string' ? v : '')
const hostDe = (u: string): string => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
/** el dominio «de registro» (los dos últimos tramos; con sufijo de país de dos letras, tres): cdn.x.ec y x.ec son el mismo sitio */
export const baseDeHost = (h: string): string => { const p = h.split('.').filter(Boolean); if (p.length <= 2) return p.join('.'); const sufijo2 = p[p.length - 1].length === 2 && ['com', 'co', 'org', 'net', 'gob', 'edu'].includes(p[p.length - 2]); return p.slice(sufijo2 ? -3 : -2).join('.') }

export interface PdfCandidato { url: string; nombre: string; pagina: string; fila_id: string; rol: 'propio' | 'competidor'; competitor_id: string | null }

/** los PDF de las filas del lector de sitios (propio o de competidor) más nuevas, mismo dominio, sin repetidos, con tope */
export function pdfsDeLasFilas(filas: FilaCruda[], max = MAX_PDF_POR_CORRIDA): PdfCandidato[] {
  const out: PdfCandidato[] = []
  const vistos = new Set<string>()
  const orden = [...filas].filter((f) => f.ensayo !== true && (f.apify_function === 'website_content_scraper' || f.apify_function === 'competitor_website_scraper')).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  for (const f of orden) {
    if (txt((f.metadata as { llamado_por?: unknown } | undefined)?.llamado_por).includes('#articulo')) continue
    const rol: 'propio' | 'competidor' = f.apify_function === 'competitor_website_scraper' ? 'competidor' : 'propio'
    const cid = txt((f.params as { competitor_id?: unknown } | undefined)?.competitor_id) || null
    if (rol === 'competidor' && !cid) continue
    for (const p of arr(f.respuesta)) {
      const pagina = txt(p.url)
      const docs = (p as { _enlaces?: { documentos?: unknown } })._enlaces?.documentos
      for (const d of arr(docs)) {
        const u = txt(d.url).trim().split('#')[0]
        if (out.length >= max) return out
        if (!/^https?:\/\//i.test(u) || !/\.pdf$/i.test(u.split('?')[0]) || vistos.has(u)) continue
        if (!pagina || baseDeHost(hostDe(u)) !== baseDeHost(hostDe(pagina))) continue
        vistos.add(u)
        out.push({ url: u, nombre: txt(d.texto).replace(/\s+/g, ' ').trim().slice(0, 160) || (u.split('?')[0].split('/').pop() ?? u), pagina, fila_id: String(f.id), rol, competitor_id: cid })
      }
    }
  }
  return out
}

export interface ResultadoDeDocumentos {
  candidatos: number
  leidos: number
  del_sitio: number
  de_competidores: number
  fallidos: Array<{ url: string; causa: string }>
  /** filas con la forma del lector del sitio, para que el camino normal de unidades las lea como una página más del sitio propio */
  filas: FilaCruda[]
}

export async function leerDocumentosDeLosSitios(a: {
  filas: FilaCruda[]
  ahora: Date
  fetchImpl?: Traer
  /** guarda la página de un competidor; ausente = no se guarda (ensayo) */
  guardarDePagina?: (p: { url: string; titulo: string; texto: string; paginas: number; competitor_id: string }) => Promise<boolean>
  max?: number
  leer?: typeof leerArchivo
}): Promise<ResultadoDeDocumentos> {
  const cand = pdfsDeLasFilas(a.filas, a.max ?? MAX_PDF_POR_CORRIDA)
  const res: ResultadoDeDocumentos = { candidatos: cand.length, leidos: 0, del_sitio: 0, de_competidores: 0, fallidos: [], filas: [] }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const leer = a.leer ?? leerArchivo
  for (const c of cand) {
    try {
      const r = await traer(c.url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/pdf' }, signal: AbortSignal.timeout(MS_DE_DESCARGA) })
      if (!r.ok) { res.fallidos.push({ url: c.url, causa: `HTTP ${r.status}` }); continue }
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length > TOPES.pdf_bytes) { res.fallidos.push({ url: c.url, causa: `demasiado grande · ${bytes.length} B` }); continue }
      const l = await leer({ nombre: c.nombre, base64: bytes.toString('base64'), tipo: 'pdf' })
      if (l.estado !== 'ok' || !l.texto.trim()) { res.fallidos.push({ url: c.url, causa: `${l.estado}${l.motivo ? ' · ' + String(l.motivo).slice(0, 100) : ''}` }); continue }
      if (c.rol === 'competidor') {
        if (a.guardarDePagina && c.competitor_id) {
          const ok = await a.guardarDePagina({ url: c.url, titulo: c.nombre, texto: l.texto.slice(0, 1_000_000), paginas: l.paginas ?? 1, competitor_id: c.competitor_id })
          if (!ok) { res.fallidos.push({ url: c.url, causa: 'la tabla rechazó la página del competidor' }); continue }
        }
        res.de_competidores++
      } else {
        res.filas.push({ id: c.fila_id, apify_function: 'website_content_scraper', params: { startUrls: [{ url: c.url }] }, respuesta: [{ url: c.url, text: l.texto, metadata: { title: c.nombre, documento_de: c.pagina } }], ensayo: false, metadata: { llamado_por: 'portero-alimentar#documento' }, created_at: a.ahora.toISOString() } as unknown as FilaCruda)
        res.del_sitio++
      }
      res.leidos++
    } catch (e) {
      res.fallidos.push({ url: c.url, causa: (e instanceof Error ? e.message : String(e)).slice(0, 100) })
    }
  }
  return res
}
