/**
 * Lector de la respuesta de OpenAI Images (relevo 22). `gpt-image-1` devuelve
 * `b64_json`; un modelo nuevo puede devolver `url`. Aceptamos las dos y
 * reconocemos el formato real del archivo (png · jpeg · webp) en vez de
 * suponer png: el bucket `agent-images` admite los tres.
 */

export type ImageFormat = { contentType: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' }

/** Tope de descarga cuando la respuesta trae `url` (el bucket admite 10 MB). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function sniffImageFormat(buf: Buffer): ImageFormat {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: 'image/png', ext: 'png' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' }
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { contentType: 'image/webp', ext: 'webp' }
  }
  // Conducta anterior: se trataba todo como png.
  return { contentType: 'image/png', ext: 'png' }
}

export interface ImagesApiItem {
  b64_json?: string
  url?: string
  revised_prompt?: string
}

/**
 * Bytes de la primera imagen. `b64_json` manda; si no está, baja `url`.
 * Devuelve null si no hay nada utilizable o la descarga falla / se pasa del tope.
 */
export async function imageBytesFromItem(
  item: ImagesApiItem | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  if (!item) return null
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return Buffer.from(item.b64_json, 'base64')
  }
  if (typeof item.url === 'string' && /^https:\/\//i.test(item.url)) {
    try {
      const res = await fetchImpl(item.url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) return null
      const ab = await res.arrayBuffer()
      if (ab.byteLength === 0 || ab.byteLength > MAX_IMAGE_BYTES) return null
      return Buffer.from(ab)
    } catch {
      return null
    }
  }
  return null
}
