/**
 * OFICINA FINANCIERA · F8 · el flujo `finanzas · conversa` (CC#1 · 14-oct): NUEVO e INACTIVO, mismo molde que F3: llave interna antes de mirar nada, `dry_run` obligatorio y booleano,
 * sin reintentos (un paso paga) y un fallo NUNCA lanza. Lo propio de este flujo: manda SU `workflow_id` real (`$workflow.id`) y su ejecución. Con el n8n en miniatura: US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ACCIONES, construirFlujo, N, RUTA_WEBHOOK, TIMEOUT_MS } from '../scripts/worker-staging/finanzas-conversa/construir-conversa.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Json = Record<string, any>
const salidaFinal = (r: { visitas: Array<{ salida: any[] }> }): any => {
  const v = r.visitas[r.visitas.length - 1]
  if (!v) throw new Error('el flujo no visitó ningún nodo')
  return v.salida[0]
}

const flujo = construirFlujo() as Json
const archivo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts/worker-staging/finanzas-conversa/NUEVO-finanzas-conversa-2026-10-14.json'), 'utf8')) as Json
const ENV = { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'llave-de-prueba' }
const SEMILLA = { rubro: 'x', moneda: 'USD', datos: [] }
const ABRIR = { accion: 'abrir', client_id: 'c1', dry_run: true, semilla: SEMILLA }
const AVANZAR = { accion: 'avanzar', encargo_id: 'enc-1', dry_run: false }
const correrCon = (body: Json, respuesta?: (c: any) => any, headers: Json = { 'x-api-key': 'llave-de-prueba' }, env: Json = ENV) =>
  correr(flujo, { inicio: N.webhook, itemsDeInicio: [{ json: { headers, body } }], http: respuesta ? { [N.llamar]: respuesta } : {}, env })
const NO = () => { throw new Error('no debe llamarse') }

describe('el webhook EXIGE la llave interna antes de mirar nada', () => {
  for (const [nombre, headers, env] of [
    ['sin cabecera', {}, ENV],
    ['cabecera vacía', { 'x-api-key': '' }, ENV],
    ['llave equivocada', { 'x-api-key': 'otra-llave-del-mismo-largo' }, ENV],
    ['llave del MISMO largo y distinta', { 'x-api-key': 'llave-de-pruebX' }, ENV],
    ['llave más corta', { 'x-api-key': 'llave' }, ENV],
    ['la llave de despacho de la sala', { 'x-sala-dispatch-key': 'despacho', 'x-api-key': 'despacho' }, ENV],
    ['n8n SIN la variable (aunque mande una llave)', { 'x-api-key': 'cualquiera' }, { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid' }],
    ['n8n con la variable vacía y cabecera vacía', { 'x-api-key': '' }, { ...ENV, INTERNAL_API_KEY: '' }],
  ] as Array<[string, Json, Json]>) {
    it(`${nombre}: «no_autorizado», NO se llama a la ruta`, async () => {
      const r = await correrCon(AVANZAR, NO, headers, env)
      expect(r.llamadasHttp).toEqual([])
      expect(salidaFinal(r)).toEqual({ ok: false, motivo: 'no_autorizado' })
    })
  }
  it('la comprobación va ANTES de validar el sobre: un sobre roto sin llave dice «no_autorizado», no «sobre_invalido»', async () => {
    expect(salidaFinal(await correrCon({}, NO, {})).motivo).toBe('no_autorizado')
  })
})

describe('el flujo nace inactivo, nuevo y sin credenciales', () => {
  it('inactivo, 5 nodos, y el archivo versionado es exactamente lo que construye el constructor', () => {
    expect(flujo.active).toBe(false)
    expect(flujo.nodes.length).toBe(5)
    expect(JSON.stringify(archivo)).toBe(JSON.stringify(flujo))
    expect(flujo.nodes[0].parameters.path).toBe(RUTA_WEBHOOK)
    expect(RUTA_WEBHOOK).not.toBe('zero-risk/finanzas-bloque')
  })
  it('la llave sale de una variable de entorno (nunca escrita) y NUNCA es la de despacho', () => {
    const t = JSON.stringify(flujo)
    expect(t).toContain('$env.INTERNAL_API_KEY')
    expect(t).not.toContain('SALA_DISPATCH_KEY')
    expect(t).not.toMatch(/x-sala-dispatch-key/i)
    expect(t).not.toMatch(/xox[bp]-|sk-[a-z0-9]{10}|eyJ[a-zA-Z0-9]{20}/)
  })
  it('sin reintentos (un paso paga), con tope de tiempo y la respuesta nunca corta el flujo', () => {
    const h = flujo.nodes.find((n: Json) => n.name === N.llamar)
    expect(h.retryOnFail).toBeUndefined()
    expect(h.onError).toBe('continueRegularOutput')
    expect(h.parameters.options.timeout).toBe(TIMEOUT_MS)
    expect(h.parameters.options.response.response.neverError).toBe(true)
  })
  it('llama a una sola ruta: /api/finanzas/conversa (ni la de bloque ni run-sdk directo)', () => {
    const urls = flujo.nodes.filter((n: Json) => n.type === 'n8n-nodes-base.httpRequest').map((n: Json) => n.parameters.url)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('/api/finanzas/conversa')
    expect(JSON.stringify(flujo)).not.toContain('run-sdk')
  })
  it('es un solo paso: sin bucle, sin espera, sin llamarse a sí mismo', () => {
    expect(flujo.nodes.some((n: Json) => /wait|loop|splitInBatches/i.test(n.type))).toBe(false)
  })
})

describe('el comportamiento: pasa SU workflow_id real y su ejecución', () => {
  it('abrir: una llamada con la llave interna, el cuerpo exacto y el id de ESTE flujo (no un literal)', async () => {
    const r = await correrCon(ABRIR, () => ({ statusCode: 200, body: { encargo_id: 'enc-1', estado: 'abierta' } }))
    expect(r.llamadasHttp).toHaveLength(1)
    const l = r.llamadasHttp[0]
    expect(l.url).toBe('https://api.ejemplo.invalid/api/finanzas/conversa')
    expect(l.cabeceras['x-api-key']).toBe('llave-de-prueba')
    expect(l.cuerpo).toEqual({ accion: 'abrir', dry_run: true, workflow_id: 'WF_PRUEBA', workflow_execution_id: 'EX_PRUEBA', client_id: 'c1', semilla: SEMILLA })
    expect(l.cuerpo.workflow_id).not.toBe('finanzas-conversa')
    expect(salidaFinal(r)).toEqual({ ok: true, accion: 'abrir', respuesta: { encargo_id: 'enc-1', estado: 'abierta' } })
  })
  it('avanzar: lleva el encargo, no la semilla ni el cliente, y el mismo workflow_id', async () => {
    const r = await correrCon(AVANZAR, () => ({ statusCode: 200, body: { estado: 'en_curso' } }))
    expect(r.llamadasHttp[0].cuerpo).toEqual({ accion: 'avanzar', dry_run: false, workflow_id: 'WF_PRUEBA', workflow_execution_id: 'EX_PRUEBA', encargo_id: 'enc-1' })
  })
  it('un `workflow_execution_id` que llega en el sobre se respeta; el `workflow_id` del sobre NUNCA se acepta (siempre el del flujo)', async () => {
    const r = await correrCon({ ...AVANZAR, workflow_execution_id: 'del-plan:7', workflow_id: 'otro-flujo' }, () => ({ statusCode: 200, body: {} }))
    expect(r.llamadasHttp[0].cuerpo.workflow_execution_id).toBe('del-plan:7')
    expect(r.llamadasHttp[0].cuerpo.workflow_id).toBe('WF_PRUEBA')
  })
  it('leer funciona igual que avanzar', async () => {
    const r = await correrCon({ accion: 'leer', encargo_id: 'enc-1', dry_run: true }, () => ({ statusCode: 200, body: { turnos: [] } }))
    expect(r.llamadasHttp[0].cuerpo.accion).toBe('leer')
    expect(salidaFinal(r)).toMatchObject({ ok: true, accion: 'leer' })
  })
  it('las acciones son exactamente las de la ruta', () => {
    expect(ACCIONES).toEqual(['abrir', 'avanzar', 'leer'])
  })
  for (const [nombre, body] of [
    ['sin acción', { dry_run: true, encargo_id: 'e' }],
    ['acción desconocida', { accion: 'borrar', dry_run: true, encargo_id: 'e' }],
    ['sin dry_run', { accion: 'avanzar', encargo_id: 'e' }],
    ['dry_run como texto', { accion: 'avanzar', encargo_id: 'e', dry_run: 'false' }],
    ['abrir sin client_id', { accion: 'abrir', dry_run: true, semilla: SEMILLA }],
    ['abrir con client_id en blanco', { accion: 'abrir', dry_run: true, client_id: '  ', semilla: SEMILLA }],
    ['abrir sin semilla', { accion: 'abrir', dry_run: true, client_id: 'c1' }],
    ['abrir con semilla como lista', { accion: 'abrir', dry_run: true, client_id: 'c1', semilla: [1] }],
    ['avanzar sin encargo', { accion: 'avanzar', dry_run: true }],
    ['leer con encargo en blanco', { accion: 'leer', dry_run: true, encargo_id: ' ' }],
  ] as Array<[string, Json]>) {
    it(`${nombre}: NO se llama a la ruta y sale «sobre_invalido» con los errores`, async () => {
      const r = await correrCon(body, NO)
      expect(r.llamadasHttp).toEqual([])
      expect(salidaFinal(r)).toMatchObject({ ok: false, motivo: 'sobre_invalido' })
      expect(salidaFinal(r).errores.length).toBeGreaterThan(0)
    })
  }
  it('apagada (409), sobre inválido (400), no encontrada (404) o fallo (500/503) NUNCA lanzan: `ok:false` con su motivo', async () => {
    for (const [status, body, motivo] of [[409, { error: 'conversa_apagada' }, 'conversa_apagada'], [409, {}, 'conversa_apagada'], [400, { error: 'accion_invalida' }, 'accion_invalida'], [404, { error: 'encargo_inexistente' }, 'encargo_inexistente'], [500, { error: 'no_se_pudo_guardar' }, 'no_se_pudo_guardar'], [503, {}, 'http_503']] as Array<[number, Json, string]>) {
      const r = await correrCon(AVANZAR, () => ({ statusCode: status, body }))
      expect(salidaFinal(r), String(status)).toMatchObject({ ok: false, motivo })
    }
  })
  it('una respuesta que no es JSON ni objeto tampoco lanza', async () => {
    for (const resp of [{ statusCode: 200, body: 'no es json' }, { statusCode: 200, body: null }, {}, { statusCode: 'x', body: [] }]) {
      const r = await correrCon(AVANZAR, () => resp)
      expect(salidaFinal(r)).toMatchObject({ ok: expect.any(Boolean) })
    }
    const vacia = await correrCon(AVANZAR, () => ({}))
    expect(salidaFinal(vacia)).toMatchObject({ ok: false, motivo: 'http_sin_respuesta' })
  })
})
