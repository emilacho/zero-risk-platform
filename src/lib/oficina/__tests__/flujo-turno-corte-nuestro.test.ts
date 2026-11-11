/**
 * 11-nov · regla (b) · decisión A · el flujo «Oficina · un turno» (`bTbWL9lUvQCfStAz`) pasa `upstream_status` y `pedido_no_llego` como CAMPOS.
 * Base = la copia aplicada del 10-nov (igual al vivo, comparada nodo a nodo el 11-nov 20:2xZ). Se EJECUTAN los dos nodos tocados con las formas reales que devuelve run-sdk
 * (su 502 arriba, y envuelto por `markInnerBodyAsNotSuccess` cuando llega por el callback) y lo que sale se lleva a la regla de la oficina (`corteNuestroDeLaVuelta`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { markInnerBodyAsNotSuccess } from '@/app/api/agents/run-sdk/route'
import { corteNuestroDeLaVuelta, type ResultadoDeTurno } from '../orquestador'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { id: string; nodes: Nodo[]; connections: Record<string, unknown> }
const DIR = join(resolve(__dirname, '..', '..', '..', '..'), 'scripts', 'ops', 'oficina-marketing')
const BASE = join(DIR, 'aplicado', 'bTbWL9lUvQCfStAz-llave-del-acuse-2026-11-10.json')
const PUBLICADO = join(DIR, 'aplicado', 'bTbWL9lUvQCfStAz-corte-nuestro-2026-11-11.json')
let construir: (f: Flujo) => number
const base = (): Flujo => JSON.parse(readFileSync(BASE, 'utf8'))
let NUEVO: Flujo

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const PEDIDO = { encargo_id: '11111111-1111-4111-8111-111111111111', turno: { n: 4 } }
async function correrNodo(f: Flujo, nombre: string, entrada: unknown): Promise<any> {
  const n = f.nodes.find((x) => x.name === nombre)!
  const fn = new AsyncFunction('$input', '$', '$execution', n.parameters.jsCode)
  const out = await fn({ first: () => ({ json: entrada }) }, () => ({ first: () => ({ json: PEDIDO }) }), { id: 'ex-77' })
  return out[0].json
}
/** lo que la ruta de turnos pasa al orquestador desde el cuerpo del flujo */
const comoLaRuta = (b: Record<string, unknown>): ResultadoDeTurno => ({ error: b.error as string, ...(Number.isInteger(b.upstream_status) ? { upstream_status: b.upstream_status as number } : {}), ...(b.pedido_no_llego === true ? { pedido_no_llego: true } : {}) })

beforeAll(async () => {
  construir = (await import(/* @vite-ignore */ pathToFileURL(join(DIR, 'corte-nuestro-turnos.mjs')).href)).construirCorteNuestroTurnos
  // lo que se EJERCE es el archivo que se publica (pedido de CC7 al certificar #1057); la prueba de abajo fija que es exactamente construir(base)
  NUEVO = JSON.parse(readFileSync(PUBLICADO, 'utf8'))
})

describe('el cambio del flujo · mínimo, idempotente, compila', () => {
  it('🔴 cambia SOLO «② ¿Aceptó el pedido?» y «② Vuelta»; las conexiones y los demás nodos quedan iguales', () => {
    const b = base()
    const cambiados = NUEVO.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(b.nodes.find((x) => x.name === n.name))).map((n) => n.name)
    expect(cambiados.sort()).toEqual(['② Vuelta', '② ¿Aceptó el pedido?'].sort())
    expect(NUEVO.nodes.map((n) => n.name)).toEqual(b.nodes.map((n) => n.name))
    expect(JSON.stringify(NUEVO.connections)).toBe(JSON.stringify(b.connections))
  })
  it('🔴 el archivo que se PUBLICA es exactamente construir(base), campo por campo', () => {
    const construido = base()
    expect(construir(construido)).toBe(2)
    expect(NUEVO).toEqual(construido)
    expect(JSON.stringify(NUEVO)).toBe(JSON.stringify(construido))
  })
  it('🔴 aplicado dos veces no cambia nada más (devuelve 0)', () => {
    const otra = JSON.parse(JSON.stringify(NUEVO)) as Flujo
    expect(construir(otra)).toBe(0)
    expect(JSON.stringify(otra)).toBe(JSON.stringify(NUEVO))
  })
  it('🔴 cada nodo Code del flujo nuevo compila', () => {
    for (const n of NUEVO.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) expect(() => new AsyncFunction('$input', '$', '$execution', '$env', n.parameters.jsCode), n.name).not.toThrow()
  })
})

describe('«② ¿Aceptó el pedido?» ejecutado', () => {
  it('🔴 el HTTP a run-sdk falló (n8n entrega `error` OBJETO) ⇒ `pedido_no_llego: true` y la oficina marca `pedido_no_llego`', async () => {
    const j = await correrNodo(NUEVO, '② ¿Aceptó el pedido?', { error: { message: 'timeout of 800000ms exceeded' } })
    expect(j.aceptado).toBe(false)
    expect(j.resultado_body).toMatchObject({ pedido_no_llego: true, error: expect.stringContaining('OFICINA_PEDIDO_NO_LLEGO') })
    expect(corteNuestroDeLaVuelta(comoLaRuta(j.resultado_body))).toBe('pedido_no_llego')
  })
  it('🔴 un rechazo de run-sdk con `upstream_status` lo pasa; uno sin él, no (la oficina no marca)', async () => {
    const con = await correrNodo(NUEVO, '② ¿Aceptó el pedido?', { body: { error: 'agent-runner not configured', upstream_status: 0 } })
    expect(con.resultado_body.upstream_status).toBe(0)
    expect(corteNuestroDeLaVuelta(comoLaRuta(con.resultado_body))).toBe('corredor_caido')
    const sin = await correrNodo(NUEVO, '② ¿Aceptó el pedido?', { body: { error: 'workflow_id_required', code: 'E-WF' } })
    expect(sin.resultado_body).not.toHaveProperty('upstream_status')
    expect(sin.resultado_body).not.toHaveProperty('pedido_no_llego')
    expect(corteNuestroDeLaVuelta(comoLaRuta(sin.resultado_body))).toBeUndefined()
  })
  it('🔴 aceptado ⇒ igual que antes', async () => {
    expect(await correrNodo(NUEVO, '② ¿Aceptó el pedido?', { body: { accepted: true } })).toEqual({ ...PEDIDO, aceptado: true })
  })
  it('🔴 control: el flujo VIEJO no pasa ninguno de los dos campos', async () => {
    const viejo = base()
    expect((await correrNodo(viejo, '② ¿Aceptó el pedido?', { error: { message: 't' } })).resultado_body).not.toHaveProperty('pedido_no_llego')
    expect((await correrNodo(viejo, '② ¿Aceptó el pedido?', { body: { error: 'x', upstream_status: 0 } })).resultado_body).not.toHaveProperty('upstream_status')
  })
})

describe('«② Vuelta» ejecutada con las formas reales de run-sdk', () => {
  it('🔴 la vuelta por callback: el 502 del corredor llega ENVUELTO en `inner` (también el 200 del redespliegue) ⇒ pasa su código y la oficina marca', async () => {
    for (const s of [200, 0, 502, 503]) {
      const cuerpo = markInnerBodyAsNotSuccess({ error: 'agent-runner upstream failed', upstream_status: s })
      const j = await correrNodo(NUEVO, '② Vuelta', { body: cuerpo })
      expect(j.resultado_body).toMatchObject({ upstream_status: s, error: 'el agente FALLÓ · agent-runner upstream failed' })
      expect(corteNuestroDeLaVuelta(comoLaRuta(j.resultado_body))).toBe('corredor_caido')
    }
  })
  it('🔴 el 502 ARRIBA (`success:false` con `upstream_status`) también pasa', async () => {
    const j = await correrNodo(NUEVO, '② Vuelta', { body: { success: false, error: 'agent-runner upstream failed', upstream_status: 502 } })
    expect(j.resultado_body.upstream_status).toBe(502)
  })
  it('🔴 un fallo del propio empleado o una conexión perdida SIN código no pasan nada (cuentan como intento)', async () => {
    for (const cuerpo of [{ success: false, error: 'el modelo devolvió JSON inválido', error_kind: 'runner_run_failed' }, markInnerBodyAsNotSuccess({ error: 'terminated' }), { success: false, error: 'x', upstream_status: '502' }, { success: false, error: 'x', inner: { upstream_status: 1.5 } }]) {
      const j = await correrNodo(NUEVO, '② Vuelta', { body: cuerpo })
      expect(j.resultado_body).not.toHaveProperty('upstream_status')
      expect(corteNuestroDeLaVuelta(comoLaRuta(j.resultado_body))).toBeUndefined()
    }
  })
  it('🔴 una vuelta buena queda igual que en el flujo viejo (ni campos nuevos ni cambios)', async () => {
    const buena = { body: { success: true, response: 'texto del agente', cost_usd: 0.12, tokens_in: 10, tokens_out: 20, upstream_status: 200 } }
    expect(await correrNodo(NUEVO, '② Vuelta', buena)).toEqual(await correrNodo(base(), '② Vuelta', buena))
  })
})
