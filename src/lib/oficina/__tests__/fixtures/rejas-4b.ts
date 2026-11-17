/**
 * 17-nov · GO Lenovo «quitar rejas» · tramo 4b de CC3 (A·11, coach del video, C6 delivery, C7, 9:16 fijo, C8) en identidades.
 * Los cambios EXACTOS, como pares [antes, después], por archivo de identidad del repositorio (o por fila viva cuando no hay archivo).
 * La sección de herramientas de video de editor_en_jefe (C7) se corta entera: su «antes» es la sección completa (ver CABECERA_C7 y NUEVO_C7).
 */
import path from 'node:path'

export const CABECERA_C7 = '## Video AI tool selection (canonical · 2026-05-18)'
export const NUEVO_C7 = "## Video\n\nWhich video generator and model produce a piece is data of the office (its video arm and the template), not yours. If a brief asks for something the office's generator cannot do (length, lip-sync, audio), say so in your review.\n"

export const CAMBIOS_4B: Record<string, [string, string][]> = {
  // A·11 · en el repo el archivo se llama sales-enablement.md, pero su texto es el del Outbound Strategist (fila viva `sales_outbound_strategist`)
  'sales-enablement.md': [
    ['- 3-5 words, lowercase, looks like an internal email\n', "- Short, reads like an internal email (length and capitalization: the brand manual's style; starting point: 3-5 words, lowercase)\n"],
    ['- Never clickbait, never ALL CAPS, never emoji\n', '- No clickbait (suggestion). Capitals and emoji: as the brand manual sets them\n'],
  ],
  'video-editor.md': [
    ['(today Seedance through the office arm)', '(which generator and model is data of the office)'],
    ['3. **Vertical aspect ratio · 9:16 hardcoded** para TikTok/Reels (1080×1920). Otros aspect ratios solo si platforms_requested explícitamente incluye `instagram-feed` (1:1) o `twitter-card` (16:9).', '3. **Proporción · dato del pedido** · la dan el brief y la tabla de formatos de cada red (supuesto de partida: 9:16 para TikTok/Reels, 1:1 para `instagram-feed`, 16:9 para `twitter-card`).'],
  ],
  'delivery-coordinator.md': [
    ["secondary 'Descubrí más' in same viewport", "secondary 'Descubre más' in same viewport"],
    ["make primary CTA 'Agendá tu diagnóstico'", "make primary CTA 'Agenda tu diagnóstico'"],
  ],
  'design-visual-storyteller.md': [
    ['- Every visual story must have clear narrative structure (beginning, middle, end)', '- Give every visual story a clear narrative structure (beginning, middle, end is a starting point; the brand manual and the brief rule)'],
  ],
  'whimsy-injector.md': [
    ['- Every playful element must serve a functional or emotional purpose', '- Every playful element should serve a functional or emotional purpose (starting point; the brand manual and the brief rule)'],
  ],
  'social-media-strategist.md': [
    ['- **Hashtag Strategy**: Consistent branded and industry hashtags across platforms', "- **Hashtag Strategy**: Branded and industry hashtags as the brand manual and each platform's data set them"],
  ],
  'marketing_short_video_editing_coach.md': [
    ['vertical video subtitles go in the lower third', "vertical video subtitles usually go in the lower third (starting point; the network's safe zones and the brief rule)"],
    ['  - Font selection: For Chinese, use Source Han Sans / Alibaba PuHuiTi (free for commercial use); for titles, Zcool font series', "  - Font selection: the brand manual's typography; without it, a font free for commercial use that covers the client's language"],
    ['  - Font size guidelines: Vertical video', '  - Font size guidelines (starting point; the template and the network rule): Vertical video'],
    ['Person fills 60%+ of frame + large title text (3-8 characters) + high-contrast colors', 'Person fills 60%+ of frame + large title text (3-8 characters) + high-contrast colors (starting point; the brand manual and the brief rule)'],
    ['- Source Han Sans, Alibaba PuHuiTi, and similar free-for-commercial-use fonts are safe choices', "- fonts licensed for commercial use (the brand manual's, or free ones that cover the client's language) are safe choices"],
    ["  - Facial expressions: Thumbnail faces should be exaggerated - surprise, joy, confusion; neutral expressions don't generate clicks", '  - Facial expressions: as the brand manual and the brief set them; exaggerated expressions (surprise, joy, confusion) are one option, not a rule'],
  ],
}

/** aplica los pares (antes → después) a un texto; cada «antes» debe estar exactamente una vez */
export function aplicar4b(archivo: string, texto: string): string {
  let t = texto
  for (const [antes, despues] of CAMBIOS_4B[path.basename(archivo)] ?? []) {
    if (t.split(antes).length !== 2) throw new Error(`${archivo}: «${antes.slice(0, 50)}» no está exactamente una vez`)
    t = t.replace(antes, () => despues)
  }
  if (path.basename(archivo) === 'editor_en_jefe.md') {
    const i = t.indexOf(CABECERA_C7)
    if (i < 0) throw new Error('editor_en_jefe: sin la sección de herramientas de video')
    t = t.slice(0, i) + NUEVO_C7
  }
  return t
}

/** el texto de antes del tramo 4b: deshace SOLO sus pares (no aplica a editor_en_jefe, cuyo corte no se deshace) */
export function antesDe4b(archivo: string, hoy: string): string {
  let t = hoy
  for (const [antes, despues] of [...(CAMBIOS_4B[path.basename(archivo)] ?? [])].reverse()) {
    if (t.split(despues).length !== 2) throw new Error(`${archivo}: «${despues.slice(0, 50)}» no está exactamente una vez`)
    t = t.replace(despues, () => antes)
  }
  return t
}
