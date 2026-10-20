/**
 * UN PLAN CON PENDIENTES APROBADO EMITE `briefear` (CC#2 · 20-oct · parte 3 del encargo «limpiar y arreglar»). US$ 0 · sin red.
 * Cubre el módulo (puertos de memoria) y el gancho real de `PATCH /api/hitl/[id]` con una base falsa y un `fetch` falso hacia la sala.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armarSobre, emitirBriefearAlAprobar, TIPO_PLAN_CON_PENDIENTES, type ElementoDePlan, type PuertosPlanAprobado, type RespuestaDeLaSala, type SobreBriefear } from '../src/lib/planeacion/plan-aprobado'

const CLI = '89b5d692-cb12-4670-819e-3ea131edd75d'
const PLAN = '0d6f0000-0000-4000-8000-000000000001'
const elemento = (extra: Partial<ElementoDePlan> = {}, payload: Record<string, unknown> = {}): ElementoDePlan => ({
  id: 'h1', type: TIPO_PLAN_CON_PENDIENTES, status: 'approved', client_id: CLI, metadata: {},
  payload: { plan_id: PLAN, journey_id: 'j-1', tenant_id: 't-1', dry_run: false, correlation_id: 'c-1', ...payload }, ...extra,
})

function mundo(el: ElementoDePlan | null, respuesta: RespuestaDeLaSala | Error = { ok: true, kind: 'accepted', event_id: 'e-1' }) {
  const emitidos: SobreBriefear[] = []; const marcas: Array<Record<string, unknown>> = []
  const P: PuertosPlanAprobado = {
    ahora: () => new Date('2026-10-20T12:00:00Z'),
    leerElemento: async () => el,
    emitir: async (s) => { emitidos.push(s); if (respuesta instanceof Error) throw respuesta; return respuesta },
    guardarMarca: async (_id, m) => { marcas.push(m) },
  }
  return { P, emitidos, marcas }
}

describe('armarSobre · el mismo sobre que la planeación habría emitido', () => {
  it('lleva la fuente y la intención de siempre, la llave de idempotencia `{viaje}:briefear` y todo lo que dejó la planeación', () => {
    const r = armarSobre(elemento())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sobre).toEqual({
      source: 'planeacion/plan-listo', intent: 'briefear',
      payload: { client_id: CLI, plan_id: PLAN, dry_run: false, desde_worker: 'X9F0zp6LQ2xGEYVS', aprobado_en_la_bandeja: true, hitl_id: 'h1' },
      idempotency_key: 'j-1:briefear', logical_period: 'alta:j-1', tenant_id: 't-1', client_id: CLI, correlation_id: 'c-1',
    })
  })
  it('sin tenant usa el cliente; sin correlación no la manda; `dry_run` solo vale con `true` exacto', () => {
    const r = armarSobre(elemento({}, { tenant_id: undefined, correlation_id: undefined, dry_run: 'true' }))
    expect(r.ok && r.sobre.tenant_id).toBe(CLI); expect(r.ok && 'correlation_id' in r.sobre).toBe(false); expect(r.ok && r.sobre.payload.dry_run).toBe(false)
    const s = armarSobre(elemento({}, { dry_run: true })); expect(s.ok && s.sobre.payload.dry_run).toBe(true)
  })
  it('sin viaje NO se arma (la llave de idempotencia se compartiría entre clientes) y sin cliente tampoco', () => {
    for (const p of [{ journey_id: undefined }, { journey_id: '   ' }, { journey_id: 7 }]) { const r = armarSobre(elemento({}, p as never)); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toBe('sin_viaje') }
    const c = armarSobre(elemento({ client_id: null })); expect(!c.ok && c.error).toBe('sin_cliente')
  })
})

describe('emitirBriefearAlAprobar', () => {
  it('aprobado: emite UNA vez, la sala lo acepta y se deja la marca con la hora y el evento', async () => {
    const m = mundo(elemento()); const r = await emitirBriefearAlAprobar(m.P, { hitl_id: 'h1' })
    expect(r).toMatchObject({ ok: true, ya_estaba: false }); expect(m.emitidos).toHaveLength(1)
    expect(m.marcas[0]).toEqual({ briefear_emitido: { hora: '2026-10-20T12:00:00.000Z', kind: 'accepted', event_id: 'e-1', idempotency_key: 'j-1:briefear' } })
  })
  it('`duplicate` también cuenta como bueno (la planeación ya lo había emitido): no hay doble gasto', async () => {
    const m = mundo(elemento(), { ok: true, kind: 'duplicate' }); const r = await emitirBriefearAlAprobar(m.P, { hitl_id: 'h1' })
    expect(r.ok).toBe(true); expect(m.marcas).toHaveLength(1)
  })
  it('es idempotente: con la marca puesta no vuelve a emitir', async () => {
    const m = mundo(elemento({ metadata: { briefear_emitido: { hora: 'x' } } })); const r = await emitirBriefearAlAprobar(m.P, { hitl_id: 'h1' })
    expect(r).toMatchObject({ ok: true, ya_estaba: true }); expect(m.emitidos).toHaveLength(0)
  })
  it('no emite si no está aprobado, si es de otro tipo o si no existe', async () => {
    for (const [el, error] of [[elemento({ status: 'pending' }), 'no_aprobado'], [elemento({ status: 'rejected' }), 'no_aprobado'], [elemento({ status: 'edited' }), 'no_aprobado'], [elemento({ type: 'content_piece_review' }), 'no_es_un_plan_con_pendientes'], [null, 'elemento_inexistente']] as const) {
      const m = mundo(el); const r = await emitirBriefearAlAprobar(m.P, { hitl_id: 'h1' }); expect(!r.ok && r.error).toBe(error); expect(m.emitidos).toHaveLength(0); expect(m.marcas).toHaveLength(0)
    }
  })
  it('si la sala no lo acepta o no contesta, NO se marca (se puede reintentar) y se dice por qué', async () => {
    const a = mundo(elemento(), { ok: false, code: 'flag_disabled', detail: 'x' }); const ra = await emitirBriefearAlAprobar(a.P, { hitl_id: 'h1' })
    expect(ra).toMatchObject({ ok: false, error: 'sala_no_acepto' }); expect(a.marcas).toHaveLength(0)
    const b = mundo(elemento(), new Error('timeout')); const rb = await emitirBriefearAlAprobar(b.P, { hitl_id: 'h1' })
    expect(rb).toMatchObject({ ok: false, error: 'sala_no_contesto' }); expect(b.marcas).toHaveLength(0)
    const c = mundo(elemento(), { ok: true, kind: 'rechazado' } as never); expect((await emitirBriefearAlAprobar(c.P, { hitl_id: 'h1' })).ok).toBe(false)
  })
  it('sin viaje en el elemento no emite nada y lo dice', async () => {
    const m = mundo(elemento({}, { journey_id: undefined })); const r = await emitirBriefearAlAprobar(m.P, { hitl_id: 'h1' })
    expect(!r.ok && r.error).toBe('sin_viaje'); expect(m.emitidos).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────── el gancho real de PATCH /api/hitl/[id] con una base falsa y un `fetch` falso hacia la sala
const hoist = vi.hoisted(() => ({ filas: [] as Array<Record<string, any>> }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }) }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q: any = { op: 'select', filtros: [] as any[], patch: null }
      const filtrar = () => hoist.filas.filter((f) => q.filtros.every((fn: any) => fn(f)))
      const ejecutar = () => { if (q.op === 'update') for (const f of filtrar()) Object.assign(f, q.patch); return { data: filtrar(), error: null } }
      const api: any = {
        select: () => api, eq: (k: string, v: unknown) => { q.filtros.push((f: any) => f[k] === v); return api }, update: (p: any) => { q.op = 'update'; q.patch = p; return api },
        maybeSingle: async () => ({ data: ejecutar().data?.[0] ?? null, error: null }),
        single: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: 'sin fila' } } },
        then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
      }
      return api
    },
  }),
}))

describe('PATCH /api/hitl/[id] con un plan con pendientes', () => {
  const llamadas: Array<{ url: string; cuerpo: any; llave: string | null }> = []
  const patch = async (id: string, cuerpo: unknown) => {
    const { PATCH } = await import('../src/app/api/hitl/[id]/route')
    const r = await PATCH(new Request('https://plataforma.test/api/hitl/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-api-key': 'k' }, body: JSON.stringify(cuerpo) }), { params: { id } })
    return { status: r.status, json: (await r.json()) as Record<string, any> }
  }
  beforeEach(() => {
    llamadas.length = 0; vi.stubEnv('INTERNAL_API_KEY', 'llave-interna')
    hoist.filas.splice(0, hoist.filas.length, { id: 'p1', type: TIPO_PLAN_CON_PENDIENTES, status: 'pending', client_id: CLI, metadata: {}, payload: { plan_id: PLAN, journey_id: 'j-1', tenant_id: 't-1', dry_run: false } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { llamadas.push({ url, cuerpo: JSON.parse(init.body), llave: init.headers['x-api-key'] }); return new Response(JSON.stringify({ ok: true, kind: 'accepted', event_id: 'e-9' }), { status: 200 }) }))
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('aprobar emite el sobre a la puerta de la sala de la propia plataforma, con la llave interna, y deja la marca', async () => {
    const r = await patch('p1', { status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(200); expect(r.json.item.status).toBe('approved'); expect(r.json.briefear).toMatchObject({ ok: true, ya_estaba: false })
    expect(llamadas).toHaveLength(1); expect(llamadas[0].url).toBe('https://plataforma.test/api/sala/intake'); expect(llamadas[0].llave).toBe('llave-interna')
    expect(llamadas[0].cuerpo).toMatchObject({ source: 'planeacion/plan-listo', intent: 'briefear', idempotency_key: 'j-1:briefear', client_id: CLI })
    expect(hoist.filas[0].metadata.briefear_emitido.kind).toBe('accepted')
  })
  it('aprobar dos veces no emite dos veces', async () => {
    await patch('p1', { status: 'approved', reviewer: 'emilio' }); await patch('p1', { status: 'approved', reviewer: 'emilio' })
    expect(llamadas).toHaveLength(1)
  })
  it('rechazar o editar NO emite', async () => {
    for (const status of ['rejected', 'edited']) { hoist.filas[0].status = 'pending'; const r = await patch('p1', { status, reviewer: 'emilio' }); expect(r.json).not.toHaveProperty('briefear') }
    expect(llamadas).toHaveLength(0)
  })
  it('si la sala falla, la decisión de Emilio NO se deshace y la respuesta lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red') }))
    const r = await patch('p1', { status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(200); expect(r.json.item.status).toBe('approved'); expect(r.json.briefear).toMatchObject({ ok: false, error: 'sala_no_contesto' })
    expect(hoist.filas[0].metadata.briefear_emitido).toBeUndefined()
  })
  it('sin la llave interna en el entorno no llama a nadie y lo dice', async () => {
    vi.stubEnv('INTERNAL_API_KEY', ''); const r = await patch('p1', { status: 'approved', reviewer: 'emilio' })
    expect(r.json.briefear).toMatchObject({ ok: false, error: 'sala_no_acepto' }); expect(llamadas).toHaveLength(0)
  })
})
