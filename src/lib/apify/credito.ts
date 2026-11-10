/**
 * ¿QUEDA CRÉDITO DE APIFY ESTE MES? (10-nov · Lenovo por Emilio: «sí, construye el arreglo»). La pregunta que el flujo de Apify hace en su puerta ANTES de llamar a Apify.
 * Sin crédito, Apify rechaza toda corrida (403 «monthly usage limit») y cada pedido quedaba como una falla en Riesgos. Ahora la puerta contesta enseguida «sin crédito»,
 * el empleado lo declara («datos sin actualizar: crédito de Apify agotado») y la ejecución NO es una falla: la alarma es UNA, la línea de saldo de Riesgos (`saldo:apify`).
 * El criterio es el de Apify (crédito del mes agotado), NO el 90 % del portero: la firma de Emilio deja raspar a lo que no es el raspado diario mientras haya crédito.
 * Si la cuenta no se puede leer, la puerta deja pasar (como hasta hoy) y lo dice: una lectura caída no apaga el raspado.
 */
import type { UsoDelPlan } from '@/lib/portero-alimenta/plan-apify'

export const DATOS_SIN_ACTUALIZAR = 'datos sin actualizar: crédito de Apify agotado'

export interface RespuestaDeCredito {
  hay_credito: boolean
  leido: boolean
  usado_usd: number | null
  credito_usd: number | null
  hasta: string | null
  mensaje: string | null
  detalle?: string
}

/** sin crédito = lo usado alcanzó el crédito del mes (lo que hace que Apify bloquee) */
export function creditoDeApify(uso: UsoDelPlan): RespuestaDeCredito {
  const hasta = uso.ciclo_hasta ? uso.ciclo_hasta.slice(0, 10) : null
  const hay = uso.usado_usd < uso.credito_usd
  return {
    hay_credito: hay,
    leido: true,
    usado_usd: uso.usado_usd,
    credito_usd: uso.credito_usd,
    hasta,
    mensaje: hay ? null : `${DATOS_SIN_ACTUALIZAR}${hasta ? ` hasta el ${hasta}` : ''}. No se llamó a Apify (US$ 0). Usa lo que ya sabes o lo guardado, y dilo en tu aporte.`,
  }
}

/** la cuenta no se pudo leer: se deja pasar, declarado */
export const creditoSinLeer = (detalle: string): RespuestaDeCredito => ({ hay_credito: true, leido: false, usado_usd: null, credito_usd: null, hasta: null, mensaje: null, detalle })
