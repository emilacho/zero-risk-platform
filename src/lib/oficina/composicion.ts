/**
 * COMPOSICIÓN DE LA PIEZA CON FOTO · lo PURO (Sprint 1 · Mejora 5 · GO Lenovo 16-nov, firma de Emilio 19:46 · CC3).
 *
 * Después de la foto (generada o real), la entrega compone encima, por CÓDIGO, lo que es de la marca: logo, etiqueta, titular, bajada y botón,
 * con los colores y tipografías del manual (`identidad-visual.ts`). La IA nunca escribe texto en la imagen: el texto lo escribe el autor de la
 * pieza (`pieza_post.texto_en_imagen`) y aquí solo se acomoda. El diseño varía por pieza (4 disposiciones × 2 juegos de color) para que las
 * piezas no salgan iguales, y es estable: la misma pieza siempre sale igual.
 * Sin rejas: lo que falta se dice (aviso) y la pieza sigue; sin identidad visual, la foto sale como siempre.
 * Agnóstico: ningún color, texto, idioma ni tipografía de un cliente vive aquí.
 */
import type { MarcaParaRender } from './puertos'
import type { DisenoDeAnuncio, VarianteDeAnuncio } from '../../../packages/carousel-engine/src/anuncio'

export type { DisenoDeAnuncio, VarianteDeAnuncio }
/** el mismo orden que `VARIANTES_DE_ANUNCIO` del motor (sin importar el motor aquí: este módulo es puro y liviano) */
export const VARIANTES: readonly VarianteDeAnuncio[] = ['abajo_izquierda', 'abajo_centro', 'arriba_izquierda', 'franja']

export interface TextoEnImagen { etiqueta?: string; titular?: string; bajada?: string; boton?: string }

/** topes de lo que cabe escrito sobre la imagen (lo más largo se dice, no se corta) */
export const TOPES_DEL_TEXTO_EN_IMAGEN = { etiqueta: 40, titular: 70, bajada: 120, boton: 40 } as const

const RE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const largo = (hex: string): string => (hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex).toLowerCase()

/** luminancia relativa (WCAG) de un color #rgb / #rrggbb */
export function luminancia(hex: string): number {
  const h = largo(hex)
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contraste = (a: string, b: string): number => { const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
/** el texto que se lee sobre ese fondo: blanco o casi negro, el de mayor contraste */
export const textoSobre = (fondo: string): string => (contraste(fondo, '#ffffff') >= contraste(fondo, '#111111') ? '#ffffff' : '#111111')

/** por debajo de esto, dos colores de la marca se confunden (la etiqueta «desaparece» en la franja) */
export const CONTRASTE_MINIMO_CON_LA_FRANJA = 1.6

/** número estable de una semilla (FNV-1a 32 bits) */
export function numeroDe(semilla: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < semilla.length; i++) { h ^= semilla.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

/** el diseño de ESTA pieza: disposición y juego de color salen de la semilla (el brief), los colores y las tipografías, del manual */
export function disenoDeAnuncio(marca: MarcaParaRender, semilla: string): DisenoDeAnuncio {
  const n = numeroDe(semilla)
  const variante = VARIANTES[n % VARIANTES.length]
  const valido = (x: string | undefined): string | null => (x && RE_HEX.test(x.trim()) ? largo(x.trim()) : null)
  const primario = valido(marca.colors.primary) ?? '#111111'
  const secundario = valido(marca.colors.secondary) ?? primario
  const acento = valido(marca.colors.accent) ?? secundario
  // dos juegos: el botón en el color principal y la etiqueta en el acento, o al revés; la franja toma el principal o el secundario
  const juego = Math.floor(n / VARIANTES.length) % 2
  const fondoFranja = juego === 0 ? primario : secundario
  // sobre la franja, la etiqueta y el botón deben destacar del fondo: si su color se confunde con ella, toman el color de la marca que más contrasta
  const sobreFranja = (c: string): string => (variante === 'franja' && contraste(c, fondoFranja) < CONTRASTE_MINIMO_CON_LA_FRANJA ? [acento, primario, secundario].sort((x, y) => contraste(y, fondoFranja) - contraste(x, fondoFranja))[0] : c)
  const fondoBoton = sobreFranja(juego === 0 ? primario : acento)
  const fondoEtiqueta = sobreFranja(juego === 0 ? acento : primario)
  const cuerpo = marca.fonts.family?.trim() || 'Inter'
  return {
    variante,
    etiqueta: { fondo: fondoEtiqueta, texto: textoSobre(fondoEtiqueta) },
    boton: { fondo: fondoBoton, texto: textoSobre(fondoBoton) },
    franja: { fondo: fondoFranja, texto: textoSobre(fondoFranja) },
    tipografia: { cuerpo, titular: marca.fonts.headline_family?.trim() || cuerpo },
  }
}

const texto = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')

/** el dominio de la web del cliente («https://www.ejemplo.com/x» → «ejemplo.com»), o null */
export function dominioDe(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '') || null } catch { return null }
}

/**
 * lo que va ESCRITO sobre la imagen: lo que el autor dejó en `texto_en_imagen`. El botón, si el autor no lo dio, es el llamado de la pieza
 * (si cabe) o, si no, la web del cliente. Nunca se inventa una palabra. Devuelve los avisos de lo que faltó o no cabe.
 */
export function textoEnImagenDe(pieza: Record<string, unknown>, web: string | null): { texto: TextoEnImagen; avisos: string[] } {
  const crudo = (pieza.texto_en_imagen && typeof pieza.texto_en_imagen === 'object' ? pieza.texto_en_imagen : {}) as Record<string, unknown>
  const t: TextoEnImagen = {}
  for (const k of ['etiqueta', 'titular', 'bajada', 'boton'] as const) { const v = texto(crudo[k]); if (v) t[k] = v }
  const avisos: string[] = []
  if (!t.boton) {
    const llamado = texto(pieza.llamado)
    const dominio = dominioDe(web)
    if (llamado && llamado.length <= TOPES_DEL_TEXTO_EN_IMAGEN.boton) t.boton = llamado
    else if (dominio) t.boton = dominio
  }
  if (!t.titular) avisos.push('la pieza no trae titular para escribir sobre la imagen (`texto_en_imagen.titular`): la imagen sale solo con el logo y el botón')
  for (const k of ['etiqueta', 'titular', 'bajada', 'boton'] as const) {
    const v = t[k]
    if (v && v.length > TOPES_DEL_TEXTO_EN_IMAGEN[k]) avisos.push(`el texto «${k}» de la imagen tiene ${v.length} caracteres y caben ${TOPES_DEL_TEXTO_EN_IMAGEN[k]}: se dibuja más chico y puede leerse mal`)
  }
  return { texto: t, avisos }
}

/** el texto escrito sobre la imagen, junto, para chequearlo con las mismas reglas que el pie (prohibidas, registro, datos) */
export const textoEnImagenParaChequear = (pieza: Record<string, unknown> | undefined): string => {
  const c = (pieza?.texto_en_imagen && typeof pieza.texto_en_imagen === 'object' ? pieza.texto_en_imagen : {}) as Record<string, unknown>
  return ['etiqueta', 'titular', 'bajada', 'boton'].map((k) => texto(c[k])).filter(Boolean).join('\n')
}

/** bytes de una imagen → data URI (png, jpeg, webp, svg). Otra cosa ⇒ null (no se dibuja lo que no se sabe leer) */
export function comoDataUri(b: Buffer | null | undefined): string | null {
  if (!b || b.length < 4) return null
  const tipo = b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
    : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
      : b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
        : /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(b.toString('utf8', 0, Math.min(b.length, 400))) ? 'image/svg+xml'
          : null
  return tipo ? `data:${tipo};base64,${b.toString('base64')}` : null
}
