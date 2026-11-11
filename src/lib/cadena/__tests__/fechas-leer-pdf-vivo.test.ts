/**
 * FECHAS · el texto de los PDF oficiales · el flujo que se va a PUBLICAR · CC3 · 2026-11-11 · GO Lenovo 19:30 (opción b) · US$ 0, sin red.
 * El comportamiento de punta a punta lo prueba `flujos.test.ts` (simulador, con un PDF real). Aquí: que lo que se publica es el respaldo del vivo con SOLO
 * «② Juntar» cambiado, los 3 nodos nuevos iguales a los del simulador y las 4 uniones nuevas; y que el código publicado de «② Juntar» y «② Sumar» hace lo que dice.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = path.join(process.cwd(), 'scripts', 'worker-staging', 'cadena')
const A = await import(pathToFileURL(path.join(DIR, 'fechas-leer-pdf.mjs')).href)
const C = await import(pathToFileURL(path.join(DIR, 'construir.mjs')).href)
const leer = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ANTES = leer(A.ANTES)
const DESPUES = leer(A.ARREGLADO)
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
const sinPos = (n: any) => ({ ...n, position: null })

function correrCodigo(nombre: string, entrada: unknown[], $: (n: string) => unknown) {
  const code = nodo(DESPUES, nombre).parameters.jsCode
  const items = entrada.map((j) => ({ json: j }))
  return new Function('$input', '$', code)({ all: () => items, first: () => items[0] }, $)[0].json
}

describe('lo que se publica en el flujo vivo de fechas (opción b · leer los PDF)', () => {
  it('🔴 es el respaldo del vivo: «② Juntar» con el código de nodos/, los 3 nodos nuevos iguales a los del simulador, y el resto INTACTO', () => {
    expect(DESPUES).toEqual(A.arreglar(leer(A.ANTES)))
    expect(nodo(DESPUES, '② Juntar las páginas').parameters.jsCode).toBe(fs.readFileSync(path.join(DIR, 'nodos', 'fechas-juntar.js'), 'utf8').replace(/\r\n/g, '\n'))
    const modelo = C.flujoDeFechas()
    for (const n of A.NUEVOS) expect(sinPos(nodo(DESPUES, n)), n).toEqual(sinPos(nodo(modelo, n)))
    for (const n of ANTES.nodes) {
      const d = nodo(DESPUES, n.name)
      if (n.name === '② Juntar las páginas') expect({ ...d, parameters: { ...d.parameters, jsCode: '' } }).toEqual({ ...n, parameters: { ...n.parameters, jsCode: '' } })
      else expect(d, n.name).toEqual(n)
    }
    expect(DESPUES.nodes).toHaveLength(ANTES.nodes.length + 3)
  })
  it('🔴 las uniones: solo cambian «② Juntar» y las de los 3 nodos nuevos, y son las mismas que prueba el simulador', () => {
    const modelo = C.flujoDeFechas()
    const tocadas = ['② Juntar las páginas', ...A.NUEVOS]
    for (const k of Object.keys(ANTES.connections)) if (!tocadas.includes(k)) expect(DESPUES.connections[k], k).toEqual(ANTES.connections[k])
    for (const k of tocadas) expect(DESPUES.connections[k], k).toEqual(modelo.connections[k])
    expect(Object.keys(DESPUES.connections).sort()).toEqual([...new Set([...Object.keys(ANTES.connections), ...A.NUEVOS])].sort())
  })
  it('🔴 «② Leer los PDF» llama a la acción leer_pdf con la llave interna y el contexto del proceso (workflow_id y execution)', () => {
    const p = nodo(DESPUES, '② Leer los PDF').parameters
    expect(p.url).toMatch(/\/api\/cadena\/fechas/)
    expect(p.jsonBody).toMatch(/accion: 'leer_pdf'/); expect(p.jsonBody).toMatch(/urls: \$json\.pdfs_por_leer/)
    expect(p.jsonBody).toMatch(/workflow_id: \$json\.workflow_id/); expect(p.jsonBody).toMatch(/workflow_execution_id: \$json\.workflow_execution_id/)
    expect(p.headerParameters.parameters).toContainEqual({ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' })
  })
  it('🔴 el «② Juntar» publicado manda a leer los PDF (con tipo o sin tipo) y NO la imagen ni la página vacía', () => {
    const urls = ['https://a.test/f.pdf', 'https://b.test/c.png', 'https://c.test/', 'https://d.test/sin-tipo']
    const filas = urls.map((d) => ({ json: { campana_id: 'c-1', dominio: d } }))
    const $ = (n: string) => { if (n !== '① ¿Qué dijo?') throw new Error('nodo no ejecutado: ' + n); return { all: () => filas, first: () => filas[0] } }
    const out = correrCodigo('② Juntar las páginas', [
      { statusCode: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.7 \u0001\u0002 basura' },
      { statusCode: 200, headers: { 'content-type': 'image/png' }, body: '\u0089PNG' },
      { statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' },
      { statusCode: 200, headers: {}, body: '%PDF-1.4\n\u0001\u0002\u0003' },
    ], $)
    expect(out.pdfs_por_leer).toEqual([urls[0], urls[3]])
    expect(out.paginas).toEqual([])
  })
  describe('el «② Sumar» publicado', () => {
    const juntar = { campana_id: 'c-1', paginas: [{ url: 'https://html.test', texto: 'una página de HTML con su fecha del 3 de noviembre' }], paginas_descartadas: [{ url: 'https://a.test/f.pdf', razon: 'no es texto (application/pdf)' }, { url: 'https://b.test/e.pdf', razon: 'no es texto (application/pdf)' }, { url: 'https://c.test/i.png', razon: 'no es texto (image/png)' }], pdfs_por_leer: ['https://a.test/f.pdf', 'https://b.test/e.pdf'] }
    const $ = (n: string) => { if (n !== '② Juntar las páginas') throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: juntar }) } }
    it('suma el texto leído como página y cambia la razón de lo que no se pudo leer', () => {
      const out = correrCodigo('② Sumar los PDF', [{ statusCode: 200, body: { paginas: [{ url: 'https://a.test/f.pdf', texto: 'El 3 de noviembre se celebra la fiesta de la ciudad.' }], descartadas: [{ url: 'https://b.test/e.pdf', razon: 'el PDF es escaneado (imágenes, sin texto): no se inventa' }] } }], $)
      expect(out.paginas.map((p: any) => p.url)).toEqual(['https://html.test', 'https://a.test/f.pdf'])
      expect(out.paginas_descartadas).toEqual([{ url: 'https://c.test/i.png', razon: 'no es texto (image/png)' }, { url: 'https://b.test/e.pdf', razon: 'el PDF es escaneado (imágenes, sin texto): no se inventa' }])
    })
    it('🔴 un texto leído demasiado corto no entra como página', () => {
      const out = correrCodigo('② Sumar los PDF', [{ statusCode: 200, body: { paginas: [{ url: 'https://a.test/f.pdf', texto: 'corto' }], descartadas: [] } }], $)
      expect(out.paginas.map((p: any) => p.url)).toEqual(['https://html.test'])
    })
    it('🔴 si la lectura falla, nada se suma y cada PDF dice que la lectura falló', () => {
      const out = correrCodigo('② Sumar los PDF', [{ statusCode: 500, body: { code: 'E-X' } }], $)
      expect(out.paginas.map((p: any) => p.url)).toEqual(['https://html.test'])
      expect(out.paginas_descartadas.map((d: any) => d.razon)).toEqual(['no es texto (image/png)', 'no es texto (application/pdf) y la lectura del PDF falló (E-X)', 'no es texto (application/pdf) y la lectura del PDF falló (E-X)'])
    })
  })
})
