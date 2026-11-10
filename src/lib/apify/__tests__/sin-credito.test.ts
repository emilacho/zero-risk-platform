/**
 * 10-nov · «¿Queda crédito de Apify este mes?» (Lenovo por Emilio). Caso real del 09-nov: 15 ejecuciones del Servicio de Apify FALLARON en Riesgos porque el crédito del mes
 * (US$ 29) se acabó y Apify rechaza todo con 403. Se prueba: la lógica de la plataforma, el código REAL de los dos nodos del flujo arreglado (ejecutado con entradas falsas),
 * la conexión nueva y que nada más cambió. US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { creditoDeApify, creditoSinLeer, DATOS_SIN_ACTUALIZAR } from '../credito'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/3lyknrP3PoS2KzUf')
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const ANTES = leer('servicio-apify-ANTES-sin-credito-2026-11-10.json')
const DESPUES = leer('servicio-apify-ARREGLADO-sin-credito-2026-11-10.json')
type Nodo = { name: string; type: string; parameters: Record<string, unknown> & { jsCode?: string }; onError?: string }
const nodo = (w: { nodes: Nodo[] }, n: string) => w.nodes.find((x) => x.name === n)!

/** corre el código de un nodo Code con `$input` y `$(nombre)` falsos */
function correr(w: { nodes: Nodo[] }, n: string, entrada: unknown, nodos: Record<string, unknown> = {}): Record<string, unknown> {
  const codigo = nodo(w, n).parameters.jsCode!.split('\r\n').join('\n')
  const $input = { first: () => ({ json: entrada }) }
  const $ = (k: string) => ({ first: () => ({ json: nodos[k] }) })
  return (new Function('$input', '$', codigo)($input, $) as Array<{ json: Record<string, unknown> }>)[0].json
}

const USO = { plan: 'STARTER', credito_usd: 29, usado_usd: 29.04, ciclo_desde: '2026-10-25T00:00:00Z', ciclo_hasta: '2026-11-25T00:00:00Z' }
const CLIENTE = [{ id: 'cli-1', name: 'Cliente', config: {} }]
const VALIDADO = (dry_run = false) => ({ dry_run, body: { client_id: 'cli-1', apify_function: 'google_maps_scraper', params: { q: 1 }, destination: 'respuesta' } })
const puerta = (credito: unknown, dry = false) => correr(DESPUES, 'Gate Decision', credito, { 'HTTP · Supabase clients lookup': CLIENTE[0], 'Validate Body': VALIDADO(dry) })

describe('la plataforma: ¿queda crédito?', () => {
  it('🔴 caso real: US$ 29.04 de 29 → sin crédito hasta el 2026-11-25, con el mensaje que el empleado declara', () => {
    const r = creditoDeApify(USO)
    expect(r).toMatchObject({ hay_credito: false, leido: true, hasta: '2026-11-25', usado_usd: 29.04, credito_usd: 29 })
    expect(r.mensaje).toContain(`${DATOS_SIN_ACTUALIZAR} hasta el 2026-11-25`)
    expect(DATOS_SIN_ACTUALIZAR).toBe('datos sin actualizar: crédito de Apify agotado')
  })
  it('🔴 justo en el crédito ya no hay; un centavo debajo sí (el criterio es el de Apify, no el 90 % del portero)', () => {
    expect(creditoDeApify({ ...USO, usado_usd: 29 }).hay_credito).toBe(false)
    expect(creditoDeApify({ ...USO, usado_usd: 28.99 })).toMatchObject({ hay_credito: true, mensaje: null })
    expect(creditoDeApify({ ...USO, usado_usd: 27 }).hay_credito).toBe(true) // 93 %: el portero frena, el resto sigue pudiendo
  })
  it('una cuenta que no se lee deja pasar y lo dice', () => {
    expect(creditoSinLeer('Apify respondió 500')).toMatchObject({ hay_credito: true, leido: false, detalle: 'Apify respondió 500' })
  })
})

describe('el flujo arreglado', () => {
  it('🔴 sin crédito: la puerta NO sigue, salta con `sin_credito_apify` y lleva la fecha y el mensaje', () => {
    const g = puerta(creditoDeApify(USO))
    expect(g).toMatchObject({ proceed: false, skipped: true, skip_reason: 'sin_credito_apify', client_id: 'cli-1', apify_function: 'google_maps_scraper' })
    expect(g.sin_credito).toMatchObject({ hasta: '2026-11-25', usado_usd: 29.04, credito_usd: 29 })
  })
  it('🔴 con crédito, con la lectura caída o con respuesta vacía: la puerta sigue como siempre (mismo cuerpo que antes)', () => {
    const antes = correr(ANTES, 'Gate Decision', CLIENTE[0], { 'Validate Body': VALIDADO() })
    for (const c of [creditoDeApify({ ...USO, usado_usd: 10 }), creditoSinLeer('caída'), {}, null]) expect(puerta(c)).toEqual(antes)
    expect(antes.proceed).toBe(true)
  })
  it('🔴 en ensayo pasa aunque no haya crédito (el ensayo no llama a Apify)', () => {
    expect(puerta(creditoDeApify(USO), true)).toMatchObject({ proceed: true, dry_run: true })
  })
  it('un cliente que no existe sigue siendo un rechazo, no un «sin crédito»', () => {
    const g = correr(DESPUES, 'Gate Decision', creditoDeApify(USO), { 'HTTP · Supabase clients lookup': {}, 'Validate Body': VALIDADO() })
    expect(g).toMatchObject({ proceed: false, validation_error: true })
  })
  it('🔴 la respuesta: ok (no es falla ni rechazo), saltada, motivo = el mensaje y `sin_credito` para quien llamó', () => {
    const s = correr(DESPUES, 'skipped-response', puerta(creditoDeApify(USO)))
    expect(s).toMatchObject({ ok: true, rechazado: false, skipped: true, skip_reason: 'sin_credito_apify', validation_error: false })
    expect(String(s.motivo)).toContain('datos sin actualizar: crédito de Apify agotado hasta el 2026-11-25')
    expect(s.sin_credito).toMatchObject({ hasta: '2026-11-25' })
  })
  it('las otras respuestas saltadas no cambian (salvo el campo nuevo, nulo)', () => {
    for (const ctx of [{ skipped: true, skip_reason: 'apify_disabled_for_client' }, { validation_ok: false, validation_errors: ['x'] }, { skipped: true }]) {
      expect(correr(DESPUES, 'skipped-response', ctx)).toEqual({ ...correr(ANTES, 'skipped-response', ctx), sin_credito: null })
    }
  })
  it('🔴 la pregunta va entre la búsqueda del cliente y la puerta, con la llave interna, sin cortar el flujo si falla; nada más cambió', () => {
    const n = nodo(DESPUES, '¿Queda crédito de Apify?')
    expect(n.type).toBe('n8n-nodes-base.httpRequest')
    expect(String(n.parameters.url)).toContain('/api/apify/credito')
    expect(JSON.stringify(n.parameters.headerParameters)).toContain('$env.INTERNAL_API_KEY')
    expect(n.onError).toBe('continueRegularOutput')
    expect(DESPUES.connections['HTTP · Supabase clients lookup'].main[0][0].node).toBe('¿Queda crédito de Apify?')
    expect(DESPUES.connections['¿Queda crédito de Apify?'].main[0][0].node).toBe('Gate Decision')
    const A = new Map((ANTES.nodes as Nodo[]).map((x) => [x.name, JSON.stringify(x)]))
    expect((DESPUES.nodes as Nodo[]).filter((x) => A.get(x.name) !== JSON.stringify(x)).map((x) => x.name).sort()).toEqual(['Gate Decision', 'skipped-response', '¿Queda crédito de Apify?'].sort())
    const { ['HTTP · Supabase clients lookup']: _a, ['¿Queda crédito de Apify?']: _b, ...restoD } = DESPUES.connections
    const { ['HTTP · Supabase clients lookup']: _c, ...restoA } = ANTES.connections
    expect(JSON.stringify(restoD)).toBe(JSON.stringify(restoA))
    expect([DESPUES.name, DESPUES.active]).toEqual([ANTES.name, ANTES.active])
  })
})
