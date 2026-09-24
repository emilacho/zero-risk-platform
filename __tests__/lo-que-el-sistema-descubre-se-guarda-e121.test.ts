/**
 * 🔴 E121 · EL ANCLAJE DE COMPETIDORES NO PUEDE FALLAR POR EL NOMBRE · LO QUE EL SISTEMA DESCUBRE SE GUARDA.
 *
 * Medido (E120B · alta 149699 · versión viva a4b21ac8 · correos tachados en la evidencia):
 *   1. «[ANCHOR] Load client» pedía GET /api/clients?name=Náufrago → 409 client_name_ambiguous (3 fichas: la
 *      nueva + 2 lápidas) → guardia `_anchor.applied:false`. Y la rama por id de la ruta filtraba por
 *      `client_id`, columna que `clients` no tiene (la clave es `id`) → devolvía un STUB.
 *   2. `industry` quedó `unknown` (lo mandaba «Persist Client» con el valor por defecto del validador) y
 *      `market` vacío; el descubridor no tenía casilla para el rubro ni las ciudades del cliente.
 *   3. «[APIFY] Enrich competitors» salía con `client_id: null`.
 *
 * Fija: ① la ruta resuelve por `id` y el alta pregunta por `client_id` · ② dos casillas nuevas en los dos
 * espejos del emit (`client_industry` · `client_markets`), el filtro las conserva, el poblador escribe
 * industry/market SÓLO si están vacíos o unknown (nunca pisa lo de ventas) y «Persist» no manda `unknown` ·
 * ③ el enriquecimiento lleva el cliente de la corrida · nada más cambió. Sin red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── ruta /api/clients · mocks (mismo patrón que clients-lookup-by-name) ──
const mockAuth = vi.fn()
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (req: Request) => mockAuth(req) }))
const eqCalls: Array<[string, string]> = []
const filaPorId = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      if (table === 'clients') {
        return {
          select: (_cols: string) => ({
            ilike: () => ({ limit: () => ({ data: [], error: null }) }),
            eq: (col: string, val: string) => { eqCalls.push([col, val]); return { limit: () => ({ data: [], error: null }), maybeSingle: () => (col === 'id' ? filaPorId(val) : { data: null, error: null }) } },
            limit: () => ({ data: [], error: null }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }
    },
  }),
}))
vi.mock('@/lib/input-validator', () => ({ validateObject: (v: unknown) => ({ ok: true, data: v }) }))

import { GET } from '../src/app/api/clients/route'
import { populateClientConfigFromDiscovery, validateDiscoveryShape, type DiscoveryOutput } from '@/lib/discovery-output'
import { estaVacioOUnknown } from '../src/lib/discovery-output/populate-config'
import { construir as construirE121, QS_DESPUES } from '../scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e121.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging/LyVoKcrypS5uLyuu')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const ALTA_VIVO = leer('alta-antes-e121-a4b21ac8.json') as Flujo
const ALTA_HOY = leer('alta-construida-e121.json') as Flujo
const EV = leer('evidencia-149699-e121.json') as { validate_deal_data: any; load_client: any; guard: any; scrape_verify: any; enrich: any; rediscovery: any }
const CID = '058d06c4-7d83-4616-9ebc-290ca8752018'
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error(`falta ${n}`); return x }

beforeEach(() => { mockAuth.mockReset(); mockAuth.mockReturnValue({ ok: true }); eqCalls.length = 0; filaPorId.mockReset() })

describe('① el anclaje resuelve por identificador · la ruta y el alta', () => {
  it('rojo: en 149699 la ruta por nombre devolvió 409 con 3 candidatas (la activa + 2 lápidas) y el guardia no ancló', () => {
    expect(EV.load_client).toMatchObject({ ok: false, error: 'client_name_ambiguous' })
    expect(EV.load_client.candidates).toHaveLength(3)
    expect(EV.load_client.candidates.filter((c: any) => c.archived_at).length).toBe(2)
    expect(EV.guard._anchor).toEqual({ applied: false, reason: 'no_canonical' })
  })
  it('verde · ruta: GET ?client_id=<id> consulta la columna `id` y devuelve la fila con su config (no el stub)', async () => {
    const fila = EV.load_client.candidates.find((c: any) => c.status === 'onboarding')
    filaPorId.mockReturnValue({ data: fila, error: null })
    const res = await GET(new Request(`http://localhost:3000/api/clients?client_id=${CID}`, { headers: { 'x-api-key': 'test' } }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(eqCalls).toContainEqual(['id', CID])
    expect(j.ok).toBe(true)
    expect(j.fallback_mode).toBeUndefined()
    expect(j.id).toBe(CID)
    expect(j.config.apify.competitor_list).toHaveLength(8)
  })
  it('verde · alta: «Load client» pregunta por client_id (el de la corrida) y el guardia ancla con los 8 canónicos', () => {
    const qs = nodo(ALTA_HOY, '[ANCHOR] Load client (canonical competitor_list)').parameters.queryParameters.parameters
    expect(qs).toEqual([QS_DESPUES])
    const fila = EV.load_client.candidates.find((c: any) => c.status === 'onboarding')
    const loaded = { ok: true, client: fila, ...fila }
    const code = String(nodo(ALTA_HOY, '[ANCHOR] Guard geo+canonical').parameters.jsCode)
    const $ = (n: string) => ({ first: () => ({ json: n === 'Re-discovery INLINE (onboarding-specialist)' ? EV.rediscovery : loaded }), item: { json: EV.validate_deal_data } })
    const out = new Function('$', code)($)[0].json
    expect(out._anchor.applied).toBe(true)
    expect(out._anchor.canonical_count).toBe(8)
    expect(out.competitors.length).toBeGreaterThanOrEqual(8)
  })
})

describe('② lo que el sistema descubre se guarda · sólo lo vacío', () => {
  const emisor = readFileSync(join(process.cwd(), 'services/agent-runner/src/lib/mcp/discovery-output-server.js'), 'utf8')
  const forzado = readFileSync(join(process.cwd(), 'services/agent-runner/src/lib/forced-emit-messages.ts'), 'utf8')
  const tipos = readFileSync(join(process.cwd(), 'src/lib/discovery-output/types.ts'), 'utf8')
  it('las dos casillas están en los tres espejos (emisor zod · emit forzado · contrato de la plataforma)', () => {
    for (const k of ['client_industry', 'client_markets']) { expect(emisor).toContain(`${k}: z`); expect(forzado).toContain(`${k}: {`); expect(tipos).toContain(`readonly ${k}?:`) }
  })
  it('el filtro de la plataforma las conserva (y rechaza el tipo equivocado)', () => {
    const base = { client_id: CID, own_handles: { instagram: '@naufrago.ec' }, competitors: [{ name: 'Pez Azul' }] }
    const r = validateDiscoveryShape({ ...base, client_industry: ' restaurante de comida costera · ceviche y encebollado ', client_markets: ['Guayaquil', ' Olón, Santa Elena ', ''] }, CID) as { kind: string; value?: DiscoveryOutput; reason?: string }
    expect(r.kind).toBe('ok')
    expect(r.value?.client_industry).toBe('restaurante de comida costera · ceviche y encebollado')
    expect(r.value?.client_markets).toEqual(['Guayaquil', 'Olón, Santa Elena'])
    expect((validateDiscoveryShape({ ...base, client_industry: 7 }, CID) as any).reason).toBe('client_industry_not_string')
    expect((validateDiscoveryShape({ ...base, client_markets: 'Guayaquil' }, CID) as any).reason).toBe('client_markets_not_array')
    const sin = validateDiscoveryShape(base, CID) as any
    expect(sin.value).not.toHaveProperty('client_industry')
  })
  function fake(fila: { config?: any; industry?: any; market?: any }) {
    const updates: Array<Record<string, unknown>> = []
    const from = (_t: string) => ({
      select: (cols: string) => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { config: fila.config ?? {}, industry: fila.industry ?? null, market: fila.market ?? null, _cols: cols }, error: null }) }) }),
      update: (row: Record<string, unknown>) => { updates.push(row); return { eq: () => Promise.resolve({ error: null }) } },
    })
    return { supabase: { from } as never, updates }
  }
  const DISC: DiscoveryOutput = { client_id: CID, own_handles: { instagram: '@naufrago.ec' }, competitors: [{ name: 'Pez Azul' }], client_industry: 'restaurante de comida costera', client_markets: ['Guayaquil', 'Olón, Santa Elena'] }
  it('ficha con industry `unknown` y market vacío (la de E120B) → se escriben en el MISMO UPDATE que el config · declarado written', async () => {
    const f = fake({ industry: 'unknown', market: null })
    const r = await populateClientConfigFromDiscovery({ supabase: f.supabase, discovery: DISC, enabled: true })
    expect(r.errors).toEqual([])
    expect(r.industry_outcome).toBe('written')
    expect(r.market_outcome).toBe('written')
    expect(f.updates).toHaveLength(1)
    expect(f.updates[0]).toMatchObject({ industry: 'restaurante de comida costera', market: 'Guayaquil · Olón, Santa Elena' })
    expect(f.updates[0].config).toBeDefined()
  })
  it('ficha con industry puesto por ventas → NO se pisa (kept) · sin casillas del descubridor → absent y sin claves extra', async () => {
    const f = fake({ industry: 'restaurante de comida costera', market: 'Guayaquil' })
    const r = await populateClientConfigFromDiscovery({ supabase: f.supabase, discovery: { ...DISC, client_industry: 'otra cosa', client_markets: ['Quito'] }, enabled: true })
    expect(r.industry_outcome).toBe('kept'); expect(r.market_outcome).toBe('kept')
    expect(f.updates[0]).not.toHaveProperty('industry'); expect(f.updates[0]).not.toHaveProperty('market')
    const g = fake({ industry: null, market: null })
    const { client_industry: _a, client_markets: _b, ...sinCasillas } = DISC
    const s = await populateClientConfigFromDiscovery({ supabase: g.supabase, discovery: sinCasillas, enabled: true })
    expect(s.industry_outcome).toBe('absent'); expect(s.market_outcome).toBe('absent')
    expect(g.updates[0]).not.toHaveProperty('industry')
    expect(estaVacioOUnknown('unknown')).toBe(true); expect(estaVacioOUnknown(' ')).toBe(true); expect(estaVacioOUnknown('turismo')).toBe(false)
  })
  it('alta · «Persist Client» no manda `unknown` cuando fue valor por defecto · sí manda el rubro cuando el trato lo trajo', () => {
    const plantilla = String(nodo(ALTA_HOY, 'Persist Client to Supabase').parameters.jsonBody).replace(/^=/, '')
    const cuerpo = (v: any) => { const $ = () => ({ first: () => ({ json: v }) }); const $workflow = { id: 'LyVoKcrypS5uLyuu' }, $execution = { id: '1' }; const txt = plantilla.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(new Function('$', '$workflow', '$execution', `return (${e})`)($, $workflow, $execution))); return JSON.parse(txt) }
    expect(EV.validate_deal_data._defaults_aplicados).toContain('industry')
    expect(cuerpo(EV.validate_deal_data).industry).toBeNull()
    expect(cuerpo({ ...EV.validate_deal_data, industry: 'restaurante de comida costera', _defaults_aplicados: [] }).industry).toBe('restaurante de comida costera')
    const antes = String(nodo(ALTA_VIVO, 'Persist Client to Supabase').parameters.jsonBody).replace(/^=/, '')
    const $ = () => ({ first: () => ({ json: EV.validate_deal_data }) })
    expect(JSON.parse(antes.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(new Function('$', '$workflow', '$execution', `return (${e})`)($, { id: 'x' }, { id: '1' })))).industry).toBe('unknown')
  })
})

describe('③ el enriquecimiento lleva el cliente · ④ nada más cambió', () => {
  it('rojo: en 149699 Enrich salió con client_id null · verde: con los mismos datos sale el de la corrida y el resto igual', () => {
    expect(EV.enrich.client_id).toBeNull()
    const correr = (f: Flujo) => {
      const code = String(nodo(f, '[APIFY] Enrich competitors').parameters.jsCode)
      const $ = (n: string) => ({ first: () => ({ json: n === '[ANCHOR] Guard geo+canonical' ? EV.guard : n === '[APIFY] Scrape-Verify' ? EV.scrape_verify : EV.validate_deal_data }) })
      return new Function('$', code)($)[0].json
    }
    const antes = correr(ALTA_VIVO), hoy = correr(ALTA_HOY)
    expect(antes.client_id).toBeNull()
    expect(hoy.client_id).toBe(CID)
    expect({ ...hoy, client_id: null }).toEqual({ ...antes, client_id: null })
  })
  it('alta: 98 nodos · sólo Load client, Persist y Enrich · conexiones y ajustes iguales', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length)
    const dif = ALTA_HOY.nodes.filter((n) => JSON.stringify({ t: n.type, p: n.parameters }) !== JSON.stringify({ t: nodo(ALTA_VIVO, n.name).type, p: nodo(ALTA_VIVO, n.name).parameters })).map((n) => n.name).sort()
    expect(dif).toEqual(['Persist Client to Supabase', '[ANCHOR] Load client (canonical competitor_list)', '[APIFY] Enrich competitors'].sort())
    expect(ALTA_HOY.connections).toEqual(ALTA_VIVO.connections)
    expect(ALTA_HOY.settings.errorWorkflow).toBe(ALTA_VIVO.settings.errorWorkflow)
    expect(() => construirE121(ALTA_HOY)).toThrow()
  })
})
