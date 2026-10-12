/**
 * MONEDA DEL CLIENTE · r75 · H5 · sale de la ficha (o del manual) y, si nadie la declaró, del país de la ficha (tabla de DATOS, declarada como omisión). Sin dato no se asume una.
 * Es la misma tabla y la misma regla que el flujo de planeación (`plan-primer-nivel.js` · `monedaDelCliente`): una prueba exige que coincidan.
 * Agnóstico: la lógica no sabe de ningún cliente.
 */
export const MONEDA_POR_PAIS: Record<string, string> = { ecuador: 'USD', panama: 'USD', 'el salvador': 'USD', 'estados unidos': 'USD', mexico: 'MXN', colombia: 'COP', peru: 'PEN', argentina: 'ARS', chile: 'CLP', uruguay: 'UYU', bolivia: 'BOB', paraguay: 'PYG', brasil: 'BRL', guatemala: 'GTQ', 'costa rica': 'CRC', 'republica dominicana': 'DOP', espana: 'EUR', francia: 'EUR', alemania: 'EUR', italia: 'EUR', portugal: 'EUR', 'reino unido': 'GBP', canada: 'CAD' }
export const CODIGOS_DE_MONEDA = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'COP', 'PEN', 'ARS', 'CLP', 'UYU', 'BOB', 'PYG', 'BRL', 'GTQ', 'CRC', 'DOP', 'PAB'] as const

const sinTil = (s: unknown): string => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

export function codigoDeMoneda(v: unknown): string | null {
  const t = String(v ?? '').trim().toUpperCase()
  if ((CODIGOS_DE_MONEDA as readonly string[]).includes(t)) return t
  const n = sinTil(v)
  if (/dolar/.test(n)) return 'USD'
  if (/\beuro/.test(n)) return 'EUR'
  return null
}

export interface MonedaResuelta { codigo: string | null; fuente: string }
export function monedaDelCliente(ficha: { country?: unknown; config?: unknown; currency?: unknown; moneda?: unknown } | null | undefined, manual?: { currency?: unknown; moneda?: unknown } | null): MonedaResuelta {
  const f = ficha ?? {}, m = manual ?? {}
  const c = f.config && typeof f.config === 'object' ? (f.config as Record<string, unknown>) : {}
  const declarada = [c.currency, c.moneda, f.currency, f.moneda, m.currency, m.moneda].map(codigoDeMoneda).find(Boolean)
  if (declarada) return { codigo: declarada, fuente: 'declarada en la ficha o el manual' }
  const porPais = MONEDA_POR_PAIS[sinTil(f.country)]
  if (porPais) return { codigo: porPais, fuente: 'por omisión del país de la ficha (nadie la declaró)' }
  return { codigo: null, fuente: 'sin dato' }
}

// ───────────────────────── importes dentro de un texto
export interface Importe { valor: number; moneda: string | null; ambigua: boolean; crudo: string }
const SIMBOLOS: Array<[RegExp, string | 'ambigua']> = [[/^US\$|^USD/i, 'USD'], [/^€|^EUR/i, 'EUR'], [/^£|^GBP/i, 'GBP'], [/^S\//i, 'PEN'], [/^R\$|^BRL/i, 'BRL'], [/^COP/i, 'COP'], [/^MXN/i, 'MXN'], [/^PEN/i, 'PEN'], [/^ARS/i, 'ARS'], [/^CLP/i, 'CLP'], [/^UYU/i, 'UYU'], [/^CAD|^C\$/i, 'CAD'], [/^d[oó]lar/i, 'USD'], [/^sol/i, 'PEN'], [/^peso/i, 'ambigua'], [/^\$/, 'ambigua']]

/** «45.000» → 45000 · «1,250.50» → 1250.5 · «12,50» → 12.5 · «3.5» → 3.5 (un solo separador seguido de exactamente 3 dígitos es de miles) */
export function numeroDeImporte(s: string): number {
  let t = s.replace(/\s/g, '')
  const p = t.lastIndexOf('.'), c = t.lastIndexOf(',')
  if (p >= 0 && c >= 0) { const dec = p > c ? '.' : ','; t = dec === '.' ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.') }
  else if (p >= 0 || c >= 0) {
    const sep = p >= 0 ? '.' : ','
    const partes = t.split(sep)
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3 && partes[0].length >= 1 && partes[0].length <= 3)) t = partes.join('')
    else t = partes.join('.')
  }
  return Number(t)
}

/** los importes con marca de moneda («$ 4», «US$ 4,50», «S/ 30», «€12», «COP 45.000», «45.000 COP»); un «$» solo es AMBIGUO (peso o dólar: lo decide la moneda del cliente) */
export function importesEnTexto(texto: string): Importe[] {
  const out: Importe[] = []
  const NUM = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?'
  const pre = new RegExp(`(US\\$|R\\$|C\\$|S\\/|\\$|€|£|USD|EUR|GBP|COP|MXN|PEN|ARS|CLP|UYU|CAD|BRL)\\s?(${NUM})`, 'gi')
  const post = new RegExp(`(${NUM})\\s?(USD|EUR|GBP|COP|MXN|PEN|ARS|CLP|UYU|CAD|BRL|€|£|d[oó]lares?|euros?|sol(?:es)?|pesos?)(?![A-Za-zÁÉÍÓÚáéíóúñ])`, 'gi')
  const vistos = new Set<number>()
  let m: RegExpExecArray | null
  while ((m = pre.exec(texto)) !== null) { const [, s, n] = m; const mo = SIMBOLOS.find(([re]) => re.test(s))![1]; vistos.add(m.index); out.push({ valor: numeroDeImporte(n), moneda: mo === 'ambigua' ? null : mo, ambigua: mo === 'ambigua', crudo: m[0] }) }
  while ((m = post.exec(texto)) !== null) { const [, n, s] = m; const mo = SIMBOLOS.find(([re]) => re.test(s))![1]; out.push({ valor: numeroDeImporte(n), moneda: mo === 'ambigua' ? null : mo, ambigua: mo === 'ambigua', crudo: m[0] }) }
  return out.filter((x) => Number.isFinite(x.valor))
}
