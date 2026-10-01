/**
 * EL FLUJO DE PRUEBA (smoke-test-agent) SIN REINTENTO AUTOMÁTICO · pruebas a costo cero · CC#1 · 2026-10-01.
 * Contra la foto REAL del flujo vivo (versión 5681d0e1): el cambio toca UN solo nodo y nada más, y el constructor se niega si el flujo no tiene la forma medida.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'smoke-sin-reintento-2026-10-01')
const { aplicarSinReintento, nodosCambiados, cuerpoDePut, NODO, VERSION_ESPERADA } = await import(pathToFileURL(join(DIR, 'sin-reintento.mjs')).href)
const FOTO = JSON.parse(readFileSync(join(DIR, 'flujo-vivo-ANTES-5681d0e1.json'), 'utf8'))

describe('el cambio exacto', () => {
  it('la foto es la versión que dice el publicador', () => {
    expect(FOTO.versionId).toBe(VERSION_ESPERADA)
    const n = FOTO.nodes.find((x: { name: string }) => x.name === NODO)
    expect(n).toMatchObject({ retryOnFail: true, maxTries: 3, waitBetweenTries: 30000 })
  })
  it('🔴 apaga el reintento SÓLO en el nodo que paga · lo demás idéntico (nodos, conexiones, ajustes, nombre)', () => {
    const d = aplicarSinReintento(FOTO)
    expect(nodosCambiados(FOTO, d)).toEqual([NODO])
    const n = d.nodes.find((x: { name: string }) => x.name === NODO)
    expect(n.retryOnFail).toBe(false)
    expect('maxTries' in n).toBe(false)
    expect('waitBetweenTries' in n).toBe(false)
    expect(d.connections).toEqual(FOTO.connections)
    expect(d.settings).toEqual(FOTO.settings)
    expect(d.name).toBe(FOTO.name)
    const resto = (f: typeof FOTO) => JSON.stringify(f.nodes.filter((x: { name: string }) => x.name !== NODO))
    expect(resto(d)).toBe(resto(FOTO))
    const sinReintento = (x: Record<string, unknown>) => { const { retryOnFail, maxTries, waitBetweenTries, ...r } = x; void retryOnFail; void maxTries; void waitBetweenTries; return r }
    expect(sinReintento(d.nodes.find((x: { name: string }) => x.name === NODO))).toEqual(sinReintento(FOTO.nodes.find((x: { name: string }) => x.name === NODO)))
  })
  it('no muta la foto de entrada y es idempotente', () => {
    const copia = JSON.stringify(FOTO)
    const d1 = aplicarSinReintento(FOTO)
    expect(JSON.stringify(FOTO)).toBe(copia)
    expect(JSON.stringify(aplicarSinReintento(d1))).toBe(JSON.stringify(d1))
  })
  it('el cuerpo del PUT lleva sólo lo que n8n acepta', () => {
    expect(Object.keys(cuerpoDePut(aplicarSinReintento(FOTO))).sort()).toEqual(['connections', 'name', 'nodes', 'settings'])
  })
})

describe('se niega si el flujo no tiene la forma medida (no adivina)', () => {
  it('sin el nodo · con el nodo repetido · con un nodo que no es HTTP', () => {
    expect(() => aplicarSinReintento({ ...FOTO, nodes: FOTO.nodes.filter((x: { name: string }) => x.name !== NODO) })).toThrow(/exactamente UN nodo/)
    const n = FOTO.nodes.find((x: { name: string }) => x.name === NODO)
    expect(() => aplicarSinReintento({ ...FOTO, nodes: [...FOTO.nodes, { ...n }] })).toThrow(/exactamente UN nodo/)
    expect(() => aplicarSinReintento({ ...FOTO, nodes: FOTO.nodes.map((x: { name: string }) => (x.name === NODO ? { ...x, type: 'n8n-nodes-base.code' } : x)) })).toThrow(/no es un HTTP Request/)
  })
})
