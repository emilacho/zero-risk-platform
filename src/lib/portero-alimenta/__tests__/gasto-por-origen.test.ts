/**
 * Mejora 2 (15-oct) · el vigilante cuenta el gasto por ORIGEN, nunca por parecido, y un ensayo nunca es gasto.
 * Hecho medido el 15-oct: el día marcó US$ 1,16 con US$ 0,24 reales: los ensayos (filas sin importe, sin crudo de pareja) valían su MÁXIMO y 1 video pedido contó 0,56.
 * US$ 0 · base falsa · ≥ 3 rubros (el gasto no depende del rubro).
 */
import { describe, expect, it } from 'vitest'
import { gastoDeHoy } from '../rutas'
import { origenDelPortero, soloLoDelPortero, gastoDelDia, FLUJO_DEL_PORTERO, VIDEO_DE_INSTAGRAM_USD } from '../gasto'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-10-15T13:00:00Z')
const WF = FLUJO_DEL_PORTERO
type Fila = Record<string, unknown>

function fila(fn: string, t: string, usd: number | null, d: Record<string, unknown>, cliente: string): Fila {
  return { service: `apify:${fn}`, amount_usd: usd, created_at: new Date(Date.parse(t) + 60_000).toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: cliente, funcion: fn, ...d }) }
}
function crudo(fn: string, t: string, cliente: string, extra: Fila = {}): Fila {
  return { id: `r-${fn}-${t}`, client_id: cliente, apify_function: fn, ensayo: false, created_at: t, metadata: {}, params: {}, ...extra }
}
async function gasto(costs: Fila[], raw: Fila[], cliente: string) {
  const base = crearBaseFalsa({ costs, apify_raw: raw, agent_invocations: [] } as never)
  const g = await gastoDeHoy(base.db, cliente, AHORA)
  if (!g.ok) throw new Error(g.detalle)
  return g
}
const RUBROS = [
  { rubro: 'restaurante de mariscos', cliente: '11111111-1111-4111-8111-111111111111' },
  { rubro: 'clínica dental', cliente: '22222222-2222-4222-8222-222222222222' },
  { rubro: 'software B2B', cliente: '33333333-3333-4333-8333-333333333333' },
]

describe('origenDelPortero', () => {
  it('portero y sus variantes cuentan; plan, alta, manual y otros no', () => {
    for (const o of ['portero', 'portero-diaria', 'portero:repaso']) expect(origenDelPortero(o)).toBe(true)
    for (const o of ['plan', 'alta', 'manual', 'portero2x', 'sin_origen', '']) expect(origenDelPortero(o)).toBe(false)
  })
})

describe.each(RUBROS)('el gasto del día · $rubro', ({ cliente }) => {
  it('los ensayos (dry_run, sin importe) NO cuentan: el día de hoy no se infla con sus máximos', async () => {
    const t = '2026-10-15T14:25:09Z'
    const ensayos = ['facebook_ads_library_scraper', 'google_maps_scraper', 'website_content_scraper', 'instagram_scraper'].map((fn) => fila(fn, t, 0, { ensayo: true }, cliente))
    const real = fila('website_content_scraper', '2026-10-15T12:30:00Z', 0.04, { ensayo: false }, cliente)
    const g = await gasto([...ensayos, real], [crudo('website_content_scraper', '2026-10-15T12:30:00Z', cliente, { metadata: { llamado_por: WF } })], cliente)
    expect(g.gasto.total_usd).toBeCloseTo(0.04, 6)
    expect(g.gasto.filas_sin_importe).toBe(0)
  })
  it('SIN el arreglo habrían contado: una fila sin importe y sin ensayo declarado sí vale su máximo (se mantiene la prudencia)', async () => {
    const f = fila('facebook_ads_library_scraper', '2026-10-15T14:25:09Z', 0, {}, cliente)
    const g = await gasto([f], [], cliente)
    expect(g.gasto.total_usd).toBeCloseTo(0.15, 6)
  })
  it('la fila que dice su origen manda: plan afuera, portero adentro (aunque el crudo diga otra cosa)', async () => {
    const t = '2026-10-15T12:30:00Z'
    const costs = [
      fila('website_content_scraper', t, 0.6, { origen: 'plan' }, cliente),
      fila('instagram_scraper', '2026-10-15T12:31:00Z', 0.2, { origen: 'portero' }, cliente),
      fila('google_serp_scraper', '2026-10-15T12:32:00Z', 0.1, { origen: 'portero' }, cliente),
    ]
    const raw = [crudo('google_serp_scraper', '2026-10-15T12:32:00Z', cliente, { metadata: { llamado_por: 'plan-v3-sala' } })]
    const g = await gasto(costs, raw, cliente)
    expect(g.gasto.total_usd).toBeCloseTo(0.3, 6)
    expect(g.fuera_del_portero_usd).toBeCloseTo(0.6, 6)
  })
  it('una fila vieja sin origen o «sin_origen» se empareja como antes (el plan de otro NO cuenta)', async () => {
    const t = '2026-10-15T09:00:00Z'
    const costs = [fila('website_content_scraper', t, 0.6, { origen: 'sin_origen' }, cliente), fila('instagram_scraper', '2026-10-15T12:30:00Z', 0.2, {}, cliente)]
    const raw = [crudo('website_content_scraper', t, cliente, { metadata: { llamado_por: 'plan-v3-sala' } }), crudo('instagram_scraper', '2026-10-15T12:30:00Z', cliente, { metadata: { llamado_por: WF } })]
    const g = await gasto(costs, raw, cliente)
    expect(g.gasto.total_usd).toBeCloseTo(0.2, 6)
  })
  it('1 video pedido sin importe en el libro vale 1 × 0,056, no el máximo de 10 (0,56)', async () => {
    const t = '2026-10-15T15:04:37Z'
    const g = await gasto([fila('videos_instagram', t, null, { origen: 'portero' }, cliente)], [crudo('videos_instagram', t, cliente, { params: { resultsLimit: 1 } })], cliente)
    expect(g.gasto.total_usd).toBeCloseTo(VIDEO_DE_INSTAGRAM_USD, 6)
    const g3 = await gasto([fila('videos_instagram', t, null, { origen: 'portero' }, cliente)], [crudo('videos_instagram', t, cliente, { params: { resultsLimit: 3 } })], cliente)
    expect(g3.gasto.total_usd).toBeCloseTo(VIDEO_DE_INSTAGRAM_USD * 3, 6)
  })
})

describe('puros', () => {
  it('gastoDelDia ignora un ensayo aunque llegue directo', () => {
    const f = fila('google_maps_scraper', '2026-10-15T11:04:37Z', 0, { ensayo: true }, 'c') as never
    expect(gastoDelDia({ clientId: 'c', ahora: AHORA, libro: [f], invocacionesUsd: [] }).total_usd).toBe(0)
  })
  it('soloLoDelPortero cuenta por qué descartó: por origen y por ensayo', () => {
    const libro = [fila('instagram_scraper', '2026-10-15T10:00:00Z', 0.1, { origen: 'plan' }, 'c'), fila('google_maps_scraper', '2026-10-15T11:00:00Z', 0, { ensayo: true }, 'c'), fila('google_serp_scraper', '2026-10-15T12:00:00Z', 0.1, { origen: 'portero' }, 'c')] as never
    const r = soloLoDelPortero(libro, [], 'c')
    expect(r.ensayos).toBe(1)
    expect(r.por_origen).toBe(2)
    expect(r.fuera_del_portero.length).toBe(2)
    expect(r.libro.length).toBe(1)
  })
})
