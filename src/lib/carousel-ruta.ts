/**
 * Pure helpers of POST /api/carousel/generate (kept out of route.ts: a Next route file may only export handlers).
 *  · `subcarpeta`: optional sub-path under `{slug}/carousels/{date}/`; lets two carousels of the same client on the same day
 *    live side by side (without it the second one overwrote the first: upsert on `slide-{n}.png`).
 *  · slide extras: `background_image_url`, `pie`, `ocultar_indicador`.
 */

/** 1–4 segments of `[a-z0-9][a-z0-9_-]{0,63}`, no empty segment, no `.`/`..`, no leading/trailing slash */
const SEGMENTO = /^[a-z0-9][a-z0-9_-]{0,63}$/i

export function validarSubcarpeta(v: unknown): { ok: true; valor: string | undefined } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, valor: undefined }
  if (typeof v !== 'string') return { ok: false, error: 'subcarpeta must be a string' }
  const segs = v.split('/')
  if (segs.length > 4 || !segs.every((s) => SEGMENTO.test(s))) {
    return { ok: false, error: 'subcarpeta must be 1–4 segments of /^[a-z0-9][a-z0-9_-]{0,63}$/i joined by "/" (no "..", no empty segment)' }
  }
  return { ok: true, valor: v }
}

/** Storage path of one slide. Without `subcarpeta` it is the path the route has always used. */
export function rutaDeLamina(slug: string, date: string, subcarpeta: string | undefined, n: number): string {
  return `${slug}/carousels/${date}${subcarpeta ? `/${subcarpeta}` : ''}/slide-${n}.png`
}

/** https URL or an inline image: the renderer fetches whatever it is given, so nothing else gets in */
export function fotoDeFondoValida(u: unknown): boolean {
  if (typeof u !== 'string') return false
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u)) return true
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

export function validarExtrasDeLamina(slide: Record<string, unknown>, i: number): string | null {
  const f = slide.background_image_url
  if (f !== undefined && f !== null && !fotoDeFondoValida(f)) return `slides[${i}].background_image_url must be an https URL or a data:image/(png|jpeg|webp);base64 URI`
  const p = slide.pie
  if (p !== undefined && p !== null && typeof p !== 'string') return `slides[${i}].pie must be a string or null`
  const o = slide.ocultar_indicador
  if (o !== undefined && typeof o !== 'boolean') return `slides[${i}].ocultar_indicador must be a boolean`
  return null
}

/** Bucket de la web del cliente (dueño CC#4): lo que la ruta ha usado siempre. */
export const BUCKET_DE_LA_WEB = 'client-websites'

/**
 * Frontera: con `subcarpeta` (llamadas de la oficina) el bucket es `OFICINA_BUCKET`, SIN valor por omisión: si falta,
 * error ANTES de renderizar o subir. Sin `subcarpeta` la ruta es exactamente la de siempre.
 */
export function bucketDeLaRuta(subcarpeta: string | undefined, env: { OFICINA_BUCKET?: string }): { ok: true; bucket: string } | { ok: false; error: string } {
  if (!subcarpeta) return { ok: true, bucket: BUCKET_DE_LA_WEB }
  const b = env.OFICINA_BUCKET?.trim()
  return b ? { ok: true, bucket: b } : { ok: false, error: 'oficina_bucket_not_configured' }
}
