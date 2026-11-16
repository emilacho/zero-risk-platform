/**
 * PLANTILLA DE MARCA EN HTML (DECISIÓN Lenovo 16-nov 21:04 · CC3) · US$ 0, sin red y sin navegador (la página es un doble).
 *  · el documento es la misma composición: textos del autor, colores y tipografías del diseño, las 4 disposiciones;
 *  · el texto del autor NUNCA se interpreta (se escapa) y el documento no pide nada a la red (solo data:image, CSP cerrada);
 *  · las fuentes van empaquetadas dentro del documento;
 *  · el dibujo espera a las fuentes, saca la foto del tamaño pedido y cierra la página siempre (también si falla).
 */
import { describe, expect, it } from 'vitest'
import { caraDeFuentes, escaparHtml, htmlDeAnuncio, imagenEmbebida, renderAnuncioHtml, type PaginaSinPantalla } from '../../../../packages/carousel-engine/src/anuncio-html'
import { VARIANTES_DE_ANUNCIO, type PedidoDeAnuncio } from '../../../../packages/carousel-engine/src/anuncio'
import type { FontEntry } from '../../../../packages/carousel-engine/src'
import { disenoDeAnuncio } from '../composicion'
import type { MarcaParaRender } from '../puertos'

const MARCA: MarcaParaRender = { colors: { primary: '#1a0828', secondary: '#2d1135', accent: '#51d4b4' }, fonts: { family: 'Inter', headline_family: 'Caveat' }, brand_handle: '@marca.ec' }
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const FUENTES: FontEntry[] = [
  { name: 'Inter', data: new Uint8Array([1, 2, 3]).buffer, weight: 400, style: 'normal' },
  { name: 'Caveat', data: new Uint8Array([4, 5, 6]).buffer, weight: 700, style: 'normal' },
]
const pedido = (o: Partial<PedidoDeAnuncio> = {}): PedidoDeAnuncio => ({
  ancho: 1080, alto: 1350, foto: PIXEL, logo: null, firma: '@marca.ec', diseno: disenoDeAnuncio(MARCA, 'BRF-0003'),
  texto: { etiqueta: 'Delivery', titular: 'El oro que nunca buscaste', bajada: 'Recién hecho', boton: 'Pide en ejemplo.com' }, ...o,
})
const conVariante = (v: (typeof VARIANTES_DE_ANUNCIO)[number]) => pedido({ diseno: { ...disenoDeAnuncio(MARCA, 'x'), variante: v } })

describe('el documento HTML del anuncio', () => {
  it('lleva los textos del autor, la firma, las tipografías y los colores del diseño', () => {
    const h = htmlDeAnuncio(pedido(), FUENTES)
    for (const x of ['>Delivery<', '>El oro que nunca buscaste<', '>Recién hecho<', '>Pide en ejemplo.com<', '>@marca.ec<', "font-family:'Caveat'", "font-family:'Inter'", PIXEL]) expect(h).toContain(x)
    const d = disenoDeAnuncio(MARCA, 'BRF-0003')
    expect(h).toContain(`background:${d.boton.fondo}`); expect(h).toContain(`background:${d.etiqueta.fondo}`)
    expect(h).toContain('width:1080px;height:1350px')
  })
  it('las fuentes van EMPAQUETADAS (los bytes dentro del documento), con su peso', () => {
    const h = htmlDeAnuncio(pedido(), FUENTES)
    expect(h).toContain(`url(data:font/ttf;base64,${Buffer.from([1, 2, 3]).toString('base64')})`)
    expect(h).toContain(`url(data:font/ttf;base64,${Buffer.from([4, 5, 6]).toString('base64')})`)
    expect(caraDeFuentes(FUENTES)).toMatch(/font-family:'Caveat';[^}]*font-weight:700/)
  })
  it('el texto del autor nunca se interpreta: etiquetas, comillas y & se escapan', () => {
    const h = htmlDeAnuncio(pedido({ texto: { titular: '<script>alert(1)</script> "2x1" & más', boton: '<img src=x onerror=y>' }, firma: '<b>yo</b>' }), FUENTES)
    expect(h).not.toContain('<script>'); expect(h).not.toContain('<img src=x'); expect(h).not.toContain('<b>yo')
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;2x1&quot; &amp; más')
    expect(escaparHtml(`a'b`)).toBe('a&#39;b')
  })
  it('no pide nada a la red: CSP cerrada; una foto o logo por URL no se dibujan', () => {
    const h = htmlDeAnuncio(pedido({ foto: 'https://malo.test/x.png', logo: 'http://malo.test/l.png' }), FUENTES)
    expect(h).toContain("default-src 'none'"); expect(h).not.toContain('malo.test'); expect(h).not.toMatch(/src="https?:/)
    expect(imagenEmbebida(PIXEL)).toBe(PIXEL); expect(imagenEmbebida('data:text/html;base64,AAAA')).toBeNull(); expect(imagenEmbebida('data:image/png;base64,AA"><x')).toBeNull(); expect(imagenEmbebida(null)).toBeNull()
  })
  it('un color o una familia que rompería el CSS no entra', () => {
    const d = { ...disenoDeAnuncio(MARCA, 'x'), boton: { fondo: 'red;}body{display:none', texto: '#fff' }, tipografia: { cuerpo: "Inter';}*{x:y", titular: '' } }
    const h = htmlDeAnuncio(pedido({ diseno: d }), FUENTES)
    expect(h).not.toContain('display:none'); expect(h).not.toContain('*{x:y'); expect(h).toContain("font-family:'Interxy',sans-serif")
  })
  it('lo que el autor no dio no se dibuja; con logo no va la firma; los emojis se quitan', () => {
    const h = htmlDeAnuncio(pedido({ texto: { titular: 'Solo esto 🦐' }, logo: PIXEL }), FUENTES)
    expect(h).toContain('>Solo esto<'); expect(h).not.toContain('🦐'); expect(h).not.toContain('class="etiqueta"'); expect(h).not.toContain('class="firma"'); expect(h).toContain('class="logo"')
  })
  it('las 4 disposiciones dan documentos distintos; la franja lleva el color de la marca', () => {
    expect(new Set(VARIANTES_DE_ANUNCIO.map((v) => htmlDeAnuncio(conVariante(v), FUENTES))).size).toBe(4)
    const d = { ...disenoDeAnuncio(MARCA, 'x'), variante: 'franja' as const, franja: { fondo: '#123456', texto: '#ffffff' } }
    const h = htmlDeAnuncio(pedido({ diseno: d }), FUENTES)
    expect(h).toContain('class="franja"'); expect(h.split('background:#123456').length - 1).toBeGreaterThanOrEqual(2)
    expect(htmlDeAnuncio(conVariante('arriba_izquierda'), FUENTES)).toMatch(/\.bloque\{[^}]*top:\d+px/)
    expect(htmlDeAnuncio(conVariante('abajo_centro'), FUENTES)).toMatch(/\.bloque\{[^}]*align-items:center/)
  })
  it('es puro: el mismo pedido y las mismas fuentes dan el mismo documento', () => {
    expect(htmlDeAnuncio(pedido(), FUENTES)).toBe(htmlDeAnuncio(pedido(), FUENTES))
  })
})

describe('el dibujo con el navegador sin pantalla (página doble)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  function paginaDoble(o: { fallaFoto?: boolean } = {}) {
    const llamadas: string[] = []
    const pagina: PaginaSinPantalla = {
      setViewportSize: async (s) => { llamadas.push(`tamano ${s.width}x${s.height}`) },
      setContent: async (html, op) => { llamadas.push(`contenido ${html.length > 100} ${op?.waitUntil}`) },
      evaluate: async <T,>(e: string) => { llamadas.push(`espera ${e}`); return true as unknown as T },
      screenshot: async (op) => { llamadas.push(`foto ${op.type}`); if (o.fallaFoto) throw new Error('chromium se cayó'); return PNG },
      close: async () => { llamadas.push('cierra') },
    }
    return { pagina, llamadas }
  }
  it('fija el tamaño, carga el documento, espera las fuentes, saca el PNG y cierra; informa las fuentes', async () => {
    const { pagina, llamadas } = paginaDoble()
    const r = await renderAnuncioHtml(pedido({ ancho: 1080, alto: 1080 }), { fonts: FUENTES, abrirPagina: async () => pagina })
    expect(llamadas).toEqual(['tamano 1080x1080', 'contenido true load', 'espera document.fonts.ready.then(() => true)', 'foto png', 'cierra'])
    expect(r.png).toEqual(PNG); expect([r.ancho, r.alto]).toEqual([1080, 1080]); expect(r.fonts_faltantes).toEqual([]); expect(r.fonts_usadas.sort()).toEqual(['Caveat', 'Inter'])
  })
  it('una fuente del manual que no está se informa como faltante', async () => {
    const { pagina } = paginaDoble()
    const r = await renderAnuncioHtml(pedido(), { fonts: [FUENTES[0]], abrirPagina: async () => pagina })
    expect(r.fonts_faltantes).toEqual(['Caveat'])
  })
  it('si el navegador falla, el error sube y la página se cierra igual', async () => {
    const { pagina, llamadas } = paginaDoble({ fallaFoto: true })
    await expect(renderAnuncioHtml(pedido(), { fonts: FUENTES, abrirPagina: async () => pagina })).rejects.toThrow('chromium se cayó')
    expect(llamadas.at(-1)).toBe('cierra')
  })
})
