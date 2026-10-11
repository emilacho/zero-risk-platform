/**
 * r66 · la llave de despacho de la sala NO viaja en la salida de ningún nodo (queda en los datos de ejecución de n8n).
 * Rojo: los tres flujos de la oficina (respaldo ANTES, tal como estaban vivos) la copian a su salida. Verde: ninguno; los nodos HTTP la toman de `$env` al enviar.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construir, llavesEnSalida, ENV_LLAVE, FLUJOS } from '../scripts/worker-staging/llave-sala-r66/construir.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { name: string; nodes: Nodo[]; connections: unknown; settings?: Record<string, unknown>; active?: boolean }
const DIR = 'scripts/worker-staging/llave-sala-r66'
const leer = (p: string) => JSON.parse(fs.readFileSync(`${DIR}/${p}`, 'utf8')) as Flujo
const CLAVES = Object.keys(FLUJOS) as Array<keyof typeof FLUJOS>
const LLAVE = 'LLAVE-DE-PRUEBA-0123456789'
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const correr = (flujo: Flujo, nodo: string, input: unknown, extra: Record<string, unknown> = {}) => {
  const code = flujo.nodes.find((n) => n.name === nodo)!.parameters.jsCode as string
  const $ = (n: string) => ({ first: () => ({ json: extra[n] }) })
  return new Function('$input', '$', '$env', '$workflow', code)({ first: () => ({ json: input }) }, $, { SALA_DISPATCH_KEY: LLAVE }, { id: 'wf' }) as Array<{ json: any }>
}

describe.each(CLAVES)('%s', (k) => {
  const antes = leer(`${k}-ANTES-2026-10-11-r66.json`)
  const despues = construir(antes).flujo as Flujo
  it('rojo: tal como estaba vivo, algún nodo copia la llave a su salida', () => {
    expect(llavesEnSalida(antes).length).toBeGreaterThan(0)
  })
  it('verde: ningún nodo la deja en su salida; los nodos HTTP la toman de $env al enviar', () => {
    expect(llavesEnSalida(despues)).toEqual([])
    const http = despues.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && JSON.stringify(n.parameters).includes('x-sala-dispatch-key'))
    expect(http.length).toBeGreaterThan(0)
    for (const n of http) expect(JSON.stringify(n.parameters)).toContain(`"x-sala-dispatch-key","value":"=${ENV_LLAVE}"`)
  })
  it('solo cambian los nodos previstos; conexiones, ajustes permitidos y el resto de nodos, idénticos', () => {
    const cambiados = despues.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n) => n.name)
    expect(cambiados.length).toBeGreaterThan(1)
    expect(despues.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
  })
})

describe('los nodos que reciben la llave siguen validándola y ya no la devuelven', () => {
  const puerta = construir(leer('puerta-ANTES-2026-10-11-r66.json')).flujo as Flujo
  const turno = construir(leer('turno-ANTES-2026-10-11-r66.json')).flujo as Flujo
  it('puerta · «⓪ Sobre · llave»: llave correcta ⇒ pasa sin llevarla; incorrecta, ausente o motor sin llave ⇒ se detiene', () => {
    const buena = correr(puerta, '⓪ Sobre · llave', { headers: { 'x-sala-dispatch-key': LLAVE }, body: { familia: 'f', client_id: 'x' } })
    expect(JSON.stringify(buena)).not.toContain(LLAVE); expect(buena[0].json).not.toHaveProperty('llave'); expect(buena[0].json.tiene_familia).toBe(true)
    expect(() => correr(puerta, '⓪ Sobre · llave', { headers: { 'x-sala-dispatch-key': LLAVE + 'x' }, body: {} })).toThrow(/PROCEDENCIA_INVALIDA/)
    expect(() => correr(puerta, '⓪ Sobre · llave', { headers: {}, body: {} })).toThrow(/PROCEDENCIA_INVALIDA/)
  })
  it('turno · «⓪ Entrada · llave»: igual', () => {
    const code = turno.nodes.find((n) => n.name === '⓪ Entrada · llave')!.parameters.jsCode as string
    expect(code).not.toMatch(/llave:\s*recibida/)
    expect(code).toMatch(/charCodeAt/) // la comparación sigue
  })
  it('vigía · «① Qué hacer con cada pendiente»: los ítems salen sin llave', () => {
    const vigia = construir(leer('vigia-ANTES-2026-10-11-r66.json')).flujo as Flujo
    const out = correr(vigia, '① Qué hacer con cada pendiente', { statusCode: 200, body: { accion: 'vigilado', reanudar: ['e1'], cierres: [] } })
    expect(out).toHaveLength(1); expect(JSON.stringify(out)).not.toContain(LLAVE); expect(out[0].json).not.toHaveProperty('llave')
  })
})

describe('el respaldo ANTES es el vivo de ayer y el ARREGLADO es lo que construye el script', () => {
  it.each(CLAVES)('%s: el archivo ARREGLADO coincide con construir(ANTES)', (k) => {
    const hecho = leer(`${k}-ARREGLADO-2026-10-11-r66.json`)
    expect(JSON.stringify(hecho)).toBe(JSON.stringify(construir(leer(`${k}-ANTES-2026-10-11-r66.json`)).flujo))
  })
  it('ninguna llave real quedó escrita en los archivos', () => {
    for (const k of CLAVES) for (const s of ['ANTES', 'ARREGLADO']) expect(fs.readFileSync(`${DIR}/${k}-${s}-2026-10-11-r66.json`, 'utf8')).not.toMatch(/x-sala-dispatch-key["']?\s*:\s*["'][A-Za-z0-9_-]{16,}["']/)
  })
})
