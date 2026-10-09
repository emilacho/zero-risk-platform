/**
 * EL FORMATO DE UNA FOTO · vertical · cuadrado · horizontal · leído de las MEDIDAS de la imagen, SIN modelo (relevo 19, firma «SI APROBADO»).
 *
 * Lee solo el encabezado del archivo (PNG, JPEG, WebP, GIF): ancho y alto. Si no se puede leer con certeza devuelve `null` y el formato queda vacío: no se adivina.
 * Cuadrado = la proporción ancho/alto cae entre 0,95 y 1,05 (una foto de 1080 × 1080, o casi); por debajo es vertical (1080 × 1350 = 0,8) y por encima, horizontal (1,91:1).
 */
export const FORMATOS_VALIDOS = ['vertical', 'cuadrado', 'horizontal'] as const
export type Formato = (typeof FORMATOS_VALIDOS)[number]
export interface Medidas { ancho: number; alto: number }

const u16be = (b: Buffer, o: number): number => b.readUInt16BE(o)
const u16le = (b: Buffer, o: number): number => b.readUInt16LE(o)
const u24le = (b: Buffer, o: number): number => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const valida = (ancho: number, alto: number): Medidas | null => (Number.isInteger(ancho) && Number.isInteger(alto) && ancho > 0 && alto > 0 && ancho <= 65_535 * 4 && alto <= 65_535 * 4 ? { ancho, alto } : null)

/** ancho y alto del archivo, o `null` si no es PNG/JPEG/WebP/GIF o el encabezado está cortado o roto */
export function medidasDeLaImagen(bytes: Buffer): Medidas | null {
  try {
    // PNG · firma de 8 bytes y el trozo IHDR (ancho y alto en 4 bytes cada uno)
    if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && bytes.toString('latin1', 12, 16) === 'IHDR') return valida(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
    // GIF · «GIF87a»/«GIF89a» y la pantalla lógica (2 bytes cada uno, little-endian)
    if (bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.toString('latin1', 0, 6))) return valida(u16le(bytes, 6), u16le(bytes, 8))
    // WebP · RIFF…WEBP y uno de los tres trozos: VP8 (con pérdida), VP8L (sin pérdida) o VP8X (extendido)
    if (bytes.length >= 30 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
      const tipo = bytes.toString('latin1', 12, 16)
      if (tipo === 'VP8 ') return valida(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff)
      if (tipo === 'VP8L' && bytes[20] === 0x2f) { const v = bytes.readUInt32LE(21); return valida((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1) }
      if (tipo === 'VP8X') return valida(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1)
      return null
    }
    // JPEG · FFD8 y se recorren los segmentos hasta uno de «inicio de cuadro» (SOF0–SOF15, salvo DHT/JPG/DAC), que trae alto y ancho
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let o = 2
      while (o + 4 <= bytes.length) {
        if (bytes[o] !== 0xff) return null
        let marca = bytes[o + 1]
        while (marca === 0xff && o + 2 < bytes.length) { o++; marca = bytes[o + 1] } // relleno
        if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { o += 2; continue } // marcas sin largo
        if (marca === 0xd9) return null // fin de imagen sin haber visto el cuadro
        const largo = u16be(bytes, o + 2)
        if (largo < 2) return null
        if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
          if (o + 9 > bytes.length) return null
          return valida(u16be(bytes, o + 7), u16be(bytes, o + 5))
        }
        o += 2 + largo
      }
    }
    return null
  } catch {
    return null
  }
}

/** vertical / cuadrado / horizontal según la proporción; `null` si no hay medidas */
export function formatoDe(m: Medidas | null): Formato | null {
  if (!m) return null
  const proporcion = m.ancho / m.alto
  return proporcion < 0.95 ? 'vertical' : proporcion > 1.05 ? 'horizontal' : 'cuadrado'
}

/** el formato de una imagen que llega en base64 (sin modelo) */
export const formatoDeLaFoto = (base64: string): Formato | null => formatoDe(medidasDeLaImagen(Buffer.from(base64, 'base64')))
