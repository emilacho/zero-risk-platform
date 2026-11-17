/**
 * 17-nov · GO Lenovo «quitar rejas» · tramo 4a de CC3 (A·3, A·4, A·5, A·7, A·8, A·9, A·10, C6 en identidades).
 * Los cambios EXACTOS, como pares [antes, después], por archivo de identidad. Sirven a dos cosas:
 *   · las pruebas de migraciones viejas (E1, E4) reconstruyen el texto que ellas grabaron deshaciendo SOLO estos pares;
 *   · la prueba del tramo comprueba que el .md de hoy = el de antes con estos pares y nada más.
 */
import path from 'node:path'

export const CAMBIOS_4A: Record<string, [string, string][]> = {
  'tiktok-strategist.md': [
    ['- **Generation Focus**: Primary targeting Gen Z and Gen Alpha preferences', '- **Audience Focus**: The audience is the one the plan and the brief name for this client (no fixed generation)'],
    ['- **Generation-Aware**: Speak authentically to Gen Z and Gen Alpha audiences', '- **Audience-Aware**: Speak authentically to the audience the plan and the brief name'],
    ['4. **Hashtag Strategy**: Mix of trending, niche, and branded hashtags (5-8 total)', "4. **Hashtag Strategy**: Mix of trending, niche, and branded hashtags (how many: the format table and the network's own rules decide)"],
  ],
  'inclusive-visuals-specialist.md': [
    ['export function generateInclusiveVideoPrompt(subject: string, action: string, context: string) {', '// the negatives come from the brand manual and the brief (data); the fixed list is only a suggestion when they say nothing\nexport function generateInclusiveVideoPrompt(subject: string, action: string, context: string, negativosDelManualYElBrief: string) {'],
    ['  [NEGATIVE CONSTRAINTS]: No generic "stock photo" smiles, no hyper-saturated artificial lighting, no futuristic/sci-fi tropes, no text or symbols on whiteboards, no cloned background actors. Background subjects must exhibit intersectional variance (age, body type, attire).', '  [NEGATIVE CONSTRAINTS]: ${negativosDelManualYElBrief}. Only if the brand manual and the brief say nothing, these are suggestions (the manual rules): no generic "stock photo" smiles, no hyper-saturated artificial lighting, no futuristic/sci-fi tropes, no text or symbols on whiteboards. Always (quality): no cloned background actors; background subjects vary (age, body type, attire) unless the brief says otherwise.'],
  ],
  'carousel-designer.md': [
    ['  "cta_verb_family": "agendá|reservá|escribí",', '  "cta_verb_family": "agenda|reserva|escribe",'],
    ['- `eyebrow` · short cap-style chip · max 24 chars · platform-conventional\n- `headline` · the dominant text on the slide · max 90 chars\n- `body` · supporting line · optional · max 220 chars · `null` if not needed\n- `cta` · imperative phrase · max 32 chars · `null` if this slide is not the action moment', "- `eyebrow` · short chip · `null` if the slide does not need one\n- `headline` · the dominant text on the slide\n- `body` · supporting line · optional · `null` if not needed\n- `cta` · imperative phrase · `null` if this slide is not the action moment\n\nLengths and slide count are data: the limits of the request (the office template, the format table, the brand manual). If the request sets none, the table below is only a starting reference; if a text will not fit the canvas, say so in `open_questions`."],
    ['## Per-platform constraints\n', "## Per-platform reference (starting point · the request's data rules)\n"],
    ['| `instagram-feed`  | 1080×1350 | 5-10 | 30-70 chars | 80-180 chars | Carousel · 4:5 portrait · prospect swipes · hook on slide 1 + cta on last slide · eyebrows are NUMBERED ("PARTE 01") |', '| `instagram-feed`  | 1080×1350 | 5-10 | 30-70 chars | 80-180 chars | Carousel · 4:5 portrait · prospect swipes · hook on slide 1 + cta on last slide |'],
    ['| `twitter-card`    | 1200×675  | 1    | 50-100 chars | 80-200 chars | ALWAYS 1 slide · minimal · headline-dominant · X/Twitter link-preview style |', '| `twitter-card`    | 1200×675  | 1    | 50-100 chars | 80-200 chars | Usually 1 slide · minimal · headline-dominant · X/Twitter link-preview style |'],
    ['- **CTA verb family discipline** · pick ONE CTA verb family\n  (`agendá/reservá/conversa` vs `descargá/probá/recibí`) and stick to\n  it across all platforms in the same cascade (this is what\n  style-consistency-reviewer measures downstream)\n- **Eyebrow rhythm** · numbered ("PARTE 01") for IG feed carousels ·\n  themed ("HOOK", "DATO", "CIERRE") for IG reels / TikTok ·\n  optional / minimal for FB + Twitter\n', '- **Eyebrow rhythm** · optional · numbered, themed or none: the brand\n  manual and the template decide; without them, choose what serves the piece\n'],
    ['- **NEVER mix CTA verb families across platforms.** One cascade · one\n  verb family. Pick `agendá` OR `reservá` OR `escribí` — stick with\n  the choice across IG feed + reel + TikTok + FB + Twitter.\n- **NEVER produce platform output', '- **NEVER produce platform output'],
    ['- **NEVER skip the `slide_count` narrative arc match table.** If you\n  produce a 9-slide TikTok carousel because the brief was long, that\'s\n  drift · stick to convention.\n- **NEVER write platform-specific', '- **NEVER write platform-specific'],
    ['- Twitter cards with multi-slide arrays · ALWAYS 1 slide on Twitter\n- Facebook carousels with 5+ slides · drop to 1-3 max\n', "- A slide count that ignores the request's limits (the template, the\n  format table): when the request gives none, the reference table is a\n  starting point, not a rule\n"],
    ["4. Decide CTA verb family ONCE for the whole cascade (single decision\n   across all platforms)\n", "4. Choose the CTA verbs for each platform (they may differ; the brand\n   manual and the client's register rule)\n"],
    ["   - Pick slide count from the convention table\n", "   - Pick slide count from the request's limits (template, format table);\n     without them, the reference table is a starting point\n"],
    ["- ≥ 95 % of cascades produce slide_count within the platform's\n  convention range (5-10 IG feed · 5-7 reel · 3-5 TikTok · 1-3 FB ·\n  1 Twitter)\n- Single CTA verb family per cascade (zero mixing)\n", "- ≥ 95 % of cascades produce slide_count within the request's limits\n  (template, format table)\n"],
  ],
  'content-creator.md': [
    ['**Copy rules per component type**:\n', '**Copy reference per component type** (starting point · the landing template and the brand manual rule; if they set lengths or counts, those win):\n'],
  ],
  'style-consistency-reviewer.md': [
    ["- **CTA verb family** · primary action verbs should cluster (agenda /\n  conversa / pedí / reserva — pick a family, stick to it).\n", "- **CTA verbs** · different action verbs across platforms are fine;\n  flag only verbs that contradict the brand manual or the client's\n  register (tú · vos · usted).\n"],
  ],
}

/** el texto de antes del tramo 4a: deshace SOLO sus pares (cada «después» debe estar exactamente una vez) */
export function antesDe4a(archivo: string, hoy: string): string {
  const pares = CAMBIOS_4A[path.basename(archivo)]
  if (!pares) return hoy
  let t = hoy
  for (const [antes, despues] of [...pares].reverse()) {
    if (t.split(despues).length !== 2) throw new Error(`${archivo}: «${despues.slice(0, 50)}» no está exactamente una vez`)
    t = t.replace(despues, () => antes)
  }
  return t
}
