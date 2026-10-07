/**
 * LAS DEFENSAS DEL ZIP, DEL XML Y DE CADA LECTOR, una por una (hallazgo F2 de CC#3 sobre el PR #430: de 33 roturas a propósito, 14 no las detectaba ninguna prueba).
 * Cada caso mata UNA rotura concreta (M08 a M32 de CC#3). `node:zlib` se envuelve solo para registrar con qué máximo de salida se infla cada entrada.
 */
import zlib from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'

const registro = vi.hoisted(() => ({ llamadas: [] as Array<{ max: number | undefined; salio: number; fallo: string | null }> }))
vi.mock('node:zlib', async (importar) => {
  const real = await importar<typeof import('node:zlib')>()
  const inflateRawSync = (b: Buffer, o?: { maxOutputLength?: number }) => {
    try { const r = real.inflateRawSync(b, o); registro.llamadas.push({ max: o?.maxOutputLength, salio: r.length, fallo: null }); return r } catch (e) { registro.llamadas.push({ max: o?.maxOutputLength, salio: 0, fallo: (e as { code?: string }).code ?? String(e) }); throw e }
  }
  return { ...real, inflateRawSync, default: { ...real, inflateRawSync } }
})

import { leerHoja } from '../hoja'
import { leerPdf } from '../pdf'
import { TOPES } from '../topes'
import { leerWord } from '../word'
import { decodificar } from '../xml'
import { abrirZip, leerEntrada } from '../zip'
import { crearDocx, crearPdf, crearXlsx, crearZip, parrafoXml, textoPagina } from './muestras'

const MB = 1024 * 1024
const grande = (mb: number) => Buffer.alloc(mb * MB, 0)

describe('ZIP · cada tope por separado (M09, M10)', () => {
  it('UNA entrada que se inflaría a más del tope por entrada (25 MB) se rechaza aunque el total quepa', () => {
    const z = abrirZip(crearZip([{ nombre: 'word/document.xml', datos: grande(25) }]))
    expect(z).toMatchObject({ ok: false, estado: 'sobre_el_tope' })
    expect(!z.ok && z.motivo).toMatch(/entrada/)
  })
  it('4 entradas de 19 MB (cada una cabe, juntas pasan el total de 60 MB) se rechazan por el total', () => {
    const z = abrirZip(crearZip(Array.from({ length: 4 }, (_, i) => ({ nombre: `x/${i}.bin`, datos: grande(19) }))))
    expect(z).toMatchObject({ ok: false, estado: 'sobre_el_tope' })
    expect(!z.ok && z.motivo).toMatch(/descomprimido/)
  })
  it('3 entradas de 19 MB (57 MB: dentro de los dos topes) SÍ se abren', () => {
    expect(abrirZip(crearZip(Array.from({ length: 3 }, (_, i) => ({ nombre: `x/${i}.bin`, datos: grande(19) })))).ok).toBe(true)
  })
})

describe('ZIP · el tamaño declarado no se cree, en ningún sentido y con ningún método (M08, M11, M28, M30)', () => {
  it('declara 10 y trae 50 MB: se infla CON máximo de salida 10 (no se infla entero) y se rechaza', () => {
    registro.llamadas.length = 0
    const z = abrirZip(crearZip([{ nombre: 'word/document.xml', datos: grande(50), declarar_tamano: 10 }]))
    expect(z.ok).toBe(true)
    const e = z.ok ? leerEntrada(z, 'word/document.xml') : null
    expect(e).toMatchObject({ ok: false, estado: 'ilegible' })
    expect(registro.llamadas).toHaveLength(1)
    expect(registro.llamadas[0].max).toBe(10)
    expect(registro.llamadas[0].salio).toBe(0) // no llegó a producir 50 MB
    expect(registro.llamadas[0].fallo).toBe('ERR_BUFFER_TOO_LARGE')
  })
  it('declara 5.000 y trae 100 (mentira «más corta»): ilegible', () => {
    const z = abrirZip(crearZip([{ nombre: 'word/document.xml', datos: Buffer.alloc(100, 97), declarar_tamano: 5000 }]))
    const e = z.ok ? leerEntrada(z, 'word/document.xml') : null
    expect(e).toMatchObject({ ok: false, estado: 'ilegible' })
    expect(leerWord(crearZip([{ nombre: 'word/document.xml', datos: '<w:document/>', declarar_tamano: 5000 }]), 'm.docx').estado).toBe('ilegible')
  })
  it('guardado SIN compresión: declara 5 y trae 100, o declara 500 y trae 100 → ilegible; si mide lo que dice, se lee', () => {
    for (const declarado of [5, 500]) {
      const z = abrirZip(crearZip([{ nombre: 'a.xml', datos: Buffer.alloc(100, 97), metodo: 'store', declarar_tamano: declarado }]))
      expect(z.ok && leerEntrada(z, 'a.xml'), `declara ${declarado}`).toMatchObject({ ok: false, estado: 'ilegible' })
    }
    const bien = abrirZip(crearZip([{ nombre: 'a.xml', datos: Buffer.alloc(100, 97), metodo: 'store' }]))
    expect(bien.ok && leerEntrada(bien, 'a.xml')).toMatchObject({ ok: true })
  })
  it('una entrada legítima se infla con su máximo de salida puesto (el declarado)', () => {
    registro.llamadas.length = 0
    const z = abrirZip(crearZip([{ nombre: 'a.xml', datos: '<a>hola</a>' }]))
    expect(z.ok && leerEntrada(z, 'a.xml')).toMatchObject({ ok: true })
    expect(registro.llamadas[0].max).toBe('<a>hola</a>'.length)
  })
})

describe('cada lector tiene SU propio tope de tamaño, también cuando se le llama directo (M17, M24)', () => {
  it('Word de 10 MB + 1 byte → sobre_el_tope (no ilegible)', () => {
    expect(leerWord(Buffer.alloc(TOPES.word_bytes + 1, 1), 'g.docx').estado).toBe('sobre_el_tope')
    expect(leerWord(Buffer.alloc(TOPES.word_bytes, 1), 'g.docx').estado).toBe('ilegible') // justo en el tope: se intenta y no es un ZIP
  })
  it('PDF de 10 MB + 1 byte → sobre_el_tope', async () => {
    expect((await leerPdf(Buffer.alloc(TOPES.pdf_bytes + 1, 1), 'g.pdf')).estado).toBe('sobre_el_tope')
  })
  it('hoja (CSV y XLSX) de 5 MB + 1 byte → sobre_el_tope', () => {
    expect(leerHoja(Buffer.alloc(TOPES.hoja_bytes + 1, 97), 'g.csv', 'csv').estado).toBe('sobre_el_tope')
    expect(leerHoja(Buffer.alloc(TOPES.hoja_bytes + 1, 1), 'g.xlsx', 'xlsx').estado).toBe('sobre_el_tope')
  })
})

describe('XML · referencias y entidades hostiles (M19, M32)', () => {
  it.each([
    ['«&#65x;» (dígitos mezclados con letras)', 'a&#65x;b', 'ab'],
    ['«&#0000000066;» (10 dígitos: más largo que lo admitido)', 'a&#0000000066;b', 'ab'],
    ['«&#xZZ;» (hexadecimal inválido) no revienta', 'a&#xZZ;b', 'ab'],
    ['«&#;» y «&#x;» vacías', 'a&#;b&#x;c', 'abc'],
    ['«&#-5;» con signo', 'a&#-5;b', 'ab'],
    ['«&#0;» «&#1;» «&#8;» «&#11;» de control', 'a&#0;b&#1;c&#8;d&#11;e', 'abcde'],
    ['«&#xD800;» «&#xDFFF;» sustitutos', 'a&#xD800;b&#xDFFF;c', 'abc'],
    ['«&#x110000;» fuera de Unicode', 'a&#x110000;b', 'ab'],
    ['«&#xFFFE;» «&#xFFFF;» no caracteres', 'a&#xFFFE;b&#xFFFF;c', 'abc'],
    ['las válidas sí: «&#233;» «&#x41;» «&#9;» «&#10;»', '&#233;&#x41;&#9;&#10;', 'éA\t\n'],
  ])('%s', (_n, entrada, salida) => { expect(decodificar(entrada)).toBe(salida) })
  it('una entidad propia («&a;», «&xxe;») NO se expande: queda como texto; las 5 básicas sí', () => {
    expect(decodificar('x &a; y &xxe; z')).toBe('x &a; y &xxe; z')
    expect(decodificar('&amp;&lt;&gt;&quot;&apos;')).toBe(`&<>"'`)
  })
  it('un Word con DOCTYPE y entidades propias (billion laughs, XXE): no se expande nada y es rápido', () => {
    const bomba = '<!DOCTYPE lolz [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
    const docx = crearZip([{ nombre: 'word/document.xml', datos: `<?xml version="1.0"?>${bomba}<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>&b; y &xxe;</w:t></w:r></w:p></w:body></w:document>` }])
    const t0 = Date.now()
    const r = leerWord(docx, 'b.docx')
    expect(Date.now() - t0).toBeLessThan(500)
    expect(r.texto).toBe('&b; y &xxe;')
    expect(r.texto.length).toBeLessThan(50)
  })
})

describe('CSV · BOM, CRLF, «;» y comillas con salto (M22)', () => {
  it('el BOM NO se queda pegado al primer nombre de columna (la línea de columnas sale exacta)', () => {
    const r = leerHoja(Buffer.from('\uFEFFnombre,nota\r\nAna,hola\r\n', 'utf8'), 'x.csv', 'csv')
    expect(r.texto.split('\n')[0]).toBe('Columnas: nombre | nota')
    expect(r.texto).not.toContain(String.fromCharCode(0xfeff))
  })
  it('CRLF, separador «;» y comillas con salto de línea y comillas dobles', () => {
    const r = leerHoja(Buffer.from('\uFEFFa;b\r\n"x;1";"dijo ""sí""\r\ny"\r\n', 'utf8'), 'x.csv', 'csv')
    expect(r.texto).toBe('Columnas: a | b\n\nfila 2: a: x;1 | b: dijo "sí"\ny')
  })
})

describe('XLSX · hojas ocultas: no se leen y se dice (hallazgo F3)', () => {
  const libro = () => crearXlsx([
    { nombre: 'Visible', filas: [['a', 'b'], ['1', '2']] },
    { nombre: 'Escondida', estado: 'hidden', filas: [['secreto', 'x'], ['costo', '9']] },
    { nombre: 'MuyEscondida', estado: 'veryHidden', filas: [['otro', 'y'], ['dato', '7']] },
  ])
  it('una hoja hidden o veryHidden NO entra al texto y cada una se nombra en los avisos', () => {
    const r = leerHoja(libro(), 'l.xlsx', 'xlsx')
    expect(r.estado).toBe('ok')
    expect(r.texto).toContain('Hoja «Visible»')
    expect(r.texto).not.toMatch(/secreto|costo|otro|dato: 7|Escondida/)
    expect(r.hojas).toEqual(['Visible'])
    expect(r.avisos.join(' ')).toMatch(/«Escondida».*OCULTA/)
    expect(r.avisos.join(' ')).toMatch(/«MuyEscondida».*OCULTA/)
  })
  it('si TODAS las hojas están ocultas el libro no es «ok»: ilegible con su aviso (no se inventa nada)', () => {
    const r = leerHoja(crearXlsx([{ nombre: 'Sola', estado: 'hidden', filas: [['a'], ['1']] }]), 'l.xlsx', 'xlsx')
    expect(r.estado).not.toBe('ok')
    expect(r.texto).toBe('')
    expect(r.avisos.join(' ')).toMatch(/OCULTA/)
  })
})

describe('control de las muestras', () => {
  it('lo de siempre sigue leyéndose', async () => {
    expect(leerWord(crearDocx(parrafoXml('hola')), 'a.docx').texto).toBe('hola')
    expect((await leerPdf(crearPdf([textoPagina('hola')]), 'a.pdf')).texto).toBe('hola')
    expect(zlib.inflateRawSync(zlib.deflateRawSync(Buffer.from('x'))).toString()).toBe('x')
  })
})
