/**
 * H6 · «dame el contenido completo de la línea R»: UN lector genérico para todas las fuentes, sin regla por tipo de output.
 * Casos escritos antes del código.
 */
import { describe, expect, it } from 'vitest'
import { MAXIMO_DE_CARACTERES_POR_DEFECTO, leerContenido, leerContenidos } from '../contenido'
import { construirListaCorta } from '../lista-corta'
import { A, AHORA, B, C, Z, crearBaseFalsa, tablasDeLaBase } from './casos'

const tablas = tablasDeLaBase()
const fila = (tabla: string, id: string): Record<string, unknown> => (tablas[tabla] as Array<Record<string, unknown>>).find((f) => f.id === id) as Record<string, unknown>
const nueva = (fallan: string[] = []) => crearBaseFalsa(tablasDeLaBase(), fallan)

describe('el contenido completo de fuentes DISTINTAS con el mismo lector', () => {
  it.each([
    ['client_brand_books:bb-2', 'client_brand_books', 'bb-2', 'content_text'],
    ['client_icp_documents:icp-1', 'client_icp_documents', 'icp-1', 'content_text'],
    ['client_competitive_landscape:comp-1', 'client_competitive_landscape', 'comp-1', 'content_text'],
    ['client_web_pages:wp-a1', 'client_web_pages', 'wp-a1', 'content_text'],
    ['client_historical_outputs:plan-1', 'client_historical_outputs', 'plan-1', 'content_text'],
    ['client_historical_outputs:part-1', 'client_historical_outputs', 'part-1', 'content_text'],
    ['client_historical_outputs:pz-2', 'client_historical_outputs', 'pz-2', 'content_text'],
    ['client_brain_chunks:ch-2', 'client_brain_chunks', 'ch-2', 'chunk_text'],
  ])('%s trae el texto ENTERO, con su tamaño declarado', async (ref, tabla, id, columna) => {
    const esperado = String(fila(tabla, id)[columna])
    const r = await leerContenido(nueva().consulta, A, ref)
    expect(r).toMatchObject({ ref, estado: 'ok', texto: esperado, caracteres_totales: esperado.length, caracteres_entregados: esperado.length, cortado: false })
    expect(r.peso_estimado).toBeGreaterThan(0)
  })

  it('una foto trae el texto de su publicación, su producto, su fecha y su enlace', async () => {
    const r = await leerContenido(nueva().consulta, A, 'client_social_images:im-1')
    expect(r.estado).toBe('ok')
    expect(r.texto).toMatch(/texto de la publicación/)
    expect(r.texto).toMatch(/Servicio uno/)
    expect(r.texto).toMatch(/https:\/\/red\/p1/)
  })

  it('un dato de sede y una decisión de la cola traen su contenido', async () => {
    expect((await leerContenido(nueva().consulta, A, 'client_sede_datos:dat-2')).texto).toMatch(/lunes a viernes 9–17/)
    expect((await leerContenido(nueva().consulta, A, 'hitl_queue:hq-1')).texto).toMatch(/más corto/)
  })
})

describe('las líneas que salen de DENTRO de una fila', () => {
  it('un producto del sitio: el dato estructurado completo', async () => {
    const r = await leerContenido(nueva().consulta, A, 'client_web_pages:wp-a1#producto:1')
    expect(r.estado).toBe('ok')
    expect(r.texto).toMatch(/Servicio uno/)
    expect(r.texto).toMatch(/40/)
    expect(r.texto).toMatch(/Descripción del servicio uno/)
  })
  it('una familia del catálogo: todos sus productos', async () => {
    const r = await leerContenido(nueva().consulta, B, 'client_web_pages:wp-b1#familia:Familia uno')
    expect(r.estado).toBe('ok')
    expect(r.texto?.split('\n').filter((l) => l.startsWith('- ')).length).toBe(30)
  })
  it('la decisión de un trabajo: el veredicto y los cambios del aprobador', async () => {
    const r = await leerContenido(nueva().consulta, A, 'client_historical_outputs:pz-2#decision')
    expect(r.texto).toMatch(/aprobada/)
    expect(r.texto).toMatch(/cambié el segundo párrafo/)
  })
  it('un dato que dedujo el descubrimiento', async () => {
    const r = await leerContenido(nueva().consulta, A, `clients:${A}#config:business_model`)
    expect(r.estado).toBe('ok')
    expect(r.texto).toMatch(/modelo deducido/)
  })
  it('un producto que no existe: sin_material, no error', async () => {
    expect((await leerContenido(nueva().consulta, A, 'client_web_pages:wp-a1#producto:99')).estado).toBe('sin_material')
  })
})

describe('sin_material NO es error_de_lectura', () => {
  it('una referencia que no existe es sin_material', async () => {
    const r = await leerContenido(nueva().consulta, A, 'client_brand_books:no-existe')
    expect(r).toMatchObject({ estado: 'sin_material', texto: null, caracteres_totales: 0, cortado: false })
  })
  it('una referencia de una tabla desconocida es sin_material con su motivo', async () => {
    expect(await leerContenido(nueva().consulta, A, 'tabla_inventada:1')).toMatchObject({ estado: 'sin_material', detalle: 'referencia_desconocida' })
    expect(await leerContenido(nueva().consulta, A, 'sin dos puntos')).toMatchObject({ estado: 'sin_material', detalle: 'referencia_desconocida' })
  })
  it('un fallo de lectura es error_de_lectura (jamás se lee como vacío)', async () => {
    const r = await leerContenido(nueva(['client_web_pages']).consulta, A, 'client_web_pages:wp-a1')
    expect(r.estado).toBe('error_de_lectura')
    expect(r.detalle).toMatch(/fallo simulado/)
    expect(r.texto).toBeNull()
  })
})

describe('aislamiento', () => {
  it('la fila de OTRO cliente no se lee: sin_material y la lectura lleva el filtro del cliente', async () => {
    const base = nueva()
    const r = await leerContenido(base.consulta, A, 'client_brand_books:bb-z1')
    expect(r.estado).toBe('sin_material')
    expect(r.texto).toBeNull()
    expect(base.llamadas.length).toBeGreaterThan(0)
    for (const p of base.llamadas) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id).toBe(A)
  })
  it('la ficha de otro cliente tampoco', async () => {
    expect((await leerContenido(nueva().consulta, A, `clients:${B}`)).estado).toBe('sin_material')
  })
})

describe('el tamaño: si es muy grande se declara el corte, no se oculta', () => {
  it('el tope por defecto está declarado', () => {
    expect(MAXIMO_DE_CARACTERES_POR_DEFECTO).toBeGreaterThanOrEqual(20_000)
  })
  it('corta en el tope, lo dice y deja pedir el resto con `desde`', async () => {
    const entero = String(fila('client_historical_outputs', 'plan-1').content_text)
    const primero = await leerContenido(nueva().consulta, A, 'client_historical_outputs:plan-1', { maximoCaracteres: 100 })
    expect(primero).toMatchObject({ estado: 'ok', cortado: true, caracteres_totales: entero.length, caracteres_entregados: 100 })
    expect(primero.texto).toBe(entero.slice(0, 100))
    expect(primero.aviso_de_corte).toMatch(/CORTADO/)
    expect(primero.aviso_de_corte).toMatch(/100 de /)
    const resto = await leerContenido(nueva().consulta, A, 'client_historical_outputs:plan-1', { maximoCaracteres: 100, desde: 100 })
    expect(resto.texto).toBe(entero.slice(100, 200))
    const ultimo = await leerContenido(nueva().consulta, A, 'client_historical_outputs:plan-1', { maximoCaracteres: 100, desde: entero.length - 40 })
    expect([ultimo.cortado, ultimo.caracteres_entregados]).toEqual([false, 40])
  })
})

describe('varias referencias a la vez', () => {
  it('devuelve cada una en su orden y un fallo no esconde a las demás', async () => {
    const r = await leerContenidos(nueva().consulta, A, ['client_brand_books:bb-2', 'client_brand_books:no-existe', 'tabla_inventada:1', 'client_icp_documents:icp-1'])
    expect(r.map((x) => [x.ref, x.estado])).toEqual([
      ['client_brand_books:bb-2', 'ok'], ['client_brand_books:no-existe', 'sin_material'], ['tabla_inventada:1', 'sin_material'], ['client_icp_documents:icp-1', 'ok'],
    ])
  })
  it('un error de lectura en una fuente no tapa lo que sí se pudo leer', async () => {
    const r = await leerContenidos(nueva(['client_icp_documents']).consulta, A, ['client_brand_books:bb-2', 'client_icp_documents:icp-1'])
    expect(r.map((x) => x.estado)).toEqual(['ok', 'error_de_lectura'])
  })
})

describe('TODA referencia que la lista emite es legible por el lector (CC#3: una fuente nueva sin su entrada en la tabla rompería esto)', () => {
  it.each([[A, 'A'], [B, 'B'], [C, 'C'], [Z, 'Z']])('cliente %s: cada línea de su lista se lee con estado ok', async (cliente, nombre) => {
    const base = crearBaseFalsa(tablasDeLaBase())
    const lista = await construirListaCorta(base.consulta, cliente, { ahora: AHORA })
    expect(lista.lineas.length, nombre).toBeGreaterThan(0)
    const lecturas = await leerContenidos(crearBaseFalsa(tablasDeLaBase()).consulta, cliente, lista.lineas.map((l) => l.ref))
    const malas = lecturas.filter((l) => l.estado !== 'ok').map((l) => l.ref + ' → ' + l.estado + ' ' + (l.detalle ?? ''))
    expect(malas, 'referencias emitidas por la lista que no se pueden leer: ' + malas.join(' | ')).toEqual([])
  })
})
