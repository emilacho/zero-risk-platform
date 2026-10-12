/** r78 · el sobre del brief de la planeación ya manda la llave con respaldo (antes: cabecera vacía ⇒ 401) y el arreglo cambia SOLO esa cabecera. */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

type Nodo = { name: string; parameters: { headerParameters?: { parameters: Array<{ name: string; value: string }> } } & Record<string, unknown> }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS', f), 'utf8')) as { nodes: Nodo[] }
const NODO = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'

describe('planeación · sobre del brief', () => {
  const antes = leer('sobre-r78-ANTES.json'), despues = leer('sobre-r78-ARREGLADO.json')
  const llave = (f: { nodes: Nodo[] }) => f.nodes.find((n) => n.name === NODO)!.parameters.headerParameters!.parameters.find((h) => h.name === 'x-api-key')!.value
  it('antes sin respaldo, ahora con el respaldo del sobre del trato cerrado (por entorno, sin pegar ningún valor)', () => {
    expect(llave(antes)).toBe('={{ $env.SALA_INGRESS_API_KEY }}')
    expect(llave(despues)).toBe('={{ $env.SALA_INGRESS_API_KEY || $env.INTERNAL_API_KEY }}')
    expect(JSON.stringify(despues)).not.toMatch(/eyJ|sk-|[0-9a-f]{40}/)
  })
  it('cambia SOLO esa cabecera: el resto de los nodos es idéntico', () => {
    expect(despues.nodes.length).toBe(antes.nodes.length)
    for (const n of antes.nodes) {
      const d = despues.nodes.find((x) => x.name === n.name)!
      if (n.name === NODO) continue
      expect(JSON.stringify(d.parameters), n.name).toBe(JSON.stringify(n.parameters))
    }
  })
})
