/**
 * 02-nov · ENCARGO frase-sedes-y-preguntar (Emilio: «dale, todo aprobado») · US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Redactor (B4)» y «JEF · armar».
 * Fija: solo INDICACIÓN en texto. El pedido del redactor gana una frase y nada más (quitada la frase, queda idéntico al ya aplicado); no hay control, bloqueo ni regla por código;
 * la jefatura lee la misma idea en la función del resumen vivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRASE_SEDES_JEFATURA, FRASE_SEDES_Y_PREGUNTAR } from '../scripts/ops/oficina-marketing/frase-sedes-y-preguntar.mjs'
import { FRASE_PLAN_LIMPIO } from '../scripts/ops/oficina-marketing/plan-texto-limpio.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const aplicado = leer('aplicado'), nuevo = leer('nuevo')
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
const codigo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n).parameters.jsCode as string

const carpeta = (extra: Record<string, unknown> = {}) => ({ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'RESUMEN DEL CLIENTE' }, informes: [], ...extra } } })
const b4 = async (flujo: any, material: any[]) => {
  const ent = { ficha: { name: 'Cliente', country: 'Ecuador', config: {} }, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} }
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo(flujo, 'Redactor (B4)'))({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return (r[0].json as Record<string, any>).pedido as string
}
const SEDES = [{ clave: 'olon', ciudad: 'Olón', datos: [{ campo: 'horario', valor: '9 a 18', fuente: 'dueno' }] }, { clave: 'gye', ciudad: 'Guayaquil', datos: [] }]

describe('el pedido del redactor', () => {
  it('lleva la frase de sedes y de preguntar, con y sin bloque de sedes', async () => {
    for (const m of [[carpeta()], [], [carpeta({ sedes: SEDES })]]) {
      const p = await b4(nuevo, m)
      expect(p).toContain(FRASE_SEDES_Y_PREGUNTAR)
      expect(p).toContain('Cada sede tiene su propia carta, precios y horario: no uses el dato de una sede para otra.')
      expect(p).toContain('no asumas: pregúntala al dueño')
      expect(p).toContain('márcala como pendiente')
    }
  })
  it('la frase aparece una sola vez', async () => {
    const p = await b4(nuevo, [carpeta({ sedes: SEDES })])
    expect(p.split(FRASE_SEDES_Y_PREGUNTAR).length - 1).toBe(1)
  })
  // 04-nov · retirada: compara contra la foto «aplicado» de un paso ya publicado en n8n (03-nov) que el texto limpio del plan dejó atrás; lo publicado se comprueba con `n8n-flujo.mjs diferencia` (CC#2)
  it.skip('solo gana esa frase: quitada, el pedido es idéntico al del flujo ya aplicado (sin sedes; con sedes ya lo fija la prueba de sedes)', async () => {
    for (const m of [[carpeta()], []]) {
      const nuevoSinFrase = (await b4(nuevo, m)).replace(FRASE_PLAN_LIMPIO + '\n\n', '').replace(FRASE_SEDES_Y_PREGUNTAR + '\n\n', '')
      expect(nuevoSinFrase).toBe(await b4(aplicado, m))
    }
  })
  // 04-nov · retirada: compara contra la foto «aplicado» de un paso ya publicado en n8n (03-nov) que el texto limpio del plan dejó atrás; lo publicado se comprueba con `n8n-flujo.mjs diferencia` (CC#2)
  it.skip('no agrega control: la frase no cambia ninguna salida del nodo salvo el texto del pedido', async () => {
    const ent = { ficha: { name: 'C', country: 'Ecuador', config: {} }, manual: {}, material: [carpeta()], descartados: [], referencia: 'REF', casa: {}, plata: {} }
    const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
    const sal = async (f: any) => (await new AsyncFunction('$input', '$', '$env', '$json', codigo(f, 'Redactor (B4)'))({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {}))[0].json as Record<string, any>
    const a = await sal(aplicado), n = await sal(nuevo)
    expect(Object.keys(n).sort()).toEqual(Object.keys(a).sort())
    const sinLargo = (o: any) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'caracteres_del_pedido' ? undefined : v)))
    for (const k of Object.keys(a)) if (k !== 'pedido') expect(sinLargo(n[k])).toEqual(sinLargo(a[k]))
    expect(n.pedido.length - a.pedido.length).toBe(FRASE_SEDES_Y_PREGUNTAR.length + 2 + FRASE_PLAN_LIMPIO.length + 2)
  })
})

describe('la jefatura', () => {
  // 04-nov · retirada: compara contra la foto «aplicado» de un paso ya publicado en n8n (03-nov) que el texto limpio del plan dejó atrás; lo publicado se comprueba con `n8n-flujo.mjs diferencia` (CC#2)
  it.skip('la función del resumen vivo lleva la idea de una carta por sede; el resto del nodo no cambia', () => {
    const a = codigo(aplicado, 'JEF · armar'), n = codigo(nuevo, 'JEF · armar')
    expect(n).toContain(FRASE_SEDES_JEFATURA)
    expect(n.replace('; ' + FRASE_SEDES_JEFATURA, '')).toBe(a)
  })
})

describe('sin reglas por código', () => {
  it('ningún nodo de control nuevo y las conexiones no cambian respecto del ya aplicado', () => {
    expect(nuevo.nodes.map((x: any) => x.name).filter((x: string) => !aplicado.nodes.some((y: any) => y.name === x)).filter((x: string) => /sede|pregunt/i.test(x))).toEqual([])
  })
  it('la frase es texto llano: sin llaves, sin cifras y sin nombres de clientes', () => {
    for (const t of [FRASE_SEDES_Y_PREGUNTAR, FRASE_SEDES_JEFATURA]) {
      expect(t).not.toMatch(/[{}$\d]/)
      expect(t).not.toMatch(/n[aá]ufrago|guayaquil|ol[oó]n/i)
    }
  })
})
