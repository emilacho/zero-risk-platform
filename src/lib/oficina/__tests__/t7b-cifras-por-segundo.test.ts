/**
 * 17-nov · Sprint 3 · T7b · las cifras por segundo de Lenovo (RESPUESTAS 12:23 + adenda 12:30) y el techo de la base 650 (CC2 · certifica CC6).
 *   video 1,0/s a 720p y 2,0/s a 1080p · borrador 0,7/s · imágenes clave (y finales) 0,2/s · encargo 45 + 3,9/s (720p) o 4,9/s (1080p) · techo 650.
 * Condición fuerte de CC6: las rondas del dueño van DENTRO de lo requerido, y por el MOTOR REAL hasta el cierre, cada paso a su tope, 2 rondas, 720p y 1080p, largo máximo.
 * Adenda Lenovo 12:30 · 3: el freno de la campaña reserva por pieza de video por venir lo ESPERADO (30), no el tope del encargo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { registrarPaso, siguientePaso } from '../motor'
import { CIFRAS_POR_SEGUNDO_T7B, VIDEO_MESA_POR_SEGUNDO_1900, VIDEO_MESA_POR_SEGUNDO_1800 } from '../plantillas/video-mesa'
import { aplicarTopesPorDuracion, coberturaDelTope, loQueSigueDeLaMesa, topeDelEncargoDeLaFila, VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN } from '../topes-por-duracion'
import { cotaAgotada, siguienteDeLaMesa } from '../mesa/planificador'
import { reservaDeLaMesa } from '../mesa/orquestador'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta } from '../mesa/tipos'
import { PASO_MIRAR_VIDEO } from '../video/mirada'
import { PASO_REVISAR_IMAGENES_CLAVE } from '../video/imagen-clave'
import { reservasDesdeLaHistoria } from '../gasto-de-encargos'
import { costoEsperadoDeLaPieza } from '../../cadena/tope-de-campana'
import { configDelBrazo, topeDeLaLlamada } from '../../video/parametros'
import { TOPE_MAXIMO_DEL_SOBRE_USD, validarSobre } from '../sobre'
import type { Estado, Plantilla } from '../tipos'

// 19-nov · desde 202611190330 (topes al triple · `topes-al-triple-video.test.ts`) la plantilla viva tiene otras cifras: esta prueba queda como HISTORIA
//   de T7b y mide la plantilla que escribió 202611171900, ya cargada. Las mismas condiciones de CC6, con las cifras nuevas, viven en la prueba del triple.
const VIDEO_MESA_POR_SEGUNDO = VIDEO_MESA_POR_SEGUNDO_1900
const VIDEO_MESA_ENCENDIDA = aplicarTopesPorDuracion(VIDEO_MESA_POR_SEGUNDO_1900).plantilla
const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611171900_oficina_video_t7b_cifras_por_segundo_y_techo_650.sql')
const REV = leer('reversas', '202611171900_oficina_video_t7b_cifras_por_segundo_y_techo_650_REVERSA.sql')
const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const copia = (p: Plantilla): Plantilla => JSON.parse(JSON.stringify(p))
const r2 = (n: number) => Math.round(n * 100) / 100

/** la plantilla por segundo con otro largo máximo y otra resolución, ya cargada (como la carga `plantillaDe`) */
function con(segundos: number, resolucion: '720p' | '1080p'): Plantilla {
  const p = copia(VIDEO_MESA_POR_SEGUNDO)
  ;(p.limites.video as Record<string, unknown>).segundos_max = segundos
  ;(p.limites.video as Record<string, unknown>).resolucion = resolucion
  const a = aplicarTopesPorDuracion(p)
  expect(a.errores).toEqual([])
  return a.plantilla
}
const tope = (p: Plantilla, clave: string) => p.pasos.find((s) => s.clave === clave)!.tope_usd

describe('T7b · las cifras por segundo y por resolución', () => {
  it('las cifras de Lenovo están en el código tal cual', () => {
    expect(CIFRAS_POR_SEGUNDO_T7B).toEqual({ video: { '720p': 1, '1080p': 2 }, borrador: 0.7, imagenes_clave: 0.2, encargo_fijo: 45, encargo: { '720p': 3.9, '1080p': 4.9 } })
  })
  it('a 15 s y 720p (la pieza de hoy): video 15 · borrador 10,5 · imágenes 3 + 3 · encargo 45 + 3,9 × 15 = 103,5', () => {
    const p = VIDEO_MESA_ENCENDIDA
    expect([tope(p, 'video'), tope(p, 'borrador_video'), tope(p, 'imagenes_clave'), tope(p, 'imagenes_clave_final')]).toEqual([15, 10.5, 3, 3])
    expect(p.limites.tope_encargo_usd).toBe(103.5)
    expect(json(con(15, '720p'))).toEqual(json(VIDEO_MESA_ENCENDIDA))
  })
  it('a 1080p el video y el encargo usan su cifra: 15 s → video 30, encargo 118,5; 120 s → video 240, encargo 633', () => {
    const a = con(15, '1080p'), b = con(120, '1080p'), c = con(120, '720p')
    expect([tope(a, 'video'), a.limites.tope_encargo_usd]).toEqual([30, 118.5])
    expect([tope(b, 'video'), tope(b, 'borrador_video'), tope(b, 'imagenes_clave'), b.limites.tope_encargo_usd]).toEqual([240, 84, 24, 633])
    expect([tope(c, 'video'), c.limites.tope_encargo_usd]).toEqual([120, 513])
  })
  it('🔴 una resolución sin cifra en el mapa NO abre con un tope inventado: es error (el encargo no abre)', () => {
    const p = copia(VIDEO_MESA_POR_SEGUNDO)
    ;(p.limites.video as Record<string, unknown>).resolucion = '4k'
    expect(aplicarTopesPorDuracion(p).errores.length).toBeGreaterThan(0)
  })
  it('🔴 un mapa con una cifra inválida (negativa, texto) es error', () => {
    for (const malo of [{ '720p': -1, '1080p': 2 }, { '720p': 'uno', '1080p': 2 }]) {
      const p = copia(VIDEO_MESA_POR_SEGUNDO)
      p.pasos = p.pasos.map((s) => (s.clave === 'video' ? ({ ...s, tope_usd_por_segundo: malo } as unknown as typeof s) : s))
      expect(aplicarTopesPorDuracion(p).errores.length).toBeGreaterThan(0)
    }
  })
  it('el techo de la base es 650: 2 min a 1080p (633) cabe; 650,01 no', () => {
    expect(TOPE_MAXIMO_DEL_SOBRE_USD).toBe(650)
    expect(con(120, '1080p').limites.tope_encargo_usd).toBeLessThanOrEqual(TOPE_MAXIMO_DEL_SOBRE_USD)
    const base = { parte_id: '11111111-1111-4111-8111-111111111111', brief_id: 'b1', dry_run: true }
    expect(validarSobre({ ...base, tope_usd: 633 }).ok).toBe(true)
    expect(validarSobre({ ...base, tope_usd: 650.01 }).ok).toBe(false)
  })
})

describe('T7b · condición de CC6 · las rondas del dueño van DENTRO de lo requerido', () => {
  it('lo requerido = una pasada + 2 × la vuelta de «aprobar_propuestas» (61,3), pero nunca menos de lo que la mesa del video guarda antes de su primer turno (63)', () => {
    const c = coberturaDelTope(VIDEO_MESA_ENCENDIDA, 103.5)
    expect(c.requerido).toBe(63)
    expect(c.cubre).toBe(true)
    expect(c.detalle).toContain('2 × la vuelta de «aprobar_propuestas» (14.1) = 61.3')
    expect(c.detalle).toContain('la mesa del video guarda 63')
  })
  it('🔴 condición de CC6 (CERTIFICACIÓN 1118 · una sola cuenta): en el video, lo requerido ≥ un turno + lo que guarda la mesa; con un tope entre 61,3 y 63 el encargo NO abre', () => {
    for (const pl of [VIDEO_MESA_ENCENDIDA, con(15, '1080p'), con(120, '720p'), con(120, '1080p')]) {
      expect(coberturaDelTope(pl, 1).requerido).toBeGreaterThanOrEqual(COTAS.RESERVA_POR_TURNO_USD + loQueSigueDeLaMesa(pl, { vueltas: {} }))
    }
    expect(coberturaDelTope(VIDEO_MESA_ENCENDIDA, 62).cubre).toBe(false)
    // pedido de CC6 (CERTIFICACIÓN 1121): un paso que GASTA antes de la mesa también entra (hoy `abrir` tiene tope 0 y quitarlo no se notaba)
    const i = VIDEO_MESA_ENCENDIDA.pasos.findIndex((x) => x.funcion === 'mesa')
    const previo = { ...VIDEO_MESA_ENCENDIDA.pasos[i - 1], clave: 'previo_que_gasta', tope_usd: 2 }
    const conPrevio = { ...VIDEO_MESA_ENCENDIDA, pasos: [...VIDEO_MESA_ENCENDIDA.pasos.slice(0, i), previo, ...VIDEO_MESA_ENCENDIDA.pasos.slice(i)] }
    expect(coberturaDelTope(conPrevio, 1).requerido).toBe(Math.round((2 + COTAS.RESERVA_POR_TURNO_USD + loQueSigueDeLaMesa(conPrevio, { vueltas: {} })) * 10000) / 10000)
    expect(coberturaDelTope(conPrevio, 1).requerido).toBe(65)
    // las mesas que no son de video conservan su cuenta (guardan su cifra fija, no esta)
    const carrusel = { ...VIDEO_MESA_ENCENDIDA, familia: 'carrusel_mesa' }
    expect(coberturaDelTope(carrusel, 103.5).requerido).toBe(61.3)
  })
  it('a 1080p y 120 s lo requerido (592,5) lo cubre el encargo (633)', () => {
    expect(coberturaDelTope(con(120, '1080p'), 633)).toMatchObject({ requerido: 592.5, cubre: true })
    expect(coberturaDelTope(con(120, '720p'), 513)).toMatchObject({ requerido: 472.5, cubre: true })
  })
  it('🔴 las vueltas que se saltan si no caben son las de los guardas del código (no otras)', () => {
    // 18-nov · la vuelta de la jefatura también: `puedeVolverALaMesa` la mide entera antes de devolver (regla dura, hasta 6 vueltas · 202611181530)
    expect(VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN.claves).toEqual([PASO_REVISAR_IMAGENES_CLAVE, PASO_MIRAR_VIDEO, 'jefatura'])
    // 20-nov · PLAN v4 (CC4) · la vuelta de la segunda mirada también: `cabeLaVueltaDeLaSegundaMirada` la mide entera (mesa + lo que sigue + rondas del dueño) antes de volver
    expect(VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN.funciones).toEqual(['pedido_de_video', 'segunda_mirada'])
    expect(VIDEO_MESA_ENCENDIDA.pasos.find((s) => s.funcion === 'pedido_de_video')?.vuelve_a).toBeTruthy()
  })
  it('la mesa del video guarda lo que sigue con la MISMA cuenta (pasos + jefatura + rondas que quedan), no la cifra fija de 6,5', () => {
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, { vueltas: {} })).toBe(62.4)
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, { vueltas: { aprobar_propuestas: 1 } })).toBe(48.3)
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, { vueltas: { aprobar_propuestas: 2 } })).toBe(34.2)
    expect(loQueSigueDeLaMesa({ ...VIDEO_MESA_ENCENDIDA, pasos: VIDEO_MESA_ENCENDIDA.pasos.filter((s) => s.funcion !== 'mesa') }, { vueltas: {} })).toBe(0)
  })
})

/**
 * por el MOTOR REAL hasta el cierre, peor caso: la mesa gasta turnos de 0,6 mientras su cota la deje (`cotaAgotada`, con lo que sigue de `loQueSigueDeLaMesa`;
 * sin contar el tope de 24 turnos, que solo baja el gasto), cada paso gasta su tope entero, la jefatura su revisión entera (1,5) si queda, y el dueño devuelve
 * a la mesa `rondas` veces. Las vueltas que se saltan si no caben no se piden (así lo deciden sus guardas).
 */
function hastaElCierre(pl: Plantilla, rondas: number, tope?: number) {
  const top = tope ?? pl.limites.tope_encargo_usd
  let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
  let quedan = rondas
  const hechos: string[] = []
  const mesas: number[] = []
  let jefatura = 0
  for (let k = 0; k < 200; k++) {
    const s = siguientePaso(e, pl)
    if (s.accion !== 'ejecutar') return { fin: s, hechos, gasto: r2(e.gasto_usd), jefatura, mesas }
    const p = s.paso
    let costo = p.tope_usd
    if (p.funcion === 'mesa') {
      const ctx = { tope_usd: top, hayImagenGenerada: false, tipo: 'video' as const, reserva_posterior_usd: loQueSigueDeLaMesa(pl, e), techo_es_el_tope: true }
      let g = e.gasto_usd
      while (cotaAgotada({ turnos: 0, tipo: 'video' } as unknown as EstadoMesa, { ...ctx, gasto_usd: g }) === null) g += COTAS.RESERVA_POR_TURNO_USD
      costo = g - e.gasto_usd
      mesas.push(r2(costo))
    }
    if (p.tipo === 'jefatura') { costo = Math.min(1.5, Math.max(0, top - e.gasto_usd)); jefatura = costo }
    const artefacto = p.clave === 'aprobar_propuestas' ? { vuelve_a_la_mesa: quedan-- > 0 } : { hay_imagenes: true, hay_cuadros: true, ok: true, vuelve_a_la_mesa: false }
    e = registrarPaso(e, pl, s.indice, { costo_usd: costo, artefacto, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
    hechos.push(p.clave)
  }
  throw new Error('no terminó')
}

describe('T7b · condición fuerte de CC6 · por el motor real hasta el cierre, cada paso a su tope, 2 rondas del dueño', () => {
  const casos: Array<[string, Plantilla]> = [['15 s · 720p (hoy)', VIDEO_MESA_ENCENDIDA], ['15 s · 1080p', con(15, '1080p')], ['120 s · 720p', con(120, '720p')], ['120 s · 1080p', con(120, '1080p')]]
  for (const [nombre, pl] of casos) {
    it(`🔴 ${nombre}: llega a la entrega y al cierre, con la jefatura entera y sin pasar del tope (${pl.limites.tope_encargo_usd})`, () => {
      const x = hastaElCierre(pl, 2)
      expect(x.fin.accion).toBe('fin')
      expect(x.hechos.filter((h) => h === 'mesa')).toHaveLength(3)
      expect(x.hechos.slice(-2)).toEqual(['entrega', 'cierre'])
      expect(x.jefatura).toBe(1.5)
      expect(x.gasto).toBeLessThanOrEqual(pl.limites.tope_encargo_usd)
    })
  }
  it('🔴 CC6 (RESPUESTA aplicar-1118) · con el tope JUSTO = lo requerido (63), la mesa trabaja en CADA ronda del dueño (la ronda en curso no se reserva otra vez) y llega al cierre', () => {
    const justo = coberturaDelTope(VIDEO_MESA_ENCENDIDA, 1).requerido
    expect(justo).toBe(63)
    const x = hastaElCierre(VIDEO_MESA_ENCENDIDA, 2, justo)
    expect(x.fin.accion).toBe('fin')
    expect(x.mesas).toHaveLength(3)
    for (const m of x.mesas) expect(m).toBeGreaterThanOrEqual(COTAS.RESERVA_POR_TURNO_USD)
    expect(x.hechos.slice(-2)).toEqual(['entrega', 'cierre'])
    expect(x.gasto).toBeLessThanOrEqual(justo)
  })
  it('🔴 la ronda en curso: con el último paso «aprobar_propuestas» pidiendo volver a la mesa, la mesa guarda 1 ronda menos', () => {
    const iA = VIDEO_MESA_ENCENDIDA.pasos.findIndex((s) => s.clave === 'aprobar_propuestas')
    const base = { pasos_ejecutados: 6, gasto_usd: 14.1, fichas: [] }
    const pide = (n: number, vueltas: Record<string, number>) => ({ ...base, ultimo: n, vueltas, artefactos: { aprobacion_propuestas: { version: 1, datos: { vuelve_a_la_mesa: true } } } }) as unknown as Estado
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, pide(iA, {}))).toBe(48.3)
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, pide(iA, { aprobar_propuestas: 1 }))).toBe(34.2)
    // si el dueño aprobó (no vuelve), no hay ronda en curso
    const aprobo = { ...pide(iA, {}), artefactos: { aprobacion_propuestas: { version: 1, datos: { vuelve_a_la_mesa: false } } } } as unknown as Estado
    expect(loQueSigueDeLaMesa(VIDEO_MESA_ENCENDIDA, aprobo)).toBe(62.4)
  })
  it('🔴 control: sin las rondas en la reserva de la mesa (la cifra fija vieja de 6,5) el mismo peor caso se corta antes de la entrega', () => {
    const pl = VIDEO_MESA_ENCENDIDA
    let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
    let quedan = 2
    let fin: ReturnType<typeof siguientePaso> | null = null
    for (let k = 0; k < 200 && !fin; k++) {
      const s = siguientePaso(e, pl)
      if (s.accion !== 'ejecutar') { fin = s; break }
      let costo = s.paso.tope_usd
      if (s.paso.funcion === 'mesa') {
        let g = e.gasto_usd
        while (cotaAgotada({ turnos: 0, tipo: 'video' } as unknown as EstadoMesa, { gasto_usd: g, tope_usd: pl.limites.tope_encargo_usd, hayImagenGenerada: false, tipo: 'video' }) === null) g += COTAS.RESERVA_POR_TURNO_USD
        costo = g - e.gasto_usd
      }
      const artefacto = s.paso.clave === 'aprobar_propuestas' ? { vuelve_a_la_mesa: quedan-- > 0 } : { hay_imagenes: true, hay_cuadros: true, ok: true, vuelve_a_la_mesa: false }
      e = registrarPaso(e, pl, s.indice, { costo_usd: costo, artefacto, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
    }
    expect(fin?.accion).toBe('cierre_por_tope')
  })
})

describe('T7b · la mesa del video, en su código', () => {
  const T = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: ['a'], necesita: ['b'], entrega: ['c'], pertinente_en, activo: true, version: 1 })
  const DIR = [T('direccion-video', 'direccion', ['video']), T('guionista', 'miembro', ['video'])]
  const est = { tipo: 'video', directorio_congelado: DIR, direccion: 'direccion-video', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as unknown as EstadoMesa
  const A = (n: number, de: string, tipo: Aporte['tipo']): Aporte => ({ id: `id-${n}`, encargo_id: 'e1', n, de, para: null, tipo, texto: 'x', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-11-17T00:00:00Z' } as Aporte)
  const libro = [A(1, 'direccion-video', 'dirige'), A(2, 'guionista', 'aporta')]
  it('🔴 el orquestador de la mesa le pasa al planificador la reserva de la plantilla (con las rondas que quedan) y el freno en el tope', () => {
    expect(reservaDeLaMesa(VIDEO_MESA_ENCENDIDA, 'video', { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] })).toEqual({ reserva_posterior_usd: 62.4, techo_es_el_tope: true })
    expect(reservaDeLaMesa(VIDEO_MESA_ENCENDIDA, 'video', { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: { aprobar_propuestas: 2 }, artefactos: {}, fichas: [] })).toEqual({ reserva_posterior_usd: 34.2, techo_es_el_tope: true })
    expect(reservaDeLaMesa(VIDEO_MESA_ENCENDIDA, 'carrusel', { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] })).toEqual({})
  })
  it('🔴 con la cota agotada, la integración final del video NO pasa del tope (el motor frena en el tope: pasarlo cortaría el encargo después)', () => {
    const ctx = { gasto_usd: 41, tope_usd: 103.5, hayImagenGenerada: false, tipo: 'video' as const, reserva_posterior_usd: 62.4 }
    expect(cotaAgotada(est, ctx)).not.toBeNull()
    expect(siguienteDeLaMesa(est, libro, { ...ctx, techo_es_el_tope: true }).accion).toBe('seguir_a_dibujar')
    // las demás mesas conservan su regla (techo × 1,2): sin la marca, integra «con lo que hay»
    expect(siguienteDeLaMesa(est, libro, ctx)).toMatchObject({ accion: 'turno', tipo: 'integrar' })
    // con lugar bajo el tope, el video sí integra
    expect(siguienteDeLaMesa(est, libro, { ...ctx, gasto_usd: 40.4, techo_es_el_tope: true })).toMatchObject({ accion: 'turno', tipo: 'integrar' })
  })
})

describe('T7b · adenda Lenovo 12:30 · 3 · el freno de la campaña para una fila de video por venir', () => {
  const fila = () => ({ familia: 'video_mesa', tope_encargo_usd: 103.5, limites: tomar(MIG, 'lim'), pasos: tomar(MIG, 'pasos') })
  it('🔴 con la fila que deja 202611171900, el tope de la familia es 103,5 pero el freno reserva lo ESPERADO: 30', () => {
    expect(topeDelEncargoDeLaFila(fila())).toBe(103.5)
    const reservas = reservasDesdeLaHistoria([fila()], [])
    expect(reservas).toEqual({ video_mesa: 30 })
    expect(costoEsperadoDeLaPieza({ video_mesa: 103.5 }, reservas, 'video_mesa')).toBe(30)
  })
  it('con historia, el mayor entre el promedio y el dato (piso 30), nunca más que el tope', () => {
    expect(reservasDesdeLaHistoria([fila()], [{ familia: 'video_mesa', gasto_usd: 40 }, { familia: 'video_mesa', gasto_usd: 50 }, { familia: 'video_mesa', gasto_usd: 60 }])).toEqual({ video_mesa: 50 })
    expect(reservasDesdeLaHistoria([fila()], [{ familia: 'video_mesa', gasto_usd: 5 }, { familia: 'video_mesa', gasto_usd: 5 }, { familia: 'video_mesa', gasto_usd: 5 }])).toEqual({ video_mesa: 30 })
    expect(reservasDesdeLaHistoria([fila()], [{ familia: 'video_mesa', gasto_usd: 500 }, { familia: 'video_mesa', gasto_usd: 500 }, { familia: 'video_mesa', gasto_usd: 500 }])).toEqual({ video_mesa: 103.5 })
  })
  it('sin reserva de la familia el freno cuenta el tope (del lado seguro, como antes): 103,5', () => {
    expect(costoEsperadoDeLaPieza({ video_mesa: 103.5 }, {}, 'video_mesa')).toBe(103.5)
  })
})

describe('T7b · el brazo: 60 por video y 2,0 por segundo', () => {
  // 19-nov · G5 (GO Lenovo 03:26Z): con cifra por segundo el 60 ya no corta; una llamada de 45 s se topa en 2,0 × 45 = 90 (el techo de la pieza lo pone el paso `video`)
  it('cada llamada se topa con 2,0 × sus segundos; el 60 queda de respaldo y no corta', () => {
    const cfg = configDelBrazo(tomar(MIG, 'brazo'))
    expect(cfg).toMatchObject({ tope_por_video_usd: 60, tope_por_segundo_usd: 2 })
    expect(topeDeLaLlamada(cfg, 15)).toBe(30)
    expect(topeDeLaLlamada(cfg, 4)).toBe(8)
    expect(topeDeLaLlamada(cfg, 45)).toBe(90)
    expect(topeDeLaLlamada(cfg, 45, 70)).toBe(70)
    expect(topeDeLaLlamada(cfg, 0)).toBe(60)
    expect(topeDeLaLlamada(cfg, Number.NaN)).toBe(60)
  })
  it('🔴 el brazo nunca deja a un video (1080p, plano entero de 15 s) por debajo del tope de su paso: 2,0 × 15 = 30', () => {
    const cfg = configDelBrazo(tomar(MIG, 'brazo'))
    expect(topeDeLaLlamada(cfg, 15)).toBeGreaterThanOrEqual(tope(con(15, '1080p'), 'video'))
  })
})

describe('la migración 202611171900 y su reversa', () => {
  it('🔴 «antes» = lo que dejó 202611171800 (el dato por segundo de T7a, encargo 58); «después» = el dato de T7b del código (encargo 103,5)', () => {
    expect(tomar(MIG, 'pasos_antes')).toEqual(json(VIDEO_MESA_POR_SEGUNDO_1800.pasos))
    expect(tomar(MIG, 'lim_antes')).toEqual(json(VIDEO_MESA_POR_SEGUNDO_1800.limites))
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA_POR_SEGUNDO.pasos))
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA_POR_SEGUNDO.limites))
    expect(MIG).toContain('SET tope_encargo_usd = 103.5,')
    expect(topeDelEncargoDeLaFila({ tope_encargo_usd: 103.5, limites: tomar(MIG, 'lim'), pasos: tomar(MIG, 'pasos') })).toBe(103.5)
    expect(tomar(MIG, 'brazo_antes')).toEqual({ tope_por_video_usd: 15 })
    expect(tomar(MIG, 'brazo')).toEqual({ tope_por_video_usd: 60, tope_por_segundo_usd: 2 })
  })
  it('🔴 sube las dos reglas al techo del código (650) y se niega con encargos vivos', () => {
    expect(MIG).toContain(`ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD});`)
    expect(MIG).toContain(`ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD});`)
    expect(MIG).toMatch(/estado IN \('abierto', 'en_paso'\)/)
    // un encargo parado esperando al dueño no frena (Lenovo + CC6, 17-nov): solo si TODOS sus turnos abiertos son `dueno` y hay al menos uno
    for (const sql of [MIG, REV]) {
      expect(sql).toContain("t.estado IN ('pendiente', 'corriendo') AND t.tipo = 'dueno')")
      expect(sql).toContain("AND NOT EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo <> 'dueno')")
    }
    expect(MIG.trim().startsWith('BEGIN;') || MIG.includes('\nBEGIN;')).toBe(true)
    expect(MIG.trim().endsWith('COMMIT;')).toBe(true)
  })
  it('🔴 la reversa es el espejo: «antes» = el «después» de la migración; vuelve al dato de 1800, al brazo 15 y a 60 (la de encargos NOT VALID)', () => {
    expect(tomar(REV, 'pasos_antes')).toEqual(tomar(MIG, 'pasos'))
    expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(tomar(REV, 'brazo_antes')).toEqual(tomar(MIG, 'brazo'))
    expect(tomar(REV, 'pasos')).toEqual(tomar(MIG, 'pasos_antes'))
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes'))
    expect(tomar(REV, 'brazo')).toEqual({ tope_por_video_usd: 15 })
    expect(REV).toContain('SET tope_encargo_usd = 58,')
    expect(REV).toContain('CHECK (tope_usd > 0 AND tope_usd <= 60) NOT VALID;')
    expect(REV).toContain('CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 60);')
    expect(REV).toMatch(/estado IN \('abierto', 'en_paso'\)/)
    // primero el dato, después las reglas (si no, la regla de 60 no se puede volver con la fila en 103,5)
    expect(REV.indexOf('SET tope_encargo_usd = 58,')).toBeLessThan(REV.indexOf('ADD CONSTRAINT oficina_tipos_tope_valido'))
  })
})
