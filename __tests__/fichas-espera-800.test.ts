/**
 * 21-nov · #1260 (GO Lenovo 02:16Z y 02:32Z · CC4) · el lector de fichas `k1IZ5eGfGbUeMQR8` espera al agente 800 000 ms (antes 290 000: cortaba a los 4:50
 * aunque el agente siguiera trabajando en Vercel, que deja 800 s). Se fija sobre el ANTES y el DESPUÉS guardados del vivo:
 *  · el DESPUÉS difiere del ANTES en UN solo valor: el timeout del nodo «② Agente (run-sdk)», de 290 000 a 800 000;
 *  · el cambio puro (`conEspera800`) produce exactamente el DESPUÉS y se niega si el vivo no es el medido;
 *  · la espera nueva no pasa el techo de la ruta del agente (800 s).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ID, NODO, ANTES_MS, DESPUES_MS, conEspera800, cuerpoDelPut } from '../scripts/worker-staging/cadena/fichas-espera-800/preparar.mjs'
import { ESPERA_DE_LA_MISMA_LLAMADA_S } from '../src/lib/cadena/constantes'

const dir = join(__dirname, '..', 'scripts', 'worker-staging', 'cadena', 'fichas-espera-800')
const leer = (n: string) => JSON.parse(readFileSync(join(dir, `${ID}-${n}-2026-11-21.json`), 'utf8'))
type Nodo = { name: string; parameters?: { options?: { timeout?: number } } }

describe('el lector de fichas espera 800 s', () => {
  const antes = leer('ANTES'), despues = leer('DESPUES')
  it('🔴 el ANTES es el lector de fichas con la espera vieja (290 000)', () => {
    expect(ID).toBe('k1IZ5eGfGbUeMQR8')
    expect(antes.id).toBe(ID)
    expect((antes.nodes as Nodo[]).find((n) => n.name === NODO)?.parameters?.options?.timeout).toBe(290000)
  })
  it('🔴 el DESPUÉS cambia SOLO el timeout de «② Agente (run-sdk)» a 800 000', () => {
    expect((despues.nodes as Nodo[]).find((n) => n.name === NODO)?.parameters?.options?.timeout).toBe(800000)
    const sinEspera = (f: { nodes: Nodo[]; connections: unknown }) => JSON.stringify({ n: f.nodes.map((x) => (x.name === NODO ? { ...x, parameters: { ...x.parameters, options: { ...x.parameters?.options, timeout: 0 } } } : x)), c: f.connections })
    expect(sinEspera(despues)).toBe(sinEspera(antes))
  })
  it('🔴 el cambio puro da exactamente el DESPUÉS', () => {
    expect(JSON.stringify(conEspera800(antes).nodes)).toBe(JSON.stringify(despues.nodes))
  })
  it('🔴 el cambio se niega si el vivo no tiene la espera medida (o si el nodo no está)', () => {
    expect(() => conEspera800(despues)).toThrow(/no 290000/)
    expect(() => conEspera800({ ...antes, nodes: (antes.nodes as Nodo[]).filter((n) => n.name !== NODO) })).toThrow(/hay 0/)
  })
  it('🔴 la espera nueva es el techo de la ruta del agente (800 s), no más', () => {
    expect(ANTES_MS).toBe(290000)
    expect(DESPUES_MS).toBe(800 * 1000)
    expect(DESPUES_MS).toBe(ESPERA_DE_LA_MISMA_LLAMADA_S * 1000) // la misma espera con la que el código pone el piso del plazo de la corrida
  })
  it('🔴 el PUT lleva solo lo que n8n acepta', () => {
    expect(Object.keys(cuerpoDelPut(despues)).sort()).toEqual(['connections', 'name', 'nodes', 'settings'])
  })
})
