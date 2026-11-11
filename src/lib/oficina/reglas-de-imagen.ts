/**
 * LOS 3 CONTROLES de «ninguna regla se confía al modelo» para las imágenes (Emilio, 09-oct; diseño sala 1 §16.4 y salas 2-3-4 §1.3). Todo PURO: el modelo propone y describe; el CÓDIGO decide.
 *  ① formato de la salida → salida.ts
 *  ② lo que el brief obliga o prohíbe: `chequearPrompts` corre sobre CADA prompt ANTES de generar la imagen (un prompt que nombra un prohibido, una marca ajena o parámetros del generador no se genera);
 *     11-nov · #12 del barrido de reglas rígidas (GO Lenovo 18:50): que el prompt NO REPITA la palabra de un obligatorio, que escriba algo con forma de proporción («10:30») o «estilo de <Nombre>»
 *     ya NO descartan: pasan como AVISO y lo juzga quien mira la imagen (el curador responde regla por regla en ③; una regla omitida sigue contando como falla).
 *  ③ la imagen contra el brief: el curador SOLO describe; `decideImagen` decide por código; si falla se regenera (≤ 2 veces, lo manda el motor); si sigue fallando se descarta esa versión.
 * Más: `citasExisten` (una regla extraída de un brief de texto debe traer una cita que EXISTA en el brief) y `datosAjenos` (teléfono, @ o enlace que no son del cliente).
 */
import { aparicionesDe, contienePalabra, datosDeContacto, esTelefonoDeLaLista, normalizar } from './texto'
import { motivosDeInvencion, type ReglasDeInvencion } from './prompts-sin-invencion'

export interface ReglaDeImagen { id: string; texto: string; claves?: string[]; cita?: string; /** una palabra declarada: se avisa, no descarta el prompt */ solo_aviso?: boolean }
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
export interface ResultadoDeChequearPrompts { pasan: number[]; fallan: FalloDePrompt[]; ninguno: boolean; avisos: string[] }

/** `invencion` (opcional, apagada por omisión): lo que una imagen generada sin foto no puede pedir ni copiar → prompts-sin-invencion.ts */
export function chequearPrompts(prompts: string[], reglas: ReglasDeImagen, propios: Pick<PropiosDelCliente, 'marcas_ajenas'>, invencion?: ReglasDeInvencion | null): ResultadoDeChequearPrompts {
  const pasan: number[] = []
  const fallan: FalloDePrompt[] = []
  const avisos = new Set<string>()
  prompts.forEach((p, i) => {
    const motivos: string[] = []
    // #12 · la palabra no decide: un obligatorio que el prompt no repite es un aviso; si la imagen lo cumple lo dice quien la mira (③)
    for (const r of reglas.obligatorio) {
      if (!clavesDe(r).some((c) => contienePalabra(p, c))) avisos.add(`el prompt ${i + 1} no repite el obligatorio «${r.id}» (${r.texto}): lo juzga quien mira la imagen`)
    }
    for (const r of reglas.prohibido) {
      const nombrado = clavesDe(r).some((c) => aparicionesDe(p, c).some((a) => !a.negada))
      if (nombrado && r.solo_aviso) avisos.add(`un prompt nombra ${r.texto}: revisa si corresponde`)
      else if (nombrado) motivos.push(`nombra el prohibido «${r.id}» (${r.texto}) sin negarlo`)
    }
    for (const m of propios.marcas_ajenas) if (m && contienePalabra(p, m)) motivos.push(`nombra una marca ajena («${m}»)`)
    if (RE_PARAMETRO.test(p)) motivos.push('trae parámetros del generador (--xx): el tamaño y los parámetros los fija la sala')
    if (RE_ASPECTO.test(p)) avisos.add(`el prompt ${i + 1} escribe algo con forma de proporción («${RE_ASPECTO.exec(p)?.[0] ?? ''}»): el tamaño lo fija la sala; si es una hora u otra cosa, no importa`)
    if (RE_NOMBRA_AUTOR.test(p)) avisos.add(`el prompt ${i + 1} dice «${RE_NOMBRA_AUTOR.exec(p)?.[0] ?? ''}»: si nombra a una persona real (fotógrafo, artista), cámbialo por palabras propias; lo juzga quien mira la imagen`)
    if (invencion) motivos.push(...motivosDeInvencion(p, invencion))
    if (motivos.length) fallan.push({ indice: i, motivos }); else pasan.push(i)
  })
  return { pasan, fallan, ninguno: pasan.length === 0, avisos: [...avisos] }
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
  /** #13 · 11-nov · ¿la imagen muestra un dato que nadie verificó (precio, cifra, sello, certificación, etiqueta, norma, lectura de un instrumento)? lo juzga quien mira; el código solo lee el sí o no */
  dato_sin_verificar?: boolean
}
export interface FallaDeImagen { codigo: 'obligatorio_ausente' | 'prohibido_presente' | 'regla_omitida' | 'dato_ajeno' | 'marca_ajena' | 'dato_sin_verificar'; detalle: string }
/** #13 · lo que se le exige a quien mira · `exigirDato`: la imagen se GENERÓ sin foto (no puede inventar datos), así que tiene que decir sí o no; sin respuesta, la imagen NO pasa (nunca aprobada por omisión) */
/** `esGenerada` (🟡 CC7 §2): a una FOTO REAL del cliente NO se le exige: su sello, su etiqueta o su pizarra de precios son datos VERDADEROS del cliente, no inventados. Sin `esGenerada`, se exige a todas */
export interface ExigenciasDeLaMirada { exigirDato?: boolean; esGenerada?: (indice: number) => boolean }

/** dominio sin protocolo, sin www y sin ruta */
const dominioDe = (u: string): string => normalizar(u).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '')

/** teléfono, @ o enlace en un texto que NO son del cliente */
export function datosAjenos(textos: string[], propios: Pick<PropiosDelCliente, 'telefonos' | 'handles' | 'urls'>): string[] {
  const d = datosDeContacto(textos.join(' \n '))
  const han = new Set(propios.handles.map((h) => normalizar(h.startsWith('@') ? h : `@${h}`)))
  const dom = propios.urls.map(dominioDe)
  const fuera: string[] = []
  for (const t of d.telefonos) if (!esTelefonoDeLaLista(t, propios.telefonos)) fuera.push(`teléfono ${t}`)
  for (const h of d.handles) if (!han.has(h)) fuera.push(`usuario ${h}`)
  for (const u of d.urls) {
    const base = dominioDe(u)
    if (!dom.some((x) => x && (base === x || base.endsWith(`.${x}`)))) fuera.push(`enlace ${u}`)
  }
  return fuera
}

/** ¿pasa UNA imagen observada? El código decide; la observación solo describe. Una regla que el curador omitió cuenta como falla (no se supone). */
export function decideImagen(obs: ObservacionDeImagen, reglas: ReglasDeImagen, propios: PropiosDelCliente, exige: ExigenciasDeLaMirada = {}): { pasa: boolean; fallas: FallaDeImagen[] } {
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
  if (exige.exigirDato) {
    if (obs.dato_sin_verificar === true) fallas.push({ codigo: 'dato_sin_verificar', detalle: 'quien mira la imagen dice que muestra un dato que nadie verificó (precio, cifra, sello, certificación, etiqueta o lectura)' })
    else if (obs.dato_sin_verificar !== false) fallas.push({ codigo: 'regla_omitida', detalle: 'quien mira la imagen no dijo si muestra un dato que nadie verificó: no se aprueba por omisión' })
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
export function veredictoDeImagenes(observaciones: ObservacionDeImagen[], reglas: ReglasDeImagen, propios: PropiosDelCliente, puedeRegenerar: boolean, exige: ExigenciasDeLaMirada = {}): Veredicto {
  const porImagen = observaciones.map((o) => ({ indice: o.indice, ...decideImagen(o, reglas, propios, { exigirDato: exige.exigirDato === true && (exige.esGenerada ? exige.esGenerada(o.indice) : true) }) }))
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
