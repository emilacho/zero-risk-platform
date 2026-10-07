/**
 * CLIENTES DE PRUEBA del portero · paso 8.
 * El cliente de prueba de siempre es `prueba-portero`; para medir AISLAMIENTO entre varios clientes de prueba, una etiqueta lo vuelve `prueba-portero-<etiqueta>`.
 * Un cliente de prueba no tiene fila en `clients`: lo único que existe de él son sus filas marcadas `prueba: true`, y SOLO él las lee (la lista y la entrega siguen
 * filtrando por `client_id`). Un cliente real nunca ve una ficha de prueba.
 */
export const CLIENTE_DE_PRUEBA_BASE = 'prueba-portero'
const ETIQUETA = /^[A-Za-z0-9_]{1,32}$/

/** la etiqueta válida (1-32 letras, números o guion bajo), o null */
export const etiquetaValida = (e: unknown): e is string => typeof e === 'string' && ETIQUETA.test(e)

/** `prueba-portero` o `prueba-portero-<etiqueta>`; cualquier otra cosa (mayúsculas distintas, espacios, sufijos raros) NO lo es */
export function esClienteDePrueba(cliente: unknown): boolean {
  if (typeof cliente !== 'string') return false
  if (cliente === CLIENTE_DE_PRUEBA_BASE) return true
  return cliente.startsWith(`${CLIENTE_DE_PRUEBA_BASE}-`) && etiquetaValida(cliente.slice(CLIENTE_DE_PRUEBA_BASE.length + 1))
}

/** el cliente de prueba de una etiqueta (sin etiqueta: el de siempre); null si la etiqueta no es válida */
export function clienteDePrueba(etiqueta: string | undefined): string | null {
  if (etiqueta === undefined) return CLIENTE_DE_PRUEBA_BASE
  return etiquetaValida(etiqueta) ? `${CLIENTE_DE_PRUEBA_BASE}-${etiqueta}` : null
}
