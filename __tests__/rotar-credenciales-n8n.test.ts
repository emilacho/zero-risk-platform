/** Rotar las credenciales de cabecera de n8n con el valor de Doppler: por id (los flujos no se tocan), sin imprimir valores, y saltando lo que no está listo. */
import { describe, expect, it } from 'vitest'
import { CREDENCIALES, cuerpoDelCambio, ejecutar, planear } from '../scripts/ops/rotar-credenciales-n8n.mjs'

const lista = [{ id: CREDENCIALES.portero.id, type: 'httpHeaderAuth', name: 'x' }, { id: CREDENCIALES.healthchecks.id, type: 'httpHeaderAuth', name: 'y' }, { id: 'goog', type: 'googleOAuth2Api', name: 'Google account' }]
const VALOR = 'valor-secreto-de-prueba-0123456789'

function n8nFalso(existentes = lista, o: { fallaPatch?: boolean; desapareceTrasPatch?: boolean } = {}) {
  const llamadas: Array<{ m: string; p: string; body?: unknown }> = []
  let parchado = false
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const p = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '')
    llamadas.push({ m: init.method, p, body: init.body ? JSON.parse(init.body) : undefined })
    if (init.method === 'PATCH') { if (o.fallaPatch) return { ok: false, status: 500, text: async () => 'boom' }; parchado = true; return { ok: true, status: 200, text: async () => '{}' } }
    const data = parchado && o.desapareceTrasPatch ? [] : existentes
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) }
  }
  return { fetchImpl: fetchImpl as never, llamadas }
}
type Plan = { clave: string; accion: string; motivo: string }
const ENV = { N8N_BASE_URL: 'https://n8n.test', N8N_API_KEY: 'k', PORTERO_WEBHOOK_KEY: VALOR, HEALTHCHECK_API_KEY: VALOR + '-hc' } as never as Record<string, string>

describe('planear', () => {
  it('rota las que existen, son del tipo y tienen valor; salta con motivo las demás', () => {
    const p = planear({ PORTERO_WEBHOOK_KEY: VALOR }, lista) as Plan[]
    expect(p.find((x) => x.clave === 'portero')?.accion).toBe('rotar')
    const hc = p.find((x) => x.clave === 'healthchecks')
    expect(hc?.accion).toBe('saltar'); expect(hc?.motivo).toMatch(/HEALTHCHECK_API_KEY/)
  })
  it('salta si la credencial no existe o si el tipo no es el esperado', () => {
    expect((planear(ENV, []) as Plan[]).every((x) => x.accion === 'saltar')).toBe(true)
    expect((planear(ENV, [{ id: CREDENCIALES.portero.id, type: 'googleOAuth2Api', name: 'x' }], 'portero' as never) as Plan[])[0].motivo).toMatch(/tipo/)
  })
  it('--solo limita a una', () => {
    expect(planear(ENV, lista, 'portero' as never)).toHaveLength(1)
  })
})

describe('cuerpoDelCambio', () => {
  it('lleva SOLO la cabecera y el valor (no cambia el nombre ni el tipo)', () => {
    expect(cuerpoDelCambio('portero', VALOR)).toEqual({ data: { name: 'x-portero-key', value: VALOR } })
    expect(cuerpoDelCambio('healthchecks', VALOR)).toEqual({ data: { name: 'X-Api-Key', value: VALOR } })
  })
})

describe('ejecutar', () => {
  it('en seco NO hace ninguna escritura y NO imprime valores', async () => {
    const n = n8nFalso(); const salida: string[] = []
    const r = await ejecutar({ env: ENV as never, aplicar: false, fetchImpl: n.fetchImpl, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(true); expect(n.llamadas.some((l) => l.m === 'PATCH')).toBe(false)
    expect(salida.join('\n')).not.toContain(VALOR); expect(salida.join('\n')).toMatch(/SECO/)
  })
  it('aplicar: PATCH por id con el cuerpo mínimo, lectura de vuelta, y el valor nunca se imprime', async () => {
    const n = n8nFalso(); const salida: string[] = []
    const r = await ejecutar({ env: ENV as never, aplicar: true, fetchImpl: n.fetchImpl, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(true)
    const patches = n.llamadas.filter((l) => l.m === 'PATCH')
    expect(patches.map((p) => p.p).sort()).toEqual([`/credentials/${CREDENCIALES.healthchecks.id}`, `/credentials/${CREDENCIALES.portero.id}`].sort())
    expect(patches.find((p) => p.p.endsWith(CREDENCIALES.portero.id))?.body).toEqual({ data: { name: 'x-portero-key', value: VALOR } })
    expect(salida.join('\n')).not.toContain(VALOR)
  })
  it('--solo portero no toca la otra', async () => {
    const n = n8nFalso()
    await ejecutar({ env: ENV as never, aplicar: true, solo: 'portero' as never, fetchImpl: n.fetchImpl, log: () => {} })
    expect(n.llamadas.filter((l) => l.m === 'PATCH')).toHaveLength(1)
  })
  it('una variable que falta salta esa credencial y sigue con la otra', async () => {
    const n = n8nFalso()
    const r = await ejecutar({ env: { ...ENV, HEALTHCHECK_API_KEY: undefined } as never, aplicar: true, fetchImpl: n.fetchImpl, log: () => {} })
    expect(r.ok).toBe(true); expect(n.llamadas.filter((l) => l.m === 'PATCH')).toHaveLength(1)
  })
  it('un fallo del PATCH se reporta (ok=false) y no se da por cambiada', async () => {
    const n = n8nFalso(lista, { fallaPatch: true }); const salida: string[] = []
    const r = await ejecutar({ env: ENV as never, aplicar: true, fetchImpl: n.fetchImpl, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(false); expect(salida.join('\n')).not.toContain('✔')
  })
  it('si tras el cambio la credencial desaparece de la lista, falla', async () => {
    const n = n8nFalso(lista, { desapareceTrasPatch: true })
    expect((await ejecutar({ env: ENV as never, aplicar: true, solo: 'portero' as never, fetchImpl: n.fetchImpl, log: () => {} })).ok).toBe(false)
  })
  it('sin N8N_API_KEY no hace nada', async () => {
    const n = n8nFalso()
    expect((await ejecutar({ env: { ...ENV, N8N_API_KEY: '' } as never, aplicar: true, fetchImpl: n.fetchImpl, log: () => {} })).ok).toBe(false)
    expect(n.llamadas).toHaveLength(0)
  })
})
