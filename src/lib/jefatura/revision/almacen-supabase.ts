/**
 * EL ALMACÉN REAL de la jefatura (oficina propia) sobre Supabase: las 4 tablas de la migración 202610131000 (J1, aún SIN aplicar en producción). Recibe el cliente de base por parámetro (así se prueba con una base falsa).
 * Falla CERRADO: si no puede leer la config, la jefatura se considera APAGADA. Un error de lectura se LANZA (nunca se lee como «vacío»); un duplicado esperado (23505) no es error.
 */
import { estadoInicial } from '../../revision-comun'
import type { Marcas } from './contrato'
import { politicaDeFila, type PoliticaDeRevision } from './politicas'
import { CONFIG_APAGADA, ESTADOS_TERMINALES, type Almacen, type CambiosDeRevision, type ConfigDeJefatura, type LecturaDePolitica, type NuevaRevision, type PasoRegistrado, type Revision } from './puertos'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const DUPLICADO = '23505'

function ok<T>(r: { data: T; error: { message: string; code?: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

const marcasDe = (v: unknown): Marcas => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { con_desacuerdo: o.con_desacuerdo === true, sin_segunda_mirada: o.sin_segunda_mirada === true }
}

function aRevision(f: Fila): Revision {
  const snap = f.policy_snapshot
  if (!snap || typeof snap !== 'object' || Object.keys(snap as object).length === 0) throw new Error(`la revisión ${String(f.id)} no trae su política (policy_snapshot vacío)`)
  const e = f.estado_del_motor
  return {
    id: String(f.id), client_id: String(f.client_id), artifact_type: f.artifact_type as Revision['artifact_type'], artifact_id: String(f.artifact_id), version: Number(f.version ?? 1),
    journey_id: (f.journey_id as string | null) ?? null, estado: f.estado as Revision['estado'], resultado: (f.resultado as Revision['resultado'] | null) ?? null, marcas: marcasDe(f.marcas),
    estado_del_motor: (e && typeof e === 'object' && Object.keys(e as object).length ? e : estadoInicial()) as Revision['estado_del_motor'],
    productores: (Array.isArray(f.productores) ? f.productores : []) as Revision['productores'], entrada: (f.entrada ?? {}) as Revision['entrada'], devolver_a: (f.devolver_a as Revision['devolver_a']) ?? null,
    policy: snap as PoliticaDeRevision, tope_usd: Number(f.tope_usd ?? 10), gasto_usd: Number(f.gasto_usd ?? 0), dry_run: f.dry_run === true, prueba: f.prueba === true,
  }
}

export function almacenDeSupabase(db: Db): Almacen {
  return {
    async leerConfig(): Promise<ConfigDeJefatura> {
      const r = await db.from('jefatura_config').select('estado,tipos_activos,clientes_ensayo').eq('id', 1).maybeSingle()
      if (r.error || !r.data) return CONFIG_APAGADA // sin config legible, apagada
      const d = r.data as Fila
      const estado = d.estado === 'ensayo' || d.estado === 'encendida' ? d.estado : 'apagada'
      return { estado, tipos_activos: (d.tipos_activos as string[]) ?? [], clientes_ensayo: (d.clientes_ensayo as string[]) ?? [] }
    },
    async leerPolitica(tipo): Promise<LecturaDePolitica> {
      const d = ok(await db.from('jefatura_grading_policies').select('*').eq('artifact_type', tipo).limit(1), 'leer la política') as Fila[] | null
      const f = d?.[0]
      if (!f) return { ok: false, error: `no hay renglón de política para «${tipo}»`, existe: false }
      const p = politicaDeFila(f)
      return p.ok ? { ok: true, politica: p.politica, activa: f.is_active === true } : { ok: false, error: p.error, existe: true }
    },
    async crearRevision(n: NuevaRevision) {
      const fila = {
        client_id: n.client_id, artifact_type: n.artifact_type, artifact_id: n.artifact_id, version: n.version, journey_id: n.journey_id, estado: 'abierta', estado_del_motor: n.estado_del_motor,
        productores: n.productores, entrada: n.entrada, devolver_a: n.devolver_a, policy_snapshot: n.policy, tope_usd: n.tope_usd, dry_run: n.dry_run, prueba: n.prueba,
      }
      const r = await db.from('jefatura_revisiones').insert(fila).select('*').single()
      if (!r.error) return { ok: true as const, revision: aRevision(r.data as Fila), nuevo: true }
      if (r.error.code === DUPLICADO) {
        const e = await db.from('jefatura_revisiones').select('*').eq('artifact_type', n.artifact_type).eq('artifact_id', n.artifact_id).eq('version', n.version).eq('dry_run', n.dry_run).limit(1)
        const f = (e.data as Fila[] | null)?.[0]
        if (f) return { ok: true as const, revision: aRevision(f), nuevo: false }
      }
      return { ok: false as const, error: r.error.message }
    },
    async leerRevision(id) {
      const d = ok(await db.from('jefatura_revisiones').select('*').eq('id', id).limit(1), 'leer la revisión') as Fila[] | null
      return d?.[0] ? aRevision(d[0]) : null
    },
    async pasoAbierto(revisionId): Promise<PasoRegistrado | null> {
      const d = ok(await db.from('jefatura_pasos').select('n,paso,intento,tipo,agente,estado,dispatch_key,cost_usd,concepto,base').eq('revision_id', revisionId).eq('estado', 'corriendo').order('n', { ascending: false }).limit(1), 'leer el paso abierto') as Fila[] | null
      const f = d?.[0]
      return f ? { n: Number(f.n), paso: String(f.paso), intento: Number(f.intento ?? 1), tipo: f.tipo as PasoRegistrado['tipo'], agente: (f.agente as string | null) ?? null, estado: 'corriendo', dispatch_key: (f.dispatch_key as string | null) ?? null, concepto: (f.concepto as PasoRegistrado['concepto']) ?? 'modelo', base: (f.base as PasoRegistrado['base']) ?? 'usage', cost_usd: Number(f.cost_usd ?? 0) } : null
    },
    async pasosCorriendoAntesDe(iso) {
      const d = ok(await db.from('jefatura_pasos').select('revision_id,n,paso').eq('estado', 'corriendo').lt('inicio', iso), 'leer los pasos vivos') as Fila[] | null
      return (d ?? []).map((f) => ({ revision_id: String(f.revision_id), n: Number(f.n), paso: String(f.paso) }))
    },
    async guardar(c: CambiosDeRevision) {
      const patch: Fila = { estado_del_motor: c.estado_del_motor, gasto_usd: c.gasto_usd }
      if (c.estado) { patch.estado = c.estado; if ((ESTADOS_TERMINALES as readonly string[]).includes(c.estado)) patch.cerrado_en = new Date().toISOString() }
      if (c.resultado) patch.resultado = c.resultado
      if (c.marcas) patch.marcas = c.marcas
      ok(await db.from('jefatura_revisiones').update(patch).eq('id', c.revision_id), 'actualizar la revisión')
      let pasoId: number | null = null
      if (c.paso) {
        const t = c.paso
        const ahora = new Date().toISOString()
        const fila: Fila = {
          revision_id: c.revision_id, n: t.n, paso: t.paso, intento: t.intento, tipo: t.tipo, agente: t.agente, estado: t.estado, dispatch_key: t.dispatch_key, workflow_id: t.workflow_id ?? null, workflow_execution_id: t.workflow_execution_id ?? null,
          concepto: t.concepto, base: t.base, cost_usd: t.cost_usd, tokens_in: t.tokens_in ?? null, tokens_out: t.tokens_out ?? null, error: t.error ?? null, traza: t.traza ?? {},
          // el reloj del vigía (`inicio`) arranca al ENTREGAR el pedido; un paso que se cierra no pisa su hora de inicio
          ...(t.estado === 'corriendo' || t.tipo !== 'agente' ? { inicio: ahora } : {}), ...(t.estado !== 'corriendo' && t.estado !== 'pendiente' ? { fin: ahora } : {}),
        }
        const r = await db.from('jefatura_pasos').upsert(fila, { onConflict: 'revision_id,n' }).select('id').single()
        if (r.error) throw new Error(`guardar el paso: ${r.error.message}`)
        pasoId = Number((r.data as Fila).id)
      }
      if (c.fichas?.length) {
        const filas = c.fichas.map((f) => ({ revision_id: c.revision_id, ficha_id: f.id, paso_id: pasoId, origen: f.origen, donde: f.donde, gravedad: f.gravedad, que: f.que ?? null, contra_que: f.contra_que ?? null, propuesta: f.propuesta ?? null, estado: f.estado, razon: f.razon ?? null }))
        ok(await db.from('jefatura_fichas').upsert(filas, { onConflict: 'revision_id,ficha_id' }), 'guardar las fichas')
      }
    },
  }
}
