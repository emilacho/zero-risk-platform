/**
 * PASO 4 · lo que la lista muestra de una foto etiquetada: `producto_visto` cuando `producto` está vacío y «qué muestra»; y la ruta `etiquetar` (puerta).
 * Pruebas escritas ANTES del código.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leerContenido } from '../contenido'
import { construirListaCorta } from '../lista-corta'
import { lineaParaElModelo, numerarLista } from '../portero/lista-numerada'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase, type Tablas } from './casos'

const conEtiqueta = (id: string, extra: Record<string, unknown>): Tablas => {
  const t = tablasDeLaBase()
  t.client_social_images = (t.client_social_images as Array<Record<string, unknown>>).map((f) => (f.id === id ? { ...f, ...extra } : f))
  return t
}
const lista = async (t: Tablas, cliente = A) => construirListaCorta(crearBaseFalsa(t).consulta, cliente, { ahora: AHORA })
const de = (l: Awaited<ReturnType<typeof lista>>, id: string) => l.lineas.find((f) => f.ref === `client_social_images:${id}`)!

describe('la lista muestra lo que el etiquetador vio', () => {
  it('con `producto` VACÍO y `producto_visto` lleno: la línea lleva el producto visto, dice que salió de la foto y qué muestra', async () => {
    const l = await lista(conEtiqueta('im-6', { que_muestra: 'un plato de pescado sobre una mesa', producto_visto: ['Servicio dos'], etiquetada_en: '2026-10-07T00:00:00.000Z' }))
    const f = de(l, 'im-6')
    expect(f.producto).toEqual(['Servicio dos'])
    expect(f.producto_fuente).toBe('vision')
    expect(f.que_es).toMatch(/qué muestra \(según el etiquetador\): un plato de pescado sobre una mesa/)
    expect(f.titulo).toMatch(/Servicio dos/)
    expect(f.que_es).toMatch(/producto: Servicio dos/)
  })
  it('con `producto` YA lleno (lo dijo el texto o el dueño) NO se pisa: sigue siendo el de siempre; solo se suma «qué muestra»', async () => {
    const l = await lista(conEtiqueta('im-1', { que_muestra: 'un plato', producto_visto: ['Servicio dos'] }))
    const f = de(l, 'im-1')
    expect(f.producto).toEqual(['Servicio uno'])
    expect(f.producto_fuente).toBe('caption')
    expect(f.que_es).toMatch(/qué muestra \(según el etiquetador\): un plato/)
  })
  it('una foto SIN etiqueta sale EXACTAMENTE como antes (la línea no cambia)', async () => {
    const sin = await lista(tablasDeLaBase())
    const con = await lista(conEtiqueta('im-6', { que_muestra: null, producto_visto: null, etiquetada_en: null, etiqueta_modelo: null }))
    expect(JSON.stringify(con.lineas)).toBe(JSON.stringify(sin.lineas))
    expect(de(sin, 'im-6').producto_fuente).toBe('desconocido')
  })
  it('un `producto_visto` vacío (no se vio ninguno) NO cuenta como producto', async () => {
    const l = await lista(conEtiqueta('im-6', { que_muestra: 'una imagen borrosa', producto_visto: [], etiquetada_en: '2026-10-07T00:00:00.000Z' }))
    expect(de(l, 'im-6').producto).toEqual([])
    expect(de(l, 'im-6').producto_fuente).toBe('desconocido')
  })
  it('la línea que ve el modelo del portero trae el producto visto y qué muestra; la lista numerada no pierde ni duplica fotos', async () => {
    const l = await lista(conEtiqueta('im-6', { que_muestra: 'un plato de pescado', producto_visto: ['Servicio dos'] }))
    const n = numerarLista(l)
    const linea = n.lineas.find((x) => x.ficha.ref === 'client_social_images:im-6')!
    expect(lineaParaElModelo(linea.numero, linea.ficha)).toMatch(/producto: Servicio dos/)
    expect(lineaParaElModelo(linea.numero, linea.ficha)).toMatch(/un plato de pescado/)
    const fotos = n.lineas.filter((x) => x.ficha.ref.startsWith('client_social_images:'))
    expect(new Set(fotos.map((x) => x.ficha.ref)).size).toBe(fotos.length)
  })
  it('el contenido completo de la foto trae «qué muestra» y el producto visto cuando existen', async () => {
    const t = conEtiqueta('im-6', { que_muestra: 'un plato de pescado', producto_visto: ['Servicio dos'], etiquetada_en: '2026-10-07T00:00:00.000Z', etiqueta_modelo: 'claude-sonnet-5-5' })
    const c = await leerContenido(crearBaseFalsa(t).consulta, A, 'client_social_images:im-6')
    expect(c.texto).toMatch(/Qué muestra \(etiquetador\): un plato de pescado/)
    expect(c.texto).toMatch(/Producto visto: Servicio dos/)
    const sin = await leerContenido(crearBaseFalsa(tablasDeLaBase()).consulta, A, 'client_social_images:im-6')
    expect(sin.texto).not.toMatch(/Qué muestra/)
  })
  it('toda foto etiquetada sigue siendo legible por su referencia', async () => {
    const t = conEtiqueta('im-6', { que_muestra: 'x', producto_visto: ['Servicio dos'] })
    const l = await lista(t)
    for (const f of l.lineas.filter((x) => x.ref.startsWith('client_social_images:'))) expect((await leerContenido(crearBaseFalsa(t).consulta, A, f.ref)).estado, f.ref).toBe('ok')
  })
})

describe('la ruta `etiquetar`: misma puerta que las del portero', () => {
  const llave = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { vi.unstubAllGlobals(); if (llave === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = llave })
  const ruta = async () => (await import('../../../app/api/brain/portero/etiquetar/route')).POST
  const pedir = (cuerpo: unknown, k?: string): Request => new Request('https://x.example/api/brain/portero/etiquetar', { method: 'POST', headers: { 'content-type': 'application/json', ...(k ? { 'x-api-key': k } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  it('exporta POST con llave interna; sin llave o con llave mala → 401 y NADA sale a la red', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const POST = await ruta()
    expect((await POST(pedir({ cliente: A, foto: 'x' }))).status).toBe(401)
    expect((await POST(pedir({ cliente: A, foto: 'x' }, 'otra'))).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })
  it('sin la variable del servidor → 401; JSON roto → 400; con llave pero sin flujo → 403 sin salir a la red', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const POST = await ruta()
    expect((await POST(pedir('{no es json', 'llave-de-prueba'))).status).toBe(400)
    expect((await POST(pedir({ cliente: A, foto: 'x' }, 'llave-de-prueba'))).status).toBe(403)
    expect(f).not.toHaveBeenCalled()
    delete process.env.INTERNAL_API_KEY
    expect((await POST(pedir({}, 'x'))).status).toBe(401)
  })
})
