/**
 * 17-nov · S2-4 tramo 3 (CC1) · «lo pagado se reutiliza»: cada clip lleva la HUELLA de su contenido (primer cuadro original, texto, formato, segundos, resolución,
 * proporción, audio); antes de cotizar se buscan en el libro los clips del cliente ya terminados y cobrados con esa huella y se usan a US$ 0. Solo lo que falta se
 * cotiza (la SUMA de lo que falta contra el tope), se envía y se cobra. US$ 0: puertos falsos (el libro y la red también).
 */
import { describe, expect, it } from 'vitest'
import { filaDeEnvio, sessionIdDeVideo } from '../../video/libro'
import { crearPuertos } from '../adaptadores'
import { sondearVideos } from '../orquestador-video'
import { comoPedidoDelBrazo, leerPlanos, separarPagados, type PlanoEnviado } from '../video/motor-planos'
import { huellaDelClip, pedidosPorPlano, type PedidoDePlano } from '../video/planos'
import type { FotoEtiquetada } from '../fotos'
import { ALMACEN, brazo, gastoAntes, hastaElBrazo, hecho } from './s2-4-arnes'

const FOTOS: FotoEtiquetada[] = [{ id: '9f71b0e9-0000-4000-8000-000000000001', url: `${ALMACEN}/fotos/fachada.jpg`, origen: 'propia' }]
const guion = {
  ok: true, segundos: 8, audio: 'olas', pie_de_foto: 'pie', hashtags: ['#a'], fotos_ids: [], avisos: [], texto: 'guion',
  planos: [{ n: 1, desde: 0, hasta: 4, se_ve: 'Fachada', foto_id: FOTOS[0].id }, { n: 2, desde: 4, hasta: 8, se_ve: 'Olla' }],
}
const brief = { id: 'F1-S1-ig-r1', red: 'Instagram', formato: 'reel', prohibido: [], aprueba: '', texto: 'brief' }
const ped = (o: { clave?: string; relacion?: string; guion?: typeof guion; imagenesClave?: Array<{ n: number; url: string }> } = {}) =>
  (pedidosPorPlano({ guion: o.guion ?? guion, brief, fotos: FOTOS, clave: o.clave ?? 'enc1:F1:v1', relacion: o.relacion ?? '9:16', ...(o.imagenesClave ? { imagenesClave: o.imagenesClave } : {}) }) as { ok: true; pedidos: PedidoDePlano[] }).pedidos

describe('la huella del contenido de un clip', () => {
  it('🔴 mismo contenido = misma huella aunque cambie el encargo o la versión del guion (la clave del proveedor sí cambia)', () => {
    const a = ped({ clave: 'enc1:F1:v1' }), b = ped({ clave: 'enc9:F1:v3' })
    expect(a.map((x) => x.huella)).toEqual(b.map((x) => x.huella))
    expect(a[0].clave).not.toBe(b[0].clave)
    expect(a[0].huella).not.toBe(a[1].huella)
  })
  it('🔴 cambia si cambia lo que el proveedor genera: el primer cuadro, el texto o la proporción', () => {
    const base = ped()[0].huella
    expect(ped({ imagenesClave: [{ n: 1, url: `${ALMACEN}/ic/p1.png` }] })[0].huella).not.toBe(base)
    expect(ped({ guion: { ...guion, planos: [{ ...guion.planos[0], se_ve: 'Fachada de noche' }, guion.planos[1]] } })[0].huella).not.toBe(base)
    expect(ped({ relacion: '1:1' })[0].huella).not.toBe(base)
  })
  it('huellaDelClip · cada campo cuenta', () => {
    const c = { fuente: 'u', prompt: 'p', formato: 'f', segundos: 4, resolucion: '720p', relacion: '9:16', audio: true }
    const h = huellaDelClip(c)
    expect(h).toMatch(/^[0-9a-f]{40}$/)
    for (const [k, v] of Object.entries({ fuente: null, prompt: 'q', formato: 'g', segundos: 5, resolucion: '1080p', relacion: '16:9', audio: false })) expect(huellaDelClip({ ...c, [k]: v })).not.toBe(h)
  })
  it('🔴 la huella viaja en el pedido al brazo y el adaptador la manda en el cuerpo', async () => {
    const p = ped()[0]
    expect(comoPedidoDelBrazo(p).huella).toBe(p.huella)
    const cuerpos: Array<Record<string, unknown>> = []
    const f = (async (_u: string, init?: { body?: string }) => { cuerpos.push(JSON.parse(String(init?.body ?? '{}'))); return { ok: true, json: async () => ({ request_id: 'r1', status: 'queued' }) } }) as never
    await crearPuertos(dbFalsa([]).db as never, ENV as never, f).video!.enviar({ pedido: comoPedidoDelBrazo(p), client_id: 'c', encargo_id: 'e', dry_run: false, tope_usd: 5, workflow_id: 'w', workflow_execution_id: 'x' })
    expect(cuerpos[0].huella).toBe(p.huella)
  })
  it('la huella viaja con el pedido al brazo y el libro la anota (solo si viene)', () => {
    const d = { requestId: 'r', clientId: 'c', agentSlug: null, modelo: 'm', ruta: 'x', segundos: 4, resolucion: '720p', relacion: '9:16', conFotos: 1, caller: 'oficina', costoEstimadoUsd: 1, startedAtMs: 0, claveIdempotente: 'k' }
    expect((filaDeEnvio({ ...d, huella: 'abc' }).metadata as Record<string, unknown>).huella).toBe('abc')
    expect('huella' in (filaDeEnvio(d).metadata as Record<string, unknown>)).toBe(false)
  })
})

describe('separarPagados', () => {
  const planos = ped()
  const pagado = (i: number, url = `${ALMACEN}/videos/viejo-${i}.mp4`) => ({ huella: planos[i].huella, request_id: `viejo-${i}`, video_url: url, costo_usd: 1.06 })
  it('🔴 el pagado se reutiliza a US$ 0 con su copia; el resto falta', async () => {
    const b = brazo({ estados: () => hecho(1), pagados: [pagado(0)] })
    const r = await separarPagados({ video: b.v }, { client_id: 'cli1', dry_run: false }, planos)
    expect(r.reutilizados).toEqual([{ n: 1, request_id: 'viejo-0', costo_estimado_usd: 0, segundos: planos[0].segundos, cortar_a_s: planos[0].cortar_a_s, reutilizado: { video_url: `${ALMACEN}/videos/viejo-0.mp4`, costo_pagado_usd: 1.06 } }])
    expect(r.faltan.map((p) => p.n)).toEqual([2])
    expect(b.reg.huellas).toEqual([planos.map((p) => p.huella)])
  })
  it('en seco no busca (no sale a la red); sin el método o si falla, se paga todo como siempre', async () => {
    const b = brazo({ estados: () => hecho(1), pagados: [pagado(0)] })
    expect((await separarPagados({ video: b.v }, { client_id: 'c', dry_run: true }, planos)).faltan).toHaveLength(2)
    expect(b.reg.huellas).toHaveLength(0)
    expect((await separarPagados({ video: brazo({ estados: () => hecho(1) }).v }, { client_id: 'c', dry_run: false }, planos)).faltan).toHaveLength(2)
    const rota = brazo({ estados: () => hecho(1), pagados: async () => { throw new Error('libro caído') } })
    expect((await separarPagados({ video: rota.v }, { client_id: 'c', dry_run: false }, planos)).faltan).toHaveLength(2)
  })
  it('una dirección que no es http no cuenta como pagado', async () => {
    const b = brazo({ estados: () => hecho(1), pagados: [pagado(0, 'sin-url')] })
    expect((await separarPagados({ video: b.v }, { client_id: 'c', dry_run: false }, planos)).reutilizados).toHaveLength(0)
  })
})

describe('leerPlanos con un reutilizado', () => {
  it('🔴 el reutilizado es un clip listo a US$ 0 con su copia (no espera al proveedor)', () => {
    const env: PlanoEnviado[] = [
      { n: 1, request_id: 'viejo', costo_estimado_usd: 0, segundos: 4, cortar_a_s: 4, reutilizado: { video_url: `${ALMACEN}/videos/viejo.mp4`, costo_pagado_usd: 1.06 } },
      { n: 2, request_id: 'req-2', costo_estimado_usd: 1, segundos: 4, cortar_a_s: 4 },
    ]
    const l = leerPlanos(env, [{ ok: true, terminal: false, status: 'in_progress' } as never, hecho(2)], false, 45)
    expect(l).toMatchObject({ listo: true, ok: true, clips: [{ n: 1, video_url: `${ALMACEN}/videos/viejo.mp4`, costo_usd: 0 }, { n: 2, costo_usd: 1.06 }] })
  })
})

describe('el camino entero · reabrir con planos ya pagados', () => {
  it('🔴 2 de 3 clips ya pagados: solo el que falta se cotiza, se envía, se pregunta y se cobra; se unen los 3 en orden', async () => {
    let pagados: Array<{ huella: string; request_id: string; video_url: string; costo_usd: number }> = []
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), pagados: async (hs) => pagados.filter((x) => hs.includes(x.huella)) })
    // el libro ya tiene los planos 1 y 3 (de otro encargo, misma huella): se arman al vuelo con las huellas que pide la oficina
    b.v.buscarPagados = async (p) => { b.reg.huellas.push(p.huellas); pagados = [{ huella: p.huellas[0], request_id: 'viejo-1', video_url: `${ALMACEN}/videos/viejo-1.mp4`, costo_usd: 1.06 }, { huella: p.huellas[2], request_id: 'viejo-3', video_url: `${ALMACEN}/videos/viejo-3.mp4`, costo_usd: 1.06 }]; return pagados }
    const { M, id, ultima } = await hastaElBrazo(b)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', video: { costo_estimado_usd: 1.06, planos: 3, reutilizados: [1, 3] } })
    expect(b.reg.enviados.map((c) => c.slice(-3))).toEqual([':p2'])
    expect(b.reg.cotizados.filter((c) => /:p\d$/.test(c)).map((c) => c.slice(-3))).toEqual([':p2'])
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(b.reg.preguntados).toEqual(['req-1'])
    // el lote queda guardado en el orden del guion (el turno lleva el primero)
    const envio = (M.encargos.get(id)!.estado_del_motor.artefactos.pedido_video.datos as { envio: { planos: PlanoEnviado[]; request_id: string } }).envio
    expect(envio.planos.map((x) => [x.n, x.request_id])).toEqual([[1, 'viejo-1'], [2, 'req-1'], [3, 'viejo-3']])
    expect(envio.request_id).toBe('viejo-1')
    expect(b.reg.unidos[0]).toEqual([`${ALMACEN}/videos/viejo-1.mp4`, `${ALMACEN}/videos/req-1.mp4`, `${ALMACEN}/videos/viejo-3.mp4`])
    expect(M.encargos.get(id)!.gasto_usd).toBeCloseTo(antes + 1.06, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video').map((g) => [g.ref_id, g.cost_usd])).toEqual([[sessionIdDeVideo('req-1'), 1.06]])
  })
  it('🔴 los 3 ya pagados: nada se cotiza ni se envía, el video se une igual y no se gasta nada', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    b.v.buscarPagados = async (p) => p.huellas.map((h, i) => ({ huella: h, request_id: `viejo-${i + 1}`, video_url: `${ALMACEN}/videos/viejo-${i + 1}.mp4`, costo_usd: 1.06 }))
    const { M, id, ultima } = await hastaElBrazo(b)
    expect(b.reg.enviados).toHaveLength(0)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', turno: { request_id: 'viejo-1' }, video: { costo_estimado_usd: 0, planos: 3, reutilizados: [1, 2, 3] } })
    expect(b.reg.cotizados.filter((c) => /:p\d$/.test(c))).toHaveLength(0)
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(b.reg.preguntados).toHaveLength(0)
    expect(b.reg.uniones).toBe(1)
    expect(M.encargos.get(id)!.gasto_usd).toBeCloseTo(antes, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(0)
  })
  it('🔴 el envío se corta en el que falta: el lote incompleto con el reutilizado no se une y solo se anota lo nuevo cobrado', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), falla_envio_en: 2 })
    b.v.buscarPagados = async (p) => [{ huella: p.huellas[0], request_id: 'viejo-1', video_url: `${ALMACEN}/videos/viejo-1.mp4`, costo_usd: 1.06 }]
    const { M, id, ultima } = await hastaElBrazo(b)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', lote_incompleto: true })
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(M.encargos.get(id)!.estado).toBe('fallido')
    expect(b.reg.uniones).toBe(0)
    expect(M.encargos.get(id)!.gasto_usd).toBeCloseTo(antes + 1.06, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video').map((g) => g.ref_id)).toEqual([sessionIdDeVideo('req-1')])
  })
})

// el adaptador real: lee el libro (filtros correctos) y solo devuelve copias NUESTRAS que siguen ahí, cobradas, una por huella
function dbFalsa(filas: Array<Record<string, unknown>>, error: { message: string } | null = null) {
  const filtros: Array<[string, ...unknown[]]> = []
  const q = {
    select(c: string) { filtros.push(['select', c]); return q },
    eq(c: string, v: unknown) { filtros.push(['eq', c, v]); return q },
    in(c: string, v: unknown) { filtros.push(['in', c, v]); return q },
    order(c: string, o: unknown) { filtros.push(['order', c, o]); return q },
    limit(n: number) { filtros.push(['limit', n]); return Promise.resolve({ data: error ? null : filas, error }) },
  }
  return { db: { from(t: string) { filtros.push(['from', t]); return q } }, filtros }
}
const fila = (huella: string, url: string, extra: Record<string, unknown> = {}) => ({ cost_usd: 1.06, output_summary: `video listo · ${url}`, metadata: { huella, request_id: `r-${huella}` }, ...extra })
const ENV = { baseUrl: 'https://app.test', internalKey: 'k', bucket: 'oficina', runnerUrl: 'https://runner.test' }

describe('adaptador · buscarPagados', () => {
  const NUESTRA = (x: string) => `${ALMACEN}/videos/${x}.mp4`
  const fetchHead = (vivas: string[]) => { const pedidas: Array<[string, string]> = []; const f = (async (url: string, init?: { method?: string }) => { pedidas.push([url, init?.method ?? 'GET']); return { ok: vivas.includes(url) } }) as never; return { f, pedidas } }
  it('🔴 filtra por cliente, terminadas y huella; devuelve solo copias nuestras vivas, cobradas, una por huella', async () => {
    const { db, filtros } = dbFalsa([
      fila('h1', NUESTRA('a')), fila('h1', NUESTRA('a-vieja')),
      fila('h2', 'https://proveedor.test/x.mp4'),
      fila('h3', NUESTRA('borrada')),
      fila('h4', NUESTRA('gratis'), { cost_usd: 0 }),
      fila('otra', NUESTRA('ajena')),
      { cost_usd: 1, output_summary: `video listo · ${NUESTRA('sin-rid')}`, metadata: { huella: 'h5' } },
    ])
    const { f, pedidas } = fetchHead([NUESTRA('a'), NUESTRA('a-vieja'), NUESTRA('gratis'), NUESTRA('ajena'), NUESTRA('sin-rid')])
    const P = crearPuertos(db as never, ENV as never, f)
    const r = await P.video!.buscarPagados!({ client_id: 'cli1', huellas: ['h1', 'h2', 'h3', 'h4', 'h5'] })
    expect(r).toEqual([{ huella: 'h1', request_id: 'r-h1', video_url: NUESTRA('a'), costo_usd: 1.06 }])
    expect(filtros).toEqual(expect.arrayContaining([['from', 'agent_invocations'], ['eq', 'client_id', 'cli1'], ['eq', 'status', 'completed'], ['in', 'metadata->>huella', ['h1', 'h2', 'h3', 'h4', 'h5']]]))
    expect(pedidas.every(([, m]) => m === 'HEAD')).toBe(true)
    expect(pedidas.map(([u]) => u)).not.toContain('https://proveedor.test/x.mp4')
  })
  it('🔴 si la comprobación de UNA copia se cae, esa no cuenta pero las otras sí', async () => {
    const { db } = dbFalsa([fila('h1', NUESTRA('cae')), fila('h2', NUESTRA('viva'))])
    const f = (async (url: string) => { if (url.includes('cae')) throw new Error('sin red'); return { ok: true } }) as never
    expect((await crearPuertos(db as never, ENV as never, f).video!.buscarPagados!({ client_id: 'c', huellas: ['h1', 'h2'] })).map((x) => x.huella)).toEqual(['h2'])
  })
  it('sin huellas no lee; si el libro falla o la red se cae, devuelve [] (se paga como siempre, nunca lanza)', async () => {
    const vacio = dbFalsa([fila('h1', NUESTRA('a'))])
    expect(await crearPuertos(vacio.db as never, ENV as never, fetchHead([]).f).video!.buscarPagados!({ client_id: 'c', huellas: [] })).toEqual([])
    expect(vacio.filtros).toHaveLength(0)
    expect(await crearPuertos(dbFalsa([], { message: 'caído' }).db as never, ENV as never, fetchHead([]).f).video!.buscarPagados!({ client_id: 'c', huellas: ['h1'] })).toEqual([])
    const red = (async () => { throw new Error('sin red') }) as never
    expect(await crearPuertos(dbFalsa([fila('h1', NUESTRA('a'))]).db as never, ENV as never, red).video!.buscarPagados!({ client_id: 'c', huellas: ['h1'] })).toEqual([])
  })
})
