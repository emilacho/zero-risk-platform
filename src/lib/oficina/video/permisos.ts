/**
 * SPRINT 3 · T1b · EL REGISTRO DE PERMISOS DE PERSONA REAL (DECISIONES Lenovo 17-nov 13:10 Zúrich, opción B).
 * La cara o la voz de una persona real identificable solo con su permiso registrado (es ley). Las personas, voces y locuciones GENERADAS son libres.
 *  · Una foto propia del cliente CON personas (`con_personas: true`, etiqueta del curador) solo viaja a una pieza si un permiso vigente la cubre:
 *    el permiso la nombra en `fotos`, tiene el alcance de la pieza (`video`), no venció y no fue revocado.
 *  · Sin permiso, la pieza NO la usa y lo DECLARA (artefacto del encargo + hoja de publicar). No bloquea la pieza ni pide revisión humana nueva.
 *  · Si el registro no se pudo leer, se hace lo seguro: ninguna foto con personas viaja, y se declara por qué.
 *  · Una foto sin la etiqueta (`con_personas` vacío) o sin personas no pide permiso: lo decide la etiqueta del curador.
 *  · El vencimiento se cuenta en el día del CLIENTE (su zona), inclusive. El registro se lee al ABRIR el encargo: una revocación vale para los encargos que abran después.
 * Puro: sin base, sin red, sin modelo. Agnóstico: no sabe de rubros ni de clientes.
 */
import type { FotoEtiquetada } from '../fotos'

/** lo que puede cubrir un permiso: su imagen fija, su imagen en video, su voz */
export const ALCANCES_DE_PERMISO = ['imagen', 'video', 'voz'] as const
export type AlcanceDePermiso = (typeof ALCANCES_DE_PERMISO)[number]

/** una fila de `oficina_permisos_persona_real` */
export interface PermisoDePersonaReal {
  id: string
  /** quién es (para declararlo) */
  persona: string
  /** los ids de las fotos propias del cliente que la muestran y que el permiso cubre */
  fotos: string[]
  alcance: string[]
  /** último día en que vale (AAAA-MM-DD, inclusive); null = sin vencimiento */
  vence_en: string | null
  /** dónde está el consentimiento (documento, correo, contrato) · sin evidencia no hay permiso */
  evidencia: string
  revocado_en?: string | null
}

export type MotivoDeRetiro = 'sin_permiso' | 'permiso_vencido' | 'permiso_revocado' | 'sin_alcance' | 'sin_evidencia' | 'registro_no_leido'

export interface FotoRetirada {
  foto_id: string
  motivo: MotivoDeRetiro
  /** la persona del permiso que la nombraba (si había uno) */
  persona?: string
}

/** el día de hoy EN LA ZONA DEL CLIENTE (AAAA-MM-DD) · sin zona o con una zona inválida, el de UTC */
export function diaDe(d: Date, zona?: string | null): string {
  if (zona) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) } catch { /* zona inválida: UTC */ } }
  return d.toISOString().slice(0, 10)
}

/** por qué un permiso NO sirve para `alcance` hoy (null = sirve) */
export function motivoDelPermiso(p: PermisoDePersonaReal, alcance: AlcanceDePermiso, hoy: Date, zona?: string | null): Exclude<MotivoDeRetiro, 'sin_permiso' | 'registro_no_leido'> | null {
  if (p.revocado_en) return 'permiso_revocado'
  if (!String(p.evidencia ?? '').trim()) return 'sin_evidencia'
  if (p.vence_en && String(p.vence_en).slice(0, 10) < diaDe(hoy, zona)) return 'permiso_vencido'
  if (!Array.isArray(p.alcance) || !p.alcance.includes(alcance)) return 'sin_alcance'
  return null
}

/** orden de lo que se declara cuando varios permisos nombran la foto y ninguno sirve: el más cercano a servir */
const CERCANIA: MotivoDeRetiro[] = ['sin_alcance', 'permiso_vencido', 'sin_evidencia', 'permiso_revocado']

/**
 * las fotos que pueden viajar a la pieza · `permisos` null = el registro no se pudo leer (lo seguro: ninguna foto con personas)
 * Devuelve las que quedan (en su orden) y las retiradas con su motivo.
 */
export function fotosConPermiso(fotos: FotoEtiquetada[], permisos: PermisoDePersonaReal[] | null, alcance: AlcanceDePermiso, hoy: Date, /** la zona del cliente: el día del vencimiento es el SUYO */ zona?: string | null): { fotos: FotoEtiquetada[]; retiradas: FotoRetirada[] } {
  const quedan: FotoEtiquetada[] = []
  const retiradas: FotoRetirada[] = []
  for (const f of fotos) {
    if (f.con_personas !== true) { quedan.push(f); continue }
    if (permisos === null) { retiradas.push({ foto_id: f.id, motivo: 'registro_no_leido' }); continue }
    const suyos = permisos.filter((p) => Array.isArray(p.fotos) && p.fotos.includes(f.id))
    if (!suyos.length) { retiradas.push({ foto_id: f.id, motivo: 'sin_permiso' }); continue }
    if (suyos.some((p) => motivoDelPermiso(p, alcance, hoy, zona) === null)) { quedan.push(f); continue }
    const motivos = suyos.map((p) => ({ p, m: motivoDelPermiso(p, alcance, hoy, zona)! })).sort((a, b) => CERCANIA.indexOf(a.m) - CERCANIA.indexOf(b.m))
    retiradas.push({ foto_id: f.id, motivo: motivos[0].m, persona: motivos[0].p.persona })
  }
  return { fotos: quedan, retiradas }
}

const TEXTO_DEL_MOTIVO: Record<MotivoDeRetiro, string> = {
  sin_permiso: 'sin permiso registrado',
  permiso_vencido: 'su permiso venció',
  permiso_revocado: 'su permiso fue revocado',
  sin_alcance: 'su permiso no cubre video',
  sin_evidencia: 'su permiso no tiene evidencia',
  registro_no_leido: 'no se pudo leer el registro de permisos',
}

/** lo que se declara en la hoja de publicar · vacío si no se retiró nada */
export function avisoDePersonasReales(retiradas: FotoRetirada[]): string {
  if (!retiradas.length) return ''
  const partes = retiradas.map((r) => `${r.foto_id.slice(0, 8)}${r.persona ? ` (${r.persona})` : ''}: ${TEXTO_DEL_MOTIVO[r.motivo]}`)
  return `${retiradas.length === 1 ? 'Una foto propia con personas reales no se usó' : `${retiradas.length} fotos propias con personas reales no se usaron`} en esta pieza (${partes.join(' · ')}). Si la pieza muestra personas, son generadas.`
}
