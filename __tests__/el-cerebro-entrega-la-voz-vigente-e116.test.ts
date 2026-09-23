/**
 * 🔴 E116 · EL CEREBRO ENTREGA LA VOZ VIGENTE · Y EL PEDIDO DE PLANEACIÓN DEJA EL VOSEO.
 *
 * Medido (E114 · planeación 149154): de los 5 trozos que recibió el redactor, `positioning` era del manual v2
 * y `voice_description` del manual v1 (voz vieja); y el propio pedido que arma «Redactor (B4)» está en voseo.
 *
 * Fija: (①) el corredor pide trozos de más y descarta los del manual que no sean de la versión vigente (mayor
 * `version`), lo declara y no borra nada; si no puede saber cuál es la vigente, no filtra y lo declara; las
 * demás fuentes no cambian. (②) el pedido construido no tiene formas de voseo, cambia SÓLO en las palabras de
 * la lista cerrada y conserva estructura y largo; nada más del flujo cambia. Sin red · el pedido real de 149154.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enrichSystemPromptWithClientBrain, OLD_VERSION_MARGIN } from '../services/agent-runner/src/lib/brain-enrichment'
import { REEMPLAZOS, VOSEO } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-e116.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const CID = '0736401b-8a9c-4e57-9ab0-e4bad25cb630'
const V1 = 'a9eead20-8875-4671-865a-b332d3c5a4eb', V2 = '37c8a8bd-92bc-40d7-ad1f-62b2d311a2ac'

// ── ① el corredor ──
const fila = (id: string, source_table: string, source_id: string, section_label: string, similarity: number) => ({ chunk_id: id, source_table, source_id, section_label, chunk_text: `${section_label} de ${source_id.slice(0, 8)}`, similarity })
const LO_QUE_TRAE_LA_BUSQUEDA = [
  fila('c1', 'client_competitive_landscape', CID, 'instagram_competitive', 0.70),
  fila('c2', 'client_competitive_landscape', CID, 'tiktok_competitive', 0.65),
  fila('c3', 'client_brand_books', V1, 'voice_description', 0.60),   // ← la voz VIEJA que llegó en 149154
  fila('c4', 'client_brand_books', V2, 'positioning', 0.59),
  fila('c5', 'client_competitive_landscape', 'f788c48d', 'landscape_summary', 0.56),
  fila('c6', 'client_brand_books', V1, 'positioning', 0.55),
  fila('c7', 'client_brand_books', V2, 'voice_description', 0.54),
  fila('c8', 'client_icp_documents', 'i1', 'segmento', 0.50),
]
const rpc = vi.fn(async () => ({ data: LO_QUE_TRAE_LA_BUSQUEDA, error: null }))
let vigente: { data: { id: string } | null; error: { message: string } | null } = { data: { id: V2 }, error: null }
const from = vi.fn((_t: string) => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => vigente }) }) }) }) }))
const supabase = { rpc, from } as unknown as Parameters<typeof enrichSystemPromptWithClientBrain>[0]['supabase']
const fetchMock = vi.fn(async (_u: string, init: RequestInit) => ({ ok: true, status: 200, json: async () => ({ data: [{ embedding: new Array(1536).fill(0.01) }], usage: { total_tokens: 10 } }) } as unknown as Response))

beforeEach(() => { rpc.mockClear(); from.mockClear(); vigente = { data: { id: V2 }, error: null }; process.env.OPENAI_API_KEY = 'test'; global.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { delete process.env.OPENAI_API_KEY })

describe('① el corredor descarta los trozos del manual que no son de la versión vigente', () => {
  it('rojo que ya no pasa: sin filtro, el top-5 de la búsqueda incluye voice_description de la v1', () => {
    expect(LO_QUE_TRAE_LA_BUSQUEDA.slice(0, 5).some((r) => r.source_table === 'client_brand_books' && r.source_id === V1)).toBe(true)
  })
  it('verde: pide top_k + margen · quita los de la v1 · devuelve 5 · declara cuántos descartó y la fila vigente', async () => {
    const out = await enrichSystemPromptWithClientBrain({ supabase, clientId: CID, taskDescription: 'plan', agentSlug: 'campaign-brief-agent', topK: 5 })
    expect(rpc).toHaveBeenCalledWith('query_client_brain', expect.objectContaining({ p_top_k: 5 + OLD_VERSION_MARGIN }))
    expect(from).toHaveBeenCalledWith('client_brand_books')
    expect(out.brain_hit).toBe(true)
    expect(out.brain_chunks_count).toBe(5)
    expect(out.evidence_refs).toEqual(['c1', 'c2', 'c4', 'c5', 'c7'])
    expect(out.enrichment).not.toContain(`de ${V1.slice(0, 8)}`)
    expect(out.enrichment).toContain('client_brand_books · voice_description')
    expect(out.brain_chunks_old_version_dropped).toBe(2)
    expect(out.brain_manual_vigente_id).toBe(V2)
  })
  it('si no se puede saber la vigente (sin fila · error) NO filtra y lo declara (null) · top_k se respeta igual', async () => {
    vigente = { data: null, error: null }
    const a = await enrichSystemPromptWithClientBrain({ supabase, clientId: CID, taskDescription: 'plan', topK: 5 })
    expect(a.brain_chunks_count).toBe(5)
    expect(a.evidence_refs).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(a.brain_manual_vigente_id).toBeNull()
    expect(a.brain_chunks_old_version_dropped).toBe(0)
    vigente = { data: null, error: { message: 'timeout' } }
    const b = await enrichSystemPromptWithClientBrain({ supabase, clientId: CID, taskDescription: 'plan', topK: 5 })
    expect(b.brain_manual_vigente_id).toBeNull()
    expect(b.brain_chunks_count).toBe(5)
  })
  it('las otras fuentes no se tocan · y con todo descartado sigue declarando brain_empty_for_client', async () => {
    rpc.mockResolvedValueOnce({ data: [fila('x', 'client_brand_books', V1, 'positioning', 0.9)], error: null })
    const out = await enrichSystemPromptWithClientBrain({ supabase, clientId: CID, taskDescription: 'plan', topK: 5 })
    expect(out.brain_hit).toBe(false)
    expect(out.error).toBe('brain_empty_for_client')
    expect(out.brain_chunks_old_version_dropped).toBe(1)
  })
})

// ── ② el pedido de planeación ──
const PLAN_VIVO = leer('planeacion-antes-e116-14951fff.json') as Flujo
const PLAN_HOY = leer('planeacion-construida-e116.json') as Flujo
const EV = leer('evidencia-149154-e116.json') as { pedido: string; entrada_redactor: any }
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error(`falta ${n}`); return x }
function armarPedido(f: Flujo, ent: any) {
  const code = String(nodo(f, 'Redactor (B4)').parameters.jsCode)
  const $input = { first: () => ({ json: ent }), all: () => [{ json: ent }] }
  return new Function('$input', '$json', code)($input, ent) as Array<{ json: { pedido: string; resumen_del_paquete: any } }>
}

describe('② el pedido de planeación, en tuteo', () => {
  it('rojo: el pedido real de 149154 y el nodo vivo (14951fff) traen voseo', () => {
    expect((EV.pedido.match(VOSEO) || []).length).toBeGreaterThan(0)
    const vivo = armarPedido(PLAN_VIVO, EV.entrada_redactor)[0].json
    expect(vivo.pedido).toContain('Sos el redactor')
    expect((vivo.pedido.match(VOSEO) || []).length).toBeGreaterThanOrEqual(10)
  })
  it('verde: con la MISMA entrada real, el pedido sale sin voseo, empieza «Eres el redactor…» y cambia sólo en las palabras de la lista', () => {
    const vivo = armarPedido(PLAN_VIVO, EV.entrada_redactor)[0].json
    const hoy = armarPedido(PLAN_HOY, EV.entrada_redactor)[0].json
    expect(hoy.pedido.match(VOSEO)).toBeNull()
    expect(hoy.pedido.startsWith('Eres el redactor de planes de campana de esta agencia. Escribe UN plan de 90 dias')).toBe(true)
    let esperado = vivo.pedido
    for (const [a, b] of REEMPLAZOS as Array<[string, string, number]>) esperado = esperado.split(a.replace(/^'|',$/g, '')).join(b.replace(/^'|',$/g, ''))
    expect(hoy.pedido).toBe(esperado)
    expect(Math.abs(hoy.pedido.length - vivo.pedido.length)).toBeLessThan(40)
    const { caracteres_del_pedido: _a, ...restoVivo } = vivo.resumen_del_paquete
    const { caracteres_del_pedido: _b, ...restoHoy } = hoy.resumen_del_paquete
    expect(restoHoy).toEqual(restoVivo)
  })
  it('nada más cambió: 40 nodos · sólo Redactor (B4) · conexiones y ajustes iguales', () => {
    expect(PLAN_HOY.nodes.length).toBe(PLAN_VIVO.nodes.length)
    const dif = PLAN_HOY.nodes.filter((n) => JSON.stringify({ t: n.type, p: n.parameters }) !== JSON.stringify({ t: nodo(PLAN_VIVO, n.name).type, p: nodo(PLAN_VIVO, n.name).parameters })).map((n) => n.name)
    expect(dif).toEqual(['Redactor (B4)'])
    expect(PLAN_HOY.connections).toEqual(PLAN_VIVO.connections)
    expect(PLAN_HOY.settings.executionOrder).toBe(PLAN_VIVO.settings.executionOrder)
  })
})
