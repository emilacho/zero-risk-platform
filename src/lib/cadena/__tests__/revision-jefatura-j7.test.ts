/**
 * J7 · el punto de espera «antes de pasar» (condición 4 de CC#3) · pruebas a costo cero, sin base, sin red, sin modelo.
 * Se juega la cadena con un agente simulado y una jefatura simulada que decide si retiene (`al.retencion`).
 */
import { describe, it, expect } from 'vitest'
import {
  abrirCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, relojDeLaCadena,
} from '../index'
import { decidirRetencion, estrategiaPasar, calendarioPasar, objetoDeRetencion, TIPO_DE_ESPERA, type ConfigParaRetener } from '../revision-jefatura'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })

function almacen(retiene: boolean | { estrategia?: boolean; calendario?: boolean }) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'] },
    journeys: [],
  })
  al.retencion = async (tipo) => {
    const r = typeof retiene === 'boolean' ? retiene : retiene[tipo] === true
    return { retener: r, motivo: r ? 'jefatura_activa' : 'jefatura_apagada' }
  }
  return al
}
const abrir = async (al: AlmacenMemoria) => (await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)).cuerpo.campana as { id: string }

async function guardarEstrategia(al: AlmacenMemoria) {
  const { id } = await abrir(al)
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
  return { id, g }
}
async function guardarTanda(al: AlmacenMemoria, id: string, tanda = 1) {
  const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda }, AHORA)
  return calendarioGuardar(al, { ...wf(), campana_id: id, tanda, corrida_id: p.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
}
const estado = async (al: AlmacenMemoria, id: string) => (await al.campana(id))!.estado
const vivas = async (al: AlmacenMemoria) => (await al.esperasVivas()).filter((e) => e.objeto_tipo === TIPO_DE_ESPERA)

describe('decidirRetencion · la misma puerta que abrirRevision', () => {
  const cfg = (o: Partial<ConfigParaRetener>): ConfigParaRetener => ({ estado: 'encendida', tipos_activos: ['estrategia', 'calendario'], clientes_ensayo: [], ...o })
  const base = { tipo: 'estrategia' as const, client_id: 'c1', politica: { activa: true } }
  it('apagada · ilegible · tipo no activo · fuera del ensayo · sin política: no retiene', () => {
    expect(decidirRetencion({ ...base, config: null }).retener).toBe(false)
    expect(decidirRetencion({ ...base, config: cfg({ estado: 'apagada' }) }).retener).toBe(false)
    expect(decidirRetencion({ ...base, config: cfg({ tipos_activos: ['brief'] }) }).retener).toBe(false)
    expect(decidirRetencion({ ...base, config: cfg({ estado: 'ensayo', clientes_ensayo: ['otro'] }) }).retener).toBe(false)
    expect(decidirRetencion({ ...base, config: cfg({}), politica: null }).retener).toBe(false)
  })
  it('ensayo no exige política activa (como abrirRevision); encendida sí', () => {
    const inactiva = { activa: false }
    expect(decidirRetencion({ ...base, politica: inactiva, config: cfg({ estado: 'ensayo', clientes_ensayo: ['c1'] }) }).retener).toBe(true)
    expect(decidirRetencion({ ...base, politica: inactiva, config: cfg({ estado: 'encendida' }) }).motivo).toBe('politica_inactiva')
    expect(decidirRetencion({ ...base, config: cfg({}) }).retener).toBe(true)
  })
})

describe('apagado = idéntico a hoy', () => {
  it('sin retención: guardar mueve la campaña a calendario en la misma llamada y no abre esperas', async () => {
    const al = almacen(false)
    const { id, g } = await guardarEstrategia(al)
    expect(g.status).toBe(200)
    expect(g.cuerpo.retenida_para_revision).toBeUndefined()
    expect(await estado(al, id)).toBe('calendario')
    expect(await vivas(al)).toHaveLength(0)
    await guardarTanda(al, id)
    expect(await estado(al, id)).toBe('activa')
    expect(await vivas(al)).toHaveLength(0)
  })
  it('un almacén que falla o sin la capacidad tampoco retiene', async () => {
    const al = almacen(true)
    al.retencion = async () => { throw new Error('base caída') }
    const { id } = await guardarEstrategia(al)
    expect(await estado(al, id)).toBe('calendario')
  })
})

describe('retención de la estrategia', () => {
  it('guarda validada, NO pasa y abre la espera con reloj; pasar hace la transición idéntica y devuelve las fechas pedidas', async () => {
    const al = almacen(true)
    const { id, g } = await guardarEstrategia(al)
    const r = g.cuerpo.retenida_para_revision as { objeto_id: string }
    expect(r.objeto_id).toBe(objetoDeRetencion('estrategia', 1))
    expect((await al.ultimaEstrategia(id))!.estado).toBe('validada')
    expect(await estado(al, id)).not.toBe('calendario')
    expect(await vivas(al)).toHaveLength(1)

    const p = await estrategiaPasar(al, { ...wf(), campana_id: id, version: 1, revision: { id: 'r1', estado: 'cerrada', resultado: 'aprobada', con_desacuerdo: false } })
    expect(p.status).toBe(200)
    expect(p.cuerpo.ok).toBe(true)
    expect(await estado(al, id)).toBe('calendario')
    expect(Array.isArray(p.cuerpo.fechas_pedidas)).toBe(true)
    expect(await vivas(al)).toHaveLength(0)

    // idempotente
    const otra = await estrategiaPasar(al, { ...wf(), campana_id: id, version: 1 })
    expect(otra.status).toBe(200)
    expect(otra.cuerpo.ya_pasada).toBe(true)
  })
  it('pasar sin que nunca se retuviera: 409 E-SIN-RETENCION y no mueve nada', async () => {
    const al = almacen(false)
    const { id } = await guardarEstrategia(al)
    const antes = await estado(al, id)
    // simulamos una campaña que aún no pasó: la devolvemos a estrategia
    al.campanas.find((c) => c.id === id)!.estado = 'estrategia'
    const r = await estrategiaPasar(al, { ...wf(), campana_id: id, version: 1 })
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-SIN-RETENCION')
    expect(antes).toBe('calendario')
    expect(await estado(al, id)).toBe('estrategia')
  })
  it('sin credenciales de flujo: 403/400, nunca pasa', async () => {
    const al = almacen(true)
    const { id } = await guardarEstrategia(al)
    const r = await estrategiaPasar(al, { campana_id: id, version: 1 })
    expect([400, 403]).toContain(r.status)
    expect(await estado(al, id)).not.toBe('calendario')
  })
})

describe('retención del calendario', () => {
  it('la primera tanda guarda las filas pero la campaña NO pasa a activa hasta pasar', async () => {
    const al = almacen({ calendario: true })
    const { id } = await guardarEstrategia(al)
    expect(await estado(al, id)).toBe('calendario')
    const g = await guardarTanda(al, id)
    expect(g.status).toBe(200)
    expect((g.cuerpo.retenida_para_revision as { tipo: string }).tipo).toBe('calendario')
    expect(await estado(al, id)).toBe('calendario')
    expect((await al.filas(id)).length).toBeGreaterThan(0)
    expect(await vivas(al)).toHaveLength(1)

    const p = await calendarioPasar(al, { ...wf(), campana_id: id, tanda: 1 })
    expect(p.status).toBe(200)
    expect(await estado(al, id)).toBe('activa')
    expect(await vivas(al)).toHaveLength(0)
    expect((await calendarioPasar(al, { ...wf(), campana_id: id, tanda: 1 })).cuerpo.ya_pasada).toBe(true)
  })
})

describe('🔴 la cadena nunca queda de rehén de la jefatura', () => {
  it('al vencer la espera el reloj pasa la campaña sin revisión y avisa', async () => {
    const al = almacen(true)
    const { id } = await guardarEstrategia(al)
    expect(await estado(al, id)).not.toBe('calendario')
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-10T13:00:00Z') // 25 h > vence 24 h
    expect(JSON.stringify(r.cuerpo)).toContain('pasó sin revisión')
    expect(JSON.stringify(r.cuerpo.alertas)).toContain('no cerró a tiempo')
    expect(await estado(al, id)).toBe('calendario')
    expect(await vivas(al)).toHaveLength(0)
  })
  it('antes de vencer el reloj no la mueve', async () => {
    const al = almacen(true)
    const { id } = await guardarEstrategia(al)
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-09T13:00:00Z')
    expect(await estado(al, id)).not.toBe('calendario')
    expect(await vivas(al)).toHaveLength(1)
  })
  it('un reintento de guardar no duplica la espera', async () => {
    const al = almacen(true)
    const { id } = await guardarEstrategia(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    expect((await vivas(al)).length).toBe(1)
  })
})
