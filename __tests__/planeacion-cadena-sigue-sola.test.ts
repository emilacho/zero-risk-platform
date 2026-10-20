/**
 * LA PLANEACIÓN NO SE DETIENE POR DRIVE (CC#2 · 20-oct · parte 3 del encargo «limpiar y arreglar», corregida por Emilio 14:47). US$ 0 · sin red · sin modelo.
 * Recorre el GRAFO del flujo de planeación preparado (el de antes = el vivo):
 *  ANTES: con la credencial de Google caducada (sin PDF) la rama terminaba en la campana y nunca corrían el cable de vuelta a la sala, el sobre del brief ni el cierre de la corrida (ejecución real 186281);
 *  AHORA: la campana avisa Y la corrida sigue. Nadie nuevo interviene: no se agrega ninguna espera ni ningún punto humano.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main?: Array<Array<{ node: string }>> }> }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const antes = leer('planeacion-ANTES-cadena-sigue-sola-2026-10-20.json')
const nuevo = leer('planeacion-ARREGLADO-cadena-sigue-sola-2026-10-20.json')

const CAMPANA = 'Campana · plan sin PDF', CABLE = 'Cable de vuelta · sala', BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const CIERRE = 'V9 · cerrar la corrida', SIN_PDF = 'Armar el aviso · sin PDF', HAY_PDF = 'IF · ¿hay PDF?', VOLVIO = 'Cable · ¿volvió? · plan'

/** los nodos a los que se llega desde `desde` saliendo por la salida `salida` (si se da) y siguiendo todas las demás */
function alcanzables(f: Flujo, desde: string, salida?: number): Set<string> {
  const visto = new Set<string>(); const pila: string[] = []
  for (const [i, o] of (f.connections[desde]?.main ?? []).entries()) if (salida === undefined || i === salida) for (const t of o) pila.push(t.node)
  while (pila.length) {
    const n = pila.pop()!; if (visto.has(n)) continue; visto.add(n)
    for (const o of f.connections[n]?.main ?? []) for (const t of o) pila.push(t.node)
  }
  return visto
}

describe('Drive fuera del camino crítico', () => {
  it('ANTES: la rama «sin PDF» terminaba en la campana y nunca llegaba al cable, al brief ni al cierre (lo medido en la ejecución 186281)', () => {
    const r = alcanzables(antes, HAY_PDF, 1)
    expect([...r].sort()).toEqual([CAMPANA, SIN_PDF].sort())
    expect(r.has(CABLE)).toBe(false); expect(r.has(BRIEF)).toBe(false); expect(r.has(CIERRE)).toBe(false)
  })
  it('AHORA: la rama «sin PDF» avisa por Slack Y sigue al cable de vuelta, al sobre del brief y al cierre de la corrida', () => {
    const r = alcanzables(nuevo, HAY_PDF, 1)
    for (const n of [SIN_PDF, CAMPANA, CABLE, VOLVIO, BRIEF, CIERRE]) expect(r.has(n), n).toBe(true)
  })
  it('la rama «con PDF» llega a lo mismo que antes (el camino bueno no se rompe)', () => {
    const a = alcanzables(antes, HAY_PDF, 0); const n = alcanzables(nuevo, HAY_PDF, 0)
    for (const x of a) expect(n.has(x), x).toBe(true)
  })
  it('la alarma «sin PDF» se conserva: el aviso y la campana siguen conectados, y la campana ahora entrega al cable', () => {
    expect(nuevo.connections[SIN_PDF]?.main?.[0]?.[0]?.node).toBe(CAMPANA); expect(nuevo.connections[CAMPANA]?.main?.[0]?.[0]?.node).toBe(CABLE)
  })
  it('el cable de vuelta NO depende del PDF: su cuerpo no lee ningún dato de Drive (si lo leyera, la rama «sin PDF» llegaría con un cuerpo roto)', () => {
    const cuerpo = String(nuevo.nodes.find((n) => n.name === CABLE)!.parameters.jsonBody)
    expect(cuerpo).not.toMatch(/Drive|file_id|pdf/i)
  })
})

describe('lo que cambia en el flujo: solo lo previsto', () => {
  it('ningún nodo cambia y UNA sola conexión (la de la campana); nadie espera a nadie', async () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    expect(antes.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(nuevo.nodes[i])).map((n) => n.name)).toEqual([])
    const claves = new Set([...Object.keys(antes.connections), ...Object.keys(nuevo.connections)])
    expect([...claves].filter((k) => JSON.stringify(antes.connections[k]) !== JSON.stringify(nuevo.connections[k]))).toEqual([CAMPANA])
    expect(nuevo.nodes.some((n) => n.type.endsWith('.wait'))).toBe(antes.nodes.some((n) => n.type.endsWith('.wait'))) // no se agregó ninguna espera
  })
  it('el constructor, aplicado al flujo de antes, reproduce el preparado byte a byte (el linaje no se pierde) y no se aplica dos veces', async () => {
    const { construirFlujo } = await import('../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-cadena-sigue-sola-2026-10-20.mjs')
    expect(JSON.stringify(construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => construirFlujo(nuevo)).toThrow(/ya trae salida/)
  })
  it('no lleva llaves pegadas', () => { expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/) })
})
