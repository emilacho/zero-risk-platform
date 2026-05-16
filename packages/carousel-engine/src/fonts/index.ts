/**
 * Font loader · provides TTF/OTF buffers to satori.
 *
 * Satori cannot read system fonts · it needs ArrayBuffer data per family
 * + weight. We fetch Inter from a CDN once per cold start and cache the
 * results in a module-scoped Map.
 *
 * The CDN URL is configurable via `CAROUSEL_FONT_INTER_REGULAR_URL` /
 * `_BOLD_URL` env vars so tests / offline envs can point at a local file.
 *
 * If your dashboard host needs a different font family, call
 * `registerFont({ name, weight, style, data })` before invoking
 * `renderSlide`.
 */

export type FontWeight = 400 | 500 | 600 | 700
export type FontStyle = 'normal' | 'italic'

export interface FontEntry {
  name: string
  data: ArrayBuffer
  weight: FontWeight
  style: FontStyle
}

const FONT_CACHE = new Map<string, FontEntry>()
const cacheKey = (name: string, weight: FontWeight, style: FontStyle) =>
  `${name}::${weight}::${style}`

export function registerFont(entry: FontEntry): void {
  FONT_CACHE.set(cacheKey(entry.name, entry.weight, entry.style), entry)
}

export function getRegisteredFonts(): FontEntry[] {
  return Array.from(FONT_CACHE.values())
}

export function clearFontCache(): void {
  FONT_CACHE.clear()
}

// Default Inter URLs · stable jsdelivr-hosted GoogleFonts mirror.
// Inter is widely-used, MIT, and renders well in satori.
const DEFAULT_INTER_REGULAR =
  process.env.CAROUSEL_FONT_INTER_REGULAR_URL ||
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
const DEFAULT_INTER_BOLD =
  process.env.CAROUSEL_FONT_INTER_BOLD_URL ||
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf'

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`font fetch ${url} → ${res.status}`)
  return await res.arrayBuffer()
}

/**
 * Lazy-load Inter regular + bold · returns the array satori expects.
 * Cached after first call. Throws if the CDN is unreachable.
 */
export async function loadDefaultFonts(): Promise<FontEntry[]> {
  const regKey = cacheKey('Inter', 400, 'normal')
  const boldKey = cacheKey('Inter', 700, 'normal')
  if (!FONT_CACHE.has(regKey)) {
    const data = await fetchAsArrayBuffer(DEFAULT_INTER_REGULAR)
    FONT_CACHE.set(regKey, { name: 'Inter', data, weight: 400, style: 'normal' })
  }
  if (!FONT_CACHE.has(boldKey)) {
    const data = await fetchAsArrayBuffer(DEFAULT_INTER_BOLD)
    FONT_CACHE.set(boldKey, { name: 'Inter', data, weight: 700, style: 'normal' })
  }
  return [FONT_CACHE.get(regKey)!, FONT_CACHE.get(boldKey)!]
}
