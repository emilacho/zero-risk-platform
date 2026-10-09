/**
 * LOS 3 CONTROLES de «ninguna regla se confía al modelo» para las imágenes (Emilio, 09-oct; diseño sala 1 §16.4 y salas 2-3-4 §1.3). Todo PURO: el modelo propone y describe; el CÓDIGO decide.
 *  ① formato de la salida → salida.ts
 *  ② lo que el brief obliga o prohíbe: `chequearPrompts` corre sobre CADA prompt ANTES de generar la imagen (un prompt que no cubre un obligatorio, o nombra un prohibido, no se genera);
 *  ③ la imagen contra el brief: el curador SOLO describe; `decideImagen` decide por código; si falla se regenera (≤ 2 veces, lo manda el motor); si sigue fallando se descarta esa versión.
 * Más: `citasExisten` (una regla extraída de un brief de texto debe traer una cita que EXISTA en el brief) y `datosAjenos` (teléfono, @ o enlace que no son del cliente).
 */
import { aparicionesDe, contienePalabra, datosDeContacto, digitosDeTelefono, normalizar } from './texto'

export interface ReglaDeImagen { id: string; texto: string; claves?: string[]; cita?: string }
export interface ReglasDeImagen { obligatorio: ReglaDeImagen[]; prohibido: ReglaDeImagen[] }
export interface PropiosDelCliente { telefonos: string[]; handles: string[]; urls: string[]; marcas_ajenas: string[] }

const clavesDe = (r: ReglaDeImagen): string[] => (r.claves && r.claves.length ? r.claves : [r.texto])

// ── ② prompts ──────────────────────────────────────────────────────────────────────
/** parámetros del generador (`--ar 4:5`, `--v 6`) y relaciones de aspecto: el tamaño lo fija la sala */
const RE_PARAMETRO = /(^|\s)--[a-z]{1,12}\b/i
const RE_ASPECTO = /\b\d{1,2}\s?:\s?\d{1,2}\b/
/** «al estilo de X», «in the style of X», «by X» con un nombre propio detrás: nombra a un fotógrafo, artista o persona real */
const RE_NOMBRA_AUTOR = /\b(?:al estilo de|en el estilo de|estilo de|inspirad[oa] en|in the style of|style of|by)\s+[A-ZÁÉÍÓÚÑ][\p{L}'’-]+/u

export interface FalloDePrompt { indice: number; motivos: string[] }
export interface ResultadoDeChequearPrompts { pasan: number[]; fallan: FalloDePrompt[]; ninguno: boolean }

export function chequearPrompts(prompts: string[], reglas: ReglasDeImagen, propios: Pick<PropiosDelCliente, 'marcas_ajenas'>): ResultadoDeChequearPrompts {
  const pasan: number[] = []
  const fallan: FalloDePrompt[] = []
  prompts.forEach((p, i) => {
    const motivos: string[] = []
    for (const r of reglas.obligatorio) {
      if (!clavesDe(r).some((c) => contienePalabra(p, c))) motivos.push(`no cubre el obligatorio «${r.id}» (${r.texto})`)
    }
    for (const r of reglas.prohibido) {
      const nombrado = clavesDe(r).some((c) => aparicionesDe(p, c).some((a) => !a.negada))
      if (nombrado) motivos.push(`nombra el prohibido «${r.id}» (${r.texto}) sin negarlo`)
    }
    for (const m of propios.marcas_ajenas) if (m && contienePalabra(p, m)) motivos.push(`nombra una marca ajena («${m}»)`)
    if (RE_PARAMETRO.test(p)) motivos.push('trae parámetros del generador (--xx): el tamaño y los parámetros los fija la sala')
    if (RE_ASPECTO.test(p)) motivos.push('escribe una relación de aspecto: el tamaño lo fija la sala')
    if (RE_NOMBRA_AUTOR.test(p)) motivos.push('nombra un estilo «de» una persona real (fotógrafo, artista)')
    if (motivos.length) fallan.push({ indice: i, motivos }); else pasan.push(i)
  })
  return { pasan, fallan, ninguno: pasan.length === 0 }
}

// ── ③ la imagen contra el brief ────────────────────────────────────────────────────
export interface ObservacionDeImagen {
  indice: number
  reglas: Array<{ id: string; presente: boolean | 'no_se_ve'; evidencia?: string }>
  texto_en_imagen: string[]
  marcas: string[]
  personas: number
  producto?: string
  elementos_visibles?: string[]
}
export interface FallaDeImagen { codigo: 'obligatorio_ausente' | 'prohibido_presente' | 'regla_omitida' | 'dato_ajeno' | 'marca_ajena'; detalle: string }

/** dominio sin protocolo, sin www y sin ruta */
const dominioDe = (u: string): string => normalizar(u).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '')

/** teléfono, @ o enlace en un texto que NO son del cliente */
export function datosAjenos(textos: string[], propios: Pick<PropiosDelCliente, 'telefonos' | 'handles' | 'urls'>): string[] {
  const d = datosDeContacto(textos.join(' \n '))
  const tel = new Set(propios.telefonos.map(digitosDeTelefono))
  const han = new Set(propios.handles.map((h) => normalizar(h.startsWith('@') ? h : `@${h}`)))
  const dom = propios.urls.map(dominioDe)
  const fuera: string[] = []
  for (const t of d.telefonos) if (!tel.has(t)) fuera.push(`teléfono ${t}`)
  for (const h of d.handles) if (!han.has(h)) fuera.push(`usuario ${h}`)
  for (const u of d.urls) {
    const base = dominioDe(u)
    if (!dom.some((x) => x && (base === x || base.endsWith(`.${x}`)))) fuera.push(`enlace ${u}`)
  }
  return fuera
}

/** ¿pasa UNA imagen observada? El código decide; la observación solo describe. Una regla que el curador omitió cuenta como falla (no se supone). */
export function decideImagen(obs: ObservacionDeImagen, reglas: ReglasDeImagen, propios: PropiosDelCliente): { pasa: boolean; fallas: FallaDeImagen[] } {
  const fallas: FallaDeImagen[] = []
  const por = new Map(obs.reglas.map((r) => [r.id, r.presente] as const))
  for (const r of reglas.obligatorio) {
    const v = por.get(r.id)
    if (v === undefined) fallas.push({ codigo: 'regla_omitida', detalle: `el curador no se pronunció sobre el obligatorio «${r.id}»` })
    else if (v !== true) fallas.push({ codigo: 'obligatorio_ausente', detalle: `falta el obligatorio «${r.id}» (${r.texto})` })
  }
  for (const r of reglas.prohibido) {
    const v = por.get(r.id)
    if (v === undefined) fallas.push({ codigo: 'regla_omitida', detalle: `el curador no se pronunció sobre el prohibido «${r.id}»` })
    else if (v === true) fallas.push({ codigo: 'prohibido_presente', detalle: `aparece el prohibido «${r.id}» (${r.texto})` })
  }
  for (const a of datosAjenos(obs.texto_en_imagen, propios)) fallas.push({ codigo: 'dato_ajeno', detalle: `texto visible con ${a} que no es del cliente` })
  for (const m of obs.marcas) {
    if (m.trim() && propios.marcas_ajenas.some((x) => x && normalizar(m).includes(normalizar(x)))) fallas.push({ codigo: 'marca_ajena', detalle: `marca ajena visible («${m}»)` })
  }
  return { pasa: fallas.length === 0, fallas }
}

export interface Veredicto {
  /** índices de imagen que pasan */
  pasan: number[]
  porImagen: Array<{ indice: number; pasa: boolean; fallas: FallaDeImagen[] }>
  /** hay que regenerar: ninguna pasa, se puede (el motor lleva la cuenta de vueltas) */
  regenerar: boolean
}
/** `puedeRegenerar` lo calcula la sala (modo generada y vueltas restantes); el motor corta en el máximo de la plantilla. */
export function veredictoDeImagenes(observaciones: ObservacionDeImagen[], reglas: ReglasDeImagen, propios: PropiosDelCliente, puedeRegenerar: boolean): Veredicto {
  const porImagen = observaciones.map((o) => ({ indice: o.indice, ...decideImagen(o, reglas, propios) }))
  const pasan = porImagen.filter((x) => x.pasa).map((x) => x.indice)
  return { pasan, porImagen, regenerar: pasan.length === 0 && puedeRegenerar }
}

/** de las versiones que pasan, la de mejor preferencia del curador; si ninguna, null (la pieza sigue sin imagen y se declara) */
export function elegirVersion(pasan: number[], preferencia: number[]): number | null {
  if (!pasan.length) return null
  for (const i of preferencia) if (pasan.includes(i)) return i
  return pasan[0]
}

// ── citas literales (briefs de texto) ───────────────────────────────────────────────
const comparable = (s: string) => normalizar(s).replace(/[^a-z0-9ñ]+/g, ' ').trim()
/** una regla extraída de un brief de texto debe traer la cita literal y esa cita debe EXISTIR en el brief. Devuelve las reglas válidas y las rechazadas con el motivo. */
export function citasExisten(reglas: ReglasDeImagen, textoDelBrief: string): { validas: ReglasDeImagen; rechazadas: Array<{ id: string; motivo: string }> } {
  const base = comparable(textoDelBrief)
  const rechazadas: Array<{ id: string; motivo: string }> = []
  const filtra = (rs: ReglaDeImagen[]) => rs.filter((r) => {
    if (!r.cita || !comparable(r.cita)) { rechazadas.push({ id: r.id, motivo: 'sin cita literal del brief' }); return false }
    if (!base.includes(comparable(r.cita))) { rechazadas.push({ id: r.id, motivo: `la cita no está en el brief: «${r.cita.slice(0, 60)}»` }); return false }
    return true
  })
  return { validas: { obligatorio: filtra(reglas.obligatorio), prohibido: filtra(reglas.prohibido) }, rechazadas }
}

/** campos que la SALA (no el agente) deriva de la decisión del curador */
export function derivarDecision(modo: 'real' | 'generada' | 'ninguna', confianzaDeLaFoto?: string | null): { modo: typeof modo; hay_generadas: boolean; requiere_mirar: boolean } {
  return { modo, hay_generadas: modo === 'generada', requiere_mirar: modo === 'generada' || (modo === 'real' && confianzaDeLaFoto !== 'alta') }
}
