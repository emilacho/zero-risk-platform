/** Fixtures compartidos de las pruebas del despertar (3 rubros · tuteo y voseo). */
import { crearBaseFalsa } from './base-falsa'
import type { DepsDeDespertar } from '../despertar'
import type { Interruptores } from '../datos'

export const ON: Interruptores = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
export const ALTA = new Date('2026-10-15T14:00:00Z')
export const AHORA = new Date('2026-10-15T15:00:00Z')
export const REAL = { dry_run: false, workflow_id: 'LyVoKcrypS5uLyuu', workflow_execution_id: 'ex-alta-1' }
export const PORTERO = 'ogfq56oIEoHufFPM'

export interface Caso { id: string; nombre: string; rubro: string; pais: string; ciudad: string; voz: 'tuteo' | 'voseo'; web: string | null; ig: string; pagina: string; bio: string; homonimo: string }
export const CASOS: Caso[] = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Clínica Sonrisa Norte', rubro: 'clínica dental y ortodoncia', pais: 'Ecuador', ciudad: 'Quito', voz: 'tuteo', web: 'https://sonrisanorte.example', ig: 'sonrisanorte',
    pagina: 'Limpieza dental $35\nOrtodoncia desde $900\nAtendemos con cita previa por WhatsApp', bio: 'Somos la Clínica Sonrisa Norte, cuida tu sonrisa', homonimo: 'Clínica Sonrisa Norte de Guayaquil' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Taller Mecánico El Pistón', rubro: 'taller mecánico y lubricadora', pais: 'Argentina', ciudad: 'Rosario', voz: 'voseo', web: 'https://elpiston.example', ig: 'elpiston.ok',
    pagina: 'Cambio de aceite ARS 45.000\nAlineación y balanceo ARS 30.000\nPedí tu turno por WhatsApp', bio: 'Taller Mecánico El Pistón, pedí tu turno', homonimo: 'Taller Mecánico El Pistón de Córdoba' },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Flujo CRM', rubro: 'software CRM para pymes', pais: 'México', ciudad: 'Ciudad de México', voz: 'tuteo', web: 'https://flujocrm.example', ig: 'flujocrm',
    pagina: 'Plan Starter US$ 19 por mes\nPlan Pro US$ 49 por mes\nSoporte por chat de lunes a viernes', bio: 'Flujo CRM, ordena tu seguimiento de clientes', homonimo: 'Flujo CRM de Lima' },
]

export function tablas(c: Caso, o: { sinWeb?: boolean; edad?: number; conEnsayo?: boolean; sinRaspado?: boolean; homonimoEnMapas?: boolean } = {}) {
  const t0 = new Date(ALTA.getTime() - (o.edad ?? 0) * 3_600_000).toISOString()
  const web = o.sinWeb ? null : c.web
  const filas: Array<Record<string, unknown>> = o.sinRaspado ? [] : [
    ...(web ? [{ id: `${c.id}-w`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t0, params: { startUrls: [{ url: web }], maxCrawlPages: 6 }, metadata: { llamado_por: 'LyVoKcrypS5uLyuu' }, respuesta: [{ url: `${web}/`, text: c.pagina }] }] : []),
    { id: `${c.id}-m`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: t0, params: { searchStringsArray: [`${c.nombre} ${c.ciudad}`] }, respuesta: [{ title: o.homonimoEnMapas ? c.homonimo : c.nombre, url: `https://www.google.com/maps/place/${c.ig}`, address: `Av. Principal 123, ${o.homonimoEnMapas ? 'Otra Ciudad' : c.ciudad}`, openingHours: [{ day: 'lunes', hours: '8 AM to 6 PM' }] }] },
    { id: `${c.id}-i`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: t0, params: { usernames: [c.ig], resultsLimit: 12 }, respuesta: [{ username: c.ig, biography: c.bio, latestPosts: [{ shortCode: 'P1', caption: 'Bienvenidos a la semana con muchas novedades para todos', ownerUsername: c.ig, type: 'Video' }] }] },
  ]
  if (o.conEnsayo) filas.push({ id: `${c.id}-e`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: true, created_at: t0, params: {}, respuesta: [{ url: `${c.web}/`, text: 'TEXTO-DE-ENSAYO-QUE-NUNCA-DEBE-ENTRAR precio sintético $1 por todo' }] })
  return {
    clients: [{ id: c.id, name: c.nombre, website_url: web, industry: c.rubro, country: c.pais, config: { registro: c.voz, apify: { own_handles: { instagram: c.ig } } } }],
    client_sedes: [{ client_id: c.id, ciudad: c.ciudad, clave: c.ciudad.toLowerCase() }],
    client_brand_books: [{ id: 'mb', client_id: c.id }],
    client_historical_outputs: [{ id: 'pl', client_id: c.id, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    apify_raw: filas, cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [],
  } as Record<string, Array<Record<string, unknown>>>
}

export function montar(t: Record<string, Array<Record<string, unknown>>>, o: { apagarOk?: boolean; avisarOk?: boolean; puenteFalla?: boolean; ahora?: Date; fallaEn?: string; fallaVeces?: number; saltar?: number } = {}) {
  const base = crearBaseFalsa(t as never, { fallaEn: o.fallaEn, fallaVeces: o.fallaVeces, saltar: o.saltar, reloj: () => (o.ahora ?? AHORA).toISOString() })
  const apagados: string[] = [], avisos: string[] = [], pasadas: number[] = [], esperas: number[] = []
  const deps: DepsDeDespertar = {
    db: base.db, interruptores: ON, ahora: o.ahora ?? AHORA,
    // el puente simulado escribe los trozos de las fichas que recibe (en lotes de 5) para que la reconciliación converja
    puente: async (p) => {
      if (o.puenteFalla) return { escritos: 0, sacados: 0, errores: ['ingest-source respondió 502'] }
      const lote = p.escribir.slice(0, 5)
      pasadas.push(lote.length)
      for (const x of lote) (t.client_brain_chunks ??= []).push({ client_id: p.client_id, source_table: 'cerebro_fichas', source_id: x.source_id })
      return { escritos: lote.length, sacados: 0, errores: [] }
    },
    apagar: async (w) => { apagados.push(w); return { ok: o.apagarOk !== false, detalle: 'flujo desactivado' } },
    avisar: async (x) => { avisos.push(x); return { ok: o.avisarOk !== false, detalle: 'entregado' } },
    esperar: async (ms) => { esperas.push(ms) },
    workflowIdPortero: PORTERO,
  }
  return { base, deps, apagados, avisos, pasadas, esperas }
}
export const fichasVivas = (t: Record<string, Array<Record<string, unknown>>>) => (t.cerebro_fichas ?? []).filter((f) => !f.descartada && !f.retirada_en)

