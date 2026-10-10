/** Utilidades de texto compartidas por los chequeos de la oficina (puras). */

/** minúsculas, sin tildes, espacios colapsados */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** palabras (letras y dígitos) ya normalizadas */
export function palabras(s: string): string[] {
  return normalizar(s).split(/[^a-z0-9ñ@#+]+/).filter(Boolean)
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** ¿aparece `clave` como palabra (o frase) completa en `texto`? Sin tildes ni mayúsculas; tolera el plural simple («foto» ↔ «fotos»). */
export function contienePalabra(texto: string, clave: string): boolean {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9ñ@#+]+/g, ' ')} `
  const c = normalizar(clave).replace(/[^a-z0-9ñ@#+]+/g, ' ').trim()
  if (!c) return false
  return new RegExp(`(^|\\s)${escapar(c)}(s|es)?(?=\\s)`).test(t)
}

const NEGADORES = ['sin', 'no', 'ni', 'nunca', 'evita', 'evitar', 'excluye', 'without', 'avoid', 'nada']

/** apariciones de `clave` en `texto`: [{negada}] — negada = alguno de los 3 tokens anteriores es un negador («sin personas», «ni logos», «nada de texto») */
export function aparicionesDe(texto: string, clave: string): Array<{ negada: boolean }> {
  const toks = normalizar(texto).replace(/[^a-z0-9ñ@#+]+/g, ' ').trim().split(' ').filter(Boolean)
  const cl = normalizar(clave).replace(/[^a-z0-9ñ@#+]+/g, ' ').trim().split(' ').filter(Boolean)
  if (!cl.length) return []
  const sale: Array<{ negada: boolean }> = []
  for (let i = 0; i + cl.length <= toks.length; i++) {
    let ok = true
    for (let j = 0; j < cl.length; j++) {
      const t = toks[i + j], c = cl[j]
      if (!(t === c || t === c + 's' || t === c + 'es' || (j === cl.length - 1 && c.endsWith('s') && t === c.slice(0, -1)))) { ok = false; break }
    }
    if (!ok) continue
    const antes = toks.slice(Math.max(0, i - 3), i)
    sale.push({ negada: antes.some((a) => NEGADORES.includes(a)) })
  }
  return sale
}

/** solo dígitos de un teléfono, sin prefijo de país 593 ni 0 inicial (para comparar «0997 744 288» con «+593 997 744 288») */
export function digitosDeTelefono(s: string): string {
  let d = s.replace(/\D/g, '')
  if (d.startsWith('593')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d
}

const RE_TELEFONO = /\+?\d[\d\s().-]{6,}\d|\d{1,3}(?:,\d{3}){2,}/g
const RE_HANDLE = /@[\p{L}0-9_.]{2,}/gu
const RE_URL = /\b(?:https?:\/\/|www\.)[^\s)]+/gi

/** una fecha («2026-10-09», «09/10/2026»), un rango («10-11-12») o una cifra con separador de miles («1.250.000») NO es un teléfono (condición C1 de CC#1). Estrecha a propósito (CC#3): un rango son 3 grupos, no 5 («09-91-23-45-67» es un teléfono), y una cifra con miles no empieza en 0 («099.123.456» es un teléfono) */
export function esFechaORangoOCifra(t: string): boolean {
  const s = t.trim()
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s) || /^\d{1,2}(?:\s?[-–]\s?\d{1,2}){2}$/.test(s) || /^[1-9]\d{0,2}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(s)
}

/** ¿«AAAA-MM-DD» es un día que EXISTE? (el 31 de febrero o el mes 13 no se corrigen solos: se rechazan, condición CC#3 #469 H2) */
export function esFechaReal(f: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return mo >= 1 && mo <= 12 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** ¿«HH:MM» es una hora que EXISTE? (00:00 a 23:59) */
export function esHoraReal(h: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(h)
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59
}

export interface DatosDeContacto { telefonos: string[]; handles: string[]; urls: string[] }
export function datosDeContacto(texto: string): DatosDeContacto {
  return {
    telefonos: (texto.match(RE_TELEFONO) ?? []).filter((t) => !esFechaORangoOCifra(t)).map((t) => digitosDeTelefono(t)).filter((d) => d.length >= 7),
    handles: (texto.match(RE_HANDLE) ?? []).map((h) => normalizar(h)),
    urls: (texto.match(RE_URL) ?? []).map((u) => normalizar(u)),
  }
}
