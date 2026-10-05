/**
 * Las rutas `indice` y `entregar` (sin modelo) y la puerta de las tres: autenticación como las rutas internas existentes.
 * `sin_material` ≠ `error_de_lectura` en todas. Casos escritos antes del código.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { A, AHORA, B, NO_EXISTE, Z, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import { verificarIndiceNoMiente } from '../../conversacion'
import { construirListaCorta } from '../../lista-corta'
import { armarIndice } from '../indice'
import { entregarContenido } from '../entregar'
import { numerarLista } from '../lista-numerada'

const base = (fallan: string[] = [], tablas = tablasDeLaBase()) => crearBaseFalsa(tablas, fallan)
type Cuerpo = Record<string, any>
const indice = async (cuerpo: unknown, b = base()) => ({ ...(await armarIndice(b.consulta, cuerpo, { ahora: AHORA })), llamadas: b.llamadas })
const entregar = async (cuerpo: unknown, b = base(), opciones: { topeDeEntrega?: number } = {}) => ({ ...(await entregarContenido(b.consulta, cuerpo, { ahora: AHORA, ...opciones })), llamadas: b.llamadas })

describe('indice · lo fijo + la lista + el estado de las lecturas, sin modelo', () => {
  it('trae lo fijo con su texto completo, la lista numerada, su huella y el estado de cada lectura', async () => {
    const r = await indice({ cliente: A })
    const c = r.cuerpo as Cuerpo
    expect(r.status).toBe(200)
    expect(c.estado).toBe('ok')
    expect(c.fijo.map((f: Cuerpo) => f.ref).sort()).toEqual(['client_brand_books:bb-2', 'client_historical_outputs:pz-2#decision', 'hitl_queue:hq-1'].sort())
    for (const f of c.fijo) expect(f.texto.length, f.ref).toBeGreaterThan(0)
    expect(c.lista[0]).toMatchObject({ numero: 1 })
    expect(c.lista_texto.split('\n')).toHaveLength(c.lista.length)
    expect(c.huella).toMatch(/^[0-9a-f]{16,}$/)
    expect(Object.keys(c.lecturas)).toContain('fotos')
    expect(c.lecturas.fotos).toBe('ok')
  })
  it('trae el respaldo ya armado (sin modelo) y el índice no miente', async () => {
    const r = await indice({ cliente: A })
    const c = r.cuerpo as Cuerpo
    expect(c.respaldo.modo).toBe('respaldo')
    expect(c.respaldo.material.length).toBe(c.fijo.length)
    const lista = await construirListaCorta(base().consulta, A, { ahora: AHORA })
    expect(verificarIndiceNoMiente(lista, c.respaldo)).toEqual([])
  })
  it('una lectura que falla queda como error_de_lectura y la lista como parcial: nunca como vacía', async () => {
    const r = await indice({ cliente: A }, base(['client_social_images']))
    const c = r.cuerpo as Cuerpo
    expect(r.status).toBe(200)
    expect(c.estado).toBe('parcial')
    expect(c.lecturas.fotos).toBe('error_de_lectura')
    expect(c.respaldo.errores_de_lectura).toEqual(['fotos'])
    expect(c.lista.some((l: Cuerpo) => String(l.ref).startsWith('client_social_images:'))).toBe(false)
  })
  it('un cliente que no existe lo dice; no devuelve una lista vacía que parezca «sin material»', async () => {
    const c = (await indice({ cliente: NO_EXISTE })).cuerpo as Cuerpo
    expect(c.estado).toBe('cliente_inexistente')
    expect(c.lista).toEqual([])
  })
  it('si fallan todas las lecturas: error_de_lectura', async () => {
    const c = (await indice({ cliente: A }, base(Object.keys(tablasDeLaBase())))).cuerpo as Cuerpo
    expect(c.estado).toBe('error_de_lectura')
  })
  it('ya_trae se aplica y un nombre desconocido se reporta', async () => {
    const c = (await indice({ cliente: A, ya_trae: ['fotos', 'inventada'] })).cuerpo as Cuerpo
    expect(c.lista.some((l: Cuerpo) => ['foto', 'portada_de_video', 'logo'].includes(l.clase))).toBe(false)
    expect(c.ya_trae_desconocido).toEqual(['inventada'])
  })
  it('cada lectura lleva el filtro del cliente', async () => {
    const r = await indice({ cliente: A })
    for (const p of r.llamadas) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id).toBe(A)
  })
  it('entrada inválida → 400', async () => {
    expect((await indice({})).status).toBe(400)
    expect((await indice(null)).status).toBe(400)
    expect((await indice({ cliente: A, ya_trae: 'fotos' })).status).toBe(400)
  })
})

describe('entregar · el contenido completo por referencia o por número, con avisos y cortes declarados', () => {
  it('por referencias: el texto entero, con su tamaño y la etiqueta de cada cosa', async () => {
    const r = await entregar({ cliente: A, refs: ['client_historical_outputs:plan-1', 'client_web_pages:wp-a1'] })
    const c = r.cuerpo as Cuerpo
    expect(r.status).toBe(200)
    expect(c.estado).toBe('ok')
    expect(c.material).toHaveLength(2)
    const plan = c.material[0]
    expect(plan).toMatchObject({ ref: 'client_historical_outputs:plan-1', estado_de_lectura: 'ok', cortado: false, estante: 'E1', clase: 'plan', estado: 'borrador sin aprobar', vencido: false })
    expect(plan.texto.length).toBe(plan.caracteres_totales)
    const sitio = c.material[1]
    expect(sitio.vencido).toBe(true)
    expect(sitio.aviso).toMatch(/^VENCIDO desde /) // lo vencido se entrega, con su aviso
  })
  it('por números, con la huella de la lista que se vio', async () => {
    const lista = numerarLista(await construirListaCorta(base().consulta, A, { ahora: AHORA }))
    const n = lista.lineas.find((l) => l.ficha.ref === 'client_social_images:im-1')!.numero
    const r = await entregar({ cliente: A, numeros: [n], huella: lista.huella })
    expect((r.cuerpo as Cuerpo).material[0].ref).toBe('client_social_images:im-1')
  })
  it('por números con otra huella → 409: la lista cambió y el número ya no significa lo mismo', async () => {
    const r = await entregar({ cliente: A, numeros: [1], huella: 'ffffffffffffffff' })
    expect(r.status).toBe(409)
    expect((r.cuerpo as Cuerpo).error).toBe('la_lista_cambio')
  })
  it('por números sin huella → 400', async () => {
    expect((await entregar({ cliente: A, numeros: [1] })).status).toBe(400)
  })
  it('un número inventado se anota; si TODOS lo son, el estado lo dice', async () => {
    const lista = numerarLista(await construirListaCorta(base().consulta, A, { ahora: AHORA }))
    const mezcla = (await entregar({ cliente: A, numeros: [1, 99999], huella: lista.huella })).cuerpo as Cuerpo
    expect(mezcla.numeros_invalidos).toEqual([99999])
    expect(mezcla.material).toHaveLength(1)
    const todos = (await entregar({ cliente: A, numeros: [99999], huella: lista.huella })).cuerpo as Cuerpo
    expect(todos.estado).toBe('numeros_invalidos')
    expect(todos.material).toEqual([])
  })
  it('los repetidos se quitan', async () => {
    const r = await entregar({ cliente: A, refs: ['client_web_pages:wp-a1', 'client_web_pages:wp-a1'] })
    expect((r.cuerpo as Cuerpo).material).toHaveLength(1)
  })
  it('pedir nada → 400 (no es «sin material»)', async () => {
    expect((await entregar({ cliente: A })).status).toBe(400)
    expect((await entregar({ cliente: A, refs: [] })).status).toBe(400)
  })
  it('el tope de lo entregado: lo que no cabe NO se entrega a medias, pasa a lo_demas con «no_cabe», en el orden pedido', async () => {
    // plan-1 ≈ 570 unidades, part-1 ≈ 860: con tope 600 entra el primero y el segundo no
    const r = await entregar({ cliente: A, refs: ['client_historical_outputs:plan-1', 'client_historical_outputs:part-1'] }, base(), { topeDeEntrega: 600 })
    const c = r.cuerpo as Cuerpo
    expect(c.material.map((m: Cuerpo) => m.ref)).toEqual(['client_historical_outputs:plan-1'])
    expect(c.lo_demas).toEqual([{ ref: 'client_historical_outputs:part-1', motivo: 'no_cabe', peso_estimado: expect.any(Number) }])
    expect(c.total_entregado).toBeLessThanOrEqual(600)
  })
  it('un texto muy grande se declara cortado, con cuánto se entregó de cuánto', async () => {
    const r = await entregar({ cliente: A, refs: ['client_historical_outputs:plan-1'], maximo_caracteres: 100 })
    const m = (r.cuerpo as Cuerpo).material[0]
    expect([m.cortado, m.caracteres_entregados]).toEqual([true, 100])
    expect(m.aviso_de_corte).toMatch(/CORTADO/)
  })
})

describe('sin_material ≠ error_de_lectura en entregar', () => {
  it('una referencia que no existe: sin_material', async () => {
    const m = ((await entregar({ cliente: A, refs: ['client_brand_books:no-existe'] })).cuerpo as Cuerpo).material[0]
    expect(m.estado_de_lectura).toBe('sin_material')
  })
  it('un fallo de lectura: error_de_lectura, y el estado general lo dice', async () => {
    const c = (await entregar({ cliente: A, refs: ['client_web_pages:wp-a1'] }, base(['client_web_pages']))).cuerpo as Cuerpo
    expect(c.material[0].estado_de_lectura).toBe('error_de_lectura')
    expect(c.estado).toBe('error_de_lectura')
  })
  it('una referencia que la PROPIA lista emitió y no se puede leer es error, no «sin material» (observación de CC#3)', async () => {
    const tablas = tablasDeLaBase()
    const b = base([], tablas)
    // la lista se arma bien, pero la lectura del contenido de un perfil devuelve vacío (como si el lector no la conociera)
    const original = b.consulta
    const consulta: typeof original = async (p) => (p.tabla === 'client_icp_documents' && p.columnas?.includes('content_text') && !p.columnas.includes('audience_segment') ? { filas: [], error: null } : original(p))
    const r = await entregarContenido(consulta, { cliente: A, refs: ['client_icp_documents:icp-1'] }, { ahora: AHORA })
    const m = (r.cuerpo as Cuerpo).material[0]
    expect(m.estado_de_lectura).toBe('error_de_lectura')
    expect(m.detalle).toMatch(/emitida por la lista/)
  })
  it('una referencia que NO está en la lista y no existe sigue siendo sin_material', async () => {
    const m = ((await entregar({ cliente: A, refs: ['tabla_inventada:1'] })).cuerpo as Cuerpo).material[0]
    expect(m.estado_de_lectura).toBe('sin_material')
  })
  it('la fila de otro cliente no se entrega, y toda lectura lleva el filtro del cliente', async () => {
    const r = await entregar({ cliente: A, refs: ['client_brand_books:bb-z1', `clients:${B}`, 'client_web_pages:wp-z1'] })
    const c = r.cuerpo as Cuerpo
    for (const m of c.material) expect(m.estado_de_lectura, m.ref).toBe('sin_material')
    for (const p of r.llamadas) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id).toBe(A)
    void Z
  })
})

describe('las tres rutas: autenticación igual a las rutas internas existentes', () => {
  const llave = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { if (llave === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = llave })
  const pedir = (cuerpo: unknown, llaveEnviada?: string) => new Request('http://localhost/api/brain/portero/x', { method: 'POST', headers: { 'content-type': 'application/json', ...(llaveEnviada ? { 'x-api-key': llaveEnviada } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  const rutas = async () => ({
    indice: (await import('../../../../app/api/brain/portero/indice/route')).POST,
    entregar: (await import('../../../../app/api/brain/portero/entregar/route')).POST,
    razonar: (await import('../../../../app/api/brain/portero/razonar/route')).POST,
  })
  it.each(['indice', 'entregar', 'razonar'] as const)('%s: sin llave → 401, llave mala → 401', async (nombre) => {
    const POST = (await rutas())[nombre]
    expect((await POST(pedir({ cliente: A }))).status).toBe(401)
    expect((await POST(pedir({ cliente: A }, 'otra'))).status).toBe(401)
  })
  it.each(['indice', 'entregar', 'razonar'] as const)('%s: JSON roto con llave buena → 400, sin tocar la red', async (nombre) => {
    const POST = (await rutas())[nombre]
    const r = await POST(pedir('{no es json', 'llave-de-prueba'))
    expect(r.status).toBe(400)
  })
  it('razonar: sin workflow_id con llave buena → 403, antes de leer nada ni llamar al modelo', async () => {
    const POST = (await rutas()).razonar
    const r = await POST(pedir({ cliente: A, necesito: 'algo', ronda: 1 }, 'llave-de-prueba'))
    expect(r.status).toBe(403)
  })
  it('sin la llave del servidor configurada, todas rechazan', async () => {
    delete process.env.INTERNAL_API_KEY
    const r = await (await rutas()).indice(pedir({ cliente: A }, 'cualquiera'))
    expect(r.status).toBe(401)
  })
})
