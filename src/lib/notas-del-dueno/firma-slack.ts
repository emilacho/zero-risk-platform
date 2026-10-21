/**
 * FIRMA DE SLACK · todo lo que llega a las rutas de Slack se acepta SOLO si viene firmado con el secreto de la app (v0 = HMAC-SHA256 de `v0:<marca>:<cuerpo crudo>`).
 * Pura (sin red): `ahora` se inyecta. Rechaza: sin secreto configurado, sin cabeceras, marca vieja (más de 5 minutos, antirepetición) o firma distinta (comparación en tiempo constante).
 */
import crypto from 'node:crypto'

export const VENTANA_S = 300

export type ResultadoDeFirma = { ok: true } | { ok: false; motivo: 'sin_secreto' | 'sin_cabeceras' | 'marca_invalida' | 'marca_vieja' | 'firma_invalida' }

export function verificarFirmaDeSlack(e: { secreto: string | undefined; firma: string | null | undefined; marca: string | null | undefined; cuerpo: string; ahoraMs: number }): ResultadoDeFirma {
  if (!e.secreto) return { ok: false, motivo: 'sin_secreto' }
  if (!e.firma || !e.marca) return { ok: false, motivo: 'sin_cabeceras' }
  if (!/^\d{9,12}$/.test(e.marca)) return { ok: false, motivo: 'marca_invalida' }
  const edad = Math.abs(Math.floor(e.ahoraMs / 1000) - Number(e.marca))
  if (edad > VENTANA_S) return { ok: false, motivo: 'marca_vieja' }
  const esperada = 'v0=' + crypto.createHmac('sha256', e.secreto).update(`v0:${e.marca}:${e.cuerpo}`).digest('hex')
  const a = Buffer.from(esperada)
  const b = Buffer.from(e.firma)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, motivo: 'firma_invalida' }
  return { ok: true }
}
