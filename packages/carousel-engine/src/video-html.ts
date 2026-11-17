/**
 * VIDEO COMPUESTO CON LA MARCA · la plantilla HTML de #1068 llevada al video (Sprint 2 · S2-5 · CC2 · GO Lenovo 17-nov 02:47).
 *
 * El modelo de video ya NO escribe letras (se quitó «texto literal en pantalla» del pedido): el texto de cada plano y el cierre
 * con la marca se dibujan aquí, por código, encima del video unido. Lo graba el servicio de render (hyperframes) cuadro a cuadro.
 *
 * Mismas reglas que el anuncio fijo:
 *  · el texto llega del guion (`texto_en_pantalla` de cada plano) y del autor del cierre, y se ESCAPA (nunca se interpreta);
 *  · colores y tipografías del diseño (`disenoDeAnuncio`), fuentes EMPAQUETADAS en el documento;
 *  · el documento no pide nada a la red: el video va como archivo de la carpeta del render (nombre simple) y el logo como data:image.
 * Formato de hyperframes: raíz con `data-composition-id`, cada capa con `data-start`/`data-duration`/`data-track-index`,
 * y `data-no-timeline` (no hay animación con guion: las capas aparecen y desaparecen en sus segundos).
 */
import type { FontEntry } from './fonts'
import { tamanoDeTitular, type DisenoDeAnuncio, type TextoDeAnuncio } from './anuncio'
import { caraDeFuentes, color, escaparHtml, familia, imagenEmbebida, limpio } from './anuncio-html'

/** el texto de un plano, en sus segundos del video unido */
export interface TextoDelPlano { desde: number; hasta: number; texto: string }
/** el cierre con la marca: el mismo bloque del anuncio fijo (etiqueta · titular · bajada · botón) + logo o firma */
export interface CierreDelVideo extends TextoDeAnuncio { desde: number }
export interface PedidoDeVideoCompuesto {
  ancho: number
  alto: number
  segundos: number
  /** el video unido, por su nombre en la carpeta del render (el servicio lo baja con ese nombre) */
  video: string
  logo: string | null
  firma: string | null
  diseno: DisenoDeAnuncio
  textos: TextoDelPlano[]
  /** null = sin cierre */
  cierre: CierreDelVideo | null
  /** el video trae sonido (música o ambiente): se conserva; false = se declara mudo. Por omisión, con sonido */
  con_audio?: boolean
}

/** el nombre del video: simple, sin rutas (igual que acepta el servicio) */
export const NOMBRE_DE_VIDEO = /^[a-z0-9][a-z0-9_-]{0,79}\.(mp4|mov|webm)$/i
/** segundos del cierre si el autor no dice desde cuándo */
export const SEGUNDOS_DE_CIERRE = 2.5
/** un texto que queda más corto que esto (al recortarlo contra el cierre o el final) no se muestra: no alcanza a leerse */
export const SEGUNDOS_MINIMOS_DE_TEXTO = 0.5

const s = (n: number): string => String(Math.round(n * 1000) / 1000)

export type CapaDeTexto = { desde: number; hasta: number; texto: string }
/**
 * las capas de texto que se dibujan: limpias, dentro del video, recortadas para no pisar el cierre, en orden y sin solaparse
 * (si dos planos se pisan, el siguiente empieza donde termina el anterior). Lo que queda muy corto se descarta.
 */
export function capasDeTexto(p: Pick<PedidoDeVideoCompuesto, 'segundos' | 'textos' | 'cierre'>): CapaDeTexto[] {
  const fin = p.cierre ? Math.min(p.segundos, Math.max(0, p.cierre.desde)) : p.segundos
  const capas: CapaDeTexto[] = []
  const ordenados = [...p.textos].filter((t) => Number.isFinite(t.desde) && Number.isFinite(t.hasta)).sort((a, b) => a.desde - b.desde)
  let ultimo = 0
  for (const t of ordenados) {
    const texto = limpio(t.texto)
    if (!texto) continue
    const desde = Math.max(0, t.desde, ultimo)
    const hasta = Math.min(fin, t.hasta)
    if (hasta - desde < SEGUNDOS_MINIMOS_DE_TEXTO) continue
    capas.push({ desde, hasta, texto })
    ultimo = hasta
  }
  return capas
}

/** el cierre efectivo: desde cuándo, recortado al video; sin ningún texto ni marca que mostrar, no hay cierre */
export function cierreEfectivo(p: Pick<PedidoDeVideoCompuesto, 'segundos' | 'cierre' | 'logo' | 'firma'>): (CierreDelVideo & { hasta: number }) | null {
  if (!p.cierre) return null
  const c = p.cierre
  const hayTexto = [c.etiqueta, c.titular, c.bajada, c.boton].some((x) => limpio(x))
  if (!hayTexto && !imagenEmbebida(p.logo) && !limpio(p.firma)) return null
  const desde = Number.isFinite(c.desde) ? Math.min(Math.max(0, c.desde), p.segundos) : Math.max(0, p.segundos - SEGUNDOS_DE_CIERRE)
  if (p.segundos - desde < SEGUNDOS_MINIMOS_DE_TEXTO) return null
  return { ...c, desde, hasta: p.segundos }
}

/** el documento de la composición (puro: mismo pedido + mismas fuentes ⇒ mismo documento) */
export function htmlDeVideo(p: PedidoDeVideoCompuesto, fonts: FontEntry[]): string {
  if (!NOMBRE_DE_VIDEO.test(p.video)) throw new Error(`nombre de video no válido: «${p.video.slice(0, 90)}»`)
  if (!(p.segundos > 0)) throw new Error('el video no tiene duración')
  const { ancho: W, alto: H, diseno: d } = p
  const m = Math.round(W * 0.065)
  const util = W - 2 * m
  // zona segura de las redes verticales: arriba la cabecera de la app, abajo los botones y el pie (≈ 20 % del alto)
  const abajo = Math.round(H * 0.2)
  const fCuerpo = familia(d.tipografia.cuerpo)
  const fTitular = familia(d.tipografia.titular)
  const centro = d.variante === 'abajo_centro'
  const alinear = centro ? 'center' : 'left'
  const capas = capasDeTexto(p)
  const c = cierreEfectivo(p)
  const logo = imagenEmbebida(p.logo)
  const firma = limpio(p.firma)
  // legibilidad (shotcraft): el texto de un plano mide al menos el 5 % del alto del video
  const tamTexto = (t: string) => Math.max(Math.round(H * 0.05), tamanoDeTitular(t, util))

  const css = `
${caraDeFuentes(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000000}
body{font-family:'${fCuerpo}',sans-serif;-webkit-font-smoothing:antialiased}
#raiz{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.base{position:absolute;top:0;left:0;width:${W}px;height:${H}px;object-fit:cover}
.texto{position:absolute;left:${m}px;width:${util}px;bottom:${abajo}px;font-family:'${fTitular}',sans-serif;font-weight:700;line-height:1.08;color:#ffffff;text-align:${alinear};text-shadow:0 2px 14px rgba(0,0,0,0.7);overflow-wrap:anywhere}
.cierre{position:absolute;top:0;left:0;width:${W}px;height:${H}px}
.velo{position:absolute;left:0;bottom:0;width:${W}px;height:${Math.round(H * 0.65)}px;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.78) 100%)}
.bloque{position:absolute;left:${m}px;width:${util}px;bottom:${abajo}px;display:flex;flex-direction:column;align-items:${centro ? 'center' : 'flex-start'}}
.logo{width:${Math.round(W * 0.24)}px;height:${Math.round(W * 0.24)}px;object-fit:contain;margin-bottom:${Math.round(W * 0.04)}px}
.firma{font-family:'${fTitular}',sans-serif;font-size:${Math.round(W * 0.05)}px;font-weight:700;color:#ffffff;text-shadow:0 2px 10px rgba(0,0,0,0.6);margin-bottom:${Math.round(W * 0.03)}px}
.etiqueta{padding:${Math.round(W * 0.01)}px ${Math.round(W * 0.025)}px;border-radius:999px;background:${color(d.etiqueta.fondo, '#111111')};color:${color(d.etiqueta.texto, '#ffffff')};font-size:${Math.round(W * 0.03)}px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:${Math.round(W * 0.02)}px}
.titular{font-family:'${fTitular}',sans-serif;font-weight:700;line-height:1.05;color:#ffffff;text-align:${alinear};text-shadow:0 2px 12px rgba(0,0,0,0.55);margin-bottom:${Math.round(W * 0.018)}px;overflow-wrap:anywhere}
.bajada{font-size:${Math.round(util * 0.042)}px;line-height:1.3;color:#ffffff;text-align:${alinear};text-shadow:0 2px 12px rgba(0,0,0,0.55);margin-bottom:${Math.round(W * 0.03)}px}
.boton{padding:${Math.round(W * 0.018)}px ${Math.round(W * 0.04)}px;border-radius:999px;background:${color(d.boton.fondo, '#111111')};color:${color(d.boton.texto, '#ffffff')};font-size:${Math.round(W * 0.036)}px;font-weight:700}`

  const capa = (id: string, clase: string, desde: number, hasta: number, pista: number, dentro: string, estilo = '') =>
    `<div id="${id}" class="clip ${clase}" data-start="${s(desde)}" data-duration="${s(hasta - desde)}" data-track-index="${pista}"${estilo ? ` style="${estilo}"` : ''}>${dentro}</div>`
  const textos = capas.map((t, i) => capa(`texto-${i + 1}`, 'texto', t.desde, t.hasta, 1, escaparHtml(t.texto), `font-size:${tamTexto(t.texto)}px`)).join('')
  let cierre = ''
  if (c) {
    const titular = limpio(c.titular)
    const piezas = [
      logo ? `<img class="logo" src="${logo}" alt="">` : firma ? `<div class="firma">${escaparHtml(firma)}</div>` : '',
      limpio(c.etiqueta) ? `<div class="etiqueta">${escaparHtml(limpio(c.etiqueta))}</div>` : '',
      titular ? `<div class="titular" style="font-size:${tamanoDeTitular(titular, util)}px">${escaparHtml(titular)}</div>` : '',
      limpio(c.bajada) ? `<div class="bajada">${escaparHtml(limpio(c.bajada))}</div>` : '',
      limpio(c.boton) ? `<div class="boton">${escaparHtml(limpio(c.boton))}</div>` : '',
    ].join('')
    cierre = capa('cierre', 'cierre', c.desde, c.hasta, 2, `<div class="velo"></div><div class="bloque">${piezas}</div>`)
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="raiz" data-composition-id="main" data-start="0" data-duration="${s(p.segundos)}" data-width="${W}" data-height="${H}" data-no-timeline><video id="base" class="clip base" src="${p.video}" data-start="0" data-duration="${s(p.segundos)}" data-track-index="0"${p.con_audio === false ? ' muted' : ' data-has-audio="true"'} playsinline></video>${textos}${cierre}</div></body></html>`
}
