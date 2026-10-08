/**
 * RECADOS DE LA SALA · PASO 1 · el almacén de la puerta sobre Supabase (las dos tablas `sala_recados` y `sala_destinos_de_recado`).
 * Es el ÚNICO archivo, con la ruta, que nombra esas tablas (lo vigila `__tests__/sala-recados-migracion.test.ts`). La migración NO está aplicada: hasta entonces nadie llega aquí.
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Almacen, Destino, FilaNueva, Recado } from './puerta'

const fallo = (e: { message?: string } | null): never => { throw new Error(e?.message ?? 'error de la base') }

export function almacenDeSupabase(): Almacen {
  const db = getSupabaseAdmin()
  return {
    async leerDestino(destino) {
      const { data, error } = await db.from('sala_destinos_de_recado').select('*').eq('destino', destino).maybeSingle()
      if (error) fallo(error)
      return (data as Destino | null) ?? null
    },
    async listarDestinos() {
      const { data, error } = await db.from('sala_destinos_de_recado').select('*').order('destino', { ascending: true }).limit(200)
      if (error) fallo(error)
      return (data as Destino[] | null) ?? []
    },
    async buscarAbierto(clientId, clave, prueba) {
      const { data, error } = await db.from('sala_recados').select('*').eq('client_id', clientId).eq('clave_de_agrupacion', clave).eq('prueba', prueba).in('estado', ['abierto', 'repartido']).limit(1)
      if (error) fallo(error)
      return ((data as Recado[] | null) ?? [])[0] ?? null
    },
    async buscarNoConseguidoReciente(clientId, clave, prueba, desdeIso) {
      const { data, error } = await db.from('sala_recados').select('*').eq('client_id', clientId).eq('clave_de_agrupacion', clave).eq('prueba', prueba).eq('estado', 'no_conseguido').gte('creado_en', desdeIso).order('id', { ascending: false }).limit(1)
      if (error) fallo(error)
      return ((data as Recado[] | null) ?? [])[0] ?? null
    },
    async contarAbiertos(clientId, prueba) {
      const { count, error } = await db.from('sala_recados').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('prueba', prueba).in('estado', ['abierto', 'repartido'])
      if (error) fallo(error)
      return count ?? 0
    },
    async abiertosDe(clientId, prueba) {
      const { data, error } = await db.from('sala_recados').select('*').eq('client_id', clientId).eq('prueba', prueba).in('estado', ['abierto', 'repartido']).order('id', { ascending: true }).limit(200)
      if (error) fallo(error)
      return (data as Recado[] | null) ?? []
    },
    async leerPorId(id) {
      const { data, error } = await db.from('sala_recados').select('*').eq('id', id).maybeSingle()
      if (error) fallo(error)
      return (data as Recado | null) ?? null
    },
    async insertar(fila: FilaNueva) {
      const { data, error } = await db.from('sala_recados').insert(fila).select().single()
      if (error) return { ok: false as const, duplicado: (error as { code?: string }).code === '23505', detalle: error.message }
      return { ok: true as const, recado: data as Recado }
    },
    async cerrar(id, patch) {
      const { data, error } = await db.from('sala_recados').update(patch).eq('id', id).in('estado', ['abierto', 'repartido']).select().maybeSingle()
      if (error) fallo(error)
      return (data as Recado | null) ?? null
    },
  }
}
