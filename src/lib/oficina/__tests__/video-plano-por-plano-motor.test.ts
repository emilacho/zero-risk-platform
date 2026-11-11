/**
 * 11-nov · camino B (GO Lenovo 16:43 + 16:58) · el paso `video` plano por plano, sin red y a US$ 0: el interruptor de la plantilla, encuadrar las fotos, cotizar la SUMA
 * contra el tope antes de enviar nada, un envío por plano, esperar a TODOS y unir. Un cliente con fotos (restaurante) y uno sin fotos (B2B).
 */
import { describe, expect, it } from 'vitest'
import { ejecutarCodigoV, enviarVideo, gastosDelVideo, planoPorPlanoEncendido, recibirVideo, sondearPlanos } from '../orquestador-video'
import { sessionIdDeVideo } from '../../video/libro'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { cotizarYEnviar, encuadrarFotos, leerPlanos, unirClips, type PlanoEnviado } from '../video/motor-planos'
import { pedidosPorPlano, type PedidoDePlano } from '../video/planos'
import type { EstadoDelBrazo, PuertoDeVideo } from '../puertos'
import type { FotoEtiquetada } from '../fotos'
import type { Plantilla } from '../tipos'

const ALMACEN = 'https://abcd.supabase.co/storage/v1/object/public/oficina'
const conB = (on: boolean): Plantilla => ({ ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as object), ...(on ? { plano_por_plano: true } : {}) } } })
const FOTOS: FotoEtiquetada[] = [
  { id: '9f71b0e9-0000-4000-8000-000000000001', url: `${ALMACEN}/fotos/fachada.jpg`, origen: 'propia' },
  { id: '6275c0ba-0000-4000-8000-000000000002', url: `${ALMACEN}/fotos/olla.jpg`, origen: 'propia' },
]
const guion = {
  ok: true, segundos: 12, audio: 'olas', pie_de_foto: 'pie', hashtags: ['#a'], fotos_ids: [], avisos: [], texto: 'guion',
  planos: [
    { n: 1, desde: 0, hasta: 3, se_ve: 'Fachada al amanecer', foto_id: FOTOS[0].id },
    { n: 2, desde: 3, hasta: 7, se_ve: 'Olla hirviendo', foto_id: FOTOS[1].id },
    { n: 3, desde: 7, hasta: 12, se_ve: 'Cierre con el logo' },
  ],
}
const brief = { id: 'F1-S1-ig-r1', red: 'Instagram', formato: 'reel', prohibido: [], aprueba: '', texto: 'brief' }
const estado = (fotos: FotoEtiquetada[], extra: Record<string, unknown> = {}) => ({
  artefactos: {
    encargo: { version: 1, datos: { brief, proporcion: '9:16', F: { fotos }, familia: 'video', plataforma: 'instagram-reel', elementos: [], formato_video: 'reel' } },
    guion: { version: 1, datos: structuredClone(guion) },
    ...extra,
  },
  gasto_usd: 2, pasos_ejecutados: 3, fichas: [],
})
const enc = (fotos: FotoEtiquetada[], dry_run = false, extra: Record<string, unknown> = {}) => ({ id: 'enc1', client_id: 'cli1', brief_id: brief.id, familia: 'video_mesa', dry_run, estado_del_motor: estado(fotos, extra) })
const pasoPedido = VIDEO_MESA.pasos.find((p) => p.clave === 'pedido')!
const pasoVideo = VIDEO_MESA.pasos.find((p) => p.clave === 'video')!

describe('el interruptor', () => {
  it('apagado (o sin dato) = camino A, una toma: no hay pedidos por plano', async () => {
    expect(planoPorPlanoEncendido(VIDEO_MESA)).toBe(false)
    const r = await ejecutarCodigoV({} as never, enc(FOTOS) as never, conB(false), pasoPedido)
    expect(r.fallido).toBeUndefined()
    expect((r.res.artefacto as Record<string, unknown>).planos).toBeUndefined()
  })
  it('encendido y 2+ planos = un pedido por plano, además del de una toma (que siguen viendo la jefatura y la hoja)', async () => {
    const r = await ejecutarCodigoV({} as never, enc(FOTOS) as never, conB(true), pasoPedido)
    const a = r.res.artefacto as { pedido: { prompt: string }; planos: PedidoDePlano[] }
    expect(a.pedido.prompt).toContain('Plano 1')
    expect(a.planos.map((p) => [p.n, p.fotos.length, p.segundos, p.cortar_a_s])).toEqual([[1, 1, 4, 3], [2, 1, 4, 4], [3, 0, 5, 5]])
  })
  it('encendido con UN solo plano: camino A (no hay nada que unir)', async () => {
    const e = enc(FOTOS)
    ;(e.estado_del_motor.artefactos.guion.datos as typeof guion).planos = [guion.planos[0]].map((p) => ({ ...p, hasta: 10 }))
    const r = await ejecutarCodigoV({} as never, e as never, conB(true), pasoPedido)
    expect((r.res.artefacto as Record<string, unknown>).planos).toBeUndefined()
  })
})

// un brazo falso que registra todo
function brazo(o: { cotiza?: (p: PedidoDePlano | Record<string, unknown>) => number | null; falla_envio_en?: number; estados?: Record<string, EstadoDelBrazo>; encuadra?: boolean; une?: boolean } = {}) {
  const reg = { cotizados: [] as Array<Record<string, unknown>>, enviados: [] as Array<Record<string, unknown>>, encuadres: [] as string[], uniones: [] as Array<Record<string, unknown>>, guardados: [] as string[] }
  let k = 0
  const video: PuertoDeVideo = {
    async cotizar(p) { reg.cotizados.push({ ...p.pedido, tope: p.tope_usd }); const c = o.cotiza ? o.cotiza(p.pedido as never) : 1.06; return c === null ? { ok: false, error: 'no cotiza' } : { ok: true, costo_estimado_usd: c } },
    async enviar(p) { k++; reg.enviados.push({ ...p.pedido, tope: p.tope_usd, dry_run: p.dry_run }); if (o.falla_envio_en === k) return { ok: false, error: 'rechazado' }; return { ok: true, request_id: p.dry_run ? `dry-${p.pedido.clave}` : `req-${k}`, status: 'queued', costo_estimado_usd: 1.06, simulado: p.dry_run } },
    async estado(id) { return o.estados?.[id] ?? { ok: true, terminal: false, status: 'in_progress' } },
    ...(o.encuadra === false ? {} : { async encuadrar(p: { url: string; relacion: string }) { reg.encuadres.push(`${p.url}@${p.relacion}`); return { ok: true as const, bytes: Buffer.from('jpg') } } }),
    ...(o.une === false ? {} : { async unir(p: { clips: Array<{ url: string; segundos: number }>; relacion: string; resolucion: string }) { reg.uniones.push(p); return { ok: true as const, bytes: Buffer.from('mp4') } } }),
  }
  const guardados: Array<Record<string, unknown>> = []
  const P = {
    video, ahora: () => new Date('2026-11-11T17:00:00Z'),
    async guardarArchivos(ruta: string, archivos: Array<{ nombre: string }>) { reg.guardados.push(`${ruta}/${archivos[0].nombre}`); return { ok: true as const, urls: Object.fromEntries(archivos.map((a) => [a.nombre, `${ALMACEN}/${ruta}/${a.nombre}`])) } },
    almacen: { async guardar(c: Record<string, unknown>) { guardados.push(c); return { ok: true } } },
  }
  return { P, reg, guardados }
}
const planosDe = (fotos: FotoEtiquetada[]) => (pedidosPorPlano({ guion, brief, fotos, clave: 'enc1:F1:v1', relacion: '9:16' }) as { ok: true; pedidos: PedidoDePlano[] }).pedidos

describe('encuadrar las fotos de los planos', () => {
  it('cliente con fotos: cada foto se encuadra a la proporción de la red y el plano viaja con el ENCUADRE', async () => {
    const { P, reg } = brazo()
    const r = await encuadrarFotos(P as never, { id: 'enc1', client_id: 'cli1', dry_run: false }, planosDe(FOTOS), 1)
    expect(reg.encuadres).toEqual([`${FOTOS[0].url}@9:16`, `${FOTOS[1].url}@9:16`])
    expect(r.ok && r.planos.map((p) => p.fotos[0] ?? null)).toEqual([`${ALMACEN}/oficina/cli1/enc1/encuadres/p1-1.jpg`, `${ALMACEN}/oficina/cli1/enc1/encuadres/p2-1.jpg`, null])
  })
  it('cliente sin fotos: no se encuadra nada (ni hace falta el unidor)', async () => {
    const { P, reg } = brazo({ encuadra: false })
    const r = await encuadrarFotos(P as never, { id: 'enc1', client_id: 'cli1', dry_run: false }, planosDe([]), 1)
    expect(r.ok).toBe(true)
    expect(reg.encuadres).toEqual([])
  })
  it('con fotos y sin unidor conectado: falla SIN gastar (recuperable)', async () => {
    const { P } = brazo({ encuadra: false })
    const r = await encuadrarFotos(P as never, { id: 'enc1', client_id: 'cli1', dry_run: false }, planosDe(FOTOS), 1)
    expect(!r.ok && r.motivo).toMatch(/no se gastó nada/)
  })
  it('en seco no sale a la red', async () => {
    const { P, reg } = brazo()
    await encuadrarFotos(P as never, { id: 'enc1', client_id: 'cli1', dry_run: true }, planosDe(FOTOS), 1)
    expect(reg.encuadres).toEqual([])
  })
})

describe('cotizar la suma y enviar cada plano', () => {
  const e = { id: 'enc1', client_id: 'cli1', dry_run: false }
  it('🔴 la suma cabe: se envía cada plano con su clave y por imagen a video (plano:true)', async () => {
    const { P, reg } = brazo()
    const r = await cotizarYEnviar(P as never, e, planosDe(FOTOS), 5, 4)
    expect(r.ok && r.enviados.map((x) => x.request_id)).toEqual(['req-1', 'req-2', 'req-3'])
    expect(reg.cotizados).toHaveLength(3)
    expect(reg.enviados.map((x) => [x.clave, x.plano, x.dry_run])).toEqual([['enc1:F1:v1:p1', true, false], ['enc1:F1:v1:p2', true, false], ['enc1:F1:v1:p3', true, false]])
    // la reserva de cada plano: lo que le queda al video
    expect(reg.enviados.map((x) => x.tope)).toEqual([5, 3.94, 2.88])
  })
  it('🔴 la suma NO cabe en el tope: no se envía NINGUNO (US$ 0, recuperable)', async () => {
    const { P, reg } = brazo({ cotiza: () => 2 })
    const r = await cotizarYEnviar(P as never, e, planosDe(FOTOS), 5, 4)
    expect(!r.ok && r.motivo).toMatch(/costarían US\$ 6\.0000 y el tope del video es US\$ 5 \(no se gastó nada/)
    expect(reg.enviados).toHaveLength(0)
  })
  it('un plano que no cotiza: no se envía ninguno', async () => {
    const { P, reg } = brazo({ cotiza: (p) => ((p as PedidoDePlano).clave.endsWith(':p2') ? null : 1) })
    const r = await cotizarYEnviar(P as never, e, planosDe(FOTOS), 5, 4)
    expect(!r.ok && r.motivo).toMatch(/plano 2/)
    expect(reg.enviados).toHaveLength(0)
  })
  it('un envío falla a mitad: el motivo dice cuáles ya se enviaron (y que reabrir no los paga dos veces)', async () => {
    const { P } = brazo({ falla_envio_en: 2 })
    const r = await cotizarYEnviar(P as never, e, planosDe(FOTOS), 5, 4)
    expect(!r.ok && r.motivo).toMatch(/plano 2: rechazado · ya se enviaron los planos 1/)
  })
  it('en seco: todo simulado, sin cotizar', async () => {
    const { P, reg } = brazo()
    const r = await cotizarYEnviar(P as never, { ...e, dry_run: true }, planosDe([]), 5, 4)
    expect(r.ok && r.simulado).toBe(true)
    expect(reg.cotizados).toHaveLength(0)
  })
})

describe('el paso video con planos (enviarVideo)', () => {
  const planos = planosDe(FOTOS)
  const conPedido = (dry: boolean) => enc(FOTOS, dry, { pedido_video: { version: 1, datos: { pedido: { formato: 'reel', segundos: 12, resolucion: '720p', relacion: '9:16', fotos: [], prompt: 'x' }, planos } } })
  it('real: encuadra, cotiza, envía y deja el turno del brazo esperando con los planos guardados', async () => {
    const { P, reg, guardados } = brazo()
    const r = await enviarVideo(P as never, conPedido(false) as never, conB(true), pasoVideo)
    expect(r.fallido).toBeUndefined()
    expect(r.esperar).toMatchObject({ accion: 'esperar_brazo', video: { planos: 3 } })
    expect(reg.encuadres).toHaveLength(2)
    const envio = (guardados[0].estado_del_motor as { artefactos: { pedido_video: { datos: { envio: { planos: PlanoEnviado[] } } } } }).artefactos.pedido_video.datos.envio
    expect(envio.planos.map((p) => [p.n, p.request_id, p.cortar_a_s])).toEqual([[1, 'req-1', 3], [2, 'req-2', 4], [3, 'req-3', 5]])
  })
  it('en seco: el paso se registra en el acto con un video unido simulado', async () => {
    const { P } = brazo()
    const r = await enviarVideo(P as never, conPedido(true) as never, conB(true), pasoVideo)
    expect(r.res?.artefacto).toMatchObject({ simulado: true, video_url: 'https://dry.invalid/video-unido.mp4' })
  })
})

describe('esperar a TODOS y unir', () => {
  const enviados: PlanoEnviado[] = [1, 2, 3].map((n) => ({ n, request_id: `req-${n}`, costo_estimado_usd: 1, segundos: 4, cortar_a_s: [3, 4, 5][n - 1] }))
  const hecho = (n: number, extra: Partial<Record<string, unknown>> = {}): EstadoDelBrazo => ({ ok: true, terminal: true, status: 'completed', video_url: `${ALMACEN}/videos/req-${n}.mp4`, url_proveedor: null, costo_usd: 1.06, expires_at: `2026-11-1${n}T00:00:00Z`, copia: 'bucket', aviso: null, ...extra } as EstadoDelBrazo)
  it('mientras falte alguno: espera', () => {
    expect(leerPlanos(enviados, [hecho(1), { ok: true, terminal: false, status: 'in_progress' }, hecho(3)], false, 45)).toEqual({ listo: false })
  })
  it('uno falló: cierra con el plano que falló', () => {
    const l = leerPlanos(enviados, [hecho(1), { ok: true, terminal: true, status: 'nsfw', error: 'bloqueado' }, hecho(3)], false, 45)
    expect(l).toMatchObject({ listo: true, ok: false, status: 'nsfw' })
    expect(!('clips' in l) && 'error' in l && l.error).toMatch(/plano 2/)
  })
  it('uno quedó solo en el proveedor: no se puede unir (el unidor solo baja de nuestro almacén)', () => {
    expect(leerPlanos(enviados, [hecho(1), hecho(2, { copia: 'solo_proveedor', aviso: 'pesa 25 MB' }), hecho(3)], false, 45)).toMatchObject({ listo: true, ok: false, status: 'plano_sin_copia' })
  })
  it('pasó el plazo con planos pendientes: cierra', () => {
    expect(leerPlanos(enviados, [hecho(1), { ok: false, error: 'red' }, hecho(3)], true, 45)).toMatchObject({ listo: true, ok: false, status: 'sin_vuelta' })
  })
  it('🔴 volvieron todos: se unen EN EL ORDEN del guion, cada clip cortado a su plano; el costo es la suma y un gasto por clip', async () => {
    const { P, reg } = brazo({ estados: { 'req-1': hecho(1), 'req-2': hecho(2), 'req-3': hecho(3) } })
    const e = enc(FOTOS, false, { pedido_video: { version: 2, datos: { pedido: { relacion: '9:16', resolucion: '720p' }, envio: { planos: [...enviados].reverse() } } } })
    const r = await sondearPlanos(P as never, e as never, [...enviados].reverse(), '2026-11-11T16:50:00Z', new Date('2026-11-11T17:00:00Z'))
    expect(reg.uniones[0]).toEqual({ clips: [1, 2, 3].map((n) => ({ url: `${ALMACEN}/videos/req-${n}.mp4`, segundos: [3, 4, 5][n - 1] })), relacion: '9:16', resolucion: '720p' })
    expect(r).toMatchObject({ ok: true, video_url: `${ALMACEN}/oficina/cli1/enc1/video-unido-${new Date('2026-11-11T17:00:00Z').getTime()}.mp4`, costo_usd: 3.18, copia: 'bucket', expires_at: '2026-11-11T00:00:00Z' })
    expect(r && r.ok && r.planos?.map((p) => p.request_id)).toEqual(['req-1', 'req-2', 'req-3'])
  })
  it('el unidor falla: el encargo cierra fallido visible con la causa', async () => {
    const { P } = brazo({ une: false, estados: { 'req-1': hecho(1), 'req-2': hecho(2), 'req-3': hecho(3) } })
    const e = enc(FOTOS, false, { pedido_video: { version: 2, datos: { pedido: { relacion: '9:16', resolucion: '720p' } } } })
    expect(await sondearPlanos(P as never, e as never, enviados, '2026-11-11T16:50:00Z', new Date('2026-11-11T17:00:00Z'))).toMatchObject({ ok: false, status: 'no_se_unio' })
  })
  it('unirClips en seco: no sale a la red', async () => {
    const { P, reg } = brazo()
    expect(await unirClips(P as never, { id: 'e', client_id: 'c' }, [{ video_url: 'https://dry.invalid/plano-1.mp4', cortar_a_s: 3 }], '9:16', '720p', 1)).toEqual({ ok: true, video_url: 'https://dry.invalid/video-unido.mp4' })
    expect(reg.uniones).toHaveLength(0)
  })
  it('recibirVideo existe y acepta los planos (tipo)', () => { expect(typeof recibirVideo).toBe('function') })
  it('🔴 el libro anota UN gasto por clip (cada uno con su fila del libro central); un clip a US$ 0 no se anota', () => {
    const base = { ok: true as const, status: 'completed' as const, video_url: 'u', url_proveedor: null, costo_usd: 2.12, expires_at: null, copia: 'bucket' as const, aviso: null }
    const g = gastosDelVideo({ ...base, planos: [{ n: 1, request_id: 'req-1', costo_usd: 1.06, video_url: 'a' }, { n: 2, request_id: 'req-2', costo_usd: 1.06, video_url: 'b' }, { n: 3, request_id: 'req-3', costo_usd: 0, video_url: 'c' }] }, 'req-1')
    expect(g.map((x) => [x.ref_id, x.cost_usd, x.concepto])).toEqual([[sessionIdDeVideo('req-1'), 1.06, 'video'], [sessionIdDeVideo('req-2'), 1.06, 'video']])
  })
  it('camino A: un solo gasto con el pedido de una toma', () => {
    const g = gastosDelVideo({ ok: true, status: 'completed', video_url: 'u', url_proveedor: null, costo_usd: 3.18, expires_at: null, copia: 'bucket', aviso: null }, 'req-9')
    expect(g).toEqual([{ concepto: 'video', ref_tabla: 'agent_invocations', ref_id: sessionIdDeVideo('req-9'), cost_usd: 3.18, base: 'usage' }])
  })
})
