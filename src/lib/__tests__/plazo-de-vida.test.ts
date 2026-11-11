/**
 * 11-nov · #21 · la regla única de vida (`plazo-de-vida.ts`) · líneas de CC6 (RESPUESTA-CC6 · diseño #21) · opción 1 de Lenovo 13:05.
 * Dos clientes de rubros distintos con números REALES medidos el 11-nov en `agent_invocations` (60 días):
 *  · Náufrago (restaurante): `jefe-marketing`, 4 corridas reales de más de 12 min, la más larga 25 min.
 *  · B2B industrial: `campaign-brief-agent`, la más larga 32 min.
 * US$ 0 · sin red · sin base real.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CORRIDAS_MINIMAS, LATIDO_DEL_CORREDOR_MS, LATIDOS_PERDIDOS, MARGEN_DEL_TECHO, TECHO_CON_LATIDO,
  elegirDespacho, late, lecturasDeVida, lectorDeVidaDeSupabase, techoMedidoMs, vidaDelPaso, type DespachoLeido,
} from '../plazo-de-vida'
import { MINUTOS_PARA_DAR_POR_MUERTO as OFICINA } from '../oficina/vigia'
import { MINUTOS_PARA_DAR_POR_MUERTO as JEFATURA, vigiar } from '../jefatura/revision/orquestador'
import { MINUTOS_PARA_ESPERAR_AL_BRAZO as BRAZO, leerEstadoDelBrazo } from '../oficina/orquestador-video'
import { HORAS_PARA_DARLO_POR_MUERTO as LOTE, decidirLote } from '../cadena/lote-muerto'
import { HORAS_DESPACHO_SIN_CIERRE as LIMPIADOR, cierreDeDespacho } from '../incidentes/ciclo-de-vida'
import { ATASCADA_MS as CORRIDAS } from '../direccion/corridas'
import { ATASCADO_MS as RIESGOS } from '../direccion/riesgos'

const MIN = 60_000
const AHORA = new Date('2026-11-11T12:00:00Z')
const hace = (min: number) => new Date(AHORA.getTime() - min * MIN).toISOString()
/** las corridas reales (en ms): 10 cortas y la más larga medida */
const corridas = (masLargaMin: number, n = CORRIDAS_MINIMAS) => [...Array.from({ length: n - 1 }, () => 3 * MIN), masLargaMin * MIN]
const NAUFRAGO_JEFE = corridas(25)
const B2B_BRIEF = corridas(32)
const ok = <T>(valor: T) => ({ ok: true as const, valor })
const latiendo = (desdeMin: number, ultimoMin = 0.5): DespachoLeido => ({ status: 'running', created_at: hace(desdeMin), running_at: hace(desdeMin), updated_at: hace(ultimoMin) })
const callado = (desdeMin: number): DespachoLeido => ({ status: 'running', created_at: hace(desdeMin), running_at: hace(desdeMin), updated_at: hace(desdeMin) })

describe('los números quedan atados', () => {
  it('latido cada 60 s, 3 perdidos, margen 1,5, mínimo 10 corridas, latido hasta 3 veces el techo', () => {
    expect([LATIDO_DEL_CORREDOR_MS, LATIDOS_PERDIDOS, MARGEN_DEL_TECHO, CORRIDAS_MINIMAS, TECHO_CON_LATIDO]).toEqual([60_000, 3, 1.5, 10, 3])
  })
  it('🔴 los pisos de hoy no cambian: oficina 12 min · jefatura 35 · brazo 45 · lote 2 h · limpiador 24 h · paneles 1 h', () => {
    expect([OFICINA, JEFATURA, BRAZO, LOTE, LIMPIADOR, CORRIDAS, RIESGOS]).toEqual([12, 35, 45, 2, 24, 3_600_000, 3_600_000])
  })
})

describe('el techo medido', () => {
  it('🔴 Náufrago: la corrida más larga de jefe-marketing (25 min) × 1,5 = 37,5 min; más que los 12 de la oficina', () => {
    expect(techoMedidoMs(OFICINA * MIN, NAUFRAGO_JEFE)).toBe(37.5 * MIN)
  })
  it('🔴 B2B: el brief (32 min) en la jefatura: 48 min, más que los 35', () => {
    expect(techoMedidoMs(JEFATURA * MIN, B2B_BRIEF)).toBe(48 * MIN)
  })
  it.each([['oficina', OFICINA], ['jefatura', JEFATURA], ['brazo', BRAZO]])('🔴 nunca más corto que hoy (%s): un agente rápido se queda con el piso', (_n, piso) => {
    expect(techoMedidoMs(piso * MIN, corridas(2))).toBe(piso * MIN)
  })
  it('🔴 con menos de 10 corridas reales, el piso (aunque la única sea larguísima)', () => {
    expect(techoMedidoMs(OFICINA * MIN, corridas(90, CORRIDAS_MINIMAS - 1))).toBe(OFICINA * MIN)
  })
  it('duraciones inválidas (0, negativas, NaN) no cuentan como corridas', () => {
    expect(techoMedidoMs(OFICINA * MIN, [...corridas(25, 9), 0, -5, NaN])).toBe(OFICINA * MIN)
  })
})

describe('el latido', () => {
  it('🔴 late: `running`, latió después de arrancar y hace menos de 3 min', () => {
    expect(late(latiendo(20, 2.9), AHORA)).toBe(true)
    expect(late(latiendo(20, 3), AHORA)).toBe(false)
  })
  it('🔴 sin el corredor nuevo nadie late: un despacho que no latió nunca (updated_at = arranque) no se cree vivo', () => {
    expect(late(callado(1), AHORA)).toBe(false)
  })
  it.each(['completed', 'error', 'sin_cierre', 'accepted'])('🔴 el latido no resucita nada: un despacho «%s» con updated_at fresco no late', (status) => {
    expect(late({ ...latiendo(20), status }, AHORA)).toBe(false)
  })
})

describe('la regla', () => {
  it('🔴 Náufrago: jefe-marketing a los 20 min sigue VIVO (hoy moría a los 12) aunque no haya latido', () => {
    expect(vidaDelPaso({ inicio: hace(20), pisoMs: OFICINA * MIN, duraciones: ok(NAUFRAGO_JEFE), despacho: ok(callado(20)) }, AHORA)).toMatchObject({ estado: 'vivo', techo_min: 38, latiendo: false })
  })
  it('🔴 Náufrago: pasado su techo y sin latido, muere con el texto de siempre', () => {
    expect(vidaDelPaso({ inicio: hace(40), pisoMs: OFICINA * MIN, duraciones: ok(NAUFRAGO_JEFE), despacho: ok(callado(40)) }, AHORA)).toEqual({ estado: 'muerto', techo_min: 38, motivo: 'sin vuelta en 38 min' })
  })
  it('🔴 B2B: el brief pasado su techo pero LATIENDO sigue vivo; pasado 3 veces el techo, muere aunque lata', () => {
    const p = (min: number) => vidaDelPaso({ inicio: hace(min), pisoMs: JEFATURA * MIN, duraciones: ok(B2B_BRIEF), despacho: ok(latiendo(min)) }, AHORA)
    expect(p(60)).toMatchObject({ estado: 'vivo', latiendo: true })
    expect(p(48 * 3 + 1)).toMatchObject({ estado: 'muerto' })
  })
  it('🔴 sin agente ni despacho: el piso de hoy, igual que antes (12 min)', () => {
    expect(vidaDelPaso({ inicio: hace(11), pisoMs: OFICINA * MIN, duraciones: null, despacho: null }, AHORA).estado).toBe('vivo')
    expect(vidaDelPaso({ inicio: hace(12), pisoMs: OFICINA * MIN, duraciones: null, despacho: null }, AHORA).estado).toBe('muerto')
  })
  it.each([
    ['el historial', { duraciones: { ok: false as const, motivo: 'base caída' }, despacho: null }],
    ['el despacho', { duraciones: null, despacho: { ok: false as const, motivo: 'base caída' } }],
  ])('🔴 lo que no se puede leer no mata: %s ilegible → sin_dato, aunque lleve 5 h', (_n, x) => {
    expect(vidaDelPaso({ inicio: hace(300), pisoMs: OFICINA * MIN, ...x }, AHORA)).toMatchObject({ estado: 'sin_dato' })
  })
  it('🔴 inicio ilegible → sin_dato (no se adivina una edad)', () => {
    expect(vidaDelPaso({ inicio: 'ayer', pisoMs: OFICINA * MIN, duraciones: null, despacho: null }, AHORA).estado).toBe('sin_dato')
  })
})

describe('las lecturas', () => {
  it('🔴 un error de la base queda como lectura fallida, nunca como «vacío»; cada agente se lee una vez por vuelta', async () => {
    let veces = 0
    const v = lecturasDeVida({ despacho: async () => { throw new Error('caída') }, duraciones: async () => { veces++; return [1] } })
    expect(await v.despacho('157555', 'jefe-marketing')).toEqual({ ok: false, motivo: 'caída' })
    expect(await v.despacho(null, 'jefe-marketing')).toBeNull()
    expect(await v.despacho('157555', null)).toBeNull()
    await v.duraciones('jefe-marketing'); await v.duraciones('jefe-marketing')
    expect(veces).toBe(1)
    const f = lecturasDeVida({ despacho: async () => null, duraciones: async () => { throw new Error('caída') } })
    expect(await f.duraciones('x')).toEqual({ ok: false, motivo: 'caída' })
  })
  it('🔴 en la base: corridas REALES (completadas, con costo y duración) del agente; el despacho por EJECUCIÓN + AGENTE; un error lanza', async () => {
    const pedidos: Array<{ t: string; f: string[] }> = []
    const db = {
      from(t: string) {
        const p = { t, f: [] as string[] }; pedidos.push(p)
        const api: Record<string, unknown> = {
          select: () => api, eq: (k: string, v: unknown) => { p.f.push(`eq:${k}=${String(v)}`); return api }, gt: (k: string, v: unknown) => { p.f.push(`gt:${k}=${String(v)}`); return api },
          order: () => api, limit: () => api,
          then: (res: (x: unknown) => unknown) => Promise.resolve(t === 'agent_invocations' ? { data: [{ duration_ms: '60000' }], error: null } : { data: [], error: null }).then(res),
        }
        return api
      },
    }
    const l = lectorDeVidaDeSupabase(db)
    expect(await l.duraciones('jefe-marketing')).toEqual([60000])
    expect(pedidos[0]).toEqual({ t: 'agent_invocations', f: ['eq:agent_id=jefe-marketing', 'eq:status=completed', 'gt:cost_usd=0', 'gt:duration_ms=0'] })
    expect(await l.despacho('157555', 'jefe-marketing')).toBeNull()
    expect(pedidos[1]).toEqual({ t: 'agent_dispatches', f: ['eq:workflow_execution_id=157555', 'eq:agent_name=jefe-marketing'] })
    const caida = { from: () => { const a: Record<string, unknown> = { select: () => a, eq: () => a, gt: () => a, order: () => a, limit: () => a, then: (res: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caída' } }).then(res) }; return a } }
    await expect(lectorDeVidaDeSupabase(caida).duraciones('x')).rejects.toThrow(/caída/)
    await expect(lectorDeVidaDeSupabase(caida).despacho('157555', 'jefe-marketing')).rejects.toThrow(/caída/)
  })
  it('🔴 el lector de la base ELIGE entre los despachos de la ejecución (no toma el primero que llega)', async () => {
    const filas = [
      { status: 'completed', created_at: hace(5), running_at: hace(5), updated_at: hace(4) },
      { status: 'running', created_at: hace(30), running_at: hace(30), updated_at: hace(1) },
    ]
    const db = { from: () => { const a: Record<string, unknown> = { select: () => a, eq: () => a, order: () => a, limit: () => a, then: (res: (x: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(res) }; return a } }
    expect(await lectorDeVidaDeSupabase(db).despacho('158901', 'jefe-marketing')).toBe(filas[1])
  })
  it('🔴 con un reintento hay 2 despachos de la misma ejecución y agente: vale el que sigue running; si ninguno, el más nuevo', () => {
    const viejoVivo = { status: 'running', created_at: hace(30), running_at: hace(30), updated_at: hace(1) }
    const nuevoListo = { status: 'completed', created_at: hace(10), running_at: hace(10), updated_at: hace(5) }
    const nuevoError = { status: 'error', created_at: hace(5), running_at: hace(5), updated_at: hace(4) }
    expect(elegirDespacho([nuevoListo, viejoVivo])).toBe(viejoVivo)
    expect(elegirDespacho([nuevoListo, nuevoError])).toBe(nuevoError)
    expect(elegirDespacho([])).toBeNull()
  })
})

describe('🔴 una sola regla: todos los que deciden si algo sigue vivo pasan por ella', () => {
  const RAIZ = path.resolve(__dirname, '..')
  const DECIDEN = ['oficina/vigia.ts', 'jefatura/revision/orquestador.ts', 'cadena/lote-muerto.ts', 'incidentes/ciclo-de-vida.ts', 'direccion/corridas.ts', 'direccion/riesgos.ts']
  it.each(DECIDEN)('%s usa vidaDelPaso', (f) => {
    expect(fs.readFileSync(path.join(RAIZ, f), 'utf8')).toMatch(/vidaDelPaso\(/)
  })
  it.each(DECIDEN)('%s ya no compara una edad de despacho o de paso contra su número propio a mano', (f) => {
    const s = fs.readFileSync(path.join(RAIZ, f), 'utf8')
    expect(s).not.toMatch(/Date\.parse\(String\(d\.created_at\)\)\s*<\s*(now|ahora)/)
    expect(s).not.toMatch(/hora - ultimo < HORAS_PARA_DARLO_POR_MUERTO/)
    expect(s).not.toMatch(/edad < HORAS_DESPACHO_SIN_CIERRE/)
  })
})

describe('cada lugar con la regla (Náufrago y B2B)', () => {
  it('🔴 limpiador de incidentes: un despacho de 30 h que SIGUE LATIENDO no se cierra; uno callado sí, con el texto de siempre', () => {
    expect(cierreDeDespacho(latiendo(30 * 60) as never, AHORA)).toBeNull()
    expect(cierreDeDespacho(callado(30 * 60) as never, AHORA)).toBe('sin cierre registrado tras 30 h')
    expect(cierreDeDespacho(callado(23 * 60) as never, AHORA)).toBeNull()
  })
  it('🔴 lote de la cadena: a las 2 h sin parte se reintenta; a 1 h 59 todavía no (el piso de hoy)', () => {
    const e = (min: number) => ({ envios: 1, reintentos: 0, ultimo: 0, libre: 1, ultimo_en: hace(min) })
    expect(decidirLote({ idempotency_key: 'c:2026-W46:1' }, e(119), AHORA.toISOString()).tipo).toBe('sano')
    expect(decidirLote({ idempotency_key: 'c:2026-W46:1' }, e(120), AHORA.toISOString()).tipo).toBe('reintentar')
  })
  it('🔴 brazo de video: con un techo medido mayor, un video en curso a los 50 min no se da por perdido; con los 45 de hoy, sí', () => {
    const st = { ok: true, simulado: false, terminal: false, status: 'in_progress' } as never
    expect(leerEstadoDelBrazo(st, hace(50), AHORA, 60)).toBeNull()
    expect(leerEstadoDelBrazo(st, hace(50), AHORA)).toMatchObject({ ok: false, status: 'sin_vuelta' })
  })
  it('🔴 jefatura: un paso de B2B de 40 min cuyo agente tarda hasta 32 min sigue vivo (techo 48); sin lector, el piso de 35 como hoy', async () => {
    const guardados: unknown[] = []
    const rev = { id: 'r1', estado: 'corriendo', client_id: 'b2b', artifact_id: 'a', estado_del_motor: { vueltas: {} }, gasto_usd: 0 }
    const P = { almacen: { pasosCorriendoAntesDe: async () => [{ revision_id: 'r1', n: 2, paso: 'calificacion:editor', inicio: hace(40), agente: 'campaign-brief-agent', dispatch_key: 'r1:2', workflow_execution_id: '158901' }], leerRevision: async () => rev, guardar: async (c: unknown) => { guardados.push(c) } } } as never
    const lector = { despacho: async () => callado(40), duraciones: async () => B2B_BRIEF }
    expect(await vigiar(P, AHORA, lector)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(guardados).toEqual([])
    expect((await vigiar(P, AHORA)).reanudar).toEqual(['r1'])
    const caido = { despacho: async () => { throw new Error('caída') }, duraciones: async () => B2B_BRIEF }
    guardados.length = 0
    expect(await vigiar(P, AHORA, caido)).toMatchObject({ reanudar: [], fallidos: [], sin_dato: [{ revision_id: 'r1', motivo: expect.stringContaining('caída') }] })
    expect(guardados).toEqual([])
  })
})

describe('el latido llega a la jefatura por ejecución + agente (CC6 21A)', () => {
  it('🔴 un paso de 80 min (pasó su techo de 48) que late en el libro sigue vivo; con la llave de SU turno no se encontraría nada', async () => {
    const guardados: unknown[] = []
    const rev = { id: 'r1', estado: 'corriendo', client_id: 'b2b', artifact_id: 'a', estado_del_motor: { vueltas: {} }, gasto_usd: 0 }
    const P = { almacen: { pasosCorriendoAntesDe: async () => [{ revision_id: 'r1', n: 2, paso: 'calificacion:editor', inicio: hace(80), agente: 'campaign-brief-agent', dispatch_key: 'r1:2', workflow_execution_id: '158901' }], leerRevision: async () => rev, guardar: async (c: unknown) => { guardados.push(c) } } } as never
    // el libro, con la forma REAL de su llave: el lector falso FILTRA por lo que recibe
    const libro = [{ dispatch_key: 'dispatch:wf-jefatura:campaign-brief-agent:158901', workflow_execution_id: '158901', agent_name: 'campaign-brief-agent', status: 'running', created_at: hace(80), running_at: hace(80), updated_at: hace(1) }]
    const pedidos: string[][] = []
    const lector = { despacho: async (e: string, a: string) => { pedidos.push([e, a]); return elegirDespacho(libro.filter((d) => d.workflow_execution_id === e && d.agent_name === a)) }, duraciones: async () => B2B_BRIEF }
    expect(await vigiar(P, AHORA, lector)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(pedidos).toEqual([['158901', 'campaign-brief-agent']])
    libro[0].updated_at = hace(10) // dejó de latir hace 10 min (más de 3 latidos)
    expect((await vigiar(P, AHORA, lector)).reanudar).toEqual(['r1'])
  })
})
