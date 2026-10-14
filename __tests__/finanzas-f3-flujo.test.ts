/**
 * OFICINA FINANCIERA · F3 · el flujo `finanzas · bloque` (CC#1 · 14-oct): nace INACTIVO y NUEVO, con la llave interna por variable de entorno, sin reintentos,
 * `dry_run` obligatorio y booleano, y un fallo de la ruta NUNCA lanza (devuelve `sin_bloque` y el plan sigue). Con el n8n en miniatura: US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { construirFlujo, N, RUTA_WEBHOOK } from '../scripts/worker-staging/finanzas-f3/construir-f3.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Json = Record<string, any>
/** la salida del ÚLTIMO nodo que corrió (falla con claridad si el flujo no visitó ninguno: el tipo ya no es «posiblemente undefined») */
const salidaFinal = (r: { visitas: Array<{ salida: any[] }> }): any => {
  const v = r.visitas[r.visitas.length - 1]
  if (!v) throw new Error('el flujo no visitó ningún nodo')
  return v.salida[0]
}

const flujo = construirFlujo() as Json
const archivo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts/worker-staging/finanzas-f3/NUEVO-finanzas-bloque-2026-10-14.json'), 'utf8')) as Json
const ENV = { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'llave-de-prueba' }
const ENTRADA = { meta_por_semana: 15, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'prueba' }, dias_activos_por_semana: 5 }
const correrCon = (body: Json, respuesta?: (c: any) => any, headers: Json = { 'x-api-key': 'llave-de-prueba' }, env: Json = ENV) =>
  correr(flujo, { inicio: N.webhook, itemsDeInicio: [{ json: { headers, body } }], http: respuesta ? { [N.llamar]: respuesta } : {}, env })

describe('R-F3 de CC#3 · el webhook EXIGE la llave interna antes de mirar nada', () => {
  const body = { client_id: 'c1', dry_run: true, entrada: { meta_por_semana: 15 } }
  const NO = () => { throw new Error('no debe llamarse') }
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
    it(`${nombre}: «no_autorizado», NO se llama a la ruta y no se dice por qué`, async () => {
      const r = await correrCon(body, NO, headers, env)
      expect(r.llamadasHttp).toEqual([])
      expect(salidaFinal(r)).toEqual({ ok: false, sin_bloque: true, motivo: 'no_autorizado' })
    })
  }
  it('con la llave correcta sigue el comportamiento normal (una sola llamada)', async () => {
    const r = await correrCon(body, () => ({ statusCode: 200, body: { dry_run: true, huella: 'h', escribio: false } }))
    expect(r.llamadasHttp).toHaveLength(1)
    expect(salidaFinal(r)).toMatchObject({ ok: true })
  })
  it('la comprobación va ANTES de validar el sobre: un sobre roto sin llave dice «no_autorizado», no «sobre_invalido»', async () => {
    const r = await correrCon({}, NO, {})
    expect(salidaFinal(r).motivo).toBe('no_autorizado')
  })
})

describe('el flujo nace inactivo, nuevo y sin credenciales', () => {
  it('inactivo, 5 nodos, y el archivo versionado es exactamente lo que construye el constructor', () => {
    expect(flujo.active).toBe(false)
    expect(flujo.nodes.length).toBe(5)
    expect(JSON.stringify(archivo)).toBe(JSON.stringify(flujo))
    expect(flujo.nodes[0].parameters.path).toBe(RUTA_WEBHOOK)
  })
  it('la llave sale de una variable de entorno (nunca escrita) y NUNCA es la de despacho', () => {
    const t = JSON.stringify(flujo)
    expect(t).toContain('$env.INTERNAL_API_KEY')
    expect(t).not.toContain('SALA_DISPATCH_KEY')
    expect(t).not.toMatch(/x-sala-dispatch-key/i)
    expect(t).not.toMatch(/xox[bp]-|sk-[a-z0-9]{10}|eyJ[a-zA-Z0-9]{20}/)
  })
  it('sin reintentos (la llamada escribe) y con tope de tiempo; la respuesta nunca corta el flujo', () => {
    const h = flujo.nodes.find((n: Json) => n.name === N.llamar)
    expect(h.retryOnFail).toBeUndefined()
    expect(h.onError).toBe('continueRegularOutput')
    expect(h.parameters.options.timeout).toBeLessThanOrEqual(60000)
    expect(h.parameters.options.response.response.neverError).toBe(true)
  })
})

describe('el comportamiento', () => {
  it('sobre válido: una llamada a /api/finanzas/bloque con la llave interna y el cuerpo exacto', async () => {
    const r = await correrCon({ client_id: 'c1', dry_run: true, entrada: ENTRADA }, () => ({ statusCode: 200, body: { dry_run: true, huella: 'h', escribio: false } }))
    expect(r.llamadasHttp).toHaveLength(1)
    const l = r.llamadasHttp[0]
    expect(l.url).toBe('https://api.ejemplo.invalid/api/finanzas/bloque')
    expect(l.cabeceras['x-api-key']).toBe('llave-de-prueba')
    expect(l.cuerpo).toEqual({ client_id: 'c1', dry_run: true, entrada: ENTRADA, workflow_execution_id: 'EX_PRUEBA' })
    const sal = salidaFinal(r)
    expect(sal).toMatchObject({ ok: true, sin_bloque: false, huella: 'h', escribio: false })
  })
  it('real y guardado: devuelve el id del tablero en `borrador` (la firma es de la revisión)', async () => {
    const r = await correrCon({ client_id: 'c1', dry_run: false, entrada: ENTRADA }, () => ({ statusCode: 200, body: { dry_run: false, finanzas_id: 'uuid-1', version: 2, huella: 'h', escribio: true } }))
    expect(salidaFinal(r)).toMatchObject({ ok: true, finanzas_id: 'uuid-1', version: 2, estado: 'borrador', escribio: true })
  })
  for (const [nombre, body] of [
    ['sin dry_run', { client_id: 'c1', entrada: ENTRADA }],
    ['dry_run como texto', { client_id: 'c1', dry_run: 'false', entrada: ENTRADA }],
    ['sin client_id', { dry_run: true, entrada: ENTRADA }],
    ['sin entrada', { client_id: 'c1', dry_run: true }],
    ['entrada como lista', { client_id: 'c1', dry_run: true, entrada: [1] }],
  ] as Array<[string, Json]>) {
    it(`${nombre}: NO se llama a la ruta y sale «sin_bloque» con los errores`, async () => {
      const r = await correrCon(body, () => { throw new Error('no debe llamarse') })
      expect(r.llamadasHttp).toEqual([])
      expect(salidaFinal(r)).toMatchObject({ ok: false, sin_bloque: true, motivo: 'sobre_invalido' })
      expect(salidaFinal(r).errores.length).toBeGreaterThan(0)
    })
  }
  it('la oficina apagada (409), una entrada inválida (422) o un fallo (500) NUNCA lanzan: `sin_bloque` con su motivo', async () => {
    for (const [status, body, motivo] of [[409, { error: 'finanzas_apagada' }, 'finanzas_apagada'], [422, { error: 'entrada_invalida', errores: ['x'] }, 'entrada_invalida'], [500, { error: 'no_se_pudo_guardar' }, 'no_se_pudo_guardar'], [503, {}, 'http_503']] as Array<[number, Json, string]>) {
      const r = await correrCon({ client_id: 'c1', dry_run: false, entrada: ENTRADA }, () => ({ statusCode: status, body }))
      expect(salidaFinal(r), String(status)).toMatchObject({ ok: false, sin_bloque: true, motivo })
    }
  })
  it('una respuesta que no es JSON ni objeto tampoco lanza', async () => {
    for (const resp of [{ statusCode: 200, body: 'no es json' }, { statusCode: 200, body: null }, {}, { statusCode: 'x', body: [] }]) {
      const r = await correrCon({ client_id: 'c1', dry_run: true, entrada: ENTRADA }, () => resp)
      expect(salidaFinal(r)).toMatchObject({ ok: false, sin_bloque: true })
    }
  })
})
