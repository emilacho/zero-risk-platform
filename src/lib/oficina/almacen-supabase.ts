/**
 * EL ALMACÉN REAL de la oficina sobre Supabase (las 9 tablas de la migración 202610090100, SIN aplicar todavía). Recibe el cliente de base por parámetro (así se prueba con una base falsa).
 * Falla CERRADO: si no puede leer la config, la oficina se considera APAGADA. Un error de lectura se lanza (nunca se lee como «vacío»); un duplicado esperado (23505) no es error.
 */
import type { FilaDeFormato } from './entrega'
import type { Almacen, Cambios, Encargo, NuevoEncargo, TurnoRegistrado } from './puertos'
import { CONFIG_APAGADA, type ConfigDeOficina } from './sobre'
import { estadoInicial, type Plantilla } from './tipos'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const DUPLICADO = '23505'

function ok<T>(r: { data: T; error: { message: string; code?: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}
const aEncargo = (f: Fila): Encargo => ({
  id: String(f.id), client_id: String(f.client_id), parte_id: String(f.parte_id), brief_id: String(f.brief_id), tipo_de_grupo: String(f.tipo_de_grupo), familia: String(f.familia),
  version_encargo: Number(f.version_encargo ?? 1), estado: f.estado as Encargo['estado'],
  estado_del_motor: (f.estado_del_motor && typeof f.estado_del_motor === 'object' && Object.keys(f.estado_del_motor as object).length ? f.estado_del_motor : estadoInicial()) as Encargo['estado_del_motor'],
  con_desacuerdo: f.con_desacuerdo === true, imagen_generada: f.imagen_generada === true, tope_usd: Number(f.tope_usd ?? 10), gasto_usd: Number(f.gasto_usd ?? 0),
  dry_run: f.dry_run === true, prueba: f.prueba === true, sala_ref: (f.sala_ref as Record<string, unknown> | null) ?? null,
  salida_output_id: (f.salida_output_id as string | null) ?? null, hitl_queue_id: (f.hitl_queue_id as string | null) ?? null,
})

export function almacenDeSupabase(db: Db): Almacen {
  return {
    async leerConfig(): Promise<ConfigDeOficina> {
      const r = await db.from('oficina_config').select('estado,familias_activas,clientes_ensayo').eq('id', 1).maybeSingle()
      if (r.error || !r.data) return CONFIG_APAGADA // sin config legible, apagada
      const d = r.data as Fila
      const estado = d.estado === 'ensayo' || d.estado === 'encendida' ? d.estado : 'apagada'
      return { estado, familias_activas: (d.familias_activas as string[]) ?? [], clientes_ensayo: (d.clientes_ensayo as string[]) ?? [] }
    },
    async leerPlantilla(familia) {
      const d = ok(await db.from('oficina_tipos_de_grupo').select('tipo,familia,pasos,indicaciones,limites,activo').eq('familia', familia).limit(1), 'leer la plantilla') as Fila[] | null
      const f = d?.[0]
      if (!f) return null
      const plantilla: Plantilla = { tipo: String(f.tipo), familia: String(f.familia), pasos: f.pasos as Plantilla['pasos'], indicaciones: (f.indicaciones ?? {}) as Plantilla['indicaciones'], limites: f.limites as Plantilla['limites'] }
      return { plantilla, activo: f.activo === true }
    },
    async leerFormato(red, formato): Promise<FilaDeFormato | null> {
      const d = ok(await db.from('oficina_entrega_formatos').select('*').eq('red', red).eq('formato', formato).limit(1), 'leer el formato de entrega') as Fila[] | null
      const f = d?.[0]
      if (!f) return null
      return { red: String(f.red), formato: String(f.formato), ancho: Number(f.ancho), alto: Number(f.alto), tipos_archivo: f.tipos_archivo as string[], peso_max_mb: Number(f.peso_max_mb), n_min: Number(f.n_min), n_max: Number(f.n_max), texto_max: Number(f.texto_max), hashtags_max: Number(f.hashtags_max), pasos_publicacion: (f.pasos_publicacion as string[]) ?? [], verificado: f.verificado === true }
    },
    async crearEncargo(n: NuevoEncargo) {
      const fila = { client_id: n.client_id, parte_id: n.parte_id, brief_id: n.brief_id, tipo_de_grupo: n.tipo_de_grupo, familia: n.familia, version_encargo: 1, estado: 'abierto', estado_del_motor: n.estado_del_motor, tope_usd: n.tope_usd, dry_run: n.dry_run, prueba: n.prueba, sala_ref: n.sala_ref }
      const r = await db.from('oficina_encargos').insert(fila).select('*').single()
      if (!r.error) return { ok: true as const, encargo: aEncargo(r.data as Fila), nuevo: true }
      if (r.error.code === DUPLICADO) {
        const e = await db.from('oficina_encargos').select('*').eq('parte_id', n.parte_id).eq('brief_id', n.brief_id).eq('tipo_de_grupo', n.tipo_de_grupo).eq('version_encargo', 1).limit(1)
        const f = (e.data as Fila[] | null)?.[0]
        if (f) return { ok: true as const, encargo: aEncargo(f), nuevo: false }
      }
      return { ok: false as const, error: r.error.message }
    },
    async leerEncargo(id) {
      const d = ok(await db.from('oficina_encargos').select('*').eq('id', id).limit(1), 'leer el encargo') as Fila[] | null
      return d?.[0] ? aEncargo(d[0]) : null
    },
    async turnoAbierto(encargoId): Promise<TurnoRegistrado | null> {
      const d = ok(await db.from('oficina_turnos').select('n,paso,tipo,agente,estado,dispatch_key,cost_usd').eq('encargo_id', encargoId).eq('estado', 'corriendo').order('n', { ascending: false }).limit(1), 'leer el paso abierto') as Fila[] | null
      const f = d?.[0]
      return f ? { n: Number(f.n), paso: String(f.paso), tipo: String(f.tipo), agente: (f.agente as string | null) ?? null, estado: 'corriendo', dispatch_key: (f.dispatch_key as string | null) ?? null, cost_usd: Number(f.cost_usd ?? 0) } : null
    },
    async guardar(c: Cambios) {
      const patch: Fila = { estado_del_motor: c.estado_del_motor, gasto_usd: c.gasto_usd }
      if (c.estado) { patch.estado = c.estado; if (c.estado === 'cerrado' || c.estado === 'cerrado_por_tope' || c.estado === 'fallido') patch.cerrado_en = new Date().toISOString() }
      if (c.con_desacuerdo !== undefined) patch.con_desacuerdo = c.con_desacuerdo
      if (c.imagen_generada !== undefined) patch.imagen_generada = c.imagen_generada
      if (c.salida_output_id !== undefined) patch.salida_output_id = c.salida_output_id
      if (c.hitl_queue_id !== undefined) patch.hitl_queue_id = c.hitl_queue_id
      ok(await db.from('oficina_encargos').update(patch).eq('id', c.encargo_id), 'actualizar el encargo')
      let turnoId: number | null = null
      if (c.turno) {
        const t = c.turno
        const fila = { encargo_id: c.encargo_id, n: t.n, paso: t.paso, tipo: t.tipo, agente: t.agente, estado: t.estado, dispatch_key: t.dispatch_key, workflow_execution_id: t.workflow_execution_id ?? null, cost_usd: t.cost_usd, tokens_in: t.tokens_in ?? null, tokens_out: t.tokens_out ?? null, error: t.error ?? null, ...(t.estado === 'corriendo' ? { inicio: new Date().toISOString() } : { fin: new Date().toISOString() }) }
        const r = await db.from('oficina_turnos').upsert(fila, { onConflict: 'encargo_id,n' }).select('id').single()
        turnoId = r.error ? null : Number((r.data as Fila).id)
        if (r.error) throw new Error(`guardar el paso: ${r.error.message}`)
      }
      if (c.artefacto) {
        const a = c.artefacto
        const r = await db.from('oficina_artefactos').insert({ encargo_id: c.encargo_id, turno_id: turnoId, tipo: a.tipo, version: a.version, contenido: a.contenido, sha256: a.sha256, autor: a.autor })
        if (r.error && r.error.code !== DUPLICADO) throw new Error(`guardar el artefacto: ${r.error.message}`)
      }
      if (c.fichas?.length) {
        const filas = c.fichas.map((f) => ({ encargo_id: c.encargo_id, ficha_id: f.id, turno_id: turnoId, origen: f.origen, donde: f.donde, gravedad: f.gravedad, que: f.que ?? null, contra_que: f.contra_que ?? null, propuesta: f.propuesta ?? null, estado: f.estado, razon: f.razon ?? null }))
        ok(await db.from('oficina_fichas').upsert(filas, { onConflict: 'encargo_id,ficha_id' }), 'guardar las fichas')
      }
      for (const g of c.gastos ?? []) {
        const r = await db.from('oficina_gastos').insert({ encargo_id: c.encargo_id, turno_id: turnoId, concepto: g.concepto, ref_tabla: g.ref_tabla, ref_id: g.ref_id, cost_usd: g.cost_usd, base: g.base })
        if (r.error && r.error.code !== DUPLICADO) throw new Error(`guardar el gasto: ${r.error.message}`) // una imagen/invocación ya sumada no se suma otra vez
      }
      for (const u of c.usos_de_fotos ?? []) {
        const enc = ok(await db.from('oficina_encargos').select('client_id').eq('id', c.encargo_id).limit(1), 'leer el cliente del encargo') as Fila[] | null
        const r = await db.from('oficina_uso_de_fotos').insert({ client_id: enc?.[0]?.client_id, foto_id: u.foto_id, encargo_id: c.encargo_id, rol: u.rol })
        if (r.error && r.error.code !== DUPLICADO) throw new Error(`guardar el uso de la foto: ${r.error.message}`)
      }
    },
  }
}
