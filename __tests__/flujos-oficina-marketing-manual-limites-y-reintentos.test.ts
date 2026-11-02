/**
 * 02-nov · ADENDA «límites al máximo» + corte a los 5 min. Garantías: toda llamada a un empleado espera hasta el máximo de la plataforma (800 s) y reintenta UNA vez si la conexión se pierde
 * (el punto de control devuelve lo ya escrito, sin cobrar de nuevo); un fallo que no es de conexión NO se reintenta (no se paga dos veces por un error real); los topes de gasto no se tocan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { esLlamadaAEmpleado, ESPERA_MAXIMA_MS, INTENTOS } from '../scripts/ops/oficina-marketing/limites-y-reintentos-manual.mjs'
import { EQUIPO } from '../scripts/ops/oficina-marketing/secciones-nuevas-y-mesa-manual.mjs'

const raiz = path.resolve(__dirname, '..', 'scripts/ops/oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(raiz, 'nuevo/ssLtwYPt7zxuvnM2.json'), 'utf8'))
const codigoDe = (n: string) => nuevo.nodes.find((x: any) => x.name === n).parameters.jsCode as string

async function aportes(responder: (agent: string, intento: number) => any) {
  const intentos: Record<string, number> = {}; const esperas: number[] = []
  const httpRequest = async (o: { timeout: number; body: { agent: string } }) => {
    esperas.push(o.timeout); intentos[o.body.agent] = (intentos[o.body.agent] || 0) + 1
    const r = responder(o.body.agent, intentos[o.body.agent]); if (r instanceof Error) throw r; return r
  }
  const $ = () => ({ first: () => ({ json: { client_id: 'c-1' } }) })
  const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigoDe(EQUIPO.aportes))
  const out = (await fn.call({ helpers: { httpRequest } }, $, { brand_book_draft: { ...DRAFT }, _grounding_refs: GROUNDING, _fidelity_cycle: 1 }, { ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k' }, { id: '777' })) as Array<{ json: any }>
  return { out: out[0].json, intentos, esperas }
}
const buena = (agent: string) => agent === 'content-creator'
  ? sec({ valores: ['Frescura [propuesta del agente — razón]'], nunca_hace: ['Nunca esconde el origen [propuesta del agente — razón]'] })
  : sec({ historia_y_origen: 'Cocinan con pescado del día [propuesta del agente — razón]' })

describe('nodos HTTP que llaman a un empleado', () => {
  const llamadas = nuevo.nodes.filter(esLlamadaAEmpleado)
  it('hay llamadas y TODAS esperan el máximo y reintentan una vez a los 5 s', () => {
    expect(llamadas.length).toBeGreaterThanOrEqual(7)
    for (const n of llamadas) {
      expect(n.parameters.options.timeout).toBe(ESPERA_MAXIMA_MS)
      expect(n.retryOnFail).toBe(true); expect(n.maxTries).toBe(INTENTOS); expect(n.waitBetweenTries).toBe(5000)
    }
  })
  it('el reintento solo está en las llamadas a empleados (las lecturas y el guardado no cambian)', () => {
    const otros = nuevo.nodes.filter((n: any) => n.type === 'n8n-nodes-base.httpRequest' && !esLlamadaAEmpleado(n))
    expect(otros.length).toBeGreaterThan(0)
    for (const n of otros) expect(n.retryOnFail).toBeUndefined()
  })
  it('la espera máxima es la de la plataforma (800 s)', () => { expect(ESPERA_MAXIMA_MS).toBe(800000) })
})

describe('llamadas del equipo nuevo', () => {
  it('las hacen nodos HTTP (800 s + un reintento), no nodos de código: n8n corta una tarea de código a los 120 s', () => {
    for (const n of Object.values(EQUIPO)) {
      const http = nuevo.nodes.find((x: any) => x.name === n + ' · llamar')
      expect(http.type).toBe('n8n-nodes-base.httpRequest')
      expect(http.parameters.options.timeout).toBe(ESPERA_MAXIMA_MS)
      expect(http.retryOnFail).toBe(true); expect(http.maxTries).toBe(INTENTOS)
      const c = codigoDe(n) + codigoDe(n + ' · preparar')
      expect(c.includes('httpRequest') || c.includes('240000')).toBe(false)
    }
  })
  it('si la conexión se pierde y n8n agota los reintentos, el nodo sigue con el resto (continueRegularOutput)', () => {
    for (const n of Object.values(EQUIPO)) expect(nuevo.nodes.find((x: any) => x.name === n + ' · llamar').onError).toBe('continueRegularOutput')
  })
})
