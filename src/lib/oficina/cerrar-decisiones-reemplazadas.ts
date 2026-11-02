/**
 * El reloj de la oficina cierra lo que ya no espera a nadie (01-nov · firma de Emilio: solo lo vigente pide firma). La regla vive en `direccion/decisiones-reemplazadas`.
 * Se cierra sin borrar: queda `rejected` con `decision.vencida` (la bandeja no admite otro estado, y quien aprende de los rechazos ya ignora las vencidas) más `decision.reemplazada` y su motivo.
 * Lo que no se pueda leer no se cierra.
 */
import { esObjeto, texto, type Fila } from '../direccion/comun'
import { leerPlanesVigentes, motivoDeReemplazo } from '../direccion/decisiones-reemplazadas'

const CERRADOR = 'sistema · decisión reemplazada'
interface Lectura { data: unknown; error: { message: string } | null }
interface Consulta extends PromiseLike<Lectura> { eq(c: string, v: unknown): Consulta; in(c: string, v: unknown[]): Consulta; limit(n: number): Consulta }
interface Db { from(t: string): { select(c: string): Consulta; update(v: Fila): Consulta } }

export interface ResultadoDelCierre { revisadas: number; cerradas: Array<{ id: string; motivo: string }>; error: string | null }

/** el barrido del reloj. Nunca lanza. Solo escribe si la fila sigue pendiente: si el dueño decidió en ese instante, gana el dueño. */
export async function cerrarDecisionesReemplazadas(dbCrudo: unknown, ahora: Date, op: { dry_run?: boolean } = {}): Promise<ResultadoDelCierre> {
  const db = dbCrudo as Db
  try {
    const p = await db.from('hitl_queue').select('id, client_id, output_id, type, payload, metadata, created_at').eq('status', 'pending').limit(500)
    if (p.error) return { revisadas: 0, cerradas: [], error: p.error.message }
    const filas = ((p.data as Fila[] | null) ?? []).filter((f) => !(esObjeto(f.payload) && f.payload.dry_run === true) && !(esObjeto(f.metadata) && f.metadata.dry_run === true))
    const clientes = [...new Set(filas.map((f) => texto(f.client_id)).filter((c): c is string => !!c))]
    const vigentes = await leerPlanesVigentes(db, clientes)
    if (!vigentes) return { revisadas: filas.length, cerradas: [], error: 'no se pudieron leer los planes' }
    const cerradas: ResultadoDelCierre['cerradas'] = []
    const cuando = ahora.toISOString()
    for (const f of filas) {
      const motivo = motivoDeReemplazo(f, vigentes)
      if (!motivo) continue
      if (!op.dry_run) {
        const u = await db.from('hitl_queue').update({
          status: 'rejected', resolved_by: CERRADOR, reviewer: CERRADOR, resolved_at: cuando, decided_at: cuando, resolution_notes: `Reemplazada: ${motivo}`,
          decision: { decision: 'rejected', por: CERRADOR, cuando, vencida: true, reemplazada: true, motivo },
        }).eq('id', String(f.id)).eq('status', 'pending')
        if (u.error) return { revisadas: filas.length, cerradas, error: u.error.message }
      }
      cerradas.push({ id: String(f.id), motivo })
    }
    return { revisadas: filas.length, cerradas, error: null }
  } catch (e) {
    return { revisadas: 0, cerradas: [], error: e instanceof Error ? e.message : String(e) }
  }
}
