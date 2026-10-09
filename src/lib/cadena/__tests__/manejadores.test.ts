/**
 * Los manejadores de `/api/cadena/*` contra un almacén en memoria · pruebas a costo cero (sin base, sin red, sin modelo).
 * Se juega la cadena entera con un «agente simulado»: lo que el modelo devolvería, escrito a mano.
 */
import { describe, it, expect } from 'vitest'
import {
  abrirCampana, avanzarCampana, cierreDeCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, validarSinEscribir,
  filasLotes, filasMarcar, filasListar, fechasCobertura, fechasGuardar, relojDeLaCadena, costoEfectivo, topeDelPaso, expiresInHours,
  type Estrategia,
} from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
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
const abrir = async (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true, ...extra }, AHORA)
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

describe('autorización y compuerta', () => {
  it('🔴 sin workflow_id o sin workflow_execution_id: 400 (la causa del 403 conocido de la revisión de agentes)', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true }, AHORA)).status).toBe(400)
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'wf-cadena' }, AHORA)).cuerpo.code).toBe('E-WORKFLOW-CTX')
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_execution_id: 'x' }, AHORA)).status).toBe(400)
  })
  it('un workflow_id que no es flujo de la cadena ni viaje de la sala de ESE cliente: 403; un viaje real vale', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'wf-ajeno', workflow_execution_id: '1' }, AHORA)).status).toBe(403)
    expect((await abrirCampana(al, { client_id: A.clientId, seco: true, workflow_id: 'journey-1', workflow_execution_id: '1' }, AHORA)).status).toBe(201)
    const otro = almacen({ journeys: [{ journeyId: 'journey-1', clientId: 'otro-cliente' }] })
    expect((await abrirCampana(otro, { client_id: A.clientId, seco: true, workflow_id: 'journey-1', workflow_execution_id: '1' }, AHORA)).status).toBe(403)
  })
  it('apagada: solo corre en seco; ensayo: solo clientes de ensayo; encendida: todo', async () => {
    const al = almacen()
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, AHORA)).cuerpo.code).toBe('E-CADENA-APAGADA')
    expect(al.campanas).toHaveLength(0)
    al.config.set('estado_cadena', 'ensayo')
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, AHORA)).cuerpo.code).toBe('E-CADENA-NO-ADMITIDO')
    al.config.set('clientes_ensayo', [A.clientId])
    expect((await abrirCampana(al, { ...wf(), client_id: A.clientId }, AHORA)).status).toBe(201)
  })
  it('🔴 seco mal escrito se detiene antes de escribir (ni «true» como texto ni null)', async () => {
    const al = almacen()
    for (const seco of ['true', null, 1]) expect((await abrirCampana(al, { ...wf(), client_id: A.clientId, seco }, AHORA)).cuerpo.code).toBe('E-SECO-INVALIDO')
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
  it('abre con la fecha de inicio por regla (primer lunes), fin a 90 días, zona del cliente y su espera con reloj', async () => {
    const al = almacen()
    const r = await abrir(al)
    expect(r.status).toBe(201)
    const c = r.cuerpo.campana as Record<string, unknown>
    expect(c.fecha_inicio).toBe('2026-10-12')
    expect(c.fecha_fin).toBe('2027-01-09')
    expect(c.estado).toBe('abierta')
    expect(r.cuerpo.aviso_fecha_inicio).toMatch(/sin descontar feriados/)
    expect(al.esperas).toHaveLength(1)
    expect(al.esperas[0]).toMatchObject({ objeto_tipo: 'fecha_inicio_propuesta', estado: 'viva' })
    expect(al.esperas[0].vence_en).toBe('2026-10-11T00:00:00.000Z')
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
  it('con feriados nacionales verificados la fecha de inicio cuenta días hábiles y no avisa', async () => {
    const al = almacen({ fechasEspeciales: [{ id: 'f', fecha: '2026-10-12', nombre: 'x', tipo: 'feriados', ambito: 'nacional', alcance: 'nacional', estado: 'verificada' }] })
    const r = await abrir(al)
    expect((r.cuerpo.campana as { fecha_inicio: string }).fecha_inicio).toBe('2026-10-19')
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
    expect(run.thinking_mode).toBe('low')
    expect(run.model_override).toBe('claude-opus-5-5')
    expect(run.task).toContain(A.planTexto)
    expect(r.cuerpo.headers).toEqual({ 'x-skip-editor-middleware': '1' })
    const corrida = al.corridas[0]
    expect(corrida).toMatchObject({ estado: 'en_curso', paso: 'estrategia', salida_estructurada: true, revision_editor: 'saltada_por_diseno' })
    expect(corrida.plazo_en).toBe('2026-10-09T12:15:00.000Z')
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
    const tarde = await estrategiaPreparar(al, { ...wf(), campana_id: id }, '2026-10-09T12:30:00Z')
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
  it('la llamada que no entrega el objeto: reintentar; a la tercera, necesita_humano con su reloj (nada queda colgado)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    for (let i = 1; i <= 3; i++) {
      const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
      const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, error: 'E-OUTPUT-SCHEMA-MISSING', cost_usd: 0.2 } }, AHORA)
      if (i < 3) expect(g.cuerpo.reintentar).toBe(true)
      else expect(g.cuerpo.necesita_humano).toBe(true)
    }
    expect(al.campanas[0].estado).toBe('necesita_humano')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')).toBe(true)
    expect(al.corridas.every((c) => c.estado === 'fallida')).toBe(true)
  })
  it('una estrategia inválida: UNA corrección con sus fichas; si sigue mal, necesita_humano (la estrategia no tiene «filas que salen»)', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    const mala = { ...A.estrategia, pilares: [{ clave: 'x', nombre: 'x', pct: 90 }] }
    const p1 = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    const g1 = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p1.cuerpo.corrida_id, resultado: ok(mala) }, AHORA)
    expect(g1.cuerpo.correccion).toBe(true)
    expect((g1.cuerpo.fichas as unknown[]).length).toBeGreaterThan(0)
    const p2 = await estrategiaPreparar(al, { ...wf(), campana_id: id, correccion: { fichas: g1.cuerpo.fichas } }, AHORA)
    expect((p2.cuerpo.run_sdk as { task: string }).task).toContain('CORRECCIÓN')
    const g2 = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p2.cuerpo.corrida_id, correccion: true, resultado: ok(mala) }, AHORA)
    expect(g2.cuerpo.necesita_humano).toBe(true)
    expect(al.estrategias).toHaveLength(0)
    expect(al.validaciones.map((v) => v.intento)).toEqual([1, 2])
  })
  it('🔴 el presupuesto de planificación se respeta: sin presupuesto no se llama (necesita_humano) y un corte con costo 0 en el libro cuenta el tope', async () => {
    const al = almacen()
    const id = idCampana(await abrir(al))
    al.campanas[0].presupuesto_planificacion_usd = 1.5
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, cost_usd: 0, cerrada_por_tope: true, error: 'cortada' } }, AHORA)
    expect(al.corridas[0].estado).toBe('cerrada_por_tope')
    expect(costoEfectivo({ costo_usd: 0, estado: 'cerrada_por_tope', paso: 'estrategia' })).toBe(topeDelPaso('estrategia'))
    expect(costoEfectivo({ costo_usd: 0, estado: 'ok', paso: 'estrategia' })).toBe(0)
    const otra = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(otra.status).toBe(409)
    expect(otra.cuerpo.error).toBe('presupuesto_agotado')
    expect(al.campanas[0].estado).toBe('necesita_humano')
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
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, tema: 'Nuestro pan de 45 g' } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    expect(g!.cuerpo.correccion).toBe(true)
    expect(g!.cuerpo.modo).toBe('filas')
    expect(g!.cuerpo.fila_ids).toEqual(['s1-d1-a'])
    // la corrección vuelve igual de mal
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    expect((p2.cuerpo.run_sdk as { task: string }).task).toContain('Devuelve SOLO las piezas que fallaron')
    const soloMala = { piezas: [{ ...piezaBuena(A, 1, 'a', 'Nuestro pan de 45 g'), tema: 'Nuestro pan de 45 g' }], ajustes_al_patron: [] }
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
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, tema: 'Nuestro pan de 45 g' } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    const arreglada = { piezas: [piezaBuena(A, 1, 'a', 'Nuestro pan de la casa')], ajustes_al_patron: [] }
    const g2 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok(arreglada) }, AHORA)
    expect(g2.cuerpo).toMatchObject({ ok: true, validadas: 16 })
    expect(g2.cuerpo.salieron_sin_fuente).toEqual([])
  })
  it('🔴 un bloqueo que NO es de dato (una revisión inventada) tras la corrección detiene la campaña en la bandeja de Emilio', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const mala = { ...tandaBuena(A), piezas: tandaBuena(A).piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, tema: 'Ritual de revisión de la semana' } : p)) }
    const { g } = await tandaDe(al, id, 1, mala)
    expect(g!.cuerpo.correccion).toBe(true)
    const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g!.cuerpo.fichas, fila_ids: g!.cuerpo.fila_ids, modo: 'filas' } }, AHORA)
    const g2 = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo: 'filas', resultado: ok({ piezas: [piezaBuena(A, 4, 'b', 'Ritual de revisión de la semana')], ajustes_al_patron: [] }) }, AHORA)
    expect(g2.cuerpo.necesita_humano).toBe(true)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')).toBe(true)
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
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'aprobada', fila_ids: ['s1-d1-b'] })).status).toBe(409) // validada → aprobada no existe
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] })).status).toBe(200)
    expect((await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['no-existe'] })).status).toBe(409)
    expect((await filasListar(al, { ...wf(), campana_id: id, estado: 'briefeada' })).cuerpo.total).toBe(1)
  })
})

describe('fechas especiales · solo con tipos declarados, con la cita comprobada por código', () => {
  const base = (al: AlmacenMemoria) => ({ ...wf(), campana_id: al.campanas[0].id, pais: 'Pais Uno', tipo: 'feriados locales', ambito: 'Ciudad Uno', anio: 2026 })
  it('sin lista de dominios para ese tipo y país: sin_fuente, sin investigar nada (la campaña sigue)', async () => {
    const al = almacen()
    await abrir(al)
    const r = await fechasCobertura(al, base(al))
    expect(r.cuerpo.estado).toBe('sin_fuente')
    expect(r.cuerpo.motivo).toMatch(/sin_dominios/)
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
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-09T13:00:00Z')
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
