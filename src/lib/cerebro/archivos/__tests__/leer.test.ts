/**
 * El despachador `leerArchivo`: recibe los bytes en base64, los reconoce y llama al lector que toca. Casos escritos ANTES del código.
 */
import { describe, expect, it, vi } from 'vitest'
import { leerArchivo } from '../leer'
import { b64, crearDocx, crearPdf, crearXlsx, JPEG_MINIMO, parrafoXml, PNG_1X1, textoPagina } from './muestras'

describe('de punta a punta por tipo', () => {
  it('PDF → texto', async () => {
    const r = await leerArchivo({ nombre: 'g.pdf', base64: b64(crearPdf([textoPagina('Garantía de seis meses')])) })
    expect(r.estado).toBe('ok'); expect(r.tipo).toBe('pdf'); expect(r.texto).toBe('Garantía de seis meses')
  })
  it('Word → texto', async () => {
    const r = await leerArchivo({ nombre: 'c.docx', base64: b64(crearDocx(parrafoXml('Cláusula uno'))) })
    expect(r.tipo).toBe('word'); expect(r.texto).toBe('Cláusula uno')
  })
  it('hoja XLSX y CSV → filas como texto', async () => {
    const x = await leerArchivo({ nombre: 't.xlsx', base64: b64(crearXlsx([{ nombre: 'H', filas: [['a', 'b'], ['1', '2']] }])) })
    expect(x.tipo).toBe('hoja'); expect(x.texto).toContain('a: 1 | b: 2')
    const c = await leerArchivo({ nombre: 't.csv', base64: b64('a,b\n1,2') })
    expect(c.tipo).toBe('csv'); expect(c.texto).toContain('a: 1 | b: 2')
  })
  it('texto plano → tal cual', async () => {
    const r = await leerArchivo({ nombre: 'n.txt', base64: b64('una nota\n\notra nota') })
    expect(r.tipo).toBe('texto'); expect(r.texto).toBe('una nota\n\notra nota')
  })
  it('imagen → NO se lee aquí: queda lista para que otra ruta la mire (tipo, mime, huella y tamaño; sin texto)', async () => {
    const r = await leerArchivo({ nombre: 'f.png', base64: b64(PNG_1X1) })
    expect(r.estado).toBe('ok'); expect(r.tipo).toBe('imagen'); expect(r.mime).toBe('image/png'); expect(r.texto).toBe(''); expect(r.bytes).toBe(PNG_1X1.length)
    expect((await leerArchivo({ nombre: 'f.jpg', base64: b64(JPEG_MINIMO) })).mime).toBe('image/jpeg')
  })
})

describe('lo que se rechaza llega con su estado y su motivo', () => {
  it('base64 inválido, vacío, tipo no admitido y sobre el tope', async () => {
    expect((await leerArchivo({ nombre: 'x', base64: '@@' })).estado).toBe('ilegible')
    expect((await leerArchivo({ nombre: 'x', base64: '' })).estado).toBe('vacio')
    expect((await leerArchivo({ nombre: 'x', base64: b64(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(99)])) })).estado).toBe('tipo_no_admitido')
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 32)])
    expect((await leerArchivo({ nombre: 'x.pdf', base64: b64(grande) })).estado).toBe('sobre_el_tope')
  })
  it('cada rechazo trae un `motivo` legible', async () => {
    const r = await leerArchivo({ nombre: 'x', base64: '@@' })
    expect(r.motivo).toBeTruthy(); expect(r.avisos).toEqual(expect.any(Array))
  })
})

describe('el resultado es seguro de guardar y de mostrar', () => {
  it('se puede serializar a JSON y no trae los bytes ni el base64 de vuelta', async () => {
    const entrada = b64(crearPdf([textoPagina('hola')]))
    const r = await leerArchivo({ nombre: 'g.pdf', base64: entrada })
    const json = JSON.stringify(r)
    expect(json.includes(entrada)).toBe(false)
    expect(JSON.parse(json).texto).toBe('hola')
  })
  it('no hace ninguna petición de red', async () => {
    const espia = vi.spyOn(globalThis, 'fetch')
    await leerArchivo({ nombre: 'g.pdf', base64: b64(crearPdf([textoPagina('hola')])), url: 'https://ejemplo.com/x' })
    await leerArchivo({ nombre: 'c.docx', base64: b64(crearDocx(parrafoXml('hola'))) })
    expect(espia).not.toHaveBeenCalled()
    espia.mockRestore()
  })
})
