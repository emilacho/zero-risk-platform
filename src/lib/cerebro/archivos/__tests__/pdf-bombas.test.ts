/**
 * PDF HOSTIL · bombas de compresión, cadenas de filtros, tiempo que de verdad CORTA el trabajo y texto que se corta al juntarlo
 * (hallazgo F1 de CC#3 sobre el PR #430: un PDF de 1–2 MB se abría a 1–2 GB y el tope de 25 s no lo detenía). Casos escritos ANTES del arreglo.
 * `node:zlib` se envuelve SOLO para registrar con qué máximo de salida se infla cada flujo y cuánto salió: así se vigila la memoria sin medir la memoria.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'

const registro = vi.hoisted(() => ({ llamadas: [] as Array<{ max: number | undefined; salio: number; fallo: string | null }> }))
vi.mock('node:zlib', async (importar) => {
  const real = await importar<typeof import('node:zlib')>()
  const inflateSync = (b: Buffer, o?: { maxOutputLength?: number }) => {
    try { const r = real.inflateSync(b, o); registro.llamadas.push({ max: o?.maxOutputLength, salio: r.length, fallo: null }); return r } catch (e) { registro.llamadas.push({ max: o?.maxOutputLength, salio: 0, fallo: (e as { code?: string }).code ?? String(e) }); throw e }
  }
  return { ...real, inflateSync, default: { ...real, inflateSync } }
})

import { leerPdf } from '../pdf'
import { revisarFlujosDePdf } from '../pdf-flujos'
import { TOPES } from '../topes'
import { aAscii85, contenidoDeTexto, crearPdf, crearPdfConFlujo, textoPagina } from './muestras'

const MB = 1024 * 1024
const ceros = (mb: number) => zlib.deflateSync(Buffer.alloc(mb * MB, 0), { level: 9 })

describe('la bomba de compresión se rechaza ANTES de abrir el PDF, rápido y con el máximo de salida puesto', () => {
  it('200 MB de ceros en un flujo Flate (el PDF pesa ≈ 200 KB): sobre el tope en menos de 3 s, sin inflar más del máximo por flujo', async () => {
    registro.llamadas.length = 0
    const pdf = crearPdfConFlujo(ceros(200), '/FlateDecode')
    expect(pdf.length).toBeLessThan(1 * MB)
    const t0 = Date.now()
    const r = await leerPdf(pdf, 'bomba.pdf')
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(r.estado).toBe('sobre_el_tope')
    expect(r.texto).toBe('')
    expect(r.motivo).toMatch(/bomba|inflar/i)
    expect(registro.llamadas.length).toBeGreaterThan(0)
    for (const c of registro.llamadas) { expect(c.max, 'toda inflada lleva su máximo de salida').toBeDefined(); expect(c.max as number).toBeLessThanOrEqual(TOPES.pdf_flujo_bytes); expect(c.salio).toBeLessThanOrEqual(TOPES.pdf_flujo_bytes) }
    expect(registro.llamadas.some((c) => c.fallo === 'ERR_BUFFER_TOO_LARGE')).toBe(true)
  })
  it('un flujo un poco más grande que el máximo (33 MB) se rechaza; uno de 8 MB que es texto de verdad se acepta', async () => {
    expect((await leerPdf(crearPdfConFlujo(ceros(33), '/FlateDecode'), 'a.pdf')).estado).toBe('sobre_el_tope')
    const r = revisarFlujosDePdf(crearPdfConFlujo(ceros(8), '/FlateDecode'))
    expect(r).toMatchObject({ ok: true })
  })
  it('varios flujos que SUMADOS pasan el tope total se rechazan aunque cada uno quepa', async () => {
    registro.llamadas.length = 0
    const uno = crearPdfConFlujo(ceros(30), '/FlateDecode')
    const extra = Array.from({ length: 5 }, (_, i) => Buffer.concat([Buffer.from(`\n${10 + i} 0 obj\n<< /Filter /FlateDecode >>\nstream\n`, 'latin1'), ceros(30), Buffer.from('\nendstream\nendobj\n', 'latin1')]))
    const r = await leerPdf(Buffer.concat([uno, ...extra]), 'suma.pdf')
    expect(r.estado).toBe('sobre_el_tope')
    expect(r.motivo).toMatch(/en total/)
    expect(registro.llamadas.reduce((a, c) => a + c.salio, 0)).toBeLessThanOrEqual(TOPES.pdf_flujos_total_bytes)
  })
  it('una cadena de filtros no esconde la bomba: ASCII85 + Flate', async () => {
    const r = await leerPdf(crearPdfConFlujo(aAscii85(ceros(200)), '[/ASCII85Decode /FlateDecode]'), 'cadena.pdf')
    expect(r.estado).toBe('sobre_el_tope')
  })
  it('LZW y RunLength (se expanden sin control) no se admiten: ilegible con su motivo', async () => {
    for (const f of ['/LZWDecode', '[/ASCII85Decode /LZWDecode]', '/RunLengthDecode']) {
      const r = await leerPdf(crearPdfConFlujo(Buffer.from('lo que sea'), f), 'x.pdf')
      expect(r.estado, f).toBe('ilegible')
      expect(r.motivo, f).toMatch(/filtro_no_admitido/)
    }
  })
  it('un PDF legítimo con contenido comprimido SIGUE leyéndose (Flate, y ASCII85+Flate)', async () => {
    const c = zlib.deflateSync(contenidoDeTexto('Garantía comprimida'))
    expect((await leerPdf(crearPdfConFlujo(c, '/FlateDecode'), 'f.pdf')).texto).toBe('Garantía comprimida')
    expect((await leerPdf(crearPdfConFlujo(aAscii85(c), '[/ASCII85Decode /FlateDecode]'), 'g.pdf')).texto).toBe('Garantía comprimida')
  })
  it('datos Flate dañados o cortados NO son una bomba: no se rechazan por tope y nada revienta', async () => {
    const c = zlib.deflateSync(contenidoDeTexto('algo'))
    for (const malo of [c.subarray(0, 5), Buffer.alloc(200, 77), Buffer.concat([c.subarray(0, 8), Buffer.alloc(40, 1)])]) {
      const r = await leerPdf(crearPdfConFlujo(malo, '/FlateDecode'), 'roto.pdf')
      expect(r.estado).not.toBe('sobre_el_tope')
      expect(['ok', 'vacio', 'ilegible', 'escaneado']).toContain(r.estado)
    }
  })
  it('los PDF de siempre pasan la revisión (cuenta sus flujos) y los flujos sin filtro ni se inflan', () => {
    const r = revisarFlujosDePdf(crearPdf([textoPagina('a'), textoPagina('b')]))
    expect(r).toMatchObject({ ok: true, inflado_bytes: 0 })
    expect(r.ok && r.flujos).toBeGreaterThan(0)
  })
  it('más de 50.000 flujos se rechazan', () => {
    const muchos = Buffer.from(`%PDF-1.4\n` + '1 0 obj\n<< >>\nstream\nx\nendstream\nendobj\n'.repeat(TOPES.pdf_flujos_max + 1))
    expect(revisarFlujosDePdf(muchos)).toMatchObject({ ok: false, estado: 'sobre_el_tope' })
  })
})

describe('el tiempo máximo CORTA el trabajo: pasado el tiempo no se lee ninguna página más', () => {
  const doc = (paginas: number, msPorPagina: number, lecturas: number[]) => ({
    numPages: paginas,
    getPage: async (n: number) => ({
      getTextContent: async () => { lecturas.push(n); await new Promise((r) => setTimeout(r, msPorPagina)); return { items: [{ str: `pagina ${n}`, transform: [1, 0, 0, 11, 50, 700], width: 40 }] } },
      getOperatorList: async () => ({ fnArray: [] as number[] }),
    }),
  })
  it('con 50 páginas de 60 ms y 200 ms de tiempo: declara tiempo_agotado y DEJA de leer (no sigue en segundo plano)', async () => {
    const lecturas: number[] = []
    const r = await leerPdf(crearPdf([textoPagina('x')]), 'x.pdf', { tiempoMs: 200, abrirDocumento: async () => doc(50, 60, lecturas) })
    expect(r).toMatchObject({ estado: 'ilegible', motivo: 'tiempo_agotado' })
    await new Promise((r) => setTimeout(r, 600)) // si siguiera leyendo, habría llegado a 10 páginas más
    expect(lecturas.length).toBeGreaterThan(0)
    expect(lecturas.length).toBeLessThanOrEqual(6)
  })
  it('sin vencer el tiempo lee todas las páginas', async () => {
    const lecturas: number[] = []
    const r = await leerPdf(crearPdf([textoPagina('x')]), 'x.pdf', { tiempoMs: 5000, abrirDocumento: async () => doc(5, 1, lecturas) })
    expect(r.estado).toBe('ok')
    expect(lecturas).toEqual([1, 2, 3, 4, 5])
  })
})

describe('el texto de una página se corta AL JUNTARLO, no al final', () => {
  const paginaInfinita = (cancelada: { v: boolean }, chunks: { n: number }) => ({
    getTextContent: async () => { throw new Error('no debe pedirse todo de golpe') },
    streamTextContent: () => ({
      getReader: () => ({
        read: async () => { chunks.n++; return { done: false, value: { items: Array.from({ length: 5000 }, (_, i) => ({ str: 'palabra' + (i % 10), transform: [1, 0, 0, 11, 50 + (i % 500), 700 - (i % 50)], width: 30 })) } } },
        cancel: async () => { cancelada.v = true },
      }),
    }),
    getOperatorList: async () => ({ fnArray: [] as number[] }),
  })
  it('una página con texto sin fin: se deja de leer ahí, se cancela la lectura y el aviso lo dice', async () => {
    const cancelada = { v: false }, chunks = { n: 0 }
    const r = await leerPdf(crearPdf([textoPagina('x')]), 'x.pdf', { abrirDocumento: async () => ({ numPages: 1, getPage: async () => paginaInfinita(cancelada, chunks) }) })
    expect(cancelada.v).toBe(true)
    expect(chunks.n).toBeLessThan(200)
    expect(r.estado).toBe('ok')
    expect(r.texto.length).toBeLessThanOrEqual(TOPES.texto_salida_chars)
    expect(r.avisos.join(' ')).toMatch(/cort/i)
  })
})

describe('las defensas están ESCRITAS en el código (si alguien las quita, esta prueba lo avisa)', () => {
  const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')
  it('pdf.ts abre con isEvalSupported:false y revisa los flujos antes de abrir', () => {
    expect(leer('pdf.ts')).toMatch(/isEvalSupported:\s*false/)
    expect(leer('pdf.ts')).not.toMatch(/isEvalSupported:\s*true/)
    expect(leer('pdf.ts').indexOf('revisarFlujosDePdf(buf)')).toBeGreaterThan(-1)
    expect(leer('pdf.ts').indexOf('revisarFlujosDePdf(buf)')).toBeLessThan(leer('pdf.ts').indexOf('abrir(new Uint8Array'))
  })
  it('toda inflada lleva su máximo de salida (PDF y ZIP)', () => {
    expect(leer('pdf-flujos.ts')).toMatch(/inflateSync\(datos,\s*\{\s*maxOutputLength/)
    expect(leer('zip.ts')).toMatch(/inflateRawSync\(crudo,\s*\{\s*maxOutputLength/)
    for (const f of ['pdf-flujos.ts', 'zip.ts']) for (const m of leer(f).matchAll(/inflate(Raw)?Sync\(([^)]*)\)/g)) expect(m[0], f).toMatch(/maxOutputLength/)
  })
})
