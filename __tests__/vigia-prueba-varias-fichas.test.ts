/** Vigía de la prueba · varias fichas del mismo nombre: el 20-oct tres fichas «Zero Risk Seguridad Industrial» gastaron US$ 12,94 y un vigía por ficha solo veía una. Puro, US$ 0, sin red. */
import { describe, expect, it } from 'vitest'
import { crearConsulta, listaDeClientes, medir, sumaDeApify, unirFichas, validarParametros, vigilarUnaVez } from '../scripts/ops/vigia-prueba.mjs'

const A = '89b5d692-0000-4000-8000-000000000001'
const B = '003cef00-0000-4000-8000-000000000002'
const C = 'df7e47cc-0000-4000-8000-000000000003'
const OTRO = '0a2ffbd4-0000-4000-8000-000000000004'
const DESDE = '2026-10-20T00:00:00.000Z'
const llamada = (c: string, usd: number) => ({ amount_usd: usd, description: JSON.stringify({ tipo: 'llamada', client_id: c }) })

/** una «base» de mentira: devuelve las filas que pide cada ruta y anota las rutas */
function baseFalsa(o: { nombre?: string; hermanas?: string[]; agentes?: Record<string, number>; apify?: Array<Record<string, unknown>> } = {}) {
  const rutas: string[] = []
  const leer = async (ruta: string) => {
    rutas.push(ruta)
    if (ruta.startsWith('clients?select=name')) return o.nombre === undefined ? [] : [{ name: o.nombre }]
    if (ruta.startsWith('clients?select=id')) return (o.hermanas ?? []).map((id) => ({ id }))
    if (ruta.startsWith('agent_invocations')) {
      const ids = (ruta.match(/client_id=in\.\(([^)]*)\)/) ?? [])[1]?.split(',') ?? []
      return ids.filter((id) => o.agentes?.[id] !== undefined).map((id) => ({ cost_usd: o.agentes![id] }))
    }
    if (ruta.startsWith('costs')) return o.apify ?? []
    return []
  }
  return { leer, rutas }
}
const P = { cliente: A, desde: DESDE, tope: 13, aviso: 10.4, intervalo: 30 }

describe('listas de fichas', () => {
  it('--cliente admite varias fichas por coma, sin repetidos ni vacíos', () => {
    expect(listaDeClientes(`${A}, ${B},${A},`)).toEqual([A, B])
    expect(listaDeClientes(undefined)).toEqual([])
  })
  it('validarParametros acepta la lista, deja la primera como `cliente` y rechaza si alguna está mal', () => {
    const ok = validarParametros({ cliente: `${A},${B}`, desde: DESDE, tope: '13' })
    expect(ok.ok && ok.clientes).toEqual([A, B]); expect(ok.ok && ok.cliente).toBe(A)
    expect(validarParametros({ cliente: `${A},nada`, desde: DESDE, tope: '13' }).ok).toBe(false)
    expect(validarParametros({ cliente: '', desde: DESDE, tope: '13' }).ok).toBe(false)
  })
  it('unirFichas junta la base con las hermanas sin repetir', () => {
    expect(unirFichas([A], [A, B, C])).toEqual([A, B, C]); expect(unirFichas([A], undefined)).toEqual([A])
  })
})

describe('Apify de varias fichas', () => {
  it('suma las llamadas de todas las fichas de la lista y deja fuera a las ajenas', () => {
    const filas = [llamada(A, 1), llamada(B, 2), llamada(C, 4), llamada(OTRO, 100)]
    expect(sumaDeApify(filas as never, [A, B, C])).toBe(7)
    expect(sumaDeApify(filas as never, A)).toBe(1) // la firma vieja (una ficha) sigue valiendo
  })
})

describe('crearConsulta · sumar las fichas del mismo nombre', () => {
  it('sin --mismo-nombre mide solo la ficha pedida (comportamiento de siempre) y no pregunta por nombres', async () => {
    const b = baseFalsa({ agentes: { [A]: 3, [B]: 5 } })
    const r = await crearConsulta(b.leer)(P)
    expect(r.clientes).toEqual([A]); expect(r.agentes).toEqual([{ cost_usd: 3 }])
    expect(b.rutas.some((x) => x.startsWith('clients'))).toBe(false)
  })
  it('con --mismo-nombre suma el gasto de las tres fichas (el 20-oct: 3,40 + 4,11 + 5,43)', async () => {
    const b = baseFalsa({ nombre: 'Zero Risk Seguridad Industrial', hermanas: [A, B, C], agentes: { [A]: 3.4, [B]: 4.11, [C]: 5.43 }, apify: [llamada(A, 0.5), llamada(C, 1)] })
    const m = await medir(crearConsulta(b.leer, { mismoNombre: true }), P)
    expect(m.agentes).toBeCloseTo(12.94, 6); expect(m.apify).toBeCloseTo(1.5, 6); expect(m.total).toBeCloseTo(14.44, 6); expect(m.fichas).toBe(3)
  })
  it('busca las hermanas por el NOMBRE de la pedida y desde la fecha de la prueba', async () => {
    const b = baseFalsa({ nombre: 'Zero Risk Seguridad Industrial', hermanas: [A] })
    await crearConsulta(b.leer, { mismoNombre: true })(P)
    const ruta = b.rutas.find((x) => x.startsWith('clients?select=id'))!
    expect(ruta).toContain('name=eq.' + encodeURIComponent('Zero Risk Seguridad Industrial'))
    expect(ruta).toContain('created_at=gte.' + encodeURIComponent(DESDE))
  })
  it('la ficha pedida cuenta aunque la búsqueda por nombre no la devuelva, y una ficha de otro nombre no entra', async () => {
    const b = baseFalsa({ nombre: 'X', hermanas: [], agentes: { [A]: 2, [OTRO]: 50 } })
    const r = await crearConsulta(b.leer, { mismoNombre: true })(P)
    expect(r.clientes).toEqual([A]); expect(r.agentes).toEqual([{ cost_usd: 2 }])
  })
  it('si no encuentra la ficha pedida falla en voz alta (no mide cero)', async () => {
    await expect(crearConsulta(baseFalsa({}).leer, { mismoNombre: true })(P)).rejects.toThrow(/mismo nombre/)
  })
  it('una ficha nueva que nace a mitad de la prueba entra en la vuelta siguiente', async () => {
    const hermanas = [A]
    const b = baseFalsa({ nombre: 'N', hermanas, agentes: { [A]: 1, [B]: 6 } })
    const consulta = crearConsulta(b.leer, { mismoNombre: true })
    expect((await medir(consulta, P)).total).toBe(1)
    hermanas.push(B)
    expect((await medir(consulta, P)).total).toBe(7)
  })
})

describe('vigilarUnaVez con varias fichas', () => {
  it('pasa el aviso con la suma de las tres y sale con 10; el tope (13) sale con 20', async () => {
    const mk = (a: number, b: number, c: number) => baseFalsa({ nombre: 'N', hermanas: [A, B, C], agentes: { [A]: a, [B]: b, [C]: c } })
    const r1 = await vigilarUnaVez({ consultar: crearConsulta(mk(3.4, 4.11, 5.43).leer, { mismoNombre: true }), rest: async () => ({ status: 200, json: [] }), apagar: false }, P)
    expect(r1.codigo).toBe(10)
    const r2 = await vigilarUnaVez({ consultar: crearConsulta(mk(4, 4.5, 5).leer, { mismoNombre: true }), rest: async () => ({ status: 200, json: [] }), apagar: false }, P)
    expect(r2.codigo).toBe(20)
    // la misma ficha sola (como el vigía de antes) NO habría llegado al aviso
    const sola = await vigilarUnaVez({ consultar: crearConsulta(mk(3.4, 4.11, 5.43).leer), rest: async () => ({ status: 200, json: [] }), apagar: false }, P)
    expect(sola.codigo).toBe(0)
  })
})
