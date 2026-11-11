/**
 * 11-nov · #21 · el latido del corredor a la base (líneas 2, 3 y 6 de CC6). Base falsa en memoria · US$ 0.
 * Dos clientes de rubros distintos: un despacho de Náufrago (restaurante) y uno del B2B industrial, cada uno con su llave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrirLatidoALaBase, cerrarSinPisar, cierreDelDespacho, correrLatiendo, intervaloDelLatidoALaBase, latirUnaVez, llaveDelLatido, LATIDO_A_LA_BASE_MS, type BaseDelLatido } from '../latido-a-la-base'

type Fila = { dispatch_key: string; status: string; updated_at: string; completed_at?: string | null; metadata?: Record<string, unknown> }
function baseFalsa(filas: Fila[], o: { caida?: boolean } = {}) {
  const pedidos: Array<{ op: string; filtros: string[] }> = []
  const db: BaseDelLatido = {
    from() {
      const hacer = (op: string, valor?: Record<string, unknown>) => {
        const fs: Array<(f: Fila) => boolean> = []
        const ped = { op, filtros: [] as string[] }
        pedidos.push(ped)
        const q: Record<string, unknown> = {
          eq: (k: string, v: unknown) => { ped.filtros.push(`eq:${k}=${String(v)}`); fs.push((f) => (f as unknown as Record<string, unknown>)[k] === v); return q },
          in: (k: string, vs: readonly unknown[]) => { ped.filtros.push(`in:${k}=${vs.join('|')}`); fs.push((f) => vs.includes((f as unknown as Record<string, unknown>)[k])); return q },
          select: () => q, limit: () => q,
          then: (res: (x: unknown) => unknown) => {
            if (o.caida) return Promise.resolve({ data: null, error: { message: 'base caída' } }).then(res)
            const tocadas = filas.filter((f) => fs.every((fn) => fn(f)))
            if (op === 'update') for (const f of tocadas) Object.assign(f, valor)
            return Promise.resolve({ data: tocadas.map((f) => ({ ...f })), error: null }).then(res)
          },
        }
        return q
      }
      return { update: (v: Record<string, unknown>) => hacer('update', v), select: () => hacer('select') } as never
    },
  }
  return { db, pedidos }
}
const NAU = 'oficina:7c2a1d4e-naufrago:3', B2B = 'jefatura:df7e47cc-b2b:2'
const ARRANQUE = '2026-11-11T12:00:00.000Z'
const fila = (k: string, status: string): Fila => ({ dispatch_key: k, status, updated_at: ARRANQUE })
const T = () => new Date('2026-11-11T12:05:00.000Z')

describe('el intervalo', () => {
  it('🔴 60 s por omisión (el mismo LATIDO_DEL_CORREDOR_MS que lee la plataforma) · 0 apaga · basura o menos de 10 s → 60 s', () => {
    expect(LATIDO_A_LA_BASE_MS).toBe(60_000)
    expect(intervaloDelLatidoALaBase({})).toBe(60_000)
    expect(intervaloDelLatidoALaBase({ AGENT_RUNNER_DISPATCH_HEARTBEAT_MS: '0' })).toBe(0)
    expect(intervaloDelLatidoALaBase({ AGENT_RUNNER_DISPATCH_HEARTBEAT_MS: 'x' })).toBe(60_000)
    expect(intervaloDelLatidoALaBase({ AGENT_RUNNER_DISPATCH_HEARTBEAT_MS: '500' })).toBe(60_000)
    expect(intervaloDelLatidoALaBase({ AGENT_RUNNER_DISPATCH_HEARTBEAT_MS: '30000' })).toBe(30_000)
  })
})

describe('un latido (CC6 línea 2: el latido no resucita nada)', () => {
  it('🔴 escribe updated_at por la llave EXACTA y SOLO si sigue running, en el mismo UPDATE (Náufrago y B2B)', async () => {
    const filas = [fila(NAU, 'running'), fila(B2B, 'running'), fila(`${NAU}:extra`, 'running')]
    const { db, pedidos } = baseFalsa(filas)
    expect(await latirUnaVez(db, NAU, T)).toBe(true)
    expect(pedidos[0]).toEqual({ op: 'update', filtros: [`eq:dispatch_key=${NAU}`, 'eq:status=running'] })
    expect(filas.map((f) => f.updated_at)).toEqual([T().toISOString(), ARRANQUE, ARRANQUE])
    expect(await latirUnaVez(db, B2B, T)).toBe(true)
  })
  it.each(['sin_cierre', 'error', 'completed', 'accepted'])('🔴 un despacho «%s» no late (no vuelve a parecer vivo)', async (status) => {
    const filas = [fila(NAU, status)]
    expect(await latirUnaVez(baseFalsa(filas).db, NAU, T)).toBe(false)
    expect(filas[0]).toEqual(fila(NAU, status))
  })
  it('🔴 un error de la base lanza (quien late lo cuenta como fallido, no como «escrito»)', async () => {
    await expect(latirUnaVez(baseFalsa([], { caida: true }).db, NAU, T)).rejects.toThrow(/base caída/)
  })
})

describe('el latido mientras trabaja', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('🔴 late cada intervalo hasta detenerse; sin llave, sin base o con 0 no hace nada', async () => {
    const filas = [fila(B2B, 'running')]
    const l = abrirLatidoALaBase(baseFalsa(filas).db, B2B, 60_000)
    await vi.advanceTimersByTimeAsync(60_000 * 3 + 10)
    expect(l.latidos()).toBe(3)
    l.detener()
    await vi.advanceTimersByTimeAsync(60_000 * 3)
    expect(l.latidos()).toBe(3)
    for (const x of [abrirLatidoALaBase(baseFalsa(filas).db, null, 60_000), abrirLatidoALaBase(null, B2B, 60_000), abrirLatidoALaBase(baseFalsa(filas).db, B2B, 0)]) {
      await vi.advanceTimersByTimeAsync(60_000 * 2)
      expect(x.latidos()).toBe(0)
    }
  })
  it('🔴 sin llave de despacho no sale NINGÚN pedido a la base (ni uno sin filtro)', async () => {
    const { db, pedidos } = baseFalsa([fila(NAU, 'running'), fila(B2B, 'running')])
    for (const k of [null, undefined, '']) abrirLatidoALaBase(db, k, 60_000)
    await vi.advanceTimersByTimeAsync(60_000 * 3 + 10)
    expect(pedidos).toEqual([])
  })
  it('🔴 un latido que falla no frena nada: se cuenta y se sigue', async () => {
    const l = abrirLatidoALaBase(baseFalsa([], { caida: true }).db, NAU, 60_000)
    await vi.advanceTimersByTimeAsync(60_000 * 2 + 10)
    expect([l.latidos(), l.fallidos()]).toEqual([0, 2])
    l.detener()
  })
})

describe('el cierre (CC6 línea 3: no pisa un cierre ajeno sin decirlo)', () => {
  it('🔴 abierto → escribe su estado final (Náufrago running, B2B accepted)', async () => {
    const filas = [fila(NAU, 'running'), fila(B2B, 'accepted')]
    const { db } = baseFalsa(filas)
    expect(await cerrarSinPisar(db, NAU, 'completed', T)).toBe('cerrado')
    expect(await cerrarSinPisar(db, B2B, 'error', T)).toBe('cerrado')
    expect(filas.map((f) => f.status)).toEqual(['completed', 'error'])
  })
  it('🔴 ya cerrado por el limpiador (sin_cierre) → su estado se queda y se anota que el empleado terminó después', async () => {
    const filas: Fila[] = [{ ...fila(NAU, 'sin_cierre'), metadata: { cierre: { regla: 'ciclo-de-incidentes' } } }]
    expect(await cerrarSinPisar(baseFalsa(filas).db, NAU, 'completed', T)).toBe('ya_cerrado_anotado')
    expect(filas[0].status).toBe('sin_cierre')
    expect(filas[0].metadata).toEqual({ cierre: { regla: 'ciclo-de-incidentes' }, termino_despues: { estado: 'completed', en: T().toISOString(), estado_que_tenia: 'sin_cierre' } })
  })
  it('🔴 si el cliente de la base revienta (lanza), el cierre devuelve error y no lanza', async () => {
    const rota = { from: () => { throw new Error('sin conexión') } } as unknown as BaseDelLatido
    await expect(cerrarSinPisar(rota, B2B, 'completed', T)).resolves.toBe('error')
  })
  it('🔴 sin fila → no_existe; base caída → error (nunca lanza)', async () => {
    expect(await cerrarSinPisar(baseFalsa([]).db, NAU, 'completed', T)).toBe('no_existe')
    expect(await cerrarSinPisar(baseFalsa([], { caida: true }).db, NAU, 'completed', T)).toBe('error')
  })
})

describe('el cableado del corredor (pedido de CC7)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('🔴 correrLatiendo late mientras trabaja y se DETIENE al terminar (Náufrago)', async () => {
    const { db, pedidos } = baseFalsa([fila(NAU, 'running')])
    let soltar: (v: string) => void = () => undefined
    const p = correrLatiendo(db, NAU, 60_000, () => new Promise<string>((r) => { soltar = r }))
    await vi.advanceTimersByTimeAsync(60_000 * 2 + 10)
    expect(pedidos).toHaveLength(2)
    soltar('listo')
    expect(await p).toBe('listo')
    await vi.advanceTimersByTimeAsync(60_000 * 5)
    expect(pedidos).toHaveLength(2)
  })
  it('🔴 si el trabajo LANZA, el latido también se detiene (B2B) y el error sigue hacia arriba', async () => {
    const { db, pedidos } = baseFalsa([fila(B2B, 'running')])
    let tirar: (e: Error) => void = () => undefined
    const p = correrLatiendo(db, B2B, 60_000, () => new Promise<string>((_r, rej) => { tirar = rej }))
    const atrapado = p.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(60_000 + 10)
    tirar(new Error('el empleado falló'))
    expect(await atrapado).toBe('el empleado falló')
    const antes = pedidos.length
    await vi.advanceTimersByTimeAsync(60_000 * 5)
    expect(pedidos.length).toBe(antes)
  })
  it('🔴 la llave del camino de siempre sale SOLO de latido_dispatch_key', () => {
    expect(llaveDelLatido({ latido_dispatch_key: NAU })).toBe(NAU)
    for (const b of [{}, { latido_dispatch_key: '' }, { latido_dispatch_key: 7 }, { dispatch_key: NAU }, { _latido: { dispatch_key: B2B } }, null, undefined]) expect(llaveDelLatido(b as never)).toBeNull()
  })
  it('🔴 el cierre del corredor NO pisa un cierre ajeno; sin llave o sin base no toca nada', async () => {
    const filas: Fila[] = [{ ...fila(B2B, 'sin_cierre'), metadata: { cierre: { regla: 'ciclo-de-incidentes' } } }, fila(NAU, 'running')]
    const { db, pedidos } = baseFalsa(filas)
    await cierreDelDespacho(B2B, () => db, T)('completed')
    await cierreDelDespacho(NAU, () => db, T)('completed')
    expect(filas.map((f) => f.status)).toEqual(['sin_cierre', 'completed'])
    expect(filas[0].metadata).toMatchObject({ termino_despues: { estado: 'completed', estado_que_tenia: 'sin_cierre' } })
    const n = pedidos.length
    await cierreDelDespacho(null, () => db, T)('error')
    await cierreDelDespacho(NAU, () => null, T)('error')
    expect(pedidos.length).toBe(n)
  })
  it('🔴 el corredor usa esas piezas en LOS DOS caminos (lo que el servicio no deja importar se lee del archivo)', () => {
    const ix = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8')
    // camino del corredor: late con la llave del despacho y cierra sin pisar
    expect(ix).toContain('correrLatiendo(baseDelLatido(), dispatchKey, intervaloDelLatidoALaBase(process.env), () => runAgentViaSDK(input))')
    expect(ix).toContain('cerrarDespacho: cierreDelDespacho(dispatchKey, baseDelLatido),')
    // camino de siempre: late con la llave que puso Vercel
    expect(ix).toContain('correrLatiendo(baseDelLatido(), llaveDelLatido(body), intervaloDelLatidoALaBase(process.env), () => runAgentViaSDK(input))')
    // nadie corre al empleado sin latido ni cierra el despacho a mano
    expect(ix.split('runAgentViaSDK(input)').length - 1).toBe(2)
    expect(ix).not.toMatch(/from\('agent_dispatches'\)\s*\.update/)
    expect(ix).not.toContain('abrirLatidoALaBase(')
  })
})
