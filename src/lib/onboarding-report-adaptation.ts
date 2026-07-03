/**
 * Onboarding report · LLM few-shot ADAPTATION (Emilio 2026-07-03).
 *
 * Upgrade over the deterministic `deriveBullets`: PER-SLIDE model calls (the
 * spec's "~6 llamadas cortas") convert each content field → { headline
 * (takeaway), bullets[] (complete phrases · not truncated) }, at the quality
 * bar of the Náufrago target in the spec (used as the few-shot example).
 *
 * Per-slide (not one big prompt) on purpose: a single prompt with all fields
 * blew past run-sdk's 8000-char task limit (postmortem bug #250). Each content
 * slide's field is short enough on its own.
 *
 * OPERATIONAL (postmortem #248 · checkpoint collision): each per-slide run-sdk
 * call MUST use a UNIQUE workflow_id (e.g. `slides-adapt-<kind>`) + force_restart
 * · else the checkpoint cache returns the first slide's answer for all of them.
 *
 * The model calls run as run-sdk nodes in n8n (endpoint stays $0). Flow:
 * endpoint returns the deterministic model + `adaptation_tasks` (one short
 * prompt per content slide) → n8n loops run-sdk → collects {n,headline,bullets}
 * → POSTs `adapted_slides` back → `applyAdaptation` overlays them (keeps notes
 * + kind). Cover + next_steps are fixed (not adapted).
 */
import type { ReportModel, Slide, SlideKind } from './onboarding-report'

export interface AdaptedSlide {
  readonly n: number
  readonly headline: string
  readonly bullets: string[]
}

export interface AdaptationTask {
  readonly n: number
  readonly kind: SlideKind
  readonly prompt: string
}

/** Content slides adapted by the LLM · cover + next_steps stay fixed. */
export const ADAPTABLE_KINDS: readonly SlideKind[] = [
  'positioning',
  'icp',
  'competitive',
  'voice',
  'emotional_angle',
]

const FEWSHOT = `EJEMPLOS (target de calidad · formato):
CAMPO positioning → {"headline":"El único especialista en encebollado de Olón","bullets":["Categoría sin dueño digital: ningún competidor directo reclama encebollado","Posición defendible: encebollado y pescado fresco frente al mar","Riesgo #1: confusión con El Náufrago de Gualaceo roba búsquedas","Acción: marca nominal consistente — Náufrago Olón / naufrago.ec"]}
CAMPO icp → {"headline":"4 perfiles, un rechazo común a la trampa turística","bullets":["Viajero extranjero: quiere autenticidad documentable, barrera de idioma","Turista ecuatoriano nostálgico: precio = señal de autenticidad","Expatriado en Olón: quiere spot local fijo, valora consistencia"]}`

/** Build ONE short adaptation prompt for a content slide (≪8000 chars). */
export function buildSlideAdaptationPrompt(slide: Slide, clientName: string): string {
  return [
    `Sos diseñador de presentaciones ejecutivas. Convertí este campo del brand book de "${clientName}" en UNA lámina.`,
    'REGLAS:',
    '- headline = la CONCLUSIÓN/takeaway (no el nombre del campo) · ≤10 palabras.',
    '- bullets = 3 a 6 · cada una una idea COMPLETA (nunca cortada a media oración) · ≤14 palabras.',
    '- Español · no inventar datos · solo reformular lo que está en el texto.',
    '',
    FEWSHOT,
    '',
    `CAMPO (${slide.kind}):`,
    slide.notes,
    '',
    'Devolvé SOLO JSON válido, sin prosa: {"headline":"...","bullets":["...","..."]}',
  ].join('\n')
}

/** One short prompt per content slide (skips cover/next_steps · fixed). */
export function buildAdaptationTasks(model: ReportModel): AdaptationTask[] {
  return model.slides
    .filter((s) => ADAPTABLE_KINDS.includes(s.kind) && s.notes.trim().length > 0)
    .map((s) => ({ n: s.n, kind: s.kind, prompt: buildSlideAdaptationPrompt(s, model.client_name) }))
}

/** Extract a JSON object from an LLM response (tolerates ```json fences). */
function extractJson(raw: string): unknown {
  let text = (raw ?? '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  else {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first >= 0 && last > first) text = text.slice(first, last + 1)
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Parse one slide's LLM output → {headline, bullets} (null if malformed). */
export function parseSlideAdaptation(raw: string): { headline: string; bullets: string[] } | null {
  const o = extractJson(raw) as { headline?: unknown; bullets?: unknown } | null
  if (!o || typeof o.headline !== 'string' || !Array.isArray(o.bullets)) return null
  const bullets = o.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.trim())
  if (bullets.length === 0) return null
  return { headline: o.headline.trim(), bullets }
}

/**
 * Overlay LLM-adapted headline/bullets onto the deterministic model. Keeps
 * each slide's `kind` + `notes` (speaker notes). Slides not present in
 * `adapted` (or with empty bullets) keep the deterministic version (safe).
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
