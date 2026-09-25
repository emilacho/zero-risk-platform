/**
 * EL CABLE PARA MIRAR · lado de la puerta (`/api/agents/run-sdk`) · CC#1 · 2026-09-25 · §144 Emilio.
 *
 * La puerta sólo tiene que DEJAR PASAR el campo opcional `images` (y `images_mode`) hacia el
 * corredor de Railway, que es quien arma el pedido con bloques de imagen
 * (`services/agent-runner/src/lib/imagenes-en-el-pedido.ts`). Espejo de la validación de allá:
 * lo mal formado se rechaza acá, en ~1 ms, antes de pagar nada. Sin el campo, el cuerpo que viaja
 * al corredor es BYTE A BYTE el de siempre (regla del encargo: aditivo · quien no manda fotos no
 * nota nada).
 */
export type ImagenDelPedido = { url: string; label?: string }
export type ModoImagenes = 'url' | 'base64'

export const MAX_IMAGENES = 20
export const MAX_LABEL = 80

export function leerImagenesDelPedido(
  body: { images?: unknown; images_mode?: unknown; imagesMode?: unknown },
  ctx: Record<string, unknown>,
): { images: ImagenDelPedido[]; imagesMode: ModoImagenes; error: string | null } {
  const raw = body.images ?? ctx.images
  const modoRaw = body.images_mode ?? body.imagesMode ?? ctx.images_mode ?? ctx.imagesMode
  const imagesMode: ModoImagenes = modoRaw === 'base64' ? 'base64' : 'url'
  if (raw === undefined || raw === null) return { images: [], imagesMode, error: null }
  if (!Array.isArray(raw)) return { images: [], imagesMode, error: 'images must be an array of {url, label?}' }
  if (raw.length > MAX_IMAGENES) return { images: [], imagesMode, error: `images: at most ${MAX_IMAGENES} per request` }
  const out: ImagenDelPedido[] = []
  const vistas = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i]
    const url = typeof it === 'string' ? it : it && typeof it === 'object' ? (it as { url?: unknown }).url : undefined
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url.trim())) {
      return { images: [], imagesMode, error: `images[${i}].url must be an http(s) URL` }
    }
    const labelRaw = it && typeof it === 'object' ? (it as { label?: unknown }).label : undefined
    if (labelRaw !== undefined && labelRaw !== null && typeof labelRaw !== 'string') {
      return { images: [], imagesMode, error: `images[${i}].label must be a string` }
    }
    const u = url.trim()
    if (vistas.has(u)) continue
    vistas.add(u)
    const label = typeof labelRaw === 'string' ? labelRaw.trim().slice(0, MAX_LABEL) : ''
    out.push(label ? { url: u, label } : { url: u })
  }
  return { images: out, imagesMode, error: null }
}

/** Lo que se AÑADE al cuerpo hacia el corredor · `{}` cuando no hay imágenes (el cuerpo queda igual que hoy). */
export function campoImagenesDelProxy(images: ImagenDelPedido[], imagesMode: ModoImagenes): Record<string, unknown> {
  return images.length ? { images, imagesMode } : {}
}
