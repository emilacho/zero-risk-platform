/**
 * Sin emojis en el dibujo (29-oct · «NO GLYPH»): las fuentes de marca no traen emojis y satori dibuja un recuadro vacío en su lugar.
 * Se quitan del texto ANTES de dibujar (la pieza de texto que se publica los conserva: esto solo toca lo que se pinta). Puro.
 * Se conservan ©, ® y ™ (las fuentes de texto los traen) y los dígitos de los emojis de teclas («1️⃣» queda «1»).
 */
const SE_QUEDAN = new Set([0x00a9, 0x00ae, 0x2122])
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}]|[‍︎️⃣\u{E0020}-\u{E007F}]/gu

export function sinEmojis(texto: string): string {
  return texto
    .replace(EMOJI, (m) => (m.length === 1 && SE_QUEDAN.has(m.codePointAt(0)!) ? m : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+(\r?\n)/g, '$1')
    .trim()
}

/** lo mismo para todo texto dentro de una lámina (campos sueltos o listas), sin tocar números, booleanos ni la forma */
export function sinEmojisEn<T>(valor: T): T {
  if (typeof valor === 'string') return sinEmojis(valor) as unknown as T
  if (Array.isArray(valor)) return valor.map((x) => sinEmojisEn(x)) as unknown as T
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, sinEmojisEn(v)])) as T
  return valor
}
