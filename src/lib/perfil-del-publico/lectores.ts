/**
 * PERFIL DEL PÚBLICO · T2 · lo que necesitan los LECTORES (brief, gran idea, piezas, plan) · reglas PURAS, sin base ni red.
 *
 *   · `perfilDelAdjunto`: del adjunto del cliente (el mismo que arma el portero, uno vigente por tipo) saca el informe `perfil_del_publico`.
 *     Tres estados y ninguno se disfraza: `vigente` (con su texto y su corte), `sin_perfil` (todavía no se hizo) y `no_se_pudo_leer`.
 *   · `bloqueDelPerfil`: el bloque que entra al marco de un lector. CONTEXTO, NO MANDATO: el perfil es lo OBSERVADO en voces públicas,
 *     nunca dato del cliente, y una frase del público solo se usa si está en el perfil y tal cual. Sin perfil, el bloque es VACÍO
 *     (el marco queda idéntico al de antes); si no se pudo leer, se dice y se pide no atribuir frases al público.
 *   · `frasesDelPublicoSinFuente`: el chequeo. Una frase entre comillas que el texto ATRIBUYE al público («como dice la gente “…”»)
 *     y que no está textual en el perfil vigente es «frase del público sin fuente». Es AVISO, nunca bloqueo.
 *     Límite conocido (diseño T0, adenda 1): solo atrapa frases entre comillas con una señal de atribución; un modismo suelto pasa.
 */
import { normalizar } from '../manual/texto'
import { LARGO_MINIMO_DE_UNA_FRASE, TIPO_DEL_INFORME } from './perfil'

/** lo mínimo del adjunto del cliente (`contexto-del-cliente.ts`) que hace falta aquí: así esta regla no depende del portero */
export interface AdjuntoConInformes {
  readonly informes?: ReadonlyArray<{ readonly tipo?: unknown; readonly texto?: unknown; readonly fecha_de_corte?: unknown; readonly ficha_id?: unknown }> | null
  readonly informes_estado?: 'ok' | 'no_se_pudo_leer'
  readonly informes_detalle?: string
}
export type PerfilParaLectores =
  | { readonly estado: 'vigente'; readonly texto: string; readonly fecha_de_corte: string | null; readonly ficha_id: string | null }
  | { readonly estado: 'sin_perfil' }
  | { readonly estado: 'no_se_pudo_leer'; readonly detalle: string }

const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

export function perfilDelAdjunto(a: AdjuntoConInformes | null | undefined): PerfilParaLectores {
  if (!a) return { estado: 'no_se_pudo_leer', detalle: 'sin adjunto del cliente' }
  if (a.informes_estado === 'no_se_pudo_leer') return { estado: 'no_se_pudo_leer', detalle: a.informes_detalle?.trim() || 'los informes del cliente no se pudieron leer' }
  const i = (a.informes ?? []).find((x) => txt(x?.tipo) === TIPO_DEL_INFORME && txt(x?.texto))
  if (!i) return { estado: 'sin_perfil' }
  return { estado: 'vigente', texto: txt(i.texto), fecha_de_corte: txt(i.fecha_de_corte) || null, ficha_id: txt(i.ficha_id) || null }
}

export const ENCABEZADO_DEL_PERFIL = '# PERFIL DEL PÚBLICO (OBSERVADO en voces públicas · no es dato del cliente · contexto, no mandato)'
export const REGLA_DEL_PERFIL = 'Úsalo para entender cómo habla y qué valora el público. Una frase del público va entre comillas SOLO si está en este perfil y tal cual; no inventes otras ni se las atribuyas al público.'
export const SIN_PERFIL_LEIDO = '# PERFIL DEL PÚBLICO: no disponible (no se pudo leer). No atribuyas frases al público.'

/** el bloque para el marco de un lector; '' sin perfil (el marco no cambia) */
export function bloqueDelPerfil(p: PerfilParaLectores): string {
  if (p.estado === 'sin_perfil') return ''
  if (p.estado === 'no_se_pudo_leer') return SIN_PERFIL_LEIDO
  return [ENCABEZADO_DEL_PERFIL, `${REGLA_DEL_PERFIL}${p.fecha_de_corte ? ` Corte del perfil: ${p.fecha_de_corte.slice(0, 10)}.` : ''}`, p.texto].join('\n')
}

// ─────────────────────────────────────────────────────────── el chequeo «frase del público sin fuente»
const RE_COMILLAS = /«([^»]{2,400})»|“([^”]{2,400})”|"([^"]{2,400})"/g
/**
 * señales de que el texto le ATRIBUYE la frase al público (no a la marca): lista cerrada y en español, que es el idioma de los marcos.
 * Se buscan en una ventana corta antes o después de la frase.
 */
export const SENALES_DE_ATRIBUCION: ReadonlyArray<RegExp> = [
  /\bcomo (?:dice|dicen|decimos|se dice|diria|dirian)\b/,
  /\blo que (?:dice|dicen)\b/,
  /\b(?:el|nuestro|tu|su|este) publico (?:dice|habla|lo dice|lo llama)\b/,
  /\ben palabras del publico\b/,
  /\bfrase del publico\b/,
  /\b(?:la gente|los clientes|nuestros clientes|tus clientes|los comensales|los usuarios) (?:dice|dicen|lo dice|lo dicen|lo llaman|le dicen)\b/,
  /\bdicho (?:popular|del publico)\b/,
]
const VENTANA_ANTES = 60
const VENTANA_DESPUES = 40

export interface FraseSinFuente { readonly frase: string; readonly motivo: string }

/** las frases entre comillas que el texto atribuye al público y que no están textuales en el perfil vigente (null = no hay perfil) */
export function frasesDelPublicoSinFuente(texto: string, perfilTexto: string | null): FraseSinFuente[] {
  const s = String(texto ?? '')
  const perfil = perfilTexto ? ` ${normalizar(perfilTexto).replace(/\s+/g, ' ').trim()} ` : null
  const out: FraseSinFuente[] = []
  const vistas = new Set<string>()
  for (const m of s.matchAll(RE_COMILLAS)) {
    const cruda = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    const frase = normalizar(cruda).replace(/\s+/g, ' ').trim()
    if (frase.replace(/\s/g, '').length < LARGO_MINIMO_DE_UNA_FRASE || vistas.has(frase)) continue
    const ini = m.index ?? 0
    const alrededor = normalizar(`${s.slice(Math.max(0, ini - VENTANA_ANTES), ini)} ${s.slice(ini + m[0].length, ini + m[0].length + VENTANA_DESPUES)}`)
    if (!SENALES_DE_ATRIBUCION.some((re) => re.test(alrededor))) continue
    vistas.add(frase)
    if (!perfil) out.push({ frase: cruda, motivo: 'se la atribuye al público y no hay perfil del público vigente que la respalde' })
    else if (!perfil.includes(` ${frase} `)) out.push({ frase: cruda, motivo: 'se la atribuye al público y no está textual en el perfil del público' })
  }
  return out
}
