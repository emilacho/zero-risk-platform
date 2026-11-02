/**
 * 01-nov · EQUIPO DEL MANUAL · parte 2 · el juez de fidelidad del flujo del manual (`ssLtwYPt7zxuvnM2`) deja de ser quien escribe la voz.
 * Fija: el juez pasa a `market_research_analyst` (slug con guion bajo, autorizado en el corredor para emitir puntajes); «Uso · pedir la voz otra vez» y la lente del editor NO cambian
 * (ese nodo le pide la voz a QUIEN LA ESCRIBE, no al juez); el resto del cuerpo del juez (umbral, marca de juez, step_name) queda byte a byte; y que el juez ya no sea el escritor de la voz.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mjs sin tipos
import { LINEA_DEL_TOPE } from '../scripts/ops/oficina-marketing/reescritura-del-manual.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const vivo = leer('vivo')
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)

describe('juez independiente · el agente', () => {
  const JUEZ = '[BB] Judge · run-sdk'
  const VOZ_OTRA_VEZ = '[BB] Uso · pedir la voz otra vez (editor-en-jefe)'
  it('hoy el juez y quien escribe la voz son el mismo (editor-en-jefe): ese es el defecto', () => {
    expect(nodo(vivo, JUEZ).parameters.jsonBody).toContain('"agent": "editor-en-jefe"')
    expect(nodo(vivo, 'Lente · editor-en-jefe').parameters.jsonBody).toContain('"agent": "editor-en-jefe"')
  })
  it('ahora el juez es market_research_analyst, con guion bajo', () => {
    const j = nodo(nuevo, JUEZ).parameters.jsonBody
    expect(j).toContain('"agent": "market_research_analyst"')
    expect(j).not.toContain('market-research-analyst')
    expect(j).not.toContain('editor-en-jefe')
  })
  it('lo demás del cuerpo del juez queda igual: umbral 0.85, marca de juez, rol y step_name', () => {
    const sinTope = (s: string) => s.replace('\n  ' + LINEA_DEL_TOPE, '') // 02-nov · el tope de gasto de «pedir cambios» es de otra parte
    const quitar = (s: string) => sinTope(s).replace('"agent": "market_research_analyst",', '"agent": "X",').replace('"agent": "editor-en-jefe",', '"agent": "X",')
    expect(quitar(nodo(nuevo, JUEZ).parameters.jsonBody)).toBe(quitar(nodo(vivo, JUEZ).parameters.jsonBody))
    const j = nodo(nuevo, JUEZ).parameters.jsonBody
    expect(j).toContain('"threshold": 0.85')
    expect(j).toContain('"fidelity_judge": true')
    expect(j).toContain('"role": "faithfulness_judge"')
  })
  it('quien escribe la voz NO se toca: la lente del editor y «pedir la voz otra vez» siguen con editor-en-jefe, y el juez ya no es ese', () => {
    for (const n of ['Lente · editor-en-jefe', VOZ_OTRA_VEZ]) expect(nodo(nuevo, n).parameters.jsonBody.replace('\n  ' + LINEA_DEL_TOPE, '')).toBe(nodo(vivo, n).parameters.jsonBody)
    expect(nodo(nuevo, VOZ_OTRA_VEZ).parameters.jsonBody).toContain('"agent": "editor-en-jefe"')
    const juez = /"agent": "([^"]+)"/.exec(nodo(nuevo, JUEZ).parameters.jsonBody)![1]
    const voz = /"agent": "([^"]+)"/.exec(nodo(nuevo, VOZ_OTRA_VEZ).parameters.jsonBody)![1]
    expect(juez).not.toBe(voz)
  })
  it('ninguna de las tres lentes que escriben es el juez', () => {
    const juez = /"agent": "([^"]+)"/.exec(nodo(nuevo, JUEZ).parameters.jsonBody)![1]
    for (const l of ['Lente · brand-strategist', 'Lente · editor-en-jefe', 'Lente · jefe-client-success']) {
      expect(/"agent": "([^"]+)"/.exec(nodo(nuevo, l).parameters.jsonBody)![1]).not.toBe(juez)
    }
  })
  it('el nodo del juez es el único del cambio de esta parte: el juez que se lee del cable (Faithfulness judge) y su preparación quedan iguales', () => {
    for (const n of ['[BB] Judge prep', '[BB] Faithfulness judge', '[BB] IF · fidelidad PASS']) expect(JSON.stringify(nodo(nuevo, n))).toBe(JSON.stringify(nodo(vivo, n)))
  })
})
