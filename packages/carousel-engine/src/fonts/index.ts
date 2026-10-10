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

// ── Brand font resolver (fontsource via jsDelivr) ──────────────────────
/** Family name → fontsource slug ("Alfa Slab One" → "alfa-slab-one"). */
export function slugDeFuente(family: string): string {
  return family.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const urlDeFuente = (slug: string, weight: FontWeight) =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${weight}-normal.ttf`

export interface ResolverOpciones {
  /** inject for tests (default: global fetch) */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
  /** extra tries after the first failure (default 1) */
  reintentos?: number
}

async function bajar(url: string, o: ResolverOpciones): Promise<ArrayBuffer | null> {
  const f = o.fetchImpl ?? ((u: string) => fetch(u))
  for (let i = 0; i <= (o.reintentos ?? 1); i++) {
    try {
      const r = await f(url)
      if (r.ok) return await r.arrayBuffer()
      if (r.status === 404) return null // that weight does not exist: retrying changes nothing
    } catch {
      /* network blip: try again */
    }
  }
  return null
}

/**
 * Load a brand family (regular 400 + bold 700 when they exist) and cache it. Returns the weights found,
 * or [] when the family could not be loaded (the caller reports it; it is never silent).
 */
export async function resolverFamilia(family: string, o: ResolverOpciones = {}): Promise<FontEntry[]> {
  const slug = slugDeFuente(family)
  if (!slug) return []
  const encontrados: FontEntry[] = []
  for (const weight of [400, 700] as FontWeight[]) {
    const k = cacheKey(family, weight, 'normal')
    const previo = FONT_CACHE.get(k)
    if (previo) {
      encontrados.push(previo)
      continue
    }
    const data = await bajar(urlDeFuente(slug, weight), o)
    if (!data) continue
    const entry: FontEntry = { name: family, data, weight, style: 'normal' }
    FONT_CACHE.set(k, entry)
    encontrados.push(entry)
  }
  return encontrados
}

export interface InformeDeFuentes {
  fonts: FontEntry[]
  /** brand families drawn with their own font (Inter always included) */
  usadas: string[]
  /** brand families that could not be loaded: drawn with Inter, and reported */
  faltantes: string[]
}

/** Which brand families the loaded `fonts` really cover. Pure. */
export function informeDeFuentes(familias: string[], fonts: FontEntry[]): { usadas: string[]; faltantes: string[] } {
  const cargadas = new Set(fonts.map((f) => f.name))
  const unicas = Array.from(new Set(familias.map((f) => f.trim()).filter(Boolean)))
  return {
    usadas: Array.from(new Set(['Inter', ...unicas.filter((f) => cargadas.has(f))])),
    faltantes: unicas.filter((f) => !cargadas.has(f)),
  }
}

/** Inter + every non-Inter brand family that can be found. */
export async function cargarFuentesDeMarca(familias: string[], o: ResolverOpciones = {}): Promise<InformeDeFuentes> {
  const fonts = [...(await loadDefaultFonts())]
  for (const fam of Array.from(new Set(familias.map((f) => f.trim()).filter((f) => f && f !== 'Inter')))) {
    fonts.push(...(await resolverFamilia(fam, o)))
  }
  return { fonts, ...informeDeFuentes(familias, fonts) }
}
