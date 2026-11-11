/**
 * Zero Risk · el LATIDO A LA BASE · 11-nov · regla rígida #21 (opción 1 de Lenovo 13:05 · líneas 2, 3 y 6 de CC6).
 *
 * El corredor ya late HACIA quien llama (`latido.ts`), pero ese latido no deja huella: fuera de la conexión nadie sabe si el empleado sigue vivo,
 * y los vigías lo daban por muerto con números fijos (12 min, 35 min…) aunque siguiera trabajando (6 corridas reales de más de 12 min en 60 días).
 * Mientras el empleado trabaja, esta pieza escribe `agent_dispatches.updated_at` de SU despacho cada LATIDO_A_LA_BASE_MS. La plataforma lo lee en
 * `src/lib/plazo-de-vida.ts` (la regla única de vida): un despacho que late no se da por muerto.
 *
 * 🔴 EL LATIDO NO RESUCITA NADA (CC6 línea 2): la escritura va por la llave EXACTA y SOLO si el despacho sigue `running`, en el mismo UPDATE.
 *    Un despacho `sin_cierre`, `error` o `completed` nunca vuelve a parecer vivo.
 * 🔴 EL CIERRE NO PISA UN CIERRE AJENO (CC6 línea 3): el final escribe su estado solo si el despacho sigue abierto (`accepted`/`running`). Si otro ya lo
 *    cerró (el limpiador de incidentes, por ejemplo), no se borra esa huella: se agrega en `metadata.termino_despues` que el empleado terminó después.
 * Un latido que falla no frena nada (se cuenta y se sigue). Sin llave de despacho, no late. Se apaga sin desplegar con AGENT_RUNNER_DISPATCH_HEARTBEAT_MS=0.
 *
 * Sin dependencias a propósito (como `latido.ts`): la prueba corre en la integración, que NO instala las dependencias de este servicio.
 */

/** Cada cuánto late a la base, por defecto. Debe coincidir con `LATIDO_DEL_CORREDOR_MS` de `src/lib/plazo-de-vida.ts` (lo ata una prueba). */
export const LATIDO_A_LA_BASE_MS = 60_000
export const ESTADOS_ABIERTOS = ['accepted', 'running'] as const

/** El intervalo desde el entorno: ausente ⇒ el de siempre · 0 ⇒ apagado · basura ⇒ el de siempre (nunca más rápido que 10 s). */
export function intervaloDelLatidoALaBase(env: Record<string, string | undefined>): number {
  const crudo = env.AGENT_RUNNER_DISPATCH_HEARTBEAT_MS
  if (crudo === undefined || crudo.trim() === '') return LATIDO_A_LA_BASE_MS
  const n = Number(crudo)
  if (n === 0) return 0
  return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : LATIDO_A_LA_BASE_MS
}

/** Lo mínimo que se necesita de la base (el cliente de Supabase lo cumple). */
type Respuesta = { data?: unknown; error?: { message?: string } | null }
type Consulta = PromiseLike<Respuesta> & {
  eq(k: string, v: unknown): Consulta
  in(k: string, v: readonly unknown[]): Consulta
  select(c: string): Consulta
  limit(n: number): Consulta
}
export interface BaseDelLatido { from(tabla: string): { update(v: Record<string, unknown>): Consulta; select(c: string): Consulta } }

/** UN latido: la llave exacta y `running`, en el mismo UPDATE. Devuelve si escribió. */
export async function latirUnaVez(db: BaseDelLatido, dispatchKey: string, ahora: () => Date = () => new Date()): Promise<boolean> {
  const r = await db.from('agent_dispatches').update({ updated_at: ahora().toISOString() }).eq('dispatch_key', dispatchKey).eq('status', 'running').select('dispatch_key')
  if (r.error) throw new Error(r.error.message ?? 'error al latir')
  return Array.isArray(r.data) && r.data.length > 0
}

export interface LatidoALaBase {
  detener(): void
  /** latidos escritos (para poder afirmarlo, no suponerlo) */
  latidos(): number
  /** latidos que fallaron (la base no contestó) */
  fallidos(): number
}

/** Late mientras dure el trabajo. Sin llave o con intervalo 0, no hace nada. */
export function abrirLatidoALaBase(db: BaseDelLatido | null, dispatchKey: string | null | undefined, intervaloMs: number, ahora?: () => Date): LatidoALaBase {
  let latidos = 0, fallidos = 0
  if (!db || !dispatchKey || !(intervaloMs > 0)) return { detener: () => undefined, latidos: () => 0, fallidos: () => 0 }
  let enCurso = false
  const reloj = setInterval(() => {
    if (enCurso) return // un latido lento no apila otro
    enCurso = true
    latirUnaVez(db, dispatchKey, ahora).then((ok) => { if (ok) latidos++ }, () => { fallidos++ }).finally(() => { enCurso = false })
  }, intervaloMs)
  // que el reloj no mantenga vivo el proceso por sí solo
  ;(reloj as { unref?: () => void }).unref?.()
  return { detener: () => clearInterval(reloj), latidos: () => latidos, fallidos: () => fallidos }
}

/**
 * El CIERRE del despacho: su estado final solo si sigue abierto. Si otro ya lo cerró, se deja su cierre y se anota que el empleado terminó después.
 * Devuelve qué pasó. Nunca lanza (best-effort, como antes): un fallo se devuelve como `error`.
 */
export async function cerrarSinPisar(db: BaseDelLatido, dispatchKey: string, estado: 'completed' | 'error', ahora: () => Date = () => new Date()): Promise<'cerrado' | 'ya_cerrado_anotado' | 'no_existe' | 'error'> {
  const en = ahora().toISOString()
  try {
    const r = await db.from('agent_dispatches').update({ status: estado, completed_at: en, updated_at: en }).eq('dispatch_key', dispatchKey).in('status', ESTADOS_ABIERTOS).select('dispatch_key')
    if (r.error) return 'error'
    if (Array.isArray(r.data) && r.data.length > 0) return 'cerrado'
    const l = await db.from('agent_dispatches').select('status, metadata').eq('dispatch_key', dispatchKey).limit(1)
    if (l.error) return 'error'
    const fila = (Array.isArray(l.data) ? l.data[0] : null) as { status: string; metadata: unknown } | null | undefined
    if (!fila) return 'no_existe'
    const meta = fila.metadata && typeof fila.metadata === 'object' && !Array.isArray(fila.metadata) ? (fila.metadata as Record<string, unknown>) : {}
    // condicional al estado leído: si cambió mientras tanto, no se toca
    const a = await db.from('agent_dispatches').update({ metadata: { ...meta, termino_despues: { estado, en, estado_que_tenia: fila.status } } }).eq('dispatch_key', dispatchKey).eq('status', fila.status).select('dispatch_key')
    return a.error ? 'error' : 'ya_cerrado_anotado'
  } catch {
    return 'error'
  }
}
