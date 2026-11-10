/** base falsa de las tablas de colaterales · RECHAZA columnas que la migración no crea y updates a columnas sin permiso (compartida por las pruebas del 2b y 2c) */
import fs from 'node:fs'
import path from 'node:path'

const crudo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('')
const sql = crudo('supabase/migrations/202611101700_colaterales_ediciones_y_retoques.sql').replace(/--.*$/gm, '')

/** columnas de cada tabla, leídas de la propia migración */
function columnasDe(tabla: string): Set<string> {
  const m = new RegExp(`create table if not exists public\\.${tabla} \\(([\\s\\S]*?)\\n\\);`).exec(sql)
  if (!m) throw new Error(`la migración no crea ${tabla}`)
  return new Set(m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('constraint')).map((l) => l.split(/\s+/)[0]))
}
export const COLUMNAS: Record<string, Set<string>> = { colaterales_ediciones: columnasDe('colaterales_ediciones'), colaterales_retoques: columnasDe('colaterales_retoques') }
/** columnas que el servidor puede ACTUALIZAR, leídas del `grant update (…)` de la propia migración (nota CC7/CC6 · Lenovo 15:32Z) */
function actualizablesDe(tabla: string): Set<string> {
  const m = new RegExp(`grant update \\(([^)]*)\\) on public\\.${tabla} to service_role;`).exec(sql)
  if (!m) throw new Error(`la migración no da update por columna en ${tabla}`)
  return new Set(m[1].split(',').map((x) => x.trim()))
}
export const ACTUALIZABLES: Record<string, Set<string>> = { colaterales_ediciones: actualizablesDe('colaterales_ediciones'), colaterales_retoques: actualizablesDe('colaterales_retoques') }
const UNICAS: Record<string, string[][]> = { colaterales_ediciones: [['llave']], colaterales_retoques: [['edicion_id', 'pedazo_id']] }

export function baseFalsa(o: { fallarLectura?: boolean; fallarInsert?: string; devolverMenos?: boolean } = {}) {
  const tablas: Record<string, Record<string, unknown>[]> = { colaterales_ediciones: [], colaterales_retoques: [] }
  let n = 0
  const from = (tabla: string) => {
    if (!COLUMNAS[tabla]) throw new Error(`tabla desconocida ${tabla}`)
    const q = { op: 'select' as 'select' | 'insert' | 'update', fila: null as unknown, filtros: [] as ((f: Record<string, unknown>) => boolean)[], orden: null as null | [string, boolean] }
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
          for (const u of UNICAS[tabla]) if ([...filas, ...nuevas.filter((x) => x !== f)].some((x) => x !== f && u.every((k) => x[k] === f[k]))) return { data: null, error: { message: 'duplicate key', code: '23505' } }
        }
        const hechas = nuevas.map((f) => ({ id: `id-${++n}`, rehechos: 0, ...structuredClone(f) }))
        filas.push(...hechas)
        return { data: hechas.slice(o.devolverMenos ? 1 : 0).map((f) => structuredClone(f)), error: null }
      }
      if (o.fallarLectura) return { data: null, error: { message: 'statement timeout', code: '57014' } }
      const sel = filas.filter((f) => q.filtros.every((fn) => fn(f)))
      if (q.op === 'update') {
        const e = revisar(q.fila as Record<string, unknown>)
        if (e) return { data: null, error: e }
        // como la base real: actualizar una columna sin `grant update` es «permission denied»
        for (const k of Object.keys(q.fila as Record<string, unknown>)) if (!ACTUALIZABLES[tabla].has(k)) return { data: null, error: { message: `permission denied for table ${tabla}`, code: '42501' } }
        sel.forEach((f) => Object.assign(f, structuredClone(q.fila)))
      }
      let r = sel.map((f) => structuredClone(f))
      if (q.orden) { const [k, asc] = q.orden; r = r.sort((a, b) => ((a[k] as number) > (b[k] as number) ? 1 : -1) * (asc ? 1 : -1)) }
      return { data: r, error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (f: unknown) => { q.op = 'insert'; q.fila = f; return api },
      update: (f: unknown) => { q.op = 'update'; q.fila = f; return api },
      eq: (k: string, v: unknown) => { q.filtros.push((f) => f[k] === v); return api },
      order: (k: string, x?: { ascending?: boolean }) => { q.orden = [k, x?.ascending !== false]; return api },
      single: async () => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error } },
      maybeSingle: async () => { const r = ejecutar(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error } },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from }, tablas }
}

