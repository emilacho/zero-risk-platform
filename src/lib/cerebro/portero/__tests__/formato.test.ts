/**
 * EL FORMATO DE UNA FOTO · relevo 19 · se lee de las medidas del archivo, sin modelo. Cabeceras armadas a mano (PNG, JPEG, WebP en sus 3 variantes, GIF): US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { formatoDe, formatoDeLaFoto, medidasDeLaImagen } from '../formato'

const be32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const be16 = (n: number) => Buffer.from([(n >>> 8) & 255, n & 255])
const le16 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255])
const le24 = (n: number) => Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255])

const png = (w: number, h: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), be32(13), Buffer.from('IHDR'), be32(w), be32(h), Buffer.from([8, 6, 0, 0, 0]), Buffer.alloc(8)])
const gif = (w: number, h: number) => Buffer.concat([Buffer.from('GIF89a'), le16(w), le16(h), Buffer.alloc(8)])
/** un JPEG con un segmento APP0 antes del cuadro (SOF0 / SOF2) */
const jpeg = (w: number, h: number, sof = 0xc0) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0]), be16(16), Buffer.alloc(14), Buffer.from([0xff, sof]), be16(17), Buffer.from([8]), be16(h), be16(w), Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])])
const webpVp8x = (w: number, h: number) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8X'), Buffer.alloc(4), Buffer.alloc(4), le24(w - 1), le24(h - 1), Buffer.alloc(4)])
const webpVp8l = (w: number, h: number) => { const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14); const b = Buffer.alloc(4); b.writeUInt32LE(bits >>> 0); return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8L'), Buffer.alloc(4), Buffer.from([0x2f]), b, Buffer.alloc(8)]) }
const webpVp8 = (w: number, h: number) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8 '), Buffer.alloc(4), Buffer.alloc(3), Buffer.from([0x9d, 0x01, 0x2a]), le16(w), le16(h), Buffer.alloc(8)])

describe('medidasDeLaImagen · ancho y alto del encabezado', () => {
  it('PNG · GIF · JPEG (con segmento previo y con SOF2 progresivo) · WebP (VP8X, VP8L y VP8)', () => {
    expect(medidasDeLaImagen(png(1080, 1350))).toEqual({ ancho: 1080, alto: 1350 })
    expect(medidasDeLaImagen(gif(480, 270))).toEqual({ ancho: 480, alto: 270 })
    expect(medidasDeLaImagen(jpeg(1080, 1080))).toEqual({ ancho: 1080, alto: 1080 })
    expect(medidasDeLaImagen(jpeg(1200, 628, 0xc2))).toEqual({ ancho: 1200, alto: 628 })
    expect(medidasDeLaImagen(webpVp8x(1920, 1005))).toEqual({ ancho: 1920, alto: 1005 })
    expect(medidasDeLaImagen(webpVp8l(1080, 1350))).toEqual({ ancho: 1080, alto: 1350 })
    expect(medidasDeLaImagen(webpVp8(640, 640))).toEqual({ ancho: 640, alto: 640 })
    // los 2 bits altos de cada medida son «escala» (no parte del tamaño): se ignoran
    expect(medidasDeLaImagen(webpVp8(0x4000 | 640, 0x8000 | 800))).toEqual({ ancho: 640, alto: 800 })
  })
  it('lo que no se puede leer con certeza es null (no se adivina): vacío, texto, cabecera cortada, ancho o alto en cero, JPEG sin cuadro', () => {
    expect(medidasDeLaImagen(Buffer.alloc(0))).toBeNull()
    expect(medidasDeLaImagen(Buffer.from('QUJD', 'base64'))).toBeNull()
    expect(medidasDeLaImagen(png(1080, 1350).subarray(0, 20))).toBeNull()
    expect(medidasDeLaImagen(png(0, 100))).toBeNull()
    expect(medidasDeLaImagen(jpeg(1080, 1350).subarray(0, 12))).toBeNull()
    expect(medidasDeLaImagen(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0]))).toBeNull()
    expect(medidasDeLaImagen(Buffer.from('<html>no soy una imagen, soy una página con bastante texto dentro</html>'))).toBeNull()
  })
  it('un archivo cortado a la mitad del segmento NO revienta: devuelve null', () => {
    const j = jpeg(1080, 1350)
    for (let n = 0; n < j.length; n++) expect(() => medidasDeLaImagen(j.subarray(0, n)), `cortado en ${n}`).not.toThrow()
  })
})

describe('formatoDe · vertical, cuadrado u horizontal por la proporción', () => {
  it('1080×1350 (0,8) vertical · 1080×1080 cuadrado · 1200×628 horizontal', () => {
    expect(formatoDe({ ancho: 1080, alto: 1350 })).toBe('vertical')
    expect(formatoDe({ ancho: 1080, alto: 1080 })).toBe('cuadrado')
    expect(formatoDe({ ancho: 1200, alto: 628 })).toBe('horizontal')
  })
  it('los bordes: 0,95 y 1,05 ya son cuadrados; apenas fuera, no', () => {
    expect(formatoDe({ ancho: 95, alto: 100 })).toBe('cuadrado')
    expect(formatoDe({ ancho: 105, alto: 100 })).toBe('cuadrado')
    expect(formatoDe({ ancho: 94, alto: 100 })).toBe('vertical')
    expect(formatoDe({ ancho: 106, alto: 100 })).toBe('horizontal')
  })
  it('sin medidas, sin formato', () => {
    expect(formatoDe(null)).toBeNull()
  })
  it('desde base64 (como llega la foto al etiquetador)', () => {
    expect(formatoDeLaFoto(png(1080, 1350).toString('base64'))).toBe('vertical')
    expect(formatoDeLaFoto('QUJD')).toBeNull()
    expect(formatoDeLaFoto('esto no es base64 ###')).toBeNull()
  })
})
