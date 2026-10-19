/**
 * Cableado entre flujos de n8n (CC#3 · 19-oct): un flujo ENCENDIDO que llama a un webhook cuyo flujo está apagado o no existe es un enlace roto. Puro, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { cableado, rutasQueAtiende, rutasQueLlama } from '../scripts/ops/cableado-n8n.mjs'

type Nodo = { type: string; name: string; parameters: Record<string, unknown> }
type Flujo = { id: string; name: string; active: boolean; nodes: Nodo[] }
const webhook = (path: string): Nodo => ({ type: 'n8n-nodes-base.webhook', name: 'Webhook', parameters: { path } })
const http = (url: string, name = 'Llamar'): Nodo => ({ type: 'n8n-nodes-base.httpRequest', name, parameters: { url } })
const flujo = (id: string, active: boolean, nodes: Nodo[]): Flujo => ({ id, name: 'flujo ' + id, active, nodes })
const BASE = "={{ ($env.N8N_WEBHOOK_BASE || 'https://n8n.test/webhook').replace(/\\/+$/, '') }}"

describe('qué atiende y qué llama un flujo', () => {
  it('atiende las rutas de sus webhooks, con o sin el prefijo zero-risk/', () => {
    expect(rutasQueAtiende(flujo('a', true, [webhook('zero-risk/oficina'), webhook('/Otra/')]))).toEqual(['oficina', 'otra'])
  })
  it('llama a la ruta que aparece después de zero-risk/ en cualquier nodo que no sea su entrada (también armada con una expresión)', () => {
    const f = flujo('a', true, [webhook('zero-risk/oficina'), http(BASE + '/zero-risk/oficina-turno', 'Turno · arrancar'), http('https://n8n.test/webhook/zero-risk/cadena-parte')])
    const r = rutasQueLlama(f)
    expect([...r.keys()].sort()).toEqual(['cadena-parte', 'oficina-turno'])
    expect(r.get('oficina-turno')).toBe('Turno · arrancar')
  })
  it('una dirección de la API de la plataforma no es un webhook de n8n', () => {
    expect([...rutasQueLlama(flujo('a', true, [http('https://plataforma.test/api/zero-risk/algo')])).keys()]).toEqual([])
  })
})

describe('enlaces rotos', () => {
  it('🔴 encendido → apagado: roto «flujo_apagado» y dice cuál flujo lo atiende (el corte del calendario → brief)', () => {
    const r = cableado([flujo('puerta', true, [webhook('zero-risk/cadena'), http('https://n8n.test/webhook/zero-risk/cadena-parte')]), flujo('copia', false, [webhook('zero-risk/cadena-parte')])])
    expect(r.rotos).toHaveLength(1)
    expect(r.rotos[0]).toMatchObject({ estado: 'flujo_apagado', ruta: 'cadena-parte', desde: { id: 'puerta' }, hacia: { id: 'copia' } })
  })
  it('🔴 encendido → ruta que nadie atiende: roto «sin_flujo»', () => {
    const r = cableado([flujo('a', true, [http('https://n8n.test/webhook/zero-risk/no-existe')])])
    expect(r.rotos).toMatchObject([{ estado: 'sin_flujo', ruta: 'no-existe', hacia: null }])
  })
  it('encendido → encendido: ok; y con dos flujos para la misma ruta basta que UNO esté encendido', () => {
    const llamador = flujo('a', true, [http('https://n8n.test/webhook/zero-risk/pieza')])
    expect(cableado([llamador, flujo('b', true, [webhook('zero-risk/pieza')])]).rotos).toEqual([])
    const r = cableado([llamador, flujo('b', false, [webhook('zero-risk/pieza')]), flujo('c', true, [webhook('zero-risk/pieza')])])
    expect(r.rotos).toEqual([])
    expect(r.enlaces[0]).toMatchObject({ estado: 'ok', hacia: { id: 'c' } })
  })
  it('quien llama apagado no cuenta (no corre), y la llamada a la ruta propia se ignora', () => {
    expect(cableado([flujo('a', false, [http('https://n8n.test/webhook/zero-risk/x')])]).enlaces).toEqual([])
    expect(cableado([flujo('a', true, [webhook('zero-risk/x'), http('https://n8n.test/webhook/zero-risk/x')])]).enlaces).toEqual([])
  })
  it('cada ruta rota se cuenta una vez por flujo aunque aparezca en varios nodos', () => {
    const f = flujo('a', true, [http('https://n8n.test/webhook/zero-risk/y', 'Uno'), http('https://n8n.test/webhook/zero-risk/y', 'Dos')])
    expect(cableado([f]).rotos).toHaveLength(1)
  })
})
