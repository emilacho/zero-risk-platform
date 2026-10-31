/**
 * EL ADAPTADOR REAL de la mesa sobre Supabase: el directorio vivo (`oficina_directorio`) y el libro de aportes (`oficina_mesa_aportes`, solo se agrega).
 * Falla CERRADO: un error de lectura se lanza (nunca se lee como «directorio vacío»: una pieza con el directorio mal leído no abre). Un duplicado del número de aporte (23505) se reintenta con el siguiente.
 */
import type { Db } from '../almacen-supabase'
import { TIPOS_DE_APORTE, type Aporte, type NuevoAporte, type PuertoMesa, type Tarjeta, type TipoDeAporte } from './tipos'

type Fila = Record<string, unknown>
const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const textos = (x: unknown): string[] => lista<unknown>(x).map(String)

export const aTarjeta = (f: Fila): Tarjeta => ({
  agente: String(f.agente), rol: f.rol === 'direccion' || f.rol === 'portero' ? f.rol : 'miembro', especialidad: String(f.especialidad ?? ''),
  sabe_hacer: textos(f.sabe_hacer), necesita: textos(f.necesita), entrega: textos(f.entrega), pertinente_en: textos(f.pertinente_en), ...(textos(f.indicacion).length ? { indicacion: textos(f.indicacion) } : {}), activo: f.activo !== false, version: Number(f.version ?? 1),
})
export const aAporte = (f: Fila): Aporte => ({
  id: String(f.id), encargo_id: String(f.encargo_id), n: Number(f.n), de: String(f.de), para: f.para == null ? null : String(f.para),
  tipo: (TIPOS_DE_APORTE as readonly string[]).includes(String(f.tipo)) ? (f.tipo as TipoDeAporte) : 'nota', texto: String(f.texto ?? ''), refs: textos(f.refs),
  responde_a: f.responde_a == null ? null : String(f.responde_a), profundidad: Number(f.profundidad ?? 0), costo_usd: Number(f.costo_usd ?? 0),
  workflow_execution_id: f.workflow_execution_id == null ? null : String(f.workflow_execution_id), creado_en: String(f.creado_en ?? ''),
})

export function puertoDeLaMesa(db: Db): PuertoMesa {
  return {
    async directorio() {
      const r = await db.from('oficina_directorio').select('*').eq('activo', true).order('agente', { ascending: true })
      if (r.error) throw new Error(`directorio de la mesa: ${r.error.message}`)
      return lista<Fila>(r.data).map(aTarjeta)
    },
    async configDeLaCadena(clave) {
      const r = await db.from('cadena_config').select('valor').eq('clave', clave).maybeSingle()
      if (r.error) throw new Error(`config de la cadena (${clave}): ${r.error.message}`)
      return (r.data as Fila | null)?.valor
    },
    async libro(encargoId) {
      const r = await db.from('oficina_mesa_aportes').select('*').eq('encargo_id', encargoId).order('n', { ascending: true })
      if (r.error) throw new Error(`libro de la mesa: ${r.error.message}`)
      return lista<Fila>(r.data).map(aAporte)
    },
    async aportar(a: NuevoAporte) {
      for (let intento = 0; intento < 4; intento++) {
        const u = await db.from('oficina_mesa_aportes').select('n').eq('encargo_id', a.encargo_id).order('n', { ascending: false }).limit(1)
        if (u.error) return { ok: false as const, error: `libro: ${u.error.message}` }
        const n = Number(lista<Fila>(u.data)[0]?.n ?? 0) + 1
        const ins = await db.from('oficina_mesa_aportes').insert({
          encargo_id: a.encargo_id, n, de: a.de, para: a.para, tipo: a.tipo, texto: a.texto, refs: a.refs, responde_a: a.responde_a, profundidad: a.profundidad, costo_usd: a.costo_usd, workflow_execution_id: a.workflow_execution_id,
        }).select('*').single()
        if (!ins.error && ins.data) return { ok: true as const, aporte: aAporte(ins.data as Fila) }
        if (ins.error?.code !== '23505') return { ok: false as const, error: `libro: ${ins.error?.message ?? 'sin fila'}` }
      }
      return { ok: false as const, error: 'libro: no se pudo reservar un número de aporte tras 4 intentos' }
    },
  }
}
