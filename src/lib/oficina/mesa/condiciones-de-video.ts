/**
 * T8 (31-oct · video sobre la hoja) · las condiciones del directorio que la mesa de VIDEO calcula SOLA al abrir, a partir del brief que escribió la hoja
 * (`### <fila> · <Red> · <formato>`): quién más se sienta depende de la red y del formato, no de nadie que lo decida a mano.
 *   · `si_instagram`       → la pieza se publica en Instagram (el curador de Instagram cuida la coherencia del perfil);
 *   · `si_tiktok_o_reels`  → el formato es un reel o la red es TikTok (el estratega de TikTok/Reels aporta el formato nativo). Un short de YouTube o un video largo NO lo convocan.
 * Puro: sin base ni red. Las condiciones de la pieza por su texto (`si_personas`) las calcula `condicionesDeLaPieza` (T6, CC#2); aquí solo las del video.
 */
export const SI_INSTAGRAM = 'si_instagram'
export const SI_TIKTOK_O_REELS = 'si_tiktok_o_reels'

const limpio = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function condicionesDelVideo(brief: { red: string; formato: string }): string[] {
  const red = limpio(brief.red)
  const formato = limpio(brief.formato)
  const out: string[] = []
  if (/\binstagram\b|^ig$/.test(red)) out.push(SI_INSTAGRAM)
  if (/\breels?\b/.test(formato) || /\btiktok\b/.test(red) || /\btiktok\b/.test(formato)) out.push(SI_TIKTOK_O_REELS)
  return out
}
