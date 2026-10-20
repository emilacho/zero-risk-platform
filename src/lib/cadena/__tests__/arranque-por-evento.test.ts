/**
 * EL ARRANQUE POR EVENTO (CC#2 · 20-oct · parte 3 «que las piezas se produzcan solas») · en seco: sin base, sin red, sin modelo (US$ 0). La SALA es la de verdad (el orquestador de intake y su libro) en memoria.
 *   · nace APAGADO (`cadena_config.arranque_por_evento`): al activarse la campaña no pasa nada nuevo
 *   · encendido: al pasar a `activa`, los MISMOS sobres de lote que dejaría el reloj, con la MISMA llave (el reloj después los ve `duplicado`)
 *   · nunca frena el cambio de estado (intake apagado, error al leer) · la llave de lote lleva la huella de sus filas · la campaña nace con producción automática solo si el interruptor lo manda
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  abrirCampana, avanzarCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, filasLotes, filasMarcar, huellaDeLote, lotesVencidos,
  type Estrategia,
} from '../index'
import { arrancarAlActivar, MAXIMO_DE_LOTES_POR_ARRANQUE, sobreDeLote } from '../arranque'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const HOY_DEL_LOTE = '2026-10-12T10:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const almacen = (config: Record<string, unknown> = {}, extra: Partial<ConstructorParameters<typeof AlmacenMemoria>[0]> = {}) => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', ...config }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }], ...extra,
})
const ok = (o: unknown, costo = 0.3) => ({ success: true, structured_output: o, cost_usd: costo })
async function campanaActiva(al: AlmacenMemoria) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia as Estrategia) }, AHORA)
  const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
  await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
  return id
}
const pausarYActivar = async (al: AlmacenMemoria, id: string, ahora = HOY_DEL_LOTE) => {
  await avanzarCampana(al, { ...wf(), campana_id: id, a: 'pausada' }, ahora)
  return avanzarCampana(al, { ...wf(), campana_id: id, a: 'activa' }, ahora)
}
const eventos = async (al: AlmacenMemoria) => (await al.sala.select({ tenant_id: A.clientId })) as unknown as Array<{ idempotency_key: string; payload: { envelope_payload: Record<string, any> } }>

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('APAGADO por omisión', () => {
  it('sin el interruptor, activar la campaña NO deja ningún sobre y la respuesta no trae `arranque` (todo como hoy)', async () => {
    const al = almacen(); const id = await campanaActiva(al)
    const r = await pausarYActivar(al, id)
    expect(r.status).toBe(200); expect(r.cuerpo).not.toHaveProperty('arranque'); expect(al.sala.size).toBe(0)
  })
  it('valores que no son el booleano `true` (cadena «true», 1, null) tampoco lo encienden', async () => {
    for (const v of ['true', 1, null, 'si']) {
      const al = almacen({ arranque_por_evento: v }); const id = await campanaActiva(al)
      expect((await pausarYActivar(al, id)).cuerpo).not.toHaveProperty('arranque'); expect(al.sala.size).toBe(0)
    }
  })
})

describe('ENCENDIDO · los mismos sobres que el reloj', () => {
  it('al activarse deja un sobre por lote vencido, idéntico al del vigía (misma llave, mismo cuerpo), y lo cuenta', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    const reloj = (await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-10-12' }, HOY_DEL_LOTE)).cuerpo.lotes as Array<{ lote: string; fila_ids: string[]; idempotency_key: string }>
    expect(reloj.length).toBeGreaterThan(0)
    const r = await pausarYActivar(al, id)
    expect(r.cuerpo.arranque).toMatchObject({ arranque: 'hecho', lotes: reloj.length, aceptados: reloj.length, duplicados: 0, rechazados: [] })
    const ev = await eventos(al)
    // la sala guarda la llave HASHEADA con su fuente y su intención: lo que se compara es el cuerpo de cada sobre, que es el del vigía lote por lote
    expect(ev).toHaveLength(reloj.length)
    const c = al.campanas[0]
    expect(ev.map((e) => JSON.stringify(e.payload.envelope_payload)).sort()).toEqual(reloj.map((l) => JSON.stringify(sobreDeLote(c, l).payload)).sort())
    expect(ev[0].payload.envelope_payload).toMatchObject({ modo: 'parte', campana_id: id, client_id: A.clientId, dry_run: true })
  })
  it('🔴 idempotente con el reloj y con sí mismo: activar de nuevo no produce dos veces (todo `duplicado`)', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    const primera = (await pausarYActivar(al, id)).cuerpo.arranque as { aceptados: number }
    const n = al.sala.size
    const segunda = (await pausarYActivar(al, id)).cuerpo.arranque as { aceptados: number; duplicados: number }
    expect(segunda).toMatchObject({ aceptados: 0, duplicados: primera.aceptados }); expect(al.sala.size).toBe(n)
  })
  it('solo arranca al pasar a `activa`: pausar o cerrar no deja sobres ni trae `arranque`', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    const p = await avanzarCampana(al, { ...wf(), campana_id: id, a: 'pausada' }, HOY_DEL_LOTE)
    expect(p.cuerpo).not.toHaveProperty('arranque'); expect(al.sala.size).toBe(0)
  })
  it('antes de que venza ningún lote (hoy lejos de las fechas) arranca con 0 lotes y no deja nada', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    expect((await pausarYActivar(al, id, '2026-09-01T10:00:00Z')).cuerpo.arranque).toMatchObject({ arranque: 'hecho', lotes: 0, aceptados: 0 }); expect(al.sala.size).toBe(0)
  })
})

describe('NUNCA frena el cambio de estado', () => {
  it('con la sala apagada el arranque declara los rechazos y la campaña queda `activa` igual (el reloj lo recoge)', async () => {
    const al = almacen({ arranque_por_evento: true }, { intakeApagado: true }); const id = await campanaActiva(al)
    const r = await pausarYActivar(al, id)
    expect(r.status).toBe(200); expect(al.campanas[0].estado).toBe('activa')
    const a = r.cuerpo.arranque as { aceptados: number; rechazados: Array<{ detalle: string }> }
    expect(a.aceptados).toBe(0); expect(a.rechazados.length).toBeGreaterThan(0); expect(a.rechazados[0].detalle).toContain('intake_apagado')
  })
  it('si falla algo al calcular los lotes devuelve `fallo` y la campaña queda `activa`', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    al.filas = async () => { throw new Error('base caída') }
    const r = await pausarYActivar(al, id)
    expect(r.status).toBe(200); expect(al.campanas[0].estado).toBe('activa'); expect(r.cuerpo.arranque).toEqual({ arranque: 'fallo', error: 'base caída' })
  })
  it('tope por arranque: nunca más de MAXIMO_DE_LOTES_POR_ARRANQUE sobres de una vez', async () => {
    const al = almacen({ arranque_por_evento: true, holgura_dias: 400 }); const id = await campanaActiva(al)
    const base = await al.filas(id, 1)
    const filas = Array.from({ length: 30 }, (_, i) => ({ ...base[0], id: `x${i}`, estado: 'validada', fecha: new Date(Date.UTC(2026, 9, 13 + 7 * i)).toISOString().slice(0, 10) }))
    al.filas = async () => filas as never
    const r = await arrancarAlActivar(al, al.campanas[0], HOY_DEL_LOTE)
    expect(r).toMatchObject({ arranque: 'hecho', lotes: MAXIMO_DE_LOTES_POR_ARRANQUE, aceptados: MAXIMO_DE_LOTES_POR_ARRANQUE }); expect(al.sala.size).toBe(MAXIMO_DE_LOTES_POR_ARRANQUE)
  })
})

describe('LA LLAVE DE LOTE lleva la huella de sus filas (el hueco: filas de la misma semana que vencen otro día)', () => {
  it('la huella no depende del orden, y cambia con el conjunto', () => {
    expect(huellaDeLote(['a', 'b', 'c'])).toBe(huellaDeLote(['c', 'a', 'b'])); expect(huellaDeLote(['a', 'b'])).not.toBe(huellaDeLote(['a', 'b', 'c']))
    expect(huellaDeLote(['a'])).toMatch(/^[0-9a-f]{8}$/)
  })
  it('🔴 después de briefear una parte de la semana, las filas que quedan de ESA semana salen con otra llave (antes: la misma ⇒ `duplicado` ⇒ se perdían)', async () => {
    const al = almacen({ arranque_por_evento: true }); const id = await campanaActiva(al)
    const camp = al.campanas[0]
    const primero = (await lotesVencidos(al, camp, '2026-10-12')).lotes
    const semana = primero.find((l) => l.fila_ids.length >= 2)!
    expect(semana).toBeTruthy()
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: [semana.fila_ids[0]] })
    const despues = (await lotesVencidos(al, camp, '2026-10-12')).lotes.find((l) => l.lote === semana.lote)!
    expect(despues.fila_ids).not.toContain(semana.fila_ids[0])
    expect(despues.idempotency_key).not.toBe(semana.idempotency_key)
    expect(despues.idempotency_key.startsWith(`${id}:${semana.lote}:1:`)).toBe(true)
    // y la sala ya no los confunde: ambos entran
    for (const l of [semana, despues]) expect((await al.emitirSobre(sobreDeLote(camp, l))).resultado).toBe('aceptado')
    expect(al.sala.size).toBe(2)
  })
  it('el mismo conjunto de filas sigue siendo idempotente (misma llave ⇒ `duplicado`)', async () => {
    const al = almacen({ arranque_por_evento: true }); await campanaActiva(al); const camp = al.campanas[0]
    const l = (await lotesVencidos(al, camp, '2026-10-12')).lotes[0]
    expect((await al.emitirSobre(sobreDeLote(camp, l))).resultado).toBe('aceptado'); expect((await al.emitirSobre(sobreDeLote(camp, l))).resultado).toBe('duplicado')
  })
})

describe('LA CAMPAÑA NACE con la producción automática solo si el interruptor lo manda', () => {
  const abrir = async (config: Record<string, unknown>) => {
    const al = almacen(config)
    const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    return (r.cuerpo.campana as { autoproducir: boolean }).autoproducir
  }
  it('por omisión nace en false (como hoy); con `autoproducir_por_omision: true` nace en true', async () => {
    expect(await abrir({})).toBe(false); expect(await abrir({ autoproducir_por_omision: true })).toBe(true)
  })
  it('solo el booleano `true` lo enciende', async () => {
    for (const v of ['true', 1, 'si', null, {}]) expect(await abrir({ autoproducir_por_omision: v }), String(v)).toBe(false)
  })
})
