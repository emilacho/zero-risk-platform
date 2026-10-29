/** Base en memoria para probar el aprendizaje del dueño (sin red): select/eq/is/in/order/limit/range, insert, update, upsert, delete y rpc simulada. */
type Fila = Record<string, unknown>
export interface OpcionesDeBase { rpc?: (nombre: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null } }

export function crearBaseMini(tablas: Record<string, Fila[]>, opciones: OpcionesDeBase = {}) {
  const escrituras: Array<{ tabla: string; op: string; fila?: Fila }> = []
  const db = {
    rpc(nombre: string, args: Record<string, unknown>) { return Promise.resolve(opciones.rpc ? opciones.rpc(nombre, args) : { data: [], error: { message: 'sin rpc simulada' } }) },
    from(tabla: string) {
      const filtros: Array<[string, string, unknown]> = []
      let op = 'select', payload: Fila | undefined, desde = 0, tope = Infinity, onConflict: string | undefined, ignorar = false
      let orden: { c: string; asc: boolean } | null = null
      const q: Record<string, unknown> = {}
      const coincide = (f: Fila) => filtros.every(([c, t, v]) => {
        const x = f[c]
        if (t === 'eq') return x === v
        if (t === 'is') return v === null ? x === null || x === undefined : x === v
        if (t === 'in') return Array.isArray(v) && v.includes(x)
        return true
      })
      const ejecutar = () => {
        const T = (tablas[tabla] ??= [])
        if (op === 'select') {
          let r = T.filter(coincide)
          if (orden) { const { c, asc } = orden; r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (asc ? 1 : -1)) }
          return { data: r.slice(desde, desde + tope).map((f) => ({ ...f })), error: null }
        }
        escrituras.push({ tabla, op, fila: payload })
        if (op === 'insert' && payload) T.push({ creado_en: '2026-10-29T15:00:00.000Z', ...payload })
        if (op === 'update' && payload) for (const f of T.filter(coincide)) Object.assign(f, payload)
        if (op === 'delete') tablas[tabla] = T.filter((f) => !coincide(f))
        if (op === 'upsert' && payload) {
          const claves = (onConflict ?? 'id').split(',')
          const ya = T.find((f) => claves.every((k) => f[k] === payload![k]))
          if (ya) { if (!ignorar) Object.assign(ya, payload) } else T.push({ ...payload })
        }
        return { data: null, error: null }
      }
      const f = (t: string) => (c: string, v: unknown) => { filtros.push([c, t, v]); return q }
      q.select = () => q; q.eq = f('eq'); q.is = f('is'); q.in = f('in'); q.gte = f('gte'); q.like = f('like')
      q.order = (c: string, o?: { ascending?: boolean }) => { orden = { c, asc: o?.ascending !== false }; return q }
      q.limit = (n: number) => { tope = n; return q }
      q.range = (a: number, b: number) => { desde = a; tope = b - a + 1; return q }
      q.insert = (x: Fila) => { op = 'insert'; payload = x; return q }
      q.update = (x: Fila) => { op = 'update'; payload = x; return q }
      q.upsert = (x: Fila, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => { op = 'upsert'; payload = x; onConflict = o?.onConflict; ignorar = o?.ignoreDuplicates === true; return q }
      q.delete = () => { op = 'delete'; return q }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
      return q
    },
  }
  return { db, tablas, escrituras }
}
