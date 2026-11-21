/**
 * Rotar las credenciales de cabecera de n8n con el valor de Doppler. El n8n vivo SOLO deja crear y leer credenciales (PATCH y DELETE dan 405):
 * se crea una nueva, se apuntan a ella los nodos (con respaldo de cada flujo) y la vieja queda sin uso. Nunca se imprime un valor.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDENCIALES, SUFIJO_NUEVA, cuerpoDeLaNueva, ejecutar, nodosQueLaUsan, planear, repuntar } from '../scripts/ops/rotar-credenciales-n8n.mjs'

type Plan = { clave: string; accion: string; motivo: string }
const VALOR = 'valor-secreto-de-prueba-0123456789'
const ENV = { N8N_BASE_URL: 'https://n8n.test', N8N_API_KEY: 'k', PORTERO_WEBHOOK_KEY: VALOR, HEALTHCHECK_API_KEY: VALOR + '-hc' } as never as Record<string, string>
const lista = [{ id: CREDENCIALES.portero.id, type: 'httpHeaderAuth', name: 'p' }, { id: CREDENCIALES.healthchecks.id, type: 'httpHeaderAuth', name: 'h' }, { id: 'goog', type: 'googleOAuth2Api', name: 'Google account' }]
const nodo = (nombre: string, credId: string, tipo = 'httpHeaderAuth') => ({ name: nombre, type: 'n8n-nodes-base.httpRequest', parameters: {}, credentials: { [tipo]: { id: credId, name: 'x' } } })
const flujosBase = () => [
  { id: 'F1', name: 'f1', active: true, settings: {}, connections: {}, nodes: [nodo('a', CREDENCIALES.portero.id), nodo('b', CREDENCIALES.portero.id), nodo('c', 'otra')] },
  { id: 'F2', name: 'f2', active: false, settings: {}, connections: {}, nodes: [nodo('d', CREDENCIALES.healthchecks.id)] },
  { id: 'F3', name: 'f3', active: true, settings: {}, connections: {}, nodes: [nodo('e', 'otra')] },
]

function n8nFalso(o: { corriendo?: number; fallaPut?: boolean; falloCrear?: boolean; putIgnorado?: boolean } = {}) {
  const flujos = flujosBase().map((f) => JSON.parse(JSON.stringify(f)))
  const llamadas: Array<{ m: string; p: string; body?: any }> = []
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const p = url.replace(/^https?:\/\/[^/]+\/api\/v1/, ''); const body = init.body ? JSON.parse(init.body) : undefined
    llamadas.push({ m: init.method, p, body })
    const ok = (j: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) })
    if (init.method === 'GET' && p === '/credentials') return ok({ data: lista })
    if (init.method === 'GET' && p.startsWith('/workflows?')) return ok({ data: flujos.map(({ id, nodes }) => ({ id, nodes })), nextCursor: null })
    if (init.method === 'GET' && p.startsWith('/executions')) return ok({ data: Array.from({ length: o.corriendo ?? 0 }, (_, i) => ({ id: i })) })
    if (init.method === 'POST' && p === '/credentials') return o.falloCrear ? { ok: false, status: 500, text: async () => 'boom' } : ok({ id: 'NUEVA-' + body.type, name: body.name })
    const m = p.match(/^\/workflows\/([^/]+)$/)
    if (m && init.method === 'GET') return ok(JSON.parse(JSON.stringify(flujos.find((f) => f.id === m[1]))))
    if (m && init.method === 'PUT') { if (o.fallaPut) return { ok: false, status: 400, text: async () => 'mal' }; const f = flujos.find((x) => x.id === m[1])!; if (!o.putIgnorado) f.nodes = body.nodes; return ok({}) }
    if (/\/(de)?activate$/.test(p)) return ok({})
    return { ok: false, status: 404, text: async () => 'no' }
  }
  return { fetchImpl: fetchImpl as never, llamadas, flujos }
}
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'resp-n8n-'))

describe('planear / helpers', () => {
  it('rota las que existen, son del tipo y tienen valor; salta con motivo las demás', () => {
    const p = planear({ PORTERO_WEBHOOK_KEY: VALOR }, lista) as Plan[]
    expect(p.find((x) => x.clave === 'portero')?.accion).toBe('rotar')
    expect(p.find((x) => x.clave === 'healthchecks')?.motivo).toMatch(/HEALTHCHECK_API_KEY/)
    expect((planear(ENV, []) as Plan[]).every((x) => x.accion === 'saltar')).toBe(true)
    expect((planear(ENV, [{ id: CREDENCIALES.portero.id, type: 'googleOAuth2Api', name: 'x' }], 'portero' as never) as Plan[])[0].motivo).toMatch(/tipo/)
    expect(planear(ENV, lista, 'portero' as never)).toHaveLength(1)
  })
  it('el cuerpo de la credencial NUEVA: mismo tipo, cabecera y valor; el nombre lleva el sufijo', () => {
    expect(cuerpoDeLaNueva('portero', VALOR)).toEqual({ name: CREDENCIALES.portero.nombre + SUFIJO_NUEVA, type: 'httpHeaderAuth', data: { name: 'x-portero-key', value: VALOR } })
    expect(cuerpoDeLaNueva('healthchecks', VALOR).data.name).toBe('X-Api-Key')
  })
  it('nodosQueLaUsan / repuntar: solo cambian los nodos de ESA credencial y de ESE tipo; lo demás queda idéntico', () => {
    const f = flujosBase()[0]
    expect(nodosQueLaUsan(f, 'httpHeaderAuth', CREDENCIALES.portero.id)).toHaveLength(2)
    const r = repuntar(f, 'httpHeaderAuth', CREDENCIALES.portero.id, { id: 'N', name: 'nueva' })
    expect(r.cambiados).toBe(2); expect(nodosQueLaUsan(r.flujo, 'httpHeaderAuth', CREDENCIALES.portero.id)).toHaveLength(0)
    expect(r.flujo.nodes[2]).toEqual(f.nodes[2]); expect(r.flujo.nodes[0].credentials.httpHeaderAuth).toEqual({ id: 'N', name: 'nueva' })
    expect(repuntar(f, 'googleOAuth2Api', CREDENCIALES.portero.id, { id: 'N', name: 'x' }).cambiados).toBe(0)
    // otro TIPO de credencial con el mismo id NO cuenta
    const raro = { ...f, nodes: [nodo('g', CREDENCIALES.portero.id, 'googleOAuth2Api')] }
    expect(nodosQueLaUsan(raro, 'httpHeaderAuth', CREDENCIALES.portero.id)).toHaveLength(0)
    expect(repuntar(raro, 'httpHeaderAuth', CREDENCIALES.portero.id, { id: 'N', name: 'x' }).cambiados).toBe(0)
  })
})

describe('ejecutar', () => {
  it('en seco NO escribe nada (ni POST ni PUT) y NO imprime valores; cuenta flujos y nodos', async () => {
    const n = n8nFalso(); const salida: string[] = []
    const r = await ejecutar({ env: ENV as never, aplicar: false, fetchImpl: n.fetchImpl, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(true); expect(n.llamadas.some((l) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(l.m))).toBe(false)
    const t = salida.join('\n'); expect(t).not.toContain(VALOR); expect(t).toMatch(/2 nodo\(s\) en 1 flujo\(s\): F1/); expect(t).toMatch(/1 nodo\(s\) en 1 flujo\(s\): F2/)
  })
  it('aplicar: crea la nueva, apunta los nodos con respaldo, reactiva lo que estaba activo, NO borra ni parchea, y no imprime el valor', async () => {
    const n = n8nFalso(); const c = carpeta(); const salida: string[] = []
    const r = await ejecutar({ env: ENV as never, aplicar: true, respaldos: c, fetchImpl: n.fetchImpl, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(true)
    expect(n.llamadas.some((l) => l.m === 'PATCH' || l.m === 'DELETE')).toBe(false)
    const crear = n.llamadas.filter((l) => l.m === 'POST' && l.p === '/credentials')
    expect(crear).toHaveLength(2); expect(crear[0].body).toEqual({ name: CREDENCIALES.portero.nombre + SUFIJO_NUEVA, type: 'httpHeaderAuth', data: { name: 'x-portero-key', value: VALOR } })
    expect(nodosQueLaUsan(n.flujos[0], 'httpHeaderAuth', CREDENCIALES.portero.id)).toHaveLength(0)
    expect(nodosQueLaUsan(n.flujos[0], 'httpHeaderAuth', 'NUEVA-httpHeaderAuth')).toHaveLength(2)
    expect(n.flujos[0].nodes[2].credentials.httpHeaderAuth.id).toBe('otra'); expect(n.flujos[2].nodes[0].credentials.httpHeaderAuth.id).toBe('otra')   // los ajenos no se tocan
    expect(fs.readdirSync(c).sort()).toEqual(['F1-antes-credencial-portero.json', 'F2-antes-credencial-healthchecks.json'])
    expect(JSON.parse(fs.readFileSync(path.join(c, 'F1-antes-credencial-portero.json'), 'utf8')).nodes[0].credentials.httpHeaderAuth.id).toBe(CREDENCIALES.portero.id)   // el respaldo es el flujo ANTES
    expect(n.llamadas.filter((l) => /\/deactivate$/.test(l.p)).map((l) => l.p)).toEqual(['/workflows/F1/deactivate'])          // F1 estaba activo, F2 no
    expect(salida.join('\n')).not.toContain(VALOR); expect(salida.join('\n')).toMatch(/bórrala a mano en el panel/)
  })
  it('--solo portero no toca Healthchecks', async () => {
    const n = n8nFalso()
    await ejecutar({ env: ENV as never, aplicar: true, solo: 'portero', respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })
    expect(n.llamadas.filter((l) => l.m === 'POST' && l.p === '/credentials')).toHaveLength(1); expect(nodosQueLaUsan(n.flujos[1], 'httpHeaderAuth', CREDENCIALES.healthchecks.id)).toHaveLength(1)
  })
  it('una variable que falta salta esa credencial y sigue con la otra', async () => {
    const n = n8nFalso()
    const r = await ejecutar({ env: { ...ENV, HEALTHCHECK_API_KEY: undefined } as never, aplicar: true, respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })
    expect(r.ok).toBe(true); expect(n.llamadas.filter((l) => l.m === 'POST' && l.p === '/credentials')).toHaveLength(1)
  })
  it('si hay ejecuciones corriendo, no toca nada', async () => {
    const n = n8nFalso({ corriendo: 2 })
    expect((await ejecutar({ env: ENV as never, aplicar: true, respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })).ok).toBe(false)
    expect(n.llamadas.some((l) => ['POST', 'PUT'].includes(l.m))).toBe(false)
  })
  it('--aplicar sin carpeta de respaldos, o con una dentro de la bóveda/OneDrive, se niega', async () => {
    for (const r of [null, 'C:/Users/x/OneDrive/Documents/zr-vault/raw', 'D:/zr-vault/x']) {
      const n = n8nFalso()
      expect((await ejecutar({ env: ENV as never, aplicar: true, respaldos: r as never, fetchImpl: n.fetchImpl, log: () => {} })).ok).toBe(false)
      expect(n.llamadas).toHaveLength(0)
    }
  })
  it('si falla crear la credencial, no se toca ningún flujo', async () => {
    const n = n8nFalso({ falloCrear: true })
    const r = await ejecutar({ env: ENV as never, aplicar: true, respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })
    expect(r.ok).toBe(false); expect(n.llamadas.some((l) => l.m === 'PUT')).toBe(false)
  })
  it('si falla el PUT de un flujo, se reporta error y el flujo sigue con la credencial vieja', async () => {
    const n = n8nFalso({ fallaPut: true })
    const r = await ejecutar({ env: ENV as never, aplicar: true, solo: 'portero', respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })
    expect(r.ok).toBe(false); expect(nodosQueLaUsan(n.flujos[0], 'httpHeaderAuth', CREDENCIALES.portero.id)).toHaveLength(2)
  })
  it('si n8n dice que guardó el flujo pero la lectura de vuelta no lo muestra, falla (no se da por hecho)', async () => {
    const n = n8nFalso({ putIgnorado: true })
    const r = await ejecutar({ env: ENV as never, aplicar: true, solo: 'portero' as never, respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })
    expect(r.ok).toBe(false)
  })
  it('sin N8N_API_KEY no hace nada', async () => {
    const n = n8nFalso()
    expect((await ejecutar({ env: { ...ENV, N8N_API_KEY: '' } as never, aplicar: true, respaldos: carpeta(), fetchImpl: n.fetchImpl, log: () => {} })).ok).toBe(false)
    expect(n.llamadas).toHaveLength(0)
  })
})
