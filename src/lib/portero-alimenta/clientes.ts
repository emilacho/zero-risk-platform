/**
 * LOS CLIENTES QUE EL PORTERO ATIENDE · «cliente activo» = ALTA REALIZADA: manual de marca Y (plan de 90 días real O cerebro ya despertado con el alta), ni de prueba, ni archivado, ni dado de baja.
 * (15-oct · firma de Emilio) el plan de 90 días no es requisito para quien ya despertó: el cerebro sigue trabajando desde el despertar.
 * Es el mismo criterio que usaba el plan viejo del diario (`diario/plan`, RETIRADO): vive aquí para que el flujo no dependa de rutas retiradas. Solo LEE.
 */
export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ClienteActivo { client_id: string; nombre: string | null }
export interface ResultadoDeClientes { clientes: ClienteActivo[]; excluidos: Array<{ client_id: string; motivos: string[] }> }

/** ¿el cerebro de este cliente despertó con el alta (un rastro `hecha` con `tipo = despertar` o con el cierre del despertar arrastrado)? */
function huboDespertar(filas: Fila[]): boolean {
  return filas.some((f) => f.estado === 'hecha' && esObjeto(f.resumen) && (f.resumen.tipo === 'despertar' || esObjeto(f.resumen.despertar)))
}

export async function clientesActivos(db: Db): Promise<{ ok: true; datos: ResultadoDeClientes } | { ok: false; detalle: string }> {
  const q = await db.from('clients').select('id, name, status, archived_at, config').order('created_at', { ascending: true }).limit(500)
  if (q.error) return { ok: false, detalle: `clients: ${q.error.message}` }
  const out: ResultadoDeClientes = { clientes: [], excluidos: [] }
  for (const c of lista(q.data)) {
    const id = String(c.id)
    const motivos: string[] = []
    // la bandera es explícita en la ficha (`config.es_de_prueba = true`); un cliente real llamado «Pruebas…» ya no se excluye por su nombre. Los ids de las pruebas del portero (`prueba-…`) siguen siendo de prueba.
    if (/^prueba/i.test(id) || (esObjeto(c.config) && c.config.es_de_prueba === true)) motivos.push('cliente de prueba')
    if (c.archived_at) motivos.push('archivado')
    if (['churned', 'archived', 'inactive', 'lost', 'cancelled'].includes(String(c.status))) motivos.push(`dado de baja (${String(c.status)})`)
    const mb = await db.from('client_brand_books').select('id').eq('client_id', id).limit(1)
    if (mb.error) return { ok: false, detalle: `client_brand_books: ${mb.error.message}` }
    if (!lista(mb.data).length) motivos.push('sin manual de marca')
    const pl = await db.from('client_historical_outputs').select('id, provenance_tag').eq('client_id', id).eq('output_type', 'campaign_plan_90d').limit(5)
    if (pl.error) return { ok: false, detalle: `client_historical_outputs: ${pl.error.message}` }
    const planReal = lista(pl.data).filter((p) => !(esObjeto(p.provenance_tag) && Object.keys(p.provenance_tag).some((k) => k.startsWith('prueba'))))
    if (!planReal.length) {
      // 15-oct (firma de Emilio): el cliente cuyo cerebro YA despertó con el alta entra a la corrida diaria aunque su plan de 90 días aún no exista
      const dp = await db.from('cerebro_portero_corridas').select('estado, resumen').eq('client_id', id).order('dia', { ascending: false }).limit(60)
      if (dp.error) return { ok: false, detalle: `cerebro_portero_corridas: ${dp.error.message}` }
      if (!huboDespertar(lista(dp.data))) motivos.push('sin plan de 90 días')
    }
    if (motivos.length) out.excluidos.push({ client_id: id, motivos })
    else out.clientes.push({ client_id: id, nombre: (c.name as string | null) ?? null })
  }
  return { ok: true, datos: out }
}
