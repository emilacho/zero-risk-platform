/**
 * DIRECCIÓN (01-nov · ENCARGO Lenovo 14:57Z firmado por Emilio · CC1): lo que lee «Tu oficina», la sala del director. SOLO LECTURA, para todos los clientes.
 * Regla de honestidad: una fuente que falla NO se lee como «no hay nada». Cada respuesta declara sus `fuentes` (ok · no_existe · error · sin_credencial) y `completo`,
 * y `sin_fuente` nombra lo que se pidió y el sistema todavía no puede saber.
 */
export type Db = { from(tabla: string): any }
export type Fila = Record<string, unknown>
export type EstadoFuente = 'ok' | 'no_existe' | 'error' | 'sin_credencial'
export interface Fuente { fuente: string; estado: EstadoFuente; filas: number; truncado?: boolean; detalle?: string }
export interface Contexto {
  db: Db
  ahora: () => Date
  /** solo los riesgos salen a la red (n8n y Apify, ambos de lectura) */
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}

export const lista = (d: unknown): Fila[] => (Array.isArray(d) ? (d as Fila[]) : [])
export const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)
export const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
export const numero = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
export const redondear = (n: number): number => Math.round(n * 1e6) / 1e6

const SECRETOS: RegExp[] = [
  /\b(sk|pk|rk|xox[abps]?|ghp|gho|apify_api)[-_][A-Za-z0-9_-]{8,}/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}(\.[A-Za-z0-9_-]+)?/g,
  /\b(api[_-]?key|token|secret|password|llave|authorization|signature)\b(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
  /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi,
]
/** un texto de error o de detalle, sin nada que parezca una credencial y con tope de largo */
export function sinSecretos(v: unknown, max = 500): string | null {
  const t = texto(v)
  if (!t) return null
  let s = t
  s = s.replace(SECRETOS[0], '[oculto]').replace(SECRETOS[1], 'Bearer [oculto]').replace(SECRETOS[2], '[oculto]').replace(SECRETOS[3], '$1$2[oculto]').replace(SECRETOS[4], '$1[oculto]@')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** lee una tabla y deja constancia en `fuentes`: nunca lanza; si falla, devuelve [] y lo DECLARA. `tope` = el `limit` pedido: llegar a él se declara truncado */
export async function leer(fuentes: Fuente[], fuente: string, consulta: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, tope?: number): Promise<Fila[]> {
  try {
    const r = await consulta
    if (r.error) {
      const noExiste = r.error.code === '42P01' || r.error.code === 'PGRST205'
      fuentes.push({ fuente, estado: noExiste ? 'no_existe' : 'error', filas: 0, ...(noExiste ? {} : { detalle: sinSecretos(r.error.message) ?? 'error sin detalle' }) })
      return []
    }
    const filas = lista(r.data)
    fuentes.push({ fuente, estado: 'ok', filas: filas.length, ...(tope !== undefined && filas.length >= tope ? { truncado: true } : {}) })
    return filas
  } catch (e) {
    fuentes.push({ fuente, estado: 'error', filas: 0, detalle: sinSecretos(e instanceof Error ? e.message : String(e)) ?? 'error sin detalle' })
    return []
  }
}

/** ¿la respuesta está entera? Una tabla que todavía no existe (no_existe) no la rompe: no hay nada que leer. Un error, una falta de credencial o un recorte sí. */
export const estaCompleto = (f: Fuente[]): boolean => f.every((x) => (x.estado === 'ok' || x.estado === 'no_existe') && !x.truncado)

/** Una ficha de práctica o de ensayo: rubro «prueba» o nombre de prueba. Misma regla del panel (`lib/clientes.ts`): nunca es un cliente real. */
export const esDePractica = (c: { rubro?: unknown; nombre?: unknown }): boolean => /^\s*prueba\s*$/i.test(String(c.rubro ?? '')) || /^\s*(zz\b|prueba\b|pr[aá]ctica\b)/i.test(String(c.nombre ?? ''))

export interface Cliente { id: string; nombre: string; estado: string; practica: boolean; de_baja: boolean }
export const TOPE_CLIENTES = 500
export async function leerClientes(db: Db, fuentes: Fuente[]): Promise<Map<string, Cliente>> {
  const filas = await leer(fuentes, 'clients', db.from('clients').select('id, name, industry, status').limit(TOPE_CLIENTES), TOPE_CLIENTES)
  return new Map(filas.map((c) => [String(c.id), { id: String(c.id), nombre: String(c.name ?? ''), estado: String(c.status ?? ''), practica: esDePractica({ rubro: c.industry, nombre: c.name }), de_baja: c.status === 'churned' }]))
}
