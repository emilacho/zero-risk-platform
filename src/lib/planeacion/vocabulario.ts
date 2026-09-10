/**
 * Canon canonical · EL VOCABULARIO · los objetivos del plan ⇄ los nombres del proveedor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SON DOS IDIOMAS DISTINTOS, Y NADIE TRADUCÍA
 * ═══════════════════════════════════════════════════════════════════════════
 * `elegir brazos` habla el idioma del PLAN: `sitio_propio` · `ficha_mapa` ·
 * `redes_sociales` · `biblioteca_anuncios` · `tendencias_busqueda` ·
 * `competidores_precio` (medido · salidas reales de B1, 09-sep).
 *
 * El Servicio de raspado habla el idioma del PROVEEDOR: 20 nombres exactos, y
 * cualquier otra cosa la contesta `rechazado` (nodo `Validate Body` del flujo
 * vivo `3lyknrP3PoS2KzUf`).
 *
 * 🔴 Sin traducción, el pedido `sitio_propio` salía RECHAZADO y llegaba al plan
 * como un HUECO — «no pudimos verificar el sitio del cliente»— cuando la verdad
 * es que nadie preguntó nada: la palabra estaba mal. Un hueco que en realidad es
 * un error de vocabulario es de los peores: se lee como si la fuente hubiera
 * fallado.
 *
 * 📌 Y la traducción NO es uno a uno. `redes_sociales` es UN objetivo del plan y
 * CINCO corridas del proveedor (canon redes sociales: Instagram + Facebook +
 * TikTok + LinkedIn + **YouTube**, siempre las cinco).
 */

/**
 * Canon canonical · los 20 nombres que el proveedor acepta.
 * 🔴 Congelado desde el flujo VIVO el 2026-09-10 (`Validate Body` ·
 * `ALLOWED_FUNCTIONS`), no desde la memoria de nadie. Si el Servicio suma un
 * raspador, esta lista se vuelve a copiar de ahí — no se adivina.
 */
export const FUNCIONES_DEL_PROVEEDOR = [
  'facebook_ads_library_scraper',
  'instagram_scraper',
  'instagram_post_comments_scraper',
  'linkedin_company_scraper',
  'tiktok_profile_scraper',
  'google_ads_scraper',
  'tiktok_creative_center_scraper',
  'youtube_channel_scraper',
  'youtube_video_scraper',
  'youtube_comments_scraper',
  'google_serp_scraper',
  'google_maps_scraper',
  'similarweb_scraper',
  'trustpilot_scraper',
  'software_review_scraper',
  'twitter_scraper',
  'website_content_scraper',
  'own_google_maps_profile',
  'competitor_website_scraper',
  'facebook_page_scraper',
] as const
export type FuncionProveedor = (typeof FUNCIONES_DEL_PROVEEDOR)[number]

const ES_DEL_PROVEEDOR = new Set<string>(FUNCIONES_DEL_PROVEEDOR)

/**
 * Canon canonical · LA TABLA · objetivo del plan → funciones del proveedor.
 * Medida contra las salidas reales de `elegir brazos` (B1 · 09-sep · las dos
 * industrias) y contra los 20 nombres de arriba. No hay entradas inventadas:
 * lo que el plan no pide, no está.
 */
export const TRADUCCION: Readonly<Record<string, ReadonlyArray<FuncionProveedor>>> = {
  // los que se piden SIEMPRE
  sitio_propio: ['website_content_scraper'],
  // 🔴 la ficha del negocio es la PROPIA · `google_maps_scraper` es la del
  // competidor, y confundirlas archiva la ficha del cliente como si fuera ajena
  // (pasó el 06-sep: quedó como `google_maps_competitive`).
  ficha_mapa: ['own_google_maps_profile'],
  // 🔴 UN objetivo del plan · CINCO corridas · canon redes sociales completo
  redes_sociales: [
    'instagram_scraper',
    'facebook_page_scraper',
    'tiktok_profile_scraper',
    'linkedin_company_scraper',
    'youtube_channel_scraper',
  ],
  biblioteca_anuncios: ['facebook_ads_library_scraper'],
  tendencias_busqueda: ['google_serp_scraper'],
  // el condicional que sí es raspado
  competidores_precio: ['competitor_website_scraper'],
}

/**
 * Canon canonical · objetivos que el plan conoce y que **NO son de este brazo**.
 * Llegan acá sólo si alguien los mandó a la puerta equivocada · y eso se dice,
 * no se convierte en un hueco mudo.
 */
export const DE_OTRO_BRAZO: Readonly<Record<string, string>> = {
  analitica_propia: 'posthog',
  cerebro_cliente: 'cerebro',
  costo_pauta: 'plataforma',
}

/**
 * Canon canonical · objetivos del catálogo del plan para los que el proveedor
 * **no tiene con qué**. Se declaran: «no hay herramienta», que no es lo mismo
 * que «no hay dato» ni que «la palabra está mal».
 */
export const SIN_HERRAMIENTA: Readonly<Record<string, string>> = {
  velocidad_sitio: 'ninguno de los 20 raspadores mide velocidad de un sitio',
  alojamiento_capacidad: 'ninguno de los 20 raspadores mira alojamiento ni capacidad',
  manual_de_marca: 'no es objetivo de recolección · entra antes de los brazos, no por acá',
}

export type Traduccion =
  | { readonly ok: true; readonly funciones: ReadonlyArray<FuncionProveedor>; readonly tal_cual: boolean }
  | { readonly ok: false; readonly motivo: string }

/**
 * Canon canonical · traduce, o dice por qué no puede.
 *
 * 🔴 Nunca deja pasar una palabra sin traducir hacia el Servicio: el Servicio
 * la contestaría `rechazado` y el plan lo leería como un hueco de la fuente.
 * Es más barato y más honesto cortarlo acá, con el motivo escrito.
 */
export function traducir(objetivo: string): Traduccion {
  const o = String(objetivo ?? '').trim()
  if (!o) return { ok: false, motivo: 'el objetivo vino vacío' }

  // ya viene en el idioma del proveedor · pasa tal cual y se declara
  if (ES_DEL_PROVEEDOR.has(o)) {
    return { ok: true, funciones: [o as FuncionProveedor], tal_cual: true }
  }

  const funciones = TRADUCCION[o]
  if (funciones) return { ok: true, funciones, tal_cual: false }

  const otro = DE_OTRO_BRAZO[o]
  if (otro) {
    return {
      ok: false,
      motivo: `el objetivo "${o}" NO es de raspado · es del brazo ${otro} · se pidió a la puerta equivocada`,
    }
  }

  const sin = SIN_HERRAMIENTA[o]
  if (sin) {
    return {
      ok: false,
      motivo: `el objetivo "${o}" no tiene herramienta que lo cubra · ${sin} · NO es que no haya dato`,
    }
  }

  return {
    ok: false,
    motivo:
      `el objetivo "${o}" no existe en el vocabulario · el plan lo llama así y el proveedor no ` +
      `tiene ese nombre · los que sí se traducen son: ${Object.keys(TRADUCCION).join(', ')}`,
  }
}
