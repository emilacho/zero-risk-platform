/**
 * S2-5 · el servicio de render HTML (CC2 · GO Lenovo 17-nov 02:47) · US$ 0, sin red: el servicio es un doble.
 *  · la plantilla del VIDEO (`htmlDeVideo`): textos de cada plano en sus segundos, el cierre con la marca, escapado, sin red;
 *  · el cliente del servicio: llave, PNG/MP4 verificados por su firma, trabajo en fila, errores en palabras;
 *  · el anuncio fijo: con el servicio configurado, la plantilla HTML; si falla, el dibujo de siempre + aviso;
 *  · el modelo de video ya no recibe «texto literal en pantalla».
 */
import { describe, expect, it } from 'vitest'
import { capasDeTexto, cierreEfectivo, htmlDeVideo, SEGUNDOS_DE_CIERRE, type PedidoDeVideoCompuesto } from '../../../../packages/carousel-engine/src/video-html'
import { htmlDeAnuncio } from '../../../../packages/carousel-engine/src/anuncio-html'
import type { FontEntry } from '../../../../packages/carousel-engine/src'
import { disenoDeAnuncio } from '../composicion'
import type { MarcaParaRender } from '../puertos'
import { bajarVideo, estadoDeVideo, iniciarVideo, pedirPng, servicioDeRender } from '../../render-html/cliente'
import { componerConServicio, crearPuertos } from '../adaptadores'
import { promptDelGuion } from '../video/guion'
import { REGLAS_DEL_PEDIDO } from '../../video/parametros'

const MARCA: MarcaParaRender = { colors: { primary: '#3D2466', secondary: '#2d1135', accent: '#51d4b4' }, fonts: { family: 'Inter', headline_family: 'Caveat' }, brand_handle: 'Náufrago' }
const FUENTES: FontEntry[] = [
  { name: 'Inter', data: new Uint8Array([1, 2, 3]).buffer, weight: 400, style: 'normal' },
  { name: 'Caveat', data: new Uint8Array([4, 5, 6]).buffer, weight: 700, style: 'normal' },
]
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG = Buffer.from(PIXEL.split(',')[1], 'base64')
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)])
const ped = (o: Partial<PedidoDeVideoCompuesto> = {}): PedidoDeVideoCompuesto => ({
  ancho: 1080, alto: 1920, segundos: 12, video: 'base.mp4', logo: null, firma: 'Náufrago', diseno: disenoDeAnuncio(MARCA, 'BRF-W47'),
  textos: [{ desde: 0, hasta: 3, texto: 'Náufrago tiene un mensaje para ti…' }, { desde: 3, hasta: 6.5, texto: 'Encebollado recién hecho' }],
  cierre: { desde: 9.5, etiqueta: 'Delivery', titular: 'Pide tu encebollado', bajada: null, boton: 'Pide en naufrago.ec' }, ...o,
})
const capa = (h: string, id: string) => new RegExp(`<div id="${id}" class="clip [a-z]+" data-start="([0-9.]+)" data-duration="([0-9.]+)" data-track-index="(\\d)"`).exec(h)

describe('la plantilla del video', () => {
  it('el video unido de fondo, de punta a punta, con su sonido', () => {
    const h = htmlDeVideo(ped(), FUENTES)
    expect(h).toContain('<video id="base" class="clip base" src="base.mp4" data-start="0" data-duration="12" data-track-index="0" data-has-audio="true" playsinline></video>')
    expect(h).toContain('data-composition-id="main" data-start="0" data-duration="12" data-width="1080" data-height="1920" data-no-timeline')
    expect(htmlDeVideo(ped({ con_audio: false }), FUENTES)).toContain('data-track-index="0" muted playsinline')
  })
  it('cada texto en los segundos de su plano, con la tipografía del titular; el cierre al final con la marca', () => {
    const h = htmlDeVideo(ped(), FUENTES)
    expect(capa(h, 'texto-1')?.slice(1)).toEqual(['0', '3', '1'])
    expect(capa(h, 'texto-2')?.slice(1)).toEqual(['3', '3.5', '1'])
    expect(capa(h, 'cierre')?.slice(1)).toEqual(['9.5', '2.5', '2'])
    for (const x of ['>Náufrago tiene un mensaje para ti…<', '>Encebollado recién hecho<', '>Delivery<', '>Pide tu encebollado<', '>Pide en naufrago.ec<', '<div class="firma">Náufrago</div>', "font-family:'Caveat'", "font-family:'Inter'"]) expect(h).toContain(x)
    const d = disenoDeAnuncio(MARCA, 'BRF-W47')
    expect(h).toContain(`background:${d.boton.fondo}`)
    expect(h).toContain(`background:${d.etiqueta.fondo}`)
    expect(h).toContain('width:1080px;height:1920px')
  })
  it('legible: el texto de un plano mide al menos el 5 % del alto', () => {
    const tam = Number(/id="texto-1"[^>]*style="font-size:(\d+)px"/.exec(htmlDeVideo(ped(), FUENTES))?.[1])
    expect(tam).toBeGreaterThanOrEqual(96)
    const largo = 'Un texto muy largo que no cabe en dos líneas de ninguna manera posible en un reel vertical'
    expect(Number(/id="texto-1"[^>]*style="font-size:(\d+)px"/.exec(htmlDeVideo(ped({ textos: [{ desde: 0, hasta: 3, texto: largo }] }), FUENTES))?.[1])).toBe(96)
  })
  it('con logo, el logo en vez de la firma', () => {
    const h = htmlDeVideo(ped({ logo: PIXEL }), FUENTES)
    expect(h).toContain(`<img class="logo" src="${PIXEL}" alt="">`)
    expect(h).not.toContain('class="firma"')
  })
  it('el texto del guion NUNCA se interpreta: se escapa', () => {
    const h = htmlDeVideo(ped({ textos: [{ desde: 0, hasta: 3, texto: '<script>alert(1)</script> & "x"' }], cierre: { desde: 10, titular: '<img src=x onerror=y>' } }), FUENTES)
    expect(h).not.toContain('<script>')
    expect(h).not.toContain('<img src=x')
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
  })
  it('sin red: un logo que no es data:image no se dibuja (va la firma)', () => {
    const h = htmlDeVideo(ped({ logo: 'https://evil.com/logo.png' }), FUENTES)
    expect(h).not.toContain('evil.com')
    expect(h).toContain('class="firma"')
    expect(h).not.toMatch(/src="https?:/)
  })
  it('el nombre del video es simple: sin rutas ni direcciones', () => {
    expect(() => htmlDeVideo(ped({ video: '../x.mp4' }), FUENTES)).toThrow(/nombre de video/)
    expect(() => htmlDeVideo(ped({ video: 'https://x.com/a.mp4' }), FUENTES)).toThrow(/nombre de video/)
    expect(() => htmlDeVideo(ped({ video: 'a.mp4" onload="x' }), FUENTES)).toThrow(/nombre de video/)
    expect(() => htmlDeVideo(ped({ segundos: 0 }), FUENTES)).toThrow(/duración/)
  })
  it('mismo pedido + mismas fuentes ⇒ mismo documento', () => {
    expect(htmlDeVideo(ped(), FUENTES)).toBe(htmlDeVideo(ped(), FUENTES))
  })
})

describe('las capas de texto', () => {
  const base = { segundos: 12, cierre: null }
  it('ordenadas, recortadas al video y sin solaparse', () => {
    expect(capasDeTexto({ ...base, textos: [{ desde: 5, hasta: 9, texto: 'b' }, { desde: 0, hasta: 6, texto: 'a' }, { desde: 10, hasta: 15, texto: 'c' }] }))
      .toEqual([{ desde: 0, hasta: 6, texto: 'a' }, { desde: 6, hasta: 9, texto: 'b' }, { desde: 10, hasta: 12, texto: 'c' }])
  })
  it('no pisan el cierre; lo que queda muy corto no se muestra', () => {
    expect(capasDeTexto({ segundos: 12, cierre: { desde: 9.5 }, textos: [{ desde: 6, hasta: 12, texto: 'a' }, { desde: 9.2, hasta: 12, texto: 'b' }] }))
      .toEqual([{ desde: 6, hasta: 9.5, texto: 'a' }])
    expect(capasDeTexto({ ...base, textos: [{ desde: 0, hasta: 0.4, texto: 'corto' }, { desde: 0, hasta: 0.5, texto: 'justo' }] })).toEqual([{ desde: 0, hasta: 0.5, texto: 'justo' }])
  })
  it('texto vacío, solo espacios o solo emojis no es capa; segundos no numéricos tampoco', () => {
    expect(capasDeTexto({ ...base, textos: [{ desde: 0, hasta: 3, texto: '   ' }, { desde: 3, hasta: 6, texto: '🔥🔥' }, { desde: Number.NaN, hasta: 9, texto: 'x' }] })).toEqual([])
  })
  it('espacios de más se juntan', () => {
    expect(capasDeTexto({ ...base, textos: [{ desde: 0, hasta: 3, texto: '  hola \n  mundo ' }] })[0].texto).toBe('hola mundo')
  })
})

describe('el cierre', () => {
  it('sin cierre pedido, no hay', () => {
    expect(cierreEfectivo({ segundos: 12, cierre: null, logo: null, firma: 'X' })).toBeNull()
  })
  it('sin nada que mostrar (ni texto ni logo ni firma), no hay', () => {
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 9 }, logo: null, firma: '  ' })).toBeNull()
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 9, titular: '🔥' }, logo: 'https://x/l.png', firma: null })).toBeNull()
  })
  it('basta la firma o el logo para que haya cierre', () => {
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 9 }, logo: null, firma: 'Marca' })).toMatchObject({ desde: 9, hasta: 12 })
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 9 }, logo: PIXEL, firma: null })).toMatchObject({ desde: 9, hasta: 12 })
  })
  it('se recorta al video; sin segundos legibles, los últimos 2,5 s; si queda muy corto, no hay', () => {
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: -3, titular: 'x' }, logo: null, firma: null })).toMatchObject({ desde: 0 })
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: Number.NaN, titular: 'x' }, logo: null, firma: null })).toMatchObject({ desde: 12 - SEGUNDOS_DE_CIERRE })
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 11.6, titular: 'x' }, logo: null, firma: null })).toBeNull()
    expect(cierreEfectivo({ segundos: 12, cierre: { desde: 30, titular: 'x' }, logo: null, firma: null })).toBeNull()
  })
})

/** un servicio de render de mentira: registra lo que recibe y contesta lo que se le diga */
function servicioFalso(respuestas: Record<string, () => Response>) {
  const llamadas: Array<{ url: string; metodo: string; llave: string | null; cuerpo: unknown }> = []
  const f = (async (u: string | URL, o?: RequestInit) => {
    const url = String(u)
    const h = new Headers(o?.headers)
    llamadas.push({ url, metodo: o?.method ?? 'GET', llave: h.get('x-render-key'), cuerpo: typeof o?.body === 'string' ? JSON.parse(o.body) : null })
    const clave = Object.keys(respuestas).find((k) => url.endsWith(k))
    if (!clave) throw new Error('sin red')
    return respuestas[clave]()
  }) as unknown as typeof fetch
  return { f, llamadas }
}
const S = { url: 'https://render.test', llave: 'k-1' }
const jsonR = (codigo: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: codigo, headers: { 'content-type': 'application/json' } })

describe('el cliente del servicio', () => {
  it('solo hay servicio con dirección Y llave', () => {
    expect(servicioDeRender({ RENDER_HTML_URL: 'https://r.up.railway.app/', RENDER_HTML_KEY: ' k ' })).toEqual({ url: 'https://r.up.railway.app', llave: 'k' })
    expect(servicioDeRender({ RENDER_HTML_URL: 'https://r.up.railway.app' })).toBeNull()
    expect(servicioDeRender({ RENDER_HTML_KEY: 'k' })).toBeNull()
    expect(servicioDeRender({ RENDER_HTML_URL: 'r.up.railway.app', RENDER_HTML_KEY: 'k' })).toBeNull()
    expect(servicioDeRender({})).toBeNull()
  })
  it('PNG: manda el documento con la llave y verifica que vuelva una imagen', async () => {
    const { f, llamadas } = servicioFalso({ '/png': () => new Response(PNG, { status: 200 }) })
    const r = await pedirPng(S, { html: '<p>x</p>', ancho: 10, alto: 20 }, f)
    expect(r).toMatchObject({ ok: true })
    expect(llamadas[0]).toEqual({ url: 'https://render.test/png', metodo: 'POST', llave: 'k-1', cuerpo: { html: '<p>x</p>', ancho: 10, alto: 20 } })
    const mal = servicioFalso({ '/png': () => new Response('<html>error</html>', { status: 200 }) })
    expect(await pedirPng(S, { html: 'x', ancho: 10, alto: 20 }, mal.f)).toEqual({ ok: false, error: 'el servicio de render no devolvió un PNG', reintentar: false })
  })
  it('los errores vuelven en palabras; 429 y 5xx se pueden reintentar, 4xx no; sin red tampoco lanza', async () => {
    expect(await pedirPng(S, { html: 'x', ancho: 1, alto: 1 }, servicioFalso({ '/png': () => jsonR(401, { error: 'no autorizado' }) }).f)).toEqual({ ok: false, error: 'servicio de render 401: no autorizado', reintentar: false })
    expect(await pedirPng(S, { html: 'x', ancho: 1, alto: 1 }, servicioFalso({ '/png': () => jsonR(503, {}) }).f)).toEqual({ ok: false, error: 'servicio de render 503', reintentar: true })
    expect(await pedirPng(S, { html: 'x', ancho: 1, alto: 1 }, servicioFalso({}).f)).toMatchObject({ ok: false, reintentar: true, error: expect.stringContaining('sin respuesta') })
  })
  it('video: iniciar (202 con id) → estado → bajar (verifica que sea MP4)', async () => {
    const id = '0f8b2c1e-0000-4000-8000-000000000001'
    const { f, llamadas } = servicioFalso({
      '/video': () => jsonR(202, { id, estado: 'en_fila' }),
      [`/video/${id}`]: () => jsonR(200, { id, estado: 'listo', error: null, segundos_de_render: 61.5 }),
      [`/video/${id}/archivo`]: () => new Response(MP4, { status: 200 }),
    })
    const pedido = { html: '<p/>', ancho: 1080, alto: 1920, segundos: 12, archivos: [{ nombre: 'base.mp4', url: 'https://x.supabase.co/a.mp4' }] }
    expect(await iniciarVideo(S, pedido, f)).toEqual({ ok: true, id })
    expect(llamadas[0]).toMatchObject({ metodo: 'POST', llave: 'k-1', cuerpo: pedido })
    expect(await estadoDeVideo(S, id, f)).toEqual({ ok: true, estado: 'listo', error: null, segundos_de_render: 61.5 })
    const b = await bajarVideo(S, id, f)
    expect(b.ok && b.mp4.equals(MP4)).toBe(true)
    expect(llamadas.every((l) => l.llave === 'k-1')).toBe(true)
  })
  it('video: fila llena = reintentar; estado raro o sin id = error; lo bajado que no es MP4 = error', async () => {
    expect(await iniciarVideo(S, { html: 'x', ancho: 1, alto: 1, segundos: 1, archivos: [] }, servicioFalso({ '/video': () => jsonR(429, { error: 'llena' }) }).f)).toMatchObject({ ok: false, reintentar: true })
    expect(await iniciarVideo(S, { html: 'x', ancho: 1, alto: 1, segundos: 1, archivos: [] }, servicioFalso({ '/video': () => jsonR(202, {}) }).f)).toMatchObject({ ok: false, reintentar: false })
    expect(await estadoDeVideo(S, 'a', servicioFalso({ '/video/a': () => jsonR(200, { estado: 'raro' }) }).f)).toMatchObject({ ok: false })
    expect(await estadoDeVideo(S, 'a', servicioFalso({ '/video/a': () => jsonR(404, { error: 'no existe' }) }).f)).toEqual({ ok: false, error: 'servicio de render 404: no existe', reintentar: false })
    expect(await bajarVideo(S, 'a', servicioFalso({ '/video/a/archivo': () => new Response('nada', { status: 200 }) }).f)).toEqual({ ok: false, error: 'el servicio de render no devolvió un MP4', reintentar: false })
    // largo de sobra pero sin «ftyp»: una página de error larga tampoco pasa por video
    expect(await bajarVideo(S, 'a', servicioFalso({ '/video/a/archivo': () => new Response('<html><body>error del servidor</body></html>', { status: 200 }) }).f)).toEqual({ ok: false, error: 'el servicio de render no devolvió un MP4', reintentar: false })
    // el trabajo se acepta SOLO con 202 (en fila): un 200 con id no es un trabajo nuevo
    expect(await iniciarVideo(S, { html: 'x', ancho: 1, alto: 1, segundos: 1, archivos: [] }, servicioFalso({ '/video': () => jsonR(200, { id: 'x' }) }).f)).toMatchObject({ ok: false, error: 'servicio de render 200' })
  })
})

describe('el anuncio fijo con el servicio', () => {
  const pedidoAnuncio = { ancho: 1080, alto: 1350, foto: PIXEL, logo: null, firma: 'Náufrago', diseno: disenoDeAnuncio(MARCA, 'BRF-W47'), texto: { etiqueta: 'Delivery', titular: 'Pide tu encebollado', bajada: null, boton: null } }
  it('manda EL MISMO documento de la plantilla #1068 y devuelve su PNG', async () => {
    const { f, llamadas } = servicioFalso({ '/png': () => new Response(PNG, { status: 200 }) })
    const r = await componerConServicio(S, pedidoAnuncio, f, FUENTES)
    expect(r).toEqual({ ok: true, png: PNG, fonts_faltantes: [] })
    expect(llamadas[0].cuerpo).toEqual({ html: htmlDeAnuncio(pedidoAnuncio, FUENTES), ancho: 1080, alto: 1350 })
  })
  it('las tipografías que faltan se informan', async () => {
    const r = await componerConServicio(S, pedidoAnuncio, servicioFalso({ '/png': () => new Response(PNG, { status: 200 }) }).f, FUENTES.slice(0, 1))
    expect(r).toMatchObject({ ok: true, fonts_faltantes: ['Caveat'] })
  })
  it('un fallo del servicio vuelve en palabras (no lanza)', async () => {
    expect(await componerConServicio(S, pedidoAnuncio, servicioFalso({ '/png': () => jsonR(500, { error: 'chrome' }) }).f, FUENTES)).toEqual({ ok: false, error: 'servicio de render 500: chrome' })
  })
  it('el puerto: con servicio → motor html; si falla → el dibujo de siempre + aviso; sin servicio → el de siempre, sin aviso', async () => {
    const entorno = { baseUrl: 'https://plataforma.test', internalKey: 'x' }
    const P1 = crearPuertos({} as never, { ...entorno, renderHtml: S }, servicioFalso({ '/png': () => new Response(PNG, { status: 200 }) }).f)
    // las fuentes reales no se bajan en la prueba: Inter va empaquetada y Caveat falta (sin red)
    const conCuerpo = { ...pedidoAnuncio, diseno: { ...pedidoAnuncio.diseno, tipografia: { cuerpo: 'Inter', titular: 'Inter' } } }
    expect(await P1.componer!(conCuerpo)).toMatchObject({ ok: true, motor: 'html', png: PNG })
    const P2 = crearPuertos({} as never, { ...entorno, renderHtml: S }, servicioFalso({ '/png': () => jsonR(503, { error: 'dormido' }) }).f)
    const r2 = await P2.componer!(conCuerpo)
    expect(r2).toMatchObject({ ok: true, motor: 'satori', aviso_motor: 'servicio de render 503: dormido' })
    const P3 = crearPuertos({} as never, entorno, servicioFalso({}).f)
    const r3 = await P3.componer!(conCuerpo)
    expect(r3).toMatchObject({ ok: true, motor: 'satori' })
    expect(r3).not.toHaveProperty('aviso_motor')
  }, 60_000)
})

describe('el modelo de video ya no escribe letras', () => {
  it('el pedido no lleva el texto de los planos; sí lo que se ve y la cámara', () => {
    const { prompt } = promptDelGuion({ segundos: 6, audio: 'música suave', planos: [{ n: 1, desde: 0, hasta: 3, se_ve: 'el plato humeante', movimiento: 'acercamiento', texto_en_pantalla: 'Hay mesa desde las siete', foto_id: null }, { n: 2, desde: 3, hasta: 6, se_ve: 'la puerta', movimiento: null, texto_en_pantalla: null, foto_id: null }] } as never)
    expect(prompt).toBe('Plano 1 (0–3 s): el plato humeante Cámara: acercamiento.\nPlano 2 (3–6 s): la puerta\nAudio: música suave\nDuración total: 6 s.')
    expect(prompt).not.toMatch(/texto en pantalla|Hay mesa/i)
  })
  it('las reglas fijas del pedido piden NO poner texto (se compone en edición) y ya no admiten «texto literal»', () => {
    const r = REGLAS_DEL_PEDIDO.join(' ')
    expect(r).toContain('Sin texto, letras, subtítulos ni letreros en pantalla')
    expect(r).not.toMatch(/literalmente/)
    expect(r).toContain('sin logotipos ni marcas que no sean las del cliente')
  })
})
