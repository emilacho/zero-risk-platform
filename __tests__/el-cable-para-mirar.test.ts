/**
 * EL CABLE PARA MIRAR · lado de la puerta · pruebas a costo cero · CC#1 · 2026-09-25.
 * ROJO 2 del encargo, en su forma estática: SIN `images`, lo que la puerta añade al cuerpo hacia el
 * corredor es `{}` (el cuerpo de siempre, byte a byte). CON `images`, viaja `images` + `imagesMode`.
 */
import { describe, it, expect } from 'vitest'
import { leerImagenesDelPedido, campoImagenesDelProxy } from '@/lib/imagenes-del-pedido'

const URL_IG = 'https://scontent-gru1-2.cdninstagram.com/v/t51.2885-19/foto.jpg?oe=6ABB0B5B'

describe('la puerta deja pasar `images` sin cambiar nada para quien no lo manda', () => {
  it('ROJO 2 · sin el campo ⇒ nada que añadir al cuerpo del corredor', () => {
    const r = leerImagenesDelPedido({ agent: 'x', task: 'y' } as never, {})
    expect(r).toEqual({ images: [], imagesMode: 'url', error: null })
    expect(campoImagenesDelProxy(r.images, r.imagesMode)).toEqual({})
  })
  it('con el campo arriba o dentro de `context` (como lo manda la prueba de humo) ⇒ viaja', () => {
    const arriba = leerImagenesDelPedido({ images: [{ url: URL_IG, label: 'perfil' }] }, {})
    expect(arriba.error).toBeNull()
    expect(campoImagenesDelProxy(arriba.images, arriba.imagesMode)).toEqual({ images: [{ url: URL_IG, label: 'perfil' }], imagesMode: 'url' })
    const dentro = leerImagenesDelPedido({}, { images: [URL_IG], images_mode: 'base64' })
    expect(campoImagenesDelProxy(dentro.images, dentro.imagesMode)).toEqual({ images: [{ url: URL_IG }], imagesMode: 'base64' })
  })
  it('mal formado ⇒ error declarado antes de pagar', () => {
    expect(leerImagenesDelPedido({ images: 'https://a.b/c.png' }, {}).error).toMatch(/array/)
    expect(leerImagenesDelPedido({ images: [{ url: 'javascript:alert(1)' }] }, {}).error).toMatch(/images\[0\]\.url/)
    expect(leerImagenesDelPedido({ images: Array(21).fill('https://a.b/c.png') }, {}).error).toMatch(/at most 20/)
  })
})
