/**
 * Ronda 73 · el libro de Apify CUADRA con la cuenta. Datos REALES del paso 2 (5 corridas): la cuenta dice 0,2950 y lo anotado al responder sumaba 0,1937 (−34 %).
 * La reconciliación diaria escribe el resto por corrida (real − anotado en su llamada) y el total del día vuelve a ser el de la cuenta.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construir, construirFlujo, NODO } from '../scripts/worker-staging/jrnP5qTvEh0ACGkM/construir-r73.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const WS = join(process.cwd(), 'scripts/worker-staging/jrnP5qTvEh0ACGkM')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('anotar-gasto-r73-ANTES.json')
const HOY = leer('anotar-gasto-r73-ARREGLADO.json')
const REAL = JSON.parse(readFileSync(join(process.cwd(), '__tests__/fixtures/ronda73-apify-paso2.json'), 'utf8')) as { corridas: any[]; llamadas: Array<{ amount_usd_exact: number; description: string }> }
const codigo = (f: Flujo) => String(f.nodes.find((x) => x.name === NODO)!.parameters.jsCode).split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

type Corrida = { run_id: string; usd: number }
type Llamada = { run_id?: string; costo_conocido?: boolean; amount_usd_exact?: number | null; texto?: string }
async function correr(f: Flujo, corridas: Corrida[], llamadas: Llamada[] | 'falla') {
  const fn = new AsyncFunction('$', '$input', '$env', 'Date', codigo(f))
  const dia = '2026-10-11'
  const cs = corridas.map((c) => ({ json: { run_id: c.run_id, actor: 'a', estado: 'SUCCEEDED', usd: c.usd, dia, momento: dia + 'T08:00:00Z', segundos: 5, dataset_id: 'd' } }))
  const conteos = corridas.map(() => ({ json: { data: { itemCount: 1 } } }))
  const ahora = Date.parse('2026-10-12T05:00:00Z')
  const FechaFalsa = class extends Date { constructor(...a: any[]) { super((a.length ? a[0] : ahora) as number) } static now() { return ahora } }
  const filas = llamadas === 'falla' ? [] : llamadas.map((l) => ({ description: l.texto ?? JSON.stringify({ run_id: l.run_id, costo_conocido: l.costo_conocido ?? true }), amount_usd_exact: l.amount_usd_exact }))
  const yo = { helpers: { httpRequest: async () => { if (llamadas === 'falla') throw new Error('base caída'); return filas } } }
  const salida = await (fn as any).call(yo, () => ({ all: () => cs }), { all: () => conteos }, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, FechaFalsa)
  return salida.map((s: { json: Record<string, any> }) => s.json)
}
const desc = (f: Record<string, any>) => JSON.parse(f.description)

describe('las 5 corridas REALES del paso 2', () => {
  const corridas = REAL.corridas.map((c) => ({ run_id: c.run_id, usd: c.usd }))
  const llamadas = REAL.llamadas.map((l) => ({ ...JSON.parse(l.description), amount_usd_exact: l.amount_usd_exact }))
  const real = corridas.reduce((a, c) => a + c.usd, 0)
  const anotado = llamadas.reduce((a, l) => a + l.amount_usd_exact, 0)
  it('los datos son los de la cuenta: 0,2950 real contra 0,1937 anotado (−34 %)', () => {
    expect(real).toBeCloseTo(0.2950, 4); expect(anotado).toBeCloseTo(0.1937, 4); expect(1 - anotado / real).toBeGreaterThan(0.33); expect(1 - anotado / real).toBeLessThan(0.35)
  })
  it('rojo (el flujo de antes): el resto del día sale 0 y las filas del libro suman lo anotado, 34 % por debajo de la cuenta', async () => {
    const [fila] = await correr(ANTES, corridas, llamadas)
    expect(fila.amount_usd_exact).toBe(0); expect(anotado + fila.amount_usd_exact).toBeCloseTo(anotado, 5); expect(1 - (anotado + fila.amount_usd_exact) / real).toBeGreaterThan(0.33)
  })
  it('verde: la fila del día escribe el resto y TOTAL DEL DÍA = la cuenta (a 6 decimales)', async () => {
    const [fila] = await correr(HOY, corridas, llamadas)
    const d = desc(fila)
    expect(d.total_del_dia_usd).toBeCloseTo(real, 5)
    expect(fila.amount_usd_exact).toBeCloseTo(real - anotado, 5)
    expect(d.anotadas_usd).toBeCloseTo(anotado, 5)
    expect(d.anotadas_en_su_llamada).toBe(5); expect(d.corridas_completadas).toBe(5)
    expect(d.completado_al_cierre_usd).toBeCloseTo(real - anotado, 5)
    // libro: filas de llamada + fila del día = cuenta
    expect(anotado + fila.amount_usd_exact).toBeCloseTo(real, 5)
  })
  it('por corrida: el detalle dice lo anotado en su llamada', async () => {
    const [fila] = await correr(HOY, corridas, llamadas)
    for (const x of desc(fila).detalle) expect(x.anotado_usd).toBeCloseTo(llamadas.find((l) => l.run_id === x.run_id)!.amount_usd_exact, 6)
  })
  it('idempotente: dos pases seguidos escriben lo mismo (el anotado no cambia con la fila del día)', async () => {
    const a = await correr(HOY, corridas, llamadas), b = await correr(HOY, corridas, llamadas)
    expect(a[0].amount_usd_exact).toBe(b[0].amount_usd_exact); expect(desc(a[0]).total_del_dia_usd).toBe(desc(b[0]).total_del_dia_usd)
  })
})

describe('bordes', () => {
  it('lo anotado ya es lo de la cuenta → resto 0, nada completado', async () => {
    const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], [{ run_id: 'r1', amount_usd_exact: 0.2 }])
    expect(f.amount_usd_exact).toBe(0); expect(desc(f)).toMatchObject({ total_del_dia_usd: 0.2, corridas_completadas: 0, completado_al_cierre_usd: 0 })
  })
  it('lo anotado es MÁS que la cuenta → no se inventa un abono: resto 0 y el total es la cuenta', async () => {
    const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], [{ run_id: 'r1', amount_usd_exact: 0.5 }])
    expect(f.amount_usd_exact).toBe(0); expect(desc(f)).toMatchObject({ anotadas_usd: 0.2, total_del_dia_usd: 0.2, corridas_completadas: 0 })
  })
  it('anotado nulo o ilegible (lo que dejaba la versión vieja) → toda la corrida va al resto', async () => {
    for (const a of [null, undefined, Number.NaN]) {
      const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], [{ run_id: 'r1', amount_usd_exact: a as any }])
      expect(f.amount_usd_exact).toBe(0.2); expect(desc(f)).toMatchObject({ anotadas_usd: 0, total_del_dia_usd: 0.2, corridas_completadas: 1 })
    }
  })
  it('dos filas de la misma corrida suman lo anotado', async () => {
    const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.3 }], [{ run_id: 'r1', amount_usd_exact: 0.1 }, { run_id: 'r1', amount_usd_exact: 0.1 }])
    expect(f.amount_usd_exact).toBeCloseTo(0.1, 6); expect(desc(f).anotadas_usd).toBeCloseTo(0.2, 6)
  })
  it('una corrida sin fila de llamada va entera al resto; una con costo_conocido false no cuenta como anotada; una descripción que no es JSON no anota', async () => {
    const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.1 }, { run_id: 'r2', usd: 0.2 }, { run_id: 'r3', usd: 0.3 }], [{ run_id: 'r2', costo_conocido: false, amount_usd_exact: 0.2 }, { texto: 'no es json', amount_usd_exact: 9 }])
    expect(f.amount_usd_exact).toBeCloseTo(0.6, 6); expect(desc(f)).toMatchObject({ anotadas_en_su_llamada: 0, total_del_dia_usd: 0.6 })
  })
  it('una diferencia de una diezmillonésima no cuenta como corrida completada, de cinco milésimas sí', async () => {
    const [a] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], [{ run_id: 'r1', amount_usd_exact: 0.1999999 }])
    expect(desc(a).corridas_completadas).toBe(0)
    const [b] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], [{ run_id: 'r1', amount_usd_exact: 0.199 }])
    expect(desc(b).corridas_completadas).toBe(1)
  })
  it('si no se puede leer la libreta: nada se descuenta y se dice (como antes)', async () => {
    const [f] = await correr(HOY, [{ run_id: 'r1', usd: 0.2 }], 'falla')
    expect(f.amount_usd_exact).toBe(0.2); expect(desc(f).lectura_de_las_anotadas).toMatch(/fallo: no se descontó nada/)
  })
})

describe('el cambio es acotado', () => {
  it('SOLO cambia el nodo «Agrupar por día»; el resto del flujo queda idéntico', () => {
    const cambian = (ANTES.nodes as Nodo[]).filter((n) => JSON.stringify(n) !== JSON.stringify((HOY.nodes as Nodo[]).find((x) => x.name === n.name))).map((n) => n.name)
    expect(cambian).toEqual([NODO]); expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
  })
  it('se reconstruye igual desde el respaldo', () => {
    const base = { name: 'x', nodes: ANTES.nodes, connections: ANTES.connections, settings: {} }
    expect(JSON.stringify(construirFlujo(base).nodes)).toBe(JSON.stringify(HOY.nodes))
  })
  it('si el texto cambió debajo, el constructor NO aplica a ciegas', () => {
    expect(() => construir('const x = 1')).toThrow(/aparece 0 veces/)
  })
})
