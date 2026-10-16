/** Base falsa para probar el portero que alimenta (sin red). Anota TODA escritura; lee de tablas en memoria. */
type Fila = Record<string, unknown>
export interface Escritura { tabla: string; op: 'insert' | 'update' | 'delete'; fila?: Fila; filtros?: Array<[string, unknown]> }

export function crearBaseFalsa(tablas: Record<string, Fila[]>, opciones: { /** como la base real: ninguna consulta devuelve más de N filas aunque se pida más (1.000 en producción) */ topeDeFilas?: number; fallaEn?: string; fallaVeces?: number; /** con fallaVeces: deja pasar las primeras N lecturas de la tabla y recién entonces falla */ saltar?: number; /** reloj para `creado_en` de las filas insertadas (como el DEFAULT now() de la base real) */ reloj?: () => string } = {}) {
  let leidas = 0
  let falladas = 0 // fallaVeces: la tabla falla solo las primeras N lecturas (una falla pasajera)
  const escrituras: Escritura[] = []
  const lecturas: string[] = []
  const db = {
    from(tabla: string) {
      const filtros: Array<[string, string, unknown]> = []
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: Fila | undefined
      let tope = Infinity
      let desde = 0
      const q: Record<string, unknown> = {}
      const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every(([c, t, v]) => {
        const x = f[c]
        if (t === 'eq') return x === v
        if (t === 'is') return v === null ? x === null || x === undefined : x === v
        if (t === 'gte') return String(x) >= String(v)
        if (t === 'lte') return String(x) <= String(v)
        if (t === 'in') return Array.isArray(v) && v.includes(x)
        if (t === 'like') return String(x).startsWith(String(v).replace(/%$/, '').replace(/\*$/, ''))
        return true
      }))
      const ejecutar = () => {
        if (opciones.fallaEn === tabla && op === 'select' && leidas++ < (opciones.saltar ?? 0)) { /* todavía pasa */ } else if (opciones.fallaEn === tabla && (opciones.saltar === undefined || op === 'select') && (opciones.fallaVeces === undefined || falladas++ < opciones.fallaVeces)) return { data: null, error: { message: `falla simulada en ${tabla}` } }
        if (op === 'select') { lecturas.push(tabla); return { data: filas().slice(desde, desde + Math.min(tope, opciones.topeDeFilas ?? Infinity)), error: null } }
        escrituras.push({ tabla, op, fila: payload, filtros: filtros.map(([c, , v]) => [c, v]) })
        if (op === 'insert' && payload) (tablas[tabla] ??= []).push({ id: crypto.randomUUID(), creado_en: (opciones.reloj ?? (() => new Date().toISOString()))(), ...payload })
        // un UPDATE se APLICA a las filas que cumplen los filtros (antes solo se anotaba): así las pruebas ven el estado final
        if (op === 'update' && payload) for (const f of filas()) Object.assign(f, payload)
        return { data: null, error: null }
      }
      const chain = (t: string) => (c: string, v: unknown) => { filtros.push([c, t, v]); return q }
      q.select = () => q
      q.eq = chain('eq'); q.is = chain('is'); q.gte = chain('gte'); q.lte = chain('lte'); q.like = chain('like'); q.in = chain('in')
      q.order = () => q
      q.limit = (n: number) => { tope = n; return q }
      q.range = (a: number, b: number) => { desde = a; tope = b - a + 1; return q }
      q.insert = (f: Fila) => { op = 'insert'; payload = f; return q }
      q.update = (f: Fila) => { op = 'update'; payload = f; return q }
      q.delete = () => { op = 'delete'; return q }
      q.then = (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej)
      return q
    },
  }
  return { db, escrituras, lecturas, tablas }
}
