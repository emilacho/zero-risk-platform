/**
 * 18-nov · los 🟡 de CC6 sobre #1184 (`CERTIFICACION-CC6-1184-la-mesa-lee-el-indice-sin-casillas.md`): el interruptor, la conexión REAL con el cerebro,
 * lo que el conector del corredor le devuelve al empleado, «no consta» con texto y el aviso del cerebro.
 */
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { entornoConBase } from '../ruta'
import { fichasEnTexto, leerEntrega, seccionDelCerebro } from '../mesa/indice-del-cerebro'

const require_ = createRequire(import.meta.url)
const { respuestaDeFichas } = require_('../../../../services/agent-runner/src/lib/mcp/mesa-fichas.js') as { respuestaDeFichas: (r: unknown) => { isError?: boolean; content: Array<{ text: string }> } }

const BASE = 'https://zero-risk-platform.vercel.app'
const antes = process.env.OFICINA_MESA_INDICE
afterEach(() => { if (antes === undefined) delete process.env.OFICINA_MESA_INDICE; else process.env.OFICINA_MESA_INDICE = antes })

describe('o7 · el interruptor: solo «1» enciende el índice', () => {
  for (const v of [undefined, '', '0', 'true', 'si', ' 1']) {
    it(`OFICINA_MESA_INDICE=${JSON.stringify(v)} → apagado: los puertos no traen el índice`, () => {
      if (v === undefined) delete process.env.OFICINA_MESA_INDICE; else process.env.OFICINA_MESA_INDICE = v
      const env = entornoConBase(BASE)
      expect(env.mesaIndice).toBe(false)
      expect(crearPuertos({} as never, env).indice).toBeUndefined()
    })
  }
  it('OFICINA_MESA_INDICE=1 → encendido', () => {
    process.env.OFICINA_MESA_INDICE = '1'
    const env = entornoConBase(BASE)
    expect(env.mesaIndice).toBe(true)
    expect(crearPuertos({} as never, env).indice).toBeDefined()
  })
})

describe('o9 · o10 · la conexión real con el cerebro', () => {
  type Llamada = { url: string; init: RequestInit }
  const conFetch = (status: number, cuerpo: unknown) => {
    const llamadas: Llamada[] = []
    const f = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } }) }) as unknown as typeof fetch
    const P = crearPuertos({} as never, { ...entornoConBase(BASE), mesaIndice: true, internalKey: 'llave-interna' }, f)
    return { P, llamadas }
  }
  const PIEZA = { encargo_id: 'e1', hoja: 'la hoja' }
  it('el índice va a /api/brain/portero/indice con su llave y el pedido tal cual; 2xx = ok con el cuerpo', async () => {
    const { P, llamadas } = conFetch(200, { huella: 'h', lista_texto: '1. x' })
    const r = await P.indice!.indice({ cliente: 'c1', agente: 'oficina-creativa', pieza: PIEZA })
    expect(r).toEqual({ ok: true, body: { huella: 'h', lista_texto: '1. x' } })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe(`${BASE}/api/brain/portero/indice`)
    expect(llamadas[0].init.method).toBe('POST')
    expect((llamadas[0].init.headers as Record<string, string>)['x-api-key']).toBe('llave-interna')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ cliente: 'c1', agente: 'oficina-creativa', pieza: PIEZA })
  })
  it('la entrega va a /api/brain/portero/entregar con su llave, la hoja, los números y la huella', async () => {
    const { P, llamadas } = conFetch(200, { material: [] })
    const r = await P.indice!.entregar({ cliente: 'c1', agente: 'a', pieza: PIEZA, numeros: [1, 2], huella: 'h' })
    expect(r.ok).toBe(true)
    expect(llamadas[0].url).toBe(`${BASE}/api/brain/portero/entregar`)
    expect((llamadas[0].init.headers as Record<string, string>)['x-api-key']).toBe('llave-interna')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ cliente: 'c1', agente: 'a', pieza: PIEZA, numeros: [1, 2], huella: 'h' })
  })
  for (const [que, llamar] of [['índice', (P: ReturnType<typeof crearPuertos>) => P.indice!.indice({ cliente: 'c1', agente: 'a', pieza: PIEZA })], ['entrega', (P: ReturnType<typeof crearPuertos>) => P.indice!.entregar({ cliente: 'c1', agente: 'a', pieza: PIEZA, numeros: [1], huella: 'h' })]] as const) {
    it(`${que}: un HTTP no-2xx queda ok:false con el detalle y el código (nunca éxito)`, async () => {
      const { P } = conFetch(400, { error: 'casilla_no_permitida', detalle: 'llegó sede' })
      expect(await llamar(P)).toEqual({ ok: false, error: 'llegó sede', http: 400 })
      const { P: P2 } = conFetch(503, {})
      expect(await llamar(P2)).toEqual({ ok: false, error: 'HTTP 503', http: 503 })
    })
  }
})

describe('o12 · lo que el conector del corredor le devuelve al empleado', () => {
  it('el TEXTO de las fichas, nunca los datos crudos', () => {
    const r = respuestaDeFichas({ ok: true, cuerpo: { ok: true, fichas: '### Número 1\nel original' } })
    expect(r).toEqual({ content: [{ type: 'text', text: '### Número 1\nel original' }] })
    expect(r.content[0].text).not.toContain('"ok"')
  })
  it('sin texto, con ok:false de la plataforma o sin respuesta: error, nunca un éxito vacío', () => {
    expect(respuestaDeFichas({ ok: true, cuerpo: { ok: true } }).isError).toBe(true)
    expect(respuestaDeFichas({ ok: true, cuerpo: { ok: true, fichas: '  ' } }).isError).toBe(true)
    const no = respuestaDeFichas({ ok: true, cuerpo: { ok: false, motivo: 'esta pieza no tiene el índice del cerebro' } })
    expect(no).toEqual({ isError: true, content: [{ type: 'text', text: 'esta pieza no tiene el índice del cerebro' }] })
    expect(respuestaDeFichas({ ok: false, error: 'HTTP 500' })).toEqual({ isError: true, content: [{ type: 'text', text: 'HTTP 500' }] })
  })
})

describe('o1 · o5 · lo que lee el empleado', () => {
  it('una ficha que el cerebro marca «no consta» se muestra «no consta» aunque traiga texto', () => {
    const f = leerEntrega({ material: [{ numero: 4, estado: 'no_consta', texto: 'un texto que no debe darse por recibido', motivo: 'vencida' }] }, [4])
    expect(f[0].estado).toBe('no_consta')
    const t = fichasEnTexto(f)
    expect(t).toContain('No consta: vencida.')
    expect(t).not.toContain('un texto que no debe darse por recibido')
  })
  it('el aviso del cerebro llega a la sección', () => {
    const s = seccionDelCerebro({ base: 'b', lista_texto: '1. x', huella: 'h', aviso: 'el resumen vivo de Olón tiene 40 días' })
    expect(s).toContain('(aviso del cerebro: el resumen vivo de Olón tiene 40 días)')
  })
})
