/**
 * SPRINT 1 · MEJORA 3 · el puerto `imagen` de la oficina manda la foto del cliente a la ruta de imágenes y devuelve si se usó.
 * Sin red: fetch simulado.
 */
import { describe, expect, it } from 'vitest'
import { crearPuertos, type Entorno } from '@/lib/oficina/adaptadores'

const ENV = { baseUrl: 'https://app.test', internalKey: 'k-interna', openaiKey: 'sk-test', revisorModelo: 'm', revisorPrecioEntrada: 2, revisorPrecioSalida: 10, slackToken: 'x', bucket: 'b' } as Entorno
const FOTO = { id: 'f-1', url: 'https://proyecto.supabase.co/storage/v1/object/public/client-social-images/c/f-1.jpg' }

function falso(respuesta: Record<string, unknown>) {
  const cuerpos: Array<Record<string, unknown>> = []
  const f = (async (_u: string, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(JSON.stringify({ image_url: 'https://bucket.test/i.png', generation_id: 'g-1', cost_usd: 0.0256, ...respuesta }), { status: 200 })
  }) as typeof fetch
  return { P: crearPuertos({} as never, ENV, f), cuerpos }
}
const pedido = { prompt: 'escena', client_id: 'c', encargo_id: 'e', dry_run: false }

describe('puerto imagen · la foto del cliente viaja a la ruta', () => {
  it('🔴 con foto: manda `reference_image_url` y devuelve lo que la ruta dijo', async () => {
    const { P, cuerpos } = falso({ referencia: { usada: true } })
    const r = await P.imagen({ ...pedido, foto: FOTO })
    expect(cuerpos[0].reference_image_url).toBe(FOTO.url)
    expect(r).toMatchObject({ ok: true, referencia: { usada: true } })
  })
  it('🔴 la ruta generó sin la foto: el motivo llega tal cual', async () => {
    const { P } = falso({ referencia: { usada: false, motivo: 'la foto no es PNG, JPEG ni WEBP: se generó sin ella' } })
    expect(await P.imagen({ ...pedido, foto: FOTO })).toMatchObject({ referencia: { usada: false, motivo: /no es PNG/ } })
  })
  it('🔴 una ruta vieja que no contesta `referencia` NO cuenta como usada (y se dice)', async () => {
    const { P } = falso({})
    expect(await P.imagen({ ...pedido, foto: FOTO })).toMatchObject({ referencia: { usada: false, motivo: /no dijo/ } })
  })
  it('sin foto: el cuerpo es el de siempre y no hay `referencia`', async () => {
    const { P, cuerpos } = falso({})
    const r = await P.imagen(pedido)
    expect(cuerpos[0]).not.toHaveProperty('reference_image_url')
    expect(r).not.toHaveProperty('referencia')
  })
  it('dry_run con foto: no sale a la red y se anota como usada (simulado)', async () => {
    const { P, cuerpos } = falso({})
    expect(await P.imagen({ ...pedido, dry_run: true, foto: FOTO })).toMatchObject({ ok: true, costo_usd: 0, referencia: { usada: true } })
    expect(cuerpos).toHaveLength(0)
  })
})
