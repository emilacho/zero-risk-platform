/**
 * F8 · el almacén REAL de la conversación financiera (`finanzas_encargos`, `finanzas_turnos`, `finanzas_artefactos`). Recibe la base por parámetro (se prueba sin red).
 * NADA de esto corre con el interruptor `conversa` apagado (la ruta devuelve 409 antes). Un turno = una fila; un artefacto = una fila por versión.
 */
import { estadoInicial } from '../../oficina/tipos'
import type { Db } from '../almacen-supabase'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, TurnoDeConversa } from './puertos'

type Fila = Record<string, unknown>
function ok<T>(r: { data: T; error: { message: string; code?: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

function aEncargo(f: Fila): EncargoDeConversa {
  const motor = f.estado_del_motor && typeof f.estado_del_motor === 'object' && Object.keys(f.estado_del_motor as object).length ? f.estado_del_motor : estadoInicial()
  return {
    id: String(f.id), client_id: String(f.client_id), estado: f.estado as EncargoDeConversa['estado'],
    estado_del_motor: motor as EncargoDeConversa['estado_del_motor'], gasto_usd: Number(f.gasto_usd ?? 0),
    slack_canal: (f.slack_canal as string | null) ?? null, slack_ts: (f.slack_ts as string | null) ?? null, leido_hasta: (f.leido_hasta as string | null) ?? null,
    tablero_id: (f.tablero_id as string | null) ?? null, dry_run: f.dry_run === true, semilla: (f.semilla as EncargoDeConversa['semilla']) ?? {},
  }
}

export function almacenDeConversa(db: Db): AlmacenDeConversa {
  return {
    async crearEncargo(n) {
      try {
        // una sola conversación ABIERTA por cliente: si hay una, se devuelve esa (no se abre otra ni se pisa)
        const abiertos = ok(await db.from('finanzas_encargos').select('*').eq('client_id', n.client_id).in('estado', ['abierto', 'en_curso']).limit(1), 'leer el abierto') as Fila[] | null
        if (abiertos?.[0]) return { ok: true as const, encargo: aEncargo(abiertos[0]), nuevo: false }
        const fila = { client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, dry_run: n.dry_run, semilla: n.semilla }
        const r = await db.from('finanzas_encargos').insert(fila).select('*').single()
        if (r.error) {
          // la carrera: otro la abrió entre la lectura y el insert (índice único parcial, 23505) → se devuelve la que ganó
          if (r.error.code === '23505') {
            const otra = ok(await db.from('finanzas_encargos').select('*').eq('client_id', n.client_id).in('estado', ['abierto', 'en_curso']).limit(1), 'releer el abierto') as Fila[] | null
            if (otra?.[0]) return { ok: true as const, encargo: aEncargo(otra[0]), nuevo: false }
          }
          return { ok: false as const, error: r.error.message }
        }
        return { ok: true as const, encargo: aEncargo(r.data as Fila), nuevo: true }
      } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) } }
    },
    async leerEncargo(id) {
      const r = ok(await db.from('finanzas_encargos').select('*').eq('id', id).maybeSingle(), 'leer el encargo') as Fila | null
      return r ? aEncargo(r) : null
    },
    async guardar(c: CambiosDeEncargo) {
      // primero el turno y el artefacto (son append-only e idempotentes por su clave única), después el estado: si cae a medias, el motor repite el MISMO paso
      if (c.turno) {
        const t = c.turno
        ok(await db.from('finanzas_turnos').upsert({ encargo_id: c.encargo_id, n: t.n, paso: t.paso, agente: t.agente, ronda: t.ronda, estado: t.estado, costo_usd: t.costo_usd, salida: t.salida ?? null, error: t.error ?? null }, { onConflict: 'encargo_id,n' }), 'guardar el turno')
      }
      if (c.artefacto) {
        const a = c.artefacto
        ok(await db.from('finanzas_artefactos').upsert({ encargo_id: c.encargo_id, tipo: a.tipo, version: a.version, contenido: a.contenido, sha256: a.sha256 }, { onConflict: 'encargo_id,tipo,version' }), 'guardar el artefacto')
      }
      const patch: Fila = { estado_del_motor: c.estado_del_motor, gasto_usd: c.gasto_usd, actualizado_en: new Date().toISOString() }
      for (const k of ['estado', 'slack_canal', 'slack_ts', 'leido_hasta', 'tablero_id'] as const) if (c[k] !== undefined) patch[k] = c[k]
      ok(await db.from('finanzas_encargos').update(patch).eq('id', c.encargo_id), 'guardar el encargo')
    },
    async artefactos(encargo_id) {
      const r = ok(await db.from('finanzas_artefactos').select('tipo,version,contenido').eq('encargo_id', encargo_id).order('version', { ascending: true }), 'leer los artefactos') as Fila[] | null
      const out: Record<string, Record<string, unknown>> = {}
      // el de mayor versión de cada tipo gana (vienen en orden ascendente)
      for (const f of r ?? []) out[String(f.tipo)] = f.contenido as Record<string, unknown>
      return out
    },
    async tomarPaso(id, ahora, ttl_s) {
      try {
        const vencido = new Date(ahora.getTime() - ttl_s * 1000).toISOString()
        const r = await db.from('finanzas_encargos').update({ en_vuelo_desde: ahora.toISOString() }).eq('id', id).or(`en_vuelo_desde.is.null,en_vuelo_desde.lt.${vencido}`).select('id')
        if (r.error) {
          const sinColumna = r.error.code === '42703' || /en_vuelo_desde/i.test(String(r.error.message))
          return { ok: false as const, error: r.error.message, ...(sinColumna ? { sin_columna: true } : {}) }
        }
        return { ok: true as const, tomado: Array.isArray(r.data) && r.data.length > 0 }
      } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) } }
    },
    async soltarPaso(id) {
      try { await db.from('finanzas_encargos').update({ en_vuelo_desde: null }).eq('id', id) } catch { /* el vencimiento lo libera */ }
    },
    async cobrado(encargo_id) {
      try {
        const r = await db.from('agent_invocations').select('cost_usd').like('workflow_execution_id', `${encargo_id}:%`)
        if (r.error || !Array.isArray(r.data)) return null
        return Math.round((r.data as Fila[]).reduce((s, f) => s + (Number(f.cost_usd) || 0), 0) * 1e6) / 1e6
      } catch { return null }
    },
    async gastoDeLaOficina(client_id) {
      try {
        const enc = await db.from('finanzas_encargos').select('id').eq('client_id', client_id)
        if (enc.error || !Array.isArray(enc.data)) return null
        const por_encargo: Record<string, number> = {}
        let total = 0
        for (const f of enc.data as Fila[]) {
          const r = await db.from('agent_invocations').select('cost_usd').like('workflow_execution_id', `${String(f.id)}:%`)
          if (r.error || !Array.isArray(r.data)) return null
          const s = Math.round((r.data as Fila[]).reduce((t, x) => t + (Number(x.cost_usd) || 0), 0) * 1e6) / 1e6
          por_encargo[String(f.id)] = s
          total += s
        }
        return { total_usd: Math.round(total * 1e6) / 1e6, por_encargo }
      } catch { return null }
    },
    async contarBuzon(client_id, ahora) {
      try {
        const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())).toISOString()
        const hace24 = new Date(ahora.getTime() - 24 * 3600 * 1000).toISOString()
        const desde = hace24 < inicioDia ? hace24 : inicioDia
        const a = await db.from('finanzas_artefactos').select('encargo_id,creado_en').eq('tipo', 'buzon_respuestas').eq('version', 1).gte('creado_en', desde)
        if (a.error || !Array.isArray(a.data)) return null
        const filas = a.data as Fila[]
        if (!filas.length) return { cliente_24h: 0, hoy: 0 }
        const enc = await db.from('finanzas_encargos').select('id,client_id').in('id', filas.map((f) => String(f.encargo_id)))
        if (enc.error || !Array.isArray(enc.data)) return null
        const cliente = new Map((enc.data as Fila[]).map((f) => [String(f.id), String(f.client_id)]))
        return {
          cliente_24h: filas.filter((f) => cliente.get(String(f.encargo_id)) === client_id && String(f.creado_en) >= hace24).length,
          hoy: filas.filter((f) => String(f.creado_en) >= inicioDia).length,
        }
      } catch { return null }
    },
    async guardarBuzon(c) {
      if (c.artefacto) {
        const a = c.artefacto
        ok(await db.from('finanzas_artefactos').upsert({ encargo_id: c.encargo_id, tipo: a.tipo, version: a.version, contenido: a.contenido, sha256: a.sha256 }, { onConflict: 'encargo_id,tipo,version' }), 'guardar el registro del buzón')
      }
      const patch: Fila = { actualizado_en: new Date().toISOString() }
      for (const k of ['slack_canal', 'slack_ts', 'leido_hasta', 'semilla'] as const) if (c[k] !== undefined) patch[k] = c[k]
      ok(await db.from('finanzas_encargos').update(patch).eq('id', c.encargo_id), 'guardar el buzón del encargo')
    },
    async turnos(encargo_id) {
      const r = ok(await db.from('finanzas_turnos').select('n,paso,agente,ronda,estado,costo_usd,salida,error').eq('encargo_id', encargo_id).order('n', { ascending: true }), 'leer los turnos') as Fila[] | null
      return (r ?? []).map((f): TurnoDeConversa => ({ n: Number(f.n), paso: String(f.paso), agente: (f.agente as string | null) ?? null, ronda: Number(f.ronda), estado: f.estado as TurnoDeConversa['estado'], costo_usd: Number(f.costo_usd ?? 0), salida: f.salida, error: (f.error as string | null) ?? null }))
    },
  }
}
