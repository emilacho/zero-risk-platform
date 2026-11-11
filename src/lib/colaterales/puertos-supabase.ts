/**
 * COLATERALES 2d · los PUERTOS REALES del turno (Supabase). Cada lectura lanza si la base falla (el turno frena: falla cerrado).
 *   · filas activas de la jefatura: `jefatura_grading_policies.is_active`, leídas en el instante;
 *   · guarda de piezas: la de la oficina (#1020), única que nombra sus tablas;
 *   · documentos de aguas abajo: SOLO los que tienen lector hoy (la estrategia, por el almacén de la cadena). Los demás vienen vacíos y la
 *     nota de la edición los declara «sin lector» (se suman con los escritores por tramo). La campaña: la del documento editado si es de
 *     una campaña; si es del cliente (manual, plan), su campaña VIVA real; sin campaña viva, nada que leer;
 *   · gasto del día: recibos de `agent_invocations` de las corridas de colaterales del cliente creadas hoy (UTC).
 * Agnóstico: ningún dato de un cliente.
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeSupabase } from '../cadena/almacen-supabase'
import type { Documento } from '../cadena/dependencias-de-documentos'
import { piezasPorPublicar } from '../oficina/piezas-por-publicar'
import { almacenDeColaterales, type Db, type Edicion } from './almacen'
import { escritorDeEstrategia } from './escritores'
import { DOCUMENTOS_DE_CAMPANA, type DocumentoLeido, type PuertosDelTurno } from './turno'

function ok<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

/** la campaña cuyos documentos se leen: la del documento editado, o la viva real del cliente */
export async function campanaDeLaEdicion(e: Pick<Edicion, 'client_id' | 'documento' | 'documento_ref'>, viva: (clientId: string) => Promise<{ id: string } | null>): Promise<string | null> {
  if (DOCUMENTOS_DE_CAMPANA.has(e.documento)) return e.documento_ref
  return (await viva(e.client_id))?.id ?? null
}

type Cadena = Pick<ReturnType<typeof almacenDeSupabase>, 'campanaViva' | 'ultimaEstrategia' | 'estrategiaEnVersion' | 'insertarEstrategiaSiLibre'>
export function puertosDeSupabase(db: Db = getSupabaseAdmin() as unknown as Db, ahora: () => Date = () => new Date(), cadena: Cadena = almacenDeSupabase()): PuertosDelTurno {
  const estrategia = escritorDeEstrategia(cadena)
  return {
    almacen: almacenDeColaterales(db),
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
    async gastoDelDia(client_id) {
      const hoy = ahora().toISOString().slice(0, 10) + 'T00:00:00Z'
      const ed = ok(await db.from('colaterales_ediciones').select('workflow_execution_id').eq('client_id', client_id).gte('created_at', hoy), 'leer las ediciones de hoy') as { workflow_execution_id: string | null }[] | null
      const ejecuciones = [...new Set((ed ?? []).map((f) => f.workflow_execution_id).filter((x): x is string => typeof x === 'string' && x !== ''))]
      if (!ejecuciones.length) return 0
      const rec = ok(await db.from('agent_invocations').select('cost_usd').in('workflow_execution_id', ejecuciones), 'leer los recibos de hoy') as { cost_usd: number | null }[] | null
      return (rec ?? []).reduce((s, f) => s + (Number(f.cost_usd) || 0), 0)
    },
  }
}
