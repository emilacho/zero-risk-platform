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

/** el flujo del portero diario: su id marca lo que el portero llama (`apify_raw.metadata.llamado_por` empieza con él) y lo que registra en `agent_invocations` */
export const FLUJO_DEL_PORTERO = 'ogfq56oIEoHufFPM'
export interface FilaDeRaspadoDeOrigen { apify_function: string; created_at: string; metadata?: unknown }
/** ¿quien llamó fue el portero? (corrida diaria, sus tandas y artículos `<id>#…`, el despertar o una medición suya) */
export const llamadaDelPortero = (llamadoPor: unknown, flujo: string = FLUJO_DEL_PORTERO): boolean => typeof llamadoPor === 'string' && (llamadoPor.startsWith(flujo) || /portero/i.test(llamadoPor))
/** el modelo del portero: su agente, o cualquier cosa registrada desde su flujo */
export const invocacionDelPortero = (f: { agent_name?: unknown; workflow_id?: unknown }, flujo: string = FLUJO_DEL_PORTERO): boolean => f.agent_name === 'portero-del-cerebro' || f.workflow_id === flujo
/** la ventana en que el libro registra una llamada DESPUÉS de que el crudo se guardó (medido 14-oct: 1–84 s; el libro espera a que Apify cierre la cuenta) */
const HOLGURA_ATRAS_MS = 180_000
const HOLGURA_ADELANTE_MS = 5_000

export interface FilaDelLibro { service: string; amount_usd: number | string | null; created_at: string; description?: string | null }
export interface GastoDelDia { apify_usd: number; modelo_usd: number; total_usd: number; filas_sin_importe: number; estimado_por_maximo_usd: number }

const r6 = (n: number) => Math.round(n * 1e6) / 1e6
/**
 * SOLO LO DEL PORTERO (15-oct · prerrequisito del plan v3: un plan del mismo día, ≈ US$ 2,4, no puede apagar al portero). El libro (`costs`) no dice quién llamó; el crudo
 * (`apify_raw`) sí (`metadata.llamado_por`) y se guarda segundos ANTES que la fila del libro. Cada llamada del libro se empareja, en orden, con el crudo más antiguo de la misma función que aún no
 * tiene pareja dentro de la ventana; si ese crudo lo llamó el portero, cuenta; si lo llamó otro (plan, alta, a mano), NO.
 * SIN pareja (no hay crudo que la explique, o filas viejas) o con pareja SIN `llamado_por`: CUENTA como del portero: no se subestima su gasto. Las filas de otros clientes pasan sin tocar (se filtran después).
 */
export function soloLoDelPortero(libro: FilaDelLibro[], crudo: FilaDeRaspadoDeOrigen[], clientId: string, flujo: string = FLUJO_DEL_PORTERO): { libro: FilaDelLibro[]; fuera_del_portero: FilaDelLibro[]; sin_origen: number } {
  const usado = new Set<number>()
  const porFuncion = new Map<string, Array<{ i: number; t: number; llamadoPor: unknown }>>()
  crudo.forEach((r, i) => {
    const k = r.apify_function
    if (!porFuncion.has(k)) porFuncion.set(k, [])
    porFuncion.get(k)!.push({ i, t: Date.parse(r.created_at), llamadoPor: (r.metadata as { llamado_por?: unknown } | null | undefined)?.llamado_por })
  })
  for (const v of porFuncion.values()) v.sort((a, b) => a.t - b.t)
  const propias = libro.filter((f) => f.service.startsWith('apify:') && deEsteCliente(f, clientId) && esDetalle(f)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const fuera = new Set<FilaDelLibro>()
  let sinOrigen = 0
  for (const f of propias) {
    const fn = f.service.slice('apify:'.length)
    const t = Date.parse(f.created_at)
    const par = (porFuncion.get(fn) ?? []).find((c) => !usado.has(c.i) && c.t <= t + HOLGURA_ADELANTE_MS && c.t >= t - HOLGURA_ATRAS_MS)
    if (!par) { sinOrigen++; continue }
    usado.add(par.i)
    // solo es «de otro» si el crudo DICE quién llamó y no fue el portero; un crudo sin `llamado_por` no explica nada: cuenta (no se subestima)
    if (typeof par.llamadoPor === 'string' && par.llamadoPor.trim() && !llamadaDelPortero(par.llamadoPor, flujo)) fuera.add(f)
  }
  return { libro: libro.filter((f) => !fuera.has(f)), fuera_del_portero: [...fuera], sin_origen: sinOrigen }
}
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
