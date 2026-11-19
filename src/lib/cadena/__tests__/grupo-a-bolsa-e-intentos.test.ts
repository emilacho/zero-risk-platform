/**
 * 18-nov · «NADA detiene el flujo» · grupo A (GO de Lenovo 13:52Z · PLAN-CC3-grupo-A-bolsa-e-intentos-sin-necesita-humano.md).
 *   · la bolsa de planificación que no alcanza se agranda SOLA al triple de la de nacimiento, una vez, sin pasar el tope de la campaña;
 *   · bolsa o intentos agotados: la campaña NO cambia de estado (nunca `necesita_humano`) y la alerta sale UNA vez por incidente;
 *   · la llave que agotó sus 3 intentos sigue con la llave del tramo (`:r<tramo>`), nunca en el mismo tramo en que se agotó;
 *   · el reloj retoma la estrategia atascada dejando el sobre del plan (uno por tramo).
 * Cliente sintético.
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaPreparar, estrategiaGuardar, relojDeLaCadena, topeDelPaso } from '../index'
import { bolsaAgrandada, esDeLaLlave, llaveDeReintentoDelPaso, prepararCorrida, tramoDeReintento } from '../nucleo'
import { tramoDeReemision } from '../mesas'
import { bolsaDePlanificacion, COSTO_DE_LA_ESTRATEGIA_USD, COSTO_POR_TANDA_USD, medidaDeCampana, MULTIPLO_DE_LA_BOLSA, PRESUPUESTO_PLANIFICACION_POR_OMISION } from '../constantes'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T08:00:00Z' // tramo «am»
const TARDE = '2026-10-09T14:00:00Z' // tramo «pm» del mismo día
const LUNES = '2026-10-12T08:00:00Z' // con «día 1 = el día en que se abre» (#1175), una campaña de 12 semanas justas se abre un lunes
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const falla = { success: false, error: 'E-OUTPUT-SCHEMA-MISSING', cost_usd: 0.2 }

function almacen() {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
async function abierta(al: AlmacenMemoria) {
  const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  return (r.cuerpo.campana as { id: string }).id
}
/** tres intentos de la estrategia que no entregan el objeto, a la hora `ahora` */
async function tresFallas(al: AlmacenMemoria, id: string, ahora: string) {
  for (let i = 0; i < 3; i++) {
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, ahora)
    expect(p.status).toBe(200)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: falla }, ahora)
  }
}

describe('la bolsa de planificación · 3 × (estrategia + tandas), con lo medido (DECISION-EMILIO-topes-con-margen-triple · Lenovo 15:12Z)', () => {
  // 12 semanas de un lunes a un domingo = 3 tandas; Náufrago (viernes 06-nov → jueves 28-ene) = 13 semanas = 4 tandas
  const DOCE = { fecha_inicio: '2026-11-16', fecha_fin: '2027-02-07' }
  const NAUFRAGO = { fecha_inicio: '2026-11-06', fecha_fin: '2027-01-28' }
  it('la cuenta escrita: estrategia 1,42 + 1,24 por tanda, × 3', () => {
    expect(COSTO_DE_LA_ESTRATEGIA_USD).toBe(1.42)
    expect(COSTO_POR_TANDA_USD).toBe(1.24)
    expect(MULTIPLO_DE_LA_BOLSA).toBe(3)
    expect(bolsaDePlanificacion(3)).toBe(15.42)
    expect(bolsaDePlanificacion(4)).toBe(19.14)
    expect(bolsaDePlanificacion(1)).toBe(7.98)
    expect(medidaDeCampana(DOCE).totalTandas).toBe(3)
    expect(medidaDeCampana(NAUFRAGO).totalTandas).toBe(4)
  })
  it('nunca menos que los US$ 6 de siempre', () => {
    expect(PRESUPUESTO_PLANIFICACION_POR_OMISION).toBe(6)
    expect(bolsaDePlanificacion(0)).toBe(6)
    expect(bolsaDePlanificacion(Number.NaN)).toBe(6)
  })
  it('la bolsa vieja de 6 crece hasta la de su regla; ya en ella (o más) no se toca', () => {
    expect(bolsaAgrandada({ ...NAUFRAGO, presupuesto_planificacion_usd: 6, tope_gasto_usd: 150 }, 'calendario')).toBe(19.14)
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 6, tope_gasto_usd: null }, 'estrategia')).toBe(15.42)
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 15.42, tope_gasto_usd: 150 }, 'calendario')).toBeNull()
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 25, tope_gasto_usd: 150 }, 'calendario')).toBeNull()
  })
  it('nunca pasa el tope de gasto de la campaña', () => {
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 6, tope_gasto_usd: 10 }, 'calendario')).toBe(10)
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 6, tope_gasto_usd: 6 }, 'calendario')).toBeNull()
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 6, tope_gasto_usd: 0 }, 'calendario')).toBe(15.42) // 0 = sin tope (como `topeDeLaCampana`)
  })
  it('la bolsa del lector no es de planificación: no crece', () => {
    expect(bolsaAgrandada({ ...DOCE, presupuesto_planificacion_usd: 6, tope_gasto_usd: 150 }, 'fichas')).toBeNull()
  })
})

describe('la bolsa al triple · por el camino real', () => {
  it('Náufrago: US$ 5,14 de la bolsa vieja de 6 → pasa sola a la de su regla (4 tandas = 19,14) y el paso corre (sin necesita_humano)', async () => {
    const al = almacen(); const id = await abierta(al)
    const c = al.campanas[0]
    Object.assign(c, { tope_gasto_usd: 150, presupuesto_planificacion_usd: 6, fecha_inicio: '2026-11-06', fecha_fin: '2027-01-28' })
    al.corridas.push({ id: 900, campana_id: id, paso: 'estrategia', clave_idempotencia: 'antes', intento: 1, workflow_id: 'wf', workflow_execution_id: 'x', modelo: 'm', costo_usd: 5.14, estado: 'ok', plazo_en: null, error: null, revision_editor: 'saltada_por_diseno', salida_estructurada: true, esquema_hash: 'h', seco: true })
    const p = await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf', 'e', AHORA, 'm', 'h')
    expect(p.tipo).toBe('lista')
    if (p.tipo !== 'lista') return
    expect(p.bolsa_agrandada).toEqual({ de: 6, a: 19.14 })
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(19.14)
    expect(al.campanas[0].estado).not.toBe('necesita_humano')
  })
  it('una campaña nueva nace con la bolsa de su regla, y con la bolsa que alcanza no se toca nada', async () => {
    const al = almacen(); await abierta(al)
    const nace = bolsaDePlanificacion(medidaDeCampana(al.campanas[0]).totalTandas)
    expect(nace).toBeGreaterThan(6)
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(nace)
    const p = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf', 'e', AHORA, 'm', 'h')
    expect(p.tipo).toBe('lista')
    expect(p.tipo === 'lista' ? p.bolsa_agrandada : 'x').toBeUndefined()
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(nace)
  })
  it('🔴 el triple que tampoco alcanza: 409 sin cambiar el estado, UNA alerta (la segunda vez, ninguna)', async () => {
    const al = almacen(); const id = await abierta(al)
    al.corridas.push({ id: 900, campana_id: id, paso: 'calendario', clave_idempotencia: 'antes', intento: 1, workflow_id: 'wf', workflow_execution_id: 'x', modelo: 'm', costo_usd: 25, estado: 'ok', plazo_en: null, error: null, revision_editor: 'saltada_por_diseno', salida_estructurada: true, esquema_hash: 'h', seco: true })
    const antes = al.campanas[0].estado
    al.campanas[0].presupuesto_planificacion_usd = 6 // nació con la bolsa vieja: crece a la suya, y aun así no alcanza
    const suya = bolsaDePlanificacion(medidaDeCampana(al.campanas[0]).totalTandas)
    const r1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(r1.status).toBe(409)
    expect(r1.cuerpo).toMatchObject({ error: 'presupuesto_agotado', necesita_humano: false, reintenta: true })
    expect(String(r1.cuerpo.alerta)).toMatch(/sigue sola/)
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(suya)
    expect(al.campanas[0].estado).toBe(antes)
    expect(al.campanas[0].estado_motivo).toMatch(/^reintento automático · estrategia · la bolsa/)
    const r2 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, TARDE)
    expect(r2.status).toBe(409)
    expect(r2.cuerpo.alerta).toBeNull()
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano')).toBe(false)
  })
})

describe('🔴 una campaña de 12 semanas planifica ENTERA sin pararse (la prueba que pidió Lenovo)', () => {
  /** estrategia + su corrección y cada tanda + su corrección, con el costo MÁS ALTO medido en Náufrago para cada pasada (0,77) */
  async function planificar(al: AlmacenMemoria) {
    const c = al.campanas[0]
    const pasos: Array<[ 'estrategia' | 'calendario', string ]> = [['estrategia', 'v1:c0'], ['estrategia', 'v1:c1']]
    for (let t = 1; t <= medidaDeCampana(c).totalTandas; t++) pasos.push(['calendario', `t${t}:v1:c0`], ['calendario', `t${t}:v1:c1`])
    const dijo: string[] = []
    for (const [paso, k] of pasos) {
      const p = await prepararCorrida(al, al.campanas[0], paso, k, 'wf', 'e', AHORA, 'm', 'h')
      dijo.push(p.tipo)
      if (p.tipo === 'lista') await al.cerrarCorrida(p.corrida.id, { estado: 'ok', costo_usd: 0.77 })
    }
    return dijo
  }
  it('abierta un lunes para 84 días (12 semanas, 3 tandas): 8 pasadas, todas corren', async () => {
    const al = almacen()
    await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true, dias_de_campana: 84 }, LUNES)
    expect(medidaDeCampana(al.campanas[0])).toMatchObject({ totalSemanas: 12, totalTandas: 3 })
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(15.42)
    expect(await planificar(al)).toEqual(Array(8).fill('lista'))
  })
  it('con la bolsa vieja de US$ 6 fijos (y sin dejarla crecer) se paraba a media planificación: la regla es la que la deja terminar', async () => {
    const al = almacen()
    await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true, dias_de_campana: 84 }, LUNES)
    Object.assign(al.campanas[0], { presupuesto_planificacion_usd: 6, tope_gasto_usd: 6 })
    expect(await planificar(al)).toContain('presupuesto_agotado')
  })
})

describe('la llave del reintento', () => {
  it('el tramo es el mismo del vigía', () => {
    for (const t of ['2026-10-09T00:00:00Z', '2026-10-09T11:59:59Z', '2026-10-09T12:00:00Z', '2026-10-09T23:59:59Z']) expect(tramoDeReintento(t)).toBe(tramoDeReemision(t))
    expect(llaveDeReintentoDelPaso('v1:c0', AHORA)).toBe('v1:c0:r2026-10-09am')
  })
  it('una llave derivada es de su base; otra base no', () => {
    expect(esDeLaLlave('v1:c0', 'v1:c0')).toBe(true)
    expect(esDeLaLlave('v1:c0:r2026-10-09am', 'v1:c0')).toBe(true)
    expect(esDeLaLlave('v1:c1', 'v1:c0')).toBe(false)
    expect(esDeLaLlave('v1:c0x', 'v1:c0')).toBe(false)
  })
  it('🔴 3 intentos agotados: en el MISMO tramo, fin declarado sin estado nuevo; en el siguiente, intento 1 con la llave del tramo', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    const mismo = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-10-09T11:00:00Z')
    expect(mismo.status).toBe(409)
    expect(mismo.cuerpo).toMatchObject({ error: 'intentos_agotados', necesita_humano: false, reintenta: true })
    expect(String(mismo.cuerpo.alerta)).toMatch(/sigue sola/)
    expect(al.corridas).toHaveLength(3)
    expect(al.campanas[0].estado).not.toBe('necesita_humano')
    const otro = await estrategiaPreparar(al, { ...wf(), campana_id: id }, TARDE)
    expect(otro.status).toBe(200)
    expect(otro.cuerpo.run_sdk).toBeTruthy()
    const nueva = al.corridas.at(-1)!
    expect(nueva.clave_idempotencia).toBe('v1:c0:r2026-10-09pm')
    expect(nueva.intento).toBe(1)
  })
  it('la llave del tramo también agota en su tramo, y la alerta no se repite', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    const a1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(String(a1.cuerpo.alerta)).toMatch(/sigue sola/)
    await tresFallas(al, id, TARDE)
    expect(al.corridas.filter((c) => c.clave_idempotencia === 'v1:c0:r2026-10-09pm').map((c) => c.intento)).toEqual([1, 2, 3])
    const a2 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-10-09T15:00:00Z')
    expect(a2.cuerpo.error).toBe('intentos_agotados')
    expect(a2.cuerpo.alerta).toBeNull()
  })
  it('un `ok` en la llave del tramo vale para la base: «ya hecha», sin otra llamada', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, TARDE)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: A.estrategia, cost_usd: 0.3 } }, TARDE)
    const n = al.corridas.length
    const otra = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf', 'e', '2026-10-10T08:00:00Z', 'm', 'h', async () => al.estrategias.length > 0)
    expect(otra.tipo).toBe('ya_hecha')
    expect(al.corridas).toHaveLength(n)
  })
})

describe('el calendario · lo mismo que la estrategia', () => {
  async function conEstrategia(al: AlmacenMemoria) {
    const id = await abierta(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: A.estrategia, cost_usd: 0.3 } }, AHORA)
    return id
  }
  it('🔴 la tanda que agota sus 3 intentos: fin declarado, la campaña sigue en su estado, la alerta nombra la tanda', async () => {
    const al = almacen(); const id = await conEstrategia(al)
    const antes = al.campanas[0].estado
    for (let i = 0; i < 3; i++) {
      const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
      expect(p.status).toBe(200)
      const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: falla }, AHORA)
      expect(g.cuerpo).toEqual({ reintentar: true })
    }
    const r = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'intentos_agotados', necesita_humano: false, reintenta: true })
    expect(al.campanas[0].estado).toBe(antes)
    expect(al.campanas[0].estado_motivo).toBe('reintento automático · calendario · la tanda 1 agotó los intentos de este tramo')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano')).toBe(false)
    const tarde = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, TARDE)
    expect(tarde.status).toBe(200)
    expect(al.corridas.at(-1)!.clave_idempotencia).toBe('t1:v1:c0:r2026-10-09pm')
  })
  it('🔴 una corrección que corre con la llave del tramo (`…:c1:r<tramo>`) sigue siendo la corrección, aunque quien guarda no lo diga', async () => {
    const al = almacen(); const id = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((x) => (x.semana === 4 && x.slot === 'b' ? { ...x, formato: 'formato-inexistente' } : x)) }
    const p1 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    const g1 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p1.cuerpo.corrida_id, resultado: { success: true, structured_output: mala, cost_usd: 0.3 } }, AHORA)
    expect(g1.cuerpo.correccion).toBe(true)
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g1.cuerpo.fichas, fila_ids: g1.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    const corrida = al.corridas.find((x) => x.id === p2.cuerpo.corrida_id)!
    expect(corrida.clave_idempotencia).toBe('t1:v1:c1')
    corrida.clave_idempotencia = 't1:v1:c1:r2026-10-09pm' // la misma corrección, en el tramo de reintento
    const g2 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: corrida.id, modo: 'filas', resultado: { success: true, structured_output: { piezas: [{ ...piezaBuena(A, 4, 'b', 'Tema'), formato: 'formato-inexistente' }], ajustes_al_patron: [] }, cost_usd: 0.3 } }, AHORA)
    expect(g2.cuerpo.correccion).toBeUndefined() // no pide OTRA corrección: ya era la corrección
  })
})

describe('el reloj retoma la estrategia atascada', () => {
  it('🔴 la última llamada murió: deja el sobre del plan con la llave del tramo, y la puerta retoma; en el mismo tramo, la sala no lo duplica', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, TARDE)
    const sobres = al.sobresEmitidos as Array<{ source: string; idempotency_key: string; payload: { campana_id: string; desde_worker: string } }>
    expect(sobres).toHaveLength(1)
    expect(sobres[0]).toMatchObject({ source: 'planeacion/plan-listo', idempotency_key: `${id}:reintento:2026-10-09pm`, payload: { campana_id: id, desde_worker: 'cadena/reintento' } })
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v2' }, '2026-10-09T18:00:00Z')
    expect(sobres.map((s) => s.idempotency_key)).toEqual([`${id}:reintento:2026-10-09pm`, `${id}:reintento:2026-10-09pm`]) // la sala contesta «duplicado»
    expect(al.campanas[0].estado).not.toBe('necesita_humano')
  })
  it('una campaña sin llamadas, o con la última `ok`, no recibe sobre', async () => {
    const al = almacen(); await abierta(al)
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, TARDE)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('con la cadena apagada el reloj no corre: tampoco deja sobres', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    al.config.set('estado_cadena', 'apagada')
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, TARDE)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('una campaña real con la cadena en ensayo y sin admitir: no se deja sobre (la compuerta manda)', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    al.campanas[0].seco = false
    al.config.set('estado_cadena', 'ensayo'); al.config.set('clientes_ensayo', [])
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, TARDE)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('el reloj en seco no deja sobres', async () => {
    const al = almacen(); const id = await abierta(al)
    await tresFallas(al, id, AHORA)
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', seco: true }, TARDE)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('el tope del paso no cambió: sigue siendo el de siempre', () => {
    expect(topeDelPaso('estrategia')).toBe(1)
  })
})
