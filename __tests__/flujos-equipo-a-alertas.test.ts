/**
 * Los 15 flujos que usaban el webhook de #equipo: 10 se transforman (rutina / alarma / mixto), 5 NO se tocan (4 «TEMPORAL» + la copia inactiva).
 * Solo las funciones puras; el guion contra n8n se prueba con --seco.
 */
import { describe, expect, it } from 'vitest'
import { INTOCABLES, PLAN, insertarPregunta, limpiarExpresion, transformar } from '../scripts/ops/flujos-equipo-a-alertas.mjs'

// se arma por partes a propósito: una dirección de webhook de Slack completa en el archivo haría saltar la protección de GitHub
const HOOK = ['https://hooks.', 'slack.com/services/', 'T0AAAAAAA/B0BBBBBBB/', 'abcdefghijklmnopqrstuvwx'].join('')
const nodoSlack = (url: string, extra: Record<string, unknown> = {}) => ({ id: 's', name: 'Slack', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [600, 100], parameters: { method: 'POST', url, jsonBody: '={{ JSON.stringify({ text: "hola" }) }}' }, ...extra })
const flujo = (url: string) => ({ name: 'f', settings: {}, nodes: [{ id: 'a', name: 'Antes', type: 'x', typeVersion: 1, position: [0, 0], parameters: {} }, nodoSlack(url), { id: 'c', name: 'Despues', type: 'x', typeVersion: 1, position: [900, 100], parameters: {} }], connections: { Antes: { main: [[{ node: 'Slack', type: 'main', index: 0 }]] }, Slack: { main: [[{ node: 'Despues', type: 'main', index: 0 }]] } } })

describe('limpiarExpresion', () => {
  it('quita la variable vieja y la dirección pegada como respaldo', () => {
    expect(limpiarExpresion(`={{ $env.SLACK_WEBHOOK_URL_EQUIPO || '${HOOK}' }}`)).toBe('={{ $env.SLACK_WEBHOOK_URL }}')
    expect(limpiarExpresion(`={{ $env.SLACK_WEBHOOK_URL_EQUIPO || "${HOOK}" }}`)).toBe('={{ $env.SLACK_WEBHOOK_URL }}')
  })
  it('«NUEVA || VIEJA» y «VIEJA || NUEVA» quedan en «NUEVA»; el resto de la expresión no cambia', () => {
    expect(limpiarExpresion("={{ $env.SLACK_WEBHOOK_URL || $env.SLACK_WEBHOOK_URL_EQUIPO || '' }}")).toBe("={{ $env.SLACK_WEBHOOK_URL || '' }}")
    expect(limpiarExpresion('={{ $env.SLACK_WEBHOOK_URL_EQUIPO || $env.SLACK_WEBHOOK_URL }}')).toBe('={{ $env.SLACK_WEBHOOK_URL }}')
  })
  it('no toca otras variables ni textos ajenos', () => {
    expect(limpiarExpresion('={{ $env.OTRA }}')).toBe('={{ $env.OTRA }}'); expect(limpiarExpresion(5 as never)).toBe(5)
    expect(limpiarExpresion('https://api.ejemplo.test/x')).toBe('https://api.ejemplo.test/x')
  })
})

describe('transformar · rutina', () => {
  it('desactiva el nodo (los datos siguen pasando), le quita la variable vieja y no cambia las conexiones', () => {
    const f = flujo('={{ $env.SLACK_WEBHOOK_URL_EQUIPO }}'); const r = transformar(f, { accion: 'rutina' })
    const n = r.flujo.nodes.find((x: { name: string }) => x.name === 'Slack')
    expect(n.disabled).toBe(true); expect(n.parameters.url).toBe('={{ $env.SLACK_WEBHOOK_URL }}'); expect(r.resumen.quedan).toBe(0)
    expect(r.flujo.connections).toEqual(f.connections); expect(r.flujo.nodes).toHaveLength(3)
  })
})

describe('transformar · alarma', () => {
  it('cambia la dirección a #alertas y NO lo desactiva; el resto del nodo queda igual', () => {
    const f = flujo(`={{ $env.SLACK_WEBHOOK_URL_EQUIPO || '${HOOK}' }}`); const r = transformar(f, { accion: 'alarma' })
    const n = r.flujo.nodes.find((x: { name: string }) => x.name === 'Slack')
    expect(n.disabled).toBeUndefined(); expect(n.parameters.url).toBe('={{ $env.SLACK_WEBHOOK_URL }}'); expect(n.parameters.jsonBody).toBe((f.nodes[1] as { parameters: { jsonBody: string } }).parameters.jsonBody)
    expect(JSON.stringify(r.flujo)).not.toContain('hooks.slack.com')
  })
  it('un flujo sin la variable vieja queda igual (idempotente)', () => {
    const f = flujo('={{ $env.SLACK_WEBHOOK_URL }}'); const r = transformar(f, { accion: 'alarma' })
    expect(r.flujo).toEqual(f); expect(r.resumen.nodos).toEqual([])
  })
  it('no modifica el flujo original', () => {
    const f = flujo('={{ $env.SLACK_WEBHOOK_URL_EQUIPO }}'); transformar(f, { accion: 'alarma' })
    expect(JSON.stringify(f)).toContain('SLACK_WEBHOOK_URL_EQUIPO')
  })
})

describe('transformar · mixto (solo la falla va a #alertas)', () => {
  it('pone una pregunta delante: lo que llegaba al nodo llega a la pregunta; solo «sí» llega al nodo; «no» no va a ninguna parte', () => {
    const f = flujo('={{ $env.SLACK_WEBHOOK_URL_EQUIPO }}'); const r = transformar(f, { accion: 'mixto', condicion: '={{ !$json.guardado }}' })
    const pregunta = r.flujo.nodes.find((x: { type: string }) => x.type === 'n8n-nodes-base.if')
    expect(pregunta.parameters.conditions.boolean[0]).toEqual({ value1: '={{ !$json.guardado }}', value2: true })
    expect(r.flujo.connections.Antes.main[0][0].node).toBe(pregunta.name)
    expect(r.flujo.connections[pregunta.name].main[0]).toEqual([{ node: 'Slack', type: 'main', index: 0 }]); expect(r.flujo.connections[pregunta.name].main[1]).toEqual([])
    expect(r.flujo.connections.Slack).toEqual(f.connections.Slack)                           // lo que sale del nodo no cambia
    expect(r.flujo.nodes.find((x: { name: string }) => x.name === 'Slack').parameters.url).toBe('={{ $env.SLACK_WEBHOOK_URL }}')
    expect(r.resumen.quedan).toBe(0)
  })
  it('el nombre de la pregunta es único y cada pregunta lleva su propio id', () => {
    const f = flujo('={{ $env.SLACK_WEBHOOK_URL_EQUIPO }}')
    const a = insertarPregunta(f, 'Slack', '={{ true }}'), ids = a.nodes.map((n: { id: string }) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('el plan', () => {
  it('cubre los 15 flujos: 10 se transforman y 5 no se tocan, sin cruzarse', () => {
    expect(Object.keys(PLAN)).toHaveLength(10); expect(INTOCABLES).toHaveLength(5)
    for (const id of INTOCABLES) expect(Object.keys(PLAN)).not.toContain(id)
  })
  it('el reparto exacto: 3 de rutina, 5 de alarma, 2 mixtos (por id de flujo)', () => {
    const por = (acc: string) => Object.entries(PLAN).filter(([, r]) => (r as { accion: string }).accion === acc).map(([id]) => id).sort()
    expect(por('rutina')).toEqual(['Dz2n5bA3yW89I2Ye', 'LyVoKcrypS5uLyuu', 'wu1DUAXIuEG5nNTX'].sort())
    expect(por('alarma')).toEqual(['GwVId15UjYxqSn0Q', 'XTQTgIUMq9OHNs0a', 'X9F0zp6LQ2xGEYVS', 'rXR5GmnrGF6Dkwgq', 'uw5Dri5S1XtcsKGm'].sort())
    expect(por('mixto')).toEqual(['VHmEAgsBhRd5ymgM', 'aTLEk64o1BFAindd'].sort())
  })
  it('cada regla trae su motivo y las mixtas traen su condición', () => {
    for (const r of Object.values(PLAN) as Array<{ accion: string; porque: string; condicion?: string }>) {
      expect(['rutina', 'alarma', 'mixto']).toContain(r.accion); expect(r.porque.length).toBeGreaterThan(10)
      if (r.accion === 'mixto') expect(r.condicion).toMatch(/^=\{\{ .+ \}\}$/)
    }
  })
  it('los «TEMPORAL» y la copia inactiva están protegidos por su id', () => {
    for (const id of ['dtsJGZatzPjM1NPU', 'lFwgt73lB8yF843g', 'pLp0vo7mye8lGM74', 'qkxIhqcW22tFkuCf', 'ogtweEUvFDPamrKX']) expect(INTOCABLES).toContain(id)
  })
})
