/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · el flujo «Oficina · un turno» (`bTbWL9lUvQCfStAz`) reconoce `esperar_dueno`.
 * Base = la copia aplicada del 11-nov (igual al vivo, comparada nodo a nodo el 16-nov con `n8n-flujo.mjs diferencia`: «iguales: true»).
 * Se EJECUTA el nodo tocado con las respuestas reales de la oficina: la espera del dueño termina sin error y sin ítems; lo desconocido se sigue deteniendo.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { id: string; nodes: Nodo[]; connections: Record<string, unknown> }
const DIR = join(resolve(__dirname, '..', '..', '..', '..'), 'scripts', 'ops', 'oficina-marketing')
const BASE = join(DIR, 'aplicado', 'bTbWL9lUvQCfStAz-corte-nuestro-2026-11-11.json')
const PUBLICADO = join(DIR, 'aplicado', 'bTbWL9lUvQCfStAz-turno-del-dueno-2026-11-16.json')
const base = (): Flujo => JSON.parse(readFileSync(BASE, 'utf8'))
let construir: (f: Flujo) => number
let NODO: string
let NUEVO: Flujo

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const ENTRADA = { encargo_id: '11111111-1111-4111-8111-111111111111' }
async function correr(f: Flujo, respuesta: unknown): Promise<unknown> {
  const n = f.nodes.find((x) => x.name === NODO)!
  const fn = new AsyncFunction('$input', '$', '$workflow', n.parameters.jsCode)
  return fn({ first: () => ({ json: respuesta }) }, () => ({ first: () => ({ json: ENTRADA }) }), { id: 'bTbWL9lUvQCfStAz' })
}

beforeAll(async () => {
  const m = await import(/* @vite-ignore */ pathToFileURL(join(DIR, 'turno-del-dueno.mjs')).href)
  construir = m.construirTurnoDelDueno
  NODO = m.NODO
  NUEVO = JSON.parse(readFileSync(PUBLICADO, 'utf8'))
})

describe('el cambio del flujo · mínimo, idempotente, compila', () => {
  it('🔴 cambia SOLO «③ ¿Y ahora?»; las conexiones y los demás nodos quedan iguales', () => {
    const b = base()
    const cambiados = NUEVO.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(b.nodes.find((x) => x.name === n.name))).map((n) => n.name)
    expect(cambiados).toEqual([NODO])
    expect(NUEVO.nodes.map((n) => n.name)).toEqual(b.nodes.map((n) => n.name))
    expect(JSON.stringify(NUEVO.connections)).toBe(JSON.stringify(b.connections))
  })
  it('🔴 el archivo que se PUBLICA es exactamente construir(base); aplicado dos veces no cambia nada más', () => {
    const construido = base()
    expect(construir(construido)).toBe(1)
    expect(JSON.stringify(NUEVO)).toBe(JSON.stringify(construido))
    expect(construir(construido)).toBe(0)
    expect(JSON.stringify(construido)).toBe(JSON.stringify(NUEVO))
  })
  it('cada nodo Code del flujo nuevo compila', () => {
    for (const n of NUEVO.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) expect(() => new AsyncFunction('$input', '$', '$execution', '$env', '$workflow', n.parameters.jsCode), n.name).not.toThrow()
  })
})

describe('«③ ¿Y ahora?» con las respuestas reales de la oficina', () => {
  it('🔴 `esperar_dueno` → termina SIN error y SIN ítems (nada se despierta); en la base, ANTES del cambio, se detenía con error', async () => {
    const r = { statusCode: 200, body: { accion: 'esperar_dueno', ronda: 1, turno: { n: 6, paso: 'aprobar_propuestas', tipo: 'dueno' } } }
    expect(await correr(NUEVO, r)).toEqual([])
    await expect(correr(base(), r)).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
  })
  it('la reentrega del dueño (`reentrega: true`) tampoco despierta nada', async () => {
    expect(await correr(NUEVO, { statusCode: 200, body: { accion: 'esperar_dueno', reentrega: true, turno: { n: 6, tipo: 'dueno' } } })).toEqual([])
  })
  it('lo de antes sigue igual: `esperar` despierta el turno siguiente; una acción desconocida se DETIENE', async () => {
    expect(await correr(NUEVO, { statusCode: 200, body: { accion: 'esperar', turno: { n: 7 } } })).toEqual([{ json: { ruta: 'esperar', turno_body: { encargo_id: ENTRADA.encargo_id, turno: { n: 7 } } } }])
    expect(await correr(NUEVO, { statusCode: 200, body: { accion: 'esperar_jefatura' } })).toEqual([])
    await expect(correr(NUEVO, { statusCode: 200, body: { accion: 'esperar_otra_cosa' } })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
    await expect(correr(NUEVO, { statusCode: 409, body: { accion: 'esperar_dueno' } })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
  })
})
