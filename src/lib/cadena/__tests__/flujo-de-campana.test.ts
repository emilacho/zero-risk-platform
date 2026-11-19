/**
 * EL BOTÓN «FLUJO DE LA CAMPAÑA» (GO de Lenovo 18-nov · boceto aprobado por Emilio) · la acción `campanas · flujo` de la cadena · en seco, sin base ni red (US$ 0).
 *   · los 3 estados se LEEN de la campaña: verde (en marcha) · dorado (la pausó el tablero, con su hito) · rojo (se paró sola, con su motivo breve)
 *   · parar desde cualquier estado en marcha (también planificando) y reanudar al MISMO estado
 *   · el rojo revisa la causa conocida ANTES de tocar nada · el doble toque contesta «ya estaba» · solo esta acción acepta el tablero
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { abrirCampana, avanzarCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, relojDeLaCadena, type Estrategia } from '../index'
import {
  ESTADOS_EN_MARCHA, PREFIJO_DE_PAUSA_DEL_TABLERO, causaQueSigue, topeDeLaPlanificacion, flujoCampana, flujoDeCampana, hitoDeLaCampana, leerPausaDelTablero, motivoBreve, motivoDePausaDelTablero,
} from '../flujo-de-campana'
import { ACCIONES } from '../acciones'
import { briefAbrir, conceptoAbrir, hojaEscribir, CODIGO_CAMPANA_PAUSADA } from '../mesas'
import { fichasPreparar } from '../pasos'
import { bolsaAgrandada } from '../nucleo'
import { estrategiaPasar, calendarioPasar } from '../revision-jefatura'
import { PASOS, PASOS_CON_PRESUPUESTO_PROPIO, topeDelPaso } from '../constantes'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const LUEGO = '2026-10-12T10:00:00Z'
// 18-nov · con #1175 (día 1 = la apertura) la campaña se abre el lunes 12, para que las fechas de la tanda de prueba sigan dentro (lo mismo que hizo CC3 en sus pruebas); sin #1175 da igual
const ABRE = '2026-10-12T08:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const tablero = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'tablero', workflow_execution_id: 'tablero:flujo:1', ...extra })
const almacen = () => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', arranque_por_evento: false }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
const ok = (o: unknown, costo = 0.3) => ({ success: true, structured_output: o, cost_usd: costo })

async function abierta(al: AlmacenMemoria) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
  return (c.cuerpo.campana as { id: string }).id
}
async function enCalendario(al: AlmacenMemoria) {
  const id = await abierta(al)
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia as Estrategia) }, AHORA)
  return id
}
async function activa(al: AlmacenMemoria) {
  const id = await enCalendario(al)
  const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
  await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
  return id
}
const flujo = (al: AlmacenMemoria, id: string, quiero: 'parar' | 'reanudar', ahora = LUEGO, extra: Record<string, unknown> = {}) => flujoCampana(al, tablero({ campana_id: id, quiero, ...extra }), ahora)
const vivas = async (al: AlmacenMemoria, id: string, tipo: string) => (await al.esperasVivas()).filter((e) => e.campana_id === id && e.objeto_tipo === tipo)
const estado = async (al: AlmacenMemoria, id: string) => (await al.campana(id))!

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('el contrato con el tablero', () => {
  it('el prefijo de la pausa del tablero es EXACTO (el tablero lee el mismo texto)', () => {
    expect(PREFIJO_DE_PAUSA_DEL_TABLERO).toBe('pausada desde el tablero')
    expect(motivoDePausaDelTablero('activa', 'en la semana 4 del calendario')).toBe('pausada desde el tablero · vuelve a: activa · en la semana 4 del calendario')
    expect(leerPausaDelTablero('pausada desde el tablero · vuelve a: calendario · armando el calendario')).toEqual({ vuelve_a: 'calendario', hito: 'armando el calendario' })
  })
  it('cualquier otro texto no es una pausa del tablero (la del reloj, un estado que no está en marcha, un prefijo parecido)', () => {
    for (const m of ['pasaron 7 días en necesita_humano', 'pausada desde el tablero · vuelve a: cerrada · x', 'Pausada desde el tablero · vuelve a: activa · x', 'pausada desde el tablero', null, ''])
      expect(leerPausaDelTablero(m)).toBeNull()
  })
  it('la acción está registrada como `campanas · flujo`', () => { expect(ACCIONES.campanas.flujo).toBe(flujoCampana) })
})

describe('los 3 estados se leen de la campaña', () => {
  it('verde «EN MARCHA» en cada estado en marcha', () => {
    expect(ESTADOS_EN_MARCHA).toEqual(['abierta', 'estrategia', 'calendario', 'activa'])
    for (const e of ESTADOS_EN_MARCHA) expect(flujoDeCampana({ estado: e, estado_motivo: null })).toEqual({ color: 'verde', linea: 'EN MARCHA', estado: e })
  })
  it('dorado «PARADO POR TI · <hito>» solo si la pausa la puso el tablero', () => {
    expect(flujoDeCampana({ estado: 'pausada', estado_motivo: motivoDePausaDelTablero('activa', 'en la semana 4 del calendario') }))
      .toEqual({ color: 'dorado', linea: 'PARADO POR TI · en la semana 4 del calendario', estado: 'pausada' })
  })
  it('🔴 la pausa del reloj (7 días esperando) es ROJA, no dorada', () => {
    expect(flujoDeCampana({ estado: 'pausada', estado_motivo: 'pasaron 7 días en necesita_humano' })).toEqual({ color: 'rojo', linea: 'DETENIDO · lleva 7 días esperándote', estado: 'pausada' })
  })
  it('rojo «DETENIDO · <motivo breve>» con `necesita_humano`', () => {
    expect(flujoDeCampana({ estado: 'necesita_humano', estado_motivo: 'el presupuesto de planificación se agotó (US$ 5.14 de 6)' }))
      .toEqual({ color: 'rojo', linea: 'DETENIDO · se acabó la bolsa de planificación', estado: 'necesita_humano' })
  })
  it('cerrada o reemplazada: no hay botón', () => {
    expect(flujoDeCampana({ estado: 'cerrada', estado_motivo: null })).toBeNull()
    expect(flujoDeCampana({ estado: 'reemplazada', estado_motivo: null })).toBeNull()
  })
  it('el motivo breve corta lo largo y no inventa', () => {
    expect(motivoBreve('la tanda 3 agotó sus 3 intentos')).toBe('la tanda 3 agotó sus 3 intentos')
    expect(motivoBreve('la estrategia sigue con 2 bloqueo(s) tras la única corrección: x | y')).toBe('la estrategia sigue con 2 bloqueo')
    expect(motivoBreve(`${'a'.repeat(80)}`)).toBe(`${'a'.repeat(57)}…`)
    expect(motivoBreve(null)).toBe('necesita que lo mires')
  })
})

describe('el hito', () => {
  const c = { estado: 'activa' as const, fecha_inicio: '2026-10-12', fecha_fin: '2027-01-09' }
  it('con el calendario en marcha, la semana contada como las filas (desde el lunes de la semana del día 1)', () => {
    expect(hitoDeLaCampana(c, '2026-10-12T08:00:00Z')).toBe('en la semana 1 del calendario')
    expect(hitoDeLaCampana(c, '2026-11-02T08:00:00Z')).toBe('en la semana 4 del calendario')
    // día 1 en jueves: el lunes siguiente ya es la semana 2
    expect(hitoDeLaCampana({ ...c, fecha_inicio: '2026-10-15' }, '2026-10-19T08:00:00Z')).toBe('en la semana 2 del calendario')
  })
  it('antes del día 1, y nunca después de la última semana', () => {
    expect(hitoDeLaCampana(c, '2026-10-01T08:00:00Z')).toBe('antes de la semana 1 del calendario')
    expect(hitoDeLaCampana(c, '2027-06-01T08:00:00Z')).toBe('en la semana 13 del calendario')
  })
  it('planificando, la etapa', () => {
    expect(hitoDeLaCampana({ ...c, estado: 'estrategia' }, LUEGO)).toBe('en la etapa de estrategia')
    expect(hitoDeLaCampana({ ...c, estado: 'abierta' }, LUEGO)).toBe('en la etapa de estrategia')
    expect(hitoDeLaCampana({ ...c, estado: 'calendario' }, LUEGO)).toBe('armando el calendario')
  })
})

describe('parar y reanudar desde el tablero', () => {
  it('parar una campaña activa: queda `pausada` con el motivo del tablero, su hito y UNA espera de pausa', async () => {
    const al = almacen(); const id = await activa(al)
    const r = await flujo(al, id, 'parar')
    expect(r.status).toBe(200)
    const c = await estado(al, id)
    expect(c.estado).toBe('pausada')
    expect(leerPausaDelTablero(c.estado_motivo)).toEqual({ vuelve_a: 'activa', hito: hitoDeLaCampana({ ...c, estado: 'activa' }, LUEGO) })
    expect(r.cuerpo.flujo).toEqual({ color: 'dorado', linea: `PARADO POR TI · ${hitoDeLaCampana({ ...c, estado: 'activa' }, LUEGO)}`, estado: 'pausada' })
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(1)
  })
  it('reanudar la dorada vuelve a `activa`, sin motivo, y resuelve la espera de pausa', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar')
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200)
    expect(await estado(al, id)).toMatchObject({ estado: 'activa', estado_motivo: null })
    expect(r.cuerpo.flujo).toEqual({ color: 'verde', linea: 'EN MARCHA', estado: 'activa' })
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(0)
  })
  it('🔴 parar MIENTRAS se planifica y reanudar vuelve al MISMO estado (no se salta la planificación)', async () => {
    for (const [armar, previo] of [[enCalendario, 'calendario'], [abierta, 'abierta']] as const) {
      const al = almacen(); const id = await armar(al)
      expect((await estado(al, id)).estado).toBe(previo)
      expect((await flujo(al, id, 'parar')).status).toBe(200)
      expect(leerPausaDelTablero((await estado(al, id)).estado_motivo)?.vuelve_a).toBe(previo)
      expect((await flujo(al, id, 'reanudar')).status).toBe(200)
      expect((await estado(al, id)).estado).toBe(previo)
    }
  })
  it('el doble toque: el segundo «parar» contesta «ya estaba», sin otra espera ni otro cambio', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar')
    const antes = await estado(al, id)
    const r = await flujo(al, id, 'parar', '2026-10-12T10:00:05Z')
    expect(r.status).toBe(200); expect(r.cuerpo.ya_estaba).toBe(true)
    expect(await estado(al, id)).toEqual(antes)
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(1)
  })
  it('el doble toque al reanudar: el segundo contesta «ya estaba» y no cambia nada', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar'); await flujo(al, id, 'reanudar')
    const antes = await estado(al, id)
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect(r.cuerpo.ya_estaba).toBe(true)
    expect(await estado(al, id)).toEqual(antes)
  })
})

describe('el rojo: intenta reanudar, revisando la causa ANTES', () => {
  async function sinBolsa(al: AlmacenMemoria) {
    const id = await activa(al)
    const gastado = (await al.corridasDeCampana(id)).reduce((s, c) => s + (c.costo_usd ?? 0), 0)
    // la bolsa queda por debajo de lo gastado + el tope de un calendario: exactamente lo que pone a la campaña en `necesita_humano` en `pasos.ts`
    // 18-nov (grupo A): el tope de la campaña igual a la bolsa, para que la regla no la agrande (`bolsaAgrandada` nunca pasa el tope): «ni la bolsa agrandada alcanza»
    await al.actualizarCampana(id, { presupuesto_planificacion_usd: Math.max(0.5, Math.floor(gastado)), tope_gasto_usd: Math.max(0.5, Math.floor(gastado)), estado: 'necesita_humano', estado_motivo: `el presupuesto de planificación se agotó (US$ ${gastado.toFixed(2)} de ${Math.floor(gastado)})` })
    await al.abrirEspera({ campana_id: id, objeto_tipo: 'necesita_humano', objeto_id: id, motivo: 'bolsa', desde: AHORA, recordatorio_en: null, alerta_en: null, vence_en: '2026-12-01T00:00:00Z', estado: 'viva', rung_enviado: 0, dedup_key: `nh:${id}:bolsa`, accion_al_vencer: 'pausada', seco: true })
    return id
  }
  it('🔴 con la bolsa todavía agotada: 409 E-CAUSA-SIGUE, no cambia NADA y la alerta abierta sigue siendo UNA', async () => {
    const al = almacen(); const id = await sinBolsa(al)
    const antes = await estado(al, id)
    for (let i = 0; i < 2; i++) {
      const r = await flujo(al, id, 'reanudar')
      expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CAUSA-SIGUE')
      expect(String(r.cuerpo.detalle)).toMatch(/bolsa de planificación sigue sin alcanzar/)
      expect(r.cuerpo.flujo).toEqual({ color: 'rojo', linea: 'DETENIDO · se acabó la bolsa de planificación', estado: 'necesita_humano' })
    }
    expect(await estado(al, id)).toEqual(antes)
    expect(await vivas(al, id, 'necesita_humano')).toHaveLength(1)
  })
  it('con la bolsa subida: vuelve a `activa`, resuelve la espera, y el reloj NO la devuelve sola a `necesita_humano` (pedido de CC7 para Náufrago)', async () => {
    const al = almacen(); const id = await sinBolsa(al)
    await al.actualizarCampana(id, { presupuesto_planificacion_usd: 15, tope_gasto_usd: 150 })
    expect(await causaQueSigue(al, await estado(al, id))).toBeNull()
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200)
    expect(await estado(al, id)).toMatchObject({ estado: 'activa', estado_motivo: null })
    expect(await vivas(al, id, 'necesita_humano')).toHaveLength(0)
    const corridas = (await al.corridasDeCampana(id)).length
    const t = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v-1' }, '2026-10-13T10:00:00Z')
    expect(t.status).toBe(200)
    expect((await estado(al, id)).estado).toBe('activa')
    expect((await al.corridasDeCampana(id)).length).toBe(corridas) // ni un calendario nuevo pedido
  })
  it('🔴 18-nov · Lenovo 17:21Z: la campaña que nació con 6, con el rojo encendido, reactiva a `activa` sin E-CAUSA-SIGUE: el rojo mide con la bolsa que la regla le dará (`bolsaAgrandada`)', async () => {
    const al = almacen(); const id = await activa(al)
    const gastado = (await al.corridasDeCampana(id)).reduce((s, c) => s + (c.costo_usd ?? 0), 0)
    const c0 = await estado(al, id)
    const suya = bolsaAgrandada({ ...c0, presupuesto_planificacion_usd: 6, tope_gasto_usd: 150 }, 'calendario')
    expect(suya).not.toBeNull(); expect(gastado + topeDeLaPlanificacion()).toBeLessThanOrEqual(suya as number)
    // como Náufrago: bolsa guardada de 6 que no alcanza, detenida por la bolsa, con un tope de campaña holgado
    const guardada = Math.max(0, Math.min(6, Math.floor(gastado)))
    await al.actualizarCampana(id, { presupuesto_planificacion_usd: guardada, tope_gasto_usd: 150, estado: 'necesita_humano', estado_motivo: `el presupuesto de planificación se agotó (US$ ${gastado.toFixed(2)} de ${guardada})` })
    await al.abrirEspera({ campana_id: id, objeto_tipo: 'necesita_humano', objeto_id: id, motivo: 'bolsa', desde: AHORA, recordatorio_en: null, alerta_en: null, vence_en: '2026-12-01T00:00:00Z', estado: 'viva', rung_enviado: 0, dedup_key: `nh:${id}:bolsa`, accion_al_vencer: 'pausada', seco: true })
    expect(gastado + topeDeLaPlanificacion()).toBeGreaterThan(guardada) // con la bolsa guardada, el rojo de antes decía «sigue sin alcanzar»
    expect(await causaQueSigue(al, await estado(al, id))).toBeNull()
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect(r.cuerpo.code).not.toBe('E-CAUSA-SIGUE')
    expect(await estado(al, id)).toMatchObject({ estado: 'activa', estado_motivo: null })
    expect(await vivas(al, id, 'necesita_humano')).toHaveLength(0)
  })
  it('la causa se mide con la MISMA regla que frena el paso (gastado + tope de un calendario > bolsa)', async () => {
    const al = almacen(); const id = await sinBolsa(al)
    const gastado = (await al.corridasDeCampana(id)).reduce((s, c) => s + (c.costo_usd ?? 0), 0)
    await al.actualizarCampana(id, { presupuesto_planificacion_usd: gastado + topeDeLaPlanificacion(), tope_gasto_usd: gastado + topeDeLaPlanificacion() })
    expect(await causaQueSigue(al, await estado(al, id))).toBeNull()
    await al.actualizarCampana(id, { presupuesto_planificacion_usd: gastado + topeDeLaPlanificacion() - 0.01, tope_gasto_usd: gastado + topeDeLaPlanificacion() - 0.01 })
    expect(await causaQueSigue(al, await estado(al, id))).toMatch(/sigue sin alcanzar/)
  })
  it('el tope que se mide es el MAYOR de los pasos que gastan de la bolsa de planificación (no solo el del calendario · CC3)', () => {
    const deLaPlanificacion = PASOS.filter((p) => !PASOS_CON_PRESUPUESTO_PROPIO.has(p))
    expect(deLaPlanificacion).toEqual(expect.arrayContaining(['estrategia', 'calendario']))
    expect(deLaPlanificacion).not.toContain('fichas')
    for (const p of deLaPlanificacion) expect(topeDeLaPlanificacion()).toBeGreaterThanOrEqual(topeDelPaso(p))
    expect(deLaPlanificacion.map(topeDelPaso)).toContain(topeDeLaPlanificacion())
  })
  it('la pausa del reloj (7 días) es roja y reanuda al estado que falte: con el calendario hecho, `activa`', async () => {
    const al = almacen(); const id = await activa(al)
    await al.actualizarCampana(id, { estado: 'pausada', estado_motivo: 'pasaron 7 días en necesita_humano' })
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200)
    expect((await estado(al, id)).estado).toBe('activa')
  })
  it('una detención mientras se planificaba vuelve a la etapa que falta, no a `activa`', async () => {
    const al = almacen(); const id = await enCalendario(al)
    await al.actualizarCampana(id, { estado: 'necesita_humano', estado_motivo: 'la tanda 1 agotó sus 3 intentos' })
    expect((await flujo(al, id, 'reanudar')).status).toBe(200)
    expect((await estado(al, id)).estado).toBe('calendario')
    const al2 = almacen(); const id2 = await abierta(al2)
    await al2.actualizarCampana(id2, { estado: 'necesita_humano', estado_motivo: 'la estrategia agotó sus 3 intentos' })
    expect((await flujo(al2, id2, 'reanudar')).status).toBe(200)
    expect((await estado(al2, id2)).estado).toBe('estrategia')
  })
  it('«parar» una campaña roja no la vuelve dorada: contesta «ya estaba» y sigue roja', async () => {
    const al = almacen(); const id = await sinBolsa(al)
    const r = await flujo(al, id, 'parar')
    expect(r.status).toBe(200); expect(r.cuerpo.ya_estaba).toBe(true)
    expect((await estado(al, id)).estado).toBe('necesita_humano')
  })
})

describe('quién puede tocarlo', () => {
  it('🔴 el tablero SOLO puede usar `flujo`: `avanzar` con `workflow_id: tablero` sigue siendo 403', async () => {
    const al = almacen(); const id = await activa(al)
    const r = await avanzarCampana(al, tablero({ campana_id: id, a: 'pausada' }), LUEGO)
    expect(r.status).toBe(403)
    expect((await estado(al, id)).estado).toBe('activa')
  })
  it('sin `workflow_id` o sin `workflow_execution_id`: 400 y no cambia nada', async () => {
    const al = almacen(); const id = await activa(al)
    expect((await flujoCampana(al, { campana_id: id, quiero: 'parar', workflow_id: 'tablero' }, LUEGO)).status).toBe(400)
    expect((await flujoCampana(al, { campana_id: id, quiero: 'parar' }, LUEGO)).status).toBe(400)
    expect((await estado(al, id)).estado).toBe('activa')
  })
  it('un `workflow_id` que no es flujo ni tablero: 403', async () => {
    const al = almacen(); const id = await activa(al)
    expect((await flujoCampana(al, { campana_id: id, quiero: 'parar', workflow_id: 'cualquiera', workflow_execution_id: 'x' }, LUEGO)).status).toBe(403)
  })
  it('pedido mal formado, campaña que no existe o cerrada', async () => {
    const al = almacen(); const id = await activa(al)
    expect((await flujo(al, id, 'apagar' as never)).status).toBe(400)
    expect((await flujo(al, '00000000-0000-0000-0000-000000000000', 'parar')).status).toBe(404)
    await al.actualizarCampana(id, { estado: 'cerrada' })
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-SIN-FLUJO')
  })
})

describe('🔴 el paso en curso TERMINA, pero no despausa (pausa del tablero a mitad de un paso)', () => {
  it('estrategia: guardar mientras está pausada deja la estrategia validada, la campaña PAUSADA y «vuelve a: calendario»; reanudar → calendario', async () => {
    const al = almacen(); const id = await abierta(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await flujo(al, id, 'parar', AHORA)
    const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia as Estrategia) }, AHORA)
    expect(g.status).toBe(200); expect(g.cuerpo.pausada_por_el_tablero).toBe(true); expect(g.cuerpo).not.toHaveProperty('fechas_pedidas')
    expect((await al.ultimaEstrategia(id))!.estado).toBe('validada')
    const c = await estado(al, id)
    expect(c.estado).toBe('pausada')
    expect(leerPausaDelTablero(c.estado_motivo)).toEqual({ vuelve_a: 'calendario', hito: 'armando el calendario' })
    await flujo(al, id, 'reanudar')
    expect((await estado(al, id)).estado).toBe('calendario')
  })
  it('calendario: guardar la primera tanda mientras está pausada NO la activa ni arranca; reanudar → activa', async () => {
    const al = almacen(); const id = await enCalendario(al)
    const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await flujo(al, id, 'parar', AHORA)
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
    expect(g.status).toBe(200)
    const c = await estado(al, id)
    expect(c.estado).toBe('pausada')
    expect(leerPausaDelTablero(c.estado_motivo)?.vuelve_a).toBe('activa')
    expect(al.sala.size).toBe(0)
    await flujo(al, id, 'reanudar')
    expect((await estado(al, id)).estado).toBe('activa')
  })
  it('sin pausa del tablero, guardar sigue como siempre (estrategia → calendario)', async () => {
    const al = almacen(); const id = await enCalendario(al)
    expect((await estado(al, id)).estado).toBe('calendario')
  })
  it('la pausa del reloj (roja) no se toca al guardar: anotar solo actúa con la pausa del tablero', async () => {
    const al = almacen(); const id = await activa(al)
    await al.actualizarCampana(id, { estado: 'pausada', estado_motivo: 'pasaron 7 días en necesita_humano' })
    const { anotarSiPausadaPorElTablero } = await import('../flujo-de-campana')
    expect(await anotarSiPausadaPorElTablero(al, await estado(al, id), 'activa', LUEGO)).toBeNull()
    expect((await estado(al, id)).estado_motivo).toBe('pasaron 7 días en necesita_humano')
  })
})

describe('🔴 con la campaña pausada no arranca nada nuevo (cada brazo con su prueba)', () => {
  it('las 3 mesas (brief · gran idea · hoja) contestan 409 E-CAMPANA-PAUSADA y no abren nada', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar')
    const antes = (await al.esperasVivas()).length
    for (const abrir of [briefAbrir, conceptoAbrir, hojaEscribir]) {
      const r = await abrir(al, { ...wf(), campana_id: id, version: 1 }, LUEGO)
      expect(r.status).toBe(409); expect(r.cuerpo.code).toBe(CODIGO_CAMPANA_PAUSADA)
    }
    expect((await al.esperasVivas()).length).toBe(antes)
  })
  it('las mesas SÍ pasan el freno con la campaña en marcha (el 409 es solo por la pausa)', async () => {
    const al = almacen(); const id = await activa(al)
    for (const abrir of [briefAbrir, conceptoAbrir, hojaEscribir]) expect((await abrir(al, { ...wf(), campana_id: id, version: 1 }, LUEGO)).cuerpo.code).not.toBe(CODIGO_CAMPANA_PAUSADA)
  })
  it('el lector de fichas no corre pausada', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar')
    const r = await fichasPreparar(al, { ...wf(), campana_id: id }, LUEGO)
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe(CODIGO_CAMPANA_PAUSADA)
  })
  it('la jefatura que pasa la estrategia mientras está pausada NO la despausa: queda «vuelve a: calendario»', async () => {
    const al = almacen(); al.retencion = async (tipo) => ({ retener: tipo === 'estrategia', motivo: 'jefatura_activa' })
    const id = await abierta(al)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia as Estrategia) }, AHORA)
    expect(g.cuerpo.retenida_para_revision).toBeTruthy()
    await flujo(al, id, 'parar', AHORA)
    expect(leerPausaDelTablero((await estado(al, id)).estado_motivo)?.vuelve_a).toBe('estrategia')
    const r = await estrategiaPasar(al, { ...wf(), campana_id: id, version: 1 })
    expect(r.status).toBe(200)
    const c = await estado(al, id)
    expect(c.estado).toBe('pausada')
    expect(leerPausaDelTablero(c.estado_motivo)?.vuelve_a).toBe('calendario')
    await flujo(al, id, 'reanudar')
    expect((await estado(al, id)).estado).toBe('calendario')
  })
  it('la jefatura que pasa la primera tanda mientras está pausada NO la activa ni arranca: queda «vuelve a: activa»', async () => {
    const al = almacen(); al.retencion = async (tipo) => ({ retener: tipo === 'calendario', motivo: 'jefatura_activa' })
    const id = await enCalendario(al)
    const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
    expect((await estado(al, id)).estado).toBe('calendario')
    await flujo(al, id, 'parar', AHORA)
    const r = await calendarioPasar(al, { ...wf(), campana_id: id, tanda: 1 })
    expect(r.status).toBe(200)
    const c = await estado(al, id)
    expect(c.estado).toBe('pausada'); expect(leerPausaDelTablero(c.estado_motivo)?.vuelve_a).toBe('activa')
    expect(al.sala.size).toBe(0)
  })
})

describe('correcciones de CC7 a 8292d2a', () => {
  it('🔴 pausar ARMANDO la primera tanda con la jefatura reteniendo: la revisión se abre igual, reanudar vuelve a calendario (NO activa) y la jefatura la activa al cerrar', async () => {
    const al = almacen(); al.retencion = async (tipo) => ({ retener: tipo === 'calendario', motivo: 'jefatura_activa' })
    const id = await enCalendario(al)
    const t = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await flujo(al, id, 'parar', AHORA)
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: t.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
    expect(g.status).toBe(200); expect(g.cuerpo.retenida_para_revision).toBeTruthy()
    expect(leerPausaDelTablero((await estado(al, id)).estado_motivo)?.vuelve_a).toBe('calendario')
    await flujo(al, id, 'reanudar')
    expect((await estado(al, id)).estado).toBe('calendario')
    expect(al.sala.size).toBe(0)
    const r = await calendarioPasar(al, { ...wf(), campana_id: id, tanda: 1 })
    expect(r.status).toBe(200)
    expect((await estado(al, id)).estado).toBe('activa')
  })
  it('🟡 la tabla general NO se ensanchó: «avanzar» desde un flujo no pausa una campaña en estrategia ni calendario', async () => {
    const al = almacen(); const id = await enCalendario(al)
    const r = await avanzarCampana(al, wf({ campana_id: id, a: 'pausada' }), LUEGO)
    expect(r.status).toBe(409)
    expect((await estado(al, id)).estado).toBe('calendario')
  })
  it('🟡 pausar, reanudar y volver a pausar el MISMO día deja una espera de pausa viva (la llave lleva la hora)', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar', '2026-10-12T10:00:00Z')
    await flujo(al, id, 'reanudar', '2026-10-12T10:05:00Z')
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(0)
    await flujo(al, id, 'parar', '2026-10-12T10:10:00Z')
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(1)
  })
})

describe('🟡 de CC7 (a2): el botón respeta la compuerta de la cadena', () => {
  async function real(al: AlmacenMemoria, estadoCadena: unknown, armar: (al: AlmacenMemoria) => Promise<string> = activa) {
    const id = await armar(al)
    await al.actualizarCampana(id, { seco: false })
    await al.escribirConfig('estado_cadena', estadoCadena)
    return id
  }
  it('con la cadena APAGADA y una campaña real: parar contesta lo de la compuerta (409 E-CADENA-APAGADA) y no cambia nada', async () => {
    const al = almacen(); const id = await real(al, 'apagada')
    const antes = await estado(al, id)
    const r = await flujo(al, id, 'parar')
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CADENA-APAGADA')
    expect(await estado(al, id)).toEqual(antes)
    expect(await vivas(al, id, 'campana_pausada')).toHaveLength(0)
  })
  it('en ENSAYO con un cliente que no está en la lista: reanudar contesta 409 E-CADENA-NO-ADMITIDO y la campaña sigue pausada', async () => {
    const al = almacen(); const id = await real(al, 'encendida')
    await flujo(al, id, 'parar')
    await al.escribirConfig('estado_cadena', 'ensayo'); await al.escribirConfig('clientes_ensayo', ['otro-cliente'])
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CADENA-NO-ADMITIDO')
    expect((await estado(al, id)).estado).toBe('pausada')
  })
  it('con la cadena ENCENDIDA, la misma campaña real se para y se reanuda (el 409 es solo por la compuerta)', async () => {
    const al = almacen(); const id = await real(al, 'encendida')
    expect((await flujo(al, id, 'parar')).status).toBe(200)
    expect((await flujo(al, id, 'reanudar')).status).toBe(200)
    expect((await estado(al, id)).estado).toBe('activa')
  })
})

describe('🟡 k1 de CC6: reanudar a activa ARRANCA la producción (como avanzar)', () => {
  async function pausadaConArranque(al: AlmacenMemoria) {
    const id = await activa(al)
    await flujo(al, id, 'parar')
    await al.escribirConfig('arranque_por_evento', true)
    return id
  }
  it('desde el DORADO: reanudar deja activa, contesta el arranque hecho y deja sobres en la sala', async () => {
    const al = almacen(); const id = await pausadaConArranque(al)
    expect(al.sala.size).toBe(0)
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect((await estado(al, id)).estado).toBe('activa')
    expect(r.cuerpo.arranque).toMatchObject({ arranque: 'hecho' })
    expect(al.sala.size).toBeGreaterThan(0)
  })
  it('desde el ROJO (sin causa que siga): reanudar a activa también arranca', async () => {
    const al = almacen(); const id = await activa(al)
    await al.actualizarCampana(id, { estado: 'necesita_humano', estado_motivo: 'el lector no encontró la fuente' })
    await al.escribirConfig('arranque_por_evento', true)
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect((await estado(al, id)).estado).toBe('activa')
    expect(r.cuerpo.arranque).toMatchObject({ arranque: 'hecho' })
    expect(al.sala.size).toBeGreaterThan(0)
  })
  it('reanudar a un estado que NO es activa (pausada en calendario) no arranca, aunque el interruptor esté encendido', async () => {
    const al = almacen(); const id = await enCalendario(al)
    await flujo(al, id, 'parar')
    await al.escribirConfig('arranque_por_evento', true)
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect((await estado(al, id)).estado).toBe('calendario')
    expect(r.cuerpo).not.toHaveProperty('arranque'); expect(al.sala.size).toBe(0)
  })
  it('control: con el interruptor apagado, reanudar no deja sobres ni trae arranque (igual que avanzar)', async () => {
    const al = almacen(); const id = await activa(al)
    await flujo(al, id, 'parar')
    const r = await flujo(al, id, 'reanudar')
    expect(r.status).toBe(200); expect(r.cuerpo).not.toHaveProperty('arranque'); expect(al.sala.size).toBe(0)
  })
})
