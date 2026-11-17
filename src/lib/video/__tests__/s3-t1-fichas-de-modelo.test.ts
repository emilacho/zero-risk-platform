/**
 * 17-nov · Sprint 3 · T1 «abrir el pedido» (GO Lenovo, Emilio firmó 11:54) · los modelos y sus límites son DATO: una ficha por modelo.
 * Antes: `MODELOS_PERMITIDOS` fijo (dos Seedance), 8–15 s por video y 9 fotos para todos. Puras, sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import * as P from '../parametros'
import { armarPedido, armarPedidoDePlano, catalogoDeModelos, configDelBrazo, fichaPorOmision, CATALOGO_POR_OMISION, FICHAS_POR_OMISION, MODELO_APROBADO } from '../parametros'
import { VIDEO_POR_OMISION } from '../../oficina/mesa/pedidos'
import { traducirGuion } from '../../oficina/video/guion'

const base = { prompt: 'un pedido suficientemente largo para el modelo', formato: 'reel' }
const KLING = { segundos_min: 3, segundos_max: 10, referencias_max: 4, audio: false, precio_usd_s: 0.126, fuente: 'cotización gratis del 17-nov' }

describe('las fichas por omisión salen de la documentación del proveedor', () => {
  it('Seedance 2.5: 4–30 s, 30 imágenes, audio (docs.higgsfield.ai, 17-nov); Seedance 2.0: lo que ya usaba el código (15 s, 9 imágenes)', () => {
    expect(FICHAS_POR_OMISION['bytedance/seedance-2.5']).toMatchObject({ segundos_min: 4, segundos_max: 30, referencias_max: 30, audio: true })
    expect(FICHAS_POR_OMISION['bytedance/seedance-2.0']).toMatchObject({ segundos_min: 4, segundos_max: 15, referencias_max: 9, audio: true })
    for (const f of Object.values(FICHAS_POR_OMISION)) expect(f.fuente.length).toBeGreaterThan(10)
    expect(fichaPorOmision()).toBe(FICHAS_POR_OMISION[MODELO_APROBADO])
  })
  it('🔴 ya no hay duraciones, modelos ni fotos fijos en el código', () => {
    for (const viejo of ['DURACION_MIN_S', 'DURACION_MAX_S', 'DURACION_MIN_PLANO_S', 'DURACION_MAX_PLANO_S', 'MODELOS_PERMITIDOS', 'MAX_FOTOS_DE_REFERENCIA']) expect(P, viejo).not.toHaveProperty(viejo)
  })
})

describe('el catálogo con la configuración del brazo (`cadena_config.brazo_de_video.modelos`)', () => {
  it('sin configuración: las fichas por omisión y Seedance 2.5 por omisión', () => {
    expect(catalogoDeModelos(null)).toEqual(CATALOGO_POR_OMISION)
    expect(configDelBrazo(null).catalogo).toEqual(CATALOGO_POR_OMISION)
  })
  it('suma un modelo con su ficha completa; corrige una ficha existente con solo lo que cambia; `null` quita un modelo', () => {
    const c = catalogoDeModelos({ modelos: { 'kling/kling-4.0': KLING, 'bytedance/seedance-2.5': { segundos_max: 20 }, 'bytedance/seedance-2.0': null } })
    expect(c.fichas['kling/kling-4.0']).toEqual(KLING)
    expect(c.fichas['bytedance/seedance-2.5']).toMatchObject({ segundos_min: 4, segundos_max: 20, referencias_max: 30, audio: true })
    expect(c.fichas).not.toHaveProperty('bytedance/seedance-2.0')
  })
  it('lo inválido se ignora y queda lo de por omisión: ficha incompleta de un modelo nuevo, máximo < mínimo, nombre raro', () => {
    const c = catalogoDeModelos({ modelos: { 'kling/kling-4.0': { segundos_max: 10 }, 'bytedance/seedance-2.5': { segundos_min: 20, segundos_max: 10 }, 'sin-barra': KLING, 'x/y z': KLING } })
    expect(c.fichas).toEqual(FICHAS_POR_OMISION)
    // a un modelo NUEVO le falta UNO de los tres límites: no entra (no se inventa el que falta)
    const { segundos_min: _a, ...sinMin } = KLING
    const { segundos_max: _b, ...sinMax } = KLING
    const { referencias_max: _c, ...sinRefs } = KLING
    for (const f of [sinMin, sinMax, sinRefs]) expect(catalogoDeModelos({ modelos: { 'kling/kling-4.0': f } }).fichas, JSON.stringify(f)).not.toHaveProperty('kling/kling-4.0')
  })
  it('nunca queda vacío: quitar todos devuelve el catálogo por omisión; `modelo_por_omision` vale solo si está en el catálogo', () => {
    expect(catalogoDeModelos({ modelos: { 'bytedance/seedance-2.5': null, 'bytedance/seedance-2.0': null } })).toEqual(CATALOGO_POR_OMISION)
    expect(catalogoDeModelos({ modelos: { 'kling/kling-4.0': KLING }, modelo_por_omision: 'kling/kling-4.0' }).por_omision).toBe('kling/kling-4.0')
    expect(catalogoDeModelos({ modelo_por_omision: 'kling/kling-4.0' }).por_omision).toBe(MODELO_APROBADO)
    expect(catalogoDeModelos({ modelos: { 'bytedance/seedance-2.5': null } }).por_omision).toBe('bytedance/seedance-2.0')
  })
})

describe('el pedido se valida contra la ficha del modelo elegido', () => {
  const conKling = catalogoDeModelos({ modelos: { 'kling/kling-4.0': KLING } })
  it('la duración: la de SU modelo (2.5 hasta 30, 2.0 hasta 15); sin `segundos`, la mínima del modelo', () => {
    expect(armarPedido({ ...base, segundos: 30 })).toMatchObject({ ok: true, pedido: { segundos: 30 } })
    expect(armarPedido({ ...base, segundos: 31 })).toMatchObject({ ok: false })
    expect(armarPedido({ ...base, modelo: 'bytedance/seedance-2.0', segundos: 15 })).toMatchObject({ ok: true })
    expect(armarPedido({ ...base, modelo: 'bytedance/seedance-2.0', segundos: 16 })).toMatchObject({ ok: false, errores: [expect.stringContaining('de 4 a 15 (lo que admite bytedance/seedance-2.0)')] })
    expect(armarPedido(base)).toMatchObject({ ok: true, pedido: { segundos: 4 } })
    expect(armarPedido({ ...base, modelo: 'kling/kling-4.0' }, conKling)).toMatchObject({ ok: true, pedido: { segundos: 3, modelo: 'kling/kling-4.0' } })
    expect(armarPedido({ ...base, modelo: 'kling/kling-4.0', segundos: 11 }, conKling)).toMatchObject({ ok: false })
  })
  it('un modelo fuera del catálogo se rechaza con la lista del catálogo (no la de antes)', () => {
    const r = armarPedido({ ...base, modelo: 'kling/kling-4.0' })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.errores.join(' ')).toContain('bytedance/seedance-2.5, bytedance/seedance-2.0')
    expect(!r.ok && r.errores.join(' ')).not.toMatch(/segundos/)
  })
  it('las fotos: hasta lo que admite el modelo; el audio por omisión: el de la ficha', () => {
    const fotos = Array.from({ length: 12 }, (_, i) => `https://x/f${i}.jpg`)
    expect(armarPedido({ ...base, fotos })).toMatchObject({ ok: true, pedido: { fotos: { length: 12 }, audio: true } })
    expect(armarPedido({ ...base, modelo: 'kling/kling-4.0', fotos }, conKling)).toMatchObject({ ok: true, pedido: { fotos: { length: 4 }, audio: false } })
    expect(armarPedido({ ...base, modelo: 'kling/kling-4.0', audio: true }, conKling)).toMatchObject({ ok: true, pedido: { audio: true } })
  })
  it('un plano: los límites del clip de su modelo y una sola foto; el error dice que es de un plano', () => {
    expect(armarPedidoDePlano({ ...base, segundos: 30 })).toMatchObject({ ok: true, pedido: { segundos: 30 } })
    expect(armarPedidoDePlano({ ...base, segundos: 31 })).toMatchObject({ ok: false, errores: [expect.stringMatching(/^`segundos` de un plano es un entero de 4 a 30/)] })
    expect(armarPedidoDePlano({ ...base, modelo: 'kling/kling-4.0', segundos: 3 }, conKling)).toMatchObject({ ok: true })
    expect(armarPedidoDePlano({ ...base, fotos: ['https://x/a.jpg', 'https://x/b.jpg'] })).toMatchObject({ ok: false })
  })
})

describe('la oficina usa la ficha del modelo cuando la plantilla no trae la duración', () => {
  it('VIDEO_POR_OMISION y el traductor del guion: el rango del modelo por omisión (no 8–15)', () => {
    expect(VIDEO_POR_OMISION).toMatchObject({ segundos_min: fichaPorOmision().segundos_min, segundos_max: fichaPorOmision().segundos_max })
    expect(traducirGuion(['## Plano 1 · 0–25 s', 'Se ve: el pan'].join('\n')).segundos).toBe(25)
  })
  it('lo que diga la plantilla (dato) sigue mandando dentro de eso', () => {
    expect(traducirGuion(['## Plano 1 · 0–25 s', 'Se ve: el pan'].join('\n'), { segundosMin: 8, segundosMax: 15 }).segundos).toBe(15)
  })
})
