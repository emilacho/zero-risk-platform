/**
 * RENOMBRAR EL DISPARADOR DEL RELOJ DEL REPARTIDOR · CC#1 · 2026-09-30 · pedido de CC#3 · costo cero.
 * «Every 3min» ejecutaba cada 15: el rótulo contradecía al código. Cambia SÓLO el nombre (del nodo y de la llave de conexiones).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'repartidor-paquete-2026-09-30')
const foto = JSON.parse(readFileSync(join(DIR, 'reloj-vivo-6fd09a14-2026-09-30.json'), 'utf8'))
const { renombrarDisparador, NOMBRE_VIEJO, NOMBRE_NUEVO } = await import(pathToFileURL(join(DIR, 'renombrar-disparador-2026-09-30.mjs')).href)
const nuevo = renombrarDisparador(foto)

describe('el disparador ya no miente', () => {
  it('🔴 el nombre dice 15 y el cron sigue en */15 · el viejo nombre ya no existe en ninguna parte (nodos ni conexiones)', () => {
    const nodo = nuevo.nodes.find((n: any) => n.name === NOMBRE_NUEVO)
    expect(NOMBRE_NUEVO).toBe('Every 15min')
    expect(nodo.parameters.rule.interval[0].expression).toBe('*/15 * * * *')
    expect(JSON.stringify(nuevo)).not.toContain(NOMBRE_VIEJO)
  })
  it('las conexiones siguen yendo al mismo destino (sólo cambió la llave del origen)', () => {
    expect(nuevo.connections[NOMBRE_NUEVO].main[0][0].node).toBe('Query recent tenants')
    expect(Object.keys(nuevo.connections).sort()).toEqual(['Query recent tenants', 'Unique tenants', NOMBRE_NUEVO].sort())
    for (const k of ['Query recent tenants', 'Unique tenants']) expect(nuevo.connections[k]).toEqual(foto.connections[k])
  })
  it('sólo cambió el nombre: 4 nodos, mismos parámetros, mismos topes', () => {
    expect(nuevo.nodes).toHaveLength(4)
    for (const n of nuevo.nodes) {
      const antes = foto.nodes.find((x: any) => x.name === (n.name === NOMBRE_NUEVO ? NOMBRE_VIEJO : n.name))
      expect(JSON.stringify(n.parameters), n.name).toBe(JSON.stringify(antes.parameters))
    }
    expect(nuevo.settings.executionTimeout).toBe(300)
    expect(Object.keys(nuevo).sort()).toEqual(['connections', 'name', 'nodes', 'settings'])
  })
  it('la prueba PUEDE fallar: si el cron ya no es */15 o el nombre nuevo ya existe, aborta', () => {
    const otra = JSON.parse(JSON.stringify(foto))
    otra.nodes.find((n: any) => n.name === NOMBRE_VIEJO).parameters.rule.interval[0].expression = '*/3 * * * *'
    expect(() => renombrarDisparador(otra)).toThrow(/cada 15/)
    const dup = JSON.parse(JSON.stringify(foto))
    dup.nodes.push({ ...dup.nodes[0], name: NOMBRE_NUEVO })
    expect(() => renombrarDisparador(dup)).toThrow(/ya existe/)
  })
})
