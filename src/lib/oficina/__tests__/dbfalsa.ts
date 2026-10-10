/** ayuda de pruebas: una base FALSA con la forma de PostgREST (select/insert/update/upsert/eq/lt/gte/is/order/limit/single) y restricciones únicas. Sin red. */
type Fila = Record<string, unknown>
const UNICOS: Record<string, string[][]> = {
  oficina_encargos: [['parte_id', 'brief_id', 'tipo_de_grupo', 'version_encargo']],
  oficina_turnos: [['encargo_id', 'n']],
  oficina_artefactos: [['encargo_id', 'tipo', 'version']],
  oficina_fichas: [['encargo_id', 'ficha_id']],
  oficina_gastos: [['ref_tabla', 'ref_id']],
  oficina_uso_de_fotos: [['encargo_id', 'foto_id']],
  cerebro_diario_corridas: [['client_id', 'dia']],
}
const hay = (v: unknown) => v !== null && v !== undefined

function leer(f: Fila, col: string): unknown {
  if (col.includes('->>')) { const [a, b] = col.split('->>'); const o = f[a]; return o && typeof o === 'object' ? (o as Fila)[b] : undefined }
  return f[col]
}

export class DbFalsa {
  tablas: Record<string, Fila[]> = {}
  secuencia = 0
  fallar: Record<string, string> = {}
  archivos: Record<string, { bytes: Buffer; contentType: string }> = {}
  storageFalla: string | null = null
  /** en qué buckets se escribió (para probar la frontera: la oficina no escribe en el bucket de la web del cliente) */
  bucketsUsados = new Set<string>()
  semilla(t: string, filas: Fila[]) { this.tablas[t] = [...(this.tablas[t] ?? []), ...filas.map((f) => ({ ...f }))]; return this }
  from(t: string) { return new Consulta(this, t) }
  storage = {
    from: (bucket: string) => ({
      upload: async (p: string, b: Buffer, o: { contentType?: string }) => {
        this.bucketsUsados.add(bucket)
        if (this.storageFalla) return { error: { message: this.storageFalla } }
        if (this.archivos[p]) return { error: { message: 'ya existe' } }
        this.archivos[p] = { bytes: b, contentType: o.contentType ?? '' }
        return { error: null }
      },
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://storage.test/${p}` } }),
    }),
  }
}

class Consulta {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private filtros: Array<(f: Fila) => boolean> = []
  private payload: Fila | Fila[] | null = null
  private conflicto: string[] | null = null
  private orden: { col: string; asc: boolean } | null = null
  private tope: number | null = null
  private proyeccion: string | null = null
  private uno: 'single' | 'maybe' | null = null
  private devuelve = false
  constructor(private db: DbFalsa, private t: string) {}
  select(c?: string) { if (this.op === 'select') this.proyeccion = c ?? '*'; else { this.devuelve = true; this.proyeccion = c ?? '*' } return this }
  insert(p: Fila | Fila[]) { this.op = 'insert'; this.payload = p; return this }
  update(p: Fila) { this.op = 'update'; this.payload = p; return this }
  upsert(p: Fila | Fila[], o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = p; this.conflicto = o?.onConflict ? o.onConflict.split(',') : null; return this }
  eq(c: string, v: unknown) { this.filtros.push((f) => leer(f, c) === v); return this }
  lt(c: string, v: unknown) { this.filtros.push((f) => hay(leer(f, c)) && String(leer(f, c)) < String(v)); return this }
  gte(c: string, v: unknown) { this.filtros.push((f) => hay(leer(f, c)) && String(leer(f, c)) >= String(v)); return this }
  is(c: string, v: unknown) { this.filtros.push((f) => (v === null ? !hay(leer(f, c)) : leer(f, c) === v)); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orden = { col: c, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.tope = n; return this }
  single() { this.uno = 'single'; return this }
  maybeSingle() { this.uno = 'maybe'; return this }
  private proy(f: Fila) { if (!this.proyeccion || this.proyeccion === '*') return { ...f }; const o: Fila = {}; for (const c of this.proyeccion.split(',').map((x) => x.trim())) o[c] = f[c]; return o }
  private chocaCon(fila: Fila): Fila | null {
    for (const u of UNICOS[this.t] ?? []) {
      if (u.some((c) => !hay(fila[c]))) continue
      const otra = (this.db.tablas[this.t] ?? []).find((x) => u.every((c) => x[c] === fila[c]))
      if (otra) return otra
    }
    return null
  }
  private conDefectos(f: Fila): Fila {
    const o = { ...f }
    if (this.t === 'oficina_encargos') { o.id ??= `00000000-0000-4000-8000-${String(++this.db.secuencia).padStart(12, '0')}`; o.estado ??= 'abierto'; o.version_encargo ??= 1; o.gasto_usd ??= 0; o.con_desacuerdo ??= false; o.imagen_generada ??= false }
    else if (this.t.startsWith('oficina_') && this.t !== 'oficina_config' && this.t !== 'oficina_tipos_de_grupo' && this.t !== 'oficina_entrega_formatos' && this.t !== 'oficina_fichas') o.id ??= ++this.db.secuencia
    else if (this.t.startsWith('cerebro_')) o.id ??= `88888888-8888-4888-8888-${String(++this.db.secuencia).padStart(12, '0')}`
    else if (this.t === 'client_historical_outputs' || this.t === 'hitl_queue') o.id ??= `77777777-7777-4777-8777-${String(++this.db.secuencia).padStart(12, '0')}`
    return o
  }
  private ejecutar(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.db.fallar[this.t]) return { data: null, error: { message: this.db.fallar[this.t] } }
    const filas = this.db.tablas[this.t] ?? (this.db.tablas[this.t] = [])
    let data: Fila[] = []
    if (this.op === 'insert' || this.op === 'upsert') {
      const lote = ([] as Fila[]).concat(this.payload as Fila[])
      for (const p of lote) {
        const fila = this.conDefectos(p)
        const choque = this.chocaCon(fila)
        if (choque) {
          if (this.op === 'insert') return { data: null, error: { message: `duplicate key value violates unique constraint (${this.t})`, code: '23505' } }
          Object.assign(choque, fila, choque.id !== undefined ? { id: choque.id } : {}); data.push(choque)
        } else { filas.push(fila); data.push(fila) }
      }
    } else if (this.op === 'update') {
      for (const f of filas) if (this.filtros.every((g) => g(f))) { Object.assign(f, this.payload as Fila); data.push(f) }
    } else {
      data = filas.filter((f) => this.filtros.every((g) => g(f)))
      if (this.orden) { const { col, asc } = this.orden; data = [...data].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)) }
      if (this.tope !== null) data = data.slice(0, this.tope)
    }
    if ((this.op === 'select' || this.devuelve) && this.uno) {
      if (data.length === 0) return this.uno === 'single' ? { data: null, error: { message: 'no rows' } } : { data: null, error: null }
      return { data: this.proy(data[0]), error: null }
    }
    return { data: this.op === 'select' || this.devuelve ? data.map((f) => this.proy(f)) : null, error: null }
  }
  then<T>(res: (v: { data: unknown; error: { message: string; code?: string } | null }) => T) { return Promise.resolve(this.ejecutar()).then(res) }
}
