/**
 * Ronda 69 · (1) la vuelta segura también para los flujos que vienen (oficina + plazo largo de recuperación para TODO agente con vuelta) ·
 *            (2) la llave de Apify va por cabecera, no en la dirección (n8n copia la dirección en los datos de una ejecución fallida).
 * Casos grabados: las corridas reales de Apify del tramo 1 y la fila/punto de control reales del redactor (08:16:25 → corte 08:18:44 → 08:26:04).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { direccionSinLlave, llavePorCabecera, FLUJOS, CORRIDA_VIEJA } from '../scripts/worker-staging/construir-ronda69.mjs'
import { AGENTES_CON_VUELTA_POR_EL_CORREDOR, vueltaPorElCorredorElegible, buildInnerRequestWithoutCallback, ENCABEZADO_VENCE_EN } from '@/app/api/agents/run-sdk/route'
import { recuperarRespuestaPagada, filaConTextoEntero, type FilaInvocacion, type PuntoDeControl } from '@/lib/respuesta-pagada'
import { topeDeRecuperacionInterna, PRESUPUESTO_DE_LA_FUNCION_MS, MARGEN_PARA_ENTREGAR_MS } from '@/lib/vuelta-perdida'

type Nodo = { name: string; parameters: Record<string, any>; type?: string }
type Flujo = { nodes: Nodo[]; connections: unknown; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const par = (pref: string) => ({ antes: leer(`${pref}-ANTES-ronda69-2026-10-11.json`), hoy: leer(`${pref}-ARREGLADO-ronda69-2026-10-11.json`) })
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const cambian = (a: Flujo, b: Flujo) => a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(b, n.name))).map((n) => n.name)
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

describe('la dirección sin llave', () => {
  it('cada forma que usan los flujos', () => {
    expect(direccionSinLlave('=https://api.apify.com/v2/acts/a~b/run-sync-get-dataset-items?token={{ $env.APIFY_API_TOKEN }}&timeout=120')).toEqual({ url: '=https://api.apify.com/v2/acts/a~b/run-sync-get-dataset-items?timeout=120', variable: 'APIFY_API_TOKEN' })
    expect(direccionSinLlave('=https://api.apify.com/v2/actor-runs?limit=200&desc=1&token={{ $env.APIFY_API_TOKEN }}')).toEqual({ url: '=https://api.apify.com/v2/actor-runs?limit=200&desc=1', variable: 'APIFY_API_TOKEN' })
    expect(direccionSinLlave('=https://api.apify.com/v2/acts/{{ $json.actor }}/builds/default?token={{ $env.APIFY_API_TOKEN }}').url).toBe('=https://api.apify.com/v2/acts/{{ $json.actor }}/builds/default')
    expect(direccionSinLlave('https://api.apify.com/x?a=1&token={{ $env.APIFY_TOKEN }}&b=2')).toEqual({ url: 'https://api.apify.com/x?a=1&b=2', variable: 'APIFY_TOKEN' })
    expect(direccionSinLlave('https://api.apify.com/x?a=1')).toEqual({ url: 'https://api.apify.com/x?a=1', variable: null })
  })
  it('un nodo sin llave en la dirección o que ya trae Authorization NO se toca en silencio (falla)', () => {
    expect(() => llavePorCabecera({ name: 'x', parameters: { url: 'https://a.b/c' } } as never)).toThrow(/no trae la llave/)
    expect(() => llavePorCabecera({ name: 'y', parameters: { url: 'https://a.b/c?token={{ $env.APIFY_API_TOKEN }}', headerParameters: { parameters: [{ name: 'authorization', value: 'z' }] } } } as never)).toThrow(/Authorization/)
  })
})

describe('los 8 flujos: la llave sale de la dirección y viaja por cabecera, y NADA más cambia', () => {
  for (const [id, pref] of FLUJOS as Array<[string, string, unknown]>) {
    if (id === 'bTbWL9lUvQCfStAz') continue
    it(`${id} · ${pref.split('/')[1]}`, () => {
      const { antes, hoy } = par(pref)
      const cambiados = antes.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(hoy, n.name)))
      expect(cambiados.length).toBeGreaterThan(0)
      // rojo: antes la llave estaba en la dirección o en el código
      expect(JSON.stringify(antes.nodes)).toMatch(/token=\{\{ \$env\.APIFY(_API)?_TOKEN \}\}|\?token=' \+ \$env\.APIFY_API_TOKEN|&token=' \+ token|token=' \+ token/)
      // verde: ninguna parte de ningún nodo la lleva en una dirección
      expect(JSON.stringify(hoy.nodes)).not.toMatch(/token=/)
      for (const n of cambiados) {
        const h = nodo(hoy, n.name), a = n
        if (typeof a.parameters.url === 'string') {
          // nodo HTTP: misma llave, ahora en `Authorization`; el resto del nodo idéntico (método, cuerpo, opciones, otras cabeceras)
          const otras = (a.parameters.headerParameters?.parameters ?? [])
          const cab = h.parameters.headerParameters.parameters as Array<{ name: string; value: string }>
          expect(cab.slice(0, otras.length)).toEqual(otras)
          expect(cab[cab.length - 1]).toMatchObject({ name: 'Authorization' })
          expect(cab[cab.length - 1].value).toMatch(/^=Bearer \{\{ \$env\.APIFY(_API)?_TOKEN \}\}$/)
          expect(h.parameters.sendHeaders).toBe(true)
          const { url: _u1, headerParameters: _h1, sendHeaders: _s1, ...restoA } = a.parameters
          const { url: _u2, headerParameters: _h2, sendHeaders: _s2, ...restoH } = h.parameters
          expect(restoH).toEqual(restoA)
          expect(h.parameters.url).not.toMatch(/token/)
        }
      }
      expect(hoy.connections).toEqual(antes.connections); expect(hoy.nodes.length).toBe(antes.nodes.length); expect(hoy.active).toBe(antes.active)
    })
  }
  it('el Servicio: 22 nodos HTTP + el código del importe real (23); la reconciliación 2; cada uno de los demás los suyos', () => {
    expect(cambian(par('3lyknrP3PoS2KzUf/servicio-apify').antes, par('3lyknrP3PoS2KzUf/servicio-apify').hoy).length).toBe(23)
    expect(cambian(par('jrnP5qTvEh0ACGkM/anotar-gasto').antes, par('jrnP5qTvEh0ACGkM/anotar-gasto').hoy)).toEqual(['Traer corridas de Apify', 'Contar las filas de cada corrida'])
    expect(cambian(par('Dz2n5bA3yW89I2Ye/landing-cascade').antes, par('Dz2n5bA3yW89I2Ye/landing-cascade').hoy)).toEqual(['Apify · Instagram Scrape'])
    expect(cambian(par('Smu6A18qr1XJ2uzB/relector-esquemas').antes, par('Smu6A18qr1XJ2uzB/relector-esquemas').hoy)).toEqual(['Traer el esquema de hoy'])
    expect(cambian(par('vRSkPFxe5IbdQbz3/inteligencia-competitiva').antes, par('vRSkPFxe5IbdQbz3/inteligencia-competitiva').hoy)).toEqual(['L1: Meta Ad Library', 'L3: LinkedIn + Social'])
  })
  it('la variable de cada nodo se conserva (la inteligencia competitiva usa APIFY_TOKEN y sigue usándola)', () => {
    const { hoy } = par('vRSkPFxe5IbdQbz3/inteligencia-competitiva')
    expect(JSON.stringify(nodo(hoy, 'L1: Meta Ad Library').parameters.headerParameters)).toContain('$env.APIFY_TOKEN')
  })
})

describe('el código del importe real del Servicio pregunta a Apify con la llave en la cabecera (corridas reales grabadas)', () => {
  const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68/apify-corridas-reales.json'), 'utf8')) as { items: any[]; entradas: Record<string, any> }
  it('cada pregunta lleva Authorization y NINGUNA dirección lleva la llave · sigue identificando 7 de 7', async () => {
    const { hoy } = par('3lyknrP3PoS2KzUf/servicio-apify')
    const fn = new AsyncFunction('$', '$env', 'Date', lf(String(nodo(hoy, 'Armar la fila de la libreta').parameters.jsCode)))
    const preguntas: Array<{ url: string; headers?: Record<string, string> }> = []
    for (const r of REAL.items) {
      const cuerpo = REAL.entradas[r.defaultKeyValueStoreId]
      const ahora = new Date(r.finishedAt).getTime() + 5000
      const Fecha = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : ahora) as number) } static now() { return ahora } }
      const yo = { helpers: { httpRequest: async (o: { url: string; headers?: Record<string, string> }) => {
        preguntas.push(o)
        if (o.url.includes('/actor-runs')) return { data: { items: REAL.items } }
        const m = o.url.match(/key-value-stores\/([^/]+)\/records\/INPUT/); return REAL.entradas[m![1]]
      } } }
      const $ = (n: string) => n === 'final-response-ok' ? { first: () => ({ json: { dry_run: false, apify_function: 'instagram_scraper', client_id: 'c1', chunks_count: 1 } }) } : { first: () => ({ json: { cuerpo } }) }
      const salida = await (fn as any).call(yo, $, { APIFY_API_TOKEN: 'LLAVE-DE-PRUEBA' }, Fecha)
      expect(JSON.parse(salida[0].json.description).run_id).toBe(r.id)
    }
    expect(preguntas.length).toBeGreaterThan(7)
    for (const p of preguntas) { expect(p.url).not.toMatch(/token|LLAVE-DE-PRUEBA/); expect(p.headers).toEqual({ Authorization: 'Bearer LLAVE-DE-PRUEBA' }) }
  })
  it('los nodos de código del Cerebro preguntan por la corrida con la llave en la cabecera', () => {
    for (const pref of ['EZXAFQvKZsJlvGNO/cerebro-diario', 'ogfq56oIEoHufFPM/cerebro-mantenimiento']) {
      const { antes, hoy } = par(pref)
      const nombre = cambian(antes, hoy)[0]
      expect(lf(String(nodo(antes, nombre).parameters.jsCode))).toContain(CORRIDA_VIEJA)
      const nuevo = lf(String(nodo(hoy, nombre).parameters.jsCode))
      expect(nuevo).not.toContain('token=')
      expect(nuevo).toContain("headers: { Authorization: 'Bearer ' + $env.APIFY_API_TOKEN }")
      expect(cambian(antes, hoy)).toEqual([nombre])
    }
  })
})

describe('la vuelta segura de los flujos que vienen', () => {
  it('oficina · turno: el pedido pide la vuelta por el corredor y NADA más cambia', () => {
    const { antes, hoy } = par('bTbWL9lUvQCfStAz/oficina-turno')
    expect(cambian(antes, hoy)).toEqual(['② Armar el pedido'])
    const a = lf(String(nodo(antes, '② Armar el pedido').parameters.jsCode)), h = lf(String(nodo(hoy, '② Armar el pedido').parameters.jsCode))
    expect(a).not.toContain('callback_mode')
    expect(h).toContain("callback_mode: 'runner'")
    expect(h.split('\n').filter((l) => !/ronda 69|callback_mode/.test(l)).join('\n')).toBe(a)
    expect(hoy.connections).toEqual(antes.connections); expect(hoy.active).toBe(antes.active)
  })
  it('quién puede entregar la vuelta por el corredor: campaign-brief-agent + los dos agentes de diseño de la oficina; NO el texto editorial ni el descubrimiento', () => {
    expect([...AGENTES_CON_VUELTA_POR_EL_CORREDOR].sort()).toEqual(['campaign-brief-agent', 'carousel-designer', 'design-visual-storyteller'])
    const pide = (agent: string) => vueltaPorElCorredorElegible({ agent, callback_mode: 'runner' } as never)
    for (const ok of ['campaign-brief-agent', 'carousel-designer', 'design-visual-storyteller']) expect(pide(ok).elegible, ok).toBe(true)
    expect(pide('content-creator')).toMatchObject({ elegible: false, motivo: expect.stringMatching(/editorial/) })
    expect(pide('onboarding-specialist')).toMatchObject({ elegible: false, motivo: expect.stringMatching(/descubrimiento/) })
    expect(pide('brand-strategist').elegible).toBe(false)
    expect(vueltaPorElCorredorElegible({ agent: 'carousel-designer' } as never).elegible).toBe(false) // sin la palanca, el camino de siempre
  })
  it('el plazo de la recuperación dentro del trabajo: 120 s salvo un plazo futuro válido (entonces lo que falte, hasta 790 s); lo mal escrito o vencido se ignora', () => {
    const ahora = 1_000_000
    expect(topeDeRecuperacionInterna(null, ahora)).toBe(120_000)
    expect(topeDeRecuperacionInterna('basura', ahora)).toBe(120_000)
    expect(topeDeRecuperacionInterna(String(ahora - 5), ahora)).toBe(120_000)
    expect(topeDeRecuperacionInterna(String(ahora + 60_000), ahora)).toBe(120_000)
    expect(topeDeRecuperacionInterna(String(ahora + 400_000), ahora)).toBe(400_000)
    expect(topeDeRecuperacionInterna(String(ahora + 5_000_000), ahora)).toBe(790_000)
  })
  it('el pedido interno lleva SOLO el plazo que arma run-sdk: uno que llegue de afuera se descarta; sin plazo no hay encabezado', () => {
    const afuera = new Request('https://x.test/api/agents/run-sdk', { method: 'POST', headers: { 'x-api-key': 'k', [ENCABEZADO_VENCE_EN]: '9999999999999' }, body: '{}' })
    expect(buildInnerRequestWithoutCallback(afuera, { agent: 'a', task: 't' } as never).headers.get(ENCABEZADO_VENCE_EN)).toBeNull()
    expect(buildInnerRequestWithoutCallback(afuera, { agent: 'a', task: 't' } as never, undefined, 123456789).headers.get(ENCABEZADO_VENCE_EN)).toBe('123456789')
  })
  it('CASO REAL (alta/oficina/cualquiera, con efectos): con el plazo de la vuelta, el trabajo interno ESPERA al empleado (08:26:04) y recupera el plan entero; con el plazo viejo (120 s) lo perdía', async () => {
    const FILA = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68/invocacion-real-08-16-25.json'), 'utf8')) as FilaInvocacion
    const PUNTO = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68/punto-de-control-real.json'), 'utf8')) as PuntoDeControl
    const T_DESPACHO = Date.parse('2026-10-11T08:16:25Z'), T_CORTE = Date.parse('2026-10-11T08:18:44Z'), T_FILA = Date.parse('2026-10-11T08:26:04.874Z')
    const vence = T_DESPACHO + PRESUPUESTO_DE_LA_FUNCION_MS - MARGEN_PARA_ENTREGAR_MS
    const mundo = () => { let t = T_CORTE; return { ahora: () => t, esperar: async (ms: number) => { t += ms }, buscarFila: async () => (t < T_FILA ? null : filaConTextoEntero(FILA, PUNTO, '173257')) } }
    const con = mundo()
    const largo = await recuperarRespuestaPagada({ agent: 'campaign-brief-agent', executionId: '173257', topeMs: topeDeRecuperacionInterna(String(vence), T_CORTE) }, con)
    expect(largo?.response.length).toBe(26133)
    const corto = mundo()
    expect(await recuperarRespuestaPagada({ agent: 'campaign-brief-agent', executionId: '173257', topeMs: topeDeRecuperacionInterna(null, T_CORTE) }, corto)).toBeNull()
  })
})
