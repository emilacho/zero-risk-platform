/**
 * 04-nov · volver a pegar P21 tras #907 («Lo que no hacemos»). En seco (US$ 0): parte de un flujo con el módulo VIEJO, tal como está el vivo.
 */
import fs from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirMesaDeEstrategia } from '../scripts/ops/oficina-marketing/plan-mesa-de-estrategia.mjs'
import { construirPlanContraElActa, repegarPlanContraElActa, MODULO_ACTA, NODOS_DEL_ACTA } from '../scripts/ops/oficina-marketing/plan-contra-el-acta.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
const J = JSON.parse(fs.readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-calendario-2026-11-04.json'), 'utf8'))
const NUEVA = 'hare|haremos|hacemos|hagamos|vamos'
const VIEJA = 'hare|haremos|vamos'
const CRLF = String.fromCharCode(13, 10)
const LF = String.fromCharCode(10)
const cod = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!.parameters.jsCode as string
const conModuloNuevo = () => { const f = structuredClone(J.workflow || J) as Flujo; construirMesaDeEstrategia(f); construirPlanContraElActa(f); return f }
const conModuloViejo = () => {
  const f = conModuloNuevo()
  for (const n of NODOS_DEL_ACTA) { const x = f.nodes.find((y) => y.name === n)!; x.parameters.jsCode = x.parameters.jsCode.replace(NUEVA, VIEJA) }
  return f
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

describe('P21 · volver a pegar el módulo', () => {
  it('deja el flujo idéntico al que nace con el módulo nuevo, y el punto de partida sí era distinto', () => {
    const viejo = conModuloViejo()
    expect(viejo).not.toEqual(conModuloNuevo())
    for (const n of NODOS_DEL_ACTA) expect(cod(viejo, n)).not.toContain(NUEVA)
    repegarPlanContraElActa(viejo)
    expect(viejo).toEqual(conModuloNuevo())
  })

  it('el módulo queda una sola vez, con su marca P21 una sola vez, y los 3 nodos compilan', () => {
    const f = conModuloViejo()
    repegarPlanContraElActa(f)
    for (const n of NODOS_DEL_ACTA) {
      const c = cod(f, n)
      expect(c.split('function _planContraElActa(').length).toBe(2)
      expect(c.split(LF + '  var _acta = _planContraElActa(t, ctx)').length + c.split(CRLF + '  var _acta = _planContraElActa(t, ctx)').length).toBe(3)
      expect(c).toContain(NUEVA)
      expect(() => new AsyncFunction('$', '$input', '$json', '$runIndex', '$workflow', '$execution', c), n).not.toThrow()
    }
  })

  it('pegar dos veces da lo mismo que pegar una', () => {
    const a = conModuloViejo(); repegarPlanContraElActa(a)
    const b = structuredClone(a); repegarPlanContraElActa(b)
    expect(b).toEqual(a)
  })

  it('respeta un nodo con saltos CRLF: no le deja saltos mezclados', () => {
    const f = conModuloViejo()
    const x = f.nodes.find((y) => y.name === NODOS_DEL_ACTA[0])!
    x.parameters.jsCode = x.parameters.jsCode.split(CRLF).join(LF).split(LF).join(CRLF)
    repegarPlanContraElActa(f)
    expect(x.parameters.jsCode).toContain(MODULO_ACTA.split(LF).join(CRLF))
    expect(x.parameters.jsCode.split(CRLF).join('').includes(LF)).toBe(false)
  })

  it('se detiene si un nodo no lleva el módulo o lo lleva dos veces', () => {
    const sin = conModuloViejo()
    const a = sin.nodes.find((y) => y.name === NODOS_DEL_ACTA[1])!
    a.parameters.jsCode = a.parameters.jsCode.replace('// 04-nov · EL PLAN CONTRA EL ACTA DE LA MESA', '// otra cosa')
    expect(() => repegarPlanContraElActa(sin)).toThrow(/exactamente una vez/)
    const doble = conModuloViejo()
    const b = doble.nodes.find((y) => y.name === NODOS_DEL_ACTA[2])!
    b.parameters.jsCode = MODULO_ACTA + b.parameters.jsCode
    expect(() => repegarPlanContraElActa(doble)).toThrow(/exactamente una vez/)
  })
})
