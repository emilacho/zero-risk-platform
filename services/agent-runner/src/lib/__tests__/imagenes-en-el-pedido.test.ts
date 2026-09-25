/**
 * EL CABLE PARA MIRAR · pruebas a costo cero · CC#1 · 2026-09-25.
 * Lo que decide: (1) sin el campo `images` no cambia nada · (2) mal formado = error, no silencio ·
 * (3) el pedido lleva las imágenes ANTES del texto · (4) el modo base64 descarga con tope y tipo.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  validarImagenes,
  leerModoImagenes,
  armarBloquesDeImagen,
  armarPromptConImagenes,
  MAX_IMAGENES,
  MAX_BYTES_POR_IMAGEN,
} from '../imagenes-en-el-pedido'

const URL_IG = 'https://scontent-gru1-2.cdninstagram.com/v/t51.2885-19/foto.jpg?oe=6ABB0B5B'

describe('validarImagenes · el campo es opcional y aditivo', () => {
  it('ausente ⇒ [] y sin error (nada cambia para quien no manda fotos)', () => {
    expect(validarImagenes(undefined)).toEqual({ images: [], error: null })
    expect(validarImagenes(null)).toEqual({ images: [], error: null })
  })
  it('acepta {url,label} y cadenas · recorta el rótulo a 80 · deduplica', () => {
    const r = validarImagenes([{ url: URL_IG, label: 'x'.repeat(200) }, URL_IG, 'https://a.b/c.png'])
    expect(r.error).toBeNull()
    expect(r.images).toHaveLength(2)
    expect(r.images[0].label).toHaveLength(80)
    expect(r.images[1]).toEqual({ url: 'https://a.b/c.png' })
  })
  it('mal formado ⇒ error declarado (no se traga)', () => {
    expect(validarImagenes('https://a.b/c.png').error).toMatch(/array/)
    expect(validarImagenes([{ url: 'ftp://x/y.png' }]).error).toMatch(/images\[0\]\.url/)
    expect(validarImagenes([{ url: 'https://a.b/c.png', label: 7 }]).error).toMatch(/label/)
    expect(validarImagenes(Array.from({ length: MAX_IMAGENES + 1 }, (_, i) => `https://a.b/${i}.png`)).error).toMatch(/at most 20/)
  })
  it('leerModoImagenes · base64 sólo si se pide así · lo demás es url', () => {
    expect(leerModoImagenes('base64')).toBe('base64')
    expect(leerModoImagenes('url')).toBe('url')
    expect(leerModoImagenes(undefined)).toBe('url')
    expect(leerModoImagenes('BASE64')).toBe('url')
  })
})

describe('armarBloquesDeImagen + armarPromptConImagenes · imágenes primero, texto después', () => {
  it('modo url · un rótulo y un bloque image por foto · fuente url · sin descargar', async () => {
    const fetchFn = vi.fn()
    const { bloques, entregadas } = await armarBloquesDeImagen(
      [{ url: URL_IG, label: 'foto de perfil' }, { url: 'https://a.b/c.png' }],
      'url',
      fetchFn as unknown as typeof fetch,
    )
    expect(fetchFn).not.toHaveBeenCalled()
    expect(bloques.map((b) => b.type)).toEqual(['text', 'image', 'text', 'image'])
    expect(bloques[0]).toEqual({ type: 'text', text: 'Imagen 1: foto de perfil' })
    expect(bloques[1]).toEqual({ type: 'image', source: { type: 'url', url: URL_IG } })
    expect(bloques[2]).toEqual({ type: 'text', text: 'Imagen 2' })
    expect(entregadas).toEqual([
      { url: URL_IG, label: 'Imagen 1: foto de perfil', modo: 'url' },
      { url: 'https://a.b/c.png', label: 'Imagen 2', modo: 'url' },
    ])
  })

  it('el mensaje de usuario lleva los bloques de imagen ANTES del texto del pedido', async () => {
    const { bloques } = await armarBloquesDeImagen([{ url: URL_IG }], 'url')
    const msgs = []
    for await (const m of armarPromptConImagenes('¿Cuántas personas hay?', bloques)) msgs.push(m)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('user')
    expect(msgs[0].parent_tool_use_id).toBeNull()
    const content = msgs[0].message.content as Array<{ type: string; text?: string }>
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text'])
    expect(content[content.length - 1]).toEqual({ type: 'text', text: '¿Cuántas personas hay?' })
  })

  it('modo base64 · descarga, comprueba el tipo y codifica', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (k: string) => (k === 'content-type' ? 'image/png' : null) },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    })
    const { bloques, entregadas } = await armarBloquesDeImagen([{ url: 'https://a.b/c.png', label: 'logo' }], 'base64', fetchFn as unknown as typeof fetch)
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(bloques[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } })
    expect(entregadas[0]).toMatchObject({ modo: 'base64', media_type: 'image/png', bytes: 8 })
  })

  it('modo base64 · HTTP no ok, tipo no aceptado o tamaño excedido ⇒ lanza (el que llama lo declara)', async () => {
    const mk = (ok: boolean, ct: string, bytes: number) =>
      vi.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 403,
        headers: { get: (k: string) => (k === 'content-type' ? ct : null) },
        arrayBuffer: async () => new ArrayBuffer(bytes),
      }) as unknown as typeof fetch
    await expect(armarBloquesDeImagen([{ url: 'https://a.b/c' }], 'base64', mk(false, 'image/png', 1))).rejects.toThrow(/HTTP 403/)
    await expect(armarBloquesDeImagen([{ url: 'https://a.b/c' }], 'base64', mk(true, 'text/html', 1))).rejects.toThrow(/tipo no aceptado/)
    await expect(armarBloquesDeImagen([{ url: 'https://a.b/c.jpg' }], 'base64', mk(true, 'application/octet-stream', MAX_BYTES_POR_IMAGEN + 1))).rejects.toThrow(/demasiado grande/)
  })
})
