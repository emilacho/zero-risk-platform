/**
 * ¿A dónde se puede descargar? Condición 1 de la certificación de CC3 (31-oct): el brazo solo baja bytes por `https` hacia anfitriones públicos.
 * Nunca a IP privadas, de enlace local (metadatos de nube, 169.254/16), bucle local ni nombres internos. Puro: sin red.
 */
export function destinoPublico(direccion: string): string | null {
  let u: URL
  try { u = new URL(direccion) } catch { return 'no es una dirección válida' }
  if (u.protocol !== 'https:') return 'solo se descarga por https'
  const h = u.hostname.toLowerCase()
  if (!h) return 'sin anfitrión'
  if (h.startsWith('[') || h.includes(':')) return 'IPv6 literal no admitida'
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.arpa')) return 'anfitrión interno no admitido'
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return 'anfitrión numérico no admitido'
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    const privada = a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    if (privada) return 'IP privada o reservada no admitida'
  }
  return null
}

/** el `request_id` del proveedor: solo letras, números, guion y guion bajo (con él se arma la dirección de estado; nunca viene del llamador) */
export const REQUEST_ID_VALIDO = /^[A-Za-z0-9_-]{1,120}$/
