/**
 * LOS CLIENTES QUE EL PORTERO ATIENDE · «cliente activo» = ALTA REALIZADA: manual de marca Y plan de 90 días real, ni de prueba, ni archivado, ni dado de baja.
 * Es el mismo criterio que usaba el plan viejo del diario (`diario/plan`, RETIRADO): vive aquí para que el flujo no dependa de rutas retiradas. Solo LEE.
 */
export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ClienteActivo { client_id: string; nombre: string | null }
export interface ResultadoDeClientes { clientes: ClienteActivo[]; excluidos: Array<{ client_id: string; motivos: string[] }> }

export async function clientesActivos(db: Db): Promise<{ ok: true; datos: ResultadoDeClientes } | { ok: false; detalle: string }> {
  const q = await db.from('clients').select('id, name, status, archived_at, config').order('created_at', { ascending: true }).limit(500)
  if (q.error) return { ok: false, detalle: `clients: ${q.error.message}` }
  const out: ResultadoDeClientes = { clientes: [], excluidos: [] }
  for (const c of lista(q.data)) {
    const id = String(c.id)
    const motivos: string[] = []
    if (/^prueba/i.test(id) || /^prueba/i.test(String(c.name ?? ''))) motivos.push('cliente de prueba')
    if (c.archived_at) motivos.push('archivado')
    if (['churned', 'archived', 'inactive', 'lost', 'cancelled'].includes(String(c.status))) motivos.push(`dado de baja (${String(c.status)})`)
    const mb = await db.from('client_brand_books').select('id').eq('client_id', id).limit(1)
    if (mb.error) return { ok: false, detalle: `client_brand_books: ${mb.error.message}` }
    if (!lista(mb.data).length) motivos.push('sin manual de marca')
    const pl = await db.from('client_historical_outputs').select('id, provenance_tag').eq('client_id', id).eq('output_type', 'campaign_plan_90d').limit(5)
    if (pl.error) return { ok: false, detalle: `client_historical_outputs: ${pl.error.message}` }
    const planReal = lista(pl.data).filter((p) => !(esObjeto(p.provenance_tag) && Object.keys(p.provenance_tag).some((k) => k.startsWith('prueba'))))
    if (!planReal.length) motivos.push('sin plan de 90 días')
    if (motivos.length) out.excluidos.push({ client_id: id, motivos })
    else out.clientes.push({ client_id: id, nombre: (c.name as string | null) ?? null })
  }
  return { ok: true, datos: out }
}
