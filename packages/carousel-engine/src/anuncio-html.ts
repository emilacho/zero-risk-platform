/**
 * ANUNCIO EN HTML/CSS · la misma composición de `anuncio.tsx`, dibujada por un NAVEGADOR sin pantalla
 * (DECISIÓN Lenovo 16-nov 21:04, aprobada por Emilio · Sprint 1 · Mejora 5 · CC3).
 *
 * Por qué HTML: la misma plantilla sirve para el anuncio fijo (PNG, Sprint 1) y para video (MP4, Sprint 2: se anima con CSS
 * y se graba cuadro a cuadro). La lógica de diseño NO cambia: el pedido (`PedidoDeAnuncio`) y el diseño (`composicion.ts`:
 * disposición, colores por contraste, tipografías del manual) son los mismos; aquí solo cambia el dibujo.
 *
 * Reglas:
 *  · la IA nunca escribe letras: el texto llega del autor y aquí se ESCAPA (nunca se interpreta como HTML);
 *  · fuentes de marca EMPAQUETADAS en el documento (@font-face con los bytes): no depende de las fuentes del sistema;
 *  · el documento no pide nada a la red: foto y logo solo como `data:image/…` (otra cosa no se dibuja);
 *  · este archivo no depende de ningún navegador: quien dibuja entrega una `PaginaSinPantalla` (Playwright/Chromium en el
 *    servicio de render; en pruebas, un doble).
 */
import { cargarFuentesDeMarca, informeDeFuentes, type FontEntry, type ResolverOpciones } from './fonts'
import { sinEmojis } from './sin-emojis'
import { tamanoDeTitular, type AnuncioDibujado, type PedidoDeAnuncio } from './anuncio'

/** lo mínimo que se le pide a una página de navegador sin pantalla (Playwright `Page` lo cumple) */
export interface PaginaSinPantalla {
  setViewportSize(s: { width: number; height: number }): Promise<void>
  setContent(html: string, o?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>
  evaluate<T>(expresion: string): Promise<T>
  screenshot(o: { type: 'png'; omitBackground?: boolean; fullPage?: boolean }): Promise<Buffer>
  close(): Promise<void>
}

export const limpio = (s: string | null | undefined): string => sinEmojis(String(s ?? '')).replace(/\s+/g, ' ').trim()

/** el texto del autor nunca se interpreta: se escapa entero */
export const escaparHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** solo imágenes embebidas (data:image/png|jpeg|webp|svg+xml;base64,…): el documento no sale a la red */
export const imagenEmbebida = (src: string | null | undefined): string | null =>
  typeof src === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null

/** un nombre de familia que no rompe el CSS (letras, números, espacio y guion) */
export const familia = (f: string): string => (f || 'Inter').replace(/[^\p{L}\p{N} \-]/gu, '').trim() || 'Inter'

/** colores: solo #hex (el diseño ya los valida; esto es la segunda puerta) */
export const color = (c: string, reserva: string): string => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : reserva)

const aBase64 = (d: ArrayBuffer | Uint8Array | Buffer): string => Buffer.from(d instanceof ArrayBuffer ? new Uint8Array(d) : d).toString('base64')

/** @font-face con los bytes de cada fuente (empaquetadas en el documento) */
export function caraDeFuentes(fonts: FontEntry[]): string {
  return fonts.map((f) => `@font-face{font-family:'${familia(f.name)}';src:url(data:font/ttf;base64,${aBase64(f.data as ArrayBuffer)}) format('truetype');font-weight:${Number(f.weight) || 400};font-style:${f.style === 'italic' ? 'italic' : 'normal'};font-display:block}`).join('\n')
}

/** el documento HTML completo del anuncio (puro: mismo pedido + mismas fuentes ⇒ mismo documento) */
export function htmlDeAnuncio(p: PedidoDeAnuncio, fonts: FontEntry[]): string {
  const { ancho: W, alto: H, diseno: d } = p
  const m = Math.round(W * 0.065)
  const util = W - 2 * m
  const t = { etiqueta: limpio(p.texto.etiqueta), titular: limpio(p.texto.titular), bajada: limpio(p.texto.bajada), boton: limpio(p.texto.boton) }
  const centro = d.variante === 'abajo_centro'
  const arriba = d.variante === 'arriba_izquierda'
  const franja = d.variante === 'franja'
  const fCuerpo = familia(d.tipografia.cuerpo)
  const fTitular = familia(d.tipografia.titular)
  const colorTexto = franja ? color(d.franja.texto, '#ffffff') : '#ffffff'
  const sombra = franja ? 'none' : '0 2px 12px rgba(0,0,0,0.55)'
  const alinear = centro ? 'center' : 'left'
  const foto = imagenEmbebida(p.foto)
  const logo = imagenEmbebida(p.logo)
  const fotoAlto = franja ? Math.round(H * 0.6) : H

  const css = `
${caraDeFuentes(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${franja ? color(d.franja.fondo, '#111111') : '#000000'}}
body{position:relative;font-family:'${fCuerpo}',sans-serif;-webkit-font-smoothing:antialiased}
.foto{position:absolute;top:0;left:0;width:${W}px;height:${fotoAlto}px;object-fit:cover}
.velo{position:absolute;left:0;width:${W}px;height:${Math.round(H * 0.6)}px;${arriba ? 'top:0' : 'bottom:0'};background:linear-gradient(${arriba ? '0deg' : '180deg'},rgba(0,0,0,0) 0%,rgba(0,0,0,0.72) 100%)}
.franja{position:absolute;left:0;bottom:0;width:${W}px;height:${Math.round(H * 0.4)}px;background:${color(d.franja.fondo, '#111111')}}
.velo-logo{position:absolute;left:0;top:0;width:${W}px;height:${Math.round(H * 0.22)}px;background:linear-gradient(180deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0) 100%)}
.fila-logo{position:absolute;top:${m}px;left:${m}px;width:${util}px;display:flex;justify-content:${centro ? 'center' : arriba ? 'flex-end' : 'flex-start'}}
.logo{width:${Math.round(W * 0.2)}px;height:${Math.round(W * 0.2)}px;object-fit:contain}
.firma{font-family:'${fTitular}',sans-serif;font-size:${Math.round(W * 0.045)}px;font-weight:700;color:#ffffff;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
.bloque{position:absolute;left:${m}px;width:${util}px;display:flex;flex-direction:column;align-items:${centro ? 'center' : 'flex-start'};${arriba ? `top:${m + (logo ? Math.round(W * 0.22) : p.firma ? Math.round(W * 0.09) : 0)}px` : `bottom:${m}px`}}
.etiqueta{padding:${Math.round(W * 0.01)}px ${Math.round(W * 0.025)}px;border-radius:999px;background:${color(d.etiqueta.fondo, '#111111')};color:${color(d.etiqueta.texto, '#ffffff')};font-size:${Math.round(W * 0.03)}px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:${Math.round(W * 0.02)}px}
.titular{font-family:'${fTitular}',sans-serif;font-size:${tamanoDeTitular(t.titular, util)}px;font-weight:700;line-height:1.05;color:${colorTexto};text-align:${alinear};text-shadow:${sombra};margin-bottom:${Math.round(W * 0.018)}px;overflow-wrap:anywhere}
.bajada{font-size:${Math.round(util * 0.042)}px;line-height:1.3;color:${colorTexto};text-align:${alinear};text-shadow:${sombra};margin-bottom:${Math.round(W * 0.03)}px}
.boton{padding:${Math.round(W * 0.018)}px ${Math.round(W * 0.04)}px;border-radius:999px;background:${color(d.boton.fondo, '#111111')};color:${color(d.boton.texto, '#ffffff')};font-size:${Math.round(W * 0.036)}px;font-weight:700}`

  const cabeza = logo ? `<img class="logo" src="${logo}" alt="">` : p.firma ? `<div class="firma">${escaparHtml(limpio(p.firma))}</div>` : ''
  const piezas = [
    t.etiqueta ? `<div class="etiqueta">${escaparHtml(t.etiqueta)}</div>` : '',
    t.titular ? `<div class="titular">${escaparHtml(t.titular)}</div>` : '',
    t.bajada ? `<div class="bajada">${escaparHtml(t.bajada)}</div>` : '',
    t.boton ? `<div class="boton">${escaparHtml(t.boton)}</div>` : '',
  ].join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>${css}</style></head><body data-variante="${d.variante}">${foto ? `<img class="foto" src="${foto}" alt="">` : ''}${franja ? '<div class="franja"></div>' : '<div class="velo"></div>'}${!arriba && cabeza ? '<div class="velo-logo"></div>' : ''}${cabeza ? `<div class="fila-logo">${cabeza}</div>` : ''}<div class="bloque">${piezas}</div></body></html>`
}

/**
 * dibuja el anuncio con un navegador sin pantalla. `abrirPagina` la entrega quien tiene el navegador (el servicio de render).
 * Espera a que las fuentes empaquetadas estén listas antes de la foto. La página se cierra siempre.
 */
export async function renderAnuncioHtml(
  p: PedidoDeAnuncio,
  o: { abrirPagina: () => Promise<PaginaSinPantalla>; fonts?: FontEntry[]; fontResolver?: ResolverOpciones },
): Promise<AnuncioDibujado> {
  const t0 = Date.now()
  const familias = [p.diseno.tipografia.cuerpo || 'Inter', p.diseno.tipografia.titular || p.diseno.tipografia.cuerpo || 'Inter']
  const fonts = o.fonts ?? (await cargarFuentesDeMarca(familias, o.fontResolver)).fonts
  const informe = informeDeFuentes(familias, fonts)
  const pagina = await o.abrirPagina()
  try {
    await pagina.setViewportSize({ width: p.ancho, height: p.alto })
    await pagina.setContent(htmlDeAnuncio(p, fonts), { waitUntil: 'load' })
    await pagina.evaluate<boolean>('document.fonts.ready.then(() => true)')
    const png = await pagina.screenshot({ type: 'png' })
    return { png: Buffer.from(png), ancho: p.ancho, alto: p.alto, fonts_usadas: informe.usadas, fonts_faltantes: informe.faltantes, ms: Date.now() - t0 }
  } finally {
    await pagina.close().catch(() => undefined)
  }
}
