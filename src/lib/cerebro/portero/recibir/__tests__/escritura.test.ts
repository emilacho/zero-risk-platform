/**
 * PASO 7 · el escritor real del almacén (REST de la base, solo las dos tablas del paso 2). Se prueba con un `fetch` simulado que registra cada petición.
 * «Todo o nada» por ingreso: las fichas nuevas entran en UNA petición (una sola instrucción en la base); si un paso posterior falla, se COMPENSA
 * (se borran las fichas recién escritas y se deshacen las retiradas) y el ingreso queda marcado «fallido».
 */
import { describe, expect, it } from 'vitest'
import { crearAlmacen } from '../escritura'
import type { Cambios, FilaDeFicha, FilaDeIngreso } from '../tipos'

const BASE = 'https://proyecto.supabase.test'
const ING = '33333333-3333-4333-8333-333333333333'
const F1 = '44444444-4444-4444-8444-444444444441'
const F2 = '44444444-4444-4444-8444-444444444442'
const V1 = '55555555-5555-4555-8555-555555555551'
const V2 = '55555555-5555-4555-8555-555555555552'
const V3 = '55555555-5555-4555-8555-555555555553'

interface Pet { metodo: string; url: string; headers: Record<string, string>; cuerpo: unknown }
function simulado(responder: (p: Pet, n: number) => { status: number; texto?: string } = () => ({ status: 201 })) {
  const peticiones: Pet[] = []
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const p: Pet = { metodo: String(init?.method), url, headers: (init?.headers ?? {}) as Record<string, string>, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined }
    peticiones.push(p)
    const r = responder(p, peticiones.length)
    return new Response(r.texto ?? '', { status: r.status })
  }
  return { peticiones, almacen: crearAlmacen({ urlDeLaBase: BASE, llave: 'llave-de-servicio', fetchImpl }) }
}
const ficha = (id: string, extra: Partial<FilaDeFicha> = {}): FilaDeFicha => ({
  id, client_id: 'c1', ingreso_id: ING, ref: `ficha:${id}`, clase: 'producto', titulo: 'T', que_es: 'E', contenido: 'texto', archivo_nombre: null, archivo_tipo: null, archivo_enlace: null, archivo_bytes: null,
  firmas: ['a'], origen: 'su_fuente', fecha_fuente: null, reconfirmado_en: '2026-10-07T12:00:00.000Z', plazo: 'sin_plazo', vigente_hasta: null, version_de: null, huella: 'h', producto: [], sede: null,
  propiedad: 'propia', porque: null, descartada: false, motivo_descarte: null, juzgado_por: 'modelo', residual: false, provenance_tag: {}, prueba: false, ...extra,
})
const cambios = (extra: Partial<Cambios> = {}): Cambios => ({
  ingreso_id: ING, client_id: 'c1', prueba: false, fichas: [ficha(F1), ficha(F2, { version_de: V1 })], heredadas: [V2], reconfirmado_en: '2026-10-07T12:00:00.000Z',
  retiradas: [{ id: V3, motivo: 'ya no está en su fuente' }], retirada_en: '2026-10-07T12:00:00.000Z',
  final: { estado: 'fichado', cobertura: 1, motivo: null, segmentos_n: 6, segmentos_bloqueados: null }, ...extra,
})
const ingreso = (): FilaDeIngreso => ({
  id: ING, client_id: 'c1', origen: 'su_fuente', fuente_ref: 'sitio:/x', es_completa: true, huella: 'h', material: 'texto', archivo_nombre: null, archivo_tipo: null, archivo_enlace: null, archivo_bytes: null,
  segmentos_n: null, segmentos_bloqueados: null, estado: 'recibido', cobertura: null, motivo: null, workflow_id: 'wf', workflow_execution_id: 'ex', prueba: false,
})

describe('crearIngreso: el original primero', () => {
  it('un POST a cerebro_ingresos con la llave de servicio, sin devolver nada y con la fila tal cual', async () => {
    const { peticiones, almacen } = simulado()
    const r = await almacen.crearIngreso(ingreso())
    expect(r).toMatchObject({ ok: true, id: ING })
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0]).toMatchObject({ metodo: 'POST', url: `${BASE}/rest/v1/cerebro_ingresos` })
    expect(peticiones[0].headers).toMatchObject({ apikey: 'llave-de-servicio', Authorization: 'Bearer llave-de-servicio', 'content-type': 'application/json', Prefer: 'return=minimal' })
    expect(peticiones[0].cuerpo).toEqual(ingreso())
  })
  it('un fallo de la base (o de la red) vuelve como ok:false con el detalle, nunca como éxito', async () => {
    expect(await simulado(() => ({ status: 500, texto: 'boom' })).almacen.crearIngreso(ingreso())).toMatchObject({ ok: false, detalle: expect.stringMatching(/500.*boom/) })
    const roto = crearAlmacen({ urlDeLaBase: BASE, llave: 'k', fetchImpl: async () => { throw new Error('red caída') } })
    expect(await roto.crearIngreso(ingreso())).toMatchObject({ ok: false, detalle: expect.stringMatching(/red caída/) })
  })
  it('un id que no es uuid no sale: no se manda ninguna petición', async () => {
    const { peticiones, almacen } = simulado()
    expect((await almacen.crearIngreso({ ...ingreso(), id: "x'; drop table" })).ok).toBe(false)
    expect(peticiones).toHaveLength(0)
  })
})

describe('aplicar: todo o nada por ingreso', () => {
  it('orden: UNA petición con todas las fichas → renovar las heredadas → marcar las retiradas → cerrar el ingreso', async () => {
    const { peticiones, almacen } = simulado()
    const r = await almacen.aplicar(cambios())
    expect(r).toEqual({ ok: true })
    expect(peticiones.map((p) => `${p.metodo} ${p.url.replace(BASE + '/rest/v1/', '').split('?')[0]}`)).toEqual(['POST cerebro_fichas', 'PATCH cerebro_fichas', 'PATCH cerebro_fichas', 'PATCH cerebro_ingresos'])
    expect(Array.isArray(peticiones[0].cuerpo) && (peticiones[0].cuerpo as unknown[]).length).toBe(2)
    expect((peticiones[0].cuerpo as FilaDeFicha[]).map((f) => f.id)).toEqual([F1, F2])
    expect(peticiones[1].url).toBe(`${BASE}/rest/v1/cerebro_fichas?id=in.(${V2})&client_id=eq.c1`)
    expect(peticiones[1].cuerpo).toEqual({ reconfirmado_en: '2026-10-07T12:00:00.000Z' })
    expect(peticiones[2].url).toBe(`${BASE}/rest/v1/cerebro_fichas?id=in.(${V3})&client_id=eq.c1`)
    expect(peticiones[2].cuerpo).toEqual({ retirada_en: '2026-10-07T12:00:00.000Z', motivo_retirada: 'ya no está en su fuente' })
    expect(peticiones[3].url).toBe(`${BASE}/rest/v1/cerebro_ingresos?id=eq.${ING}&client_id=eq.c1`)
    expect(peticiones[3].cuerpo).toEqual({ estado: 'fichado', cobertura: 1, motivo: null, segmentos_n: 6, segmentos_bloqueados: null })
  })
  it('lo vacío no manda nada: sin fichas, sin heredadas y sin retiradas solo se cierra el ingreso', async () => {
    const { peticiones, almacen } = simulado()
    await almacen.aplicar(cambios({ fichas: [], heredadas: [], retiradas: [] }))
    expect(peticiones.map((p) => p.metodo)).toEqual(['PATCH'])
  })
  it('las retiradas con motivos distintos van en peticiones distintas (un motivo por petición)', async () => {
    const { peticiones, almacen } = simulado()
    await almacen.aplicar(cambios({ fichas: [], heredadas: [], retiradas: [{ id: V1, motivo: 'a' }, { id: V2, motivo: 'b' }, { id: V3, motivo: 'a' }] }))
    const patch = peticiones.filter((p) => p.url.includes('cerebro_fichas'))
    expect(patch).toHaveLength(2)
    expect(patch[0].url).toContain(`id=in.(${V1},${V3})`)
    expect(patch[1].url).toContain(`id=in.(${V2})`)
  })
  it('si falla la escritura de las fichas: no se escribió nada más (no hay nada que deshacer) y se dice', async () => {
    const { peticiones, almacen } = simulado((p) => ({ status: p.metodo === 'POST' ? 400 : 200, texto: 'violación' }))
    const r = await almacen.aplicar(cambios())
    expect(r).toMatchObject({ ok: false, compensado: true, detalle: expect.stringMatching(/violación/) })
    expect(peticiones).toHaveLength(1)
  })
  it('si falla un paso POSTERIOR: se COMPENSA (se borran las fichas recién escritas de ese ingreso y se deshacen las retiradas) y se informa', async () => {
    const { peticiones, almacen } = simulado((p) => ({ status: p.metodo === 'PATCH' && p.url.includes('cerebro_ingresos') ? 500 : 200, texto: 'caída' }))
    const r = await almacen.aplicar(cambios())
    expect(r).toMatchObject({ ok: false, compensado: true, detalle: expect.stringMatching(/caída/) })
    const despues = peticiones.slice(4)
    const deshace = despues.find((p) => p.metodo === 'PATCH' && p.url.includes(`id=in.(${V3})`))
    expect(deshace?.cuerpo).toEqual({ retirada_en: null, motivo_retirada: null })
    const borra = despues.find((p) => p.metodo === 'DELETE')
    expect(borra?.url).toBe(`${BASE}/rest/v1/cerebro_fichas?ingreso_id=eq.${ING}&client_id=eq.c1`)
  })
  it('si falla marcar una retirada: se deshacen las anteriores y se borran las fichas; si la compensación también falla, lo dice (compensado:false)', async () => {
    const a = simulado((p) => ({ status: p.metodo === 'PATCH' && p.url.includes(`id=in.(${V3})`) && (p.cuerpo as Record<string, unknown>).retirada_en !== null ? 500 : 200 }))
    expect(await a.almacen.aplicar(cambios())).toMatchObject({ ok: false, compensado: true })
    expect(a.peticiones.some((p) => p.metodo === 'DELETE')).toBe(true)
    const b = simulado((p) => ({ status: p.metodo === 'POST' ? 201 : 500 }))
    expect(await b.almacen.aplicar(cambios())).toMatchObject({ ok: false, compensado: false })
  })
  it('sin fichas nuevas ya escritas, un fallo posterior NO manda ningún borrado', async () => {
    const { peticiones, almacen } = simulado((p) => ({ status: p.metodo === 'PATCH' && p.url.includes('cerebro_ingresos') ? 500 : 200 }))
    await almacen.aplicar(cambios({ fichas: [] }))
    expect(peticiones.some((p) => p.metodo === 'DELETE')).toBe(false)
  })
  it('ids que no son uuid (fichas, heredadas, retiradas, ingreso): se rechaza ANTES de mandar nada', async () => {
    for (const c of [cambios({ ingreso_id: 'x' }), cambios({ heredadas: ["a'b"] }), cambios({ retiradas: [{ id: 'z)', motivo: 'm' }] }), cambios({ fichas: [ficha('no-uuid')] })]) {
      const { peticiones, almacen } = simulado()
      expect((await almacen.aplicar(c)).ok).toBe(false)
      expect(peticiones).toHaveLength(0)
    }
  })
  it('el cliente va codificado en las direcciones (no puede colar otro filtro)', async () => {
    const { peticiones, almacen } = simulado()
    await almacen.aplicar(cambios({ client_id: 'a&id=neq.0' }))
    expect(peticiones.filter((p) => p.metodo === 'PATCH').every((p) => p.url.includes('client_id=eq.a%26id%3Dneq.0'))).toBe(true)
  })
})

describe('cerrarIngreso', () => {
  it('un PATCH al ingreso con el estado y el motivo; no toca ninguna ficha', async () => {
    const { peticiones, almacen } = simulado()
    expect(await almacen.cerrarIngreso(ING, { estado: 'fallido', motivo: 'tiempo: pasó de 25000 ms' })).toEqual({ ok: true })
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0]).toMatchObject({ metodo: 'PATCH', url: `${BASE}/rest/v1/cerebro_ingresos?id=eq.${ING}`, cuerpo: { estado: 'fallido', motivo: 'tiempo: pasó de 25000 ms' } })
  })
  it('lleva solo lo que se le dio (cobertura, segmentos) y nada más', async () => {
    const { peticiones, almacen } = simulado()
    await almacen.cerrarIngreso(ING, { estado: 'bloqueado_por_seguridad', motivo: 'm', segmentos_n: 2, segmentos_bloqueados: [{ n: 1, firma: 'f', capa: 'regex_deny', severidad: 'HIGH', texto: 't' }] })
    expect(Object.keys(peticiones[0].cuerpo as object).sort()).toEqual(['estado', 'motivo', 'segmentos_bloqueados', 'segmentos_n'])
  })
  it('un id que no es uuid no sale', async () => {
    const { peticiones, almacen } = simulado()
    expect((await almacen.cerrarIngreso('no', { estado: 'fallido', motivo: 'm' })).ok).toBe(false)
    expect(peticiones).toHaveLength(0)
  })
})

describe('el escritor solo habla con sus dos tablas, con tres verbos y con la llave de servicio', () => {
  it('ninguna petición va a otra tabla ni usa otro verbo; el DELETE siempre lleva el ingreso Y el cliente', async () => {
    const todo = simulado((p) => ({ status: p.metodo === 'PATCH' && p.url.includes('cerebro_ingresos') ? 500 : 201 }))
    await todo.almacen.crearIngreso(ingreso())
    await todo.almacen.aplicar(cambios())
    await todo.almacen.cerrarIngreso(ING, { estado: 'fallido', motivo: 'm' })
    for (const p of todo.peticiones) {
      expect(['POST', 'PATCH', 'DELETE']).toContain(p.metodo)
      expect(p.url).toMatch(/^https:\/\/proyecto\.supabase\.test\/rest\/v1\/cerebro_(ingresos|fichas)(\?|$)/)
      expect(p.headers.apikey).toBe('llave-de-servicio')
      if (p.metodo === 'DELETE') expect(p.url).toMatch(/ingreso_id=eq\.[0-9a-f-]{36}&client_id=eq\./)
      if (p.metodo === 'PATCH') expect(p.url).toMatch(/\?(id=(eq|in)\.)/)
    }
  })
})
