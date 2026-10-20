/**
 * Ronda 74 · Drive: «Crear carpeta si no existe» creaba un archivo «Untitled», no una carpeta (prueba real del 20-oct, hallazgo de CC#3).
 * Causa medida con un eco propio (sin Drive): n8n no manda el cuerpo de un httpRequest 4.2 cuando `sendBody` es una EXPRESIÓN. Las pruebas de r73 evaluaban la expresión como JS (daba true) y no lo vieron.
 * Aquí: `sendBody` literal, un IF explícito, y un nodo que PARA si Drive no devolvió una carpeta. Se ejecuta el código REAL de los nodos de código.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirFlujo, CREAR, HAY, NODOS, MIME_CARPETA, CODIGO_DE_VERIFICAR } from '../scripts/worker-staging/rXR5GmnrGF6Dkwgq/construir-r74-carpeta.mjs'

type Nodo = { id: string; name: string; type: string; position: number[]; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; settings?: unknown }
const leer = (r: string) => JSON.parse(readFileSync(join(process.cwd(), 'scripts/worker-staging', r), 'utf8')) as Flujo
const TEXTO = { antes: leer('rXR5GmnrGF6Dkwgq/texto-a-drive-r74-ANTES.json'), hoy: leer('rXR5GmnrGF6Dkwgq/texto-a-drive-r74-ARREGLADO.json') }
const MANUAL = { antes: leer('XTQTgIUMq9OHNs0a/manual-a-drive-r74-ANTES.json'), hoy: leer('XTQTgIUMq9OHNs0a/manual-a-drive-r74-ARREGLADO.json') }
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
/** corre el código REAL de un nodo de código con $json y $('nodo') simulados */
const correr = async (codigo: string, json: unknown, otros: Record<string, unknown> = {}) => {
  const dolar = (n: string) => ({ first: () => ({ json: otros[n] }) })
  return (await new AsyncFunction('$json', '$', codigo)(json, dolar)) as Array<{ json: Record<string, any> }>
}
const evalua = (expr: string, json: Record<string, unknown>) => new Function('$json', 'return ' + expr.slice(3, -2))(json)

describe.each([['plan (Texto → Drive)', TEXTO], ['manual (Manual → Drive)', MANUAL]])('%s', (_n, F) => {
  it('rojo (antes): el cuerpo de la carpeta dependía de una EXPRESIÓN en sendBody (n8n no la envía) y la carpeta no se comprobaba', () => {
    const p = nodo(F.antes, NODOS.crear).parameters
    expect(typeof p.sendBody).toBe('string'); expect(p.sendBody).toContain('{{')
    expect(F.antes.nodes.some((n) => n.name === NODOS.verificar || n.name === NODOS.hay)).toBe(false)
  })

  it('verde: POST fijo con sendBody LITERAL true, cuerpo de carpeta con su padre, y pide el mimeType', () => {
    const p = nodo(F.hoy, NODOS.crear).parameters
    expect(p).toEqual(CREAR)
    expect(p.sendBody).toBe(true); expect(p.method).toBe('POST'); expect(p.url).toContain('fields=id,mimeType')
    const cuerpo = JSON.parse(evalua(p.jsonBody, { client_name: 'Cliente X' }))
    expect(cuerpo).toEqual({ name: 'Cliente X', mimeType: MIME_CARPETA, parents: ['1WRmkLvj5CMdbohf4T2INsG0hn5Ebl88d'] })
  })

  it('guarda general: NINGÚN httpRequest del flujo lleva sendBody/method como expresión (la raíz del defecto)', () => {
    for (const n of F.hoy.nodes.filter((x) => x.type.endsWith('httpRequest'))) {
      if ('sendBody' in n.parameters) expect(typeof n.parameters.sendBody, n.name).toBe('boolean')
      expect(String(n.parameters.method ?? 'GET').startsWith('='), n.name).toBe(false)
    }
  })

  it('el grafo: buscar → ¿Ya hay carpeta? → (sí) definitiva | (no) crear → verificar → definitiva; y SOLO eso cambió', () => {
    const c = F.hoy.connections
    expect(c[NODOS.buscar].main[0][0].node).toBe(NODOS.hay)
    expect(c[NODOS.hay].main[0][0].node).toBe(NODOS.definitiva); expect(c[NODOS.hay].main[1][0].node).toBe(NODOS.crear)
    expect(c[NODOS.crear].main[0][0].node).toBe(NODOS.verificar); expect(c[NODOS.verificar].main[0][0].node).toBe(NODOS.definitiva)
    expect(nodo(F.hoy, NODOS.hay).parameters).toEqual(HAY)
    const nombresAntes = F.antes.nodes.map((n) => n.name), nombresHoy = F.hoy.nodes.map((n) => n.name)
    expect(nombresHoy.filter((n) => !nombresAntes.includes(n)).sort()).toEqual([NODOS.hay, NODOS.verificar].sort())
    const distintos = F.antes.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(F.hoy, n.name))).map((n) => n.name)
    expect(distintos).toEqual([NODOS.crear])
    const conexionesAntes = Object.keys(F.antes.connections).filter((k) => JSON.stringify(F.antes.connections[k]) !== JSON.stringify(F.hoy.connections[k]))
    expect(conexionesAntes.sort()).toEqual([NODOS.buscar, NODOS.crear].sort())
  })

  it('el IF: con carpeta hallada NO se crea nada; sin carpeta (null, vacío o ausente) sí', () => {
    const e = nodo(F.hoy, NODOS.hay).parameters.conditions.conditions[0].leftValue as string
    expect(evalua(e, { folder_id: 'F1' })).toBe(true)
    for (const sin of [{ folder_id: null }, { folder_id: '' }, {}]) expect(evalua(e, sin)).toBe(false)
  })

  it('se reconstruye igual desde el vivo, no se aplica dos veces y no se aplica a ciegas si el nodo cambió', () => {
    expect(JSON.stringify(construirFlujo(F.antes))).toBe(JSON.stringify(F.hoy))
    expect(() => construirFlujo(F.hoy)).toThrow(/ya tiene el arreglo/)
    const roto = JSON.parse(JSON.stringify(F.antes)) as Flujo; nodo(roto, NODOS.crear).parameters.sendBody = true
    expect(() => construirFlujo(roto)).toThrow(/ya no es el de antes/)
  })
})

describe('«La carpeta es una carpeta»: se ejecuta el código real', () => {
  const codigo = nodo(TEXTO.hoy, NODOS.verificar).parameters.jsCode as string
  const prev = { client_id: 'C1', client_name: 'Cliente X', folder_id: null, texto: 'T' }
  it('el código del flujo es el del constructor (y el del manual, el mismo)', () => {
    expect(codigo).toBe(CODIGO_DE_VERIFICAR); expect(nodo(MANUAL.hoy, NODOS.verificar).parameters.jsCode).toBe(CODIGO_DE_VERIFICAR)
  })
  it('una carpeta de verdad pasa y deja el id donde «Carpeta definitiva» lo busca (con o sin envoltura body)', async () => {
    for (const r of [{ body: { id: 'F9', mimeType: MIME_CARPETA } }, { id: 'F9', mimeType: MIME_CARPETA }]) {
      const [s] = await correr(codigo, r, { [NODOS.buscar]: prev })
      expect(s.json).toMatchObject({ client_id: 'C1', texto: 'T', folder_id: 'F9', id: 'F9', folder_creada: true })
      const [d] = await correr(nodo(TEXTO.hoy, NODOS.definitiva).parameters.jsCode, s.json, { [NODOS.buscar]: prev })
      expect(d.json.folder_id).toBe('F9'); expect(d.json._parar).toBeUndefined()
    }
  })
  it('lo que hizo Drive el 20-oct (un «Untitled» octet-stream) y cualquier respuesta sin carpeta DETIENEN antes de subir nada', async () => {
    for (const r of [{ body: { id: '1jOgWXmY', mimeType: 'application/octet-stream' } }, { body: { id: 'X' } }, { body: { error: { code: 403 } } }, {}, { body: null }]) {
      await expect(correr(codigo, r, { [NODOS.buscar]: prev })).rejects.toThrow(/DRIVE_NO_CREO_CARPETA/)
    }
  })
  it('con carpeta ya hallada «Carpeta definitiva» conserva ese id (el camino del IF por «sí»)', async () => {
    const hallada = { ...prev, folder_id: 'F1', folder_reusada: true }
    const [d] = await correr(nodo(TEXTO.hoy, NODOS.definitiva).parameters.jsCode, hallada, { [NODOS.buscar]: hallada })
    expect(d.json.folder_id).toBe('F1'); expect(d.json._parar).toBeUndefined()
  })
})
