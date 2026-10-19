/**
 * Los puertos de «la puerta crea la ficha por nombre» sobre Supabase (CC#1 · 19-oct). Solo toca `clients`: busca por slug, crea, cuenta las creadas por esta puerta y borra la que ella misma acaba de crear.
 */
import { ORIGEN_PUERTA, type FichaCreadaHoy, type FichaNueva, type PuertosDeFicha } from './ficha-por-nombre'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

export function puertosDeFicha(db: Db): PuertosDeFicha {
  return {
    ahora: () => new Date(),
    async buscarPorSlug(slug) {
      const r = await db.from('clients').select('id,name').eq('slug', slug).maybeSingle()
      if (r.error) throw new Error('no pude leer clients: ' + r.error.message)
      return r.data ? { id: String((r.data as Fila).id), name: String((r.data as Fila).name) } : null
    },
    async crear(f: FichaNueva) {
      const r = await db.from('clients').insert({ name: f.name, slug: f.slug, status: 'onboarding', preferred_language: 'es', ...(f.industry ? { industry: f.industry } : {}), ...(f.country ? { country: f.country } : {}), ...(f.website_url ? { website_url: f.website_url } : {}), config: f.config }).select('id').single()
      if (r.error) {
        const e = new Error('no pude crear la ficha: ' + r.error.message) as Error & { code?: string }
        if (r.error.code === '23505') e.code = 'duplicado'
        throw e
      }
      return { id: String((r.data as Fila).id) }
    },
    async creadasPorLaPuerta(desdeIso): Promise<FichaCreadaHoy[]> {
      const r = await db.from('clients').select('id,created_at').filter('config->>creado_por', 'eq', ORIGEN_PUERTA).gte('created_at', desdeIso).order('created_at', { ascending: true }).order('id', { ascending: true })
      if (r.error) throw new Error('no pude contar las fichas del día: ' + r.error.message)
      return ((r.data as Fila[] | null) ?? []).map((f) => ({ id: String(f.id), created_at: String(f.created_at) }))
    },
    async borrar(id) {
      const r = await db.from('clients').delete().eq('id', id)
      if (r.error) throw new Error('no pude deshacer la ficha de más: ' + r.error.message)
    },
  }
}
