/**
 * LA CAUSA EXTERNA de un turno caído · GO Lenovo 24-nov (decisión de Emilio 11:45 Zúrich): «si se cae algo por cualquier razón (saldo, internet, falla de servidor,
 * Anthropic, etc.) no sería bueno dejar botado el trabajo que ya se hizo. Retomar desde el punto exacto donde se cayó sería lo correcto.»
 *
 * Hallazgo (encargo real 9aac063b, una gran idea de un cliente real): el libro guardó las vueltas 1-2 (US$ 10,25); luego 15 turnos seguidos murieron con «Credit balance is too low»
 * a US$ 0, cada uno contó como uno de los 3 reintentos del agente, la mesa agotó a todos (también al director para integrar) y entregó la integración vieja.
 *
 * Aquí se decide, SOLO con una lista cerrada, si el turno cayó por algo de AFUERA (el proveedor sin saldo, saturado o caído, o la red): eso no dice nada del agente,
 * así que no cuenta como intento y la mesa queda EN PAUSA, reanudable, en vez de cerrar. Lo que no está en la lista sigue como hoy (cuenta como intento).
 * La lista copia la del corredor (`services/agent-runner/src/lib/sdk-call-retry.ts`: lo que él ya trata como pasajero) más el saldo agotado, que él no reintenta.
 * Un «sin vuelta» del vigía NO está: un turno colgado puede ser del agente; sigue siendo un reintento normal.
 * Pura.
 */

export type ClaveDeCausaExterna = 'saldo' | 'limite_del_proveedor' | 'proveedor_caido' | 'red'

export interface CausaExterna { clave: ClaveDeCausaExterna; /** el error tal como llegó, limpio y corto (lo lee el dashboard) */ motivo: string }

/** frases (sin mayúsculas) que delatan cada causa · lista cerrada */
export const FRASES_DE_CAUSA_EXTERNA: Readonly<Record<ClaveDeCausaExterna, readonly string[]>> = {
  saldo: ['credit balance is too low', 'insufficient_quota', 'insufficient credit', 'billing_error'],
  limite_del_proveedor: ['overloaded', 'rate limit', 'rate_limit', 'too many requests'],
  proveedor_caido: [
    'service was not able to process', 'server-side issue', 'temporarily unavailable', 'internal server error', 'internal_server_error',
    '502 bad gateway', '503 service unavailable', '504 gateway timeout', 'bad gateway', 'service unavailable', 'gateway timeout',
  ],
  red: [
    'request timed out', 'connection reset', 'connection aborted', 'connection to the server was closed', 'socket hang up', 'fetch failed',
    'econnreset', 'etimedout', 'econnrefused', 'econnaborted', 'eai_again', 'epipe', 'enetunreach', 'ehostunreach',
  ],
}

/** un código HTTP del proveedor dicho en el texto («status 529», «HTTP 503», «status=429»): nunca un número suelto (un «US$ 0.0500» no es un 500) */
const CODIGO_EN_EL_TEXTO = /\b(?:status|http|c[oó]digo)\s*[:=]?\s*(429|5\d\d)\b/i

// el motivo va ENTERO (sin cortes · G9): solo se aplanan los saltos y los espacios para que se lea en una línea
const limpio = (t: string): string => t.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()

const porCodigo = (c: number): ClaveDeCausaExterna | null => (c === 429 || c === 529 ? 'limite_del_proveedor' : c >= 500 && c <= 599 ? 'proveedor_caido' : null)

/**
 * ¿el turno cayó por una causa externa? · `error` el texto del fallo · `upstream_status` el código que el corredor le devolvió a run-sdk (lo pasa el flujo «Oficina · un turno»)
 * · `pedido_no_llego` el pedido ni salió (la red). Sin error no hay causa.
 */
export function causaExterna(r: { error?: unknown; upstream_status?: unknown; pedido_no_llego?: unknown }): CausaExterna | null {
  const error = typeof r.error === 'string' ? r.error : ''
  if (!error.trim() && r.pedido_no_llego !== true) return null
  const motivo = limpio(error) || 'el pedido del turno no llegó'
  const t = error.toLowerCase()
  // el saldo primero: un «Credit balance is too low» puede venir envuelto en un 400 que dice otra cosa
  for (const clave of ['saldo', 'limite_del_proveedor', 'proveedor_caido', 'red'] as const) {
    if (FRASES_DE_CAUSA_EXTERNA[clave].some((f) => t.includes(f))) return { clave, motivo }
  }
  const delTexto = CODIGO_EN_EL_TEXTO.exec(error)
  const porElTexto = delTexto ? porCodigo(Number(delTexto[1])) : null
  if (porElTexto) return { clave: porElTexto, motivo }
  const porElCorredor = Number.isInteger(r.upstream_status) ? porCodigo(r.upstream_status as number) : null
  if (porElCorredor) return { clave: porElCorredor, motivo }
  if (r.pedido_no_llego === true) return { clave: 'red', motivo }
  return null
}

/** la nota del libro de un turno que cayó por causa externa: NO empieza con `turno_fallido`, así nunca se cuenta como intento del agente */
export const PREFIJO_TURNO_EN_PAUSA = 'turno_en_pausa'
export const PREFIJO_TURNO_FALLIDO = 'turno_fallido'

/**
 * ¿esta nota del libro cuenta como un intento fallido del agente? · solo un `turno_fallido` cuya causa NO es externa.
 * Por eso un libro de ANTES de este arreglo (notas `turno_fallido: … Credit balance is too low …`) también vuelve a planificarse desde donde se cayó.
 */
export function cuentaComoIntentoFallido(a: { tipo: string; texto: string }): boolean {
  if (a.tipo !== 'nota' || !a.texto.startsWith(PREFIJO_TURNO_FALLIDO)) return false
  return causaExterna({ error: a.texto.slice(PREFIJO_TURNO_FALLIDO.length) }) === null
}

/** la pausa que la mesa guarda en su estado (la lee el dashboard; la borra la reanudación con `siguiente`) */
export interface PausaExterna {
  causa: ClaveDeCausaExterna
  motivo: string
  agente: string
  /** el tipo de turno que se cayó (aportar, integrar, criticar…) y la clave del paso: desde ahí se retoma */
  tipo: string
  paso: string
  /** el número del turno caído */
  n: number
  /** hora ISO */
  en: string
}

/** el texto de la causa, para personas (dashboard y aviso) */
export const CAUSA_LEGIBLE: Readonly<Record<ClaveDeCausaExterna, string>> = {
  saldo: 'el proveedor de los modelos se quedó sin saldo',
  limite_del_proveedor: 'el proveedor de los modelos está saturado o limitó los pedidos',
  proveedor_caido: 'el proveedor de los modelos respondió con una falla de su servidor',
  red: 'el pedido no llegó por la red',
}

/** el aporte del libro que dice por qué cayó el turno (la nota de pausa o de turno fallido), sin el prefijo; null si no es una nota de caída */
const motivoDeLaNota = (a: { tipo: string; texto: string }): string | null => {
  if (a.tipo !== 'nota') return null
  for (const p of [PREFIJO_TURNO_EN_PAUSA, PREFIJO_TURNO_FALLIDO]) if (a.texto.startsWith(`${p}:`)) return a.texto.slice(p.length + 1).trim()
  return null
}

/**
 * ¿la mesa CERRÓ por una caída externa? · el ÚLTIMO aporte de su libro es la nota de un turno caído por causa externa (así cerró 9aac063b: tras 15 caídas por saldo).
 * Es la guarda de `reanudar` sobre un encargo ya cerrado: un cierre normal (la dirección integró, un tope, una falla del agente) NO se reabre.
 */
export function cerroPorCausaExterna(libro: ReadonlyArray<{ tipo: string; texto: string }>): CausaExterna | null {
  const ult = libro[libro.length - 1]
  const m = ult ? motivoDeLaNota(ult) : null
  return m === null ? null : causaExterna({ error: m })
}
