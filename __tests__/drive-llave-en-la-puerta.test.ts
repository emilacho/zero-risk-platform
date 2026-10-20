/**
 * Las dos puertas de Drive (texto-a-drive · manual-a-drive) estaban SIN llave: cualquiera con la dirección creaba carpetas y PDF en «Cuentas» (hallazgo de CC#3, 20-oct).
 * Aquí: (1) se EJECUTA el código real de la puerta con la llave buena, mala, ausente y con el motor sin llave; (2) cada flujo cambia SOLO lo previsto
 * (la puerta nueva o la cabecera del llamador); (3) quienes llaman mandan la llave desde el entorno, nunca escrita; (4) el Cimiento no la manda al eco de la plataforma.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODIGO_LLAVE } from '../scripts/worker-staging/llave-drive-2026-10-20/construir-llave-drive.mjs'

type Nodo = { id: string; name: string; type: string; position: number[]; parameters: Record<string, any> }
type Flujo = { id: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const D = 'scripts/worker-staging/llave-drive-2026-10-20/'
const leer = (n: string) => JSON.parse(readFileSync(join(process.cwd(), D, n), 'utf8')) as Flujo
const par = (id: string) => ({ antes: leer(`${id}-ANTES.json`), hoy: leer(`${id}-ARREGLADO.json`) })
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const CAB = 'x-sala-dispatch-key'

/** corre el código REAL de la puerta con $input y $env simulados */
const puerta = (headers: unknown, env: Record<string, string> | undefined, codigo = CODIGO_LLAVE) => {
  const item = { json: { headers, body: { client_id: 'c1' } } }
  const entrada = { first: () => item, all: () => [item] }
  return new Function('$input', '$env', codigo)(entrada, env ?? {}) as Array<{ json: any }>
}

describe('la puerta (código real)', () => {
  const ENV = { SALA_DISPATCH_KEY: 'k'.repeat(48) }
  it('con la llave buena deja pasar el pedido intacto', () => {
    const r = puerta({ [CAB]: ENV.SALA_DISPATCH_KEY, 'content-type': 'application/json' }, ENV)
    expect(r).toHaveLength(1); expect(r[0].json.body.client_id).toBe('c1')
  })
  it('sin cabecera, con cabecera vacía o sin headers: se detiene', () => {
    for (const h of [{}, { [CAB]: '' }, undefined, null, 'x', { 'x-api-key': ENV.SALA_DISPATCH_KEY }]) expect(() => puerta(h, ENV)).toThrow(/DRIVE_PROCEDENCIA_INVALIDA/)
  })
  it('llave equivocada: mismo largo, más corta, más larga, con el prefijo bueno, con espacios o mayúsculas', () => {
    const buena = ENV.SALA_DISPATCH_KEY
    for (const mala of ['j'.repeat(48), 'k'.repeat(47), 'k'.repeat(49), buena.slice(0, 47) + 'x', ' ' + buena, buena + ' ', 'K'.repeat(48)]) expect(() => puerta({ [CAB]: mala }, ENV)).toThrow(/DRIVE_PROCEDENCIA_INVALIDA/)
  })
  it('la diferencia en el ÚLTIMO carácter también se detiene (la comparación recorre todo, no corta en el primero)', () => {
    const buena = ENV.SALA_DISPATCH_KEY
    expect(() => puerta({ [CAB]: buena.slice(0, -1) + 'z' }, ENV)).toThrow(/DRIVE_PROCEDENCIA_INVALIDA/)
    expect(() => puerta({ [CAB]: 'z' + buena.slice(1) }, ENV)).toThrow(/DRIVE_PROCEDENCIA_INVALIDA/)
  })
  it('CERRADO: si el motor no tiene la llave (o solo espacios), nadie pasa, ni mandando vacío', () => {
    for (const env of [undefined, {}, { SALA_DISPATCH_KEY: '' }, { SALA_DISPATCH_KEY: '   ' }]) {
      expect(() => puerta({ [CAB]: '' }, env)).toThrow(/DRIVE_CERRADO/)
      expect(() => puerta({ [CAB]: 'cualquiera' }, env)).toThrow(/DRIVE_CERRADO/)
    }
  })
  it('el mensaje de rechazo no enseña qué mandar (ni imprime la llave del motor)', () => {
    try { puerta({ [CAB]: 'mala' }, ENV); throw new Error('no se detuvo') } catch (e) { expect(String((e as Error).message)).not.toContain(ENV.SALA_DISPATCH_KEY) }
    expect(CODIGO_LLAVE).not.toMatch(/console\.|\$env\.SALA_DISPATCH_KEY\s*[,)]\s*$/m)
  })
})

describe.each([['rXR5GmnrGF6Dkwgq', 'Leer el pedido', 'zero-risk/texto-a-drive'], ['XTQTgIUMq9OHNs0a', 'Pedir el manual LIMPIO', 'zero-risk/manual-a-drive']])('puerta %s', (id, primero, ruta) => {
  const { antes, hoy } = par(id)
  const wh = hoy.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')!
  it('es la puerta que se esperaba y nada más: UN nodo nuevo, nada quitado ni cambiado', () => {
    expect(wh.parameters.path).toBe(ruta)
    const a = new Map(antes.nodes.map((n) => [n.name, JSON.stringify(n)])); const h = new Map(hoy.nodes.map((n) => [n.name, JSON.stringify(n)]))
    expect([...h.keys()].filter((k) => !a.has(k))).toEqual(['⓪ Llave · Drive'])
    expect([...a.keys()].filter((k) => !h.has(k))).toEqual([])
    expect([...a.entries()].filter(([k, v]) => h.get(k) !== v)).toEqual([])
  })
  it('el webhook ya NO llega al primer nodo directo: pasa por la llave, y la llave sigue al primer nodo de siempre', () => {
    expect(hoy.connections[wh.name].main[0]).toEqual([{ node: '⓪ Llave · Drive', type: 'main', index: 0 }])
    expect(hoy.connections['⓪ Llave · Drive'].main[0].map((c) => c.node)).toEqual([primero])
    expect(antes.connections[wh.name].main[0].map((c) => c.node)).toEqual([primero])
  })
  it('ningún camino rodea la llave: el único nodo que recibe del webhook es la llave', () => {
    const quienesLoReciben = Object.entries(hoy.connections).filter(([, c]) => c.main.flat().some((x) => x.node === primero)).map(([k]) => k)
    expect(quienesLoReciben).toEqual(['⓪ Llave · Drive'])
    expect(Object.values(hoy.connections).flatMap((c) => c.main.flat()).filter((x) => x.node === '⓪ Llave · Drive')).toHaveLength(1)
  })
  it('el nodo de la puerta lleva el código oficial y la llave NO está escrita en el flujo', () => {
    expect(nodo(hoy, '⓪ Llave · Drive').parameters.jsCode).toBe(CODIGO_LLAVE)
    expect(JSON.stringify(hoy)).not.toMatch(/[0-9a-f]{32,}|eyJ[\w-]{20,}|sk-[\w-]{20,}/)
  })
})

const LLAMADORES: Array<[string, string, string]> = [
  ['X9F0zp6LQ2xGEYVS', 'Plan → Drive (PDF)', 'planeación'],
  ['PQdIgbuFexuBsoh8', '⑤ Parte a Drive', 'brief'],
  ['BNXqlaX1oHSfZIpF', '⑤ Parte a Drive', 'cadena (parte por filas)'],
  ['aTLEk64o1BFAindd', 'PDF a Drive', 'manual · propuesta del agente'],
  ['ssLtwYPt7zxuvnM2', '[BB] Manual → Drive (PDF)', 'cimiento'],
]
describe.each(LLAMADORES)('llamador %s · «%s» (%s)', (id, nombre, _q) => {
  const { antes, hoy } = par(id)
  const cab = (f: Flujo) => (nodo(f, nombre).parameters.headerParameters?.parameters ?? []) as Array<{ name: string; value: string }>
  it('cambia SOLO ese nodo y solo en las cabeceras', () => {
    const a = new Map(antes.nodes.map((n) => [n.name, n])); const cambiados = hoy.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(a.get(n.name)))
    expect(cambiados.map((n) => n.name)).toEqual([nombre])
    expect(hoy.nodes).toHaveLength(antes.nodes.length)
    expect(JSON.stringify(hoy.connections)).toBe(JSON.stringify(antes.connections))
    const { sendHeaders: _s, headerParameters: _h, ...resto } = nodo(hoy, nombre).parameters; const { sendHeaders: _s2, headerParameters: _h2, ...restoAntes } = nodo(antes, nombre).parameters
    expect(resto).toEqual(restoAntes)
  })
  it('manda la cabecera de la llave desde el entorno (una sola vez) y conserva las cabeceras que ya tenía', () => {
    expect(nodo(hoy, nombre).parameters.sendHeaders).toBe(true)
    const nuevas = cab(hoy).filter((p) => p.name === CAB); expect(nuevas).toHaveLength(1)
    expect(nuevas[0].value).toContain('$env.SALA_DISPATCH_KEY')
    for (const p of cab(antes)) expect(cab(hoy)).toContainEqual(p)
    expect(cab(antes).some((p) => p.name === CAB)).toBe(false)
  })
})

describe('el Cimiento no manda la llave a otro destino', () => {
  const { hoy } = par('ssLtwYPt7zxuvnM2'); const n = nodo(hoy, '[BB] Manual → Drive (PDF)')
  const v = (dry: boolean) => new Function('$', 'return ' + n.parameters.headerParameters.parameters.find((p: any) => p.name === CAB).value.slice(3, -2))
  const valor = (dry: boolean, env: Record<string, string>) => new Function('$', '$env', 'return ' + n.parameters.headerParameters.parameters.find((p: any) => p.name === CAB).value.slice(3, -2))(() => ({ first: () => ({ json: { dry_run: dry } }) }), env)
  it('en dry_run (el pedido va al eco de la plataforma) la cabecera va VACÍA; en real lleva la llave', () => {
    expect(v(true)).toBeTypeOf('function')
    expect(valor(true, { SALA_DISPATCH_KEY: 'LLAVE' })).toBe('')
    expect(valor(false, { SALA_DISPATCH_KEY: 'LLAVE' })).toBe('LLAVE')
  })
  it('la URL de destino sigue siendo la misma expresión (eco en seco · puerta de n8n en real)', () => {
    expect(n.parameters.url).toContain('/api/dry-run/eco'); expect(n.parameters.url).toContain('/webhook/zero-risk/manual-a-drive')
  })
})

describe('todos los llamadores ACTIVOS conocidos están cubiertos', () => {
  it('cada nodo HTTP de los 7 flujos que apunta a una puerta de Drive manda la cabecera (no hay un llamador olvidado dentro de ellos)', () => {
    for (const id of ['rXR5GmnrGF6Dkwgq', 'XTQTgIUMq9OHNs0a', ...LLAMADORES.map((l) => l[0])]) {
      const { hoy } = par(id)
      for (const n of hoy.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest' && /texto-a-drive|manual-a-drive/.test(JSON.stringify(x.parameters.url)))) {
        const cab = (n.parameters.headerParameters?.parameters ?? []) as Array<{ name: string }>
        expect(cab.some((p) => p.name === CAB), `${id} · ${n.name}`).toBe(true)
      }
    }
  })
})
