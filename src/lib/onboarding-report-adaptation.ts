/**
 * Onboarding report · LLM few-shot ADAPTATION (Emilio 2026-07-03).
 *
 * Upgrade over the deterministic `deriveBullets`: a single model call (run as
 * a run-sdk node in n8n · NOT in the Vercel endpoint · endpoint stays $0)
 * converts each brand-book field → { headline (takeaway), bullets[] (complete
 * phrases · not truncated mid-sentence) }, at the quality bar of the Náufrago
 * target in the spec (used here as the few-shot example).
 *
 * Flow · endpoint returns the deterministic model (with raw field text in
 * `notes`) → n8n run-sdk node prompts with `buildAdaptationPrompt(model)` →
 * returns JSON → `applyAdaptation(model, parsed)` overrides headline/bullets
 * (keeps notes + kind) → render. The render + notes are unchanged.
 */
import type { ReportModel, Slide } from './onboarding-report'

export interface AdaptedSlide {
  readonly n: number
  readonly headline: string
  readonly bullets: string[]
}

/** The Náufrago few-shot example (spec target · S2–S7 · quality bar). */
const FEWSHOT_EXAMPLE = `EJEMPLO (target de calidad):
S2 positioning → headline: "El único especialista en encebollado de Olón"
  bullets:
    - "Categoría sin dueño digital: ningún competidor directo reclama encebollado"
    - "Posición defendible: encebollado y pescado fresco frente al mar, sin filtro turístico"
    - "Riesgo #1: confusión con El Náufrago de Gualaceo roba búsquedas orgánicas"
    - "Acción: marca nominal consistente — Náufrago Olón / naufrago.ec"
S3 icp → headline: "4 perfiles, un rechazo común a la trampa turística"
  bullets:
    - "Viajero extranjero: quiere autenticidad documentable, barrera de idioma"
    - "Turista ecuatoriano nostálgico: precio = señal de autenticidad"
    - "Expatriado en Olón: quiere spot local fijo, valora consistencia"
S7 next_steps → headline: "La agencia ya tiene todo para arrancar"
  bullets: ["Campañas de contenido", "Anuncios", "Monitoreo competitivo", "Reportes semanales"]`

/**
 * Build the adaptation prompt · feeds each slide's raw text (from `notes`) +
 * kind and asks for punchy headline + complete short bullets. Output = JSON.
 */
export function buildAdaptationPrompt(model: ReportModel): string {
  const slidesText = model.slides
    .map((s) => `--- Lámina ${s.n} (${s.kind}) ---\n${s.notes || '(sin texto · usar bullets fijos)'}`)
    .join('\n\n')
  return [
    `Sos diseñador de presentaciones ejecutivas. Convertí el brand book del cliente "${model.client_name}" en láminas ejecutivas.`,
    '',
    'REGLAS por lámina de contenido:',
    '- headline = la CONCLUSIÓN/takeaway (no el nombre del campo). Máximo ~10 palabras.',
    '- bullets = 3 a 6 · cada una una idea COMPLETA (nunca cortada a media oración) · ≤14 palabras · sin relleno.',
    '- La portada (cover) y próximos pasos (next_steps) conservan sus bullets fijos · headline = nombre cliente / "La agencia ya tiene todo para arrancar".',
    '- Español. No inventar datos: solo reformular lo que está en el texto.',
    '',
    FEWSHOT_EXAMPLE,
    '',
    'CONTENIDO A ADAPTAR:',
    slidesText,
    '',
    'Devolvé SOLO JSON válido, sin prosa, con esta forma exacta:',
    '{"slides":[{"n":1,"headline":"...","bullets":["...","..."]}, ...]} (una entrada por lámina 1..7).',
  ].join('\n')
}

/** Parse the LLM output into AdaptedSlide[] · tolerant of ```json fences. */
export function parseAdaptation(raw: string): AdaptedSlide[] {
  if (!raw) return []
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  else {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first >= 0 && last > first) text = text.slice(first, last + 1)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const slides = (parsed as { slides?: unknown }).slides
  if (!Array.isArray(slides)) return []
  const out: AdaptedSlide[] = []
  for (const s of slides) {
    const o = s as { n?: unknown; headline?: unknown; bullets?: unknown }
    if (typeof o.n === 'number' && typeof o.headline === 'string' && Array.isArray(o.bullets)) {
      out.push({
        n: o.n,
        headline: o.headline.trim(),
        bullets: o.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.trim()),
      })
    }
  }
  return out
}

/**
 * Overlay the LLM-adapted headline/bullets onto the deterministic model.
 * Keeps each slide's `kind` + `notes` (speaker notes = full original text).
 * Slides not present in `adapted` (or with empty bullets) keep the
 * deterministic version · safe fallback.
 */
export function applyAdaptation(model: ReportModel, adapted: readonly AdaptedSlide[]): ReportModel {
  const byN = new Map(adapted.map((a) => [a.n, a]))
  const slides: Slide[] = model.slides.map((s) => {
    const a = byN.get(s.n)
    if (!a || a.bullets.length === 0) return s
    return { ...s, headline: a.headline || s.headline, bullets: a.bullets }
  })
  return { ...model, slides }
}
