/**
 * Base FALSA con la forma de PostgREST para las 4 tablas de la jefatura (select/insert/update/upsert/eq/lt/order/limit/single/maybeSingle) y con las restricciones únicas de la migración J1. Sin red.
 * Es una réplica compacta de `src/lib/oficina/__tests__/dbfalsa.ts` (que no se toca): aquí los defaults e índices únicos son los de las tablas `jefatura_*`.
 */
type Fila = Record<string, unknown>
const UNICOS: Record<string, string[][]> = {
  jefatura_revisiones: [['artifact_type', 'artifact_id', 'version', 'dry_run']],
  jefatura_pasos: [['revision_id', 'n'], ['revision_id', 'paso', 'intento'], ['dispatch_key']],
  jefatura_fichas: [['revision_id', 'ficha_id']],
  jefatura_config: [['id']],
  // el libro central de invocaciones: la misma llamada a GPT no se anota dos veces
  agent_invocations: [['session_id']],
}
const hay = (v: unknown) => v !== null && v !== undefined

export class DbFalsaJefatura {
  tablas: Record<string, Fila[]> = {}
  secuencia = 0
  fallar: Record<string, string> = {}
  /** cada escritura que llegó (tabla + operación), para probar que una jefatura apagada no escribe nada */
  escrituras: Array<{ tabla: string; op: string }> = []
  semilla(t: string, filas: Fila[]) { this.tablas[t] = [...(this.tablas[t] ?? []), ...filas.map((f) => ({ ...f }))]; return this }
  from(t: string) { return new Consulta(this, t) }
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
  constructor(private db: DbFalsaJefatura, private t: string) {}
  select(c?: string) { if (this.op === 'select') this.proyeccion = c ?? '*'; else { this.devuelve = true; this.proyeccion = c ?? '*' } return this }
  insert(p: Fila | Fila[]) { this.op = 'insert'; this.payload = p; return this }
  update(p: Fila) { this.op = 'update'; this.payload = p; return this }
  upsert(p: Fila | Fila[], o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = p; this.conflicto = o?.onConflict ? o.onConflict.split(',') : null; return this }
  eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this }
  lt(c: string, v: unknown) { this.filtros.push((f) => hay(f[c]) && String(f[c]) < String(v)); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orden = { col: c, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.tope = n; return this }
  single() { this.uno = 'single'; return this }
  maybeSingle() { this.uno = 'maybe'; return this }
  private proy(f: Fila) { if (!this.proyeccion || this.proyeccion === '*') return { ...f }; const o: Fila = {}; for (const c of this.proyeccion.split(',').map((x) => x.trim())) o[c] = f[c]; return o }
  private choque(fila: Fila, indices: string[][]): Fila | null {
    for (const u of indices) {
      if (u.some((c) => !hay(fila[c]))) continue
      const otra = (this.db.tablas[this.t] ?? []).find((x) => u.every((c) => x[c] === fila[c]))
      if (otra) return otra
    }
    return null
  }
  private conDefectos(f: Fila): Fila {
    const o = { ...f }
    if (this.t === 'jefatura_revisiones') { o.id ??= `00000000-0000-4000-8000-${String(++this.db.secuencia).padStart(12, '0')}`; o.estado ??= 'abierta'; o.resultado ??= null; o.marcas ??= {}; o.gasto_usd ??= 0; o.prueba ??= false; o.version ??= 1 }
    else if (this.t === 'jefatura_pasos') { o.id ??= ++this.db.secuencia; o.intento ??= 1; o.concepto ??= 'modelo'; o.base ??= 'usage'; o.cost_usd ??= 0 }
    return o
  }
  private ejecutar(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.db.fallar[this.t]) return { data: null, error: { message: this.db.fallar[this.t] } }
    const filas = this.db.tablas[this.t] ?? (this.db.tablas[this.t] = [])
    if (this.op !== 'select') this.db.escrituras.push({ tabla: this.t, op: this.op })
    let data: Fila[] = []
    if (this.op === 'insert' || this.op === 'upsert') {
      const lote = ([] as Fila[]).concat(this.payload as Fila[])
      for (const p of lote) {
        const fila = this.conDefectos(p)
        // upsert: solo choca con SU índice de conflicto (como PostgREST); el resto de únicos siguen valiendo como error
        const propios = this.op === 'upsert' && this.conflicto ? [this.conflicto] : []
        const otros = (UNICOS[this.t] ?? []).filter((u) => !(this.op === 'upsert' && this.conflicto && u.join(',') === this.conflicto.join(',')))
        const a = propios.length ? this.choque(fila, propios) : null
        if (a) { Object.assign(a, p); data.push(a); continue }
        const b = this.choque(fila, this.op === 'insert' ? UNICOS[this.t] ?? [] : otros)
        if (b) return { data: null, error: { message: `duplicate key value violates unique constraint (${this.t})`, code: '23505' } }
        filas.push(fila); data.push(fila)
      }
    } else if (this.op === 'update') {
      for (const f of filas) if (this.filtros.every((g) => g(f))) { Object.assign(f, this.payload as Fila); data.push(f) }
    } else {
      data = filas.filter((f) => this.filtros.every((g) => g(f)))
      if (this.orden) { const { col, asc } = this.orden; data = [...data].sort((a, b) => (Number(a[col]) < Number(b[col]) ? -1 : 1) * (asc ? 1 : -1)) }
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
