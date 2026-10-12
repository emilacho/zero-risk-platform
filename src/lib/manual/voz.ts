/**
 * ¿La «transcripción» de un video es VOZ de verdad? (ronda 76 · CC#3: «Bam bam bilam bam bam bam» y «Butuhong.» contaban como «se leyó lo que dicen».)
 * Los actores transcriben todo el audio: si no hay voz, sale la letra de la música, onomatopeyas o ruido. Eso no es «lo que dice el negocio» y no debe entrar al manual como si lo fuera.
 * Criterio conservador (ante la duda, NO es voz): muy corta, mayormente sílabas/onomatopeyas, o casi una sola palabra repetida; sin etiquetas de música ([Music], ♪).
 * LÍMITE DECLARADO: una canción con letra real («35 grados de calor normalmente…») pasa por voz; distinguir canto de habla necesita el audio, no el texto.
 * PURO. La misma regla va copiada, palabra por palabra, en el nodo `transform-sections` del Servicio de Apify (la prueba compara las dos).
 */
export const MIN_PALABRAS_DE_VOZ = 4
const ONOMATOPEYA = /^(b+a*m+|ba+m*|bu+m+|bi+|bu+|la+|na+|da+|do+|doo+|oh+|ah+|eh+|uh+|mm+|hm+|yeah|ye+|ha+|hey|oo+|woo+|sh+|pam|rum|cha+)$/

export function esVozReal(texto: unknown): { voz: boolean; motivo: string } {
  const crudo = typeof texto === 'string' ? texto : ''
  const limpio = crudo.replace(/\[[^\]]{0,40}\]|\([^)]{0,40}\)|[♪♫♬]/g, ' ')
  if (/\[(music|musica|música|applause|aplausos|noise|ruido)\]/i.test(crudo) && limpio.replace(/[^\p{L}]/gu, '').length < 20) return { voz: false, motivo: 'solo etiqueta de música o ruido' }
  const palabras = (limpio.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-zñü]+/g) ?? [])
  if (palabras.length < MIN_PALABRAS_DE_VOZ) return { voz: false, motivo: `muy corta (${palabras.length} palabras)` }
  const onomatopeyas = palabras.filter((p) => ONOMATOPEYA.test(p)).length
  if (onomatopeyas / palabras.length > 0.4) return { voz: false, motivo: 'mayormente sílabas u onomatopeyas' }
  const distintas = new Set(palabras).size
  if (distintas / palabras.length < 0.4) return { voz: false, motivo: 'casi una sola palabra repetida' }
  return { voz: true, motivo: 'texto de voz' }
}
