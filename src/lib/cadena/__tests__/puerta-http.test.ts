/**
 * La puerta HTTP común de /api/cadena/*: llave interna, cuerpo, acción, fallo mapeado. Sin base, sin red.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { atender } from '../puerta-http'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'

const req = (cuerpo: unknown, headers: Record<string, string> = { 'x-api-key': 'llave' }, crudo?: string) =>
  new Request('http://x/api/cadena/campanas', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: crudo ?? JSON.stringify(cuerpo) })
const al = () => new AlmacenMemoria()

beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave' })

describe('atender', () => {
  it('sin llave interna o con una distinta: 401, y el manejador NO corre', async () => {
    let corrio = false
    const acciones = { hacer: async () => { corrio = true; return { status: 200, cuerpo: {} } } }
    expect((await atender(req({ accion: 'hacer' }, {}), acciones, al)).status).toBe(401)
    expect((await atender(req({ accion: 'hacer' }, { 'x-api-key': 'otra' }), acciones, al)).status).toBe(401)
    expect(corrio).toBe(false)
  })
  it('sin la variable del servidor queda cerrada (nunca abre por omisión)', async () => {
    delete process.env.INTERNAL_API_KEY
    expect((await atender(req({ accion: 'hacer' }), { hacer: async () => ({ status: 200, cuerpo: {} }) }, al)).status).toBe(401)
  })
  it('JSON roto, cuerpo que no es objeto y acción desconocida: 400', async () => {
    const acciones = { hacer: async () => ({ status: 200, cuerpo: {} }) }
    expect((await atender(req(null, undefined, '{no'), acciones, al)).status).toBe(400)
    expect((await atender(req([1]), acciones, al)).status).toBe(400)
    const r = await atender(req({ accion: 'otra' }), acciones, al)
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe('E-ACCION')
    expect((await atender(req({}), acciones, al)).status).toBe(400)
  })
  it('la acción corre con el cuerpo, el almacén y la hora, y su estado y cuerpo salen tal cual', async () => {
    let visto: unknown
    const r = await atender(req({ accion: 'hacer', a: 1 }), { hacer: async (_al, c, ahora) => { visto = { c, ahora }; return { status: 201, cuerpo: { hecho: true } } } }, al, () => 'AHORA')
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ hecho: true })
    expect(visto).toEqual({ c: { accion: 'hacer', a: 1 }, ahora: 'AHORA' })
  })
  it('un fallo del manejador sale como 500 con su código, nunca como un cuerpo vacío', async () => {
    const r = await atender(req({ accion: 'hacer' }), { hacer: async () => { throw new Error('la base se cayó') } }, al)
    expect(r.status).toBe(500)
    expect(await r.json()).toMatchObject({ code: 'E-CADENA-FALLO', detail: 'la base se cayó' })
  })
})
