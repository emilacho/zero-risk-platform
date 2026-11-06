/**
 * La imagen del estudio con OpenAI. `fetch` directo, NUNCA el paquete de OpenAI: el paquete reintenta solo y cobra dos veces.
 * Sin foto de partida → `/v1/images/generations` (JSON). Con foto → `/v1/images/edits` (multipart, la foto como `image`).
 * Puro salvo `fetch` (inyectable). Devuelve los bytes y el `usage` (el costo real sale de ahí, ver `image-pricing.ts`).
 */
import { imageBytesFromItem, type ImagesApiItem } from '@/lib/image-response'
import type { ImageUsage } from '@/lib/image-pricing'

type Fetch = typeof fetch

export interface PedidoDeImagen { prompt: string; modelo: string; tamano: string; foto?: { bytes: Buffer; tipo: string } | null }
export type ImagenCreada = { ok: true; bytes: Buffer; usage: ImageUsage | null } | { ok: false; status: number; error: string }

export async function crearImagen(f: Fetch, llave: string, p: PedidoDeImagen): Promise<ImagenCreada> {
  let r: Response
  try {
    if (p.foto) {
      const form = new FormData()
      form.append('model', p.modelo)
      form.append('prompt', p.prompt)
      form.append('size', p.tamano)
      form.append('quality', 'medium')
      form.append('n', '1')
      const ext = p.foto.tipo === 'image/jpeg' ? 'jpg' : p.foto.tipo === 'image/webp' ? 'webp' : 'png'
      form.append('image', new Blob([new Uint8Array(p.foto.bytes)], { type: p.foto.tipo }), `partida.${ext}`)
      r = await f('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${llave}` }, body: form })
    } else {
      r = await f('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.modelo, prompt: p.prompt, size: p.tamano, quality: 'medium', n: 1 }),
      })
    }
  } catch (e) {
    return { ok: false, status: 0, error: `no se pudo llamar a OpenAI: ${e instanceof Error ? e.message : String(e)}` }
  }
  let j: { data?: ImagesApiItem[]; usage?: ImageUsage; error?: { message?: string } } = {}
  try { j = await r.json() } catch { /* cuerpo vacío o no JSON */ }
  if (r.status >= 400) return { ok: false, status: r.status, error: (j.error?.message ?? `OpenAI respondió ${r.status}`).slice(0, 300) }
  const bytes = await imageBytesFromItem(j.data?.[0], f)
  if (!bytes) return { ok: false, status: r.status, error: 'OpenAI no devolvió imagen' }
  return { ok: true, bytes, usage: j.usage ?? null }
}
