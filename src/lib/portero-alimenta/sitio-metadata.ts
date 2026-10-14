/**
 * CEGUERA DEL MENÚ (medido 14-oct): la home de un sitio hecho con JavaScript devuelve 144 caracteres de `text`; la carta, los precios, el horario y la
 * dirección viven en `metadata.jsonLd`/`openGraph`. Aquí se leen como LÍNEAS comparables («producto · precio»). PURO, agnóstico (esquema schema.org).
 * Los precios llegan como número + moneda sin «$»: se escribe «precio 4.00 usd» para que el clasificador los vea como precio.
 */
import { normalizar } from '../manual/texto'

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '')
const MAX_NODOS = 400

function recorrer(n: unknown, f: (o: Record<string, unknown>) => void, cuenta = { n: 0 }): void {
  if (cuenta.n++ > MAX_NODOS) return
  if (Array.isArray(n)) { for (const x of n) recorrer(x, f, cuenta); return }
  if (!obj(n)) return
  f(n)
  for (const v of Object.values(n)) if (typeof v === 'object' && v !== null) recorrer(v, f, cuenta)
}
const tipos = (o: Record<string, unknown>): string[] => (Array.isArray(o['@type']) ? (o['@type'] as unknown[]) : [o['@type']]).map(txt).filter(Boolean)

export function lineasDeMetadata(metadata: unknown): string[] {
  const m = obj(metadata) ? metadata : {}
  const out: string[] = []
  const poner = (s: string) => { const n = normalizar(s); if (n.length >= 9) out.push(n) }
  const desc = txt(m.description)
  if (desc) poner(`descripcion ${desc}`)
  if (Array.isArray(m.openGraph)) for (const p of m.openGraph) if (obj(p) && txt(p.property) === 'og:description' && txt(p.content)) poner(`descripcion ${txt(p.content)}`)
  recorrer(m.jsonLd, (o) => {
    const t = tipos(o)
    if (t.includes('MenuItem') || t.includes('Product') || t.includes('Service')) {
      const nombre = txt(o.name)
      const of = obj(o.offers) ? o.offers : Array.isArray(o.offers) && obj(o.offers[0]) ? (o.offers[0] as Record<string, unknown>) : null
      const precio = of ? txt(of.price) : ''
      const mon = of ? txt(of.priceCurrency) : ''
      if (nombre && precio) poner(`producto ${nombre} precio ${precio} ${mon}`)
      else if (nombre) poner(`producto ${nombre}`)
    }
    if (t.includes('OpeningHoursSpecification')) {
      const dias = (Array.isArray(o.dayOfWeek) ? o.dayOfWeek : [o.dayOfWeek]).map((d) => txt(d).replace(/^.*\//, '')).filter(Boolean).sort().join(' ')
      if (dias && (txt(o.opens) || txt(o.closes))) poner(`horario ${dias} de ${txt(o.opens)} a ${txt(o.closes)}`)
    }
    if (t.includes('PostalAddress')) poner(`direccion ${[txt(o.streetAddress), txt(o.addressLocality), txt(o.addressRegion)].filter(Boolean).join(' ')}`)
    if (txt(o.telephone) && (t.includes('Restaurant') || t.includes('LocalBusiness') || t.includes('Organization'))) poner(`telefono ${txt(o.telephone)}`)
  })
  return [...new Set(out)]
}
