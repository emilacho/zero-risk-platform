/**
 * FECHAS · solo cuenta como página la que trae texto · el flujo que se va a PUBLICAR · CC3 · 2026-11-11 · arreglo genérico de CC7 · US$ 0, sin red.
 * El comportamiento de punta a punta lo prueba `flujos.test.ts` (simulador). Aquí: que lo que se publica es el respaldo del vivo con SOLO esos dos nodos
 * cambiados, y que el nodo publicado (su código exacto) descarta un PDF, una imagen y una página vacía, y deja pasar el texto.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = path.join(process.cwd(), 'scripts', 'worker-staging', 'cadena')
const A = await import(pathToFileURL(path.join(DIR, 'fechas-solo-texto.mjs')).href)
const leer = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ANTES = leer(A.ANTES)
const DESPUES = leer(A.ARREGLADO)
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)

function correrJuntar(respuestas: unknown[], dominios: string[]) {
  const code = nodo(DESPUES, '② Juntar las páginas').parameters.jsCode
  const filas = dominios.map((d) => ({ json: { campana_id: 'c-1', dominio: d } }))
  const items = respuestas.map((j) => ({ json: j }))
  const $ = (n: string) => { if (n !== '① ¿Qué dijo?') throw new Error('nodo no ejecutado: ' + n); return { all: () => filas, first: () => filas[0] } }
  return new Function('$input', '$', code)({ all: () => items, first: () => items[0] }, $)[0].json
}

describe('lo que se publica en el flujo vivo de fechas', () => {
  it('🔴 es el respaldo del vivo con SOLO los dos nodos cambiados, y su código es el de nodos/ (el que prueba el simulador)', () => {
    expect(DESPUES).toEqual(A.arreglar(leer(A.ANTES)))
    expect(DESPUES.connections).toEqual(ANTES.connections)
    expect(DESPUES.nodes.map((n: any) => n.name)).toEqual(ANTES.nodes.map((n: any) => n.name))
    for (const n of ANTES.nodes) {
      const d = nodo(DESPUES, n.name)
      if (n.name in A.CAMBIOS) {
        expect(d.parameters.jsCode).toBe(fs.readFileSync(path.join(DIR, 'nodos', A.CAMBIOS[n.name]), 'utf8').replace(/\r\n/g, '\n'))
        expect({ ...d, parameters: { ...d.parameters, jsCode: '' } }).toEqual({ ...n, parameters: { ...n.parameters, jsCode: '' } })
      } else expect(d, n.name).toEqual(n)
    }
  })
  it('🔴 el nodo publicado descarta un PDF, una imagen y una página vacía con su razón, y deja pasar la página de texto', () => {
    const urls = ['https://a.test/f.pdf', 'https://b.test/c.png', 'https://c.test/', 'https://d.test/']
    const j = correrJuntar([
      { statusCode: 200, headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.7 binario' },
      { statusCode: 200, headers: { 'content-type': 'image/png' }, body: 'PNG' },
      { statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<html><body><div></div></body></html>' },
      { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<p>El 10 de agosto es el Primer Grito de Independencia.</p>' },
    ], urls)
    expect(j.paginas).toEqual([{ url: urls[3], texto: 'El 10 de agosto es el Primer Grito de Independencia.' }])
    expect(j.paginas_descartadas.map((d: any) => d.razon)).toEqual(['no es texto (application/pdf)', 'no es texto (image/png)', 'sin texto legible (0 caracteres)'])
  })
  it('🔴 sin tipo declarado, lo que no es texto se reconoce por su contenido: pocas letras (un PDF sin comprimir) o caracteres de reemplazo (bytes rotos)', () => {
    const roto = String.fromCharCode(0xfffd)
    const j = correrJuntar([
      { statusCode: 200, body: '%PDF-1.7 1 0 obj << /Length 812 >> stream 0 0 0 1 2 3 4 5 6 7 8 9 10 11 12 endstream 0000000017 00000 n 0000000123 00000 n %%EOF' },
      { statusCode: 200, body: `Calendario oficial de feriados nacionales ${roto}${roto} del año dos mil veintiséis` },
      { statusCode: 200, body: '<p>El 2 de noviembre es el Día de los Difuntos en todo el país.</p>' },
    ], ['https://a.test/', 'https://b.test/', 'https://c.test/'])
    expect(j.paginas.map((p: any) => p.url)).toEqual(['https://c.test/'])
    expect(j.paginas_descartadas).toEqual([
      { url: 'https://a.test/', razon: expect.stringMatching(/^sin texto legible \(\d+ % de letras: parece un archivo binario\)$/) },
      { url: 'https://b.test/', razon: expect.stringMatching(/^sin texto legible \(\d+ % de letras: parece un archivo binario\)$/) },
    ])
    expect(Number(/\((\d+) %/.exec(j.paginas_descartadas[1].razon)![1])).toBeGreaterThan(60) // lo descarta el carácter roto, no la proporción
  })
  it('🔴 lo publicado cambia EXACTAMENTE estos dos nodos (lista fija, no la del constructor): juntar y armar preparar', () => {
    const cambiados = ANTES.nodes.filter((n: any) => JSON.stringify(n) !== JSON.stringify(nodo(DESPUES, n.name))).map((n: any) => n.name)
    expect(cambiados).toEqual(['② Juntar las páginas', '③ Armar preparar'])
    expect(nodo(DESPUES, '③ Armar preparar').parameters.jsCode).toContain('paginas_descartadas: s.paginas_descartadas || []')
  })
  it('una respuesta que no bajó (404, sin cuerpo) no se cuenta ni como página ni como descartada: es lo de siempre', () => {
    const j = correrJuntar([{ statusCode: 404, body: 'no' }, { statusCode: 200, body: '' }], ['https://x.test/', 'https://y.test/'])
    expect(j.paginas).toEqual([]); expect(j.paginas_descartadas).toEqual([])
  })
})
