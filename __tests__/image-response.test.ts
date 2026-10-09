/** Relevo 22 · la respuesta de imágenes puede traer b64 o url, y no siempre png. */
import { describe, it, expect, vi } from 'vitest'
import { imageBytesFromItem, sniffImageFormat, MAX_IMAGE_BYTES } from '../src/lib/image-response'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from([1])])
const asFetch = (f: unknown) => f as unknown as typeof fetch

describe('sniffImageFormat', () => {
  it('reconoce png, jpeg y webp por su firma', () => {
    expect(sniffImageFormat(PNG)).toEqual({ contentType: 'image/png', ext: 'png' })
    expect(sniffImageFormat(JPG)).toEqual({ contentType: 'image/jpeg', ext: 'jpg' })
    expect(sniffImageFormat(WEBP)).toEqual({ contentType: 'image/webp', ext: 'webp' })
  })
  it('lo desconocido sigue tratándose como png (conducta anterior)', () => {
    expect(sniffImageFormat(Buffer.from('xx'))).toEqual({ contentType: 'image/png', ext: 'png' })
  })
})

describe('imageBytesFromItem', () => {
  it('b64_json manda sobre url y no hace ninguna descarga', async () => {
    const f = vi.fn()
    const b = await imageBytesFromItem({ b64_json: PNG.toString('base64'), url: 'https://x/y.png' }, asFetch(f))
    expect(b?.equals(PNG)).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
  it('solo url: la baja', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array(JPG).buffer })
    const b = await imageBytesFromItem({ url: 'https://cdn.openai/x.jpg' }, asFetch(f))
    expect(b?.equals(JPG)).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('url que no es https: no se descarga', async () => {
    const f = vi.fn()
    expect(await imageBytesFromItem({ url: 'http://interno/x.png' }, asFetch(f))).toBeNull()
    expect(await imageBytesFromItem({ url: 'file:///etc/passwd' }, asFetch(f))).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
  it('descarga fallida, vacía, mayor al tope o con error: null', async () => {
    const mal = vi.fn().mockResolvedValue({ ok: false })
    expect(await imageBytesFromItem({ url: 'https://a/b' }, asFetch(mal))).toBeNull()
    const vacia = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
    expect(await imageBytesFromItem({ url: 'https://a/b' }, asFetch(vacia))).toBeNull()
    const grande = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(MAX_IMAGE_BYTES + 1) })
    expect(await imageBytesFromItem({ url: 'https://a/b' }, asFetch(grande))).toBeNull()
    const rota = vi.fn().mockRejectedValue(new Error('net'))
    expect(await imageBytesFromItem({ url: 'https://a/b' }, asFetch(rota))).toBeNull()
  })
  it('sin nada utilizable: null', async () => {
    expect(await imageBytesFromItem(undefined)).toBeNull()
    expect(await imageBytesFromItem({})).toBeNull()
    expect(await imageBytesFromItem({ b64_json: '' })).toBeNull()
  })
})
