/**
 * 03-nov · opción 1 (propuesta declarada aparte) + opción A (content-creator salta al editor) en el flujo del manual. US$ 0, sin red.
 * Fija: nadie pide el prefijo «PROPUESTA (no es dato del cliente):» en el texto; la vara de uso (nodo real) acepta la declaración aparte; los reparos no piden prefijo;
 * solo los 2 nodos de content-creator llevan la cabecera que salta al editor.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const f = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing', 'nuevo', 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nodo = (n: string) => f.nodes.find((x: any) => x.name === n)
const codigo = (n: string) => nodo(n).parameters.jsCode as string
const CC = ['Lente · editor-en-jefe', '[BB] Uso · pedir la voz otra vez (editor-en-jefe)']

describe('la propuesta se declara aparte', () => {
  it('ninguna instrucción pide empezar por «PROPUESTA (no es dato del cliente):»', () => {
    for (const n of ['[BB] Fan-out prep', '[BB] Uso · ¿usó lo disponible?']) {
      expect(codigo(n)).not.toMatch(/EMPEZANDO por «PROPUESTA|empieza por «PROPUESTA/)
    }
    expect(codigo('[BB] Fan-out prep')).toContain('`_meta.<campo>.fuente` = «propuesta»')
  })
  it('los dos nodos llevan, byte a byte, el bloque nuevo de la vara (el que prueba vara-declaracion-aparte) y ya no el del 20-oct', () => {
    const leerB = (a: string) => fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2', a), 'utf8').replace(/\r\n/g, '\n').trim()
    const nuevoB = leerB('bloque-uso-de-lo-disponible-2026-11-03.js'), viejoB = leerB('bloque-uso-de-lo-disponible-2026-10-20.js')
    for (const n of ['[BB] Faithfulness judge', '[BB] Uso · ¿usó lo disponible?']) {
      expect(codigo(n)).toContain(nuevoB)
      expect(codigo(n)).not.toContain(viejoB)
      expect(codigo(n)).toContain("udPropuestaDeclarada(d, 'voice_description')")
    }
  })
  it('los reparos de la vara ya no piden el prefijo', () => {
    const c = codigo('[BB] Uso · ¿usó lo disponible?')
    expect(c).not.toContain('sin rotular')
    expect(c).toContain('sin declarar')
  })
  it('opción A: TODAS las llamadas con content-creator saltan al editor (la lente, el rescate de la voz y las del equipo: aportes e integración) y ninguna otra', () => {
    const conCabecera = (n: any) => (n.parameters?.headerParameters?.parameters ?? []).some((h: any) => h.name === 'x-skip-editor-middleware' && h.value === '1')
    const llamadas = f.nodes.filter((n: any) => n.type === 'n8n-nodes-base.httpRequest' && String(n.parameters?.url ?? '').includes('/api/agents/run-sdk'))
    const esContentCreator = (n: any) => {
      if (/"agent":\s*"content-creator"/.test(String(n.parameters.jsonBody ?? ''))) return true
      const prep = nodo(String(n.name).replace(/ · llamar$/, ' · preparar'))
      return !!prep && /llamar\('content-creator'/.test(prep.parameters.jsCode ?? '')
    }
    const deberian = llamadas.filter(esContentCreator).map((n: any) => n.name).sort()
    expect(deberian.length).toBeGreaterThanOrEqual(4)
    expect(llamadas.filter(conCabecera).map((n: any) => n.name).sort()).toEqual(deberian)
  })
})
