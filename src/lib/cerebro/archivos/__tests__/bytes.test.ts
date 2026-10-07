/**
 * «Recibir bytes»: el archivo llega en base64 y NUNCA se descarga por una dirección. Casos escritos ANTES del código (paso 5 del cerebro).
 */
import { describe, expect, it, vi } from 'vitest'
import { recibirBytes } from '../bytes'
import { TOPES } from '../topes'
import { b64, crearDocx, crearPdf, crearXlsx, crearZip, JPEG_MINIMO, parrafoXml, PNG_1X1, textoPagina } from './muestras'

const ok = (r: ReturnType<typeof recibirBytes>) => { if (!r.ok) throw new Error('esperaba ok: ' + r.motivo + ' ' + r.detalle); return r }

describe('recibe y reconoce cada tipo por su firma (no por lo que diga el nombre)', () => {
  it('PDF', () => {
    const r = ok(recibirBytes({ nombre: 'garantia.pdf', base64: b64(crearPdf([textoPagina('hola')])) }))
    expect(r.tipo).toBe('pdf'); expect(r.mime).toBe('application/pdf'); expect(r.huella).toMatch(/^[0-9a-f]{64}$/)
  })
  it('Word (.docx) y hoja (.xlsx) se distinguen mirando el interior del ZIP', () => {
    expect(ok(recibirBytes({ nombre: 'a.bin', base64: b64(crearDocx(parrafoXml('x'))) })).tipo).toBe('word')
    expect(ok(recibirBytes({ nombre: 'a.bin', base64: b64(crearXlsx([{ nombre: 'H', filas: [['a']] }])) })).tipo).toBe('hoja')
  })
  it('imágenes PNG y JPEG', () => {
    expect(ok(recibirBytes({ nombre: 'f.png', base64: b64(PNG_1X1) })).tipo).toBe('imagen')
    expect(ok(recibirBytes({ nombre: 'f.jpg', base64: b64(JPEG_MINIMO) })).mime).toBe('image/jpeg')
  })
  it('CSV y texto plano', () => {
    expect(ok(recibirBytes({ nombre: 'tarifas.csv', base64: b64('a,b\n1,2\n') })).tipo).toBe('csv')
    expect(ok(recibirBytes({ nombre: 'nota.txt', base64: b64('una nota con acentos: canción') })).tipo).toBe('texto')
  })
  it('la huella es la del contenido: el mismo archivo da la misma huella con otro nombre', () => {
    const a = ok(recibirBytes({ nombre: 'uno.csv', base64: b64('x,y\n1,2') }))
    const b = ok(recibirBytes({ nombre: 'otro.csv', base64: b64('x,y\n1,2') }))
    expect(a.huella).toBe(b.huella)
  })
})

describe('rechaza con su motivo (nunca adivina)', () => {
  it('base64 inválido: caracteres que no son base64, relleno raro, texto suelto', () => {
    for (const malo of ['@@@@', 'abc$def', 'abcde', 'a b c', '===', 'JVBERi0=====']) {
      const r = recibirBytes({ nombre: 'x.pdf', base64: malo })
      expect(r.ok, malo).toBe(false)
      if (!r.ok) expect(['base64_invalido', 'vacio']).toContain(r.motivo)
    }
    expect(recibirBytes({ nombre: 'x', base64: 123 }).ok).toBe(false)
    expect(recibirBytes(null).ok).toBe(false)
    expect(recibirBytes({ nombre: 'x' }).ok).toBe(false)
  })
  it('vacío', () => {
    const r = recibirBytes({ nombre: 'x.pdf', base64: '' })
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toBe('vacio')
  })
  it('un ejecutable o un ZIP que no es Word ni hoja: tipo no admitido', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)])
    const r1 = recibirBytes({ nombre: 'x.pdf', base64: b64(exe) }); expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.motivo).toBe('tipo_no_admitido')
    const zip = crearZip([{ nombre: 'cualquier.txt', datos: 'hola' }])
    const r2 = recibirBytes({ nombre: 'x.zip', base64: b64(zip) }); expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.motivo).toBe('tipo_no_admitido')
  })
  it('el tipo declarado no coincide con la firma', () => {
    const r = recibirBytes({ nombre: 'foto.png', tipo: 'image/png', base64: b64(crearPdf([textoPagina('x')])) })
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toBe('tipo_no_coincide')
  })
})

describe('los topes (imagen ≤ 5 MB · PDF ≤ 10 MB · hoja ≤ 5 MB) se aplican ANTES de gastar memoria', () => {
  it('una imagen de 5 MB + 1 byte se rechaza; la de 5 MB justos pasa', () => {
    const relleno = (n: number) => Buffer.concat([PNG_1X1.subarray(0, 8), Buffer.alloc(n - 8, 7)])
    const pasa = recibirBytes({ nombre: 'g.png', base64: b64(relleno(TOPES.imagen_bytes)) })
    expect(pasa.ok).toBe(true)
    const no = recibirBytes({ nombre: 'g.png', base64: b64(relleno(TOPES.imagen_bytes + 1)) })
    expect(no.ok).toBe(false); if (!no.ok) expect(no.motivo).toBe('sobre_el_tope')
  })
  it('un PDF de 10 MB + 1 byte y un CSV de 5 MB + 1 byte se rechazan', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(TOPES.pdf_bytes + 1, 32)])
    const r1 = recibirBytes({ nombre: 'g.pdf', base64: b64(pdf) }); expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.motivo).toBe('sobre_el_tope')
    const csv = Buffer.from('a,b\n' + '1,2\n'.repeat(Math.ceil((TOPES.hoja_bytes + 8) / 4)))
    const r2 = recibirBytes({ nombre: 'g.csv', base64: b64(csv) }); expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.motivo).toBe('sobre_el_tope')
  })
  it('un texto base64 de decenas de MB se rechaza sin decodificarlo (rápido)', () => {
    const enorme = 'A'.repeat(60 * 1024 * 1024)
    const t0 = Date.now()
    const r = recibirBytes({ nombre: 'x.pdf', base64: enorme })
    expect(Date.now() - t0).toBeLessThan(500)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toBe('sobre_el_tope')
  })
})

describe('NUNCA descarga por una dirección', () => {
  it('una dirección donde va el base64 es base64 inválido y no se pide nada', () => {
    const espia = vi.spyOn(globalThis, 'fetch')
    const r = recibirBytes({ nombre: 'x.pdf', base64: 'https://ejemplo.com/archivo.pdf' })
    expect(r.ok).toBe(false)
    expect(espia).not.toHaveBeenCalled()
    espia.mockRestore()
  })
  it('los campos url/enlace de la entrada se ignoran', () => {
    const espia = vi.spyOn(globalThis, 'fetch')
    const r = recibirBytes({ nombre: 'x.csv', base64: b64('a,b\n1,2'), url: 'https://ejemplo.com/otro', enlace: 'http://127.0.0.1/secreto' })
    expect(r.ok).toBe(true)
    expect(espia).not.toHaveBeenCalled()
    espia.mockRestore()
  })
})

describe('el nombre es solo una etiqueta', () => {
  it('se limpia de rutas y caracteres de control y se corta', () => {
    const r = ok(recibirBytes({ nombre: '../../etc/pa\u0000sswd\n.csv' + 'x'.repeat(400), base64: b64('a,b') }))
    expect(r.nombre).not.toMatch(/[\\/\u0000-\u001f]/)
    expect(r.nombre.length).toBeLessThanOrEqual(200)
  })
})
