/**
 * S2-5 · la fila de renders de video: uno a la vez, fila corta, lo terminado se guarda un rato y se borra; el pedido no se queda guardado.
 */
import { describe, expect, it } from 'vitest'
import { ColaDeRenders, estadoPublico } from '../cola'

type P = { n: number }
function dibujanteControlado() {
  const pendientes: Array<{ p: P; ok: (b: Buffer) => void; mal: (e: Error) => void }> = []
  let maxEnParalelo = 0
  let enCurso = 0
  const dibujar = (p: P) => new Promise<Buffer>((ok, mal) => {
    enCurso++
    maxEnParalelo = Math.max(maxEnParalelo, enCurso)
    pendientes.push({ p, ok: (b) => { enCurso--; ok(b) }, mal: (e) => { enCurso--; mal(e) } })
  })
  return { dibujar, pendientes, max: () => maxEnParalelo }
}
const tic = () => new Promise((r) => setTimeout(r, 0))

describe('la fila de renders', () => {
  it('corre UNO a la vez, en orden de llegada', async () => {
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar)
    const a = c.agregar({ n: 1 })!, b = c.agregar({ n: 2 })!
    await tic()
    expect(c.ver(a.id)?.estado).toBe('rindiendo')
    expect(c.ver(b.id)?.estado).toBe('en_fila')
    expect(d.pendientes.map((x) => x.p.n)).toEqual([1])
    d.pendientes[0].ok(Buffer.from('mp4-1'))
    await tic(); await tic()
    expect(c.ver(a.id)?.estado).toBe('listo')
    expect(c.ver(b.id)?.estado).toBe('rindiendo')
    d.pendientes[1].ok(Buffer.from('mp4-2'))
    await c.vaciar()
    expect(c.ver(b.id)?.mp4?.toString()).toBe('mp4-2')
    expect(d.max()).toBe(1)
  })
  it('un fallo queda como «fallido» con su error y la fila sigue con el siguiente', async () => {
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar)
    const a = c.agregar({ n: 1 })!, b = c.agregar({ n: 2 })!
    await tic()
    d.pendientes[0].mal(new Error('se rompió'))
    await tic(); await tic()
    expect(c.ver(a.id)).toMatchObject({ estado: 'fallido', error: 'se rompió', mp4: null })
    expect(c.ver(b.id)?.estado).toBe('rindiendo')
    d.pendientes[1].ok(Buffer.from('x'))
    await c.vaciar()
    expect(c.ver(b.id)?.estado).toBe('listo')
  })
  it('lo que no cabe en la fila se rechaza (null), no se acumula', async () => {
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar, Date.now, 2)
    expect(c.agregar({ n: 1 })).not.toBeNull()
    await tic()
    expect(c.agregar({ n: 2 })).not.toBeNull()
    expect(c.agregar({ n: 3 })).not.toBeNull()
    expect(c.agregar({ n: 4 })).toBeNull()
    expect(c.ocupados()).toBe(3)
  })
  it('lo terminado se borra después del tiempo de guarda; lo que corre, no', async () => {
    let ahora = 1000
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar, () => ahora, 3, 500)
    const a = c.agregar({ n: 1 })!
    await tic()
    ahora = 5000
    expect(c.ver(a.id)?.estado).toBe('rindiendo')
    d.pendientes[0].ok(Buffer.from('x'))
    await c.vaciar()
    expect(c.ver(a.id)?.segundos_de_render).toBe(4)
    ahora = 5500
    expect(c.ver(a.id)).not.toBeNull()
    ahora = 5501
    expect(c.ver(a.id)).toBeNull()
  })
  it('el tiempo de render se mide; el pedido no se guarda después de usarlo; el estado público no trae el video', async () => {
    let ahora = 0
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar, () => ahora)
    const a = c.agregar({ n: 7 })!
    expect(a.pedido).toEqual({ n: 7 })
    await tic()
    ahora = 42_340
    d.pendientes[0].ok(Buffer.from('abc'))
    await c.vaciar()
    const t = c.ver(a.id)!
    expect(t.pedido).toBeNull()
    expect(t.segundos_de_render).toBe(42.3)
    expect(estadoPublico(t)).toEqual({ id: a.id, estado: 'listo', error: null, segundos_de_render: 42.3, bytes: 3 })
  })
  it('con la fila vacía, nadie ocupa el servicio (puede dormir)', async () => {
    const d = dibujanteControlado()
    const c = new ColaDeRenders<P>(d.dibujar)
    expect(c.ocupados()).toBe(0)
    c.agregar({ n: 1 })
    await tic()
    expect(c.ocupados()).toBe(1)
    d.pendientes[0].ok(Buffer.from('x'))
    await c.vaciar()
    expect(c.ocupados()).toBe(0)
  })
})
