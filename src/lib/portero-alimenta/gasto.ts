/**
 * EL GASTO DEL DÍA POR CLIENTE · lo que el tope tiene que VER (hallazgo 6 del 14-oct: el libro marca 0/null para Mapas y reseñas, y el tope de US$ por cliente
 * y día no veía ese gasto). PURO.
 * Regla: una fila del libro de Apify con importe real vale lo que dice; una fila SIN importe (0 o nulo) vale su MÁXIMO declarado (`COSTO_MAXIMO_POR_FUNCION`):
 * contar de más corta antes, contar de menos deja pasar un gasto. El modelo del portero se suma desde el libro de invocaciones.
 */

/** máximo por corrida de cada función cuando el libro no trae importe · medido ✔ o declarado * (se corrige con el primer ensayo real) */
export const COSTO_MAXIMO_POR_FUNCION: Record<string, { usd: number; medido: boolean }> = {
  // MEDIDOS el 14-oct con la API de Apify (usageTotalUsd por corrida; el Servicio no devuelve `apify_run_id`, por eso el libro quedaba ciego)
  website_content_scraper: { usd: 0.0536, medido: true }, // medido 0,004–0,029 por página; 0,0536 = techo de 243 corridas del 10-oct
  instagram_scraper: { usd: 0.0025, medido: true }, // 0,0023–0,0026 (12 publicaciones)
  own_google_maps_profile: { usd: 0.007, medido: true }, // POR BÚSQUEDA (una por sede): 0,0032 (1) · 0,0212 (3)
  instagram_post_comments_scraper: { usd: 0.07, medido: true }, // 50 comentarios, 3 publicaciones: 0,069
  google_serp_scraper: { usd: 0.003, medido: true }, // 0,00255 por búsqueda
  resenas_google_maps: { usd: 0.002, medido: true }, // 26 reseñas = 0,00005; 100 ≈ 0,0002; 0,002 es holgura declarada
  videos_instagram: { usd: 0.56, medido: true }, // 10 videos con transcripción = 0,557 (≈ 0,056 por video; el plan lo multiplica por los videos pedidos)
  videos_youtube: { usd: 0.09, medido: true }, // 10 videos (12-oct)
  videos_tiktok: { usd: 0.05, medido: true }, // 10 videos (12-oct)
  // SIN MEDIR: estimaciones declaradas
  youtube_comments_scraper: { usd: 0.07, medido: false },
  resenas_facebook: { usd: 0.08, medido: false },
  resenas_tripadvisor: { usd: 0.08, medido: false },
  resenas_booking: { usd: 0.08, medido: false },
  resenas_app_store: { usd: 0.05, medido: false },
  trustpilot_scraper: { usd: 0.05, medido: false },
  software_review_scraper: { usd: 0.05, medido: false },
  publicaciones_facebook: { usd: 0.05, medido: false },
  menciones_en_redes: { usd: 0.14, medido: true }, // 23 publicaciones = 0,048 (14-oct); US$ 0,0027 por publicación; techo de 50 = 0,135
}
/** videos de Instagram con transcripción: costo medido por video (10 videos = 0,557) */
export const VIDEO_DE_INSTAGRAM_USD = 0.056
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
