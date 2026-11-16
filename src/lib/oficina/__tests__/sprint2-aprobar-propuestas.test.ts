/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · la ÚNICA parada del video: el dueño elige una de las propuestas de la mesa o pide cambios.
 *  · con propuestas, el encargo queda ESPERANDO AL DUEÑO (turno `dueno`): no se filma nada; un «siguiente» repetido contesta lo mismo; el vigía no lo da por muerto;
 *  · aprobar → la elegida pasa a ser `guion` y `copy_video`, la fase pasa a final y todo lo que sigue corre solo (el video se pide UNA vez, con la elegida);
 *  · pedir cambios → la mesa recibe las observaciones, corrige y vuelve a presentar con la ronda 2 (condición de CC6 · p9); agotadas las vueltas, solo queda aprobar;
 *  · sin propuestas (plantilla de hoy), el paso pasa de largo sin parar.
 */
import nodeFs from 'node:fs'
import nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirHoja, PREFIJO_VISUAL_DE_CAMPANA } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { alLlegarAlPaso, avisoDeObservaciones, decidir, quedanVueltas, TURNO_DEL_DUENO } from '../video/aprobacion'
import { faseDeLaProduccion } from '../video/propuestas'
import { abrirEncargo, avanzar, recibirDecisionDelDueno, type Respuesta } from '../orquestador'
import { validarPlantilla } from '../plantilla'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Paso, Plantilla } from '../tipos'
import { CLIENTE, PARTE, PARTE_REAL, crearMemoria } from './memoria'
import { DbFalsa } from './dbfalsa'
import { crearPuertos } from '../adaptadores'
import { revisarPasosMuertos } from '../vigia'
import { POST_IMG } from '../plantillas/post-img'
import type { LectorDeVida } from '../../plazo-de-vida'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'
import { ACCIONES } from '../tablero/acciones'
import { propuestasAprobar, propuestasCambios } from '../tablero/propuestas'

const PASO_APROBAR: Paso = {
  clave: 'aprobar_propuestas', tipo: 'codigo', quien: 'sala', funcion: 'aprobar_propuestas', condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: 'aprobacion_propuestas', tope_usd: 0,
  vuelve_a: { paso: 'mesa', max: 2, si: { tipo: 'si_artefacto', artefacto: 'aprobacion_propuestas', campo: 'vuelve_a_la_mesa', igual: true } },
}
const conAprobacion = (propuestas: number): Plantilla => {
  const i = VIDEO_MESA.pasos.findIndex((p) => p.clave === 'mesa')
  return { ...VIDEO_MESA, pasos: [...VIDEO_MESA.pasos.slice(0, i + 1), PASO_APROBAR, ...VIDEO_MESA.pasos.slice(i + 1)], limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 15, propuestas } } }
}
const TRES = (ronda = 1) => [PROPUESTA(1, `El vapor r${ronda}`, 12), PROPUESTA(2, `La mesa larga r${ronda}`, 15), PROPUESTA(3, `La puerta r${ronda}`, 10)].join('\n')

async function montar(propuestas = 3) {
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: conAprobacion(propuestas) })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  const enviados: Array<Record<string, unknown>> = []
  M.P.video = { enviar: async (p) => { enviados.push(p as unknown as Record<string, unknown>); return { ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true } }, estado: async () => ({ ok: true, simulado: true }) }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  let ronda = 1
  const integraciones: string[] = []
  const responder = (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') { integraciones.push(t.task); return { texto: [TRES(ronda), '# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé'].join('\n') } }
    return { texto: `Respuesta de ${t.agente}.` }
  }
  const seguir = (r: Respuesta) => jugar(M, id, r, responder, 80)
  return { M, id, enviados, seguir, integraciones, setRonda: (n: number) => { ronda = n }, a }
}
const estado = (M: Awaited<ReturnType<typeof montar>>['M'], id: string) => M.encargos.get(id)!.estado_del_motor

describe('la parada del dueño · con propuestas el encargo espera y no filma', () => {
  it('la plantilla con el paso es válida (la función está registrada)', () => {
    expect(validarPlantilla(conAprobacion(3)).filter((x) => /aprobar_propuestas/.test(x))).toEqual([])
  })
  it('tras presentar las 3 propuestas: `esperar_dueno` (turno `dueno` abierto), nada enviado al video, fase propuesta; un «siguiente» repetido contesta lo mismo', async () => {
    const T = await montar()
    const { ultima } = await T.seguir(T.a)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 1, turno: { tipo: 'dueno', paso: 'aprobar_propuestas' } })
    expect(T.enviados).toHaveLength(0)
    expect(faseDeLaProduccion(estado(T.M, T.id))).toBe('propuesta')
    const otra = await avanzar(T.M.P, T.id)
    expect(otra.cuerpo).toMatchObject({ accion: 'esperar_dueno', reentrega: true, turno: { tipo: 'dueno' } })
    expect(T.enviados).toHaveLength(0)
  })
})

describe('el dueño APRUEBA una propuesta', () => {
  it('la elegida pasa a ser el guion y el copy; la fase pasa a final y el video se pide UNA vez, con la elegida', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const d = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' })
    expect(d.cuerpo.decision).toEqual({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 })
    await T.seguir(d)
    const e = estado(T.M, T.id)
    expect((e.artefactos.guion.datos as { segundos: number; texto: string }).segundos).toBe(15)
    expect((e.artefactos.guion.datos as { texto: string }).texto).toContain('# Propuesta 2 · La mesa larga r1')
    expect((e.artefactos.guion.datos as { texto: string }).texto).not.toContain('Propuesta 1')
    expect(e.artefactos.copy_video.datos).toMatchObject({ pie_de_foto: 'Pie de La mesa larga r1.' })
    expect(faseDeLaProduccion(e)).toBe('final')
    expect(T.enviados).toHaveLength(1)
  })
  it('una segunda decisión sobre el mismo encargo se rechaza (ya no espera al dueño) y no cambia la elegida', async () => {
    const T = await montar()
    await T.seguir(T.a)
    await T.seguir(await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P2' }))
    const otra = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })
    expect(otra.status).toBe(409)
    expect(otra.cuerpo.error).toBe('no_espera_al_dueno')
    expect((estado(T.M, T.id).artefactos.guion.datos as { texto: string }).texto).toContain('La mesa larga r1')
  })
  it('propuesta que no existe o ronda vieja: 409 con su motivo, el encargo sigue esperando', async () => {
    const T = await montar()
    await T.seguir(T.a)
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P9' })).cuerpo.error).toBe('propuesta_inexistente')
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 2, propuesta_id: 'P1' })).cuerpo.error).toBe('ronda_vieja')
    expect((await avanzar(T.M.P, T.id)).cuerpo.accion).toBe('esperar_dueno')
    expect(estado(T.M, T.id).artefactos.guion).toBeUndefined()
  })
  it('encargo inexistente: 404', async () => {
    const T = await montar()
    expect((await recibirDecisionDelDueno(T.M.P, '00000000-0000-0000-0000-000000000000', { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })).status).toBe(404)
  })
})

describe('el dueño PIDE CAMBIOS', () => {
  it('🔴 (CC6 · p9) la mesa recibe las observaciones, corrige y vuelve a presentar con la RONDA 2; nada se filma', async () => {
    const T = await montar()
    await T.seguir(T.a)
    T.setRonda(2)
    const d = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 1, observaciones: 'más luz de mañana y menos texto' })
    expect(d.cuerpo.decision).toEqual({ estado: 'observaciones', observaciones: 'más luz de mañana y menos texto', ronda: 1 })
    const { ultima } = await T.seguir(d)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 2 })
    const e = estado(T.M, T.id)
    const pv = e.artefactos.propuestas_video.datos as { ronda: number; propuestas: Array<{ nombre: string }> }
    expect(pv.ronda).toBe(2)
    expect(pv.propuestas[0].nombre).toBe('El vapor r2')
    expect(T.enviados).toHaveLength(0)
    // las observaciones del dueño llegaron al libro de la mesa (como devolución a la dirección)
    const libro = await T.M.P.mesa!.libro(T.id)
    expect(libro.some((x) => x.tipo === 'devuelve' && x.texto.includes('más luz de mañana y menos texto'))).toBe(true)
    // y ya se aprueba sobre la ronda 2 (la 1 es vieja)
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })).cuerpo.error).toBe('ronda_vieja')
    await T.seguir(await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 2, propuesta_id: 'P1' }))
    expect((estado(T.M, T.id).artefactos.guion.datos as { texto: string }).texto).toContain('El vapor r2')
    expect(T.enviados).toHaveLength(1)
  })
  it('agotadas las vueltas de la plantilla (max 2), «pedir cambios» se rechaza con `sin_vueltas` y solo queda aprobar', async () => {
    const T = await montar()
    await T.seguir(T.a)
    T.setRonda(2)
    await T.seguir(await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 1, observaciones: 'otra cosa' }))
    T.setRonda(3)
    await T.seguir(await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 2, observaciones: 'otra más' }))
    expect((estado(T.M, T.id).artefactos.propuestas_video.datos as { ronda: number }).ronda).toBe(3)
    const r = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 3, observaciones: 'y otra' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('sin_vueltas')
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 3, propuesta_id: 'P3' })).status).toBe(200)
  })
  it('observaciones vacías o de más de 2000 caracteres: 400, el encargo sigue esperando', async () => {
    const T = await montar()
    await T.seguir(T.a)
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 1, observaciones: '   ' })).status).toBe(400)
    expect((await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'cambios', ronda: 1, observaciones: 'x'.repeat(2001) })).status).toBe(400)
    expect((await avanzar(T.M.P, T.id)).cuerpo.accion).toBe('esperar_dueno')
  })
})

describe('sin propuestas · el paso pasa de largo (lo de hoy no cambia)', () => {
  it('plantilla con el paso pero sin `propuestas`: un solo guion, ninguna parada, el video se pide', async () => {
    const T = await montar(1)
    const { ultima } = await T.seguir(T.a)
    expect(ultima.cuerpo.accion).not.toBe('esperar_dueno')
    const e = estado(T.M, T.id)
    expect(e.artefactos.aprobacion_propuestas.datos).toMatchObject({ estado: 'sin_propuestas', vuelve_a_la_mesa: false })
    expect(T.enviados).toHaveLength(1)
  })
})

describe('las piezas puras', () => {
  const pv = { ronda: 1, citas: '', avisos: [], propuestas: [{ id: 'P1', nombre: 'a', concepto: '', segundos: 8, red: '', objetivo: '', por_que: '', texto: '# Propuesta 1 · a', guion: { ok: true, planos: [], segundos: 8, pie_de_foto: 'pie', hashtags: ['#a'], avisos: [] } }] }
  const e = { artefactos: { propuestas_video: { version: 1, version_consumida: 0, datos: pv } }, vueltas: {} } as unknown as Estado
  it('quedanVueltas: el max del paso menos las hechas; sin vuelve_a, cero', () => {
    expect(quedanVueltas({ vueltas: {} }, PASO_APROBAR)).toBe(2)
    expect(quedanVueltas({ vueltas: { aprobar_propuestas: 1 } }, PASO_APROBAR)).toBe(1)
    expect(quedanVueltas({ vueltas: { aprobar_propuestas: 5 } }, PASO_APROBAR)).toBe(0)
    expect(quedanVueltas({ vueltas: {} }, { ...PASO_APROBAR, vuelve_a: undefined })).toBe(0)
  })
  it('alLlegarAlPaso: sin propuestas salta; con propuestas espera con su ronda', () => {
    expect(alLlegarAlPaso({ artefactos: {} } as unknown as Estado)).toHaveProperty('saltar')
    expect(alLlegarAlPaso(e)).toEqual({ esperar: true, ronda: 1 })
  })
  it('decidir · aprobar deja guion y copy de la elegida; cambios vuelve a la mesa con el aviso', () => {
    const a = decidir(e, PASO_APROBAR, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })
    expect(a.ok && a.res.otros_artefactos?.guion).toMatchObject({ segundos: 8, texto: '# Propuesta 1 · a' })
    expect(a.ok && a.res.otros_artefactos?.copy_video).toEqual({ pie_de_foto: 'pie', hashtags: ['#a'] })
    const c = decidir(e, PASO_APROBAR, { decision: 'cambios', ronda: 1, observaciones: '  más luz ' })
    expect(c.ok && c.res.artefacto).toMatchObject({ estado: 'observaciones', observaciones: 'más luz', vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeObservaciones(1, 1, 'más luz') })
    expect(c.ok && c.res.otros_artefactos).toBeFalsy()
  })
})

describe('las guardas de la decisión y del vigía', () => {
  it('una decisión mientras la mesa todavía trabaja se rechaza por el TURNO (no está esperando al dueño) y no toca el turno de la mesa', async () => {
    const T = await montar()
    // la primera respuesta deja abierto el turno de la dirección de la mesa
    expect(T.a.cuerpo.accion).toBe('esperar')
    const r = await recibirDecisionDelDueno(T.M.P, T.id, { decision: 'aprobar', ronda: 1, propuesta_id: 'P1' })
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'no_espera_al_dueno' })
    expect(String(r.cuerpo.detalle)).toContain('no está esperando la decisión del dueño')
    expect((await T.M.P.almacen.turnoAbierto(T.id))?.tipo).not.toBe('dueno')
  })
  it('🔴 el vigía NUNCA da por muerto un turno que espera al dueño, aunque lleve horas (las propuestas no vencen)', async () => {
    const db = new DbFalsa()
      .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
      .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
      .semilla('client_social_images', [])
      .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
      .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
      .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', clase: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
    const hora = new Date('2026-10-10T12:00:00Z')
    const P = crearPuertos(db, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora)
    await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const t = db.tablas['oficina_turnos'].find((x) => x.estado === 'corriendo')!
    Object.assign(t, { tipo: 'dueno', agente: null, paso: 'aprobar_propuestas', inicio: new Date(hora.getTime() - 6 * 60 * 60_000).toISOString() })
    const lector: LectorDeVida = { despacho: async () => null, duraciones: async () => [] }
    expect(await revisarPasosMuertos(P, db, hora, lector)).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(t.estado).toBe('corriendo')
  })
  it('(CC6 · c12) el rótulo VISUAL de la hoja dice que la escena la decide la mesa (texto literal, no la constante contra sí misma)', () => {
    expect(PREFIJO_VISUAL_DE_CAMPANA).toBe('de la campaña (referencia de estilo; la escena de esta pieza la decide la mesa): ')
    expect(PREFIJO_VISUAL_DE_CAMPANA).not.toMatch(/QUÉ SE VE/)
  })
})

describe('las acciones del tablero (tarjeta «Propuestas» de CC5 · contrato ADENDA 1 §2)', () => {
  const ctxDe = (T: Awaited<ReturnType<typeof montar>>) => ({ db: { from: () => { throw new Error('el tablero no lee la base aquí') } }, puertos: () => T.M.P, ahora: () => new Date('2026-11-16T23:00:00Z') })
  const yo = 'emilio'
  it('las dos acciones están en la lista del tablero', () => {
    expect(ACCIONES['propuestas-aprobar']).toBe(propuestasAprobar)
    expect(ACCIONES['propuestas-cambios']).toBe(propuestasCambios)
  })
  it('aprobar → 200 `{ ok, encargo_id, propuesta_id, estado: aprobada }` y el encargo sigue con la elegida', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const s = await propuestasAprobar(ctxDe(T), { cuerpo: { encargo_id: T.id, ronda: 1, propuesta_id: 'P2' }, reviewer: yo })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toEqual({ ok: true, encargo_id: T.id, propuesta_id: 'P2', estado: 'aprobada' })
    expect(s.toca).toEqual({ encargo_id: T.id })
    expect((estado(T.M, T.id).artefactos.aprobacion_propuestas.datos as { estado: string }).estado).toBe('aprobada')
    if (s.despertar) expect(s.despertar.encargo_id).toBe(T.id)
  })
  it('pedir cambios → 200 `{ estado: observaciones, ronda_siguiente: 2 }` y DESPIERTA al flujo (la mesa vuelve a trabajar)', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const s = await propuestasCambios(ctxDe(T), { cuerpo: { encargo_id: T.id, ronda: 1, observaciones: '  más luz de mañana  ' }, reviewer: yo })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toEqual({ ok: true, encargo_id: T.id, estado: 'observaciones', ronda_siguiente: 2 })
    expect(s.toca).toEqual({ encargo_id: T.id, comentario: 'más luz de mañana' })
    expect(s.despertar?.encargo_id).toBe(T.id)
    expect(s.despertar?.turno).toMatchObject({ tipo: 'agente' })
  })
  it('entrada inválida → 400 `entrada_invalida` sin tocar el encargo', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const c = ctxDe(T)
    for (const cuerpo of [{ encargo_id: 'no-uuid', ronda: 1, propuesta_id: 'P1' }, { encargo_id: T.id, ronda: 0, propuesta_id: 'P1' }, { encargo_id: T.id, ronda: 1.5, propuesta_id: 'P1' }, { encargo_id: T.id, ronda: 1, propuesta_id: 'uno' }, { encargo_id: T.id, ronda: 1 }]) {
      const s = await propuestasAprobar(c, { cuerpo, reviewer: yo })
      expect(s.status, JSON.stringify(cuerpo)).toBe(400)
      expect(s.cuerpo.error).toBe('entrada_invalida')
    }
    for (const observaciones of ['', '   ', 'x'.repeat(2001), 7]) {
      const s = await propuestasCambios(c, { cuerpo: { encargo_id: T.id, ronda: 1, observaciones }, reviewer: yo })
      expect(s.status).toBe(400)
      expect(s.cuerpo.error).toBe('entrada_invalida')
    }
    expect((await avanzar(T.M.P, T.id)).cuerpo.accion).toBe('esperar_dueno')
  })
  it('los rechazos del encargo pasan tal cual: 409 `ronda_vieja` / `propuesta_inexistente` con su detalle, 404 `encargo_inexistente`', async () => {
    const T = await montar()
    await T.seguir(T.a)
    const c = ctxDe(T)
    const vieja = await propuestasAprobar(c, { cuerpo: { encargo_id: T.id, ronda: 2, propuesta_id: 'P1' }, reviewer: yo })
    expect(vieja.status).toBe(409)
    expect(vieja.cuerpo).toMatchObject({ ok: false, error: 'ronda_vieja' })
    expect(String(vieja.cuerpo.detalle).length).toBeGreaterThan(0)
    expect((await propuestasAprobar(c, { cuerpo: { encargo_id: T.id, ronda: 1, propuesta_id: 'P9' }, reviewer: yo })).cuerpo.error).toBe('propuesta_inexistente')
    const nada = await propuestasAprobar(c, { cuerpo: { encargo_id: '00000000-0000-4000-8000-000000000000', ronda: 1, propuesta_id: 'P1' }, reviewer: yo })
    expect(nada.status).toBe(404)
    expect(nada.cuerpo.error).toBe('encargo_inexistente')
  })
})

describe('la migración 202611162330 (el turno del dueño)', () => {
  const RAIZ_SQL = nodePath.resolve(__dirname, '../../../../supabase')
  const MIG = nodeFs.readFileSync(nodePath.join(RAIZ_SQL, 'migrations', '202611162330_oficina_turno_del_dueno.sql'), 'utf8')
  const REV = nodeFs.readFileSync(nodePath.join(RAIZ_SQL, 'reversas', '202611162330_oficina_turno_del_dueno_REVERSA.sql'), 'utf8')
  const ANTES = "CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material'))"
  it('🔴 la regla admite el tipo del código (`TURNO_DEL_DUENO`) y exige la de antes, entera', () => {
    expect(MIG).toContain(`CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material', '${TURNO_DEL_DUENO}'))`)
    expect(MIG).toContain("IS DISTINCT FROM $antes$CHECK ((tipo = ANY (ARRAY['portero'::text, 'agente'::text, 'codigo'::text, 'externo'::text, 'brazo'::text, 'jefatura'::text, 'material'::text])))$antes$")
    expect(MIG).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
  it('🔴 la reversa vuelve a la regla de antes y se niega con turnos del dueño', () => {
    expect(REV).toContain(ANTES)
    expect(REV).not.toContain(`'${TURNO_DEL_DUENO}'))`)
    expect(REV).toContain(`WHERE tipo = '${TURNO_DEL_DUENO}'`)
    expect(REV).toMatch(/RAISE EXCEPTION/)
  })
})
