/**
 * EL PAÍS Y LA ZONA HORARIA SON DEL CLIENTE, NO DE LA AGENCIA · DATO por país, no lógica por cliente.
 *
 * Ninguna ruta puede fijar un país o una zona «por omisión»: se leen de la ficha del cliente (`clients.country`, `config.timezone`).
 * Esta tabla solo traduce (nombre del país → código de 2 letras) y da la zona de los países que tienen UNA sola; los países con varias
 * zonas (o los que no están) NO tienen zona por país: se necesita la del cliente o la de la reserva. Se amplía sin tocar la lógica.
 */
export interface DatosDePais { iso2: string; nombres: string[]; zona?: string }

export const PAISES: DatosDePais[] = [
  { iso2: 'EC', nombres: ['ecuador'], zona: 'America/Guayaquil' }, // sin Galápagos: el continente manda; la ficha puede precisar con `config.timezone`
  { iso2: 'CO', nombres: ['colombia'], zona: 'America/Bogota' },
  { iso2: 'PE', nombres: ['peru'], zona: 'America/Lima' },
  { iso2: 'BO', nombres: ['bolivia'], zona: 'America/La_Paz' },
  { iso2: 'VE', nombres: ['venezuela'], zona: 'America/Caracas' },
  { iso2: 'UY', nombres: ['uruguay'], zona: 'America/Montevideo' },
  { iso2: 'PY', nombres: ['paraguay'], zona: 'America/Asuncion' },
  { iso2: 'AR', nombres: ['argentina'], zona: 'America/Argentina/Buenos_Aires' },
  { iso2: 'CR', nombres: ['costa rica'], zona: 'America/Costa_Rica' },
  { iso2: 'PA', nombres: ['panama'], zona: 'America/Panama' },
  { iso2: 'GT', nombres: ['guatemala'], zona: 'America/Guatemala' },
  { iso2: 'SV', nombres: ['el salvador'], zona: 'America/El_Salvador' },
  { iso2: 'HN', nombres: ['honduras'], zona: 'America/Tegucigalpa' },
  { iso2: 'NI', nombres: ['nicaragua'], zona: 'America/Managua' },
  { iso2: 'CU', nombres: ['cuba'], zona: 'America/Havana' },
  { iso2: 'DO', nombres: ['republica dominicana', 'dominicana', 'rep dominicana'], zona: 'America/Santo_Domingo' },
  { iso2: 'PR', nombres: ['puerto rico'], zona: 'America/Puerto_Rico' },
  // varias zonas: se reconoce el país, pero la zona la dice la ficha o la reserva
  { iso2: 'MX', nombres: ['mexico'] },
  { iso2: 'CL', nombres: ['chile'] },
  { iso2: 'ES', nombres: ['espana', 'spain'] },
  { iso2: 'PT', nombres: ['portugal'] },
  { iso2: 'US', nombres: ['estados unidos', 'united states', 'usa', 'eeuu'] },
  { iso2: 'BR', nombres: ['brasil', 'brazil'] },
]

// misma normalización que `paisNormal` del módulo del detector de trato (única fuente de la tabla país → trato): «Ecuador.», «República Dominicana» y «ec» dan la misma clave
const sinTildes = (s: unknown): string => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** nombre del país («Ecuador») o código de 2 letras («ec») → código de 2 letras en mayúsculas; null si no se reconoce (no se adivina) */
export function codigoDePais(valor: unknown): string | null {
  const v = sinTildes(valor)
  if (!v) return null
  for (const p of PAISES) if (p.iso2.toLowerCase() === v || p.nombres.includes(v)) return p.iso2
  return null
}

/** zona horaria del país SOLO si tiene una sola; null si no (varias zonas o país desconocido) */
export function zonaDelPais(valor: unknown): string | null {
  const iso = codigoDePais(valor)
  return PAISES.find((p) => p.iso2 === iso)?.zona ?? null
}

export type OrigenDeZona = 'ficha' | 'pais_de_la_ficha' | 'reserva' | 'neutra_utc'
/**
 * La zona de una reserva: la del CLIENTE (`config.timezone` / `config.zona_horaria`, o la de su país si tiene una sola) · sin dato, la que mande la reserva ·
 * sin ninguna, UTC (neutra: no es un país). Devuelve de dónde salió para que quede dicho.
 */
export function zonaDeReserva(cliente: { country?: unknown; config?: unknown } | null | undefined, zonaDeLaReserva?: unknown): { zona: string; origen: OrigenDeZona } {
  const cfg = (cliente?.config && typeof cliente.config === 'object' ? cliente.config : {}) as Record<string, unknown>
  const fija = [cfg.timezone, cfg.zona_horaria].find((z) => typeof z === 'string' && z.trim())
  if (fija) return { zona: String(fija).trim(), origen: 'ficha' }
  const delPais = zonaDelPais(cliente?.country)
  if (delPais) return { zona: delPais, origen: 'pais_de_la_ficha' }
  if (typeof zonaDeLaReserva === 'string' && zonaDeLaReserva.trim()) return { zona: zonaDeLaReserva.trim(), origen: 'reserva' }
  return { zona: 'UTC', origen: 'neutra_utc' }
}
