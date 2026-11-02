/** La plataforma late hacia quien lo pide: quien no lo pide recibe lo de siempre, y un fallo tardío no se disfraza de éxito. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CABECERA_DEL_LATIDO, pideLatido, responderConLatido } from '../src/lib/latido-hacia-quien-llama'

const INTERVALO = 10
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
const tardio = (r: () => Response, ms = 45) => async () => { await dormir(ms); return r() }

describe('la respuesta rápida no cambia', () => {
  it('🔴 un rechazo conserva su código real y su cuerpo, sin latido', async () => {
    const r = await responderConLatido(async () => json({ error: 'workflow_required' }, 403), { intervaloMs: 200 })
    expect(r.status).toBe(403)
    expect(await r.text()).toBe('{"error":"workflow_required"}')
  })
  it('🔴 una respuesta rápida buena tampoco lleva bytes de más', async () => {
    const r = await responderConLatido(async () => json({ success: true }), { intervaloMs: 200 })
    expect(await r.text()).toBe('{"success":true}')
  })
})

describe('la respuesta larga late', () => {
  it('🔴 escribe bytes ANTES de que el trabajo termine: la conexión no queda en silencio', async () => {
    const r = await responderConLatido(tardio(() => json({ success: true }), 60), { intervaloMs: INTERVALO })
    const lector = r.body!.getReader()
    const primero = await lector.read()
    expect(new TextDecoder().decode(primero.value)).toBe('\n')
    await lector.cancel()
  })
  it('🔴 late varias veces mientras dura, no solo una', async () => {
    const r = await responderConLatido(tardio(() => json({ success: true }), 70), { intervaloMs: INTERVALO })
    const t = await r.text()
    expect(t.match(/\n/g)!.length).toBeGreaterThanOrEqual(3)
  })
  it('🔴 el cuerpo final se lee con JSON.parse tal cual, latidos incluidos', async () => {
    const r = await responderConLatido(tardio(() => json({ success: true, response: 'línea\nsegunda' })), { intervaloMs: INTERVALO })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(JSON.parse(await r.text())).toEqual({ success: true, response: 'línea\nsegunda' })
  })
  it('🔴 un éxito no lleva estado_http: no cambia el cuerpo de siempre', async () => {
    const r = await responderConLatido(tardio(() => json({ success: true })), { intervaloMs: INTERVALO })
    expect(JSON.parse(await r.text())).not.toHaveProperty('estado_http')
  })
})

describe('un fallo tardío no se disfraza de éxito', () => {
  it('🔴 un 500 tardío lleva su código real en el cuerpo', async () => {
    const r = await responderConLatido(tardio(() => json({ success: false, error: 'el corredor falló' }, 500)), { intervaloMs: INTERVALO })
    expect(r.status).toBe(200)
    expect(JSON.parse(await r.text())).toEqual({ success: false, error: 'el corredor falló', estado_http: 500 })
  })
  it('🔴 un fallo tardío que no es JSON también llega como fallo', async () => {
    const r = await responderConLatido(tardio(() => new Response('se cayó', { status: 502 })), { intervaloMs: INTERVALO })
    expect(JSON.parse(await r.text())).toEqual({ success: false, error: 'se cayó', estado_http: 502 })
  })
  it('🔴 si el trabajo lanza tarde, llega success:false con 500 y el canal se cierra', async () => {
    const r = await responderConLatido(async () => { await dormir(45); throw new Error('explotó') }, { intervaloMs: INTERVALO })
    expect(JSON.parse(await r.text())).toEqual({ success: false, error: 'explotó', estado_http: 500 })
  })
  it('🔴 si el trabajo lanza rápido, sube como siempre: lo atiende quien llamó', async () => {
    await expect(responderConLatido(async () => { throw new Error('rápido') }, { intervaloMs: 200 })).rejects.toThrow('rápido')
  })
})

describe('el trabajo ya pagado termina', () => {
  it('🔴 lo registra para seguir vivo aunque quien llamó se vaya', async () => {
    const vivos: Promise<unknown>[] = []
    let termino = false
    const r = await responderConLatido(async () => { await dormir(45); termino = true; return json({ success: true }) }, { intervaloMs: INTERVALO, mantenerVivo: (p) => vivos.push(p) })
    expect(vivos).toHaveLength(1)
    await r.body!.cancel()
    await vivos[0]
    expect(termino).toBe(true)
  })
  it('🔴 irse a mitad no rompe ni deja el reloj latiendo con error', async () => {
    const r = await responderConLatido(tardio(() => json({ success: true }), 40), { intervaloMs: INTERVALO })
    await r.body!.cancel()
    await dormir(60)
  })
})

describe('es opcional', () => {
  const pide = (v?: string) => new Request('https://x.test', { method: 'POST', headers: v === undefined ? {} : { [CABECERA_DEL_LATIDO]: v } })
  it('🔴 solo con la cabecera exacta', () => {
    expect(pideLatido(pide('1'))).toBe(true)
    expect(pideLatido(pide())).toBe(false)
    expect(pideLatido(pide('0'))).toBe(false)
  })
  it('🔴 la ruta run-sdk lo usa solo si se pide, y mantiene vivo el trabajo', () => {
    const fuente = readFileSync('src/app/api/agents/run-sdk/route.ts', 'utf8')
    expect(fuente).toMatch(/if \(!pideLatido\(request\)\) return atender\(request\)/)
    expect(fuente).toMatch(/responderConLatido\(\(\) => atender\(request\), \{ mantenerVivo: waitUntil \}\)/)
  })
})
