/**
 * EL EMBUDO EN TODO LO DE AFUERA · 01-nov (firma de Emilio «así con todo»).
 * Todo lo que el cerebro entrega de fuera (fotos, videos, sitios, lo más gustado, tendencias) lleva su NIVEL y sale en este orden:
 *   propio (lo del cliente, primero) → global → país → competencia → directa; y dentro de cada nivel, de lo más gustado a lo menos.
 * Los niveles global/país/competencia/directa vienen de la tendencia que trajo la pieza; lo que no pasó por una tendencia se rotula por quién lo publicó:
 *   · de un competidor nombrado → «directa»;  · de una referencia sin tendencia (la biblioteca de anuncios, el rubro de la zona) → «competencia»;  · del cliente → «propio».
 * Sin cifra de gusto (una foto suelta, un sitio) el orden dentro del nivel es el que traía (lo más nuevo primero): no se inventa un «gusto».
 */
export const ORDEN_DEL_EMBUDO: Record<string, number> = { propio: -1, global: 0, mundo: 0, pais: 1, competencia: 2, directa: 3 }
export type NivelDeAfuera = 'propio' | 'global' | 'pais' | 'competencia' | 'directa' | 'mundo'

const NIVELES_DE_TENDENCIA = new Set(['global', 'pais', 'competencia', 'directa', 'mundo'])

/** foto o video por quién lo publicó (`propia` | `competencia` | `referencia`); la tendencia que lo trajo, si la hay, manda */
export function nivelDeOrigen(origen: string, nivelDeTendencia?: string | null): NivelDeAfuera {
  if (origen === 'propia' || origen === 'propio') return 'propio'
  if (nivelDeTendencia && NIVELES_DE_TENDENCIA.has(nivelDeTendencia)) return nivelDeTendencia as NivelDeAfuera
  return origen === 'competencia' || origen === 'competidor' ? 'directa' : 'competencia'
}

/** una ficha por su alcance: del cliente → propio · de un competidor → directa · del mercado (rubro y zona) → competencia · del país o sus ciudades (búsquedas, eventos) → país · sin alcance → propio */
export function nivelDeFicha(alcance: unknown): NivelDeAfuera {
  if (alcance === 'competidor') return 'directa'
  if (alcance === 'mercado') return 'competencia'
  if (alcance === 'pais') return 'pais'
  return 'propio'
}

/** de lo más gustado a lo menos: me gusta, si no, vistas; sin cifra = null (queda al final de su nivel) */
export function gustoDe(m: Record<string, unknown> | null | undefined): number | null {
  if (!m) return null
  for (const k of ['me_gusta', 'likes', 'likesCount', 'vistas', 'views', 'videoPlayCount', 'videoViewCount']) { const v = m[k]; if (typeof v === 'number' && Number.isFinite(v)) return v }
  return null
}

/** orden estable: nivel del embudo y, dentro, más gustado primero; empate o sin cifra = el orden que traía */
export function ordenarPorEmbudo<T>(items: T[], de: (t: T) => { nivel: string; gusto: number | null }): T[] {
  return items.map((t, i) => ({ t, i, ...de(t) })).sort((a, b) => (ORDEN_DEL_EMBUDO[a.nivel] ?? 9) - (ORDEN_DEL_EMBUDO[b.nivel] ?? 9) || (b.gusto ?? -1) - (a.gusto ?? -1) || a.i - b.i).map((x) => x.t)
}
