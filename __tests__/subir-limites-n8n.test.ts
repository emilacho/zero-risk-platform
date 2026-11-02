import { describe, it, expect } from 'vitest'
// @ts-ignore · script de operación en .mjs
import { cambiosDe, aplicarA, MAXIMO_MS } from '../scripts/ops/subir-limites-n8n.mjs'

const http = (name: string, url: string, options?: any) => ({ name, type: 'n8n-nodes-base.httpRequest', parameters: { url, ...(options ? { options } : {}) } })
const flujo = () => ({ nodes: [
  http('baja', 'https://x.test/api/algo', { timeout: 30000 }),
  http('sin tope empleado', 'https://x.test/api/agents/run-sdk'),
  http('sin tope otra', 'https://x.test/api/algo'),
  http('ya al maximo', 'https://x.test/api/algo', { timeout: MAXIMO_MS }),
  { name: 'codigo', type: 'n8n-nodes-base.code', parameters: { jsCode: '1' } },
] })

describe('subir límites de n8n al máximo', () => {
  it('sube la espera baja, pone tope al empleado que no tiene, y no toca el resto', () => {
    const c = cambiosDe(flujo())
    expect(c.map((x: any) => x.nodo).sort()).toEqual(['baja', 'sin tope empleado'])
    expect(c.find((x: any) => x.nodo === 'baja')).toMatchObject({ antes: 30000, despues: MAXIMO_MS })
    expect(c.find((x: any) => x.nodo === 'sin tope empleado').antes).toBeNull()
  })
  it('es idempotente: la segunda pasada no cambia nada', () => {
    const f = aplicarA(flujo())
    expect(cambiosDe(f)).toEqual([])
    expect(f.nodes.find((n: any) => n.name === 'baja').parameters.options.timeout).toBe(MAXIMO_MS)
    expect(f.nodes.find((n: any) => n.name === 'sin tope otra').parameters.options).toBeUndefined()
    expect(f.nodes.length).toBe(5)
  })
  it('nunca baja una espera que ya está al máximo', () => {
    const f = aplicarA(flujo())
    expect(f.nodes.find((n: any) => n.name === 'ya al maximo').parameters.options.timeout).toBe(MAXIMO_MS)
  })
})
