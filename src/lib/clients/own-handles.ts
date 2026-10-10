/**
 * Usuarios de las redes PROPIAS del cliente, dados por quien da de alta (el trato): se guardan en `clients.config.apify.own_handles` ANTES de que corra la materia del manual,
 * así la biografía propia y la frase propia no dependen de que el descubridor adivine la cuenta. PURO. Lo que da una persona manda sobre lo que escribió un agente.
 */
export const REDES_PROPIAS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const
export type RedPropia = (typeof REDES_PROPIAS)[number]

export interface HandlesPropios { validos: Partial<Record<RedPropia, string>>; descartados: string[] }

/** «@usuario», «usuario», «https://www.instagram.com/usuario/» → «usuario» (sin @, sin dirección, sin barras); lo que no parece un usuario se descarta */
export function usuarioDe(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let t = v.trim()
  if (!t) return null
  t = t.replace(/^https?:\/\/(?:www\.)?[^/]+\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '')
  return /^[A-Za-z0-9._-]{1,60}$/.test(t) ? t : null
}

export function handlesPropios(entrada: unknown): HandlesPropios {
  const validos: Partial<Record<RedPropia, string>> = {}
  const descartados: string[] = []
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { validos, descartados }
  for (const [red, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (!(REDES_PROPIAS as readonly string[]).includes(red)) { descartados.push(red); continue }
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) continue
    const u = usuarioDe(v)
    if (u) validos[red as RedPropia] = u; else descartados.push(`${red}: ${String(v).slice(0, 60)}`)
  }
  return { validos, descartados }
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** devuelve la config con `apify.own_handles` puesto (lo dado manda; las demás cuentas ya guardadas se conservan) y TODO lo demás igual */
export function fusionarHandlesPropios(config: unknown, validos: Partial<Record<RedPropia, string>>): Record<string, unknown> {
  const c = obj(config), ap = obj(c.apify)
  return { ...c, apify: { ...ap, own_handles: { ...obj(ap.own_handles), ...validos } } }
}
