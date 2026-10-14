/**
 * EL GASTO DEL DÍA POR CLIENTE · lo que el tope tiene que VER (hallazgo 6 del 14-oct: el libro marca 0/null para Mapas y reseñas, y el tope de US$ por cliente
 * y día no veía ese gasto). PURO.
 * Regla: una fila del libro de Apify con importe real vale lo que dice; una fila SIN importe (0 o nulo) vale su MÁXIMO declarado (`COSTO_MAXIMO_POR_FUNCION`):
 * contar de más corta antes, contar de menos deja pasar un gasto. El modelo del portero se suma desde el libro de invocaciones.
 */

/** máximo por corrida de cada función cuando el libro no trae importe · medido ✔ o declarado * (se corrige con el primer ensayo real) */
export const COSTO_MAXIMO_POR_FUNCION: Record<string, { usd: number; medido: boolean }> = {
  website_content_scraper: { usd: 0.0536, medido: true },
  instagram_scraper: { usd: 0.005, medido: false },
  own_google_maps_profile: { usd: 0.1, medido: false },
  instagram_post_comments_scraper: { usd: 0.05, medido: false },
  youtube_comments_scraper: { usd: 0.05, medido: false },
  resenas_google_maps: { usd: 0.1, medido: false },
  resenas_facebook: { usd: 0.08, medido: false },
  resenas_tripadvisor: { usd: 0.08, medido: false },
  resenas_booking: { usd: 0.08, medido: false },
  resenas_app_store: { usd: 0.05, medido: false },
  trustpilot_scraper: { usd: 0.05, medido: false },
  software_review_scraper: { usd: 0.05, medido: false },
  publicaciones_facebook: { usd: 0.05, medido: false },
  videos_instagram: { usd: 0.17, medido: true },
  videos_youtube: { usd: 0.09, medido: true },
  videos_tiktok: { usd: 0.05, medido: true },
  google_serp_scraper: { usd: 0.02, medido: false },
  menciones_en_redes: { usd: 0.1, medido: false },
}
export const COSTO_MAXIMO_POR_OMISION_USD = 0.0536

export interface FilaDelLibro { service: string; amount_usd: number | string | null; created_at: string; description?: string | null }
export interface GastoDelDia { apify_usd: number; modelo_usd: number; total_usd: number; filas_sin_importe: number; estimado_por_maximo_usd: number }

const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const dia = (iso: string) => iso.slice(0, 10)
const deEsteCliente = (f: FilaDelLibro, clientId: string): boolean => {
  if (!f.description) return false
  try { const d = JSON.parse(f.description) as { client_id?: unknown }; return d.client_id === clientId } catch { return f.description.includes(clientId) }
}
const esDetalle = (f: FilaDelLibro): boolean => { try { return (JSON.parse(f.description ?? '{}') as { es?: unknown }).es === 'detalle_de_llamada' } catch { return false } }

/**
 * `libro` = filas de `costs` (service `apify:<funcion>`) de HOY; `invocaciones` = `agent_invocations` de hoy del cliente (cost_usd).
 * Solo se cuentan las filas de LLAMADA (`detalle_de_llamada`); la fila `reconciliacion_del_dia` ya las resume y no se suma otra vez.
 */
export function gastoDelDia(o: { clientId: string; ahora: Date; libro: FilaDelLibro[]; invocacionesUsd: number[]; /** máximo por llamada que reemplaza al declarado (p. ej. Mapas = búsquedas por sede × máximo) */ maximoPorLlamada?: Record<string, number> }): GastoDelDia {
  const hoy = dia(o.ahora.toISOString())
  let apify = 0, sinImporte = 0, porMaximo = 0
  for (const f of o.libro) {
    if (!f.service.startsWith('apify:') || dia(f.created_at) !== hoy || !deEsteCliente(f, o.clientId) || !esDetalle(f)) continue
    const importe = Number(f.amount_usd)
    if (Number.isFinite(importe) && importe > 0) { apify += importe; continue }
    sinImporte++
    const fn = f.service.slice('apify:'.length)
    const max = o.maximoPorLlamada?.[fn] ?? COSTO_MAXIMO_POR_FUNCION[fn]?.usd ?? COSTO_MAXIMO_POR_OMISION_USD
    apify += max; porMaximo += max
  }
  const modelo = o.invocacionesUsd.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)
  return { apify_usd: r6(apify), modelo_usd: r6(modelo), total_usd: r6(apify + modelo), filas_sin_importe: sinImporte, estimado_por_maximo_usd: r6(porMaximo) }
}
