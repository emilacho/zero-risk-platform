/**
 * 17-nov · S2-4 tramo 4 (CC1) · el BORRADOR EN VIDEO de cada propuesta (decisión de Emilio 16-nov 22:23): el mismo camino B a calidad de borrador (dato de la plantilla),
 * cada clip desde la imagen clave de borrador de su plano, todas las propuestas en UN lote, unidas por propuesta. Con la propuesta ya aprobada no gasta (#1077).
 * No frena el encargo: lo que no salió queda sin video y con su error; lo cobrado va al gasto y al libro. La tarjeta (CC5) lee `video_url` de la fila. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { propuestasDeLaDecision } from '@/lib/direccion/decisiones-propuestas'
import { sessionIdDeVideo } from '../../video/libro'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { abrirEncargo, type Respuesta } from '../orquestador'
import { catalogoDeModelos } from '../../video/parametros'
import { envioDe, enviarVideo, recibirVideo, sondearVideos } from '../orquestador-video'
import { validarPlantilla } from '../plantilla'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Paso, Plantilla } from '../tipos'
import { ARTEFACTO_BORRADOR_VIDEO, ARTEFACTO_PEDIDO_BORRADOR, pasoDelBorradorDeVideo, resolucionDelBorrador, type BorradoresDeVideo } from '../video/borradores'
import { PASO_IMAGENES_CLAVE, PASO_IMAGENES_CLAVE_FINAL, PASO_REVISAR_IMAGENES_CLAVE, type ImagenesClave } from '../video/imagen-clave'
import { encuadrarFotos } from '../video/motor-planos'
import type { PedidoDePlano } from '../video/planos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'
import { ALMACEN, brazo, fallo, hecho } from './s2-4-arnes'

// la plantilla del orden acordado + el borrador en video: mesa → imagenes_clave → borrador_video → aprobar_propuestas → imagenes_clave_final → revisar → pedido → video…
const PASO_IC = VIDEO_MESA.pasos.find((p) => p.clave === PASO_IMAGENES_CLAVE)!
const PASO_FINAL: Paso = { ...PASO_IC, clave: PASO_IMAGENES_CLAVE_FINAL, salida_artefacto: PASO_IMAGENES_CLAVE_FINAL }
const PASO_APROBAR: Paso = {
  clave: 'aprobar_propuestas', tipo: 'codigo', quien: 'sala', funcion: 'aprobar_propuestas', condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: 'aprobacion_propuestas', tope_usd: 0,
  vuelve_a: { paso: 'mesa', max: 2, si: { tipo: 'si_artefacto', artefacto: 'aprobacion_propuestas', campo: 'vuelve_a_la_mesa', igual: true } },
}
const PASO_BORRADOR = pasoDelBorradorDeVideo(10)
const conBorradores = (propuestas: number, borrador?: Record<string, unknown>): Plantilla => {
  const sin = VIDEO_MESA.pasos.filter((p) => p.clave !== PASO_IMAGENES_CLAVE && p.clave !== PASO_REVISAR_IMAGENES_CLAVE)
  const rev = VIDEO_MESA.pasos.find((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)!
  const i = sin.findIndex((p) => p.clave === 'mesa')
  const revFinal: Paso = { ...rev, condicion: { tipo: 'si_artefacto', artefacto: PASO_IMAGENES_CLAVE_FINAL, campo: 'hay_imagenes', igual: true }, entrada: [PASO_IMAGENES_CLAVE_FINAL, 'guion'] }
  return {
    ...VIDEO_MESA,
    pasos: [...sin.slice(0, i + 1), PASO_IC, PASO_BORRADOR, PASO_APROBAR, PASO_FINAL, revFinal, ...sin.slice(i + 1)],
    // 17-nov · T7b · 50 → 70: con las 2 rondas del dueño dentro de lo requerido (condición fuerte de CC6) esta plantilla pide 59,8 (con 50 ya no abre: 409 `tope_no_cubre`),
    //   y la mesa del video ahora guarda lo que sigue con la cuenta de la plantilla (+ la jefatura): con 60 justos no le queda ni para integrar; 70 le deja lugar
    limites: { ...VIDEO_MESA.limites, tope_encargo_usd: 70, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 15, propuestas, ...(borrador ? { borrador } : {}) } },
  }
}

async function montar(b: ReturnType<typeof brazo>, o: { dry_run?: boolean; propuestas?: number; borrador?: Record<string, unknown> } = {}) {
  const propuestas = o.propuestas ?? 3
  const pl = conBorradores(propuestas, o.borrador)
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: pl })
  M.P.mesa = crearMesaEnMemoria(TRAS_2012)
  M.P.video = b.v
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: o.dry_run ?? false, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const TRES = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
  const responder = (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: [propuestas > 1 ? TRES : PROPUESTA(1, 'El vapor', 12), '# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé'].join('\n') }
    return { texto: `Respuesta de ${t.agente}.` }
  }
  const { ultima } = await jugar(M, id, a, responder, 120)
  return { M, id, pl, ultima, seguir: (r: Respuesta) => jugar(M, id, r, responder, 80) }
}
const borradores = (M: ReturnType<typeof crearMemoria>, id: string) => M.encargos.get(id)!.estado_del_motor.artefactos[ARTEFACTO_BORRADOR_VIDEO]?.datos as unknown as BorradoresDeVideo | undefined
const sondear = (M: ReturnType<typeof crearMemoria>, id: string, n: number) => sondearVideos(M.P, [{ encargo_id: id, n, paso: PASO_BORRADOR.clave, inicio: '2026-11-17T02:50:00Z' }], new Date('2026-11-17T03:00:00Z'))
const nDe = (r: Respuesta) => Number((r.cuerpo.turno as { n: number }).n)

describe('la plantilla y la calidad', () => {
  it('la plantilla con el paso del borrador es válida', () => {
    expect(validarPlantilla(conBorradores(3))).toEqual(validarPlantilla(VIDEO_MESA))
  })
  it('la calidad del borrador es DATO: 480p por omisión; la de la plantilla si es válida', () => {
    expect(resolucionDelBorrador(VIDEO_MESA.limites)).toBe('480p')
    expect(resolucionDelBorrador({ video: { borrador: { resolucion: ' 720P ' } } })).toBe('720p')
    expect(resolucionDelBorrador({ video: { borrador: { resolucion: '4k' } } })).toBe('480p')
    expect(resolucionDelBorrador(null)).toBe('480p')
  })
})

describe('el camino entero · las propuestas traen su borrador en video', () => {
  it('🔴 3 propuestas × 2 planos = UN lote de 6 clips a 480p desde las imágenes clave de borrador; se une uno por propuesta, se cobra y el encargo espera al dueño', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    const T = await montar(b)
    expect(T.ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', video: { planos: 6 } })
    const pb = T.M.encargos.get(T.id)!.estado_del_motor.artefactos[ARTEFACTO_PEDIDO_BORRADOR].datos as { planos: PedidoDePlano[] }
    expect(pb.planos.map((p) => [p.propuesta, p.n, p.resolucion, p.primer_cuadro])).toEqual(['P1', 'P2', 'P3'].flatMap((x) => [[x, 1, '480p', 'imagen_clave'], [x, 2, '480p', 'imagen_clave']]))
    // cada clip arranca de la imagen clave de borrador de SU propuesta y SU plano
    const ik = T.M.encargos.get(T.id)!.estado_del_motor.artefactos.imagenes_clave.datos as unknown as ImagenesClave
    expect(pb.planos.map((p) => p.fotos[0])).toEqual(pb.planos.map((p) => ik.propuestas!.find((x) => x.id === p.propuesta)!.planos.find((x) => x.n === p.n)!.url))
    expect(new Set(pb.planos.map((p) => p.fotos[0])).size).toBe(6)
    expect(b.reg.enviados.map((c) => c.split(':').slice(-3).join(':'))).toEqual(['P1:borrador:p1', 'P1:borrador:p2', 'P2:borrador:p1', 'P2:borrador:p2', 'P3:borrador:p1', 'P3:borrador:p2'])
    const antes = T.M.encargos.get(T.id)!.gasto_usd
    const s = await sondear(T.M, T.id, nDe(T.ultima))
    expect(s.reanudar).toEqual([T.id])
    expect(b.reg.unidos).toEqual([[1, 2], [3, 4], [5, 6]].map((xs) => xs.map((k) => `${ALMACEN}/videos/req-${k}.mp4`)))
    const bv = borradores(T.M, T.id)!
    expect(bv.propuestas.map((p) => [p.id, !!p.url && p.url.includes(`borrador-${p.id}-`), p.costo_usd, p.planos, p.error ?? null])).toEqual([['P1', true, 2.12, 2, null], ['P2', true, 2.12, 2, null], ['P3', true, 2.12, 2, null]])
    expect(bv.costo_usd).toBeCloseTo(6.36, 6)
    expect(T.M.encargos.get(T.id)!.gasto_usd).toBeCloseTo(antes + 6.36, 6)
    expect(T.M.gastos.filter((g) => g.concepto === 'video').map((g) => g.ref_id)).toEqual([1, 2, 3, 4, 5, 6].map((k) => sessionIdDeVideo(`req-${k}`)))
    // el encargo sigue y espera al dueño; la fila de la tarjeta trae el video de cada propuesta (pedido de CC5)
    expect(await T.M.P.almacen.turnoAbierto(T.id)).toMatchObject({ tipo: 'dueno', paso: 'aprobar_propuestas' })
    const t = propuestasDeLaDecision({ id: T.id, brief_id: 'F1-S1-ig-r1' }, T.M.encargos.get(T.id)!.estado_del_motor as never, T.pl.pasos as never)!
    expect(t.lista.map((p) => p.video_url)).toEqual(bv.propuestas.map((p) => p.url))
    expect(t.lista.every((p) => (p.costo?.borrador_usd ?? 0) >= 2.12)).toBe(true)
  })
  it('🔴 P1 y P2 listas pero un clip de P3 sigue en curso: se espera a TODAS (nada se une ni se registra todavía)', async () => {
    const b = brazo({ estados: (id) => (id === 'req-6' ? ({ ok: true, terminal: false, status: 'in_progress' } as never) : hecho(Number(id.slice(4)))) })
    const T = await montar(b)
    const s = await sondear(T.M, T.id, nDe(T.ultima))
    expect(s.reanudar).toEqual([])
    expect(b.reg.uniones).toBe(0)
    expect(borradores(T.M, T.id)).toBeUndefined()
  })
  it('🔴 un plano de P2 falla: P2 queda sin video (con su error) y P1 y P3 sí; lo cobrado de P2 también se anota; el encargo NO se frena', async () => {
    const b = brazo({ estados: (id) => (id === 'req-3' ? fallo : hecho(Number(id.slice(4)))) })
    const T = await montar(b)
    const antes = T.M.encargos.get(T.id)!.gasto_usd
    await sondear(T.M, T.id, nDe(T.ultima))
    const bv = borradores(T.M, T.id)!
    expect(bv.propuestas.map((p) => [p.id, !!p.url, p.costo_usd])).toEqual([['P1', true, 2.12], ['P2', false, 1.06], ['P3', true, 2.12]])
    expect(bv.propuestas[1].error).toMatch(/^nsfw: el plano 1 no se generó/)
    expect(b.reg.uniones).toBe(2)
    expect(T.M.encargos.get(T.id)!.gasto_usd).toBeCloseTo(antes + 5.3, 6)
    expect(T.M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(5)
    expect(T.M.encargos.get(T.id)!.estado).not.toBe('fallido')
  })
  it('🔴 el envío se corta en el clip 4: ninguna propuesta se une (lote completo o nada); se anota lo que cobraron los 3 enviados y el encargo sigue', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))), falla_envio_en: 4 })
    const T = await montar(b)
    expect(T.ultima.cuerpo).toMatchObject({ accion: 'esperar_brazo', lote_incompleto: true })
    const antes = T.M.encargos.get(T.id)!.gasto_usd
    await sondear(T.M, T.id, nDe(T.ultima))
    const bv = borradores(T.M, T.id)!
    expect(b.reg.uniones).toBe(0)
    expect(bv.propuestas.map((p) => [p.id, p.url, p.costo_usd])).toEqual([['P1', null, 2.12], ['P2', null, 1.06], ['P3', null, 0]])
    expect(bv.propuestas.slice(0, 2).every((p) => /^lote_incompleto: /.test(p.error ?? ''))).toBe(true)
    expect(T.M.encargos.get(T.id)!.gasto_usd).toBeCloseTo(antes + 3.18, 6)
    expect(T.M.encargos.get(T.id)!.estado).not.toBe('fallido')
  })
  it('🔴 lo ya pagado se reutiliza también en el borrador: con los 6 clips pagados, nada se envía ni se cobra y los 3 borradores salen', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    b.v.buscarPagados = async (p) => p.huellas.map((h, i) => ({ huella: h, request_id: `viejo-${i + 1}`, video_url: `${ALMACEN}/videos/viejo-${i + 1}.mp4`, costo_usd: 1.06 }))
    const T = await montar(b)
    expect(b.reg.enviados).toHaveLength(0)
    const antes = T.M.encargos.get(T.id)!.gasto_usd
    await sondear(T.M, T.id, nDe(T.ultima))
    expect(borradores(T.M, T.id)!.propuestas.every((p) => !!p.url && p.costo_usd === 0)).toBe(true)
    expect(T.M.encargos.get(T.id)!.gasto_usd).toBeCloseTo(antes, 6)
  })
  it('en seco: el borrador sale simulado en el acto (sin red) y el encargo sigue hasta el dueño', async () => {
    const b = brazo({ estados: () => hecho(1) })
    const T = await montar(b, { dry_run: true })
    expect(T.ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno' })
    const bv = borradores(T.M, T.id)!
    expect(bv).toMatchObject({ simulado: true, resolucion: '480p', costo_usd: 0 })
    expect(bv.propuestas.map((p) => p.url)).toEqual(['P1', 'P2', 'P3'].map((x) => `https://dry.invalid/borrador-${x}.mp4`))
    expect(b.reg.uniones).toBe(0)
  })
  it('la calidad de la plantilla manda: 720p si la plantilla lo dice', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    const T = await montar(b, { borrador: { resolucion: '720p' } })
    const pb = T.M.encargos.get(T.id)!.estado_del_motor.artefactos[ARTEFACTO_PEDIDO_BORRADOR].datos as { planos: PedidoDePlano[] }
    expect(new Set(pb.planos.map((p) => p.resolucion))).toEqual(new Set(['720p']))
  })
})

describe('o2 de CC6 · una propuesta rota NO frena a las demás', () => {
  const guionOk = (k: number) => ({ planos: [{ n: 1, desde: 0, hasta: 4, se_ve: `escena ${k}.1` }, { n: 2, desde: 4, hasta: 8, se_ve: `escena ${k}.2` }], audio: 'olas' })
  const estado = (rota: Record<string, unknown>) => ({
    artefactos: {
      encargo: { version: 1, version_consumida: 0, datos: { brief: { id: 'F1-S1-ig-r1', red: 'Instagram', formato: 'reel', prohibido: [], aprueba: '', texto: 'brief' }, proporcion: '9:16', F: { fotos: [] } } },
      propuestas_video: { version: 1, version_consumida: 0, datos: { ronda: 1, propuestas: [{ id: 'P1', guion: guionOk(1) }, { id: 'P2', guion: rota }, { id: 'P3', guion: guionOk(3) }] } },
    },
    gasto_usd: 0, pasos_ejecutados: 3, fichas: [], vueltas: {}, ultimo: 2,
  })
  const enc = (rota: Record<string, unknown>) => ({ id: 'e1', client_id: 'c1', brief_id: 'F1-S1-ig-r1', familia: 'video_mesa', dry_run: true, estado_del_motor: estado(rota) })
  it.each([
    ['sin planos', { planos: [], audio: 'olas' }, /la propuesta no trae planos/],
    ['con planos que no forman pedido (un plano de 60 s: más que el máximo por plano)', { planos: [{ n: 1, desde: 0, hasta: 60, se_ve: 'eterno' }, { n: 2, desde: 60, hasta: 64, se_ve: 'cierre' }], audio: 'olas' }, /los planos no forman un pedido válido/],
  ])('🔴 P2 %s: P1 y P3 llevan sus pedidos y su borrador; P2 queda con url null y su error', async (_n, rota, error) => {
    const b = brazo({ estados: () => hecho(1) })
    const out = await enviarVideo({ video: b.v, ahora: () => new Date('2026-11-17T03:00:00Z') } as never, enc(rota) as never, conBorradores(3), PASO_BORRADOR)
    const bv = out.res!.artefacto as unknown as BorradoresDeVideo
    expect(bv.propuestas.map((p) => [p.id, p.url])).toEqual([['P1', 'https://dry.invalid/borrador-P1.mp4'], ['P2', null], ['P3', 'https://dry.invalid/borrador-P3.mp4']])
    expect(bv.propuestas[1].error).toMatch(error)
    expect(b.reg.enviados.map((c) => c.split(':').slice(-3, -2)[0])).toEqual(['P1', 'P1', 'P3', 'P3'])
  })
})

describe('pasa de largo SIN GASTAR', () => {
  const enc = (artefactos: Record<string, unknown>) => ({ id: 'e1', client_id: 'c1', brief_id: 'F1', familia: 'video_mesa', dry_run: false, estado_del_motor: { artefactos, gasto_usd: 0, pasos_ejecutados: 3, fichas: [], vueltas: {}, ultimo: 2 } })
  const prop = { version: 1, version_consumida: 0, datos: { ronda: 1, propuestas: [{ id: 'P1', guion: { planos: [{ n: 1, desde: 0, hasta: 4, se_ve: 'a' }, { n: 2, desde: 4, hasta: 8, se_ve: 'b' }] } }] } }
  it('🔴 con la propuesta ya aprobada (#1077 · la mesa volvió después de aprobar): no envía nada', async () => {
    const b = brazo({ estados: () => hecho(1) })
    const out = await enviarVideo({ video: b.v } as never, enc({ propuestas_video: prop, aprobacion_propuestas: { version: 1, version_consumida: 0, datos: { estado: 'aprobada', propuesta_id: 'P1' } } }) as never, conBorradores(3), PASO_BORRADOR)
    expect(out.res?.artefacto).toMatchObject({ omitido: 'propuesta_aprobada', costo_usd: 0, propuestas: [] })
    expect(b.reg.enviados).toHaveLength(0)
    expect(b.reg.cotizados).toHaveLength(0)
  })
  it('sin propuestas (el video de siempre): no envía nada', async () => {
    const b = brazo({ estados: () => hecho(1) })
    const out = await enviarVideo({ video: b.v } as never, enc({}) as never, conBorradores(3), PASO_BORRADOR)
    expect(out.res?.artefacto).toMatchObject({ omitido: 'sin_propuestas' })
    expect(b.reg.enviados).toHaveLength(0)
  })
})

describe('piezas', () => {
  it('🔴 el vigía lee el envío del turno MÁS RECIENTE (borrador o video)', () => {
    const conAmbos = (nVideo: number, nBorrador: number) => ({ artefactos: { pedido_video: { version: 1, version_consumida: 0, datos: { envio: { request_id: 'v', n: nVideo } } }, [ARTEFACTO_PEDIDO_BORRADOR]: { version: 1, version_consumida: 0, datos: { envio: { request_id: 'b', n: nBorrador } } } } })
    expect(envioDe(conAmbos(3, 7) as never)?.request_id).toBe('b')
    expect(envioDe(conAmbos(9, 7) as never)?.request_id).toBe('v')
    expect(envioDe({ artefactos: { [ARTEFACTO_PEDIDO_BORRADOR]: { version: 1, version_consumida: 0, datos: { envio: { request_id: 'b', n: 2 } } } } } as never)?.request_id).toBe('b')
    expect(envioDe({ artefactos: {} } as never)).toBeNull()
  })
  it('🔴 dos propuestas comparten números de plano: el encuadre lleva la propuesta en el nombre (el almacén no pisa)', async () => {
    const nombres: string[] = []
    const P = {
      video: { async encuadrar() { return { ok: true as const, bytes: Buffer.from('jpg') } } },
      async guardarArchivos(ruta: string, a: Array<{ nombre: string }>) { nombres.push(a[0].nombre); return { ok: true as const, urls: { [a[0].nombre]: `${ALMACEN}/${ruta}/${a[0].nombre}` } } },
    }
    const pl = (propuesta: string) => ({ n: 1, fotos: ['https://x.test/a.png'], relacion: '9:16', propuesta }) as unknown as PedidoDePlano
    await encuadrarFotos(P as never, { id: 'e', client_id: 'c', dry_run: false }, [pl('P1'), pl('P2')], 7)
    expect(nombres).toEqual(['P1-p1-7.jpg', 'P2-p1-7.jpg'])
  })
  it('un resultado de una sola toma no cierra el paso del borrador', async () => {
    const b = brazo({ estados: (id) => hecho(Number(id.slice(4))) })
    const T = await montar(b)
    const r = await recibirVideo(T.M.P, T.id, nDe(T.ultima), { ok: true, status: 'completed', video_url: 'u', url_proveedor: null, costo_usd: 1, expires_at: null, copia: 'bucket', aviso: null })
    expect(r.status).toBe(409)
    expect(borradores(T.M, T.id)).toBeUndefined()
  })
  it('la fila de la tarjeta (pedido de CC5): con borrador → su video_url; sin él → null', () => {
    const motor = {
      artefactos: {
        propuestas_video: { datos: { ronda: 1, propuestas: [{ id: 'P1', guion: { planos: [] } }, { id: 'P2', guion: { planos: [] } }] } },
        borrador_video: { datos: { propuestas: [{ id: 'P1', url: 'https://x.test/borrador-P1.mp4', costo_usd: 2.12 }, { id: 'P2', url: null, costo_usd: 0, error: 'nsfw' }] } },
      },
    }
    const t = propuestasDeLaDecision({ id: 'e', brief_id: 'b' }, motor as never, null)!
    expect(t.lista.map((p) => p.video_url)).toEqual(['https://x.test/borrador-P1.mp4', null])
  })
})

describe('17-nov · Sprint 3 · T1 · los borradores usan el catálogo que el encargo guardó al abrir (nota de CC7)', () => {
  const g = (s: number) => ({ planos: [{ n: 1, desde: 0, hasta: s, se_ve: 'escena 1' }, { n: 2, desde: s, hasta: s + 4, se_ve: 'escena 2' }], audio: 'olas' })
  const enc = (catalogo: unknown) => ({ id: 'e1', client_id: 'c1', brief_id: 'F1-S1-ig-r1', familia: 'video_mesa', dry_run: true, estado_del_motor: {
    artefactos: {
      encargo: { version: 1, version_consumida: 0, datos: { brief: { id: 'F1-S1-ig-r1', red: 'Instagram', formato: 'reel', prohibido: [], aprueba: '', texto: 'brief' }, proporcion: '9:16', F: { fotos: [] }, ...(catalogo ? { catalogo_de_modelos: catalogo } : {}) } },
      propuestas_video: { version: 1, version_consumida: 0, datos: { ronda: 1, propuestas: [{ id: 'P1', guion: g(20) }, { id: 'P2', guion: g(10) }] } },
    },
    gasto_usd: 0, pasos_ejecutados: 3, fichas: [], vueltas: {}, ultimo: 2,
  } })
  it('🔴 con Seedance 2.0 guardado: la propuesta con un plano de 20 s queda con su error (antes de enviar); con el del código salen las dos', async () => {
    const b = brazo({ estados: () => hecho(1) })
    const out = await enviarVideo({ video: b.v, ahora: () => new Date('2026-11-17T03:00:00Z') } as never, enc(catalogoDeModelos({ modelo_por_omision: 'bytedance/seedance-2.0' })) as never, conBorradores(2), PASO_BORRADOR)
    const bv = out.res!.artefacto as unknown as BorradoresDeVideo
    expect(bv.propuestas.map((p) => [p.id, p.url === null])).toEqual([['P1', true], ['P2', false]])
    expect(bv.propuestas[0].error).toMatch(/admite hasta 15 s por plano/)
    const b2 = brazo({ estados: () => hecho(1) })
    const out2 = await enviarVideo({ video: b2.v, ahora: () => new Date('2026-11-17T03:00:00Z') } as never, enc(undefined) as never, conBorradores(2), PASO_BORRADOR)
    expect((out2.res!.artefacto as unknown as BorradoresDeVideo).propuestas.every((p) => p.url !== null)).toBe(true)
  })
})
