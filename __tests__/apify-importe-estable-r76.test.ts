/**
 * Ronda 76 · el libro de Apify cuadra con la cuenta en las funciones de video (pago por evento): el importe se relee hasta que se estabiliza; si no, la fila va sin importe y la reconciliación del día la cubre.
 * Sin Apify de verdad: las 7 corridas reales de la ronda 68 y un doble que va «cerrando» el importe.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conImporteEstable } from '../scripts/worker-staging/construir-importe-r76.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[] }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const FUENTES = leer('3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-fuentes-2026-10-12.json')
const HOY = leer('3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-importe-r76-2026-10-12.json')
const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda68/apify-corridas-reales.json'), 'utf8')) as { items: any[]; entradas: Record<string, any> }
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

/** el nodo «Armar la fila de la libreta» con un Apify falso; `relecturas` = lo que va devolviendo usageTotalUsd en cada relectura de esa corrida */
async function fila(opciones: { run: any; relecturas: Array<number | null | 'falla'>; listaUsd?: number | null; pausa?: string }) {
  const { run } = opciones
  let k = 0
  const http = async (u: string) => {
    if (u.includes('/actor-runs?')) return { data: { items: [{ ...run, usageTotalUsd: opciones.listaUsd === undefined ? opciones.relecturas[0] : opciones.listaUsd }] } }
    const m = u.match(/key-value-stores\/([^/]+)\/records\/INPUT/)
    if (m) return REAL.entradas[m[1]]
    if (u.includes('/actor-runs/' + run.id)) {
      const v = opciones.relecturas[Math.min(k++, opciones.relecturas.length - 1)]
      if (v === 'falla') throw new Error('HTTP 503')
      return { data: { ...run, usageTotalUsd: v } }
    }
    throw new Error('url inesperada ' + u)
  }
  const fn = new AsyncFunction('$', '$env', 'Date', String(nodo(HOY, 'Armar la fila de la libreta').parameters.jsCode).split('\r\n').join('\n'))
  const ahora = new Date(run.finishedAt).getTime() + 5000
  const Falsa = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : ahora) as number) } static now() { return ahora } }
  const $ = (n: string) => {
    if (n === 'final-response-ok') return { first: () => ({ json: { dry_run: false, apify_function: 'videos_instagram', client_id: 'c1', chunks_count: 10 } }) }
    if (n === 'Armar el cuerpo del raspador') return { first: () => ({ json: { cuerpo: REAL.entradas[run.defaultKeyValueStoreId] } }) }
    throw new Error('nodo ' + n)
  }
  const yo = { helpers: { httpRequest: async (o: { url: string }) => http(o.url) } }
  const out = await (fn as any).call(yo, $, { APIFY_API_TOKEN: 'tok', APIFY_PAUSA_MS: opciones.pausa ?? '0' }, Falsa)
  return { f: out[0].json as Record<string, any>, relecturas: k }
}

describe('el flujo se reconstruye igual y solo cambia el nodo del importe', () => {
  it('reproducible', () => { expect(JSON.stringify(conImporteEstable(FUENTES))).toBe(JSON.stringify(HOY)) })
  it('ningún otro nodo cambió', () => {
    for (const a of FUENTES.nodes) if (a.name !== 'Armar la fila de la libreta') expect(JSON.stringify(nodo(HOY, a.name)), a.name).toBe(JSON.stringify(a))
    expect(HOY.nodes.length).toBe(FUENTES.nodes.length)
  })
  it('la llave no viaja en ninguna dirección del nodo', () => { expect(String(nodo(HOY, 'Armar la fila de la libreta').parameters.jsCode)).not.toMatch(/token=|apify_api_[A-Za-z0-9]/) })
})

describe('el importe parcial ya no se anota como cierto', () => {
  const run = REAL.items[0]
  it('la lista trae 0,17 y la cuenta cierra en 0,557: se anota 0,557 (lo cobrado)', async () => {
    const { f, relecturas } = await fila({ run, relecturas: [0.30, 0.557, 0.557], listaUsd: 0.17 })
    const d = JSON.parse(f.description)
    expect(f.amount_usd_exact).toBe(0.557); expect(d.costo_conocido).toBe(true); expect(d.run_id).toBe(run.id); expect(relecturas).toBe(3)
  })
  it('un importe que ya estaba cerrado se confirma con una sola relectura igual', async () => {
    const { f, relecturas } = await fila({ run, relecturas: [run.usageTotalUsd], listaUsd: run.usageTotalUsd })
    expect(f.amount_usd_exact).toBe(Number(run.usageTotalUsd.toFixed(6))); expect(relecturas).toBe(1)
  })
  it('si sigue cambiando en todas las relecturas, la fila va SIN importe (nunca un parcial) y con el motivo', async () => {
    const { f } = await fila({ run, relecturas: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7], listaUsd: 0.1 })
    const d = JSON.parse(f.description)
    expect(f.amount_usd).toBeNull(); expect(f.amount_usd_exact).toBeNull(); expect(d.costo_conocido).toBe(false); expect(d.run_id).toBeUndefined()
    expect(d.motivo).toMatch(/NO se anota un parcial[\s\S]*reconciliación del día/); expect(d.motivo).toMatch(/0\.1 → 0\.2/)
  })
  it('si no se puede releer la corrida, sin importe y con el motivo', async () => {
    const { f } = await fila({ run, relecturas: ['falla'], listaUsd: 0.17 })
    expect(f.amount_usd_exact).toBeNull(); expect(JSON.parse(f.description).motivo).toMatch(/no se pudo releer/)
  })
  it('la lista sin importe todavía (null) se resuelve por las relecturas', async () => {
    const { f } = await fila({ run, relecturas: [null, 0.4, 0.4], listaUsd: null })
    expect(f.amount_usd_exact).toBe(0.4)
  })
})

describe('las 7 corridas reales siguen dando su importe real', () => {
  for (const r of REAL.items) {
    it(`corrida ${r.startedAt.slice(11, 19)} · US$ ${Number(r.usageTotalUsd).toFixed(4)}`, async () => {
      const { f } = await fila({ run: r, relecturas: [r.usageTotalUsd], listaUsd: r.usageTotalUsd })
      expect(f.amount_usd_exact).toBe(Number(r.usageTotalUsd.toFixed(6))); expect(JSON.parse(f.description).run_id).toBe(r.id)
    })
  }
})
