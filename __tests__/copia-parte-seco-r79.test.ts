/** r79 · D3 · el arreglo de la copia por filas cambia SOLO el nodo «⑤ Seco» y solo para mandar `parte_seco.fila`; la reversa es el ANTES. */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

type Nodo = { name: string; parameters: Record<string, unknown> & { jsCode?: string } }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/worker-staging/cadena', f), 'utf8')) as { nodes: Nodo[]; connections: unknown }
const NODO = '⑤ Seco · lo que se habría escrito'

describe('copia por filas · r79 D3', () => {
  const antes = leer('copia-r79-ANTES.json'), despues = leer('copia-r79-ARREGLADO.json')
  it('cambia solo el nodo ⑤ Seco y las conexiones quedan iguales', () => {
    expect(despues.nodes.length).toBe(antes.nodes.length)
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
    for (const n of antes.nodes) if (n.name !== NODO) expect(JSON.stringify(despues.nodes.find((x) => x.name === n.name)!.parameters), n.name).toBe(JSON.stringify(n.parameters))
  })
  it('el parte seco lleva la fila completa que habría guardado (y antes no)', () => {
    const a = antes.nodes.find((n) => n.name === NODO)!.parameters.jsCode!, d = despues.nodes.find((n) => n.name === NODO)!.parameters.jsCode!
    expect(a).not.toMatch(/parte_seco = \{[^}]*fila:/)
    expect(d).toMatch(/parte_seco = \{ lote: String\(c\.lote \|\| ''\), valido: c\.parte_valido !== false, fila: \{ title: f\.title, content: f\.content, content_text: f\.content_text, producing_agent: f\.producing_agent, provenance_tag: f\.provenance_tag \}/)
    // el resto del nodo (la validación y el veredicto) no se tocó
    expect(d.replace(/fila: \{[^}]*\}, /, '')).toBe(a)
  })
})
