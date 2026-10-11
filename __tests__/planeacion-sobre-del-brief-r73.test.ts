/**
 * Ronda 73 (encargo «sobre del brief») · el nodo «BRIEF · sobre · pedir el parte a la sala» de planeación mandaba `x-api-key: $env.SALA_INGRESS_API_KEY` SIN respaldo ⇒ cabecera vacía ⇒ 401 «missing x-api-key header».
 * Arreglo preparado (y probado), NO aplicado en vivo: ver LISTO-CC2-sobre-del-brief (con la cadena apagada, quitar ese 401 deja que el brief viejo cobre).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirFlujo, NODO, NUEVO, VIEJO } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-sobre-r73.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-sobre-r73-ANTES.json'), 'utf8')) as Flujo
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-sobre-r73-ARREGLADO.json'), 'utf8')) as Flujo
const cab = (f: Flujo) => (f.nodes.find((n) => n.name === NODO)!.parameters.headerParameters.parameters as Array<{ name: string; value: string }>).find((h) => h.name === 'x-api-key')!.value
const evalua = (expr: string, env: Record<string, string | undefined>) => new Function('$env', 'return ' + expr.slice(3, -2))(env)

describe('el sobre del brief de planeación', () => {
  it('rojo (antes): sin SALA_INGRESS_API_KEY en el entorno la cabecera sale vacía ⇒ 401', () => {
    expect(cab(ANTES)).toBe(VIEJO); expect(evalua(cab(ANTES), { INTERNAL_API_KEY: 'k-int' })).toBeUndefined()
  })
  it('verde: la misma llave, por entorno y con el respaldo del sobre del trato cerrado; la propia gana si existe; nunca un valor pegado', () => {
    expect(cab(HOY)).toBe(NUEVO)
    expect(evalua(cab(HOY), { INTERNAL_API_KEY: 'k-int' })).toBe('k-int')
    expect(evalua(cab(HOY), { SALA_INGRESS_API_KEY: 'k-ing', INTERNAL_API_KEY: 'k-int' })).toBe('k-ing')
    expect(cab(HOY)).toMatch(/^=\{\{ \$env\.\w+( \|\| \$env\.\w+)? \}\}$/)
  })
  it('SOLO cambia esa cabecera de ese nodo; conexiones y el resto del flujo idénticos', () => {
    const cambian = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(HOY.nodes.find((x) => x.name === n.name))).map((n) => n.name)
    expect(cambian).toEqual([NODO]); expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
    const sin = (f: Flujo) => JSON.stringify(f.nodes.find((n) => n.name === NODO)!.parameters).replace(/"value":"=\{\{ \$env\.SALA_INGRESS_API_KEY[^"]*\}\}"/, '')
    expect(sin(HOY)).toBe(sin(ANTES))
  })
  it('se reconstruye igual desde el respaldo y no se aplica a ciegas si la cabecera ya cambió', () => {
    expect(JSON.stringify(construirFlujo({ ...ANTES } as any).nodes)).toBe(JSON.stringify(HOY.nodes))
    expect(() => construirFlujo(HOY as any)).toThrow(/ya no es la de antes/)
  })
})
