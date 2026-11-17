/**
 * 17-nov · EL PUERTO «BANCO» DEL RECEPTOR DE CORRECCIONES (asignado por Lenovo · `RESPUESTA-LENOVO-a-CC3-CC1-receptor-de-correcciones` · contrato de CC3 en su PROPUESTA).
 * Firma de Emilio (cambio 4): la jefatura DEVUELVE la corrección al creador; el creador la toma entera, a medias o no la toma, con motivo. Sin persona en el medio.
 * Lo que la jefatura marca como REGLA DURA (D1 · oferta cerrada o que aún no existe en su fecha · D2 · dato vencido o aún no vigente) se toma sí o sí.
 *
 *  · El creador de una idea del banco es la MESA DE LA GRAN IDEA: decide en su mesa chica («corrección del banco», E2) y entrega un bloque JSON que lee `leerRespuestaDelBanco`.
 *  · `verificarRespuestaDelBanco`: el CÓDIGO verifica antes de escribir: la idea sigue igual (`idea_sello` = su `linea` al armar la corrección), los campos son editables y no vacíos,
 *    la explicación está donde es obligatoria, y una regla dura no se rechaza. Lo que no cumple NO se escribe y vuelve como `no_dicha` (nunca se inventa una decisión).
 *  · `aplicarCorreccionDelBanco`: escribe el banco con el MISMO núcleo del tablero (`editarEnElBanco` / `retirarDelBanco`: historial, sello del concepto, reasignación de filas sin brief).
 *    Es la ÚNICA otra puerta al banco además del tablero; quién la llama y con qué autorización lo decide la ruta (E2). Aquí no hay red ni modelo: US$ 0.
 *  · La idempotencia por `correccion_id` y lo que se rehace después (briefs de las filas) son del receptor de CC3.
 */
import type { Almacen } from './almacen'
import { CAMPOS_EDITABLES, editarEnElBanco, leerCambios, retirarDelBanco, type CampoEditable, type Reasignada } from './banco-de-ideas'
import type { IdeaDelBanco } from './conceptos'

/** las reglas duras firmadas que alcanzan a una idea del banco (hechos de la oferta, cambio 4): con ellas `no_tomada` no vale */
export const REGLAS_DURAS_DEL_BANCO = ['D1', 'D2'] as const
export const LARGO_MAXIMO_DE_EXPLICACION = 600
export const IDEA_CAMBIADA = 'la idea ya cambió; corrección vieja'
export const IDEA_FUERA_DEL_BANCO = 'la idea ya no está en el banco'
export const quienCorrige = (correccionId: string): string => `mesa de la gran idea (corrección ${correccionId})`

/** lo que entrega el receptor de CC3: una corrección por llamada */
export interface CorreccionAlBanco {
  correccion_id: string
  campana_id: string
  idea_id: string
  /** la `linea` de la idea tal como estaba al armar la corrección: si cambió, la corrección es vieja */
  idea_sello: string
  filas_afectadas: string[]
  motivo: string
  linea_de_la_ficha: string | null
  regla: string | null
}

export type RespuestaDelBanco =
  | { respuesta: 'tomada'; explicacion: string | null; accion: 'editar'; cambios: Partial<Record<CampoEditable, string>> }
  | { respuesta: 'tomada'; explicacion: string | null; accion: 'retirar'; reasignadas?: Reasignada[] }
  | { respuesta: 'tomada_en_parte'; explicacion: string; accion: 'editar' | 'retirar'; cambios?: Partial<Record<CampoEditable, string>>; reasignadas?: Reasignada[] }
  | { respuesta: 'no_tomada'; explicacion: string }
  | { respuesta: 'no_dicha'; motivo?: string }

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const noDicha = (motivo: string): RespuestaDelBanco => ({ respuesta: 'no_dicha', motivo })
export const esReglaDura = (regla: string | null | undefined): boolean => !!regla && (REGLAS_DURAS_DEL_BANCO as readonly string[]).includes(regla.trim().toUpperCase())

/** el ÚLTIMO bloque JSON del texto de la mesa (```json … ``` o un objeto suelto al final); lo que no se lee es `no_dicha`, nunca una decisión inventada */
export function leerRespuestaDelBanco(salida: string | null | undefined): RespuestaDelBanco {
  const t = salida ?? ''
  const bloques = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const crudo = bloques.length ? bloques[bloques.length - 1] : t.indexOf('{') >= 0 && t.lastIndexOf('}') > t.indexOf('{') ? t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1) : ''
  let o: Record<string, unknown> | null = null
  try { const v = JSON.parse(crudo.trim()); o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null } catch { o = null }
  if (!o) return noDicha('la mesa no dejó su respuesta en un bloque JSON legible')
  const respuesta = texto(o.respuesta)
  const explicacion = texto(o.explicacion)
  if (respuesta === 'no_tomada') return explicacion ? { respuesta, explicacion } : noDicha('«no_tomada» sin explicación')
  if (respuesta !== 'tomada' && respuesta !== 'tomada_en_parte') return noDicha(`respuesta desconocida: «${String(o.respuesta ?? '')}»`)
  const accion = texto(o.accion)
  if (accion !== 'editar' && accion !== 'retirar') return noDicha(`acción desconocida: «${String(o.accion ?? '')}»`)
  if (respuesta === 'tomada_en_parte' && !explicacion) return noDicha('«tomada_en_parte» sin explicación')
  if (accion === 'retirar') return respuesta === 'tomada' ? { respuesta, explicacion, accion } : { respuesta, explicacion: explicacion!, accion }
  const c = o.cambios && typeof o.cambios === 'object' && !Array.isArray(o.cambios) ? (o.cambios as Record<string, unknown>) : null
  if (!c) return noDicha('«editar» sin cambios')
  const cambios: Partial<Record<CampoEditable, string>> = {}
  for (const [k, v] of Object.entries(c)) cambios[k as CampoEditable] = typeof v === 'string' ? v : String(v ?? '')
  return respuesta === 'tomada' ? { respuesta, explicacion, accion, cambios } : { respuesta, explicacion: explicacion!, accion, cambios }
}

/** el código decide si la respuesta se puede escribir; si no, la baja a `no_tomada` (idea vieja o fuera del banco) o `no_dicha` (respuesta inválida), sin escribir nada */
export function verificarRespuestaDelBanco(c: CorreccionAlBanco, idea: IdeaDelBanco | null, r: RespuestaDelBanco): RespuestaDelBanco {
  if (!idea) return { respuesta: 'no_tomada', explicacion: IDEA_FUERA_DEL_BANCO }
  if (idea.linea !== c.idea_sello) return { respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA }
  if (r.respuesta === 'no_dicha') return r
  if (r.respuesta === 'no_tomada') {
    if (esReglaDura(c.regla)) return noDicha(`la corrección cita la regla dura ${c.regla}: se toma sí o sí (firma de Emilio); la mesa la rechazó («${r.explicacion.slice(0, 200)}»)`)
    return { respuesta: 'no_tomada', explicacion: r.explicacion.slice(0, LARGO_MAXIMO_DE_EXPLICACION) }
  }
  if (r.respuesta === 'tomada_en_parte' && !texto(r.explicacion)) return noDicha('«tomada_en_parte» sin explicación')
  const explicacion = r.explicacion ? r.explicacion.slice(0, LARGO_MAXIMO_DE_EXPLICACION) : null
  if (r.accion === 'retirar') return r.respuesta === 'tomada' ? { respuesta: 'tomada', explicacion, accion: 'retirar' } : { respuesta: 'tomada_en_parte', explicacion: explicacion!, accion: 'retirar' }
  const lc = leerCambios([{ idea_id: c.idea_id, campos: r.cambios ?? {} }])
  if (!lc.ok) return noDicha(`los cambios de la mesa no se pueden escribir: ${String(lc.r.cuerpo.detalle ?? lc.r.cuerpo.code ?? 'inválidos')}`)
  const cambios = lc.cambios[0].campos
  if (!CAMPOS_EDITABLES.some((k) => cambios[k] !== undefined && cambios[k] !== idea[k])) return noDicha('«editar» sin ningún cambio real sobre la idea')
  return r.respuesta === 'tomada' ? { respuesta: 'tomada', explicacion, accion: 'editar', cambios } : { respuesta: 'tomada_en_parte', explicacion: explicacion!, accion: 'editar', cambios }
}

export interface ResultadoDeLaCorreccion {
  /** lo que se guarda en `cadena_correcciones` (CC3): la respuesta tal como quedó DESPUÉS de verificar y escribir */
  respuesta: RespuestaDelBanco
  /** la versión de la gran idea que se escribió (o se habría escrito) */
  version: number | null
  /** la idea después de escribir (editar) o la retirada; null si no se escribió */
  idea: IdeaDelBanco | null
  reasignadas: Reasignada[]
  con_brief_sin_tocar: string[]
}

/** la versión aprobada vigente de la gran idea (la misma regla que el calendario y el tablero) y la idea en su banco */
async function ideaVigente(al: Almacen, campanaId: string, ideaId: string): Promise<{ version: number | null; idea: IdeaDelBanco | null }> {
  const todos = await al.conceptosDe(campanaId)
  const aprobado = [...todos].reverse().find((x) => x.aprobacion === 'aprobado' && x.leido)
  if (!aprobado) return { version: null, idea: null }
  const banco = (Array.isArray((aprobado.leido as Record<string, unknown>).banco) ? (aprobado.leido as Record<string, unknown>).banco : []) as IdeaDelBanco[]
  return { version: aprobado.version, idea: banco.find((i) => i.id === ideaId) ?? null }
}

/** verifica y escribe; nunca lanza por una respuesta mala: la baja de valor y lo dice */
export async function aplicarCorreccionDelBanco(al: Almacen, c: CorreccionAlBanco, r: RespuestaDelBanco, ahora: string): Promise<ResultadoDeLaCorreccion> {
  const v = await ideaVigente(al, c.campana_id, c.idea_id)
  const vacio = { version: v.version, idea: null, reasignadas: [], con_brief_sin_tocar: [] }
  const final = verificarRespuestaDelBanco(c, v.idea, r)
  if (final.respuesta !== 'tomada' && final.respuesta !== 'tomada_en_parte') return { ...vacio, respuesta: final }
  const ctx = { campana_id: c.campana_id, version: v.version!, autor: quienCorrige(c.correccion_id) }
  const w = final.accion === 'editar'
    ? await editarEnElBanco(al, ctx, [{ idea_id: c.idea_id, campos: final.cambios ?? {} }], ahora, { [c.idea_id]: c.idea_sello })
    : await retirarDelBanco(al, ctx, c.idea_id, ahora, c.idea_sello)
  // otra edición (el tablero) cambió la idea entre la lectura y la escritura: la corrección es vieja, no se pisa
  if (w.status === 409 && w.cuerpo.code === 'E-IDEA-CAMBIADA') return { ...vacio, respuesta: { respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA }, reasignadas: Array.isArray(w.cuerpo.reasignadas) ? (w.cuerpo.reasignadas as Reasignada[]) : [] }
  if (w.status !== 200) return { ...vacio, respuesta: noDicha(`no se pudo escribir el banco: ${String(w.cuerpo.code ?? w.status)} · ${String(w.cuerpo.detalle ?? '')}`.slice(0, LARGO_MAXIMO_DE_EXPLICACION)) }
  const ideas = Array.isArray(w.cuerpo.ideas) ? (w.cuerpo.ideas as IdeaDelBanco[]) : []
  const reasignadas = Array.isArray(w.cuerpo.reasignadas) ? (w.cuerpo.reasignadas as Reasignada[]) : []
  const con_brief_sin_tocar = Array.isArray(w.cuerpo.con_brief_sin_tocar) ? (w.cuerpo.con_brief_sin_tocar as string[]) : []
  const respuesta: RespuestaDelBanco = final.accion === 'retirar' ? { ...final, reasignadas } : final
  return { respuesta, version: v.version, idea: ideas[0] ?? null, reasignadas, con_brief_sin_tocar }
}
