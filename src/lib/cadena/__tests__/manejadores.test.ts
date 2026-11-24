/**
 * Los manejadores de `/api/cadena/*` contra un almacén en memoria · pruebas a costo cero (sin base, sin red, sin modelo).
 * Se juega la cadena entera con un «agente simulado»: lo que el modelo devolvería, escrito a mano.
 */
import { describe, it, expect } from 'vitest'
import {
  abrirCampana, avanzarCampana, cierreDeCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, validarSinEscribir,
  filasLotes, filasMarcar, filasListar, fechasCobertura, fechasGuardar, relojDeLaCadena, costoEfectivo, topeDelPaso, expiresInHours, calendarioSiguiente,
  type Estrategia,
} from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { siguienteDespuesDe } from '../mesas'
import { bolsaDePlanificacion, medidaDeCampana } from '../constantes'
import { MOTIVO_DE_SALIDA, resolverTrasLaUltimaRonda } from '../ciclo'
import type { Hallazgo } from '../tipos'
import { clienteA, clienteB, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
// 18-nov (día 1 = apertura): estas pruebas no son del día 1; la campaña se abre el lunes que antes ponía la regla, para que sus fechas sigan siendo las mismas
const ABRE = '2026-10-12T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })

function almacen(extra: Partial<ConstructorParameters<typeof AlmacenMemoria>[0]> = {}) {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    ...extra,
  })
}
const abrir = async (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true, ...extra }, ABRE)
const idCampana = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.campana as { id: string }).id
const ok = (estrategia: unknown, costo = 0.3) => ({ success: true, structured_output: estrategia, cost_usd: costo })

/** juega la estrategia entera y deja la campaña en `calendario` */
async function conEstrategia(al: AlmacenMemoria, e: Estrategia = A.estrategia) {
  const c = await abrir(al)
  const id = idCampana(c)
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(e) }, AHORA)
  return { id, p, g }
}
async function tandaDe(al: AlmacenMemoria, id: string, tanda: number, objeto: unknown, extra: Record<string, unknown> = {}, prepExtra: Record<string, unknown> = {}) {
  const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda, ...prepExtra }, AHORA)
  if (p.status !== 200 || p.cuerpo.ya_hecha) return { p, g: null }
  const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda, corrida_id: p.cuerpo.corrida_id, resultado: ok(objeto), ...extra }, AHORA)
  return { p, g }
}

/** 19-nov · grupo C · las 3 rondas de corrección de la tanda 1 con la misma pieza mala (4b con un formato que no existe); devuelve la última respuesta */
const tresRondasMalas = async (al: ReturnType<typeof almacen>, id: string, g0: { cuerpo: Record<string, unknown> }) => {
  let g = g0
  for (const ronda of [1, 2, 3]) {
    expect(g.cuerpo.correccion).toBe(true)
    expect(g.cuerpo.ronda ?? 1).toBe(ronda)
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g.cuerpo.fichas, fila_ids: g.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    expect(al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia).toBe(`t1:v1:c${ronda}`)
    g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok({ piezas: [{ ...piezaBuena(A, 4, 'b', 'Tema'), formato: 'formato-inexistente' }], ajustes_al_patron: [] }) }, AHORA)
  }
  return g
}
const fila4b = (al: ReturnType<typeof almacen>) => al.filasGuardadas.find((f) => f.tanda === 1 && f.semana === 4 && f.id.endsWith('-b'))!

describe('la medida de la campaña (01-nov · firma de Emilio)', () => {
  it('🔴 sin pedirla: 90 días y sin columna escrita, como siempre', async () => {
    const al = almacen()
    const c = (await abrir(al)).cuerpo.campana as { fecha_inicio: string; fecha_fin: string; semanas_de_tanda?: number }
    expect((Date.parse(c.fecha_fin) - Date.parse(c.fecha_inicio)) / 86400000 + 1).toBe(90)
    expect('semanas_de_tanda' in c).toBe(false)
  })
  it('🔴 una campaña de 30 días con tandas de 2 semanas: sus fechas, sus tandas, y el pedido al agente dice 30 días', async () => {
    const al = almacen()
    const r = await abrir(al, { dias_de_campana: 30, semanas_de_tanda: 2 })
    const c = r.cuerpo.campana as { id: string; fecha_inicio: string; fecha_fin: string; semanas_de_tanda?: number }
    expect((Date.parse(c.fecha_fin) - Date.parse(c.fecha_inicio)) / 86400000 + 1).toBe(30)
    expect(c.semanas_de_tanda).toBe(2)
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: c.id }, AHORA)
    expect(JSON.stringify(p.cuerpo)).toContain('dentro de 30 días')
    expect((await calendarioPreparar(al, { ...wf(), campana_id: c.id, tanda: 4 }, AHORA)).cuerpo.code).toBe('E-TANDA') // 5 semanas de a 2 = 3 tandas
  })
  it('🔴 una estrategia con fases más allá de la campaña corta se marca; dentro de 90 días ya no basta', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al, { dias_de_campana: 30 }))
    const r = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 60 })) } }, AHORA)
    expect(JSON.stringify(r.cuerpo)).toMatch(/S01/)
  })
  it('🔴 al GUARDAR, una estrategia con fases fuera de la campaña corta se marca: 60 días no caben en 30', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al, { dias_de_campana: 30 }))
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const larga = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 60 })) }
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(larga) }, AHORA)
    expect(JSON.stringify(al.validaciones.filter((v) => v.objeto === 'estrategia'))).toContain('fuera de 1–30')
  })
  it('🔴 con 3 tandas por su medida, la tercera es la última: no se pide una cuarta', async () => {
    const al = almacen({ config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', nuevo_orden: { clientes: [A.clientId] } } })
    const { id } = await conEstrategia(al)
    const corta = idCampana({ cuerpo: { campana: await al.actualizarCampana(id, { estado: 'activa', fecha_fin: '2026-11-14', fecha_inicio: '2026-10-16', semanas_de_tanda: 2 }) } })
    al.filasGuardadas.push({ campana_id: corta, calendario_version: 1, tanda: 3, estado: 'validada', fecha: '2026-11-13', semana: 5 } as never)
    expect((await calendarioSiguiente(al, { ...wf(), campana_id: corta }, AHORA)).cuerpo).toMatchObject({ tanda: null, motivo: 'ya están todas las tandas' })
    expect(await siguienteDespuesDe(al, corta)).toEqual({})
  })
  it('🔴 una medida que no es un entero positivo se rechaza y no abre nada', async () => {
    for (const raro of [{ dias_de_campana: 0 }, { dias_de_campana: 'noventa' }, { dias_de_campana: 367 }, { semanas_de_tanda: 0 }, { semanas_de_tanda: 1.5 }]) {
      const al = almacen()
      expect((await abrir(al, raro)).status).toBe(400)
      expect(al.campanas.length).toBe(0)
    }
  })
})

describe('los pilares que no suman 100 se corrigen por código (01-nov · firma de Emilio)', () => {
  const conPilares = (pcts: number[]) => ({ ...A.estrategia, pilares: pcts.map((pct, i) => ({ ...A.estrategia.pilares[i % A.estrategia.pilares.length], clave: `p${i}`, pct })) })
  it('🔴 lo que se GUARDA es lo ajustado, sin reintento ni bloqueo, y el aviso S01 queda a la vista', async () => {
    const al = almacen()
    const { id, g } = await conEstrategia(al, conPilares([60, 30]))
    expect(g.cuerpo.reintentar).toBeUndefined()
    expect(g.cuerpo.necesita_humano).toBeUndefined()
    const guardada = await al.ultimaEstrategia(id)
    expect(guardada!.estado).toBe('validada')
    expect(guardada!.contenido.pilares.map((p) => p.pct)).toEqual([67, 33])
    expect(JSON.stringify(al.validaciones.filter((v) => v.objeto === 'estrategia'))).toMatch(/S01.*ajustó en proporción|ajustó en proporción.*S01/)
  })
  it('🔴 el ensayo sin escribir también ajusta y no bloquea', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const r = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: conPilares([60, 30]) }, AHORA)
    expect(JSON.stringify(r.cuerpo)).toContain('ajustó en proporción')
    expect(JSON.stringify(r.cuerpo)).not.toContain('deben sumar 100')
  })
})

describe('autorización y compuerta', () => {
  it('🔴 sin workflow_id o sin workflow_execution_id: 400 (la causa del 403 conocido de la revisión de agentes)', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true }, ABRE)).status).toBe(400)
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'wf-cadena' }, ABRE)).cuerpo.code).toBe('E-WORKFLOW-CTX')
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_execution_id: 'x' }, ABRE)).status).toBe(400)
  })
  it('un workflow_id que no es flujo de la cadena ni viaje de la sala de ESE cliente: 403; un viaje real vale', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'wf-ajeno', workflow_execution_id: '1' }, ABRE)).status).toBe(403)
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'journey-1', workflow_execution_id: '1' }, ABRE)).status).toBe(201)
    const otro = almacen({ journeys: [{ journeyId: 'journey-1', clientId: 'otro-cliente' }] })
    expect((await abrirCampana(otro, { client_id: A.clientId, seco: true, workflow_id: 'journey-1', workflow_execution_id: '1' }, ABRE)).status).toBe(403)
  })
  it('apagada: solo corre en seco; ensayo: solo clientes de ensayo; encendida: todo', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, ABRE)).cuerpo.code).toBe('E-CADENA-APAGADA')
    expect(al.campanas).toHaveLength(0)
    al.config.set('estado_cadena', 'ensayo')
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, ABRE)).cuerpo.code).toBe('E-CADENA-NO-ADMITIDO')
    al.config.set('clientes_ensayo', [A.clientId])
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, ABRE)).status).toBe(201)
  })
  it('🔴 seco mal escrito se detiene antes de escribir (ni «true» como texto ni null)', async () => {
    const al = almacen()
    for (const seco of ['true', null, 1]) expect((await abrirCampana(al, { ...wf(), client_id: A.clientId, seco }, ABRE)).cuerpo.code).toBe('E-SECO-INVALIDO')
    expect(al.campanas).toHaveLength(0)
  })
})

describe('abrir la campaña', () => {
  it('un plan que no es de este cliente cierra con plan_no_coincide y NO escribe nada', async () => {
    const al = almacen()
    const r = await abrir(al, { plan_id: 'plan-de-otro' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.resultado).toBe('plan_no_coincide')
    expect(al.campanas).toHaveLength(0)
    expect(al.esperas).toHaveLength(0)
  })
  it('🔴 18-nov (DECISIÓN DE EMILIO): abre con el día 1 = el día de apertura, fin a 90 días (el plan no declara ventana), sin aviso ni espera de «fecha propuesta»', async () => {
    const al = almacen()
    const r = await abrir(al)
    expect(r.status).toBe(201)
    const c = r.cuerpo.campana as Record<string, unknown>
    expect(c.fecha_inicio).toBe(ABRE.slice(0, 10))
    expect(c.fecha_fin).toBe('2027-01-09')
    expect(c.fecha_inicio_origen).toBe('regla')
    expect(c.estado).toBe('abierta')
    expect(r.cuerpo.aviso_fecha_inicio).toBeNull()
    expect(al.esperas).toEqual([])
  })
  it('🔴 18-nov: el día 1 es el de la ZONA del cliente, no el de UTC (las 03:00 UTC del 12 son todavía el 11 en Guayaquil)', async () => {
    const ctx = { ...contextoDe(A), zonaHoraria: 'America/Guayaquil' }
    const al = new AlmacenMemoria({ contextos: { [A.clientId]: ctx }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: ['wf-cadena'] } })
    const r = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, '2026-10-12T03:00:00Z')
    expect((r.cuerpo.campana as { fecha_inicio: string }).fecha_inicio).toBe('2026-10-11')
  })
  it('el mismo sobre dos veces no abre dos campañas', async () => {
    const al = almacen()
    await abrir(al)
    const r2 = await abrir(al)
    expect(r2.cuerpo.ya_abierta).toBe(true)
    expect(al.campanas).toHaveLength(1)
  })
  it('🔴 condición 6: un plan NUEVO del mismo cliente reemplaza a la campaña anterior (el sobre nuevo no cae como duplicado)', async () => {
    const al = almacen({ planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-20' }] } })
    const r1 = await abrir(al, { plan_id: 'plan-1' })
    const r2 = await abrir(al, { plan_id: 'plan-2' })
    expect(r2.status).toBe(201)
    expect(r2.cuerpo.reemplaza_a).toBe(idCampana(r1))
    expect(al.campanas.find((c) => c.plan_id === 'plan-1')!.estado).toBe('reemplazada')
    expect(al.campanas.find((c) => c.plan_id === 'plan-2')!.estado).toBe('abierta')
    expect(al.campanas.filter((c) => c.estado !== 'reemplazada')).toHaveLength(1)
    // y la espera de la campaña vieja se resolvió: nada espera sobre algo reemplazado
    expect(al.esperas.filter((e) => e.campana_id === idCampana(r1) && e.estado === 'viva')).toHaveLength(0)
  })
  it('🔴 18-nov: un feriado nacional verificado ya no corre el día 1: la campaña empieza el día en que se abre', async () => {
    const al = almacen({ fechasEspeciales: [{ id: 'f', fecha: '2026-10-12', nombre: 'x', tipo: 'feriados', ambito: 'nacional', alcance: 'nacional', estado: 'verificada' }] })
    const r = await abrir(al)
    expect((r.cuerpo.campana as { fecha_inicio: string }).fecha_inicio).toBe('2026-10-12')
    expect(r.cuerpo.aviso_fecha_inicio).toBeNull()
  })
})

describe('avanzar y cerrar', () => {
  it('transiciones válidas; una inválida es 409; necesita_humano abre su reloj con aviso inmediato', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    expect((await avanzarCampana(al, { ...wf(), campana_id: id, a: 'activa' }, AHORA)).status).toBe(409)
    const nh = await avanzarCampana(al, { ...wf(), campana_id: id, a: 'necesita_humano', motivo: 'algo raro' }, AHORA)
    expect(nh.status).toBe(200)
    expect(nh.cuerpo.alerta).toMatch(/necesita a Emilio/)
    const e = al.esperas.find((x) => x.objeto_tipo === 'necesita_humano')!
    expect(e).toMatchObject({ estado: 'viva' })
    expect(e.alerta_en).toBe(AHORA.replace('Z', '.000Z')) // aviso inmediato
    // Emilio lo resuelve: la espera se cierra
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'estrategia' }, AHORA)
    expect(al.esperas.find((x) => x.objeto_tipo === 'necesita_humano')!.estado).toBe('resuelta')
  })
  it('pausar abre su espera (la pausada también tiene reloj)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    al.campanas[0].estado = 'activa'
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'pausada' }, AHORA)
    expect(al.esperas.some((e) => e.objeto_tipo === 'campana_pausada' && e.estado === 'viva')).toBe(true)
  })
  it('el cable de cierre lleva el worker_id de la PUERTA y el viaje de la sala; sin viaje no hay a quién contestar; sin id de puerta, 503', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al, { sala_ref: { _journey_id: 'journey-1', _sala_correlation_id: 'corr-1' } }))
    const r = await cierreDeCampana(al, { ...wf(), campana_id: id, resultado: 'cadena_abierta' })
    expect(r.cuerpo.payload_cable).toMatchObject({ worker_id: 'wf-puerta', _journey_id: 'journey-1', resultado: 'cadena_abierta', client_id: A.clientId })
    // r73 · lo que EXIGE el receptor de la sala (parseCallbackBody): event_type, tenant_id, ts, correlación y viaje
    expect(r.cuerpo.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'cadena', tenant_id: A.clientId })
    expect(Number.isNaN(Date.parse((r.cuerpo.payload_cable as { ts: string }).ts))).toBe(false)
    expect((await cierreDeCampana(al, { ...wf(), campana_id: id, resultado: 'inventado' })).status).toBe(400)
    const sinViaje = almacen()
    const id2 = idCampana(await abrir(sinViaje))
    expect((await cierreDeCampana(sinViaje, { ...wf(), campana_id: id2, resultado: 'cadena_abierta' })).cuerpo.payload_cable).toBeNull()
    const sinPuerta = almacen({ config: { flujos: ['wf-cadena'] } })
    const id3 = idCampana(await abrir(sinPuerta, { sala_ref: { _journey_id: 'journey-1' } }))
    expect((await cierreDeCampana(sinPuerta, { ...wf(), campana_id: id3, resultado: 'cadena_abierta' })).status).toBe(503)
  })
})

describe('la estrategia: preparar y guardar', () => {
  it('preparar devuelve el cuerpo completo del run-sdk: esquema, tope, razonamiento, modelo, cabecera de saltar el editor; abre la corrida CON plazo', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const r = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(r.status).toBe(200)
    const run = r.cuerpo.run_sdk as Record<string, any>
    expect(run.agent).toBe('social-media-strategist')
    expect(run.output_schema.type).toBe('object')
    expect(run.output_schema.additionalProperties).toBe(false)
    expect(run.max_budget_usd).toBeGreaterThanOrEqual(1)
    expect(run.thinking_mode).toBe('maximo') // 21-nov · opción A: la vuelta por el corredor; se deshace el «high» temporal de #1260
    expect(run.model_override).toBe('claude-opus-5-5')
    expect(run.task).toContain(A.planTexto)
    expect(r.cuerpo.headers).toEqual({ 'x-skip-editor-middleware': '1' })
    const corrida = al.corridas[0]
    expect(corrida).toMatchObject({ estado: 'en_curso', paso: 'estrategia', salida_estructurada: true, revision_editor: 'saltada_por_diseno' })
    expect(corrida.plazo_en).toBe('2026-10-09T13:02:00.000Z') // 21-nov · opción A: el piso de 62 min (espera del Wait 3 600 s + 2; la config de prueba dice 6)
    expect(al.campanas[0].estado).toBe('estrategia')
  })
  it('🔴 la indicación no filtra datos de un cliente ni una forma de contactar al dueño', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const run = (await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo.run_sdk as { task: string }
    expect(run.task).not.toMatch(/recado|contacta al due|pregunta al due/i)
    expect(run.task).toMatch(/Nunca se le pregunta nada a nadie del negocio/)
  })
  it('una segunda preparación mientras la primera está en curso (dentro de su plazo) es 409; pasado el plazo se marca vencida y abre el intento siguiente', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect((await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-10-09T12:05:00Z')).status).toBe(409)
    const tarde = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-10-09T13:30:00Z')
    expect(tarde.status).toBe(200)
    expect(tarde.cuerpo.intento).toBe(2)
    expect(al.corridas[0].estado).toBe('vencida')
  })
  it('guardar una estrategia válida: version 1 validada, la campaña pasa a calendario, la corrida queda ok con su costo; repetir es idempotente', async () => {
    const al = almacen()
    const { id, g } = await conEstrategia(al)
    expect(g.cuerpo.ok).toBe(true)
    expect(al.estrategias[0]).toMatchObject({ version: 1, estado: 'validada', agente: 'social-media-strategist' })
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('calendario')
    expect(al.corridas[0]).toMatchObject({ estado: 'ok', costo_usd: 0.3, plazo_en: null })
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.status === 200 || otra.status === 409).toBe(true)
  })
  it('la llamada que no entrega el objeto: reintentar; a la tercera, el fin declarado · 18-nov grupo A: sin necesita_humano, el reintento es del tramo siguiente (nada queda colgado)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    for (let i = 1; i <= 3; i++) {
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
      const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, error: 'E-OUTPUT-SCHEMA-MISSING', cost_usd: 0.2 } }, AHORA)
      expect(g.cuerpo.reintentar).toBe(true)
      expect(g.cuerpo.necesita_humano).toBeUndefined()
    }
    // la vuelta del flujo después del tercero: `preparar` contesta el fin declarado (en este tramo no se insiste)
    const cuarta = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(cuarta.status).toBe(409)
    expect(cuarta.cuerpo.error).toBe('intentos_agotados')
    expect(cuarta.cuerpo.reintenta).toBe(true)
    expect(al.campanas[0].estado).not.toBe('necesita_humano')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano')).toBe(false)
    expect(al.corridas).toHaveLength(3)
    expect(al.corridas.every((c) => c.estado === 'fallida')).toBe(true)
  })
  it('19-nov · grupo C · una estrategia inválida: hasta 3 rondas de corrección con sus fichas; si sigue mal, queda vigente la MEJOR con avisos y la campaña sigue (ya no necesita_humano)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const mala = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 9999 })) }
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    let g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p1.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
    for (const ronda of [1, 2, 3]) {
      expect(g.cuerpo.correccion).toBe(true)
      expect(g.cuerpo.ronda).toBe(ronda)
      expect((g.cuerpo.fichas as unknown[]).length).toBeGreaterThan(0)
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g.cuerpo.fichas } }, AHORA)
      expect((p.cuerpo.run_sdk as { task: string }).task).toContain('CORRECCIÓN')
      expect(al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia).toBe(`v1:c${ronda}`)
      // CC1 (04:31Z): mientras dura la ronda, NINGÚN lector de la estrategia ve la ronda (no hay borrador en cadena_estrategias)
      expect(await al.ultimaEstrategia(id)).toBeNull()
      g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, correccion: true, resultado: ok(mala) }, AHORA)
    }
    // CC1 · Lenovo 04:45Z: las rondas no consumen números de versión; viven solo en su tabla, con su llave (campaña, versión, ronda)
    expect(al.estrategias.map((e) => e.version)).toEqual([1])
    expect((await al.estrategiaEnVersion(id, 1))!.estado).toBe('validada')
    expect(await al.estrategiaEnVersion(id, 2)).toBeNull()
    expect(al.rondasDeLaEstrategia.every((x) => x.version === 1)).toBe(true)
    expect(g.cuerpo.version).toBe(1)
    expect(g.cuerpo.necesita_humano).toBeUndefined()
    expect(g.cuerpo.ok).toBe(true)
    expect(al.estrategias).toHaveLength(1)
    expect(al.estrategias[0].estado).toBe('validada')
    expect((g.cuerpo.avisos as string[]).length).toBeGreaterThan(0)
    expect((g.cuerpo.avisos as string[]).every((a) => a.includes('quedó vigente la mejor versión'))).toBe(true)
    expect(al.rondasDeLaEstrategia.map((x) => x.ronda)).toEqual([0, 1, 2, 3])
    expect(al.campanas[0].estado).toBe('calendario')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano')).toBe(false)
    expect(al.validaciones.map((v) => v.intento)).toEqual([1, 2, 2, 2])
  })
  it('19-nov · C1 · DECISIÓN Lenovo 05:00Z · la campaña abierta por el camino real nace con la bolsa de planificación de SUS tandas (no 6)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const c = al.campanas.find((x) => x.id === id)!
    expect(c.presupuesto_planificacion_usd).toBe(bolsaDePlanificacion(medidaDeCampana(c).totalTandas))
    expect(c.presupuesto_planificacion_usd).toBeGreaterThan(6)
  })
  it('🔴 19-nov · C1 · m15 de CC6 · la ronda 2 de la estrategia REENVIADA sin `correccion` (r74) sigue siendo corrección: valida a nivel 2 y pide la ronda 3', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const mala = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 9999 })) }
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    let g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p1.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
    for (const ronda of [1, 2]) {
      expect(g.cuerpo).toMatchObject({ correccion: true, ronda })
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g.cuerpo.fichas } }, AHORA)
      expect(al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia).toBe(`v1:c${ronda}`)
      // la ronda 2 llega como el reenvío tras una llamada vencida: SIN `correccion`
      g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, ...(ronda === 1 ? { correccion: true } : {}), resultado: ok(mala) }, AHORA)
    }
    expect(g.cuerpo).toMatchObject({ correccion: true, ronda: 3 })
    const intentos = al.validaciones.filter((v) => v.objeto === 'estrategia').map((v) => v.intento)
    expect(intentos).toEqual([1, 2, 2])
  })
  it('19-nov · grupo C · la mejor versión es la de MENOS bloqueos (no la última), y sus bloqueos son los avisos', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    // muy mala: la fase fuera de la campaña + una red excluida sin cita (S03); poco mala: solo la fase
    const pocoMala = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 9999 })) }
    const muyMala = { ...pocoMala, excluidos: [...A.estrategia.excluidos, { red: 'red-sin-cita', cita_plan: '' }] }
    const respuestas = [muyMala, pocoMala, muyMala, muyMala]
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    let g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p1.cuerpo.corrida_id, resultado: ok(respuestas[0]) }, AHORA)
    for (const r of respuestas.slice(1)) {
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g.cuerpo.fichas } }, AHORA)
      g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, correccion: true, resultado: ok(r) }, AHORA)
    }
    const bloqueos = al.rondasDeLaEstrategia.map((x) => x.bloqueos)
    expect(bloqueos[1]).toBeLessThan(bloqueos[0]) // el control: la poco mala de verdad tiene menos
    expect(al.estrategias[0].contenido).toEqual(al.rondasDeLaEstrategia[1].contenido)
    expect(al.estrategias[0].contenido).not.toEqual(al.rondasDeLaEstrategia[3].contenido)
    expect(g.cuerpo.avisos as string[]).toHaveLength(bloqueos[1])
    expect((g.cuerpo.avisos as string[])[0]).toContain('ronda 1')
  })
  it('🔴 el presupuesto de planificación se respeta: sin presupuesto no se llama (18-nov grupo A: sin necesita_humano) y un corte con costo 0 en el libro cuenta el tope', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    al.campanas[0].presupuesto_planificacion_usd = 15 // 24-nov: 1,5 × el tope de la estrategia (US$ 10): alcanza para UNA llamada, no para dos
    al.campanas[0].tope_gasto_usd = 15 // la bolsa se agrandaría sola; el tope de la campaña la deja donde está
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, cost_usd: 0, cerrada_por_tope: true, error: 'cortada' } }, AHORA)
    expect(al.corridas[0].estado).toBe('cerrada_por_tope')
    expect(costoEfectivo({ costo_usd: 0, estado: 'cerrada_por_tope', paso: 'estrategia' })).toBe(topeDelPaso('estrategia'))
    expect(costoEfectivo({ costo_usd: 0, estado: 'ok', paso: 'estrategia' })).toBe(0)
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.status).toBe(409)
    expect(otra.cuerpo.error).toBe('presupuesto_agotado')
    expect(al.campanas[0].estado).not.toBe('necesita_humano')
    expect(al.campanas[0].presupuesto_planificacion_usd).toBe(15)
  })
  it('la corrida de otra campaña o inexistente es 404; guardar dos veces la misma no la duplica', async () => {
    const al = almacen()
    const { id, p } = await conEstrategia(al)
    expect((await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: 999, resultado: ok(A.estrategia) }, AHORA)).status).toBe(404)
    const otra = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    expect(otra.cuerpo.ya_guardada).toBe(true)
    expect(al.estrategias).toHaveLength(1)
  })
})

describe('el calendario: preparar, guardar, una corrección, filas que salen', () => {
  it('🔴 sin estrategia validada no se prepara', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)).status).toBe(409)
  })
  it('una tanda buena: filas validadas, panorama de 12 semanas SIN modelo, campaña activa', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const { p, g } = await tandaDe(al, id, 1, tandaBuena(A))
    const run = p.cuerpo.run_sdk as Record<string, any>
    expect(run.output_schema.properties.piezas).toBeDefined()
    expect('fecha' in run.output_schema.properties.piezas.items.properties).toBe(false) // el modelo NO puede escribir una fecha
    expect(p.cuerpo.semanas).toEqual([1, 2, 3, 4])
    expect(g!.cuerpo).toMatchObject({ ok: true, tanda: 1, filas: 16, validadas: 16, panorama_semanas: 12 })
    const filas = await al.filas(id)
    expect(filas.filter((f) => f.estado === 'validada')).toHaveLength(16)
    expect(filas.filter((f) => f.estado === 'esquema')).toHaveLength(32) // semanas 5..12 × 4 slots
    expect(filas.find((f) => f.id === 's1-d1-a')!.fecha).toBe('2026-10-12')
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    expect(al.corridas.find((c) => c.paso === 'calendario')).toMatchObject({ estado: 'ok', revision_editor: 'saltada_por_diseno' })
  })
  it('🔴 un dato sin fuente: UNA corrección pidiendo SOLO esa fila; si el modelo no lo arregla la FILA sale (no se pregunta a nadie) y el resto sigue', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'no-existe', nivel: 'F1', opcional: false }] } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    expect(g!.cuerpo.correccion).toBe(true)
    expect(g!.cuerpo.modo).toBe('filas')
    expect(g!.cuerpo.fila_ids).toEqual(['s1-d1-a'])
    // la corrección vuelve igual de mal
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    expect((p2.cuerpo.run_sdk as { task: string }).task).toContain('Devuelve SOLO las piezas que fallaron')
    const soloMala = { piezas: [{ ...piezaBuena(A, 1, 'a', 'Nuestro pan de 45 g'), datos: [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'no-existe', nivel: 'F1', opcional: false }] }], ajustes_al_patron: [] }
    const g2 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok(soloMala) }, AHORA)
    expect(g2.cuerpo).toMatchObject({ ok: true, salieron_sin_fuente: ['s1-d1-a'], validadas: 15 })
    const filas = await al.filas(id)
    expect(filas.find((f) => f.id === 's1-d1-a')!.estado).toBe('descartada_sin_fuente')
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    expect(al.validaciones.filter((v) => v.objeto === 'calendario').map((v) => v.intento)).toContain(2)
  })
  it('un dato sin fuente que la corrección SÍ arregla: nadie sale', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'no-existe', nivel: 'F1', opcional: false }] } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    const arreglada = { piezas: [piezaBuena(A, 1, 'a', 'Nuestro pan de la casa')], ajustes_al_patron: [] }
    const g2 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok(arreglada) }, AHORA)
    expect(g2.cuerpo).toMatchObject({ ok: true, validadas: 16 })
    expect(g2.cuerpo.salieron_sin_fuente).toEqual([])
  })
  it('🔴 19-nov · grupo C · un bloqueo que NO es de dato vuelve al creador hasta 3 rondas; tras la última la FILA sale (descartada_por_bloqueo) y la campaña sigue', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, formato: 'formato-inexistente' } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    const g4 = await tresRondasMalas(al, id, g!)
    expect(g4.cuerpo.necesita_humano).toBeUndefined()
    expect(g4.cuerpo.ok).toBe(true)
    expect(g4.cuerpo.salieron_por_bloqueo).toEqual([fila4b(al).id])
    expect(g4.cuerpo.salieron_sin_fuente).toEqual([])
    expect(fila4b(al).estado).toBe('descartada_por_bloqueo')
    expect(al.campanas.find((c) => c.id === id)!.estado).not.toBe('necesita_humano')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano')).toBe(false)
  })
  it('una pieza de video nace espera_video con su reloj (fecha − lead) y no entra a ningún lote', async () => {
    const al = almacen()
    const e: Estrategia = { ...A.estrategia, patron_semanal: [...A.estrategia.patron_semanal, { slot: 'r', dia_semana: 3, hora: '18:00', red: 'instagram', formato: 'reel', pilar: 'historia', requiere_abierto: false, sede: 'centro' }], canales: A.estrategia.canales.map((c) => (c.red === 'instagram' ? { ...c, formatos: [...c.formatos, 'reel'], frecuencia: { ...c.frecuencia, feed_semana: 4 } } : c)), piezas_fijas: [] }
    const { id } = await conEstrategia(al, e)
    const t = { piezas: [1, 2, 3, 4].flatMap((s) => e.patron_semanal.map((p) => piezaBuena({ ...A, estrategia: e }, s, p.slot, `Tema ${p.pilar} ${s}`))), ajustes_al_patron: [] }
    const { g } = await tandaDe(al, id, 1, t)
    expect(g!.cuerpo).toMatchObject({ ok: true, espera_video: 4 })
    const esp = al.esperas.filter((x) => x.objeto_tipo === 'espera_video')
    expect(esp).toHaveLength(4)
    expect(esp.find((x) => x.objeto_id === 's4-d3-r')!.vence_en).toBe('2026-10-30T00:00:00.000Z') // 4 nov (semana 4, miércoles) − 5 días de lead
    expect(esp.find((x) => x.objeto_id === 's1-d3-r')!.vence_en).toBe('2026-10-09T12:00:00.000Z') // ya iba tarde: vence YA, no en el pasado
    const lotes = await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-12-01' }, AHORA)
    expect(JSON.stringify(lotes.cuerpo)).not.toContain('-r"')
  })
  it('preparar la misma tanda ya hecha no repite el gasto', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    await tandaDe(al, id, 1, tandaBuena(A))
    const otra = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(otra.cuerpo.ya_hecha).toBe(true)
    expect(al.corridas.filter((c) => c.paso === 'calendario')).toHaveLength(1)
  })
  it('tanda fuera de rango: 400', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 9 }, AHORA)).status).toBe(400)
  })
  it('validar no escribe nada: devuelve los hallazgos', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const antes = JSON.stringify([al.filasGuardadas, al.validaciones, al.corridas])
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, formato: 'foto o reel' } : p)) }
    const r = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'calendario', tanda: 1, tanda_agente: mala }, AHORA)
    expect(r.cuerpo.bloquea).toBe(true)
    const e = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: { canales: [] } }, AHORA)
    expect(e.cuerpo.forma_valida).toBe(false)
    expect(JSON.stringify([al.filasGuardadas, al.validaciones, al.corridas])).toBe(antes)
  })
})

describe('filas: lotes por fecha y marcas', () => {
  async function campanaActiva() {
    const al = almacen()
    const { id } = await conEstrategia(al)
    await tandaDe(al, id, 1, tandaBuena(A))
    return { al, id }
  }
  it('toca briefear cuando fecha − lead − holgura ≤ hoy; agrupado por semana ISO, con clave de idempotencia campana:semana:version', async () => {
    const { al, id } = await campanaActiva()
    const antes = await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-09-01' }, AHORA)
    expect(antes.cuerpo.lotes).toEqual([])
    const r = await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-10-12' }, AHORA)
    const lotes = r.cuerpo.lotes as { lote: string; fila_ids: string[]; idempotency_key: string }[]
    expect(lotes[0].lote).toBe('2026-W42')
    expect(lotes[0].idempotency_key).toBe(`${id}:2026-W42:1`)
    expect(lotes[0].fila_ids).toContain('s1-d1-a')
    expect(lotes[0].fila_ids).not.toContain('s4-d1-a')
  })
  it('una campaña que no está activa no genera lotes', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    expect((await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-12-01' }, AHORA)).cuerpo.lotes).toEqual([])
  })
  it('marcar: transiciones legales sí, ilegales 409 con el detalle', async () => {
    const { al, id } = await campanaActiva()
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'lista_para_brief', fila_ids: ['s1-d1-a'] })).status).toBe(200)
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'aprobada', fila_ids: ['s1-d4-b'] })).status).toBe(409) // validada → aprobada no existe
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] })).status).toBe(200)
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['no-existe'] })).status).toBe(409)
    expect((await filasListar(al, { ...wf(), campana_id: id, estado: 'briefeada' })).cuerpo.total).toBe(1)
  })
})

describe('fechas especiales · solo con tipos declarados, con la cita comprobada por código', () => {
  const base = (al: AlmacenMemoria) => ({ ...wf(), campana_id: al.campanas[0].id, pais: 'Pais Uno', tipo: 'feriados locales', ambito: 'Ciudad Uno', anio: 2026 })
  it('sin lista de dominios para ese tipo y país: sin configurar (10-nov · B), sin investigar nada ni contar intento (la campaña sigue)', async () => {
    const al = almacen()
    await abrir(al)
    const r = await fechasCobertura(al, base(al))
    expect(r.cuerpo.estado).toBe('sin_fuente') // lo único que el proceso de fechas entiende para terminar
    expect(r.cuerpo.cobertura).toBe('sin_configurar')
    expect(r.cuerpo.motivo).toMatch(/sin_configurar/)
    expect(al.coberturas.map((c) => [c.estado, c.intentos])).toEqual([['sin_configurar', 0]])
  })
  it('con dominios: investigar (intento 1, 2, 3) y a la tercera sin fuente; no se repite el gasto una vez verificada', async () => {
    const al = almacen({ config: { flujos: ['wf-cadena'], dominios_fechas: { 'feriados_locales|pais_uno': ['https://fuente.example'] } } })
    await abrir(al)
    for (const n of [1, 2, 3]) expect((await fechasCobertura(al, base(al))).cuerpo).toMatchObject({ estado: 'investigar', intento: n })
    expect((await fechasCobertura(al, base(al))).cuerpo.estado).toBe('sin_fuente')
  })
  it('🔴 la cita se comprueba por código: debe aparecer literal en la página descargada y mencionar el día y el mes', async () => {
    const al = almacen({ config: { flujos: ['wf-cadena'], dominios_fechas: { 'feriados_locales|pais_uno': ['https://fuente.example'] } } })
    await abrir(al)
    await fechasCobertura(al, base(al))
    const pagina = { url: 'https://fuente.example/f', texto: 'Calendario. El 3 de noviembre se celebra la independencia de la ciudad. El 10 de agosto otra fiesta.' }
    const fechas = [
      { fecha: '2026-11-03', nombre: 'Independencia', alcance: 'local', fuente_url: pagina.url, cita_literal: 'El 3 de noviembre se celebra la independencia' },
      { fecha: '2026-11-04', nombre: 'Inventada', alcance: 'local', fuente_url: pagina.url, cita_literal: 'El 4 de noviembre es fiesta' }, // la cita no está en la página
      { fecha: '2026-08-12', nombre: 'Mal día', alcance: 'local', fuente_url: pagina.url, cita_literal: 'El 10 de agosto otra fiesta' }, // la cita existe pero habla del 10, no del 12
      { fecha: '2026-12-01', nombre: 'Otra página', alcance: 'local', fuente_url: 'https://no-descargada.example', cita_literal: 'x' },
    ]
    const r = await fechasGuardar(al, { ...base(al), paginas: [pagina], resultado: { fechas } })
    expect(r.cuerpo.verificadas).toBe(1)
    expect((r.cuerpo.descartadas as string[]).length).toBe(3)
    expect(al.fechas.filter((f) => f.estado === 'verificada').map((f) => f.fecha)).toEqual(['2026-11-03'])
    expect((await fechasCobertura(al, base(al))).cuerpo.estado).toBe('ya_verificada')
  })
  it('el mismo nombre con fechas distintas en dos fuentes queda pendiente (C02), no verificado', async () => {
    const al = almacen({ config: { flujos: ['wf-cadena'], dominios_fechas: { 'feriados_locales|pais_uno': ['https://a.example'] } } })
    await abrir(al)
    await fechasCobertura(al, base(al))
    const p1 = { url: 'https://a.example/x', texto: 'El 3 de noviembre es la fiesta.' }, p2 = { url: 'https://b.example/y', texto: 'El 4 de noviembre es la fiesta.' }
    const fechas = [
      { fecha: '2026-11-03', nombre: 'La fiesta', alcance: 'local', fuente_url: p1.url, cita_literal: 'El 3 de noviembre es la fiesta' },
      { fecha: '2026-11-04', nombre: 'La fiesta', alcance: 'local', fuente_url: p2.url, cita_literal: 'El 4 de noviembre es la fiesta' },
    ]
    const r = await fechasGuardar(al, { ...base(al), paginas: [p1, p2], resultado: { fechas } })
    expect(r.cuerpo.verificadas).toBe(0)
    expect(al.fechas.every((f) => f.estado === 'pendiente')).toBe(true)
  })
})

describe('el reloj del vigía', () => {
  it('apagada: no hay latido ni alarmas (nada que vigilar)', async () => {
    const al = almacen()
    const r = await relojDeLaCadena(al, { ...wf({ workflow_id: 'wf-vigia' }) }, AHORA)
    expect(r.cuerpo.inactivo).toBe(true)
    expect(al.config.get('ultimo_latido')).toBeNull()
  })
  it('solo lo llama un flujo de la cadena', async () => {
    const al = almacen()
    expect((await relojDeLaCadena(al, { workflow_id: 'wf-ajeno', workflow_execution_id: '1', seco: true }, AHORA)).status).toBe(403)
  })
  it('escribe el latido y cada escalón sale UNA sola vez; los avisos van agregados por campaña', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } })
    const id = idCampana(await abrir(al, { seco: false }))
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'necesita_humano', motivo: 'm' }, AHORA)
    const vig = { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }
    const r1 = await relojDeLaCadena(al, vig, '2026-10-10T13:00:00Z') // pasaron 25 h: toca el recordatorio y la alerta (alerta_horas = 0)
    expect(r1.cuerpo.latido).toBe('2026-10-10T13:00:00Z')
    expect(al.config.get('ultimo_latido')).toBe('2026-10-10T13:00:00Z')
    const campAl = (r1.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).filter((a) => a.campana_id === id)
    expect(campAl).toHaveLength(1) // UN mensaje para la campaña, no uno por espera
    const r2 = await relojDeLaCadena(al, vig, '2026-10-10T14:00:00Z')
    expect((r2.cuerpo.alertas as { campana_id: string }[]).filter((a) => a.campana_id === id)).toHaveLength(0) // ya salió: no se repite
  })
  it('al vencer la bandeja la pieza pierde su fecha y NUNCA se aprueba sola', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } })
    const { id } = await conEstrategia(al)
    await tandaDe(al, id, 1, tandaBuena(A))
    al.campanas.find((c) => c.id === id)!.seco = true
    const { abrirEsperaDe } = await import('../nucleo')
    await abrirEsperaDe(al, { id, seco: true }, 'aprobacion_bandeja', 's1-d1-a', 'brief en la bandeja', AHORA, { fechaPieza: '2026-10-12' })
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-13T00:00:00Z')
    expect(r.cuerpo.aplicado).toContain('s1-d1-a perdió su fecha')
    expect((await al.filas(id)).find((f) => f.id === 's1-d1-a')!.estado).toBe('perdio_su_fecha')
    expect((await al.filas(id)).some((f) => f.estado === 'aprobada')).toBe(false)
  })
  it('🔴 una llamada colgada pasado su plazo se marca vencida (el siguiente preparar abre el intento que sigue)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-09T13:05:00Z')
    expect(al.corridas[0].estado).toBe('vencida')
    expect(JSON.stringify(r.cuerpo.alertas)).toContain('pasó su plazo')
  })
  it('🔴 V21 con el latido ANTERIOR: un vigía que estuvo parado más de 18 h se ve en la pasada siguiente', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-vigia'], ultimo_latido: '2026-10-08T00:00:00Z' } })
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v' }, '2026-10-09T12:00:00Z')
    expect((r.cuerpo.violaciones as { tipo: string }[]).map((v) => v.tipo)).toContain('vigia_parado')
    expect(JSON.stringify(r.cuerpo.alertas)).toContain('V21')
  })
  it('cuando el brazo de video opera, las filas que esperaban pasan a validada; los avisos solo se mandan si está encendida y no es seco', async () => {
    const al = almacen({ brazoVideo: 'opera', config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } })
    const e: Estrategia = { ...A.estrategia, patron_semanal: [...A.estrategia.patron_semanal, { slot: 'r', dia_semana: 3, hora: '18:00', red: 'instagram', formato: 'reel', pilar: 'historia', requiere_abierto: false, sede: 'centro' }], canales: A.estrategia.canales.map((c) => (c.red === 'instagram' ? { ...c, formatos: [...c.formatos, 'reel'], frecuencia: { ...c.frecuencia, feed_semana: 4 } } : c)), piezas_fijas: [] }
    const { id } = await conEstrategia(al, e)
    await tandaDe(al, id, 1, { piezas: [1, 2, 3, 4].flatMap((s) => e.patron_semanal.map((p) => piezaBuena({ ...A, estrategia: e }, s, p.slot, `Tema ${p.pilar} ${s}`))), ajustes_al_patron: [] })
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v' }, '2026-10-09T13:00:00Z')
    expect(r.cuerpo.enviar_alertas).toBe(true)
    expect((await al.filas(id)).filter((f) => f.estado === 'espera_video')).toHaveLength(0)
    expect(al.esperas.filter((x) => x.objeto_tipo === 'espera_video' && x.estado === 'viva')).toHaveLength(0)
    const seco = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-09T14:00:00Z')
    expect(seco.cuerpo.enviar_alertas).toBe(false)
  })
  it('el resumen semanal resume las pausadas y el video que espera en UNA línea por campaña', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } })
    const id = idCampana(await abrir(al, { seco: false }))
    al.campanas[0].estado = 'activa'
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'pausada' }, AHORA)
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', resumen: true }, '2026-10-09T13:00:00Z')
    expect(JSON.stringify(r.cuerpo.alertas)).toContain('resumen: campaña pausada')
  })
})

describe('el reloj de las esperas se usa en la bandeja (condición 5)', () => {
  it('expires_in_hours de un ítem de la bandeja supera a la alerta de 72 h', () => {
    expect(expiresInHours('2026-10-09T12:00:00Z', '2026-10-10')).toBeGreaterThan(72)
  })
})

describe('afinando lo que las mutaciones dejaron vivo (manejadores)', () => {
  it('🔴 tras 3 intentos fallidos de la misma llamada, un cuarto preparar no abre otra: necesita_humano (cadencia con tope, nunca reintento infinito)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    for (let i = 0; i < 3; i++) {
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
      await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, error: 'x' } }, AHORA)
    }
    al.campanas[0].estado = 'estrategia' // Emilio la devolvió a estrategia para otro intento
    const cuarta = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(cuarta.cuerpo.error).toBe('intentos_agotados')
    expect(al.corridas).toHaveLength(3)
  })
  it('una llamada ya hecha (misma clave) no se repite ni se cobra otra vez cuando su objeto quedó validado', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.cuerpo.ya_hecha).toBe(true)
    expect(al.corridas).toHaveLength(1)
  })
  // 24-nov · entrega 2b (retomar donde se cayó · GO Lenovo 11:16Z): reenviada sin `correccion`, ya no repite la primera pasada (`v1:c0`, intento 2):
  // sigue con la corrección en curso, leída de la base (ronda 1, intento 1). Lo de r79 se mantiene: nunca «ya hecha» sin objeto validado
  it('r79 · una llamada que sirvió pero pidió corrección (sin objeto validado) y se reenvía sin ella NO es «ya hecha»: sigue con la ronda de corrección guardada', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const mala = { ...A.estrategia, fases: A.estrategia.fases.map((f) => ({ ...f, dia_hasta: 9999 })) }
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.cuerpo.ya_hecha).toBeUndefined()
    expect(otra.cuerpo.intento).toBe(1)
    expect(al.corridas.find((c) => c.id === otra.cuerpo.corrida_id)!.clave_idempotencia).toBe('v1:c1')
  })
  it('r79 · la llamada cerró `ok` pero se cayó antes de guardar (sin objeto ni ronda): reenviada, abre el siguiente intento de la MISMA pasada, no «ya hecha»', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.estado = 'ok'
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.cuerpo.ya_hecha).toBeUndefined()
    expect(otra.cuerpo.intento).toBe(2)
    expect(al.corridas.find((c) => c.id === otra.cuerpo.corrida_id)!.clave_idempotencia).toBe('v1:c0')
  })
  it('el calendario exige una estrategia VALIDADA aunque la campaña esté en calendario', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    al.campanas[0].estado = 'calendario'
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)).cuerpo.code).toBe('E-SIN-ESTRATEGIA')
  })
  it('🔴 19-nov · grupo C · un bloqueo de CONJUNTO que sigue tras la última ronda (V11 · «9 posts del grid antes del primer anuncio») no detiene: la tanda se cierra y queda como AVISO con el hueco anotado', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const t = tandaBuena(A)
    // un anuncio en la semana 1: antes de él no hay 9 piezas del grid (bloqueo de la tanda, sin fila: sacar filas no lo arregla)
    const anuncio = { ...piezaBuena(A, 1, 'a', 'Anuncio de apertura'), slot: 'z', pieza_fija: 'anuncio-1', formato: 'anuncio_imagen' }
    const mala = { ...t, piezas: [...t.piezas, anuncio] }
    let { g } = await tandaDe(al, id, 1, mala)
    expect(JSON.stringify(g!.cuerpo.fichas)).toContain('antes solo hay') // el control: el bloqueo es el V11 de conjunto
    for (let ronda = 1; ronda <= 3; ronda++) {
      expect(g!.cuerpo.correccion).toBe(true)
      const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: g!.cuerpo.modo } }, AHORA)
      g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: true, modo: g!.cuerpo.modo, resultado: ok(mala) }, AHORA)
    }
    expect(g!.cuerpo.ok).toBe(true)
    expect(al.campanas.find((c) => c.id === id)!.estado).not.toBe('necesita_humano')
    const ultima = al.validaciones.filter((v) => v.objeto === 'calendario' && v.tanda === 1).at(-1)!
    const hueco = ultima.hallazgos.find((h) => h.chequeo === 'V11' && h.fila_id === null)
    expect(hueco).toBeDefined()
    expect(hueco!.severidad).toBe('aviso')
    expect(hueco!.ficha.gravedad).toBe('aviso')
    expect(hueco!.ficha.que).toContain('quedó anotado tras la última ronda de corrección')
    expect(ultima.hallazgos.some((h) => h.severidad === 'bloquea')).toBe(false)
    expect(await al.hallazgosQueBloquean(id, 1)).toEqual([])
  })
  it('🔴 19-nov · C1 · m14 de CC6 · la ronda 2 del calendario REENVIADA sin `correccion` (r74) sigue siendo corrección: valida a nivel 2, sobre las filas guardadas, y pide la ronda 3', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, formato: 'formato-inexistente' } : p)) }
    let { g } = await tandaDe(al, id, 1, mala)
    for (const ronda of [1, 2]) {
      expect(g!.cuerpo.correccion).toBe(true)
      const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
      expect(al.corridas.find((c) => c.id === p.cuerpo.corrida_id)!.clave_idempotencia).toBe(`t1:v1:c${ronda}`)
      g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, ...(ronda === 1 ? { correccion: true } : {}), modo: 'filas', resultado: ok({ piezas: [{ ...piezaBuena(A, 4, 'b', 'Tema'), formato: 'formato-inexistente' }], ajustes_al_patron: [] }) }, AHORA)
    }
    expect(g!.cuerpo).toMatchObject({ correccion: true, ronda: 3, modo: 'filas', fila_ids: [fila4b(al).id] })
    expect(al.validaciones.filter((v) => v.objeto === 'calendario').map((v) => v.intento)).toEqual([1, 2, 2])
    // sobre las filas guardadas: la tanda sigue entera (16 filas), no solo la pieza que volvió
    expect(al.filasGuardadas.filter((f) => f.tanda === 1 && f.estado !== 'esquema')).toHaveLength(16)
  })
  it('🔴 19-nov · C1 · m3 de CC6 · tras la última ronda, en filas distintas, un dato SIN FUENTE y otro bloqueo: cada fila sale con SU estado y SU motivo', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const t = tandaBuena(A)
    const sinFuente = { dato: 'peso del pan', valor: '45 g', clase: 'alto' as const, ref: 'no-existe', nivel: 'F1' as const, opcional: false }
    const malas = (p: (typeof t.piezas)[number]) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [sinFuente] } : p.semana === 4 && p.slot === 'b' ? { ...p, formato: 'formato-inexistente' } : p)
    const mala = { ...t, piezas: t.piezas.map(malas) }
    let { g } = await tandaDe(al, id, 1, mala)
    for (let ronda = 1; ronda <= 3; ronda++) {
      expect(g!.cuerpo.correccion).toBe(true)
      const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
      g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok({ piezas: t.piezas.filter((x) => (x.semana === 1 && x.slot === 'a') || (x.semana === 4 && x.slot === 'b')).map(malas), ajustes_al_patron: [] }) }, AHORA)
    }
    expect(g!.cuerpo.ok).toBe(true)
    const fila = (semana: number, slot: string) => al.filasGuardadas.find((f) => f.tanda === 1 && f.semana === semana && f.id.endsWith(`-${slot}`))!
    expect(fila(1, 'a').estado).toBe('descartada_sin_fuente')
    expect(fila(4, 'b').estado).toBe('descartada_por_bloqueo')
    expect(g!.cuerpo.salieron_sin_fuente).toEqual([fila(1, 'a').id])
    expect(g!.cuerpo.salieron_por_bloqueo).toEqual([fila(4, 'b').id])
    expect(fila(1, 'a').avisos.some((a) => a.includes('siguió bloqueada'))).toBe(false)
    expect(fila(4, 'b').avisos.some((a) => a.startsWith('la fila salió: siguió bloqueada tras la última ronda de corrección'))).toBe(true)
  })
  it('19-nov · C1 · m3 · `resolverTrasLaUltimaRonda` (pura): el dato faltante sale sin fuente y el otro bloqueo por bloqueo, cada uno con su motivo en el ajuste', () => {
    const h = (chequeo: string, fila_id: string): Hallazgo => ({ chequeo, severidad: 'bloquea', fila_id, alcance: 'fila', ficha: { que: chequeo, donde: fila_id, contra_que: 'x', gravedad: 'bloquea', propuesta: 'x' } })
    const r = resolverTrasLaUltimaRonda([h('V06', 's1-d1-a'), h('V02', 's4-d4-b')], () => 1)
    expect(r.porBloqueo).toEqual(['s4-d4-b'])
    expect(r.filasQueSalen.sort()).toEqual(['s1-d1-a', 's4-d4-b'])
    expect(Object.fromEntries(r.ajustes.map((a) => [a.slot, a.motivo]))).toEqual({ a: MOTIVO_DE_SALIDA.descartada_sin_fuente, b: MOTIVO_DE_SALIDA.descartada_por_bloqueo })
  })
  it('19-nov · grupo C · la fila que sale por bloqueo deja dicho POR QUÉ (el motivo y lo que la bloqueaba), y lo viejo no queda como bloqueo abierto', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, formato: 'formato-inexistente' } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    await tresRondasMalas(al, id, g!)
    expect(fila4b(al).avisos.some((a) => a.startsWith('la fila salió: siguió bloqueada tras la última ronda de corrección: ') && a.includes('formato-inexistente'))).toBe(true)
    // las rondas 1 y 2 también guardaron sus bloqueos en el intento 2: vale solo el último guardado, que ya no bloquea nada
    expect(al.validaciones.filter((v) => v.objeto === 'calendario' && v.intento === 2).length).toBeGreaterThanOrEqual(3)
    expect(await al.hallazgosQueBloquean(id, 1)).toEqual([])
  })
  it('una fila con un dato declarado PENDIENTE no sale a producción: queda en investigación con su reloj', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const t = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 2 && p.slot === 'd' ? { ...p, tema: 'El café de la casa a un precio especial: $2,00', pendientes: ['confirmar el precio $2,00 con fuente'] } : p)) }
    const { g } = await tandaDe(al, id, 1, t)
    expect(g!.cuerpo).toMatchObject({ ok: true, en_investigacion: 1, validadas: 15 })
    expect((await al.filas(id)).find((f) => f.id === 's2-d4-d')!.estado).toBe('en_investigacion')
    expect(al.esperas.some((e) => e.objeto_tipo === 'dato_en_investigacion' && e.objeto_id === 's2-d4-d' && e.estado === 'viva')).toBe(true)
  })
  it('los lotes solo salen de una campaña ACTIVA (una pausada no se briefea aunque tenga filas)', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    await tandaDe(al, id, 1, tandaBuena(A))
    expect(((await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-10-12' }, AHORA)).cuerpo.lotes as unknown[]).length).toBeGreaterThan(0)
    al.campanas[0].estado = 'pausada'
    expect((await filasLotes(al, { ...wf(), campana_id: id, hoy: '2026-10-12' }, AHORA)).cuerpo.lotes).toEqual([])
  })
  it('en ensayo los avisos se REGISTRAN, no se mandan, salvo que alertas_en_ensayo diga «enviar»', async () => {
    const al = almacen({ config: { estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], flujos: ['wf-cadena', 'wf-vigia'] } })
    const vig = { workflow_id: 'wf-vigia', workflow_execution_id: 'v' }
    expect((await relojDeLaCadena(al, vig, AHORA)).cuerpo.enviar_alertas).toBe(false)
    al.config.set('alertas_en_ensayo', 'enviar')
    expect((await relojDeLaCadena(al, vig, AHORA)).cuerpo.enviar_alertas).toBe(true)
  })
})

describe('r74 · F3 · una llamada de corrección vencida no deja la campaña atascada con un éxito falso', () => {
  const mala = () => ({ ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'no-existe', nivel: 'F1', opcional: false }] } : p)) })
  it('verde: el reenvío sin corrección pide la corrección con los hallazgos que bloquearon y la campaña termina activa', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const { g } = await tandaDe(al, id, 1, mala())
    expect(g!.cuerpo.correccion).toBe(true)
    // la corrección se pide y la llamada muere: la corrida queda vencida
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    await al.cerrarCorrida(p2.cuerpo.corrida_id as number, { estado: 'vencida', error: 'la llamada pasó su plazo sin volver' })
    expect((await al.filas(id)).some((f) => f.estado === 'propuesta')).toBe(true)
    // se reenvía el sobre: preparar SIN corrección (antes contestaba «ya hecha» y la campaña quedaba en `calendario`)
    const p3 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(p3.status).toBe(200); expect(p3.cuerpo.ya_hecha).toBeUndefined()
    expect(p3.cuerpo.run_sdk).toBeDefined()
    // y al guardar, sin avisar que es corrección, la campaña se cierra bien
    const g3 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p3.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA) // la corrección derivada es de la tanda entera
    expect(g3.cuerpo).toMatchObject({ ok: true })
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    expect((await al.filas(id)).some((f) => f.estado === 'propuesta')).toBe(false)
  })
  describe('F4 · la regla de «local abierto» aplica SOLO si hay sede (3 rubros: local con sede · servicio sin sede · negocio en línea sin sede)', () => {
    const sinSedes = (c: typeof A) => ({ ...contextoDe(c), sedes: [] as never[] })
    for (const [nombre, cli] of [['negocio local sin sede declarada', A], ['servicio a empresas', clienteB()]] as const) {
      it(`${nombre}: sin sedes las filas «requiere_abierto» NO se frenan (ninguna queda en investigación por falta de horario) y la campaña lo declara`, async () => {
        const al = almacen({ contextos: { [cli.clientId]: sinSedes(cli) }, planes: { [cli.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, journeys: [{ journeyId: 'journey-1', clientId: cli.clientId }] })
        const c = await abrirCampana(al, { ...wf(), client_id: cli.clientId, seco: true }, ABRE)
        const id = idCampana(c)
        expect(al.recolectadas).toEqual([]) // r75 · en SECO no se recolecta: un ensayo no escribe sedes reales (nota A.4-1 de CC#3)
        expect(String(al.campanas.find((x) => x.id === id)!.estado_motivo)).toContain('sin sede declarada')
        const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
        await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(cli.estrategia) }, AHORA)
        await tandaDe(al, id, 1, tandaBuena(cli))
        const filas = (await al.filas(id)).filter((f) => f.tanda === 1 && f.estado !== 'esquema')
        expect(filas.some((f) => f.requiere_abierto)).toBe(true)
        expect(filas.filter((f) => f.estado === 'en_investigacion')).toEqual([])
        expect(al.validaciones.flatMap((v) => v.hallazgos).filter((h) => h.chequeo === 'V06')).toEqual([])
      })
    }
    it('la recolección de sedes ESCRIBE datos del cliente: se hace en lo REAL y NO en seco', async () => {
      const real = almacen({ config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida' } })
      const c = await abrirCampana(real, { ...wf(), client_id: A.clientId, seco: false }, ABRE)
      expect(c.status).toBe(201); expect(real.recolectadas).toEqual([A.clientId])
      const seco = almacen()
      await abrirCampana(seco, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
      expect(seco.recolectadas).toEqual([])
    })
    it('con sede y horario la regla sigue igual: una hora fuera del horario BLOQUEA; sin horario de la sede, aviso y la fila queda en investigación', async () => {
      const al = almacen()
      const { id } = await conEstrategia(al)
      const fuera = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.slot === 'a' && p.semana === 1 ? { ...p, hora: '23:00' } : p)) }
      const { g } = await tandaDe(al, id, 1, fuera)
      expect(g!.cuerpo.correccion).toBe(true)
      expect(al.validaciones.flatMap((v) => v.hallazgos).some((h) => h.chequeo === 'V06' && h.severidad === 'bloquea')).toBe(true)
      const sinHorario = almacen({ contextos: { [A.clientId]: { ...contextoDe(A), sedes: [{ clave: 'centro', nombre: 'Sede', telefono: null, horario: null }] } } })
      const e2 = await conEstrategia(sinHorario)
      await tandaDe(sinHorario, e2.id, 1, tandaBuena(A))
      expect(sinHorario.validaciones.flatMap((v) => v.hallazgos).some((h) => h.chequeo === 'V06' && h.severidad === 'aviso')).toBe(true)
      expect((await sinHorario.filas(e2.id)).some((f) => f.estado === 'en_investigacion')).toBe(true)
    })
  })

  it('r75 · un solo camino de briefs: el cierre del viaje acepta `cadena_apagada` (la puerta ya no reenvía a la parte vieja con la cadena apagada) y sigue rechazando lo inventado', async () => {
    const al = almacen()
    const r = await cierreDeCampana(al, { ...wf(), client_id: A.clientId, journey_id: 'journey-1', sala_correlation_id: 'corr-1', resultado: 'cadena_apagada' })
    expect(r.status).toBe(200); expect(r.cuerpo.payload_cable).toMatchObject({ resultado: 'cadena_apagada', _journey_id: 'journey-1' })
    expect((await cierreDeCampana(al, { ...wf(), client_id: A.clientId, journey_id: 'journey-1', resultado: 'inventado' })).status).toBe(400)
  })
  it('una tanda ya validada sigue contestando «ya hecha» (la idempotencia normal no cambia)', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    await tandaDe(al, id, 1, tandaBuena(A))
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)).cuerpo.ya_hecha).toBe(true)
  })
})
