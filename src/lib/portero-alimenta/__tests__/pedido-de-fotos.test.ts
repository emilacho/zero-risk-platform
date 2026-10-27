/**
 * EL PEDIDO LIBRE ENTIENDE «MÁS FOTOS» (27-oct · encargo recuperacion-y-vigia-independiente, punto 7) · US$ 0, sin red: base falsa y fotos simuladas.
 * Verifica: reconoce el pedido de fotos, responde con los `foto_id` etiquetados y su origen, etiqueta lo pendiente antes de responder, filtra por origen,
 * pide más a la cadena cuando hay pocas, no llama al modelo en seco y no toca nada si el cerebro no tiene la puerta de fotos.
 */
import { describe, expect, it } from 'vitest'
import type { FotoVista, OrigenDeFoto, RespuestaDeFotos } from '../../cerebro/portero/fotos-pendientes'
import { esPedidoDeFotos, FOTOS_PARA_DAR_POR_RESUELTO, origenesPedidos, rutaPedido, type DepsDePedido } from '../pedidos'
import { crearBaseFalsa } from './base-falsa'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-27T15:00:00Z')
const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }

const tablas = () => ({
  clients: [{ id: CL, name: 'Náufrago', industry: 'restaurante de mariscos', country: 'Ecuador', website_url: 'https://naufrago.ec', config: {} }],
  client_sedes: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_pedidos: [], agents: [{ name: 'creative-director' }], costs: [], agent_invocations: [],
  apify_raw: [], client_brain_chunks: [], cerebro_portero_corridas: [],
})
const vista = (id: string, origen: OrigenDeFoto, etiquetada: boolean): FotoVista => ({ foto_id: id, origen, cuenta: 'c', tipo: 'post_image', medio: 'imagen', url: `https://x/${id}.jpg`, publicada_en: null, copiada_en: null, etiquetada, que_muestra: etiquetada ? `foto ${id}` : null, producto_visto: [], texto_visible: null, confianza: etiquetada ? 'alta' : null, con_personas: null, tipo_de_toma: null, formato: null })
function respuesta(fotos: FotoVista[]): RespuestaDeFotos {
  const por_origen = { propia: { total: 0, etiquetadas: 0 }, competencia: { total: 0, etiquetadas: 0 }, referencia: { total: 0, etiquetadas: 0 } }
  for (const f of fotos) { por_origen[f.origen].total++; if (f.etiquetada) por_origen[f.origen].etiquetadas++ }
  return { ok: true, cliente: CL, total: fotos.length, devueltas: fotos.length, por_origen, sin_etiquetar: fotos.filter((f) => !f.etiquetada).length, fotos, modelos_llamados: 0, costo_usd: 0 }
}
/** un almacén de fotos simulado: `etiquetar` marca como etiquetadas las pendientes y cuenta las llamadas */
function almacen(iniciales: FotoVista[]) {
  let fotos = iniciales
  const llamadas = { listar: 0, etiquetar: 0 }
  return {
    llamadas,
    fotos: {
      listar: async () => { llamadas.listar++; return respuesta(fotos) },
      etiquetar: async () => { llamadas.etiquetar++; const n = fotos.filter((f) => !f.etiquetada).length; fotos = fotos.map((f) => ({ ...f, etiquetada: true, que_muestra: `foto ${f.foto_id}` })); return { etiquetadas: n, costo_usd: n * 0.008 } },
    },
  }
}
const deps = (o: Partial<DepsDePedido> = {}): DepsDePedido => ({
  db: crearBaseFalsa(tablas() as never).db,
  interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false, resumen_vivo: false, resumen_pulido: false },
  activo: true, ahora: AHORA, nuevoId: () => '11111111-2222-4333-8444-555555555555', esperar: async () => {}, ...o,
})
const pedido = (huecos: unknown[], o: Record<string, unknown> = {}) => ({ client_id: CL, dry_run: false, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear la pieza del jueves', huecos, ...o })
const hueco0 = (r: { body: Record<string, unknown> }) => (r.body.huecos as Array<Record<string, unknown>>)[0]

const muchas = (n: number, origen: OrigenDeFoto, etiquetada = true) => Array.from({ length: n }, (_, i) => vista(`${origen[0]}${i}`, origen, etiquetada))

describe('reconocer el pedido de fotos', () => {
  it('por el tipo o por el texto del hueco', () => {
    expect(esPedidoDeFotos({ tipo: 'fotos' })).toBe(true)
    expect(esPedidoDeFotos({ objetivo: 'más fotos de este cliente (propias + competencia)' })).toBe(true)
    expect(esPedidoDeFotos({ objetivo: 'Imágenes de referencia del local' })).toBe(true)
    expect(esPedidoDeFotos({ objetivo: 'horario de atención en Olón' })).toBe(false)
    expect(esPedidoDeFotos({ objetivo: 'fotografías de la competencia' })).toBe(true)
  })
  it('el origen sale de lo que el texto nombra; sin nombrar ninguno, todos', () => {
    expect(origenesPedidos({ objetivo: 'fotos propias' })).toEqual(['propia'])
    expect(origenesPedidos({ objetivo: 'fotos de la competencia y referencias' })).toEqual(['competencia', 'referencia'])
    expect(origenesPedidos({ objetivo: 'más fotos' })).toEqual([])
  })
})

describe('responder con los foto_id', () => {
  it('con fotos de sobra y etiquetadas: «ya está», con foto_id y origen, sin etiquetar ni traer nada', async () => {
    const a = almacen([...muchas(6, 'propia'), ...muchas(4, 'competencia')])
    const r = await rutaPedido(deps({ fotos: a.fotos }), pedido([{ tipo: 'fotos', objetivo: 'más fotos de este cliente (propias + competencia)' }]))
    const h = hueco0(r)
    expect(h.estado).toBe('ya_esta')
    expect(h.foto_ids).toHaveLength(10)
    expect((h.fotos as Array<{ origen: string }>).map((f) => f.origen)).toContain('competencia')
    expect(a.llamadas.etiquetar).toBe(0)
    expect(r.body.estado).toBe('resuelto')
  })
  it('lo pendiente se etiqueta ANTES de responder, y el costo cuenta en el pedido', async () => {
    const a = almacen([...muchas(5, 'propia'), ...muchas(5, 'competencia', false)])
    const r = await rutaPedido(deps({ fotos: a.fotos }), pedido([{ tipo: 'fotos' }]))
    const h = hueco0(r)
    expect(a.llamadas.etiquetar).toBe(1)
    expect(h.foto_ids).toHaveLength(10)
    expect((h.fotos_resumen as { etiquetadas_ahora: number }).etiquetadas_ahora).toBe(5)
    expect(h.costo_usd as number).toBeCloseTo(0.04, 6)
  })
  it('pedir solo competencia devuelve solo competencia', async () => {
    const a = almacen([...muchas(6, 'propia'), ...muchas(9, 'competencia')])
    const r = await rutaPedido(deps({ fotos: a.fotos }), pedido([{ objetivo: 'fotos de la competencia' }]))
    const h = hueco0(r)
    expect((h.fotos as Array<{ origen: string }>).every((f) => f.origen === 'competencia')).toBe(true)
    expect(h.foto_ids).toHaveLength(9)
  })
  it('una foto sin etiqueta no se entrega (la oficina elige por lo que muestra)', async () => {
    const a = almacen([...muchas(9, 'propia'), vista('sin', 'propia', false)])
    const r = await rutaPedido(deps({ fotos: { listar: a.fotos.listar } }), pedido([{ tipo: 'fotos' }]))
    expect(hueco0(r).foto_ids).not.toContain('sin')
  })
  it('hay pocas: responde con lo que hay y pide más a la cadena', async () => {
    const a = almacen(muchas(3, 'propia'))
    const pedidas: string[] = []
    const r = await rutaPedido(deps({ fotos: a.fotos, dispararCadena: async (c) => { pedidas.push(c); return { ok: true, detalle: 'disparada' } } }), pedido([{ tipo: 'fotos' }]))
    const h = hueco0(r)
    expect(FOTOS_PARA_DAR_POR_RESUELTO).toBeGreaterThan(3)
    expect(h.estado).toBe('en_cadena')
    expect(h.foto_ids).toHaveLength(3)
    expect(h.funciones).toEqual(['instagram_scraper'])
    expect(pedidas).toEqual([CL])
  })
  it('en seco no etiqueta ni pide nada a la cadena, pero dice qué haría', async () => {
    const a = almacen(muchas(3, 'propia', false))
    const pedidas: string[] = []
    const r = await rutaPedido(deps({ fotos: a.fotos, dispararCadena: async (c) => { pedidas.push(c); return { ok: true, detalle: '' } } }), pedido([{ tipo: 'fotos' }], { dry_run: true, workflow_id: undefined, workflow_execution_id: undefined }))
    expect(hueco0(r).estado).toBe('seco')
    expect(a.llamadas.etiquetar).toBe(0)
    expect(pedidas).toEqual([])
  })
  it('si no se pueden leer las fotos, lo dice: no inventa una lista vacía', async () => {
    const r = await rutaPedido(deps({ fotos: { listar: async () => ({ ok: false, error: 'error_de_lectura', detalle: 'caída' }) } }), pedido([{ tipo: 'fotos' }]))
    expect(hueco0(r).estado).toBe('no_resuelto')
    expect(String(hueco0(r).detalle)).toContain('no pude leer las fotos')
  })
  it('un hueco que no es de fotos sigue su camino de siempre (no toca el almacén de fotos)', async () => {
    const a = almacen(muchas(10, 'propia'))
    await rutaPedido(deps({ fotos: a.fotos }), pedido([{ objetivo: 'horario de atención en Olón' }], { dry_run: true, workflow_id: undefined, workflow_execution_id: undefined }))
    expect(a.llamadas.listar).toBe(0)
  })
})
