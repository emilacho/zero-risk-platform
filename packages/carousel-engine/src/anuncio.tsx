/**
 * ANUNCIO · la composición de una pieza con foto (Sprint 1 · Mejora 5 · CC3 · 16-nov).
 *
 * La IA solo hace la foto. Aquí, por CÓDIGO, se pone encima lo que es de la marca: logo, etiqueta, titular, bajada y botón,
 * con los colores y las tipografías del manual del cliente. El texto llega escrito por el autor de la pieza; este archivo no lo cambia.
 * Agnóstico: ningún color, texto ni tipografía de un cliente vive aquí; todo llega como dato.
 *
 * Pipeline: foto (data URI) + diseño + texto → satori → SVG → resvg → PNG.
 */
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { createElement as h, type ReactElement } from 'react'
import { cargarFuentesDeMarca, informeDeFuentes, type FontEntry, type ResolverOpciones } from './fonts'
import { sinEmojis } from './sin-emojis'

export type VarianteDeAnuncio = 'abajo_izquierda' | 'abajo_centro' | 'arriba_izquierda' | 'franja'
export const VARIANTES_DE_ANUNCIO: readonly VarianteDeAnuncio[] = ['abajo_izquierda', 'abajo_centro', 'arriba_izquierda', 'franja']

export interface TextoDeAnuncio { etiqueta?: string | null; titular?: string | null; bajada?: string | null; boton?: string | null }
export interface DisenoDeAnuncio {
  variante: VarianteDeAnuncio
  /** fondo y texto de cada elemento (ya resueltos por contraste) */
  etiqueta: { fondo: string; texto: string }
  boton: { fondo: string; texto: string }
  /** color de la franja (solo variante `franja`) y su texto */
  franja: { fondo: string; texto: string }
  tipografia: { cuerpo: string; titular: string }
}
export interface PedidoDeAnuncio {
  ancho: number
  alto: number
  /** la foto ya encajada al formato, como data URI */
  foto: string
  /** el logo como data URI; null = se escribe el nombre o el usuario de la marca (`firma`) */
  logo: string | null
  firma: string | null
  texto: TextoDeAnuncio
  diseno: DisenoDeAnuncio
}
export interface AnuncioDibujado { png: Buffer; ancho: number; alto: number; fonts_usadas: string[]; fonts_faltantes: string[]; ms: number }

const limpio = (s: string | null | undefined): string => sinEmojis(String(s ?? '')).replace(/\s+/g, ' ').trim()

/** tamaño del titular según el largo (satori no mide texto): ocupa ~2 líneas del ancho útil, sin bajar de un mínimo legible */
export function tamanoDeTitular(titular: string, anchoUtil: number): number {
  const max = Math.round(anchoUtil * 0.105)
  const min = Math.round(anchoUtil * 0.055)
  const porLinea = Math.max(1, Math.floor(anchoUtil / (max * 0.52)))
  const lineas = Math.ceil(titular.length / porLinea)
  if (lineas <= 2) return max
  return Math.max(min, Math.round(max * Math.sqrt(2 / lineas)))
}

/** el árbol del anuncio (exportado para probar el contenido sin dibujar) */
export function arbolDeAnuncio(p: PedidoDeAnuncio): ReactElement {
  const { ancho: W, alto: H, diseno: d } = p
  const m = Math.round(W * 0.065)
  const util = W - 2 * m
  const t = { etiqueta: limpio(p.texto.etiqueta), titular: limpio(p.texto.titular), bajada: limpio(p.texto.bajada), boton: limpio(p.texto.boton) }
  const centro = d.variante === 'abajo_centro'
  const arriba = d.variante === 'arriba_izquierda'
  const franja = d.variante === 'franja'
  const tamTit = tamanoDeTitular(t.titular, util)
  const tamBaj = Math.round(util * 0.042)
  const colorTexto = franja ? d.franja.texto : '#ffffff'
  // satori no acepta valores vacíos en el estilo: sin sombra, la clave no va
  const sombra: Record<string, string> = franja ? {} : { textShadow: '0 2px 12px rgba(0,0,0,0.55)' }

  const logo = p.logo
    ? h('img', { src: p.logo, width: Math.round(W * 0.2), height: Math.round(W * 0.2), style: { width: Math.round(W * 0.2), height: Math.round(W * 0.2), objectFit: 'contain' } })
    : p.firma
      ? h('div', { style: { display: 'flex', fontFamily: d.tipografia.titular, fontSize: Math.round(W * 0.045), fontWeight: 700, color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.6)' } }, limpio(p.firma))
      : null
  const filaLogo = logo
    ? h('div', { style: { display: 'flex', position: 'absolute', top: m, left: m, width: util, justifyContent: centro ? 'center' : arriba ? 'flex-end' : 'flex-start' } }, logo)
    : null

  const piezas: ReactElement[] = []
  if (t.etiqueta) piezas.push(h('div', { key: 'e', style: { display: 'flex', alignSelf: centro ? 'center' : 'flex-start', padding: `${Math.round(W * 0.01)}px ${Math.round(W * 0.025)}px`, borderRadius: 999, backgroundColor: d.etiqueta.fondo, color: d.etiqueta.texto, fontFamily: d.tipografia.cuerpo, fontSize: Math.round(W * 0.03), fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: Math.round(W * 0.02) } }, t.etiqueta))
  if (t.titular) piezas.push(h('div', { key: 't', style: { display: 'flex', fontFamily: d.tipografia.titular, fontSize: tamTit, fontWeight: 700, lineHeight: 1.05, color: colorTexto, textAlign: centro ? 'center' : 'left', justifyContent: centro ? 'center' : 'flex-start', ...sombra, marginBottom: Math.round(W * 0.018) } }, t.titular))
  if (t.bajada) piezas.push(h('div', { key: 'b', style: { display: 'flex', fontFamily: d.tipografia.cuerpo, fontSize: tamBaj, lineHeight: 1.3, color: colorTexto, textAlign: centro ? 'center' : 'left', justifyContent: centro ? 'center' : 'flex-start', ...sombra, marginBottom: Math.round(W * 0.03) } }, t.bajada))
  if (t.boton) piezas.push(h('div', { key: 'c', style: { display: 'flex', alignSelf: centro ? 'center' : 'flex-start', padding: `${Math.round(W * 0.018)}px ${Math.round(W * 0.04)}px`, borderRadius: 999, backgroundColor: d.boton.fondo, color: d.boton.texto, fontFamily: d.tipografia.cuerpo, fontSize: Math.round(W * 0.036), fontWeight: 700 } }, t.boton))

  const bloque = h('div', {
    style: {
      display: 'flex', flexDirection: 'column', position: 'absolute', left: m, width: util,
      ...(arriba ? { top: m + (logo ? Math.round(W * 0.06) : 0) } : { bottom: m }),
      alignItems: centro ? 'center' : 'flex-start',
    },
  }, ...piezas)

  // velo solo del lado del texto (la foto queda limpia del otro lado); la franja es un bloque sólido del color de la marca
  const altoVelo = Math.round(H * 0.6)
  const velo = franja
    ? h('div', { style: { display: 'flex', position: 'absolute', left: 0, bottom: 0, width: W, height: Math.round(H * 0.4), backgroundColor: d.franja.fondo } })
    : h('div', { style: { display: 'flex', position: 'absolute', left: 0, width: W, height: altoVelo, ...(arriba ? { top: 0 } : { bottom: 0 }), backgroundImage: `linear-gradient(${arriba ? '0deg' : '180deg'}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)` } })
  const veloLogo = !arriba && logo ? h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: Math.round(H * 0.22), backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)' } }) : null
  const fotoAlto = franja ? Math.round(H * 0.6) : H

  return h('div', { style: { display: 'flex', position: 'relative', width: W, height: H, backgroundColor: franja ? d.franja.fondo : '#000000', fontFamily: d.tipografia.cuerpo } },
    h('img', { src: p.foto, width: W, height: fotoAlto, style: { position: 'absolute', top: 0, left: 0, width: W, height: fotoAlto, objectFit: 'cover' } }),
    velo,
    ...(veloLogo ? [veloLogo] : []),
    ...(filaLogo ? [filaLogo] : []),
    bloque,
  )
}

/** dibuja el anuncio a PNG del tamaño pedido. `options.fonts` (pruebas) evita bajar las tipografías. */
export async function renderAnuncio(p: PedidoDeAnuncio, options: { fonts?: FontEntry[]; fontResolver?: ResolverOpciones } = {}): Promise<AnuncioDibujado> {
  const t0 = Date.now()
  const familias = [p.diseno.tipografia.cuerpo || 'Inter', p.diseno.tipografia.titular || p.diseno.tipografia.cuerpo || 'Inter']
  const fonts = options.fonts ?? (await cargarFuentesDeMarca(familias, options.fontResolver)).fonts
  const informe = informeDeFuentes(familias, fonts)
  const svg = await satori(arbolDeAnuncio(p), { width: p.ancho, height: p.alto, fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })) })
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: p.ancho } }).render().asPng())
  return { png, ancho: p.ancho, alto: p.alto, fonts_usadas: informe.usadas, fonts_faltantes: informe.faltantes, ms: Date.now() - t0 }
}
