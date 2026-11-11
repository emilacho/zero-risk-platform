/**
 * LA REVISIÓN DE LOS RETOQUES COLATERALES (11-nov · colaterales 2d parte 4 · opción 1 de Lenovo 02:15Z · líneas 1-3 de CC7 y 1-7 de CC6). Puro.
 * Molde `registro`: UN jefe (`editor_en_jefe`, voz y hechos) JUZGA cada retoque mínimo que propuso la secretaria por una edición del dueño: ¿es fiel a esa edición
 * sin cambiar la voz ni los hechos del documento? Devuelve un veredicto POR RETOQUE. No reescribe nada (la jefatura nunca reescribe) y no vota.
 * El CÓDIGO ata cada veredicto por id: un id que no se pidió se descarta; un id pedido sin veredicto (o con dos que se contradicen, o un «rechaza» sin razón)
 * no se aprueba nunca: queda SIN VEREDICTO y quien lo recibe lo deja `pendiente`.
 * No-circularidad (línea 1 de CC7): el manual es CIMIENTO; un retoque sobre él no se juzga aquí (la entrada lo rechaza).
 * Agnóstico: ningún dato de un cliente.
 */
import type { PayloadDeRevision } from './contrato'

export const CLAVE_DE_REVISION_COLATERAL = 'revision_colateral'
export const ESQUEMA_DE_VEREDICTOS = 'veredictos_colateral.v1'
/** los documentos de destino que este tipo juzga · el manual (cimiento) NO está: votar o juzgar el cimiento sería circular */
export const DESTINOS_DEL_COLATERAL = ['plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'] as const
/** TODOS los documentos de clase cimiento (manual + las filas `cimiento` de `jefatura_grading_policies`): ninguno se juzga aquí · una prueba lo ata a las migraciones */
export const DOCUMENTOS_DE_CIMIENTO = ['manual', 'brand_book', 'icp', 'competitive'] as const
export const MAXIMO_DE_RETOQUES = 40

export interface EdicionDelDueno { documento: string; seccion: string; antes: string; despues: string }
export interface RetoqueParaJuzgar { id: string; documento: string; seccion: string; antes: string; despues: string; porque: string }
export type Veredicto = 'aprueba' | 'rechaza'
export interface VeredictoVerificado { id: string; veredicto: Veredicto; razon: string }
export interface VeredictosVerificados {
  veredictos: VeredictoVerificado[]
  /** ids pedidos que NO tienen un veredicto válido (falta, se contradice o rechaza sin razón): nunca se aprueban */
  sin_veredicto: string[]
  /** ids que el jefe devolvió y no se le pidieron: se descartan */
  inventados: string[]
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown, min = 1): v is string => typeof v === 'string' && v.trim().length >= min

/** la entrada de una revisión colateral: la edición del dueño y los retoques, cada uno con su id único y un destino que no es cimiento */
export function erroresDeLaEntradaColateral(p: Record<string, unknown>): string[] {
  const e: string[] = []
  const ed = p.edicion_del_dueno
  if (!esObjeto(ed) || !texto(ed.documento) || typeof ed.seccion !== 'string' || !texto(ed.antes) || !texto(ed.despues)) e.push('`payload.edicion_del_dueno` debe ser { documento, seccion, antes, despues }')
  const rs = p.retoques
  if (!Array.isArray(rs) || rs.length === 0 || rs.length > MAXIMO_DE_RETOQUES) { e.push(`\`payload.retoques\` debe ser una lista de 1 a ${MAXIMO_DE_RETOQUES} retoques`); return e }
  const vistos = new Set<string>()
  rs.forEach((r, i) => {
    if (!esObjeto(r) || !texto(r.id) || typeof r.seccion !== 'string' || !texto(r.antes) || !texto(r.despues) || typeof r.porque !== 'string' || typeof r.documento !== 'string') { e.push(`retoque ${i}: debe ser { id, documento, seccion, antes, despues, porque }`); return }
    if (vistos.has(r.id)) e.push(`retoque ${i}: el id «${r.id}» está repetido`)
    vistos.add(r.id)
    if ((DOCUMENTOS_DE_CIMIENTO as readonly string[]).includes(r.documento)) e.push(`retoque «${r.id}»: «${r.documento}» es cimiento: un retoque sobre él no lo juzga un jefe (va a una persona)`)
    else if (!(DESTINOS_DEL_COLATERAL as readonly string[]).includes(r.documento)) e.push(`retoque «${r.id}»: documento «${r.documento}» no es un destino de la revisión colateral`)
    if (r.antes === r.despues) e.push(`retoque «${r.id}»: el antes y el después son iguales`)
  })
  return e
}

/** el texto que la revisión guarda como artefacto (el campo `payload.texto` del contrato): legible, sin juicio */
export function textoDeLosRetoques(ed: EdicionDelDueno, rs: RetoqueParaJuzgar[]): string {
  const lineas = [`Edición del dueño en «${ed.documento}», sección «${ed.seccion}»:`, `ANTES: «${ed.antes}»`, `DESPUÉS: «${ed.despues}»`, '', 'Retoques propuestos en los documentos que dependen de esa edición:']
  for (const r of rs) lineas.push(`- [${r.id}] ${r.documento} · ${r.seccion}: «${r.antes}» → «${r.despues}» (porque: ${r.porque})`)
  return lineas.join('\n')
}

/** el pedido del jefe: un veredicto por retoque, con razón; sin reescribir nada */
export function tareaDeRevisionColateral(a: { payload: PayloadDeRevision }): { task: string; indicacion: string; esquema: string } {
  const ed = a.payload.edicion_del_dueno as EdicionDelDueno
  const rs = (a.payload.retoques ?? []) as RetoqueParaJuzgar[]
  const indicacion = 'Juzgas UNO POR UNO retoques mínimos que una secretaria propuso para alinear otros documentos con una edición que el DUEÑO ya decidió. No juzgas la edición del dueño (ya está decidida) ni reescribes nada.'
  const criterio = 'Aprueba un retoque solo si: (1) es FIEL a la edición del dueño (lleva al documento exactamente el cambio que el dueño hizo, ni más ni menos); (2) no cambia la voz del documento; (3) no agrega, quita ni inventa hechos (precios, nombres, fechas, cifras, promesas). Si falla en algo, recházalo y di en la razón qué falla, en una línea.'
  const lista = rs.map((r) => `- [${r.id}] en ${r.documento}, sección «${r.seccion}»\n  ANTES: «${r.antes}»\n  DESPUÉS: «${r.despues}»\n  por qué lo propuso la secretaria: ${r.porque}`).join('\n')
  const formato = 'Devuelve solo el JSON {"veredictos":[{"id":"…","veredicto":"aprueba|rechaza","razon":"…"}]}, con UN veredicto por cada id de la lista (ni más ni menos). El campo "veredicto" vale EXACTAMENTE "aprueba" o "rechaza". Un "rechaza" sin razón no cuenta.'
  const task = [indicacion, criterio, `## La edición del dueño (ya decidida)\nEn «${ed.documento}», sección «${ed.seccion}»:\nANTES: «${ed.antes}»\nDESPUÉS: «${ed.despues}»`, `## Los retoques que juzgas\n${lista}`, formato].join('\n\n')
  return { task, indicacion, esquema: ESQUEMA_DE_VEREDICTOS }
}

/** el código ata cada veredicto a un id pedido · nada se aprueba por omisión */
export function verificarVeredictos(pedidos: string[], devueltos: unknown): VeredictosVerificados {
  const lista = Array.isArray(devueltos) ? devueltos.filter(esObjeto) : []
  const porId = new Map<string, Array<{ veredicto: unknown; razon: unknown }>>()
  const inventados: string[] = []
  for (const v of lista) {
    const id = typeof v.id === 'string' ? v.id.trim() : ''
    if (!pedidos.includes(id)) { if (id && !inventados.includes(id)) inventados.push(id); continue }
    porId.set(id, [...(porId.get(id) ?? []), { veredicto: v.veredicto, razon: v.razon }])
  }
  const veredictos: VeredictoVerificado[] = []
  const sin_veredicto: string[] = []
  for (const id of pedidos) {
    const vs = porId.get(id) ?? []
    const distintos = new Set(vs.map((x) => x.veredicto))
    const v = vs[0]
    const valido = vs.length > 0 && distintos.size === 1 && (v.veredicto === 'aprueba' || v.veredicto === 'rechaza') && (v.veredicto === 'aprueba' || texto(v.razon))
    if (!valido) { sin_veredicto.push(id); continue }
    veredictos.push({ id, veredicto: v.veredicto as Veredicto, razon: typeof v.razon === 'string' ? v.razon.trim() : '' })
  }
  return { veredictos, sin_veredicto, inventados }
}

/** el molde del seco: todos aprueban, salvo lo que pida la simulación (`rechaza_todos`, `uno_sin_veredicto`, `inventa_uno`) */
export function moldeDeVeredictos(ids: string[], sim: { veredictos?: string } = {}): string {
  const m = sim.veredictos ?? 'aprueban'
  const vs = ids.filter((_, i) => !(m === 'uno_sin_veredicto' && i === 0)).map((id) => (m === 'rechaza_todos' ? { id, veredicto: 'rechaza', razon: '(simulado) cambia un hecho' } : { id, veredicto: 'aprueba', razon: '(simulado) fiel a la edición' }))
  if (m === 'inventa_uno') vs.push({ id: 'id-inventado', veredicto: 'aprueba', razon: '(simulado)' })
  return JSON.stringify({ veredictos: vs })
}
