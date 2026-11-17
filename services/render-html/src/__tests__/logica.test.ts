/**
 * S2-5 · el servicio de render HTML · reglas puras (sin red ni navegador). Corre en el CI de la raíz.
 */
import { describe, expect, it } from 'vitest'
import { argumentosDelRender, autorizado, conCsp, CSP_PNG, CSP_VIDEO, entornoDeHyperframes, hostsPermitidos, LIMITES, NOMBRE_DE_ARCHIVO, urlPermitida, validarPedidoPng, validarPedidoVideo } from '../logica'

const HOSTS = hostsPermitidos('abc.supabase.co, Otro.EJEMPLO.com ,')
const video = (o: Record<string, unknown> = {}) => ({ html: '<html><head></head><body></body></html>', ancho: 1080, alto: 1920, segundos: 12, archivos: [{ nombre: 'base.mp4', url: 'https://abc.supabase.co/storage/v1/object/public/oficina/x/base.mp4' }], ...o })

describe('la llave interna', () => {
  it('pasa solo la llave exacta', () => {
    expect(autorizado('k-123', 'k-123')).toBe(true)
    expect(autorizado('k-124', 'k-123')).toBe(false)
    expect(autorizado('k-12', 'k-123')).toBe(false)
  })
  it('sin llave configurada o sin cabecera, nadie pasa (el servicio no queda abierto por olvido)', () => {
    expect(autorizado('', '')).toBe(false)
    expect(autorizado('algo', undefined)).toBe(false)
    expect(autorizado(undefined, 'k')).toBe(false)
    expect(autorizado(null, 'k')).toBe(false)
  })
})

describe('de dónde puede bajar archivos', () => {
  it('la lista se lee separada por comas, sin espacios ni mayúsculas, y sin vacíos', () => {
    expect([...HOSTS]).toEqual(['abc.supabase.co', 'otro.ejemplo.com'])
    expect(hostsPermitidos(undefined).size).toBe(0)
  })
  it('solo https a un host EXACTO de la lista', () => {
    expect(urlPermitida('https://abc.supabase.co/a.mp4', HOSTS)).toBe(true)
    expect(urlPermitida('https://ABC.supabase.co/a.mp4', HOSTS)).toBe(true)
    expect(urlPermitida('https://abc.supabase.co:443/a.mp4', HOSTS)).toBe(true)
    expect(urlPermitida('http://abc.supabase.co/a.mp4', HOSTS)).toBe(false)
    expect(urlPermitida('https://evil.abc.supabase.co/a.mp4', HOSTS)).toBe(false)
    expect(urlPermitida('https://abc.supabase.co.evil.com/a.mp4', HOSTS)).toBe(false)
    expect(urlPermitida('https://abc.supabase.co:8443/a.mp4', HOSTS)).toBe(false)
    expect(urlPermitida('https://user:pw@abc.supabase.co/a.mp4', HOSTS)).toBe(false)
    expect(urlPermitida('file:///etc/passwd', HOSTS)).toBe(false)
    expect(urlPermitida('no es url', HOSTS)).toBe(false)
  })
  it('sin lista, ninguna dirección', () => {
    expect(urlPermitida('https://abc.supabase.co/a.mp4', new Set())).toBe(false)
  })
})

describe('el pedido de PNG', () => {
  it('acepta html + tamaño entero dentro de los topes', () => {
    expect(validarPedidoPng({ html: '<p>x</p>', ancho: 1080, alto: 1350 })).toEqual({ ok: true, valor: { html: '<p>x</p>', ancho: 1080, alto: 1350 } })
  })
  it('rechaza sin html, tamaños fuera de rango o no enteros, y html de más', () => {
    expect(validarPedidoPng({ ancho: 1080, alto: 1350 }).ok).toBe(false)
    expect(validarPedidoPng({ html: '  ', ancho: 1080, alto: 1350 }).ok).toBe(false)
    expect(validarPedidoPng({ html: 'x', ancho: 63, alto: 1350 }).ok).toBe(false)
    expect(validarPedidoPng({ html: 'x', ancho: 64, alto: 4096 }).ok).toBe(true)
    expect(validarPedidoPng({ html: 'x', ancho: 1080, alto: 4097 }).ok).toBe(false)
    expect(validarPedidoPng({ html: 'x', ancho: 1080.5, alto: 1350 }).ok).toBe(false)
    expect(validarPedidoPng({ html: 'x'.repeat(LIMITES.html_png_max_bytes + 1), ancho: 1080, alto: 1350 }).ok).toBe(false)
    expect(validarPedidoPng(null).ok).toBe(false)
  })
})

describe('el pedido de video', () => {
  it('acepta lo justo y pone fps 30 y calidad delivery por omisión', () => {
    const v = validarPedidoVideo(video(), HOSTS)
    expect(v).toMatchObject({ ok: true, valor: { fps: 30, calidad: 'delivery', segundos: 12, archivos: [{ nombre: 'base.mp4' }] } })
  })
  it('fps y calidad solo de las listas', () => {
    expect(validarPedidoVideo(video({ fps: 25, calidad: 'draft' }), HOSTS)).toMatchObject({ ok: true, valor: { fps: 25, calidad: 'draft' } })
    expect(validarPedidoVideo(video({ fps: 60 }), HOSTS).ok).toBe(false)
    expect(validarPedidoVideo(video({ calidad: 'alta' }), HOSTS).ok).toBe(false)
  })
  it('segundos entre 0 y el tope', () => {
    expect(validarPedidoVideo(video({ segundos: 0 }), HOSTS).ok).toBe(false)
    expect(validarPedidoVideo(video({ segundos: LIMITES.segundos_max }), HOSTS).ok).toBe(true)
    expect(validarPedidoVideo(video({ segundos: LIMITES.segundos_max + 0.1 }), HOSTS).ok).toBe(false)
    expect(validarPedidoVideo(video({ segundos: 'doce' }), HOSTS).ok).toBe(false)
  })
  it('los nombres son simples: sin rutas, sin subir de carpeta, sin pisar index.html, sin repetir', () => {
    const con = (nombre: string) => validarPedidoVideo(video({ archivos: [{ nombre, url: 'https://abc.supabase.co/a' }] }), HOSTS).ok
    expect(con('base.mp4')).toBe(true)
    expect(con('logo_1.png')).toBe(true)
    expect(con('../base.mp4')).toBe(false)
    expect(con('a/base.mp4')).toBe(false)
    expect(con('a\\base.mp4')).toBe(false)
    expect(con('.base.mp4')).toBe(false)
    expect(con('base.html')).toBe(false)
    expect(con('index.html')).toBe(false)
    expect(con('base.exe')).toBe(false)
    expect(NOMBRE_DE_ARCHIVO.test('x'.repeat(81) + '.mp4')).toBe(false)
    const rep = validarPedidoVideo(video({ archivos: [{ nombre: 'a.mp4', url: 'https://abc.supabase.co/1' }, { nombre: 'A.mp4', url: 'https://abc.supabase.co/2' }] }), HOSTS)
    expect(rep).toMatchObject({ ok: false, error: expect.stringContaining('repetido') })
  })
  it('una dirección fuera de la lista rechaza el pedido entero', () => {
    expect(validarPedidoVideo(video({ archivos: [{ nombre: 'base.mp4', url: 'https://otra.com/a.mp4' }] }), HOSTS)).toMatchObject({ ok: false, error: expect.stringContaining('no permitida') })
  })
  it('topes: cantidad de archivos y tamaño del documento (los clips no van dentro)', () => {
    const muchos = Array.from({ length: LIMITES.archivos_max + 1 }, (_, i) => ({ nombre: `c${i}.mp4`, url: 'https://abc.supabase.co/a' }))
    expect(validarPedidoVideo(video({ archivos: muchos }), HOSTS).ok).toBe(false)
    expect(validarPedidoVideo(video({ archivos: muchos.slice(0, LIMITES.archivos_max) }), HOSTS).ok).toBe(true)
    expect(validarPedidoVideo(video({ html: 'x'.repeat(LIMITES.html_video_max_bytes + 1) }), HOSTS).ok).toBe(false)
    expect(validarPedidoVideo(video({ archivos: 'base.mp4' }), HOSTS).ok).toBe(false)
  })
})

describe('la página queda cerrada a internet', () => {
  it('la CSP del servicio va PRIMERA dentro del <head>', () => {
    const h = conCsp('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', CSP_PNG)
    expect(h).toBe(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP_PNG}"><meta charset="utf-8"></head><body></body></html>`)
  })
  it('sin <head> la crea; sin <html> envuelve el documento', () => {
    expect(conCsp('<html lang="es"><body>x</body></html>', CSP_PNG)).toBe(`<html lang="es"><head><meta http-equiv="Content-Security-Policy" content="${CSP_PNG}"></head><body>x</body></html>`)
    expect(conCsp('<p>x</p>', CSP_PNG)).toBe(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP_PNG}"></head><body><p>x</p></body></html>`)
  })
  it('PNG: nada de red (solo data:); video: solo su carpeta', () => {
    expect(CSP_PNG).toContain("default-src 'none'")
    expect(CSP_PNG).not.toContain('http')
    expect(CSP_VIDEO).toContain("default-src 'self'")
    expect(CSP_VIDEO).toContain("media-src 'self'")
    expect(CSP_VIDEO).not.toMatch(/https?:/)
  })
})

describe('hyperframes', () => {
  it('telemetría apagada (las dos llaves que lee), sin buscar versiones, sin habilidades, y la llave del servicio no viaja', () => {
    const env = entornoDeHyperframes({ PATH: '/bin', RENDER_HTML_KEY: 'secreta', HYPERFRAMES_NO_TELEMETRY: '0' }, { navegador: '/usr/bin/chromium', ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe', config: '/tmp/c' })
    expect(env).toMatchObject({ PATH: '/bin', HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_CONFIG_DIR: '/tmp/c', HYPERFRAMES_BROWSER_PATH: '/usr/bin/chromium', HYPERFRAMES_FFMPEG_PATH: '/usr/bin/ffmpeg', HYPERFRAMES_FFPROBE_PATH: '/usr/bin/ffprobe' })
    expect(env.RENDER_HTML_KEY).toBeUndefined()
  })
  it('sin rutas, no inventa rutas', () => {
    const env = entornoDeHyperframes({}, { config: '/tmp/c' })
    expect(env.HYPERFRAMES_BROWSER_PATH).toBeUndefined()
    expect(env.HYPERFRAMES_FFMPEG_PATH).toBeUndefined()
  })
  it('el render falla ante errores del documento, sin GPU, y con los cuadros y la calidad pedidos', () => {
    expect(argumentosDelRender({ fps: 25, calidad: 'delivery' }, 'salida.mp4', 2)).toEqual(['render', '.', '-o', 'salida.mp4', '--fps', '25', '--quality', 'delivery', '--workers', '2', '--strict', '--no-browser-gpu', '--quiet', '--no-wait'])
    expect(argumentosDelRender({ fps: 30, calidad: 'draft' }, 's.mp4', 0)).toContain('1')
    expect(argumentosDelRender({ fps: 30, calidad: 'draft' }, 's.mp4', Number.NaN)[9]).toBe('1')
    expect(argumentosDelRender({ fps: 30, calidad: 'draft' }, 's.mp4', 2.7)[9]).toBe('2')
  })
})
