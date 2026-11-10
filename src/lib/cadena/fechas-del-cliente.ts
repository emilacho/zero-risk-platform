/**
 * Fechas especiales · lo que vale para CUALQUIER país y rubro (10-nov · GO Lenovo · fechas «sin fuente»: A + B + C + D).
 *  · A · las fuentes oficiales se buscan por país: primero `tipo|país` (excepción de un tipo) y después `*|país`.
 *  · C · una temporada del negocio NO se investiga en fuentes públicas: su fecha la da el cliente, con una cita del plan que el código comprueba. Sin cita, pendiente.
 *  · D · la clase la decide el agente; el código guarda la llave estable que devuelve y comprueba que exista (o que el agente diga que es nueva).
 * Código puro salvo `guardarTemporadas`, que escribe por el almacén. US$ 0: no llama a ningún modelo.
 */
import { createHash } from 'node:crypto'
import type { Almacen, Campana, ContextoDelCliente } from './almacen'
import { esFechaIso } from './fechas'
import type { LlaveDeFecha } from './indicaciones'
import { citaAparece, normalizar } from './texto'
import type { ClaseDeFecha, Estrategia, FechaQueImporta } from './tipos'

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** la llave que se guarda: minúsculas, sin tildes, espacios → `_` (la misma de siempre) */
export const claveDeFecha = (x: string): string => normalizar(x).replace(/\s+/g, '_')

/** una estrategia guardada antes del 10-nov no trae clase: se lee como siempre, como fecha pública que se investiga en fuentes oficiales */
export const claseDe = (f: Pick<FechaQueImporta, 'clase'>): ClaseDeFecha => f.clase ?? 'feriado_publico'

/** la llave estable de una fecha declarada (la que devolvió el agente; sin ella, el tipo de siempre) */
export const llaveDe = (f: Pick<FechaQueImporta, 'llave' | 'tipo'>): string => claveDeFecha(f.llave && f.llave.trim() ? f.llave : f.tipo)

/** A · las fuentes oficiales del país: la excepción del tipo gana; si no hay, las del país para todo tipo (`*|país`) */
export function dominiosDe(config: unknown, tipo: string, pais: string): string[] {
  const c = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
  const propia = lista(c[`${tipo}|${pais}`])
  return propia.length ? propia : lista(c[`*|${pais}`])
}

/**
 * D · punto 2 de CC7: una sola entrada por (llave, ámbito), la usada más recientemente PRIMERO (lo que no tiene fecha, al final, y entre iguales por orden alfabético).
 * La clase de una fecha guardada gana a la de una cobertura sin clase. Puro: el mismo insumo da la misma lista.
 */
export function ordenarLlaves(filas: { llave: string; ambito: string; clase?: ClaseDeFecha | null; cuando?: string | null }[]): LlaveDeFecha[] {
  const por = new Map<string, { llave: string; ambito: string; clase: ClaseDeFecha | null; cuando: string }>()
  for (const f of filas) {
    const k = `${f.llave}|${f.ambito}`, ya = por.get(k)
    const cuando = f.cuando ?? ''
    por.set(k, { llave: f.llave, ambito: f.ambito, clase: f.clase ?? ya?.clase ?? null, cuando: ya && ya.cuando > cuando ? ya.cuando : cuando })
  }
  return [...por.values()]
    .sort((a, b) => (a.cuando === b.cuando ? `${a.llave}|${a.ambito}`.localeCompare(`${b.llave}|${b.ambito}`) : a.cuando < b.cuando ? 1 : -1))
    .map((x) => ({ llave: x.llave, ambito: x.ambito, ...(x.clase ? { clase: x.clase } : {}) }))
}

/** D · ¿la llave que devolvió el agente existe para ese país (con ese ámbito), o el agente dijo que es nueva? */
export function llaveConocida(f: Pick<FechaQueImporta, 'llave' | 'tipo' | 'ambito' | 'llave_nueva'>, llaves: LlaveDeFecha[]): { ok: boolean; existe: boolean } {
  const k = llaveDe(f), a = claveDeFecha(f.ambito)
  const existe = llaves.some((x) => claveDeFecha(x.llave) === k && claveDeFecha(x.ambito) === a)
  return { ok: existe || f.llave_nueva === true, existe }
}

const ultimoDelMes = (iso: string): boolean => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.getUTCDate() === 1 }

/**
 * C · la cita respalda el tramo: aparece LITERAL en el plan y nombra el mes de `desde` y el de `hasta`. Si el tramo no empieza el día 1 (o no termina el último día del mes),
 * la cita tiene que decir ese día también: «de diciembre a abril» respalda 01-dic → 30-abr, no 15-dic → 30-abr.
 */
export function temporadaRespaldada(f: Pick<FechaQueImporta, 'desde' | 'hasta' | 'cita_plan'>, planTexto: string): { ok: boolean; motivo: string } {
  const desde = f.desde?.trim() ?? '', hasta = f.hasta?.trim() ?? ''
  if (!desde && !hasta && !f.cita_plan?.trim()) return { ok: false, motivo: 'el plan no dice cuándo es' }
  if (!esFechaIso(desde) || !esFechaIso(hasta)) return { ok: false, motivo: '`desde` y `hasta` no son fechas válidas' }
  if (desde > hasta) return { ok: false, motivo: '`desde` es posterior a `hasta`' }
  if (!citaAparece(planTexto, f.cita_plan)) return { ok: false, motivo: 'la cita no aparece literal en el plan' }
  const c = normalizar(f.cita_plan ?? '')
  const [, m1, d1] = desde.split('-').map(Number) as [number, number, number]
  const [, m2, d2] = hasta.split('-').map(Number) as [number, number, number]
  const nombra = (m: number) => new RegExp(`\\b${MESES[m - 1]}\\b`).test(c)
  if (!nombra(m1) || !nombra(m2)) return { ok: false, motivo: 'la cita no nombra los meses del tramo' }
  const dice = (d: number) => new RegExp(`\\b0?${d}\\b`).test(c)
  if (d1 !== 1 && !dice(d1)) return { ok: false, motivo: `la cita no dice el día ${d1} en que empieza` }
  if (!ultimoDelMes(hasta) && !dice(d2)) return { ok: false, motivo: `la cita no dice el día ${d2} en que termina` }
  return { ok: true, motivo: 'respaldada por el plan' }
}

export interface ResultadoDeTemporadas { guardadas: string[]; preguntadas: string[]; pendientes: string[]; avisos: string[] }

/**
 * C · después de validar la estrategia: cada temporada con cita que la respalda se guarda SOLO para este cliente; sin cita, queda pendiente y se le pregunta al dueño
 * (por la ruta de preguntas, con su «ya preguntada»/«repetida»). En seco no escribe ni pregunta: solo dice qué haría. Nunca lanza: un fallo se declara.
 */
export async function guardarTemporadas(al: Almacen, campana: Pick<Campana, 'id' | 'client_id' | 'plan_id' | 'seco'>, ctx: Pick<ContextoDelCliente, 'pais' | 'planTexto'>, e: Estrategia, wf: { workflow_id: string | null; workflow_execution_id: string | null }): Promise<ResultadoDeTemporadas> {
  const out: ResultadoDeTemporadas = { guardadas: [], preguntadas: [], pendientes: [], avisos: [] }
  const temporadas = e.fechas_que_importan.filter((f) => claseDe(f) === 'temporada_del_negocio')
  if (!temporadas.length) return out
  if (!ctx.pais) { out.avisos.push('el cliente no tiene país: las temporadas no se guardan'); return out }
  const pais = claveDeFecha(ctx.pais)
  const hashDelPlan = createHash('sha256').update(ctx.planTexto).digest('hex').slice(0, 24)
  for (const f of temporadas) {
    const llave = llaveDe(f), ambito = claveDeFecha(f.ambito)
    const r = temporadaRespaldada(f, ctx.planTexto)
    if (r.ok) {
      if (campana.seco) { out.guardadas.push(`${llave} (ensayo: no se escribe)`); continue }
      try {
        await al.guardarFechaEspecial({ pais, tipo: llave, ambito, anio: Number(f.desde!.slice(0, 4)), fecha: f.desde!, hasta: f.hasta!, nombre: f.tipo, alcance: 'local', fuente_url: `plan:${campana.plan_id}`, cita_literal: f.cita_plan!, pagina_hash: hashDelPlan, doble_fuente: false, estado: 'verificada', client_id: campana.client_id, origen: 'cliente' })
        out.guardadas.push(llave)
      } catch (x) { out.avisos.push(`${llave}: no se pudo guardar (${String((x as Error).message).slice(0, 120)})`) }
      continue
    }
    out.pendientes.push(`${llave}: ${r.motivo}`)
    if (campana.seco) continue
    if (!wf.workflow_id || !wf.workflow_execution_id) { out.avisos.push(`${llave}: sin workflow no se puede dejar la pregunta en Decisiones`); continue }
    const p = await al.preguntarAlDueno({
      client_id: campana.client_id, tema: `temporada ${f.tipo}`.slice(0, 80),
      pregunta: `¿En qué fechas es «${f.tipo}» para tu negocio${f.ambito ? ` (${f.ambito})` : ''}? Dinos desde qué día y hasta qué día, para armar el calendario con esas fechas.`,
      canal: 'Tu oficina › Decisiones', oficina: 'cadena', agente: 'estrategia', workflow_id: wf.workflow_id, workflow_execution_id: wf.workflow_execution_id,
    })
    if (p.ok) out.preguntadas.push(`${llave}: ${p.detalle}`)
    else out.avisos.push(`${llave}: no se pudo dejar la pregunta en Decisiones (${p.detalle})`)
  }
  return out
}

/** la llave tal como la dio el agente (o el tipo de siempre), sin normalizar: la ruta y el almacén la normalizan igual que antes */
export const llaveCrudaDe = (f: Pick<FechaQueImporta, 'llave' | 'tipo'>): string => (f.llave && f.llave.trim() ? f.llave.trim() : f.tipo)
