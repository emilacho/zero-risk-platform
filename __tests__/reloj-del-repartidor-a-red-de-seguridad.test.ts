/**
 * EL RELOJ DEL REPARTIDOR BAJA A RED DE SEGURIDAD · pieza ④ del paquete · CC#1 · 2026-09-30 · costo cero.
 * Lo aprobado: el reloj sigue ENCENDIDO a 15 min, con topes, y NADA más cambió (mismos 4 nodos, mismas conexiones).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'repartidor-paquete-2026-09-30')
const antes = JSON.parse(readFileSync(join(DIR, 'reloj-antes-2026-09-30.json'), 'utf8'))
const { construirReloj } = await import(pathToFileURL(join(DIR, 'construir-reloj-2026-09-30.mjs')).href)
const despues = construirReloj(antes)
const nodo = (w: { nodes: Array<{ name: string; parameters: Record<string, any> }> }, n: string) => w.nodes.find((x) => x.name === n)!

describe('④ el reloj del repartidor · red de seguridad', () => {
  it('🔴 de cada 3 min a cada 15 · sigue siendo un reloj (no desaparece)', () => {
    expect(nodo(antes, 'Every 3min').parameters.rule.interval[0].expression).toBe('*/3 * * * *')
    expect(nodo(despues, 'Every 3min').parameters.rule.interval[0].expression).toBe('*/15 * * * *')
  })
  it('topes: consulta 20 s · llamada al repartidor 75 s (por encima del tope de 60 s de la ruta) · flujo 300 s (por debajo del ciclo de 15 min)', () => {
    expect(nodo(despues, 'Query recent tenants').parameters.options.timeout).toBe(20000)
    expect(nodo(despues, 'Consume tick per tenant').parameters.options.timeout).toBe(75000)
    expect(despues.settings.executionTimeout).toBe(300)
    expect(despues.settings.executionTimeout).toBeLessThan(15 * 60)
    expect(nodo(despues, 'Consume tick per tenant').parameters.options.timeout).toBeGreaterThan(60_000)
  })
  it('sólo cambió lo declarado: 4 nodos, mismas conexiones, el resto de los parámetros idéntico (la respuesta «neverError» se conserva)', () => {
    expect(despues.nodes).toHaveLength(4)
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
    const ma = Object.fromEntries(antes.nodes.map((n: any) => [n.name, JSON.stringify(n.parameters)]))
    expect(despues.nodes.filter((n: any) => ma[n.name] !== JSON.stringify(n.parameters)).map((n: any) => n.name).sort()).toEqual(['Consume tick per tenant', 'Every 3min', 'Query recent tenants'])
    expect(nodo(despues, 'Consume tick per tenant').parameters.options.response.response.neverError).toBe(true)
    expect(nodo(despues, 'Consume tick per tenant').parameters.jsonBody).toBe(nodo(antes, 'Consume tick per tenant').parameters.jsonBody)
    expect(nodo(despues, 'Unique tenants').parameters).toEqual(nodo(antes, 'Unique tenants').parameters)
  })
  it('el cuerpo PUT trae sólo campos permitidos', () => {
    expect(Object.keys(despues).sort()).toEqual(['connections', 'name', 'nodes', 'settings'])
    expect(despues.settings.executionOrder).toBe('v1')
  })
  it('la prueba PUEDE fallar: una foto que ya no es la de cada 3 min aborta la construcción', () => {
    const otra = JSON.parse(JSON.stringify(antes))
    nodo(otra, 'Every 3min').parameters.rule.interval[0].expression = '*/5 * * * *'
    expect(() => construirReloj(otra)).toThrow(/ya no es el de la foto/)
  })
})
