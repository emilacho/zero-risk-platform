/**
 * 10-nov · decisión 3 de Lenovo por Emilio · el detector pegado en los flujos (brief · pieza · copia por filas) suma las mismas formas de voseo que el módulo.
 * Se prueba sobre las copias de los flujos guardadas en el repositorio: cada nodo con el generador cambia, compila, y su generador ejecutado ve las formas nuevas.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { construirFormasEnAs, conFormasEnAs } from '../scripts/ops/oficina-marketing/detector-formas-en-as.mjs'

type Nodo = { name: string; parameters: { jsCode?: string } }
const VIVO = join(process.cwd(), 'scripts/ops/oficina-marketing/vivo')
const flujo = (id: string) => JSON.parse(readFileSync(join(VIVO, `${id}.json`), 'utf8')) as { name: string; nodes: Nodo[] }
const FLUJOS: Array<[string, string, string[]]> = [
  ['brief', 'PQdIgbuFexuBsoh8', ['③ Armar el cuerpo del redactor', '④ Chequeos']],
  ['pieza', 'lVCLzxQCKNkd3uS0', ['⑤ Armar el cuerpo del productor', '⑦ Chequeos']],
  ['copia por filas', 'BNXqlaX1oHSfZIpF', ['③ Armar el cuerpo del redactor', '④ Chequeos']],
]
/** ejecuta SOLO el generador del nodo (de `var VERBOS =` al fin de `formasVoseo`) y devuelve sus formas */
function formasDelNodo(js: string): Record<string, boolean> {
  const c = js.split('\r\n').join('\n')
  const i0 = c.indexOf('var VERBOS = ')
  const i1 = c.indexOf('// el tuteo:', i0)
  expect(i0).toBeGreaterThan(-1)
  expect(i1).toBeGreaterThan(i0)
  return vm.runInNewContext(`${c.slice(i0, i1)}\nformasVoseo()`) as Record<string, boolean>
}

describe.each(FLUJOS)('flujo %s', (_n, id, nodos) => {
  const antes = flujo(id)
  const { flujo: despues, cambiados } = construirFormasEnAs(antes) as { flujo: { nodes: Nodo[] }; cambiados: string[] }
  it('🔴 cambian justo los nodos que llevan el generador, y nada más', () => {
    expect(cambiados).toEqual(nodos)
    for (const n of despues.nodes) if (!nodos.includes(n.name)) expect(n).toEqual(antes.nodes.find((x) => x.name === n.name))
  })
  it('🔴 el generador de cada nodo cambiado ve las 7 formas; antes no las veía', () => {
    for (const nombre of nodos) {
      const v0 = formasDelNodo(antes.nodes.find((x) => x.name === nombre)!.parameters.jsCode!)
      const v1 = formasDelNodo(despues.nodes.find((x) => x.name === nombre)!.parameters.jsCode!)
      for (const w of ['necesitás', 'continuás', 'ajustás', 'parás', 'etiquetá', 'descargá', 'configurá']) {
        expect(v0[w], `${nombre} antes · ${w}`).toBeUndefined()
        expect(v1[w], `${nombre} después · ${w}`).toBe(true)
      }
      expect(v1['pedí']).toBe(true)
    }
  })
  it('idempotente: aplicarlo dos veces no cambia nada más', () => {
    expect(construirFormasEnAs(despues).cambiados).toEqual([])
  })
})
it('respeta los fines de línea del nodo (CRLF sigue CRLF)', () => {
  const js = flujo('PQdIgbuFexuBsoh8').nodes.find((n) => n.name === '④ Chequeos')!.parameters.jsCode!.split('\n').join('\r\n')
  const r = conFormasEnAs(js)
  expect(r.includes('VERBOS_SOLO_VOSEO')).toBe(true)
  expect(r.split('\r\n').join('').includes('\n')).toBe(false)
})
