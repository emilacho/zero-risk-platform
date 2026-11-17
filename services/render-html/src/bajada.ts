/**
 * La bajada de un archivo del render (S2-5 · CC2 · 🟡 de CC6 vi1): separada para probarla con un `fetch` inyectado.
 *  · sin seguir redirecciones (`redirect: 'error'`): una dirección de la lista no puede saltar a otro host;
 *  · con tope de tamaño dos veces: el que declara el servidor (content-length) y los bytes que llegan de verdad;
 *  · con tiempo límite.
 * La lista de hosts se revisa antes (`validarPedidoVideo`); aquí solo se baja lo ya permitido.
 */
import { LIMITES } from './logica'

type Fetch = (url: string, o: RequestInit) => Promise<Response>

/** las opciones del pedido de bajada (exportadas para que la prueba exija `redirect: 'error'`) */
export const opcionesDeBajada = (timeoutMs = 120_000): RequestInit => ({ redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })

export async function bajarArchivo(url: string, f: Fetch = fetch, tope: number = LIMITES.archivo_max_bytes): Promise<Buffer> {
  const r = await f(url, opcionesDeBajada())
  if (!r.ok || !r.body) throw new Error(`no se pudo bajar un archivo (${r.status})`)
  const largo = Number(r.headers.get('content-length') ?? 0)
  if (largo > tope) throw new Error(`archivo de más de ${tope} bytes`)
  const partes: Buffer[] = []
  let total = 0
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += trozo.length
    if (total > tope) throw new Error(`archivo de más de ${tope} bytes`)
    partes.push(Buffer.from(trozo))
  }
  return Buffer.concat(partes)
}
