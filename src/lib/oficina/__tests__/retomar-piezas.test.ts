/**
 * 27-nov · GO Lenovo 18:25Z · RETOMAR LAS PIEZAS (redibujar · retomar mesa cortada · la ruta despierta al flujo). US$ 0: equipo simulado, base en memoria, en seco.
 * Condición de Lenovo 18:28Z (aviso de Cerebro): lo que se rehace sale FRESCO y la prueba lo demuestra (otra carpeta del borrador, otro número de turno y otra llave de despacho);
 * lo que se reusa (las propuestas guardadas, el libro de la mesa) se reusa a propósito y no se vuelve a pagar.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { PASO_APROBAR_PROPUESTAS } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { ARTEFACTO_BORRADOR_IMAGEN, FUNCION_BORRADOR_IMAGEN, type BorradoresDeImagen } from '../mesa/borrador-imagen'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestasDeImagen } from '../mesa/propuestas-imagen'
import { estadoDeLaMesa } from '../mesa/orquestador'
import { esNotaDeCorteSinVuelta, PREFIJO_TURNO_RETOMADO } from '../mesa/causa-externa'
import { propuestaConFotosResueltas, redibujarPropuestas, retomarMesaCortada } from '../retomar'
import type { Plantilla } from '../tipos'
import type { PropuestaDeImagen } from '../mesa/propuestas-imagen'
import { CLIENTE, PARTE, crearMemoria, type Memoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, POR_OMISION, jugar, montar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

type R = { status: number; cuerpo: Record<string, unknown> }
const MOTIVO = 'el id de foto acortado ya se resuelve (#1287)'
const CAUSA = 'el corte de 800 s del flujo ya se arregló (#1286)'

// ── REDIBUJAR · la pieza de imagen con borrador y parada del dueño (el arnés del #1287)
const PASO_BORRADOR = { clave: 'borrador_imagen', tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_BORRADOR_IMAGEN, tope_usd: 0.3 } as Plantilla['pasos'][number]
const conBorrador = (): Plantilla => {
  const pasos = [...CARRUSEL_MESA.pasos]
  pasos.splice(pasos.findIndex((p) => p.clave === 'mesa') + 1, 0, PASO_BORRADOR, PASO_APROBAR_PROPUESTAS)
  return { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, propuestas: { n: 3 } } as Plantilla['limites'], pasos }
}
const propuesta = (i: number) => {
  const laminas = LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? `Título ${i + 1}` : t, x, k === 1 ? 'foto:062e' : img])
  return [`# Propuesta ${i + 1} · Camino ${i + 1}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(laminas), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
}
const TEXTO = [propuesta(0), propuesta(1), propuesta(2), CITAS_COMPLETAS].join('\n')

async function hastaElDueno() {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: conBorrador() })
  M.P.mesa = crearMesaEnMemoria()
  const cerradas: Array<{ hitl_id: string; motivo: string }> = []
  M.P.cerrarTarjetaReemplazada = async (p) => { cerradas.push(p); return { ok: true, cerrada: true } }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const responder = (t: Turno) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: TEXTO } : undefined)
  const { ultima } = await jugar(M, id, a, responder)
  expect(ultima.cuerpo.accion).toBe('esperar_dueno')
  return { M, id, cerradas }
}
const enc = (M: Memoria, id: string) => M.encargos.get(id)!
const borradorDe = (M: Memoria, id: string) => enc(M, id).estado_del_motor.artefactos[ARTEFACTO_BORRADOR_IMAGEN]
const propuestasDe = (M: Memoria, id: string) => enc(M, id).estado_del_motor.artefactos[ARTEFACTO_PROPUESTAS_IMAGEN]?.datos as unknown as PropuestasDeImagen
const turnosDe = (M: Memoria, id: string) => [...(M.turnos.get(id)?.values() ?? [])]
const turnosDeAgente = (M: Memoria, id: string) => turnosDe(M, id).filter((t) => t.tipo !== 'dueno' && t.tipo !== 'codigo')

describe('🔴 redibujar · la pieza que espera al dueño vuelve a dibujar las MISMAS propuestas, fresco y sin otra ronda de mesa', () => {
  it('cierra el turno del dueño como reemplazado, el borrador corre otra vez en OTRA carpeta y vuelve a la parada del dueño', async () => {
    const { M, id } = await hastaElDueno()
    const antes = borradorDe(M, id)!
    const pedidosAntes = M.llamadas.renderPedidos.length
    const turnoDelDueno = turnosDe(M, id).find((t) => t.estado === 'corriendo')!
    expect(turnoDelDueno.tipo).toBe('dueno')
    const agentesAntes = turnosDeAgente(M, id).length
    const textoAntes = JSON.stringify(propuestasDe(M, id).propuestas.map((p) => p.texto))

    const r = await redibujarPropuestas(M.P, id, { motivo: MOTIVO })
    expect(r.cuerpo.accion).toBe('esperar_dueno')
    // el turno viejo del dueño quedó muerto con su porqué; hay uno NUEVO corriendo, con otro número y otra llave
    const viejo = M.turnos.get(id)!.get(turnoDelDueno.n)!
    expect(viejo).toMatchObject({ estado: 'muerto', error: expect.stringContaining('reemplazado: se redibuja') })
    const nuevo = turnosDe(M, id).find((t) => t.estado === 'corriendo')!
    expect(nuevo.tipo).toBe('dueno')
    expect(nuevo.n).toBeGreaterThan(turnoDelDueno.n)
    expect(nuevo.dispatch_key).not.toBe(turnoDelDueno.dispatch_key)
    // ninguna ronda de mesa: ni un turno de agente más, y las propuestas son las mismas (texto igual), con su contador de redibujo
    expect(turnosDeAgente(M, id)).toHaveLength(agentesAntes)
    expect(JSON.stringify(propuestasDe(M, id).propuestas.map((p) => p.texto))).toBe(textoAntes)
    expect(propuestasDe(M, id)).toMatchObject({ redibujo: 1, redibujado: { motivo: MOTIVO } })
    // LA SALIDA NUEVA NO ES LA VIEJA: otra versión del borrador, dibujada en la carpeta `-d1`
    const despues = borradorDe(M, id)!
    expect(despues.version).toBeGreaterThan(antes.version)
    expect((despues.datos as unknown as BorradoresDeImagen).redibujo).toBe(1)
    const nuevos = M.llamadas.renderPedidos.slice(pedidosAntes) as Array<{ subcarpeta: string }>
    expect(nuevos.length).toBeGreaterThan(0)
    for (const p of nuevos) expect(p.subcarpeta).toMatch(/-r1-d1$/)
    for (const p of M.llamadas.renderPedidos.slice(0, pedidosAntes) as Array<{ subcarpeta: string }>) expect(p.subcarpeta).toMatch(/-r1$/)
    // y la foto propia sigue en su lámina (nada «no tiene url»)
    expect(JSON.stringify(despues.datos)).not.toMatch(/no tiene url/)
  })
  it('redibujar dos veces: la segunda va a `-d2` (nunca pisa la primera)', async () => {
    const { M, id } = await hastaElDueno()
    await redibujarPropuestas(M.P, id, { motivo: MOTIVO })
    const n = M.llamadas.renderPedidos.length
    const r = await redibujarPropuestas(M.P, id, { motivo: `${MOTIVO} · otra vez` })
    expect(r.cuerpo.accion).toBe('esperar_dueno')
    for (const p of M.llamadas.renderPedidos.slice(n) as Array<{ subcarpeta: string }>) expect(p.subcarpeta).toMatch(/-r1-d2$/)
    expect(propuestasDe(M, id).redibujo).toBe(2)
  })
  it('la pieza que CERRÓ sin entregar (la forma de la historia): su tarjeta «SIN DIBUJAR» se cierra como reemplazada y vuelve a la parada del dueño', async () => {
    const { M, id, cerradas } = await hastaElDueno()
    const e = enc(M, id)
    const abierto = turnosDe(M, id).find((t) => t.estado === 'corriendo')!
    await M.P.almacen.guardar({ encargo_id: id, estado_del_motor: e.estado_del_motor, gasto_usd: e.estado_del_motor.gasto_usd, estado: 'cerrado', hitl_queue_id: 'tarjeta-vieja', turno: { ...abierto, estado: 'muerto' } })
    const r = await redibujarPropuestas(M.P, id, { motivo: MOTIVO })
    expect(r.cuerpo.accion).toBe('esperar_dueno')
    expect(cerradas).toEqual([{ hitl_id: 'tarjeta-vieja', motivo: `se redibuja: ${MOTIVO}` }])
    expect(enc(M, id).estado).toBe('en_paso')
    expect(enc(M, id).hitl_queue_id).toBeNull()
  })
  it('control: con tarjeta y SIN puerto para cerrarla no se retoma (quedarían dos tarjetas) y no se toca nada', async () => {
    const { M, id } = await hastaElDueno()
    const e = enc(M, id)
    const abierto = turnosDe(M, id).find((t) => t.estado === 'corriendo')!
    await M.P.almacen.guardar({ encargo_id: id, estado_del_motor: e.estado_del_motor, gasto_usd: e.estado_del_motor.gasto_usd, estado: 'cerrado', hitl_queue_id: 'tarjeta-vieja', turno: { ...abierto, estado: 'muerto' } })
    delete M.P.cerrarTarjetaReemplazada
    const antes = JSON.stringify(enc(M, id))
    const r = await redibujarPropuestas(M.P, id, { motivo: MOTIVO })
    expect(r).toMatchObject({ status: 409, cuerpo: { error: 'sin_puerto_de_la_bandeja' } })
    expect(JSON.stringify(enc(M, id))).toBe(antes)
  })
  it('controles: sin motivo (400), ya aprobada, ya entregada o con un turno de agente corriendo (409) · nada se toca', async () => {
    const { M, id } = await hastaElDueno()
    const antes = JSON.stringify(enc(M, id))
    expect((await redibujarPropuestas(M.P, id, { motivo: 'corto' })).status).toBe(400)
    expect((await redibujarPropuestas(M.P, id, { motivo: undefined })).status).toBe(400)
    expect((await redibujarPropuestas(M.P, '00000000-0000-4000-8000-000000000000', { motivo: MOTIVO })).status).toBe(404)
    expect(JSON.stringify(enc(M, id))).toBe(antes)
    // ya aprobada
    const e = enc(M, id).estado_del_motor
    const p0 = propuestasDe(M, id).propuestas[0].id
    const aprobada = { ...e, artefactos: { ...e.artefactos, aprobacion_propuestas: { version: 1, version_consumida: 0, datos: { estado: 'aprobada', propuesta_id: p0 } } } }
    enc(M, id).estado_del_motor = aprobada as never
    expect(await redibujarPropuestas(M.P, id, { motivo: MOTIVO })).toMatchObject({ status: 409, cuerpo: { error: 'ya_aprobada' } })
    enc(M, id).estado_del_motor = e
    // un turno de agente corriendo
    const abierto = turnosDe(M, id).find((t) => t.estado === 'corriendo')!
    M.turnos.get(id)!.set(abierto.n, { ...abierto, tipo: 'agente', paso: 'mesa:aportar:x' })
    expect(await redibujarPropuestas(M.P, id, { motivo: MOTIVO })).toMatchObject({ status: 409, cuerpo: { error: 'trabajando' } })
    M.turnos.get(id)!.set(abierto.n, abierto)
    // ya entregada (cerrada con entrega)
    M.turnos.get(id)!.set(abierto.n, { ...abierto, estado: 'muerto' })
    enc(M, id).estado = 'cerrado'
    enc(M, id).estado_del_motor = { ...e, artefactos: { ...e.artefactos, entrega: { version: 1, version_consumida: 0, datos: { ok: true } } } }
    expect(await redibujarPropuestas(M.P, id, { motivo: MOTIVO })).toMatchObject({ status: 409, cuerpo: { error: 'ya_entregada' } })
  })
})

describe('propuestaConFotosResueltas · el id acortado guardado ANTES del #1287 queda entero y la lámina dice su origen', () => {
  it('foto:062e guardada como «062e» → «062ec4fa», con origen real', () => {
    const p = {
      id: 'P1', nombre: 'x', texto: 't',
      laminas: [{ n: 1, rol: 'problem', foto: { origen: 'real', foto_id: '062e' } }],
      artefactos: { visual_direction: { imagenes: [{ ref: 'problem', modo: 'real', foto_id: '062e' }, { ref: 'hook', modo: 'generada' }] } },
    } as unknown as PropuestaDeImagen
    const q = propuestaConFotosResueltas(p, [{ id: '062ec4fa', url: 'https://fotos.test/062ec4fa.jpg' }])
    expect((q.artefactos as { visual_direction: { imagenes: unknown[] } }).visual_direction.imagenes).toEqual([{ ref: 'problem', modo: 'real', foto_id: '062ec4fa' }, { ref: 'hook', modo: 'generada' }])
    expect(q.laminas[0].foto).toMatchObject({ origen: 'real', foto_id: '062ec4fa' })
    // la de entrada no se toca
    expect((p.artefactos as { visual_direction: { imagenes: Array<{ foto_id?: string }> } }).visual_direction.imagenes[0].foto_id).toBe('062e')
  })
})

// ── RETOMAR MESA CORTADA · la forma del reel: la dirección se cortó «sin vuelta» al integrar y la mesa cerró
const SIN_VUELTA = 'sin vuelta en 26 min'
const tt = (r: R) => r.cuerpo.turno as { n: number; paso: string; agente: string }
async function hastaIntegrar() {
  const m = await montar({ dry_run: true })
  let ult = m.a as R
  for (let i = 0; i < 40 && ult.cuerpo.accion === 'esperar'; i++) {
    const t = tt(ult)
    if (t.paso.startsWith('mesa:integrar:')) return { ...m, t }
    const tipo = t.paso.split(':')[1] ?? t.paso
    ult = (await recibirResultado(m.M.P, m.id, t.n, { ...POR_OMISION({ paso: t.paso, agente: t.agente, tipo, task: '', n: t.n }), costo_usd: 0.05, workflow_execution_id: `ex-${t.n}` })) as R
  }
  throw new Error(`la mesa no llegó a integrar: ${JSON.stringify(ult.cuerpo).slice(0, 200)}`)
}
/** lo que pasó con el reel: tres cortes «sin vuelta» del director y el encargo cerrado (su turno muerto). Como en la base (lectura 27-nov: `pasos_ejecutados` = el turno más alto),
 *  el turno caído ya ocupó su número */
async function cortarYCerrar(m: Awaited<ReturnType<typeof hastaIntegrar>>, hitl: string | null = null) {
  for (let i = 0; i < 3; i++) await m.MS.aportar({ encargo_id: m.id, de: m.t.agente, para: null, tipo: 'nota', texto: `turno_fallido: ${SIN_VUELTA}`, refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
  const e = m.M.encargos.get(m.id)!
  const est = estadoDeLaMesa(e.estado_del_motor)!
  await m.M.P.almacen.guardar({
    encargo_id: m.id, estado_del_motor: { ...e.estado_del_motor, pasos_ejecutados: Math.max(e.estado_del_motor.pasos_ejecutados, m.t.n), artefactos: { ...e.estado_del_motor.artefactos, mesa: { ...e.estado_del_motor.artefactos.mesa, datos: { ...est, fase: 'cerrada', turno_abierto: null } as never } } },
    gasto_usd: e.estado_del_motor.gasto_usd, estado: 'cerrado', hitl_queue_id: hitl,
    turno: { n: m.t.n, paso: m.t.paso, tipo: 'agente', agente: m.t.agente, estado: 'muerto', error: SIN_VUELTA, dispatch_key: `${m.id}:${m.t.n}`, cost_usd: 0 },
  })
}

describe('🔴 retomar mesa cortada · el MISMO libro, la dirección vuelve a integrar con un turno NUEVO', () => {
  it('reabre en `en_paso`, deja la nota con la causa corregida y pide integrar otra vez a la dirección (otro número, otra llave); ningún aporte pagado se repite', async () => {
    const m = await hastaIntegrar()
    const aportesAntes = m.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo !== 'nota').length
    const cerradas: string[] = []
    m.M.P.cerrarTarjetaReemplazada = async (p) => { cerradas.push(p.hitl_id); return { ok: true, cerrada: true } }
    await cortarYCerrar(m, 'tarjeta-sin-dibujar')
    const r = (await retomarMesaCortada(m.M.P, m.id, { causa_corregida: CAUSA })) as R
    expect(r.cuerpo.accion).toBe('esperar')
    expect(tt(r)).toMatchObject({ agente: m.t.agente, paso: expect.stringMatching(/^mesa:integrar:/) })
    expect(tt(r).n).toBeGreaterThan(m.t.n)
    expect(m.M.turnos.get(m.id)!.get(tt(r).n)!.dispatch_key).not.toBe(`${m.id}:${m.t.n}`)
    expect(m.M.encargos.get(m.id)!.estado).toBe('en_paso')
    expect(m.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo !== 'nota')).toHaveLength(aportesAntes)
    const notas = m.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo === 'nota').map((f) => f.texto)
    expect(notas[notas.length - 1]).toBe(`${PREFIJO_TURNO_RETOMADO}: ${CAUSA}`)
    const est = estadoDeLaMesa(m.M.encargos.get(m.id)!.estado_del_motor)!
    expect(est.fase).toBe('trabajando')
    expect(est.marcas.retomada_tras_corte).toBe(1)
    expect(cerradas).toEqual(['tarjeta-sin-dibujar'])
    expect(m.M.encargos.get(m.id)!.hitl_queue_id).toBeNull()
  })
  it('control: una mesa que cerró por su camino (la dirección integró después) NO se retoma y nada se toca', async () => {
    const m = await hastaIntegrar()
    await cortarYCerrar(m)
    await m.MS.aportar({ encargo_id: m.id, de: m.t.agente, para: null, tipo: 'integra', texto: 'x', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.5, workflow_execution_id: null })
    const filas = m.MS.filas.length
    const r = await retomarMesaCortada(m.M.P, m.id, { causa_corregida: CAUSA })
    expect(r).toMatchObject({ status: 409, cuerpo: { error: 'no_cerro_por_un_corte' } })
    expect(m.MS.filas).toHaveLength(filas)
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
  })
  it('control: una falla del agente (no un corte) tampoco; sin causa es 400; una pieza en curso es 409', async () => {
    const m = await hastaIntegrar()
    expect(await retomarMesaCortada(m.M.P, m.id, { causa_corregida: CAUSA })).toMatchObject({ status: 409, cuerpo: { error: 'no_esta_cerrada' } })
    await cortarYCerrar(m)
    expect((await retomarMesaCortada(m.M.P, m.id, { causa_corregida: '' })).status).toBe(400)
    await m.MS.aportar({ encargo_id: m.id, de: m.t.agente, para: null, tipo: 'nota', texto: 'turno_fallido: respuesta vacía', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
    expect(await retomarMesaCortada(m.M.P, m.id, { causa_corregida: CAUSA })).toMatchObject({ status: 409, cuerpo: { error: 'no_cerro_por_un_corte' } })
  })
  it('esNotaDeCorteSinVuelta: solo la nota «turno_fallido: sin vuelta en N min»', () => {
    expect(esNotaDeCorteSinVuelta({ tipo: 'nota', texto: `turno_fallido: ${SIN_VUELTA}` })).toBe(true)
    expect(esNotaDeCorteSinVuelta({ tipo: 'nota', texto: 'turno_fallido: respuesta vacía' })).toBe(false)
    expect(esNotaDeCorteSinVuelta({ tipo: 'aporta', texto: `turno_fallido: ${SIN_VUELTA}` })).toBe(false)
    expect(esNotaDeCorteSinVuelta({ tipo: 'nota', texto: `x turno_fallido: ${SIN_VUELTA}` })).toBe(false)
  })
})
