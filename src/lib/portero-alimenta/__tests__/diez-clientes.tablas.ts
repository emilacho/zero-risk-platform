import { AHORA } from './fixtures-despertar'
import type { ClienteSintetico } from './diez-clientes.fixtures'

export type T = Record<string, Array<Record<string, unknown>>>
/** las tablas que el cerebro ve de un cliente sintético: ficha, sedes, datos de sede, manual, plan y el raspado crudo (web, Mapas con un homónimo, Instagram) */
export function tablasDe(c: ClienteSintetico): T {
  const t0 = new Date(AHORA.getTime() - 3_600_000).toISOString()
  const filas: Array<Record<string, unknown>> = []
  if (c.web && c.pagina.length) filas.push({ id: `${c.id}-w`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t0, params: {}, metadata: { llamado_por: 'LyVoKcrypS5uLyuu' }, respuesta: [{ url: `${c.web}/`, text: `${c.pagina.join('\n')}\n${c.transitorio}` }] })
  if (c.mapas) filas.push({ id: `${c.id}-m`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: t0, params: {}, respuesta: [
    { title: c.nombre, url: 'https://maps.example/p', address: `${c.sedes[0]?.direccion ?? 'Calle 1'}`, city: c.sedes[0]?.ciudad, totalScore: 4.6, reviewsCount: 31, openingHours: [{ day: 'lunes', hours: '8 AM to 6 PM' }], location: { lat: -0.18, lng: -78.48 } },
    { title: c.homonimo.titulo, url: 'https://maps.example/h', address: `Av. Otra 99, ${c.homonimo.ciudad}`, city: c.homonimo.ciudad, totalScore: 3.1, reviewsCount: 5 }] })
  if (c.ig) filas.push({ id: `${c.id}-i`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: t0, params: {}, respuesta: [{ username: c.ig, biography: c.bio, followersCount: 1200, postsCount: 40, latestPosts: [{ shortCode: 'P1', caption: `Una novedad de ${c.nombre} para toda la semana, no te la pierdas`, ownerUsername: c.ig, type: 'Video' }] }] })
  return {
    clients: [{ id: c.id, name: c.nombre, slug: c.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), website_url: c.web, industry: c.rubro, country: c.pais, config: { registro: c.voz, ...(c.config ?? {}), apify: { ...(((c.config ?? {}) as { apify?: object }).apify ?? {}), ...(c.ig ? { own_handles: { instagram: c.ig } } : {}) } } }],
    client_sedes: c.sedes.map((s) => ({ id: `${c.id}-${s.clave}`, client_id: c.id, ciudad: s.ciudad, clave: s.clave })),
    client_sede_datos: c.sedes.flatMap((s) => [{ client_id: c.id, sede_id: `${c.id}-${s.clave}`, campo: 'direccion', valor_texto: s.direccion, fuente: 'dueno', observado_en: t0 }, ...(s.tipo_de_atencion ? [{ client_id: c.id, sede_id: `${c.id}-${s.clave}`, campo: 'tipo_de_atencion', valor_texto: s.tipo_de_atencion, fuente: 'dueno', observado_en: t0 }] : [])]),
    client_brand_books: [{ id: 'mb', client_id: c.id }],
    client_historical_outputs: [{ id: 'pl', client_id: c.id, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    apify_raw: filas, cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [],
  }
}
