/**
 * SEDES, CANAL Y FUENTES POR SEDE · PURO · agnóstico (restaurante de 2 sedes, clínica de 3 consultorios, empresa B2B con 2 bodegas, cliente de 1 sede).
 * Nada de esto nombra a un cliente: todo es DATO en `clients.config.apify` (y en la ficha de cada sede).
 *
 *  1. CANAL de cada sede: `local` (atiende en sitio) · `solo_entrega` (cocina oculta / despacho) · `ambos` · `sin_local` (online / B2B).
 *     Lo llena el alta o el dueño (`config.apify.canal_por_sede[<clave>]`, o el campo `tipo_de_atencion` de la ficha de la sede); si falta se DEDUCE y se rotula «deducido».
 *  2. FUENTE → SEDE: cada fuente (sitio web, tienda del punto de venta, ficha de Mapas, cuenta de redes, app de reparto) se asigna a UNA sede, a varias o a todas
 *     (`config.apify.fuentes_por_sede`). Sin asignación = «todas las sedes». Un cliente de UNA sede no necesita nada: todo es de esa sede (y nada cambia respecto de antes).
 *  3. Una ficha de precio o de carta lleva la sede de su fuente y NUNCA reemplaza a la de otra sede: el «vigente» se busca dentro de la misma sede.
 *     Precios distintos entre sedes no son una contradicción.
 */
import { normalizar } from '../manual/texto'
import { slugDe } from './brazos/tipos'

export type CanalDeLaSede = 'local' | 'solo_entrega' | 'ambos' | 'sin_local'
export const CANALES: readonly CanalDeLaSede[] = ['local', 'solo_entrega', 'ambos', 'sin_local']
/** los tipos de fuente que se pueden asignar a una sede (el vocabulario del dato; el cliente elige cuáles usa) */
export type TipoDeFuente = 'sitio_web' | 'punto_de_venta' | 'ficha_de_mapas' | 'redes' | 'reparto'
export const TIPOS_DE_FUENTE: readonly TipoDeFuente[] = ['sitio_web', 'punto_de_venta', 'ficha_de_mapas', 'redes', 'reparto']
/** palabras que significan «todas las sedes» en una asignación */
const TODAS = new Set(['todas', 'todos', 'all', '*'])

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

// ── 1 · canal ──────────────────────────────────────────────────────────────────────────────────────
export interface CanalResuelto {
  canal: CanalDeLaSede
  /** `dato` = lo dijo el alta o el dueño; `deducido` = se dedujo con lo que había (y se rotula así) */
  origen: 'dato' | 'deducido'
  /** de dónde salió, para quien lo lea */
  por: string
}
/** interpreta el texto libre del campo `tipo_de_atencion` de la ficha de una sede; `null` si no dice nada reconocible */
export function canalDeTexto(t: string): CanalDeLaSede | null {
  const crudo = t.trim().toLowerCase()
  // la palabra de la lista cerrada, tal cual («sin_local»); el texto libre «sin local» sigue significando cocina sin local = solo entrega (así lo leía la ficha de la sede)
  if ((CANALES as readonly string[]).includes(crudo)) return crudo as CanalDeLaSede
  const n = normalizar(t)
  if (!n) return null
  const entrega = /(solo|solamente|unicamente|exclusivamente)\s+(a\s+)?(domicilio|entrega|delivery|reparto|envio)|dark kitchen|cocina (oculta|fantasma|virtual)|solo delivery|delivery only|sin local/.test(n)
  const sitio = /\b(local|restaurante|tienda|oficina|consultorio|sucursal|sala|salon|atencion en sitio|en sitio)\b/.test(n)
  const envio = /\b(domicilio|entrega|delivery|reparto|envio|despacho)\b/.test(n)
  if (/\b(online|en linea|b2b|virtual|remoto|sin local fisico|sin sede fisica)\b/.test(n) && !sitio) return 'sin_local'
  if (entrega) return 'solo_entrega'
  if (sitio && envio) return 'ambos'
  if (/\bambos\b/.test(n)) return 'ambos'
  if (sitio) return 'local'
  return null
}
export interface EntradaDeCanal {
  clave: string
  config: unknown
  /** `client_sede_datos` de ESA sede */
  datos: Array<{ campo: string; valor_texto: string | null; observado_en?: string | null }>
  /** el rubro compite por cercanía (algún radio no nulo): `false` ⇒ sin local por deducción (software, finanzas, apps…) */
  rubroCompitePorCercania: boolean
}
export function canalDeLaSede(e: EntradaDeCanal): CanalResuelto {
  const cfg = obj(obj(obj(e.config).apify).canal_por_sede)
  const dado = canalDeTexto(txt(cfg[e.clave]))
  if (dado) return { canal: dado, origen: 'dato', por: 'config.apify.canal_por_sede' }
  const filas = e.datos.filter((d) => d.campo === 'tipo_de_atencion' && txt(d.valor_texto)).sort((a, b) => (txt(b.observado_en) < txt(a.observado_en) ? -1 : txt(b.observado_en) > txt(a.observado_en) ? 1 : 0))
  for (const f of filas) { const c = canalDeTexto(txt(f.valor_texto)); if (c) return { canal: c, origen: 'dato', por: 'ficha de la sede · tipo_de_atencion' } }
  return e.rubroCompitePorCercania
    ? { canal: 'local', origen: 'deducido', por: 'sin dato del canal: se asume atención en local' }
    : { canal: 'sin_local', origen: 'deducido', por: 'el rubro no compite por cercanía: se asume sin local' }
}

// ── 2 · fuente → sede ──────────────────────────────────────────────────────────────────────────────
export interface AlcanceDeFuente {
  /** claves de las sedes a las que pertenece la fuente; `null` = todas las sedes (sin asignación, «todas», o un cliente de una sola sede) */
  sedes: string[] | null
  /** por qué: la asignación leída o la razón de que sea «todas» */
  motivo: string
  /** asignaciones que no corresponden a ninguna sede del cliente (se DECLARAN; la fuente queda en «todas» para no perderla) */
  declarado: string[]
}
function aClaves(v: unknown): string[] | 'todas' | null {
  if (typeof v === 'string') { const t = v.trim(); if (!t) return null; return TODAS.has(normalizar(t)) ? 'todas' : [t] }
  if (Array.isArray(v)) {
    const l = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
    if (!l.length) return null
    return l.some((x) => TODAS.has(normalizar(x))) ? 'todas' : l
  }
  return null
}
/**
 * ¿de qué sede(s) es esta fuente? `detalle` afina dentro del tipo (la tienda del punto de venta, la cuenta de la red, el dominio del reparto).
 *  `fuentes_por_sede[<tipo>]` puede ser una clave, una lista o «todas»; o un objeto `{ <detalle>: <clave|lista|todas> }`.
 */
export function sedesDeLaFuente(config: unknown, tipo: TipoDeFuente, detalle: string | null, clavesDeSedes: string[]): AlcanceDeFuente {
  if (clavesDeSedes.length < 2) return { sedes: null, motivo: 'el cliente tiene una sola sede (o ninguna): todo es de esa sede', declarado: [] }
  const asign = obj(obj(obj(config).apify).fuentes_por_sede)[tipo]
  if (asign === undefined || asign === null) return { sedes: null, motivo: 'sin asignación: todas las sedes', declarado: [] }
  let valor: unknown = asign
  if (asign && typeof asign === 'object' && !Array.isArray(asign)) {
    const m = obj(asign)
    const d = detalle ? normalizar(detalle) : ''
    const util = (x: string) => !!normalizar(x) && x !== '*' && !TODAS.has(normalizar(x))
    // el nombre EXACTO manda; si no hay, el más largo de los que se contienen («Tienda Norte» no cae en «Tienda»)
    const k = Object.keys(m).find((x) => d && util(x) && normalizar(x) === d)
      ?? Object.keys(m).filter((x) => d && util(x) && (d.includes(normalizar(x)) || normalizar(x).includes(d))).sort((a, b) => normalizar(b).length - normalizar(a).length)[0]
    valor = k !== undefined ? m[k] : m['*'] ?? m.todas
    if (valor === undefined) return { sedes: null, motivo: `sin asignación para «${detalle ?? ''}»: todas las sedes`, declarado: [] }
  }
  const c = aClaves(valor)
  if (c === null) return { sedes: null, motivo: 'asignación vacía: todas las sedes', declarado: [] }
  if (c === 'todas') return { sedes: null, motivo: 'asignada a todas las sedes', declarado: [] }
  const norm = new Map(clavesDeSedes.map((k) => [normalizar(k), k]))
  const buenas = [...new Set(c.map((x) => norm.get(normalizar(x))).filter((x): x is string => !!x))]
  const malas = c.filter((x) => !norm.has(normalizar(x)))
  const declarado = malas.map((x) => `fuentes_por_sede · ${tipo}${detalle ? ` · ${detalle}` : ''}: «${x}» no es una sede del cliente`)
  if (!buenas.length) return { sedes: null, motivo: 'la asignación no coincide con ninguna sede: todas las sedes', declarado }
  return { sedes: buenas.sort(), motivo: `asignada a ${buenas.join(', ')}`, declarado }
}

/** qué tipo de fuente de sede es una unidad del portero (`fuente` y `ref` de la unidad); `null` = no pertenece a una sede (terceros: artículos, menciones…) */
export function tipoDeFuenteDeUnidad(u: { fuente: string; ref?: string | null; unidad_ref?: string | null }): { tipo: TipoDeFuente; detalle: string | null } | null {
  switch (u.fuente) {
    case 'sitio': return { tipo: 'sitio_web', detalle: null }
    case 'reparto': return { tipo: 'reparto', detalle: hostDe(String(u.ref ?? '')) || null }
    case 'mapas': return { tipo: 'ficha_de_mapas', detalle: null }
    case 'resenas': return String(u.ref ?? '') === 'mapas' ? { tipo: 'ficha_de_mapas', detalle: null } : null
    case 'metrica': return String(u.ref ?? '') === 'mapas' ? { tipo: 'ficha_de_mapas', detalle: null } : { tipo: 'redes', detalle: String(u.ref ?? '').replace(/^@/, '') || null }
    case 'instagram': case 'publicaciones_facebook': case 'videos': case 'comentarios': return { tipo: 'redes', detalle: String(u.ref ?? '').replace(/^@/, '') || null }
    default: return null
  }
}
function hostDe(u: string): string { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

// ── 3 · la sede de una ficha ───────────────────────────────────────────────────────────────────────
/** la clave con la que se compara «lo vigente»: la sede (o las sedes, ordenadas) o '' = todas las sedes */
export const claveDeAlcance = (sedes: string[] | null | undefined): string => (sedes && sedes.length ? [...sedes].sort().join(',') : '')
/** la sede(s) que lleva una ficha ya archivada (`provenance_tag.datos.sedes` o `.sede`) */
export function sedesDeFicha(provenance_tag: unknown): string[] | null {
  const d = obj(obj(provenance_tag).datos)
  if (Array.isArray(d.sedes)) { const l = d.sedes.filter((x): x is string => typeof x === 'string' && !!x); if (l.length) return l }
  const s = txt(d.sede)
  return s ? [s] : null
}
/** lo que se agrega a `provenance_tag.datos` de una ficha con sede */
export const datosDeSede = (sedes: string[] | null | undefined): Record<string, unknown> => (sedes && sedes.length ? { sede: sedes[0], sedes: [...sedes].sort(), sede_asignada_por: 'fuente' } : {})
/** el sufijo de un `ref` con sede (una misma línea en dos sedes son dos fichas, no una repetida) */
export const sufijoDeRef = (sedes: string[] | null | undefined): string => (sedes && sedes.length ? `:s:${sedes.map((s) => slugDe(s)).sort().join('+')}` : '')

/**
 * P6 · lo que el alta (u otra pieza) puede mandar sobre el canal de cada sede: `config.apify.canal_por_sede = { "<clave de la sede>": "local" | "solo_entrega" | "ambos" | "sin_local" }`.
 * Esta función dice qué está mal en lo recibido (clave que no es una sede, canal que no es de la lista) y qué sedes quedan SIN dato (se deducen y se rotulan «deducido»). Pura.
 */
export function revisarCanalPorSede(config: unknown, clavesDeSedes: string[]): { errores: string[]; sin_dato: string[] } {
  const cfg = obj(obj(obj(config).apify).canal_por_sede)
  const errores: string[] = []
  for (const [k, v] of Object.entries(cfg)) {
    if (!clavesDeSedes.includes(k)) errores.push(`canal_por_sede: «${k}» no es una sede del cliente (${clavesDeSedes.join(', ') || 'no tiene sedes'})`)
    if (!(CANALES as readonly string[]).includes(String(v))) errores.push(`canal_por_sede.${k}: «${String(v)}» no es un canal (${CANALES.join(', ')})`)
  }
  return { errores, sin_dato: clavesDeSedes.filter((k) => !(CANALES as readonly string[]).includes(String(cfg[k]))) }
}
