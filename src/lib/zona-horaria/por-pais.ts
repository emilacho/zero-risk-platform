/**
 * ZONA HORARIA DEL CLIENTE · r74 · F5 · sale de lo que el cliente declara y, si no, del país de su ficha (tabla de DATOS, como la de moneda y la del trato). Sin dato NO se asume UTC en silencio: se declara.
 * Agnóstico: la lógica no sabe de ningún cliente. Los países con VARIAS zonas (o con una sola zona que no representa a todo el país) NO están en la tabla: para ellos hay que declarar la zona en la ficha.
 */
export type OrigenDeZona = 'declarada' | 'por_pais' | 'sin_dato'

// DATO · país (en minúsculas y sin tildes) → zona IANA de su capital/zona principal. Se amplía sin tocar la lógica.
export const ZONA_POR_PAIS: Record<string, string> = {
  ecuador: 'America/Guayaquil', colombia: 'America/Bogota', peru: 'America/Lima', bolivia: 'America/La_Paz', venezuela: 'America/Caracas',
  paraguay: 'America/Asuncion', uruguay: 'America/Montevideo', panama: 'America/Panama', 'costa rica': 'America/Costa_Rica', guatemala: 'America/Guatemala',
  'el salvador': 'America/El_Salvador', honduras: 'America/Tegucigalpa', nicaragua: 'America/Managua', 'republica dominicana': 'America/Santo_Domingo',
  cuba: 'America/Havana', 'puerto rico': 'America/Puerto_Rico', jamaica: 'America/Jamaica',
  argentina: 'America/Argentina/Buenos_Aires', chile: 'America/Santiago', mexico: 'America/Mexico_City', // México: la de su mayoría; un cliente de otra zona la declara en su ficha
  espana: 'Europe/Madrid', portugal: 'Europe/Lisbon', francia: 'Europe/Paris', alemania: 'Europe/Berlin', italia: 'Europe/Rome', 'reino unido': 'Europe/London',
  irlanda: 'Europe/Dublin', 'paises bajos': 'Europe/Amsterdam', belgica: 'Europe/Brussels', suiza: 'Europe/Zurich', austria: 'Europe/Vienna',
}
const CODIGO_PAIS: Record<string, string> = { ar: 'argentina', cl: 'chile', mx: 'mexico', ec: 'ecuador', co: 'colombia', pe: 'peru', bo: 'bolivia', ve: 'venezuela', py: 'paraguay', uy: 'uruguay', pa: 'panama', cr: 'costa rica', gt: 'guatemala', sv: 'el salvador', hn: 'honduras', ni: 'nicaragua', do: 'republica dominicana', cu: 'cuba', pr: 'puerto rico', es: 'espana', pt: 'portugal', fr: 'francia', de: 'alemania', it: 'italia', gb: 'reino unido', uk: 'reino unido', ie: 'irlanda', nl: 'paises bajos', be: 'belgica', ch: 'suiza', at: 'austria' }
const ALIAS: Record<string, string> = { spain: 'espana', dominicana: 'republica dominicana', 'rep dominicana': 'republica dominicana', 'united kingdom': 'reino unido', germany: 'alemania', france: 'francia', italy: 'italia' }

export const paisNormal = (s: unknown): string => {
  const t = String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return CODIGO_PAIS[t] ?? ALIAS[t] ?? t
}

/** ¿es un nombre de zona IANA que el sistema reconoce? (`Intl` es la autoridad; no se inventa una zona) */
export function zonaValida(z: unknown): z is string {
  if (typeof z !== 'string' || !z.includes('/')) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true } catch { return false }
}

/** la zona del cliente: la declarada en su ficha (`config.timezone`) > la de su país > sin dato */
export function zonaDelCliente(ficha: { timezone?: unknown; country?: unknown }): { zona: string | null; origen: OrigenDeZona } {
  if (zonaValida(ficha.timezone)) return { zona: ficha.timezone, origen: 'declarada' }
  const p = paisNormal(ficha.country)
  const z = Object.prototype.hasOwnProperty.call(ZONA_POR_PAIS, p) ? ZONA_POR_PAIS[p] : null
  return z ? { zona: z, origen: 'por_pais' } : { zona: null, origen: 'sin_dato' }
}
