/**
 * SPRINT 1 · MEJORA 3 · la imagen se EDITA sobre la foto real del cliente (16-nov · GO-LENOVO sprint 1 calidad de piezas).
 *
 * Cuando el llamador pasa una foto propia del cliente como referencia, `/api/images/generate` llama a `/v1/images/edits`
 * con esa foto, para conservar el producto real; sin foto, o si la foto no se puede usar, genera como siempre
 * (`/v1/images/generations`) y lo dice en `referencia.motivo`. Sin rejas: una foto que no sirve nunca bloquea la imagen.
 *
 * Puro salvo `fetch` (inyectable). Agnóstico: no sabe de rubros ni de clientes.
 */

type Fetch = typeof fetch

/** OpenAI admite hasta 50 MB por imagen de entrada; una foto de red social pesa mucho menos. Más que esto es un error de dato. */
export const TOPE_DE_LA_FOTO_BYTES = 20 * 1024 * 1024
const TIPOS = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Solo se baja una foto del almacén público de NUESTRO proyecto (donde viven las fotos de los clientes).
 * Cualquier otra dirección se ignora: la ruta no sale a buscar archivos a donde le digan.
 */
export function referenciaPermitida(url: string, supabaseUrl: string | undefined | null): boolean {
  if (!supabaseUrl) return false
  let u: URL, s: URL
  try { u = new URL(url); s = new URL(supabaseUrl) } catch { return false }
  return u.protocol === 'https:' && u.host === s.host && u.pathname.startsWith('/storage/v1/object/public/') && !u.pathname.includes('..')
}

/** el tipo de la foto por sus primeros bytes (la cabecera del almacén puede mentir) */
export function tipoDeFoto(b: Buffer): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export type FotoBajada = { ok: true; bytes: Buffer; tipo: string } | { ok: false; motivo: string }

export async function bajarFoto(f: Fetch, url: string): Promise<FotoBajada> {
  let r: Response
  try { r = await f(url) } catch (e) { return { ok: false, motivo: `no se pudo bajar la foto: ${e instanceof Error ? e.message : String(e)}` } }
  if (!r.ok) return { ok: false, motivo: `el almacén respondió ${r.status} al bajar la foto` }
  const bytes = Buffer.from(await r.arrayBuffer())
  if (bytes.length === 0) return { ok: false, motivo: 'la foto vino vacía' }
  if (bytes.length > TOPE_DE_LA_FOTO_BYTES) return { ok: false, motivo: `la foto pesa ${bytes.length} bytes (más de ${TOPE_DE_LA_FOTO_BYTES})` }
  const tipo = tipoDeFoto(bytes)
  if (!tipo || !TIPOS.has(tipo)) return { ok: false, motivo: 'la foto no es PNG, JPEG ni WEBP' }
  return { ok: true, bytes, tipo }
}

/**
 * El pedido de edición: la foto manda sobre el producto, el prompt manda sobre la escena.
 * Sin esta instrucción el modelo cambia el plato (agrega ingredientes) y copia rótulos de la foto (medido el 03-oct).
 */
export function promptDeEdicion(prompt: string): string {
  return [
    'Use the attached photo of the client\'s real product as the base of the image.',
    'Keep the product exactly as it appears in the photo: same food or item, same shape, ingredients, colors, portion and plating. Do not add, remove or replace any part of the product.',
    'Change only the scene around it (setting, background, light, angle, props) following the brief below.',
    'Do not reproduce any text, label, logo, phone number or sign from the photo, and do not add new text.',
    '',
    'Brief:',
    prompt,
  ].join('\n')
}

/**
 * 18-nov · GO Lenovo «los creativos ven las fotos» (firma de Emilio 14:16): una imagen puede llevar VARIAS fotos reales (la del plano y las de sus personajes,
 * productos o lugares). Cuántas como máximo: las que admite la edición de OpenAI con los modelos gpt-image (16); la imagen 1 es la base.
 */
export const MAX_FOTOS_POR_IMAGEN = 16

/** con varias fotos, el que pide dice en el brief qué es cada una («Image 2 is the character reference of …»); aquí solo la regla de no cambiar lo real */
export function promptDeEdicionConVarias(prompt: string, n: number): string {
  return [
    `${n} real photos of the client are attached, in order (image 1 to image ${n}). Image 1 is the base of the image; the brief below says what each one shows.`,
    'Every real element that appears in an attached photo (a character, a product or dish, a place, a uniform, a package) must look exactly as it does in its photo: same shape, colors, details, proportions and clothing. Do not redesign it.',
    'Change only what the brief asks for (setting, light, angle, pose, props).',
    'Do not reproduce any text, label, logo, phone number or sign from the photos, and do not add new text.',
    '',
    'Brief:',
    prompt,
  ].join('\n')
}

/**
 * 18-nov · las OTRAS fotos de un pedido (detrás de la base): sin repetir ni repetir la base, hasta MAX_FOTOS_POR_IMAGEN con ella, solo del almacén del proyecto.
 * Sin base usable no se baja ninguna (la base manda la composición). Cada una que no sirve se omite con su motivo: nunca frena la imagen.
 */
export async function bajarOtrasFotos(f: Fetch, urls: string[], o: { base: string | null; baseUsable: boolean; almacen: string | undefined | null }): Promise<{ otras: Array<{ bytes: Buffer; tipo: string }>; usadas: string[]; omitidas: Array<{ url: string; motivo: string }> }> {
  const pedidas = urls.filter((u, i) => !!u && u !== o.base && urls.indexOf(u) === i).slice(0, MAX_FOTOS_POR_IMAGEN - 1)
  const otras: Array<{ bytes: Buffer; tipo: string }> = [], usadas: string[] = [], omitidas: Array<{ url: string; motivo: string }> = []
  if (!o.baseUsable) return { otras, usadas, omitidas: pedidas.map((url) => ({ url, motivo: 'la foto base no se pudo usar' })) }
  for (const u of pedidas) {
    if (!referenciaPermitida(u, o.almacen)) { omitidas.push({ url: u, motivo: 'no está en el almacén del proyecto' }); continue }
    const b = await bajarFoto(f, u)
    if (b.ok) { otras.push({ bytes: b.bytes, tipo: b.tipo }); usadas.push(u) } else omitidas.push({ url: u, motivo: b.motivo })
  }
  return { otras, usadas, omitidas }
}

export interface PedidoDeEdicion { prompt: string; model: string; size: string; quality: string | null; foto: { bytes: Buffer; tipo: string }; /** las fotos que siguen a la base (18-nov) */ otras?: Array<{ bytes: Buffer; tipo: string }> }

const extension = (tipo: string): string => (tipo === 'image/jpeg' ? 'jpg' : tipo === 'image/webp' ? 'webp' : 'png')

/** el cuerpo multipart de `/v1/images/edits`: una foto como `image` (lo de siempre); varias, todas como `image[]` en orden, la base primero */
export function cuerpoDeEdicion(p: PedidoDeEdicion): FormData {
  const form = new FormData()
  const otras = (p.otras ?? []).slice(0, MAX_FOTOS_POR_IMAGEN - 1)
  form.append('model', p.model)
  form.append('prompt', otras.length ? promptDeEdicionConVarias(p.prompt, otras.length + 1) : promptDeEdicion(p.prompt))
  form.append('size', p.size)
  form.append('n', '1')
  if (p.quality) form.append('quality', p.quality)
  if (!otras.length) form.append('image', new Blob([new Uint8Array(p.foto.bytes)], { type: p.foto.tipo }), `referencia.${extension(p.foto.tipo)}`)
  else [p.foto, ...otras].forEach((f, i) => form.append('image[]', new Blob([new Uint8Array(f.bytes)], { type: f.tipo }), `referencia-${i + 1}.${extension(f.tipo)}`))
  return form
}
