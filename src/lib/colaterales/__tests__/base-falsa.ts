/**
 * Base falsa de las tablas propias de los colaterales · RECHAZA columnas que su migración no crea (compartida por las pruebas del 2b y 2c).
 * Las columnas se leen de la migración REAL de cada tabla, así un nombre inventado no pasa. (La cadena se prueba por su propio almacén en memoria.)
 */
import fs from 'node:fs'
import path from 'node:path'

const crudo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('').replace(/--.*$/gm, '')
const MIG_COLATERALES = crudo('supabase/migrations/202611101600_colaterales_ediciones_y_retoques.sql')

/** columnas de una tabla, leídas de su migración (sin importar mayúsculas) */
function columnasDe(sql: string, tabla: string): Set<string> {
  const m = new RegExp(`create table if not exists public\\.${tabla} \\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)
  if (!m) throw new Error(`la migración no crea ${tabla}`)
  return new Set(m[1].split('\n').map((l) => l.trim()).filter((l) => l && !/^(constraint|primary key)\b/i.test(l)).map((l) => l.split(/\s+/)[0]))
}
const COLUMNAS: Record<string, Set<string>> = {
  colaterales_ediciones: columnasDe(MIG_COLATERALES, 'colaterales_ediciones'),
  colaterales_retoques: columnasDe(MIG_COLATERALES, 'colaterales_retoques'),
}
const UNICAS: Record<string, string[][]> = { colaterales_ediciones: [['llave']], colaterales_retoques: [['edicion_id', 'pedazo_id']] }
const POR_OMISION: Record<string, Record<string, unknown>> = { colaterales_retoques: { rehechos: 0 } }

export function baseFalsa(o: { fallarLectura?: boolean; fallarInsert?: string; devolverMenos?: boolean; inicial?: Record<string, Record<string, unknown>[]> } = {}) {
  const tablas: Record<string, Record<string, unknown>[]> = Object.fromEntries(Object.keys(COLUMNAS).map((t) => [t, structuredClone(o.inicial?.[t] ?? [])]))
  let n = 0
  const from = (tabla: string) => {
    if (!COLUMNAS[tabla]) throw new Error(`tabla desconocida ${tabla}`)
    const q = { op: 'select' as 'select' | 'insert' | 'update', fila: null as unknown, filtros: [] as ((f: Record<string, unknown>) => boolean)[], orden: null as null | [string, boolean], lim: Infinity }
    const revisar = (f: Record<string, unknown>) => {
      for (const k of Object.keys(f)) if (!COLUMNAS[tabla].has(k)) return { message: `column "${k}" of relation "${tabla}" does not exist`, code: '42703' }
      return null
    }
    const ejecutar = () => {
      const filas = tablas[tabla]
      if (q.op === 'insert') {
        if (o.fallarInsert === tabla) return { data: null, error: { message: 'connection reset', code: '08006' } }
        const nuevas = (Array.isArray(q.fila) ? q.fila : [q.fila]) as Record<string, unknown>[]
        for (const f of nuevas) {
          const e = revisar(f)
          if (e) return { data: null, error: e }
          for (const u of UNICAS[tabla]) if ([...filas, ...nuevas].some((x) => x !== f && u.every((k) => x[k] === f[k]))) return { data: null, error: { message: 'duplicate key', code: '23505' } }
        }
        const hechas = nuevas.map((f) => ({ id: `id-${++n}`, ...(POR_OMISION[tabla] ?? {}), ...structuredClone(f) }))
        filas.push(...hechas)
        return { data: hechas.slice(o.devolverMenos ? 1 : 0).map((f) => structuredClone(f)), error: null }
      }
      if (o.fallarLectura) return { data: null, error: { message: 'statement timeout', code: '57014' } }
      const sel = filas.filter((f) => q.filtros.every((fn) => fn(f)))
      if (q.op === 'update') {
        const e = revisar(q.fila as Record<string, unknown>)
        if (e) return { data: null, error: e }
        sel.forEach((f) => Object.assign(f, structuredClone(q.fila)))
      }
      let r = sel.map((f) => structuredClone(f))
      if (q.orden) { const [k, asc] = q.orden; r = r.sort((a, b) => ((a[k] as number) > (b[k] as number) ? 1 : -1) * (asc ? 1 : -1)) }
      return { data: r.slice(0, q.lim), error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (f: unknown) => { q.op = 'insert'; q.fila = f; return api },
      update: (f: unknown) => { q.op = 'update'; q.fila = f; return api },
      eq: (k: string, v: unknown) => { q.filtros.push((f) => f[k] === v); return api },
      order: (k: string, x?: { ascending?: boolean }) => { q.orden = [k, x?.ascending !== false]; return api },
      limit: (k: number) => { q.lim = k; return api },
      single: async () => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error } },
      maybeSingle: async () => { const r = ejecutar(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error } },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from }, tablas }
}
