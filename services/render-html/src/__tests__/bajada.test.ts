/**
 * S2-5 · 🟡 de CC6 (vi1) · la bajada de los archivos del render: sin seguir redirecciones, con tope por lo declarado y por lo que llega.
 */
import { describe, expect, it } from 'vitest'
import { bajarArchivo, opcionesDeBajada } from '../bajada'

type Visto = { url: string; o: RequestInit }
function servidor(cuerpo: Uint8Array[] | null, o: { status?: number; largo?: number } = {}) {
  const vistos: Visto[] = []
  const f = async (url: string, op: RequestInit) => {
    vistos.push({ url, o: op })
    const flujo = cuerpo === null ? null : new ReadableStream<Uint8Array>({ start(c) { for (const t of cuerpo) c.enqueue(t); c.close() } })
    const h = new Headers()
    if (o.largo !== undefined) h.set('content-length', String(o.largo))
    return new Response(flujo, { status: o.status ?? 200, headers: h })
  }
  return { f, vistos }
}
const b = (n: number) => new Uint8Array(n).fill(7)

describe('la bajada de un archivo del render', () => {
  it('NO sigue redirecciones (una dirección de la lista no puede saltar a otro host) y tiene tiempo límite', async () => {
    const s = servidor([b(3)])
    await bajarArchivo('https://abc.supabase.co/a.mp4', s.f)
    expect(s.vistos).toHaveLength(1)
    expect(s.vistos[0].url).toBe('https://abc.supabase.co/a.mp4')
    expect(s.vistos[0].o.redirect).toBe('error')
    expect(s.vistos[0].o.signal).toBeInstanceOf(AbortSignal)
    expect(opcionesDeBajada().redirect).toBe('error')
  })
  it('devuelve los bytes juntos, en orden', async () => {
    const r = await bajarArchivo('https://x/a', servidor([new Uint8Array([1, 2]), new Uint8Array([3])]).f)
    expect([...r]).toEqual([1, 2, 3])
  })
  it('rechaza lo que el servidor DECLARA más grande que el tope, sin leerlo', async () => {
    await expect(bajarArchivo('https://x/a', servidor([b(1)], { largo: 11 }).f, 10)).rejects.toThrow('archivo de más de 10 bytes')
    await expect(bajarArchivo('https://x/a', servidor([b(10)], { largo: 10 }).f, 10)).resolves.toHaveLength(10)
  })
  it('rechaza lo que LLEGA más grande que el tope aunque no lo declare (o declare menos)', async () => {
    await expect(bajarArchivo('https://x/a', servidor([b(6), b(5)]).f, 10)).rejects.toThrow('archivo de más de 10 bytes')
    await expect(bajarArchivo('https://x/a', servidor([b(6), b(5)], { largo: 4 }).f, 10)).rejects.toThrow('archivo de más de 10 bytes')
  })
  it('un error del servidor o sin cuerpo no se guarda', async () => {
    await expect(bajarArchivo('https://x/a', servidor([b(1)], { status: 404 }).f)).rejects.toThrow('no se pudo bajar un archivo (404)')
    await expect(bajarArchivo('https://x/a', servidor(null).f)).rejects.toThrow('no se pudo bajar un archivo (200)')
  })
})
