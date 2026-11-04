/**
 * LAS PALABRAS «PROHIBIDAS» DEL MANUAL SON CONTEXTO, NO REJA (encargo de Emilio 01-nov, ADENDA 1 punto 5): en los flujos del Brief, de la Parte por filas y de la Pieza
 * el pedido ya no dice «NUNCA…» y el hallazgo por coincidencia literal se declara como AVISO que no bloquea. Solo cambian esos nodos y nada más.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.join(__dirname, '../scripts/ops/oficina-marketing')
const leer = (carpeta: string, id: string) => JSON.parse(fs.readFileSync(path.join(dir, carpeta, `${id}.json`), 'utf8'))
const codigo = (f: any, nombre: string): string => f.nodes.find((n: any) => n.name === nombre).parameters.jsCode
const cambiados = (a: any, b: any) => b.nodes.filter((n: any) => { const o = a.nodes.find((x: any) => x.name === n.name); return !o || JSON.stringify(o.parameters) !== JSON.stringify(n.parameters) }).map((n: any) => n.name).sort()

const BRIEF = 'PQdIgbuFexuBsoh8'
const PARTE = 'BNXqlaX1oHSfZIpF'
const PIEZA = 'lVCLzxQCKNkd3uS0'

describe('palabras prohibidas · contexto de marca', () => {
  it.each([BRIEF, PARTE])('%s · el pedido al redactor las trata como contexto y pide razonar la intención', (id) => {
    const c = codigo(leer('nuevo', id), '③ Armar el cuerpo del redactor')
    expect(c).not.toMatch(/NUNCA sus palabras prohibidas/)
    expect(c).toMatch(/CONTEXTO DE MARCA, no una lista de bloqueo/)
    expect(c).toMatch(/citada y atribuida/)
  })
  it.each([BRIEF, PARTE])('%s · el hallazgo del brief se declara como AVISO que no bloquea', (id) => {
    const c = codigo(leer('nuevo', id), '④ Chequeos')
    expect(c).not.toMatch(/prohibida por el manual \(búsqueda literal\)/)
    expect(c).toMatch(/AVISO, no bloquea/)
  })
  it('en el Brief el hallazgo sigue sin ser fatal', () => {
    expect(codigo(leer('nuevo', BRIEF), '④ Chequeos')).toMatch(/CHEQUEOS_FATALES = \['respuesta_no_legible', 'sin_entregables', 'centinela'\]/)
  })
  it('la parte por filas también avisa sobre la hoja', () => {
    const c = codigo(leer('nuevo', PARTE), '④ Chequeos')
    expect(c).not.toMatch(/prohibida por el manual, fuera de las listas de lo prohibido/)
    expect(c).toMatch(/la hoja contiene «' \+ wn \+ '», que el manual marca como prohibida \(coincidencia literal · AVISO, no bloquea\)/)
    expect(c).toMatch(/const fatales = hallazgos\.filter\(function \(x\) \{ return x\.chequeo === 'centinela' \}\)/)
  })
  it('la pieza: el productor razona la intención y el hallazgo es aviso; lo que el brief lista como «prohibido» se sigue evitando', () => {
    const f = leer('nuevo', PIEZA)
    const p = codigo(f, '⑤ Armar el cuerpo del productor')
    expect(p).not.toMatch(/NUNCA uses una palabra prohibida/)
    expect(p).toMatch(/CONTEXTO DE MARCA/)
    expect(p).toMatch(/Lo que el brief lista en «prohibido» sí evítalo/)
    const c = codigo(f, '⑦ Chequeos')
    expect(c).toMatch(/AVISO, no bloquea/)
    expect(c).not.toMatch(/búsqueda literal · puede ser/)
  })
  it('solo cambian los nodos previstos frente al vivo respaldado', () => {
    expect(cambiados(leer('vivo', BRIEF), leer('nuevo', BRIEF)).sort()).toEqual(['① Cargar manual vigente', '① GUARDA · sin manual aprobado se DETIENE', '② Cargar plan vigente', '② GUARDA · sin plan se DETIENE', '② Cargar la aprobación del plan', '③ Armar el cuerpo del redactor', '④ Chequeos'].sort()) // + parte 4 del manual (eslogan real) y el plan aprobado (9a/9b): se prueban aparte
    expect(cambiados(leer('vivo', PIEZA), leer('nuevo', PIEZA))).toEqual(['② Cargar el manual vigente', '② GUARDA · sin manual aprobado se DETIENE', '⑤ Armar el cuerpo del productor', '⑦ Chequeos']) // + parte 4 del manual (eslogan real)
    const parte = cambiados(leer('vivo', PARTE), leer('nuevo', PARTE))
    expect(parte).toContain('③ Armar el cuerpo del redactor')
    expect(parte).toContain('④ Chequeos')
  })
  it('las conexiones no cambian en Brief y Pieza', () => {
    expect(leer('nuevo', PIEZA).connections).toEqual(leer('vivo', PIEZA).connections)
    // el Brief suma el nodo de la aprobación del plan (9a): solo ese cambio de conexiones, se prueba en flujos-oficina-marketing-plan-aprobado.test.ts
    const nb = leer('nuevo', BRIEF).connections
    expect(Object.keys(nb).filter((k) => JSON.stringify(nb[k]) !== JSON.stringify(leer('vivo', BRIEF).connections[k])).sort()).toEqual(['② Cargar la aprobación del plan', '① GUARDA · sin manual aprobado se DETIENE'].sort())
  })
})
