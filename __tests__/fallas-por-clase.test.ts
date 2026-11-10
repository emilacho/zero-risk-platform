/**
 * #927 · la clase de una falla del empleado (decisión de Lenovo 10-nov 16:08Z). Señales EXACTAS del proveedor: verificar exacto = código.
 * Los textos «reales» son los que quedaron en el libro de llamadas de producción (lectura 10-nov); el resto, la forma documentada del proveedor.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { claseDeFalla } from '../src/lib/finanzas/conversa/modelo-run-sdk'
import { mensajeDeCorte } from '../services/agent-runner/src/lib/tope-por-corrida'

describe('claseDeFalla', () => {
  it('el corte por tope es «tope», con cualquier código', () => {
    expect(claseDeFalla('run_sdk_500', mensajeDeCorte(2.5, 2.51))).toBe('tope')
  })
  it('real · saldo agotado, llave mala y modelo no soportado son permanentes', () => {
    expect(claseDeFalla('run_sdk_500', 'el modelo respondió 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')).toBe('permanente')
    expect(claseDeFalla('run_sdk_500', 'el modelo respondió 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')).toBe('permanente')
    expect(claseDeFalla('run_sdk_500', 'el empleado FALLÓ · Invalid API key · Fix external API key · gastado ≈ US$ 0.0000')).toBe('permanente')
    expect(claseDeFalla('run_sdk_500', 'el empleado FALLÓ · API Error: 400 Claude Code 2.1 does not support this model')).toBe('permanente')
  })
  it('proveedor saturado, límite de ritmo o caído son pasajeros (por su tipo o por su código)', () => {
    expect(claseDeFalla('run_sdk_500', 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')).toBe('pasajera')
    expect(claseDeFalla('run_sdk_500', '{"type": "rate_limit_error"}')).toBe('pasajera')
    expect(claseDeFalla('run_sdk_500', '{"type":"api_error"}')).toBe('pasajera')
    expect(claseDeFalla('run_sdk_500', 'el empleado FALLÓ · API Error: 503 Service Unavailable')).toBe('pasajera')
    expect(claseDeFalla('run_sdk_500', 'el modelo respondió 429: demasiadas')).toBe('pasajera')
  })
  it('el tipo permanente manda sobre un código pasajero en el mismo texto', () => {
    expect(claseDeFalla('run_sdk_500', 'API Error: 500 {"type":"error","error":{"type":"authentication_error"}}')).toBe('permanente')
  })
  it('un número parecido no es el código: «API Error: 5000» y un 500 suelto en la prosa no cuentan', () => {
    expect(claseDeFalla('run_sdk_500', 'API Error: 5000 algo')).toBe('permanente')
    expect(claseDeFalla('run_sdk_500', 'el empleado FALLÓ · respuesta de 500 palabras sin formato')).toBe('permanente')
  })
  it('sin clase reconocida ⇒ permanente', () => {
    expect(claseDeFalla('run_sdk_500', 'el proveedor del modelo devolvió un error')).toBe('permanente')
    expect(claseDeFalla('run_sdk_500', '')).toBe('permanente')
  })
  it('sin fallo declarado: la red y el 5xx del camino son pasajeros; un 4xx y lo demás, permanentes (como hasta hoy)', () => {
    for (const e of ['red:fetch failed', 'red:cuerpo_cortado', 'run_sdk_502', 'run_sdk_504']) expect(claseDeFalla(e)).toBe('pasajera')
    for (const e of ['run_sdk_429', 'run_sdk_400', 'modelo_no_configurado', 'sin_workflow_id', 'respuesta_sin_texto']) expect(claseDeFalla(e)).toBe('permanente')
    expect(claseDeFalla('run_sdk_502', null)).toBe('pasajera')
  })
})

describe('la ruta real de la mesa da la espera (sin ella, lo pasajero se repetiría enseguida)', () => {
  it('los puertos de la ruta traen `esperar` con un temporizador', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app/api/planeacion/mesa/route.ts'), 'utf8')
    expect(src).toMatch(/esperar: \(ms\) => new Promise\(\(ok\) => setTimeout\(ok, ms\)\)/)
  })
})
