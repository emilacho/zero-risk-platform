/** La espera de la oficina financiera sobre `esperas_del_dueno` (tipo `finanzas`) y `plan_corridas`. Sin lógica: solo traduce el puerto de `pausa.ts` a consultas. */
import type { Db } from '../almacen-supabase'
import type { DespertarAlPlan, EsperaDeFinanzas, PuertoDeEsperas } from './pausa'

type Fila = Record<string, unknown>
const TABLA = 'esperas_del_dueno'
const COLS = 'id,client_id,clave,estado,sobre,despertado,despertar_intentos,actualizado_en'
const claveDe = (encargo_id: string) => `finanzas:${encargo_id}`

function aEspera(f: Fila): EsperaDeFinanzas {
  const sobre = (f.sobre && typeof f.sobre === 'object' ? f.sobre : {}) as Record<string, unknown>
  return {
    id: String(f.id), client_id: String(f.client_id), encargo_id: String(f.clave).replace(/^finanzas:/, ''), corrida: typeof sobre.corrida === 'string' ? sobre.corrida : null,
    estado: f.estado as EsperaDeFinanzas['estado'], sobre, despertado: typeof f.despertado === 'boolean' ? f.despertado : null, intentos_de_despertar: Number(f.despertar_intentos ?? 0), despertado_en: typeof f.actualizado_en === 'string' ? f.actualizado_en : null,
  }
}

export function esperasDeFinanzas(db: Db): PuertoDeEsperas {
  const leer = async (col: string, valor: string): Promise<EsperaDeFinanzas | null> => {
    const r = await db.from(TABLA).select(COLS).eq('tipo', 'finanzas').eq(col, valor).limit(1)
    if (r.error) throw new Error(`no pude leer la espera: ${r.error.message}`)
    const f = (r.data as Fila[] | null)?.[0]
    return f ? aEspera(f) : null
  }
  return {
    async guardar(f) {
      const r = await db.from(TABLA).insert({ client_id: f.client_id, tipo: 'finanzas', clave: claveDe(f.encargo_id), sobre: f.sobre, sobre_de_reanudacion: { material: f.material, sobre: f.sobre }, estado: 'esperando', workflow_id: f.workflow_id, workflow_execution_id: f.workflow_execution_id }).select('id')
      if (!r.error) return { ok: true, id: String((r.data as Fila[])[0].id), nueva: true }
      if (r.error.code !== '23505') return { ok: false, error: r.error.message }
      const ya = await leer('clave', claveDe(f.encargo_id))
      return ya ? { ok: true, id: ya.id, nueva: false } : { ok: false, error: 'la espera chocó y no se pudo releer' }
    },
    delEncargo: (encargo_id) => leer('clave', claveDe(encargo_id)),
    async vivaDelCliente(client_id) {
      const r = await db.from(TABLA).select(COLS).eq('tipo', 'finanzas').eq('estado', 'esperando').eq('client_id', client_id).limit(1)
      if (r.error) throw new Error(`no pude leer la espera del cliente: ${r.error.message}`)
      const f = (r.data as Fila[] | null)?.[0]
      return f ? aEspera(f) : null
    },
    async soltar(id, ahora) {
      const hora = ahora.toISOString()
      const r = await db.from(TABLA).update({ estado: 'soltada', soltada_por: 'respuesta_del_dueno', soltada_en: hora, actualizado_en: hora }).eq('id', id).eq('estado', 'esperando').select('id')
      if (r.error) throw new Error(`no pude soltar la espera: ${r.error.message}`)
      return ((r.data as Fila[] | null) ?? []).length > 0
    },
    async marcarDespertar(id, despertado, intentos, detalle) {
      const r = await db.from(TABLA).update({ despertado, despertar_intentos: intentos, despertar_detalle: detalle, actualizado_en: new Date().toISOString() }).eq('id', id)
      if (r.error) throw new Error(`no pude anotar el despertar: ${r.error.message}`)
    },
    async estadoDeLaCorrida(f) {
      if (!f.corrida) return { estado: null, otra_activa: false }
      const r = await db.from('plan_corridas').select('estado').eq('client_id', f.client_id).eq('corrida', f.corrida).limit(1)
      if (r.error) throw new Error(`no pude leer la corrida: ${r.error.message}`)
      const estado = (r.data as Fila[] | null)?.[0]?.estado
      const a = await db.from('plan_corridas').select('corrida').eq('client_id', f.client_id).in('estado', ['esperando', 'corriendo']).limit(1)
      if (a.error) throw new Error(`no pude leer las corridas activas: ${a.error.message}`)
      return { estado: typeof estado === 'string' ? estado : null, otra_activa: ((a.data as Fila[] | null) ?? []).length > 0 }
    },
    async pausarCorrida(corrida_id) {
      const r = await db.from('plan_corridas').update({ estado: 'en_pausa', motivo: 'la oficina financiera espera la respuesta del dueño', actualizado_en: new Date().toISOString() }).eq('id', corrida_id).eq('estado', 'corriendo')
      if (r.error) throw new Error(`no pude pausar la corrida: ${r.error.message}`)
    },
  }
}

/** vuelve a llamar al plan por su puerta de siempre, con la llave de despacho que esa puerta exige (05-nov · hallazgo de CC2: con la llave interna el plan moría en su primer paso tras contestar 200). La respuesta es solo «recibido»: la corrida dice después si arrancó, y `atenderPausa` lo revisa */
export function despertarPorElFlujo(p: { base?: string; llave?: string; fetchImpl?: typeof fetch }): DespertarAlPlan {
  return async (cuerpo) => {
    if (!p.base || !p.llave) return { ok: false, error: 'falta la dirección o la llave del plan: no se llamó a nadie' }
    try {
      const r = await (p.fetchImpl ?? fetch)(`${p.base.replace(/\/+$/, '')}/webhook/zero-risk/planeacion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sala-dispatch-key': p.llave }, body: JSON.stringify(cuerpo) })
      return r.ok ? { ok: true } : { ok: false, error: `el plan contestó ${r.status}` }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
}
