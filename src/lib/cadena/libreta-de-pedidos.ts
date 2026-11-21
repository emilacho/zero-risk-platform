/**
 * «CREAR CAMPAÑA» SIN VUELTA ATRÁS (GO Lenovo 10:28Z del 21-nov · firma de Emilio 10:25–10:27Z) · la LIBRETA del arreglo propio.
 * El pedido no se edita (candado de la base, migración 202611201900): lo que el sistema hace por su cuenta para que la campaña nazca se anota aparte,
 * en `cadena_config.reparaciones_de_pedidos`, por id de pedido. Solo tipos y lecturas: sin otras dependencias de la cadena (la apertura la lee sin ciclos).
 */
import type { Almacen } from './almacen'

export const CLAVE_LIBRETA_DE_PEDIDOS = 'reparaciones_de_pedidos'
/** las causas probables que el tablero muestra en letra pequeña bajo «El intento falló · Crear nuevamente» */
export const CODIGOS_DE_FALLA = {
  /** el cliente ya no tiene un plan vigente y aprobado */
  plan: 'E-PLAN',
  /** la cadena no admite a este cliente (apagada o en ensayo sin él) */
  admite: 'E-ADMITE',
  /** la sala rechazó el último intento */
  sala: 'E-SALA',
  /** se agotaron los intentos y la campaña no nació */
  tiempo: 'E-TIEMPO',
} as const
export type CodigoDeFalla = (typeof CODIGOS_DE_FALLA)[keyof typeof CODIGOS_DE_FALLA]

export interface AnotacionDelPedido {
  /** intentos propios ya hechos (re-emisiones del sobre; el envío del botón no cuenta) */
  n: number
  ultimo_en?: string
  ultimo?: 'aceptado' | 'duplicado' | 'rechazado'
  fallida?: { codigo: CodigoDeFalla; en: string; detalle: string }
}
export type LibretaDePedidos = Record<string, AnotacionDelPedido>

export function libretaDe(v: unknown): LibretaDePedidos {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as LibretaDePedidos) : {}
}

/** la anotación de fallida de un pedido, o null · una libreta ilegible LANZA (quien la lee decide: la apertura no nace a ciegas) */
export async function fallaDelPedido(al: Pick<Almacen, 'leerConfig'>, pedidoId: string): Promise<AnotacionDelPedido['fallida'] | null> {
  return libretaDe(await al.leerConfig(CLAVE_LIBRETA_DE_PEDIDOS))[pedidoId]?.fallida ?? null
}
