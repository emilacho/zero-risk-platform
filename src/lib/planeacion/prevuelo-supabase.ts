/**
 * PLAN v3 · V8 · los PUERTOS del pre-vuelo sobre Supabase (service_role). Sin lógica de decisión: solo traduce cada puerto a lecturas con COLUMNAS NOMBRADAS.
 * Cada lectura que falla devuelve `{ ok: false }` (nunca un «vacío»): el pre-vuelo lo dice y no corre.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClientCapOverrideUsd, resolveClientFamily, resolveRunSpendCapUsd } from '../run-sdk-spend-gate'
import { notifySpendGateDegradation } from '../spend-gate-alert'
import { interruptoresDelEntorno } from '../portero-alimenta/datos'
import { rutaListo } from '../portero-alimenta/listo'
import type { Db as DbDelPortero } from '../portero-alimenta/alimentar'
import { leerCatalogo, type Db } from './catalogo/leer'
import { almacenDeCorridas } from './corridas-supabase'
import type { LecturaDeCupo, LecturaDeFicha, LecturaDeSenal, PuertosDePrevuelo } from './prevuelo'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export function puertosDeSupabase(db: SupabaseClient, ahora: () => Date = () => new Date()): PuertosDePrevuelo {
  const d = db as unknown as Db
  return {
    ahora,
    corridas: almacenDeCorridas(d, ahora),
    catalogo: () => leerCatalogo(d),

    async ficha(client_id): Promise<LecturaDeFicha> {
      try {
        const c = await db.from('clients').select('id, config, country').eq('id', client_id).limit(1)
        if (c.error) return { ok: false, error: `clients: ${c.error.message}` }
        const fila = lista(c.data)[0]
        if (!fila) return { ok: true, existe: false, manual_vigente: false, manual_version: null, moneda_declarada: null, pais: null }
        const m = await db.from('client_brand_books').select('id, version').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
        if (m.error) return { ok: false, error: `client_brand_books: ${m.error.message}` }
        const manual = lista(m.data)[0]
        const cfg = fila.config && typeof fila.config === 'object' && !Array.isArray(fila.config) ? (fila.config as Fila) : {}
        const moneda = [cfg.moneda, cfg.currency, (cfg.finanzas as Fila | undefined)?.moneda].find((x) => typeof x === 'string' && x.trim()) as string | undefined
        return {
          ok: true, existe: true, manual_vigente: !!manual, manual_version: manual && Number.isFinite(Number(manual.version)) ? Number(manual.version) : null,
          moneda_declarada: moneda?.trim() || null, pais: typeof fila.country === 'string' && fila.country.trim() ? fila.country.trim() : null,
        }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },

    // el MISMO criterio del freno de run-sdk: techo = el menor entre el genérico y `spend_cap_usd` de la ficha; gastado = `agent_invocations` de la FAMILIA en las últimas 24 h
    async cupo(client_id): Promise<LecturaDeCupo> {
      try {
        const { family } = await resolveClientFamily(db, client_id, notifySpendGateDegradation)
        const desde = new Date(ahora().getTime() - 24 * 3_600_000).toISOString()
        const base = db.from('agent_invocations').select('cost_usd').gte('started_at', desde)
        const q = family.length > 1 ? base.in('client_id', family) : base.eq('client_id', client_id)
        const r = await q
        if (r.error) return { ok: false, error: `agent_invocations: ${r.error.message}` }
        const gastado = lista(r.data).reduce((s, f) => s + (Number(f.cost_usd) || 0), 0)
        const generico = resolveRunSpendCapUsd()
        const override = await resolveClientCapOverrideUsd(db, client_id)
        return { ok: true, generico_usd: generico, override_usd: override, cap_usd: override !== null ? Math.min(generico, override) : generico, gastado_24h_usd: Math.round(gastado * 1e6) / 1e6 }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },

    // la señal «cerebro listo» por la MISMA función de la ruta (sin ir y volver por HTTP)
    async senal(client_id): Promise<LecturaDeSenal> {
      try {
        const r = await rutaListo({ db: db as unknown as DbDelPortero, interruptores: interruptoresDelEntorno(), ahora: ahora() }, { client_id })
        if (r.status !== 200) return { ok: false, error: `listo ${r.status}: ${String((r.body as Fila).detalle ?? (r.body as Fila).error ?? '')}`.trim() }
        const b = r.body as Fila
        if (typeof b.listo !== 'boolean') return { ok: false, error: 'listo: la respuesta no trae `listo` booleano' }
        return {
          ok: true,
          senal: {
            listo: b.listo, completando: b.completando === true, motivo: typeof b.motivo === 'string' ? b.motivo : '', desde: typeof b.desde === 'string' ? b.desde : null,
            huecos: lista(b.huecos).map((h) => ({ fuente: String(h.fuente ?? ''), funcion: String(h.funcion ?? ''), objetivo: String(h.objetivo ?? '') })),
          },
        }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
    },
  }
}
