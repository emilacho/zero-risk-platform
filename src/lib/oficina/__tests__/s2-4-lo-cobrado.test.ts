/**
 * 17-nov · S2-4 (CC1, reasignado por Lenovo 02:47) · arreglo §2 de CC7 sobre #1048: cuando el video plano por plano FALLA, lo que el proveedor YA cobró no se pierde.
 * Va al gasto del encargo (tope de campaña, fallidos «que gastaron») y al libro de la oficina, un gasto por clip; el motivo dice cuánto. Y §3: el envío que se corta a
 * mitad no dice que «reabrir los reutiliza»: espera a los ya enviados, anota lo que cobraron y el lote incompleto NUNCA se une. US$ 0: todo con puertos falsos.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { sessionIdDeVideo } from '../../video/libro'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { recibirVideo, sondearPlanos, sondearVideos } from '../orquestador-video'
import { abrirEncargo } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { EstadoDelBrazo, PuertoDeVideo } from '../puertos'
import type { Plantilla } from '../tipos'
import { leerPlanos, textoDeLoCobrado, type PlanoEnviado } from '../video/motor-planos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { VIDEO_MESA_ANTES_DE_S2_3 } from './video-mesa-antes-de-s2-3'

const ALMACEN = 'https://abcd.supabase.co/storage/v1/object/public/oficina'
const enviados3: PlanoEnviado[] = [1, 2, 3].map((n) => ({ n, request_id: `req-${n}`, costo_estimado_usd: 1, segundos: 4, cortar_a_s: 4 }))
const hecho = (n: number, extra: Record<string, unknown> = {}): EstadoDelBrazo => ({ ok: true, terminal: true, status: 'completed', video_url: `${ALMACEN}/videos/req-${n}.mp4`, url_proveedor: null, costo_usd: 1.06, expires_at: null, copia: 'bucket', aviso: null, ...extra } as EstadoDelBrazo)
const enCurso: EstadoDelBrazo = { ok: true, terminal: false, status: 'in_progress' } as EstadoDelBrazo
const fallo: EstadoDelBrazo = { ok: true, terminal: true, status: 'nsfw', error: 'bloqueado' } as EstadoDelBrazo

describe('leerPlanos · espera a TODOS y devuelve lo cobrado aunque el video falle', () => {
  it('🔴 un plano falló y los otros dos terminaron: cierra con los DOS cobrados', () => {
    const l = leerPlanos(enviados3, [hecho(1), fallo, hecho(3)], false, 45)
    expect(l).toMatchObject({ listo: true, ok: false, status: 'nsfw' })
    expect(!l.listo || l.ok ? null : l.cobrados).toEqual([{ n: 1, request_id: 'req-1', costo_usd: 1.06 }, { n: 3, request_id: 'req-3', costo_usd: 1.06 }])
  })
  it('🔴 un plano falló pero otro sigue en curso: ESPERA (el que sigue también se cobrará y tiene que quedar anotado)', () => {
    expect(leerPlanos(enviados3, [hecho(1), fallo, enCurso], false, 45)).toEqual({ listo: false })
  })
  it('vencido con uno en curso y uno fallido: cierra con el fallo y lo cobrado', () => {
    const l = leerPlanos(enviados3, [hecho(1), fallo, enCurso], true, 45)
    expect(l).toMatchObject({ listo: true, ok: false, status: 'nsfw', cobrados: [{ n: 1, request_id: 'req-1', costo_usd: 1.06 }] })
  })
  it('el clip que quedó solo en el proveedor TAMBIÉN se cobró: va en lo cobrado', () => {
    const l = leerPlanos(enviados3, [hecho(1), hecho(2, { copia: 'solo_proveedor', aviso: 'pesa 25 MB' }), hecho(3)], false, 45)
    expect(l).toMatchObject({ listo: true, ok: false, status: 'plano_sin_copia' })
    expect(!l.listo || l.ok ? null : l.cobrados.map((c) => c.n)).toEqual([1, 2, 3])
  })
  it('pasó el plazo sin fallos: sin_vuelta con lo que sí terminó', () => {
    expect(leerPlanos(enviados3, [hecho(1), enCurso, hecho(3, { costo_usd: 0.5 })], true, 45)).toMatchObject({ status: 'sin_vuelta', cobrados: [{ n: 1, costo_usd: 1.06 }, { n: 3, costo_usd: 0.5 }] })
  })
  it('dos planos fallan: el motivo es el del PRIMERO (en el orden del guion)', () => {
    const otro: EstadoDelBrazo = { ok: true, terminal: true, status: 'failed', error: 'se cayó' } as EstadoDelBrazo
    expect(leerPlanos(enviados3, [hecho(1), fallo, otro], false, 45)).toMatchObject({ status: 'nsfw', error: expect.stringMatching(/plano 2/) })
  })
  it('un clip a US$ 0 no se anota como cobrado', () => {
    expect(leerPlanos(enviados3, [hecho(1, { costo_usd: 0 }), fallo, hecho(3)], false, 45)).toMatchObject({ cobrados: [{ n: 3 }] })
  })
  it('todos bien: no hay «cobrados» (el éxito anota los clips por su camino)', () => {
    const l = leerPlanos(enviados3, [hecho(1), hecho(2), hecho(3)], false, 45)
    expect(l).toMatchObject({ listo: true, ok: true })
    expect('cobrados' in l).toBe(false)
  })
})

describe('textoDeLoCobrado · el motivo dice cuánto', () => {
  it('suma, cantidad y planos en orden; vacío si no se cobró nada', () => {
    expect(textoDeLoCobrado([{ n: 3, request_id: 'b', costo_usd: 1.06 }, { n: 1, request_id: 'a', costo_usd: 0.5 }])).toBe(' · ya se cobraron US$ 1.5600 por 2 clip(s) (planos 1, 3): quedan en el gasto del encargo y en el libro')
    expect(textoDeLoCobrado([])).toBe('')
  })
})

/** un brazo falso con TODO lo del camino B (cotizar, enviar, estado, encuadrar, unir) */
function brazo(o: { estados: (id: string) => EstadoDelBrazo; une?: boolean; falla_envio_en?: number }) {
  const reg = { enviados: [] as string[], uniones: 0 }
  let k = 0
  const v: PuertoDeVideo = {
    async cotizar() { return { ok: true, costo_estimado_usd: 1.06, costo_lista_usd: 1.06 } },
    async enviar(p) { k++; if (o.falla_envio_en === k) return { ok: false, error: 'rechazado' }; reg.enviados.push(p.pedido.clave); return { ok: true, request_id: `req-${k}`, status: 'queued', costo_estimado_usd: 1.06, simulado: false } },
    async estado(id) { return o.estados(id) },
    async encuadrar() { return { ok: true as const, bytes: Buffer.from('jpg') } },
    async unir() { reg.uniones++; return o.une === false ? { ok: false as const, error: 'ffmpeg murió' } : { ok: true as const, bytes: Buffer.from('mp4') } },
  }
  return { v, reg }
}

describe('sondearPlanos · el fallo lleva lo cobrado', () => {
  const pv = (extra: Record<string, unknown> = {}) => ({ pedido_video: { version: 2, datos: { pedido: { relacion: '9:16', resolucion: '720p' }, envio: { planos: enviados3, ...extra } } } })
  const enc = (extra: Record<string, unknown> = {}) => ({ id: 'enc1', client_id: 'cli1', brief_id: 'b', estado_del_motor: { artefactos: pv(extra), gasto_usd: 0 } })
  const P = (b: ReturnType<typeof brazo>) => ({ video: b.v, ahora: () => new Date('2026-11-17T03:00:00Z'), async guardarArchivos(_r: string, a: Array<{ nombre: string }>) { return { ok: true as const, urls: { [a[0].nombre]: `${ALMACEN}/x.mp4` } } } })
  it('🔴 el unidor falla con los 3 clips cobrados: no_se_unio con los 3', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), une: false })
    const r = await sondearPlanos(P(b) as never, enc() as never, enviados3, '2026-11-17T02:50:00Z', new Date('2026-11-17T03:00:00Z'))
    expect(r).toMatchObject({ ok: false, status: 'no_se_unio', cobrado: [{ n: 1, costo_usd: 1.06 }, { n: 2, costo_usd: 1.06 }, { n: 3, costo_usd: 1.06 }] })
  })
  it('no_se_unio con un clip a US$ 0: ese no va en lo cobrado', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4)), id === 'req-2' ? { costo_usd: 0 } : {}), une: false })
    const r = await sondearPlanos(P(b) as never, enc() as never, enviados3, '2026-11-17T02:50:00Z', new Date('2026-11-17T03:00:00Z'))
    expect(r && !r.ok && r.cobrado?.map((c) => c.n)).toEqual([1, 3])
  })
  it('🔴 lote incompleto (el envío se cortó a mitad): espera a los enviados, NUNCA une y falla con lo que cobraron', async () => {
    const pend = brazo({ estados: (id) => (id === 'req-2' ? enCurso : hecho(Number(id.slice(4)))) })
    expect(await sondearPlanos(P(pend) as never, enc({ lote_incompleto: 'se cortó en el plano 4' }) as never, enviados3, '2026-11-17T02:50:00Z', new Date('2026-11-17T03:00:00Z'))).toBeNull()
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    const r = await sondearPlanos(P(b) as never, enc({ lote_incompleto: 'se cortó en el plano 4' }) as never, enviados3, '2026-11-17T02:50:00Z', new Date('2026-11-17T03:00:00Z'))
    expect(r).toMatchObject({ ok: false, status: 'lote_incompleto', error: 'se cortó en el plano 4' })
    expect(r && !r.ok && r.cobrado?.map((c) => c.n)).toEqual([1, 2, 3])
    expect(b.reg.uniones).toBe(0)
  })
  it('lote incompleto con un enviado fallido: falla igual, con lo cobrado de los demás', async () => {
    const b = brazo({ estados: (id) => (id === 'req-2' ? fallo : hecho(Number(id.slice(4)))) })
    const r = await sondearPlanos(P(b) as never, enc({ lote_incompleto: 'corte' }) as never, enviados3, '2026-11-17T02:50:00Z', new Date('2026-11-17T03:00:00Z'))
    expect(r).toMatchObject({ ok: false, status: 'lote_incompleto' })
    expect(r && !r.ok && r.cobrado?.map((c) => c.n)).toEqual([1, 3])
  })
})

// ───────────────────────── el camino ENTERO: la mesa → el pedido por plano → el envío real (falso) → el vigía → el encargo fallido con lo cobrado
const PLANTILLA_B: Plantilla = { ...VIDEO_MESA_ANTES_DE_S2_3, limites: { ...VIDEO_MESA_ANTES_DE_S2_3.limites, video: { ...(VIDEO_MESA_ANTES_DE_S2_3.limites.video as Record<string, unknown>), plano_por_plano: true } } }
const GUION = [
  '## Plano 1 · 0–4 s', 'Se ve: el pan recién salido del horno, el vapor sube', 'Producto: sí', 'Movimiento: acercamiento lento', 'Foto: ninguna',
  '## Plano 2 · 4–8 s', 'Se ve: una mano parte el pan en la mesa larga', 'Producto: sí', 'Movimiento: cámara fija', 'Foto: ninguna',
  '## Plano 3 · 8–12 s', 'Se ve: la puerta abierta con la mesa puesta', 'Producto: no', 'Movimiento: cámara fija', 'Foto: ninguna',
  '## Audio', 'ambiente de cocina, sin voz', '## Pie', 'Hay mesa desde las siete.', '## Etiquetas', '#pan',
  '## Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé',
].join('\n')

async function hastaElBrazo(b: ReturnType<typeof brazo>) {
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: PLANTILLA_B })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  M.P.video = b.v
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: false, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const { ultima } = await jugar(M, id, a, (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION }
    return { texto: `Respuesta de ${t.agente}.` }
  }, 120)
  return { M, id, ultima }
}
const gastoAntes = (M: ReturnType<typeof crearMemoria>, id: string) => M.encargos.get(id)!.gasto_usd

describe('el camino entero · el encargo fallido lleva lo cobrado en su gasto y en el libro (un gasto por clip)', () => {
  it('🔴 no_se_unio con 3 clips cobrados ⇒ fallido, gasto = antes + 3,18 y 3 gastos «video» en el libro; el motivo lo dice', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), une: false })
    const { M, id, ultima } = await hastaElBrazo(b)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo' })
    expect(b.reg.enviados).toHaveLength(3)
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    const s = await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(s.fallidos).toEqual([id])
    const enc = M.encargos.get(id)!
    expect(enc.estado).toBe('fallido')
    expect(enc.gasto_usd).toBeCloseTo(antes + 3.18, 6)
    const video = M.gastos.filter((g) => g.concepto === 'video')
    expect(video.map((g) => [g.ref_id, g.cost_usd, g.base])).toEqual([1, 2, 3].map((k) => [sessionIdDeVideo(`req-${k}`), 1.06, 'usage']))
    expect(String((enc.estado_del_motor as unknown as { causa_del_fallo?: { motivo?: string } }).causa_del_fallo?.motivo ?? JSON.stringify(enc.estado_del_motor))).toMatch(/ya se cobraron US\$ 3\.1800 por 3 clip\(s\) \(planos 1, 2, 3\)/)
  })
  it('🔴 un plano fallido y dos terminados ⇒ fallido con 2 gastos y gasto = antes + 2,12', async () => {
    const b = brazo({ estados: (id) => (id === 'req-2' ? fallo : hecho(Number(id.slice(4)))) })
    const { M, id, ultima } = await hastaElBrazo(b)
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(M.encargos.get(id)!.estado).toBe('fallido')
    expect(M.encargos.get(id)!.gasto_usd).toBeCloseTo(antes + 2.12, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video').map((g) => g.ref_id)).toEqual([sessionIdDeVideo('req-1'), sessionIdDeVideo('req-3')])
  })
  it('🔴 el envío se corta en el plano 3: el encargo NO cierra en el acto; espera a los 2 enviados y falla con lo que cobraron (sin unir)', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), falla_envio_en: 3 })
    const { M, id, ultima } = await hastaElBrazo(b)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', lote_incompleto: true })
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    const enc = M.encargos.get(id)!
    expect(enc.estado).toBe('fallido')
    expect(enc.gasto_usd).toBeCloseTo(antes + 2.12, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(2)
    expect(b.reg.uniones).toBe(0)
    expect(JSON.stringify(enc.estado_del_motor)).not.toMatch(/reutiliza|no los paga dos veces/)
  })
  it('sin nada cobrado (todos fallan): fallido sin gasto extra ni gastos de video', async () => {
    const b = brazo({ estados: () => fallo })
    const { M, id, ultima } = await hastaElBrazo(b)
    const antes = gastoAntes(M, id)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    await sondearVideos(M.P, [{ encargo_id: id, n, paso: 'video', inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
    expect(M.encargos.get(id)!.gasto_usd).toBeCloseTo(antes, 6)
    expect(M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(0)
  })
  it('recibirVideo es la puerta: un fallo con lo cobrado repetido (otro vigía) no lo anota dos veces', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), une: false })
    const { M, id, ultima } = await hastaElBrazo(b)
    const n = Number((ultima.cuerpo.turno as { n: number }).n)
    const res = { ok: false as const, status: 'no_se_unio', error: 'x', cobrado: [{ n: 1, request_id: 'req-1', costo_usd: 1.06 }] }
    await recibirVideo(M.P, id, n, res)
    await recibirVideo(M.P, id, n, res)
    expect(M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(1)
  })
})
