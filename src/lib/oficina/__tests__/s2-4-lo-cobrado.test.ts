/**
 * 17-nov · S2-4 (CC1, reasignado por Lenovo 02:47) · arreglo §2 de CC7 sobre #1048: cuando el video plano por plano FALLA, lo que el proveedor YA cobró no se pierde.
 * Va al gasto del encargo (tope de campaña, fallidos «que gastaron») y al libro de la oficina, un gasto por clip; el motivo dice cuánto. Y §3: el envío que se corta a
 * mitad no dice que «reabrir los reutiliza»: espera a los ya enviados, anota lo que cobraron y el lote incompleto NUNCA se une. US$ 0: todo con puertos falsos.
 */
import { describe, expect, it } from 'vitest'
import { sessionIdDeVideo } from '../../video/libro'
import { recibirVideo, sondearPlanos, sondearVideos } from '../orquestador-video'
import type { EstadoDelBrazo } from '../puertos'
import { leerPlanos, textoDeLoCobrado } from '../video/motor-planos'
import { ALMACEN, brazo, enCurso, enviados3, fallo, gastoAntes, hastaElBrazo, hecho } from './s2-4-arnes'


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
