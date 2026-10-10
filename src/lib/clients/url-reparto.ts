/**
 * D-3 (firmado): campo OPCIONAL del alta con las direcciones de las páginas de reparto del cliente (apps de reparto donde aparece su negocio).
 * Vive en `clients.config.apify.url_reparto` (lista); el portero diario las lee y, sin ellas, la fuente queda «no cubierta». PURO.
 * El alta se acepta CON LO QUE VENGA: una dirección mala se descarta y se DECLARA, nunca rechaza el alta.
 */
export const MAX_URL_REPARTO = 5
const MAX_LARGO = 500

export interface UrlsDeReparto { validas: string[]; descartadas: string[] }

/** acepta una lista, o un texto con direcciones separadas por coma, punto y coma o salto de línea; solo http(s) con dominio; sin repetidas */
export function urlsDeReparto(entrada: unknown): UrlsDeReparto {
  const crudas: unknown[] = Array.isArray(entrada) ? entrada : typeof entrada === 'string' ? entrada.split(/[\n,;]+/) : []
  const validas: string[] = []
  const descartadas: string[] = []
  for (const c of crudas) {
    const t = typeof c === 'string' ? c.trim() : ''
    if (!t) continue
    let ok = false
    if (t.length <= MAX_LARGO && /^https?:\/\//i.test(t)) {
      try { const u = new URL(t); ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') } catch { ok = false }
    }
    if (!ok) { descartadas.push(t.slice(0, 120)); continue }
    if (validas.includes(t)) continue
    if (validas.length >= MAX_URL_REPARTO) { descartadas.push(t.slice(0, 120)); continue }
    validas.push(t)
  }
  return { validas, descartadas }
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** devuelve la config con `apify.url_reparto` puesta y TODO lo demás igual (otras claves de config y de apify intactas) */
export function fusionarUrlReparto(config: unknown, urls: string[]): Record<string, unknown> {
  const c = obj(config)
  return { ...c, apify: { ...obj(c.apify), url_reparto: urls } }
}
