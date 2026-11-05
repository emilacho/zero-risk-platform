/**
 * F8 · el almacén REAL de la conversación financiera (`finanzas_encargos`, `finanzas_turnos`, `finanzas_artefactos`). Recibe la base por parámetro (se prueba sin red).
 * NADA de esto corre con el interruptor `conversa` apagado (la ruta devuelve 409 antes). Un turno = una fila; un artefacto = una fila por versión.
 */
import { estadoInicial } from '../../oficina/tipos'
import type { Db } from '../almacen-supabase'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, Semilla, TurnoDeConversa } from './puertos'

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

export interface TablasDeConversa { encargos: string; turnos: string; artefactos: string }
const TABLAS_DE_FINANZAS: TablasDeConversa = { encargos: 'finanzas_encargos', turnos: 'finanzas_turnos', artefactos: 'finanzas_artefactos' }

export function almacenDeConversa(db: Db, tablas: TablasDeConversa = TABLAS_DE_FINANZAS): AlmacenDeConversa {
  return {
    async crearEncargo(n) {
      try {
        // una sola conversación ABIERTA por cliente: si hay una, se devuelve esa (no se abre otra ni se pisa)
        const abiertos = ok(await db.from(tablas.encargos).select('*').eq('client_id', n.client_id).in('estado', ['abierto', 'en_curso', 'esperando_al_dueno']).limit(1), 'leer el abierto') as Fila[] | null
        // 04-nov · cada corrida abre el suyo: lo que quedó abierto de OTRA corrida se cierra, y no se hereda ni su gasto ni sus pasos. Sin corrida en el pedido, como siempre
        const corrida = n.semilla?.corrida
        if (abiertos?.[0]) {
          const previa = (abiertos[0].semilla as Semilla | null)?.corrida
          if (!corrida || previa === corrida) return { ok: true as const, encargo: aEncargo(abiertos[0]), nuevo: false }
          ok(await db.from(tablas.encargos).update({ estado: 'fallido', estado_del_motor: { ...(abiertos[0].estado_del_motor as object), cerrado_por: 'otra_corrida', corrida_nueva: corrida }, actualizado_en: new Date().toISOString() }).eq('id', abiertos[0].id).in('estado', ['abierto', 'en_curso', 'esperando_al_dueno']), 'cerrar el de otra corrida')
        }
        // la que pausó, o la que ya se soltó pero no pudo volver porque este plan le ganó: ninguna queda colgada
        if (abiertos?.[0] && tablas === TABLAS_DE_FINANZAS) {
          const hora = new Date().toISOString()
          ok(await db.from('esperas_del_dueno').update({ estado: 'reemplazada', actualizado_en: hora }).eq('tipo', 'finanzas').eq('clave', `finanzas:${String(abiertos[0].id)}`).eq('estado', 'esperando'), 'reemplazar la espera')
          const vieja = (abiertos[0].semilla as Semilla | null)?.corrida
          if (vieja) ok(await db.from('plan_corridas').update({ estado: 'fallida', motivo: 'la reemplazó otro plan mientras esperaba al dueño', actualizado_en: hora }).eq('id', vieja).eq('estado', 'en_pausa'), 'cerrar la corrida en pausa')
        }
        const fila = { client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, dry_run: n.dry_run, semilla: n.semilla }
        const r = await db.from(tablas.encargos).insert(fila).select('*').single()
        if (r.error) {
          // la carrera: otro la abrió entre la lectura y el insert (índice único parcial, 23505) → se devuelve la que ganó
          if (r.error.code === '23505') {
            const otra = ok(await db.from(tablas.encargos).select('*').eq('client_id', n.client_id).in('estado', ['abierto', 'en_curso']).limit(1), 'releer el abierto') as Fila[] | null
            if (otra?.[0]) return { ok: true as const, encargo: aEncargo(otra[0]), nuevo: false }
          }
          return { ok: false as const, error: r.error.message }
        }
        return { ok: true as const, encargo: aEncargo(r.data as Fila), nuevo: true }
      } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) } }
    },
    async leerEncargo(id) {
      const r = ok(await db.from(tablas.encargos).select('*').eq('id', id).maybeSingle(), 'leer el encargo') as Fila | null
      return r ? aEncargo(r) : null
    },
    async guardar(c: CambiosDeEncargo) {
      // primero el turno y el artefacto (son append-only e idempotentes por su clave única), después el estado: si cae a medias, el motor repite el MISMO paso
      if (c.turno) {
        const t = c.turno
        ok(await db.from(tablas.turnos).upsert({ encargo_id: c.encargo_id, n: t.n, paso: t.paso, agente: t.agente, ronda: t.ronda, estado: t.estado, costo_usd: t.costo_usd, salida: t.salida ?? null, error: t.error ?? null }, { onConflict: 'encargo_id,n' }), 'guardar el turno')
      }
      if (c.artefacto) {
        const a = c.artefacto
        ok(await db.from(tablas.artefactos).upsert({ encargo_id: c.encargo_id, tipo: a.tipo, version: a.version, contenido: a.contenido, sha256: a.sha256 }, { onConflict: 'encargo_id,tipo,version' }), 'guardar el artefacto')
      }
      const patch: Fila = { estado_del_motor: c.estado_del_motor, gasto_usd: c.gasto_usd, actualizado_en: new Date().toISOString() }
      for (const k of ['estado', 'slack_canal', 'slack_ts', 'leido_hasta', 'tablero_id'] as const) if (c[k] !== undefined) patch[k] = c[k]
      ok(await db.from(tablas.encargos).update(patch).eq('id', c.encargo_id), 'guardar el encargo')
    },
    async artefactos(encargo_id) {
      const r = ok(await db.from(tablas.artefactos).select('tipo,version,contenido').eq('encargo_id', encargo_id).order('version', { ascending: true }), 'leer los artefactos') as Fila[] | null
      const out: Record<string, Record<string, unknown>> = {}
      // el de mayor versión de cada tipo gana (vienen en orden ascendente)
      for (const f of r ?? []) out[String(f.tipo)] = f.contenido as Record<string, unknown>
      return out
    },
    async tomarPaso(id, ahora, ttl_s) {
      try {
        const vencido = new Date(ahora.getTime() - ttl_s * 1000).toISOString()
        const r = await db.from(tablas.encargos).update({ en_vuelo_desde: ahora.toISOString() }).eq('id', id).or(`en_vuelo_desde.is.null,en_vuelo_desde.lt.${vencido}`).select('id')
        if (r.error) {
          const sinColumna = r.error.code === '42703' || /en_vuelo_desde/i.test(String(r.error.message))
          return { ok: false as const, error: r.error.message, ...(sinColumna ? { sin_columna: true } : {}) }
        }
        return { ok: true as const, tomado: Array.isArray(r.data) && r.data.length > 0 }
      } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) } }
    },
    async soltarPaso(id) {
      try { await db.from(tablas.encargos).update({ en_vuelo_desde: null }).eq('id', id) } catch { /* el vencimiento lo libera */ }
    },
    async cobrado(encargo_id) {
      try {
        const r = await db.from('agent_invocations').select('cost_usd').like('workflow_execution_id', `${encargo_id}:%`)
        if (r.error || !Array.isArray(r.data)) return null
        return Math.round((r.data as Fila[]).reduce((s, f) => s + (Number(f.cost_usd) || 0), 0) * 1e6) / 1e6
      } catch { return null }
    },
    async ultimaFirmaConCambios(client_id) {
      try {
        const r = await db.from('finanzas_tableros').select('firma_con_cambios').eq('client_id', client_id).eq('dry_run', false).not('firma_con_cambios', 'is', null).order('version', { ascending: false }).limit(1)
        if (r.error) return { ok: false, error: String(r.error.message ?? 'lectura') }
        const f = (r.data as Array<{ firma_con_cambios?: unknown }> | null)?.[0]?.firma_con_cambios
        return { ok: true, firma: f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : null }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },
    async gastoDeLaOficina(client_id) {
      try {
        const enc = await db.from(tablas.encargos).select('id').eq('client_id', client_id)
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
        const a = await db.from(tablas.artefactos).select('encargo_id,creado_en').eq('tipo', 'buzon_respuestas').eq('version', 1).gte('creado_en', desde)
        if (a.error || !Array.isArray(a.data)) return null
        const filas = a.data as Fila[]
        if (!filas.length) return { cliente_24h: 0, hoy: 0 }
        const enc = await db.from(tablas.encargos).select('id,client_id').in('id', filas.map((f) => String(f.encargo_id)))
        if (enc.error || !Array.isArray(enc.data)) return null
        const cliente = new Map((enc.data as Fila[]).map((f) => [String(f.id), String(f.client_id)]))
        return {
          cliente_24h: filas.filter((f) => cliente.get(String(f.encargo_id)) === client_id && String(f.creado_en) >= hace24).length,
          hoy: filas.filter((f) => String(f.creado_en) >= inicioDia).length,
        }
      } catch { return null }
    },
    async buzonAbiertos(ahora, horas) {
      try {
        // 04-nov · una pausa no vence: entra siempre, primero, aunque aún no haya salido su mensaje; y también la que se soltó y no pudo despertar al plan, o lo despertó y su corrida sigue en pausa
        const pausadas = await db.from(tablas.encargos).select('id').eq('estado', 'esperando_al_dueno').eq('dry_run', false)
        if (pausadas.error || !Array.isArray(pausadas.data)) return null
        const sueltas = await db.from('esperas_del_dueno').select('clave,despertado,client_id,sobre').eq('tipo', 'finanzas').eq('estado', 'soltada')
        if (sueltas.error || !Array.isArray(sueltas.data)) return null
        const quietas = await db.from('plan_corridas').select('client_id,corrida').eq('estado', 'en_pausa').eq('dry_run', false)
        if (quietas.error || !Array.isArray(quietas.data)) return null
        const sinArrancar = new Set((quietas.data as Fila[]).map((c) => `${String(c.client_id)}|${String(c.corrida)}`))
        const corridaDe = (f: Fila) => (f.sobre as { corrida?: unknown } | null)?.corrida
        const enPausa = [...(pausadas.data as Fila[]).map((f) => String(f.id)), ...(sueltas.data as Fila[]).filter((f) => f.despertado !== true || sinArrancar.has(`${String(f.client_id)}|${String(corridaDe(f))}`)).map((f) => String(f.clave).replace(/^finanzas:/, ''))]
        const desde = new Date(ahora.getTime() - horas * 3600 * 1000).toISOString()
        const a = await db.from(tablas.artefactos).select('encargo_id,creado_en').eq('tipo', 'buzon_respuestas').eq('version', 1).gte('creado_en', desde)
        if (a.error || !Array.isArray(a.data)) return null
        // los más recientes primero: si hubiera más de 20, el tope deja los del último día y no unos cualesquiera
        const ids = [...new Set((a.data as Fila[]).sort((x, y) => String(y.creado_en).localeCompare(String(x.creado_en))).map((f) => String(f.encargo_id)))]
        if (!ids.length) return [...new Set(enPausa)].slice(0, 20)
        const enc = await db.from(tablas.encargos).select('id,slack_canal,slack_ts,dry_run').in('id', ids)
        if (enc.error || !Array.isArray(enc.data)) return null
        const buenos = new Set((enc.data as Fila[]).filter((f) => f.dry_run !== true && !!f.slack_canal && !!f.slack_ts).map((f) => String(f.id)))
        return [...new Set([...enPausa, ...ids.filter((i) => buenos.has(i))])].slice(0, 20)
      } catch { return null }
    },
    async guardarBuzon(c) {
      if (c.artefacto) {
        const a = c.artefacto
        ok(await db.from(tablas.artefactos).upsert({ encargo_id: c.encargo_id, tipo: a.tipo, version: a.version, contenido: a.contenido, sha256: a.sha256 }, { onConflict: 'encargo_id,tipo,version' }), 'guardar el registro del buzón')
      }
      const patch: Fila = { actualizado_en: new Date().toISOString() }
      for (const k of ['slack_canal', 'slack_ts', 'leido_hasta', 'semilla'] as const) if (c[k] !== undefined) patch[k] = c[k]
      ok(await db.from(tablas.encargos).update(patch).eq('id', c.encargo_id), 'guardar el buzón del encargo')
    },
    async turnos(encargo_id) {
      const r = ok(await db.from(tablas.turnos).select('n,paso,agente,ronda,estado,costo_usd,salida,error').eq('encargo_id', encargo_id).order('n', { ascending: true }), 'leer los turnos') as Fila[] | null
      return (r ?? []).map((f): TurnoDeConversa => ({ n: Number(f.n), paso: String(f.paso), agente: (f.agente as string | null) ?? null, ronda: Number(f.ronda), estado: f.estado as TurnoDeConversa['estado'], costo_usd: Number(f.costo_usd ?? 0), salida: f.salida, error: (f.error as string | null) ?? null }))
    },
  }
}

/** 04-nov · la mesa de estrategia: mismo almacén, sus tablas. Una mesa por corrida, también si ya cerró: abrir dos veces no paga dos veces */
export function almacenDeMesa(db: Db): AlmacenDeConversa & { encargoDeLaCorrida(client_id: string, corrida: string): Promise<EncargoDeConversa | null> } {
  const tablas: TablasDeConversa = { encargos: 'estrategia_encargos', turnos: 'estrategia_turnos', artefactos: 'estrategia_artefactos' }
  return {
    ...almacenDeConversa(db, tablas),
    async encargoDeLaCorrida(client_id, corrida) {
      const r = ok(await db.from(tablas.encargos).select('*').eq('client_id', client_id).eq('semilla->>corrida', corrida).limit(1), 'leer la mesa de la corrida') as Fila[] | null
      return r?.[0] ? aEncargo(r[0]) : null
    },
  }
}
