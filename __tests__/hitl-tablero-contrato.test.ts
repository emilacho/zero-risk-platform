/**
 * EL CONTRATO ENTRE EL TABLERO DE EMILIO Y LA BANDEJA (CC#2 · 19-oct, a raíz de la certificación del tablero #22).
 * El tablero (repositorio del dashboard) resuelve una fila SIN ejecución de n8n llamando a `PATCH /api/hitl/{id}` de la plataforma, porque ahí viven los efectos de aprobar.
 * Su prueba simula la respuesta de la plataforma, así que un choque de contrato no se ve allí: esta prueba FIJA el cuerpo que el tablero debe mandar, lo valida con el contrato
 * REAL (`hitl-action`) y comprueba, de punta a punta con una base falsa, que ese cuerpo dispara cada efecto: promover el manual, armar el ensayo de un lote y de una pieza de la oficina.
 * US$ 0 · sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateObject } from '../src/lib/input-validator'
import { TIPO_DE_BANDEJA } from '../src/lib/manual/borrador'
import { TIPO_LOTE_SOCIAL, TIPO_PIEZA_DE_OFICINA } from '../src/lib/publicacion/en-ensayo'

const CLI = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const OUT = '6ed1307a-0000-4000-8000-000000000001'

/** el cuerpo EXACTO que el tablero manda (dashboard `lib/hitl-resolve.ts`, `resolverPorLaPlataforma`): SIN `decision` (la plataforma la guarda como {}); el motivo del rechazo va en la frase */
const CUERPO_APROBAR = { status: 'approved', reviewer: 'emilio' }
const CUERPO_RECHAZAR = { status: 'rejected', reviewer: 'emilio', frase_del_aprobador: 'No encaja con la voz de la marca' }

const hoist = vi.hoisted(() => ({ base: null as any, promover: vi.fn(), nota: vi.fn() }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => hoist.base.db }))
vi.mock('@/lib/manual/promover', () => ({ promoverManualRevisado: hoist.promover, guardarNotaDeRechazo: hoist.nota }))

describe('el contrato de entrada `hitl-action` frente al cuerpo del tablero', () => {
  const valida = (b: unknown) => (validateObject(b as never, 'hitl-action') as { ok: boolean }).ok
  it('el cuerpo del tablero (aprobar y rechazar) pasa la validación real', () => {
    expect(valida(CUERPO_APROBAR)).toBe(true); expect(valida(CUERPO_RECHAZAR)).toBe(true)
  })
  it('un `decision` OBJETO NO pasa (era el choque del tablero #22): `decision` es texto en el contrato', () => {
    expect(valida({ ...CUERPO_APROBAR, decision: { decision: 'approved', por: 'emilio', cuando: '2026-10-20T07:40:00Z' } })).toBe(false)
    expect(valida({ ...CUERPO_RECHAZAR, decision: { decision: 'rejected', por: 'emilio', cuando: 'x', motivo: 'm' } })).toBe(false)
    expect(valida({ ...CUERPO_APROBAR, decision: 'approved' })).toBe(true) // el texto del contrato sí
  })
})

// ───────────────────────────────────────────────────────── de punta a punta con una base falsa (una sola lista de filas; se busca por id)
function baseFalsa() {
  const filas: Array<Record<string, any>> = []
  const from = () => {
    const q: any = { op: 'select', filtros: [] as any[], patch: null }
    const filtrar = () => filas.filter((f) => q.filtros.every((fn: any) => fn(f)))
    const ejecutar = () => {
      if (q.op === 'update') { for (const f of filtrar()) Object.assign(f, q.patch); return { data: filtrar(), error: null } }
      return { data: filtrar(), error: null }
    }
    const api: any = {
      select: () => api,
      eq: (k: string, v: unknown) => { q.filtros.push((f: any) => f[k] === v); return api },
      update: (p: any) => { q.op = 'update'; q.patch = p; return api },
      maybeSingle: async () => ({ data: ejecutar().data?.[0] ?? null, error: null }),
      single: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: 'sin fila' } } },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from }, filas }
}
const llamar = async (id: string, cuerpo: unknown, llave: string | null = 'k') => {
  const { PATCH } = await import('../src/app/api/hitl/[id]/route')
  const r = await PATCH(new Request('http://x/y', { method: 'PATCH', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) }), { params: { id } })
  return { status: r.status, json: (await r.json()) as Record<string, any> }
}
const CONTENIDO = JSON.stringify({ pie_de_foto: 'Hola', hashtags: ['a'], entrega: { urls: { '2026-10-20_1000_instagram_foto_b1_01-de-01.png': 'https://s.test/a.png', 'manifest.json': 'https://s.test/m.json' } } })

describe('PATCH /api/hitl/[id] con el cuerpo del tablero: cada efecto de aprobar sí ocurre', () => {
  beforeEach(() => {
    hoist.base = baseFalsa(); hoist.promover.mockReset(); hoist.nota.mockReset()
    hoist.promover.mockResolvedValue({ ok: true, version: 3 }); hoist.nota.mockResolvedValue({ ok: true })
    hoist.base.filas.push(
      { id: 'm1', type: TIPO_DE_BANDEJA, status: 'pending', client_id: CLI, output_id: OUT, metadata: {} },
      { id: 'l1', type: TIPO_LOTE_SOCIAL, status: 'pending', client_id: CLI, metadata: { task_id: 't1', lote: { task_id: 't1', client_id: CLI, piezas: [{ canal: 'instagram', image_url: 'https://s.test/a.png', caption: 'Hola' }] } } },
      { id: 'p1', type: TIPO_PIEZA_DE_OFICINA, status: 'pending', client_id: CLI, output_id: 'o1', metadata: { origen: 'oficina', oficina_encargo_id: 'e1' } },
      { id: 'o1', client_id: CLI, content: `# Pieza\n\n\`\`\`json\n${CONTENIDO}\n\`\`\`` },
    )
  })
  it('manual de marca revisado: aprobar lo PROMUEVE (con quien aprobó) y rechazar guarda la nota del motivo', async () => {
    const a = await llamar('m1', CUERPO_APROBAR)
    expect(a.status).toBe(200); expect(a.json.item.status).toBe('approved')
    expect(hoist.promover).toHaveBeenCalledTimes(1)
    expect(hoist.promover.mock.calls[0][1]).toMatchObject({ output_id: OUT, client_id: CLI, aprobador: 'emilio' })
    hoist.base.filas[0].status = 'pending'
    const r = await llamar('m1', CUERPO_RECHAZAR)
    expect(r.status).toBe(200); expect(hoist.nota).toHaveBeenCalledTimes(1)
    expect(hoist.nota.mock.calls[0][1]).toMatchObject({ output_id: OUT, client_id: CLI, nota: 'No encaja con la voz de la marca', rechazado_por: 'emilio' })
  })
  it('lote social: aprobar arma el ensayo de publicación (sin Meta); rechazar no arma nada', async () => {
    const a = await llamar('l1', CUERPO_APROBAR)
    expect(a.status).toBe(200); expect(a.json.publicacion).toMatchObject({ ok: true, ensayo: { modo: 'ensayo', real: false, origen: 'lote' } })
    hoist.base.filas[1].status = 'pending'; delete hoist.base.filas[1].metadata.publicacion_ensayo
    const r = await llamar('l1', CUERPO_RECHAZAR); expect(r.status).toBe(200); expect(r.json).not.toHaveProperty('publicacion')
  })
  it('pieza de la oficina: aprobar arma el ensayo desde su salida (la imagen, no el manifiesto)', async () => {
    const a = await llamar('p1', CUERPO_APROBAR)
    expect(a.status).toBe(200); expect(a.json.publicacion).toMatchObject({ ok: true, ensayo: { origen: 'pieza_de_oficina', output_id: 'o1', task_id: 'oficina:e1' } })
    expect(a.json.publicacion.ensayo.piezas[0].solicitudes[0].cuerpo.image_url).toBe('https://s.test/a.png')
  })
  it('la decisión queda en la fila con quien la tomó y cuándo (reviewer, decided_at, resolved_at) y la frase del rechazo en `metadata.decision_humana`', async () => {
    await llamar('l1', CUERPO_APROBAR)
    expect(hoist.base.filas[1]).toMatchObject({ status: 'approved', reviewer: 'emilio' }); expect(hoist.base.filas[1].decided_at).toBeTruthy(); expect(hoist.base.filas[1].resolved_at).toBeTruthy()
    hoist.base.filas[2].status = 'pending'
    await llamar('p1', CUERPO_RECHAZAR)
    expect(hoist.base.filas[2].metadata.decision_humana).toMatchObject({ frase: 'No encaja con la voz de la marca', estado: 'rejected', reviewer: 'emilio' })
  })
  it('sin la llave interna no resuelve nada (401) y la fila queda como estaba', async () => {
    const r = await llamar('l1', CUERPO_APROBAR, null)
    expect(r.status).toBe(401); expect(hoist.base.filas[1].status).toBe('pending'); expect(hoist.promover).not.toHaveBeenCalled()
  })
})
