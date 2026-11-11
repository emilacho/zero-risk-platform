/**
 * COLATERALES 2d · los PUERTOS REALES del turno (Supabase). Cada lectura lanza si la base falla (el turno frena: falla cerrado).
 *   · filas activas de la jefatura: `jefatura_grading_policies.is_active`, leídas en el instante;
 *   · guarda de piezas: la de la oficina (#1020), única que nombra sus tablas;
 *   · documentos de aguas abajo: SOLO los que tienen lector hoy (la estrategia, por el almacén de la cadena). Los demás vienen vacíos y la
 *     nota de la edición los declara «sin lector» (se suman con los escritores por tramo). La campaña: la del documento editado si es de
 *     una campaña; si es del cliente (manual, plan), su campaña VIVA real; sin campaña viva, nada que leer;
 *   · la campaña de un documento de campaña es del cliente: por el almacén de la cadena (único que nombra sus tablas);
 *   · gasto del día (UTC): recibos de HOY de las corridas de colaterales del cliente (por la fecha del recibo) + cuántas ediciones suyas
 *     están tomadas sin recibo todavía (en vuelo: el turno les cuenta la reserva);
 *   · tope diario: la fila del cliente en `colaterales_topes_diarios`; si no tiene, la fila por omisión (sin cliente); sin ninguna, null;
 *   · pieza B: el gasto del día suma las revisiones de la jefatura de esas ediciones (cerradas por su gasto, abiertas por cuenta aparte); la revisión se abre con
 *     vuelta a `api/jefatura/colaterales-vuelta`; aplicar = el motor 2c con los escritores que existen hoy (la estrategia);
 *   · pieza D · el gasto de UNA edición: sus llamadas por su llave EXACTA en `agent_dispatches` (más la ejecución de la edición), cada una con sus recibos;
 *     la que no tiene recibo se cuenta aparte · sus revisiones: cerradas por su gasto, abiertas aparte.
 * Agnóstico: ningún dato de un cliente.
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { abrirRevisionConVuelta, almacenDeSupabase } from '../cadena/almacen-supabase'
import { almacenDeSupabase as almacenDeJefatura } from '../jefatura/revision/almacen-supabase'
import { ESTADOS_TERMINALES } from '../jefatura/revision/puertos'
import { aplicarAprobados } from './aplicar'
import type { Documento } from '../cadena/dependencias-de-documentos'
import { piezasPorPublicar } from '../oficina/piezas-por-publicar'
import { almacenDeColaterales, type Db, type Edicion } from './almacen'
import { escritorDeEstrategia } from './escritores'
import { DOCUMENTOS_DE_CAMPANA, llaveDeLaSecretaria, type DocumentoLeido, type PuertosDelTurno } from './turno'
import { llaveDelRehacer } from './rehacer'
import { RUTA_DE_VUELTA_DE_COLATERALES } from './vuelta'

function ok<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

/** la campaña cuyos documentos se leen: la del documento editado, o la viva real del cliente */
export async function campanaDeLaEdicion(e: Pick<Edicion, 'client_id' | 'documento' | 'documento_ref'>, viva: (clientId: string) => Promise<{ id: string } | null>): Promise<string | null> {
  if (DOCUMENTOS_DE_CAMPANA.has(e.documento)) return e.documento_ref
  return (await viva(e.client_id))?.id ?? null
}

type Cadena = Pick<ReturnType<typeof almacenDeSupabase>, 'campana' | 'campanaViva' | 'ultimaEstrategia' | 'estrategiaEnVersion' | 'insertarEstrategiaSiLibre'>
export function puertosDeSupabase(db: Db = getSupabaseAdmin() as unknown as Db, ahora: () => Date = () => new Date(), cadena: Cadena = almacenDeSupabase()): PuertosDelTurno {
  const estrategia = escritorDeEstrategia(cadena)
  const almacen = almacenDeColaterales(db)
  const P: PuertosDelTurno = {
    almacen,
    async filasActivas() {
      const d = ok(await db.from('jefatura_grading_policies').select('artifact_type').eq('is_active', true), 'leer las filas de la jefatura') as { artifact_type: string }[] | null
      return new Set((d ?? []).map((f) => String(f.artifact_type)))
    },
    piezasPorPublicar: (client_id, campana_id) => piezasPorPublicar(db, { client_id, campana_id }, ahora()),
    async documentos(e, docs) {
      const r: Partial<Record<Documento, DocumentoLeido>> = {}
      if (!docs.includes('estrategia')) return r
      const campana = await campanaDeLaEdicion(e, (c) => cadena.campanaViva(c, false))
      if (!campana) return r
      const v = await estrategia.leerVigente(campana)
      // abierta (borrador): no se toca, queda para la próxima versión (CRITERIOS §3) · no se lee
      if (v && !v.abierto) r.estrategia = { texto: v.texto, ref: campana, version: v.version }
      return r
    },
    async campanaDelCliente(client_id, campana_id) {
      const c = await cadena.campana(campana_id)
      return !!c && c.client_id === client_id
    },
    async gastoDelDia(client_id, sin_edicion) {
      const hoy = ahora().toISOString().slice(0, 10) + 'T00:00:00Z'
      type Fila = { id: string; estado: string; workflow_execution_id: string | null }
      // las tocadas hoy (un recibo de hoy deja su edición tocada hoy al cerrarse) + las que siguen tomadas aunque se tomaran ayer
      const tocadas = (ok(await db.from('colaterales_ediciones').select('id, estado, workflow_execution_id').eq('client_id', client_id).gte('updated_at', hoy), 'leer las ediciones de hoy') as Fila[] | null) ?? []
      const tomadas = (ok(await db.from('colaterales_ediciones').select('id, estado, workflow_execution_id').eq('client_id', client_id).eq('estado', 'en_curso'), 'leer las ediciones en curso') as Fila[] | null) ?? []
      const ed = [...new Map([...tocadas, ...tomadas].filter((f) => f.id !== sin_edicion).map((f) => [f.id, f])).values()]
      const ejecucion = (f: Fila): string | null => (typeof f.workflow_execution_id === 'string' && f.workflow_execution_id !== '' ? f.workflow_execution_id : null)
      const ejecuciones = [...new Set(ed.map(ejecucion).filter((x): x is string => x !== null))]
      type Recibo = { workflow_execution_id: string; cost_usd: number | null; created_at: string }
      const rec = ejecuciones.length ? ((ok(await db.from('agent_invocations').select('workflow_execution_id, cost_usd, created_at').in('workflow_execution_id', ejecuciones), 'leer los recibos') as Recibo[] | null) ?? []) : []
      const conRecibo = new Set(rec.map((f) => f.workflow_execution_id))
      const desde = new Date(hoy).getTime()
      const recibos = rec.filter((f) => new Date(f.created_at).getTime() >= desde).reduce((t, f) => t + (Number(f.cost_usd) || 0), 0)
      const en_vuelo = ed.filter((f) => { const x = ejecucion(f); return f.estado === 'en_curso' && !(x && conRecibo.has(x)) }).length
      // pieza B · las revisiones de la jefatura de esas ediciones: las cerradas por su gasto; las abiertas, contadas aparte (el turno les reserva su tope)
      const ids = ed.map((f) => f.id)
      const ret = ids.length ? ((ok(await db.from('colaterales_retoques').select('edicion_id, revision_id').in('edicion_id', ids), 'leer las revisiones de los retoques') as { revision_id: string | null }[] | null) ?? []) : []
      const revIds = [...new Set(ret.map((f) => f.revision_id).filter((x): x is string => typeof x === 'string' && x !== ''))]
      // la revisión se lee por el almacén de la JEFATURA (colaterales no nombra sus tablas, como la cadena) · si la base falla, lanza
      const jefatura = almacenDeJefatura(db as never)
      type Rev = { estado: string; gasto_usd: number }
      const revs = (await Promise.all(revIds.map((id) => jefatura.leerRevision(id)))).filter((f): f is NonNullable<typeof f> => f !== null) as Rev[]
      const terminal = (f: Rev) => (ESTADOS_TERMINALES as readonly string[]).includes(f.estado)
      const revisiones = revs.filter(terminal).reduce((t, f) => t + (Number(f.gasto_usd) || 0), 0)
      const revisiones_abiertas = revs.filter((f) => !terminal(f)).length
      return { recibos, en_vuelo, revisiones, revisiones_abiertas }
    },
    async gastoDeLaEdicion(e) {
      const llaves = { secretaria: llaveDeLaSecretaria(e.id), rehacer: llaveDelRehacer(e.id) }
      type Despacho = { dispatch_key: string; workflow_execution_id: string | null }
      const desp = (ok(await db.from('agent_dispatches').select('dispatch_key, workflow_execution_id').in('dispatch_key', [llaves.secretaria, llaves.rehacer]), 'leer las llamadas de la edición') as Despacho[] | null) ?? []
      const ex = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null)
      // la primera llamada se reconoce también por la ejecución de la edición (si el flujo no pasó la llave)
      const llamadas = desp.filter((d) => d.dispatch_key === llaves.secretaria || d.dispatch_key === llaves.rehacer).map((d) => ({ tipo: d.dispatch_key === llaves.rehacer ? 'rehacer' : 'secretaria', ex: ex(d.workflow_execution_id) }))
      if (!llamadas.some((l) => l.tipo === 'secretaria') && ex(e.workflow_execution_id)) llamadas.push({ tipo: 'secretaria', ex: ex(e.workflow_execution_id) })
      const ejecuciones = [...new Set(llamadas.map((l) => l.ex).filter((x): x is string => x !== null))]
      type Recibo = { workflow_execution_id: string; cost_usd: number | null }
      const rec = ejecuciones.length ? ((ok(await db.from('agent_invocations').select('workflow_execution_id, cost_usd').in('workflow_execution_id', ejecuciones), 'leer los recibos de la edición') as Recibo[] | null) ?? []) : []
      const porEjecucion = new Map<string, number>()
      for (const r of rec) porEjecucion.set(r.workflow_execution_id, (porEjecucion.get(r.workflow_execution_id) ?? 0) + (Number(r.cost_usd) || 0))
      let cobrado = 0, secretaria_sin_recibo = 0, rehacer_sin_recibo = 0
      const contadas = new Set<string>()
      for (const l of llamadas) {
        if (l.ex && porEjecucion.has(l.ex)) { if (!contadas.has(l.ex)) { cobrado += porEjecucion.get(l.ex) as number; contadas.add(l.ex) } continue }
        if (l.tipo === 'rehacer') rehacer_sin_recibo++; else secretaria_sin_recibo++
      }
      const ret = (ok(await db.from('colaterales_retoques').select('revision_id').eq('edicion_id', e.id), 'leer las revisiones de la edición') as { revision_id: string | null }[] | null) ?? []
      const revIds = [...new Set(ret.map((f) => f.revision_id).filter((x): x is string => typeof x === 'string' && x !== ''))]
      const jefatura = almacenDeJefatura(db as never)
      const revs = (await Promise.all(revIds.map((id) => jefatura.leerRevision(id)))).filter((f): f is NonNullable<typeof f> => f !== null) as { estado: string; gasto_usd: number }[]
      const terminal = (f: { estado: string }) => (ESTADOS_TERMINALES as readonly string[]).includes(f.estado)
      cobrado += revs.filter(terminal).reduce((t, f) => t + (Number(f.gasto_usd) || 0), 0)
      return { cobrado, secretaria_sin_recibo, rehacer_sin_recibo, revisiones_abiertas: revs.filter((f) => !terminal(f)).length }
    },
    async topeDiario(client_id) {
      type Tope = { tope_usd: number | string | null }
      const propio = (ok(await db.from('colaterales_topes_diarios').select('tope_usd').eq('client_id', client_id), 'leer el tope diario del cliente') as Tope[] | null) ?? []
      const fila = propio[0] ?? ((ok(await db.from('colaterales_topes_diarios').select('tope_usd').is('client_id', null), 'leer el tope diario por omisión') as Tope[] | null) ?? [])[0]
      const n = fila && fila.tope_usd !== null ? Number(fila.tope_usd) : NaN
      return Number.isFinite(n) && n > 0 ? n : null
    },
    abrirRevisionColateral: (entrada) => abrirRevisionConVuelta(db, entrada, RUTA_DE_VUELTA_DE_COLATERALES),
    aplicar: (edicion_id) => aplicarAprobados({ almacen, escritores: { estrategia }, leerFilasActivas: () => P.filasActivas() }, edicion_id),
  }
  return P
}
