/** Base falsa para probar el portero que alimenta (sin red). Anota TODA escritura; lee de tablas en memoria. */
type Fila = Record<string, unknown>
export interface Escritura { tabla: string; op: 'insert' | 'update' | 'delete'; fila?: Fila; filtros?: Array<[string, unknown]> }

export function crearBaseFalsa(tablas: Record<string, Fila[]>, opciones: { fallaEn?: string } = {}) {
  const escrituras: Escritura[] = []
  const lecturas: string[] = []
  const db = {
    from(tabla: string) {
      const filtros: Array<[string, string, unknown]> = []
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: Fila | undefined
      let tope = Infinity
      const q: Record<string, unknown> = {}
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every(([c, t, v]) => {
        const x = f[c]
        if (t === 'eq') return x === v
        if (t === 'is') return v === null ? x === null || x === undefined : x === v
        if (t === 'gte') return String(x) >= String(v)
        if (t === 'like') return String(x).startsWith(String(v).replace(/%$/, '').replace(/\*$/, ''))
        return true
      }))
      const ejecutar = () => {
        if (opciones.fallaEn === tabla) return { data: null, error: { message: `falla simulada en ${tabla}` } }
        if (op === 'select') { lecturas.push(tabla); return { data: filas().slice(0, tope), error: null } }
        escrituras.push({ tabla, op, fila: payload, filtros: filtros.map(([c, , v]) => [c, v]) })
        if (op === 'insert' && payload) (tablas[tabla] ??= []).push({ ...payload })
        return { data: null, error: null }
      }
      const chain = (t: string) => (c: string, v: unknown) => { filtros.push([c, t, v]); return q }
      q.select = () => q
      q.eq = chain('eq'); q.is = chain('is'); q.gte = chain('gte'); q.like = chain('like')
      q.order = () => q
      q.limit = (n: number) => { tope = n; return q }
      q.insert = (f: Fila) => { op = 'insert'; payload = f; return q }
      q.update = (f: Fila) => { op = 'update'; payload = f; return q }
      q.delete = () => { op = 'delete'; return q }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
      return q
    },
  }
  return { db, escrituras, lecturas, tablas }
}
