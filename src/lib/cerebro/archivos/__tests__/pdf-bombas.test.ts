/**
 * PDF HOSTIL contra el lector AISLADO (relevo 4 · F1 de CC#3, decisión de Lenovo «opción b»): el PDF se lee en un PROCESO hijo con reloj DURO y memoria topada;
 * si se pasa, el proceso se MATA y el proceso principal sigue vivo, respondiendo y sin crecer. Aquí están, como pruebas permanentes, los sondeos de CC#3:
 * A02–A07 y A12 (las formas de saltarse una revisión «por texto»: ya no importan, el aislamiento las ataja todas), C02, C04 y C05 (el peor caso dentro de los topes),
 * el criterio de CC#3 (nunca más de 2 GB ni de 25 s sin devolver) con la configuración de fábrica, el arranque que falla CERRADO, y el corte del texto.
 */
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { leerPdf, RUTA_DEL_TRABAJADOR } from '../pdf'
import { TOPES } from '../topes'
import { aAscii85, baseDePagina, contenidoDeTexto, crearPdf, crearPdfConFlujo, crearPdfDeObjetos, flujoCrudo, textoPagina } from './muestras'

const MB = 1024 * 1024
const ceros = (mb: number) => zlib.deflateSync(Buffer.alloc(mb * MB, 0), { level: 9 })
const repetido = (patron: string, mb: number) => Buffer.from(patron.repeat(Math.ceil((mb * MB) / patron.length)).slice(0, mb * MB), 'latin1')
/** lo que importa medir mientras se lee: cuánto tarda, cuánto crece la memoria del proceso, y cuánto se atrasa el reloj del proceso principal (¿se colgó?) */
async function medir<T extends { estado: string; motivo?: string }>(f: () => Promise<T>) {
  const rss0 = process.memoryUsage.rss()
  let pico = rss0, atraso = 0, ultimo = performance.now()
  const iv = setInterval(() => { const n = performance.now(); atraso = Math.max(atraso, n - ultimo - 25); ultimo = n; pico = Math.max(pico, process.memoryUsage.rss()) }, 25)
  const t0 = performance.now()
  const r = await f()
  const ms = Math.round(performance.now() - t0)
  clearInterval(iv)
  return { r, ms, pico_mb: Math.round((pico - rss0) / MB), atraso_ms: Math.round(atraso) }
}
const RECHAZADO = /^(sobre_el_tope|ilegible)$/
const MOTIVO_DE_CORTE = /memoria_agotada|tiempo_agotado/

describe('A · las formas de saltarse una revisión «por texto» (CC#3 A02–A07, A12): el aislamiento las ataja TODAS (bomba de 300 MB)', () => {
  const N = 300
  const bomba = ceros(N)
  const largo = bomba.length
  const casos: Array<[string, () => Buffer]> = [
    ['A01 control: diccionario normal', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Length ${largo} /Filter /FlateDecode`, bomba)])],
    ['A02 el /Filter queda a más de 4.096 bytes antes de «stream»', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Filter /FlateDecode /Basura (${'A'.repeat(5000)}) /Length ${largo}`, bomba)])],
    ['A03 una cadena con «obj» después del /Filter', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Filter /FlateDecode /Producer (mi obj) /Length ${largo}`, bomba)])],
    ['A04 «stream» seguido de espacios antes del salto de línea', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Length ${largo} /Filter /FlateDecode`, bomba, '', '\nendstream', '   \n')])],
    ['A05 el /Filter es una referencia indirecta (5 0 R → /FlateDecode)', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Length ${largo} /Filter 5 0 R`, bomba), '/FlateDecode'])],
    ['A06 un «stream» falso dentro de una cadena del diccionario, antes del flujo real', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Filter /FlateDecode /Foo (stream\n) /Length ${largo}`, bomba)])],
    ['A07 la palabra «endstream» dentro de los datos (bloque «stored» + bomba)', () => {
      const guardado = Buffer.concat([Buffer.from([0x78, 0x01, 0x00]), Buffer.from([9, 0, 0xf6, 0xff]), Buffer.from('endstream', 'latin1')])
      const resto = zlib.deflateRawSync(Buffer.alloc(N * MB, 0), { level: 9 })
      const datos = Buffer.concat([guardado, resto, Buffer.from([0, 0, 0, 0])])
      return crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Length ${datos.length} /Filter /FlateDecode`, datos)])
    }],
    ['A12 un nombre con «obj» dentro (/Fobj)', () => crearPdfDeObjetos([...baseDePagina(), flujoCrudo(`/Filter /FlateDecode /Fobj 1 /Length ${largo}`, bomba)])],
  ]
  it.each(casos)('%s', async (_n, armar) => {
    const pdf = armar()
    expect(pdf.length).toBeLessThan(2 * MB)
    const { r, ms, atraso_ms } = await medir(() => leerPdf(pdf, 'x.pdf', { memoriaMaxMb: 200, tiempoMs: 10_000 }))
    expect(r.estado).toMatch(RECHAZADO)
    expect(r.motivo).toMatch(MOTIVO_DE_CORTE)
    expect(r.texto).toBe('')
    expect(ms).toBeLessThan(9000)
    expect(atraso_ms, 'el proceso principal no se cuelga mientras el hilo trabaja').toBeLessThan(1500)
  }, 60_000)
})

describe('C · el peor caso DENTRO de los topes (CC#3 C02, C04, C05): el reloj duro corta a mitad de una página', () => {
  const pagina = (datos: Buffer[]) => crearPdfDeObjetos([...baseDePagina(datos.length === 1 ? '4 0 R' : `[${datos.map((_, i) => `${4 + i} 0 R`).join(' ')}]`), ...datos.map((d) => flujoCrudo('/Filter /FlateDecode /Length 1', zlib.deflateSync(d, { level: 1 })))])
  it('C05 «q 1 0 0 1 0 0 cm» anidados: un PDF de unos KB que detiene un proceso por minutos se corta a los 2 s', async () => {
    const pdf = pagina([repetido('q 1 0 0 1 0 0 cm\n', 2)])
    expect(pdf.length).toBeLessThan(100 * 1024)
    const { r, ms, atraso_ms } = await medir(() => leerPdf(pdf, 'q.pdf', { tiempoMs: 2000 }))
    expect(r).toMatchObject({ estado: 'ilegible', motivo: 'tiempo_agotado' })
    expect(ms).toBeGreaterThanOrEqual(1900)
    expect(ms).toBeLessThan(4500)
    expect(atraso_ms).toBeLessThan(1000)
  }, 60_000)
  it('C02 4 flujos de 30 MB de «() Tj» (texto vacío): se corta por tiempo o por memoria, sin pasar el tope', async () => {
    const pdf = pagina(Array.from({ length: 4 }, () => Buffer.concat([Buffer.from('BT /F1 12 Tf '), repetido(' () Tj', 30)])))
    const { r, ms, pico_mb, atraso_ms } = await medir(() => leerPdf(pdf, 'c02.pdf', { tiempoMs: 4000, memoriaMaxMb: 600 }))
    expect(r.estado).toMatch(RECHAZADO)
    expect(ms).toBeLessThan(8000)
    expect(pico_mb).toBeLessThan(1500)
    expect(atraso_ms).toBeLessThan(1500)
  }, 90_000)
  it('C04 120 MB de operadores de trazo en 4 flujos (antes: el proceso murió por falta de memoria a los 2 minutos): el proceso principal sigue vivo', async () => {
    const pdf = pagina(Array.from({ length: 4 }, () => repetido('0 0 m 10 10 l S\n', 30)))
    const { r, ms, pico_mb, atraso_ms } = await medir(() => leerPdf(pdf, 'c04.pdf', { tiempoMs: 5000, memoriaMaxMb: 600 }))
    expect(r.estado).toMatch(RECHAZADO)
    expect(r.motivo).toMatch(MOTIVO_DE_CORTE)
    expect(ms).toBeLessThan(9000)
    expect(pico_mb).toBeLessThan(1500)
    expect(atraso_ms).toBeLessThan(1500)
    expect(process.memoryUsage.rss()).toBeGreaterThan(0) // el proceso sigue vivo y contesta
  }, 90_000)
  it('después de matar el hilo, el siguiente PDF normal se lee bien (no queda nada envenenado)', async () => {
    await leerPdf(pagina([repetido('q 1 0 0 1 0 0 cm\n', 2)]), 'q.pdf', { tiempoMs: 1000 })
    const r = await leerPdf(crearPdf([textoPagina('sigo vivo')]), 'bien.pdf')
    expect(r).toMatchObject({ estado: 'ok', texto: 'sigo vivo' })
  }, 60_000)
})

describe('bombas de compresión de toda forma: el aislamiento no depende de entender el PDF', () => {
  it('200 MB de ceros en un flujo Flate (el PDF pesa < 1 MB): sobre el tope por memoria, rápido', async () => {
    const pdf = crearPdfConFlujo(ceros(200), '/FlateDecode')
    expect(pdf.length).toBeLessThan(1 * MB)
    const { r, ms } = await medir(() => leerPdf(pdf, 'b.pdf', { memoriaMaxMb: 150, tiempoMs: 10_000 }))
    expect(r.estado).toBe('sobre_el_tope')
    expect(r.motivo).toMatch(/memoria_agotada/)
    expect(ms).toBeLessThan(8000)
  }, 60_000)
  it('una cadena ASCII85 + Flate y LZW no esconden nada: igual se corta', async () => {
    const a = await leerPdf(crearPdfConFlujo(aAscii85(ceros(200)), '[/ASCII85Decode /FlateDecode]'), 'a.pdf', { memoriaMaxMb: 150, tiempoMs: 10_000 })
    expect(a.estado).toMatch(RECHAZADO)
    expect(a.motivo).toMatch(MOTIVO_DE_CORTE)
    const l = await leerPdf(crearPdfConFlujo(Buffer.alloc(50_000, 0x80), '/LZWDecode'), 'l.pdf', { memoriaMaxMb: 150, tiempoMs: 6000 })
    expect(['ok', 'vacio', 'ilegible', 'sobre_el_tope', 'escaneado']).toContain(l.estado) // LZW ya no se prohíbe a ciegas: se lee aislado y, si pide demasiado, se corta
  }, 90_000)
  it('un PDF legítimo con contenido comprimido SIGUE leyéndose, también con cadena de filtros', async () => {
    const c = zlib.deflateSync(contenidoDeTexto('Garantía comprimida'))
    expect((await leerPdf(crearPdfConFlujo(c, '/FlateDecode'), 'f.pdf')).texto).toBe('Garantía comprimida')
    expect((await leerPdf(crearPdfConFlujo(aAscii85(c), '[/ASCII85Decode /FlateDecode]'), 'g.pdf')).texto).toBe('Garantía comprimida')
  })
  it('datos Flate dañados o cortados: se declaran, no revientan nada', async () => {
    const c = zlib.deflateSync(contenidoDeTexto('algo'))
    for (const malo of [c.subarray(0, 5), Buffer.alloc(200, 77), Buffer.concat([c.subarray(0, 8), Buffer.alloc(40, 1)])]) {
      const r = await leerPdf(crearPdfConFlujo(malo, '/FlateDecode'), 'roto.pdf')
      expect(['ok', 'vacio', 'ilegible', 'escaneado']).toContain(r.estado)
    }
  })
})

describe('el criterio de CC#3 con la configuración de FÁBRICA: nunca más de 25 s sin devolver y el proceso principal SIEMPRE sobrevive', () => {
  const pagina = (datos: Buffer[]) => crearPdfDeObjetos([...baseDePagina(datos.length === 1 ? '4 0 R' : `[${datos.map((_, i) => `${4 + i} 0 R`).join(' ')}]`), ...datos.map((d) => flujoCrudo('/Filter /FlateDecode /Length 1', zlib.deflateSync(d, { level: 1 })))])
  const tj = (mb: number) => Buffer.concat([Buffer.from('BT /F1 12 Tf '), repetido(' () Tj', mb)])
  it('un PDF de ≈ 2 MB que se abre a 2.000 MB: sobre el tope, devuelve en menos de 25 s y el principal casi no crece (la memoria es del proceso hijo, que muere)', async () => {
    const comp = await new Promise<Buffer>((resolve) => {
      const d = zlib.createDeflate({ level: 9 })
      const out: Buffer[] = []
      d.on('data', (b: Buffer) => out.push(b))
      d.on('end', () => resolve(Buffer.concat(out)))
      const bloque = Buffer.alloc(50 * MB, 0)
      for (let i = 0; i < 40; i++) d.write(bloque)
      d.end()
    })
    const pdf = crearPdfConFlujo(comp, '/FlateDecode')
    expect(pdf.length).toBeLessThan(10 * MB)
    const { r, ms, pico_mb, atraso_ms } = await medir(() => leerPdf(pdf, 'dos-gb.pdf'))
    expect(r.estado).toBe('sobre_el_tope')
    expect(r.motivo).toMatch(/memoria_agotada/)
    expect(ms).toBeLessThan(TOPES.tiempo_ms)
    expect(pico_mb, 'crecimiento del proceso principal').toBeLessThan(400)
    expect(atraso_ms).toBeLessThan(2000)
  }, 180_000)
  // los tres casos que TUMBABAN el proceso con un hilo (aborto de V8, código 134: CC#3 los reprodujo 5 de 8, 5 de 5 y 5 de 5 veces): con proceso hijo muere el HIJO y el principal sigue
  it.each([
    ['C02 · 4 flujos de 30 MB de «() Tj»', () => pagina(Array.from({ length: 4 }, () => tj(30)))],
    ['C02c · 2 flujos de 30 MB de «() Tj»', () => pagina(Array.from({ length: 2 }, () => tj(30)))],
    ['C08 · 4 flujos de 30 MB de «1 0 0 1 5 5 cm»', () => pagina(Array.from({ length: 4 }, () => repetido('1 0 0 1 5 5 cm\n', 30)))],
  ])('%s: con la configuración de fábrica, el hijo muere o se corta y el principal SIGUE VIVO y contesta', async (_n, armar) => {
    const pdf = armar()
    expect(pdf.length).toBeLessThan(1 * MB)
    const { r, ms, atraso_ms } = await medir(() => leerPdf(pdf, 'tumba.pdf'))
    expect(r.estado).toMatch(RECHAZADO)
    expect(r.texto).toBe('')
    expect(ms).toBeLessThan(TOPES.tiempo_ms + 3000)
    expect(atraso_ms).toBeLessThan(1500)
    const despues = await leerPdf(crearPdf([textoPagina('el principal sigue vivo')]), 'bien.pdf') // si el principal hubiera muerto, ni se llegaría aquí
    expect(despues).toMatchObject({ estado: 'ok', texto: 'el principal sigue vivo' })
  }, 120_000)
})

describe('FALLA CERRADO: si el aislamiento no se puede garantizar, el PDF NO se lee (nunca en el proceso principal)', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'hijo-pdf-'))
  const guion = (nombre: string, codigo: string) => { const r = path.join(carpeta, nombre); fs.writeFileSync(r, codigo); return r }
  const pdf = crearPdf([textoPagina('esto NO debe leerse sin aislamiento')])
  const cerrado = (r: { estado: string; motivo?: string; texto: string }) => r.estado === 'ilegible' && /^aislamiento_no_disponible/.test(String(r.motivo)) && r.texto === ''
  it('el archivo del proceso existe donde `pdf.ts` lo busca', () => { expect(fs.existsSync(RUTA_DEL_TRABAJADOR)).toBe(true) })
  it('K1 · el archivo del proceso no existe → aislamiento_no_disponible, sin texto y rápido', async () => {
    const { r, ms } = await medir(() => leerPdf(pdf, 'x.pdf', { trabajador: path.join(carpeta, 'no-existe.cjs') }))
    expect(cerrado(r)).toBe(true)
    expect(ms).toBeLessThan(5000)
  })
  it('el proceso nunca avisa que está listo → aislamiento_no_disponible a los 300 ms, y el proceso se mata', async () => {
    const t = guion('mudo.cjs', 'setInterval(() => {}, 1000)')
    const { r, ms } = await medir(() => leerPdf(pdf, 'x.pdf', { trabajador: t, arranqueMs: 300 }))
    expect(cerrado(r)).toBe(true)
    expect(ms).toBeLessThan(3000)
  })
  it('K4 · el proceso no encuentra `unpdf` (falla al cargar) → aislamiento_no_disponible', async () => {
    const t = guion('sin-unpdf.cjs', "require('modulo-que-no-existe-xyz')")
    expect(cerrado(await leerPdf(pdf, 'x.pdf', { trabajador: t }))).toBe(true)
    const copia = path.join(carpeta, 'trabajador-sin-biblioteca.cjs')
    fs.copyFileSync(RUTA_DEL_TRABAJADOR, copia) // el MISMO proceso del PR, copiado donde no hay node_modules cerca
    expect(cerrado(await leerPdf(pdf, 'x.pdf', { trabajador: copia }))).toBe(true)
  })
  it('K2 · el directorio de trabajo no es la raíz (como podría pasar en Vercel): la ruta no existe → falla cerrado, no lee en el principal', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(carpeta)
    vi.resetModules()
    try {
      const m = await import('../pdf')
      expect(m.RUTA_DEL_TRABAJADOR.startsWith(carpeta)).toBe(true)
      expect(cerrado(await m.leerPdf(pdf, 'x.pdf'))).toBe(true)
    } finally { cwd.mockRestore(); vi.resetModules() }
  })
  it('K3 · CONTROL POSITIVO: una copia SOLO con el proceso y `unpdf` (lo que trae el empaquetado) y ese directorio de trabajo → lee bien', async () => {
    const T = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-empaquetado-'))
    fs.mkdirSync(path.join(T, 'src/lib/cerebro/archivos'), { recursive: true })
    fs.copyFileSync(RUTA_DEL_TRABAJADOR, path.join(T, 'src/lib/cerebro/archivos/trabajador-pdf.cjs'))
    fs.mkdirSync(path.join(T, 'node_modules'), { recursive: true })
    fs.cpSync(fs.realpathSync(path.join(path.dirname(RUTA_DEL_TRABAJADOR), '../../../../node_modules/unpdf')), path.join(T, 'node_modules/unpdf'), { recursive: true })
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(T)
    vi.resetModules()
    try {
      const m = await import('../pdf')
      const r = await m.leerPdf(crearPdf([textoPagina('leído con lo empaquetado')]), 'x.pdf')
      expect(r).toMatchObject({ estado: 'ok', texto: 'leído con lo empaquetado' })
    } finally { cwd.mockRestore(); vi.resetModules(); fs.rmSync(T, { recursive: true, force: true }) }
  })
  it('K6/K7/K8 · crear procesos hijos no es posible (fork inexistente, ENOMEM al crear, error de arranque antes de «listo») → falla cerrado y NADA se lee', async () => {
    for (const [nombre, fake] of [
      ['fork inexistente', () => ({ fork: undefined })],
      ['ENOMEM al crear', () => ({ fork: () => { const e = new Error('spawn ENOMEM') as Error & { code: string }; e.code = 'ENOMEM'; throw e } })],
      ['EAGAIN al arrancar', () => ({ fork: () => { const h = new EventEmitter() as EventEmitter & { stderr: null; exitCode: null; kill: () => void }; h.stderr = null; h.exitCode = null; h.kill = () => undefined; setTimeout(() => { const e = new Error('spawn EAGAIN') as Error & { code: string }; e.code = 'EAGAIN'; h.emit('error', e) }, 5); return h } })],
      ['sale sin avisar', () => ({ fork: () => { const h = new EventEmitter() as EventEmitter & { stderr: null; exitCode: null; kill: () => void }; h.stderr = null; h.exitCode = null; h.kill = () => undefined; setTimeout(() => h.emit('exit', 1, null), 5); return h } })],
    ] as Array<[string, () => Record<string, unknown>]>) {
      vi.resetModules()
      vi.doMock('node:child_process', fake)
      try {
        const m = await import('../pdf')
        const r = await m.leerPdf(pdf, 'x.pdf')
        expect(cerrado(r), nombre).toBe(true)
      } finally { vi.doUnmock('node:child_process'); vi.resetModules() }
    }
  })
  it('K9 · el proceso avisa «listo» y luego se cae a media lectura: se declara (no es «sin aislamiento»), sin texto inventado', async () => {
    const cae = guion('cae.cjs', "process.once('message', () => { throw new Error('boom') }); process.send({ tipo: 'listo' })")
    const r = await leerPdf(pdf, 'x.pdf', { trabajador: cae })
    expect(r.estado).toBe('ilegible'); expect(r.texto).toBe('')
    expect(r.motivo).not.toMatch(/aislamiento_no_disponible/)
    const sale = guion('sale.cjs', "process.once('message', () => { process.exit(3) }); process.send({ tipo: 'listo' })")
    const s = await leerPdf(pdf, 'x.pdf', { trabajador: sale })
    expect(s.estado).toBe('ilegible'); expect(s.texto).toBe('')
  })
  it('un proceso que avisa y se queda colgado en un bucle se MATA por el reloj; su bucle infinito no cuelga al principal', async () => {
    const cuelga = guion('cuelga.cjs', "process.once('message', () => { for (;;) {} }); process.send({ tipo: 'listo' })")
    const a = await medir(() => leerPdf(pdf, 'x.pdf', { trabajador: cuelga, tiempoMs: 800 }))
    expect(a.r).toMatchObject({ estado: 'ilegible', motivo: 'tiempo_agotado', texto: '' })
    expect(a.ms).toBeLessThan(3000)
    expect(a.atraso_ms).toBeLessThan(500)
  })
  it('N11 · un proceso que se pasa del montón y MUERE SOLO (aborto de V8, código 134) NO se declara «ok vacío»: sobre_el_tope, y el principal sigue vivo', async () => {
    const come = guion('come.cjs', "process.once('message', () => { const guardado = []; for (;;) guardado.push(new Array(1e6).fill('x')) }); process.send({ tipo: 'listo' })")
    const { r, ms } = await medir(() => leerPdf(pdf, 'x.pdf', { trabajador: come, montonMaxMb: 64, tiempoMs: 20_000 }))
    expect(r.estado).toBe('sobre_el_tope')
    expect(r.motivo).toMatch(/memoria_agotada/)
    expect(r.texto).toBe('')
    expect(ms).toBeLessThan(15_000)
  }, 40_000)
  it('N10 · un proceso que sale sin responder NUNCA se declara «ok»', async () => {
    const sale = guion('sale0.cjs', "process.once('message', () => { process.exit(0) }); process.send({ tipo: 'listo' })")
    const r = await leerPdf(pdf, 'x.pdf', { trabajador: sale })
    expect(r.estado).not.toBe('ok'); expect(r.texto).toBe('')
  })
  it('de a UN PDF a la vez: dos lecturas simultáneas se turnan (la memoria que se vigila es la de una sola)', async () => {
    const cuelga = guion('cuelga2.cjs', "process.once('message', () => { for (;;) {} }); process.send({ tipo: 'listo' })")
    const t0 = Date.now()
    const [a, b] = await Promise.all([leerPdf(pdf, 'a.pdf', { trabajador: cuelga, tiempoMs: 700 }), leerPdf(pdf, 'b.pdf', { trabajador: cuelga, tiempoMs: 700 })])
    expect(a.motivo).toBe('tiempo_agotado'); expect(b.motivo).toBe('tiempo_agotado')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1300)
  })
  it('tope de cola: con más de 8 PDF esperando turno, el que llega de más se rechaza SIN leer (cola_llena) y los demás siguen su curso', async () => {
    const cuelga = guion('cuelga3.cjs', "process.once('message', () => { for (;;) {} }); process.send({ tipo: 'listo' })")
    const lecturas = Array.from({ length: TOPES.pdf_cola_max + 2 }, (_, i) => leerPdf(pdf, `p${i}.pdf`, { trabajador: cuelga, tiempoMs: 200 }))
    const rs = await Promise.all(lecturas)
    expect(rs.filter((r) => /cola_llena/.test(String(r.motivo))).length).toBe(2)
    expect(rs.filter((r) => r.motivo === 'tiempo_agotado').length).toBe(TOPES.pdf_cola_max)
    for (const r of rs) expect(r.texto).toBe('')
  }, 30_000)
  it('el aislamiento NO deja procesos de más: tras terminar, el siguiente PDF normal se lee', async () => {
    expect(await leerPdf(crearPdf([textoPagina('bien')]), 'ok.pdf')).toMatchObject({ estado: 'ok', texto: 'bien' })
  })
})

describe('el texto se corta al juntarlo y las páginas siguientes no se leen cuando ya llegó al máximo (lo que cubrían N07 y N08 de CC#3)', () => {
  it('N07 · una página con muchos trozos de texto: se corta ahí y el aviso lo dice', async () => {
    const pagina = { textos: Array.from({ length: 190 }, (_, i) => ({ t: 'palabra' + i, x: 50, y: 20 + i * 4 })) }
    const r = await leerPdf(crearPdf([pagina]), 'muchos.pdf', { topesDeTexto: { pdf_items_por_pagina: 60 } })
    expect(r.estado).toBe('ok')
    expect(r.avisos.join(' ')).toMatch(/página\(s\) 1 se cortó/)
    expect(r.texto.split('\n').length).toBeLessThan(150)
    const completa = await leerPdf(crearPdf([pagina]), 'muchos.pdf')
    expect(completa.avisos.join(' ')).not.toMatch(/se cortó/)
    expect(completa.texto.split('\n').length).toBeGreaterThan(150)
  })
  it('N08 · con el texto ya al máximo no se leen más páginas, y se nombran las que no se leyeron', async () => {
    const larga = (n: number) => textoPagina(...Array.from({ length: 4 }, (_, i) => `pagina ${n} linea ${i} ` + 'x'.repeat(90)))
    const r = await leerPdf(crearPdf([larga(1), larga(2), larga(3), larga(4)]), 'largo.pdf', { topesDeTexto: { texto_salida_chars: 700 } })
    expect(r.estado).toBe('ok')
    expect(r.texto.length).toBeLessThanOrEqual(700)
    expect(r.avisos.join(' ')).toMatch(/páginas \d a 4 NO se leyeron/)
    expect(r.avisos.join(' ')).toMatch(/cortó a 700 caracteres/)
    expect(r.texto).not.toMatch(/pagina 4/)
  })
})

describe('las defensas están ESCRITAS en el código (si alguien las quita, esta prueba lo avisa)', () => {
  const hijo = () => fs.readFileSync(RUTA_DEL_TRABAJADOR, 'utf8')
  const principal = () => fs.readFileSync(path.resolve(__dirname, '..', 'pdf.ts'), 'utf8')
  it('el proceso abre con isEvalSupported:false, carga solo `unpdf` y su guardián de memoria, y lo dice en su salida de errores', () => {
    expect(hijo()).toMatch(/isEvalSupported:\s*false/)
    expect(hijo()).not.toMatch(/isEvalSupported:\s*true/)
    expect([...new Set([...hijo().matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]))].sort()).toEqual(['node:fs', 'node:worker_threads', 'unpdf'])
    expect(hijo()).toMatch(/MEMORIA_AGOTADA/)
    expect(hijo()).toMatch(/process\.kill\(process\.pid,\s*'SIGKILL'\)/)
    expect(hijo()).not.toMatch(/parentPort/)
  })
  it('el principal lanza un PROCESO (no un hilo) con montón topado, entorno vacío y canal IPC; lo mata con SIGKILL; y NO importa unpdf ni worker_threads', () => {
    const t = principal()
    expect(t).toMatch(/fork\(ruta,\s*\[\],\s*\{[^}]*--max-old-space-size/)
    expect(t).toMatch(/env:\s*\{\}\s*as NodeJS\.ProcessEnv/)
    expect(t).toMatch(/stdio:\s*\['ignore',\s*'ignore',\s*'pipe',\s*'ipc'\]/)
    expect(t).toMatch(/hijo\.kill\('SIGKILL'\)/)
    expect(t).not.toMatch(/from\s+['"]unpdf['"]/)
    expect(t).not.toMatch(/worker_threads|new\s+Worker\s*\(/)
  })
  it('el reloj duro, el tope de cola y el cierre en falso siguen vivos (rotura típica: dejar de matar al proceso)', () => {
    const t = principal()
    expect(t).toMatch(/setTimeout\(\(\) => fin\(lectura\('pdf', nombre, buf, 'ilegible', \{ motivo: 'tiempo_agotado' \}\)\), tiempoMs\)/)
    expect(t).toMatch(/pendientes >= TOPES\.pdf_cola_max/)
    expect(t).toMatch(/aislamiento_no_disponible/)
    expect(t).toMatch(/limite_mb: memoriaMaxMb/)
  })
})
