/**
 * 19-nov · TOPES AL TRIPLE DE LO MEDIDO · el paso del video (DECISIÓN Lenovo 03:25Z «va la A» · cuenta de CC2 · CC3).
 *   video 1,0/s → 1,96/s a 720p (1080p sigue en 2,0) · encargo 45 + 3,9/s → 45 + 4,86/s a 720p (1080p sigue en 4,9) · migración 202611190330 + su reversa.
 * Repite sobre las cifras nuevas las condiciones de CC6 que T7b probó con las viejas (cobertura del tope, motor real hasta el cierre con 2 rondas del dueño).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { registrarPaso, siguientePaso } from '../motor'
import { CIFRAS_POR_SEGUNDO_AL_TRIPLE, CIFRAS_POR_SEGUNDO_T7B, VIDEO_MESA_ENCENDIDA, VIDEO_MESA_POR_SEGUNDO, VIDEO_MESA_POR_SEGUNDO_1900 } from '../plantillas/video-mesa'
import { aplicarTopesPorDuracion, coberturaDelTope, loQueSigueDeLaMesa, topeDelEncargoDeLaFila } from '../topes-por-duracion'
import { cotaAgotada } from '../mesa/planificador'
import { COTAS, type EstadoMesa } from '../mesa/tipos'
import { configDelBrazo, topeDeLaLlamada } from '../../video/parametros'
import { TOPE_MAXIMO_DEL_SOBRE_USD } from '../sobre'
import type { Estado, Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611190330_oficina_video_al_triple_de_lo_medido.sql')
const REV = leer('reversas', '202611190330_oficina_video_al_triple_de_lo_medido_REVERSA.sql')
const MIG_1900 = leer('migrations', '202611171900_oficina_video_t7b_cifras_por_segundo_y_techo_650.sql')
const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const copia = (p: Plantilla): Plantilla => JSON.parse(JSON.stringify(p))
const r2 = (n: number) => Math.round(n * 100) / 100
/** los límites como están EN VIVO: el borrador del video quedó apagado por #1165 directo en la base (sin migración) · 🔴 CC6 #1200 */
const apagado = (lim: Record<string, any>) => ({ ...lim, video: { ...lim.video, borrador: { ...lim.video.borrador, activo: false } } })
/** aplica a unos límites el jsonb_set que trae el SQL (ruta y valor leídos del texto) */
function aplicarJsonbSet(sql: string, lim: Record<string, any>) {
  const m = sql.match(/limites = jsonb_set\(limites, '\{([^}]+)\}', '([^']+)'::jsonb\)/)
  expect(m).not.toBeNull()
  const ruta = m![1].split(','), out = JSON.parse(JSON.stringify(lim))
  let o = out
  for (const k of ruta.slice(0, -1)) o = o[k]
  o[ruta[ruta.length - 1]] = JSON.parse(m![2])
  return out
}

function con(segundos: number, resolucion: '720p' | '1080p'): Plantilla {
  const p = copia(VIDEO_MESA_POR_SEGUNDO)
  ;(p.limites.video as Record<string, unknown>).segundos_max = segundos
  ;(p.limites.video as Record<string, unknown>).resolucion = resolucion
  const a = aplicarTopesPorDuracion(p)
  expect(a.errores).toEqual([])
  return a.plantilla
}
const tope = (p: Plantilla, clave: string) => p.pasos.find((s) => s.clave === clave)!.tope_usd

describe('topes al triple · las cifras del video', () => {
  it('video 1,96/s y encargo 4,86/s a 720p; el 1080p, el borrador, las imágenes y el fijo, como en T7b', () => {
    expect(CIFRAS_POR_SEGUNDO_AL_TRIPLE).toEqual({ video: { '720p': 1.96, '1080p': 2 }, borrador: 0.7, imagenes_clave: 0.2, encargo_fijo: 45, encargo: { '720p': 4.86, '1080p': 4.9 } })
  })
  it('🔴 el triple de lo medido (7,8216 por video de 15 s) cabe en el paso a 720p, y ninguna cifra baja respecto de T7b', () => {
    expect(CIFRAS_POR_SEGUNDO_AL_TRIPLE.video['720p'] * 15).toBeGreaterThanOrEqual(r2(7.8216 * 3))
    for (const r of ['720p', '1080p'] as const) {
      expect(CIFRAS_POR_SEGUNDO_AL_TRIPLE.video[r]).toBeGreaterThanOrEqual(CIFRAS_POR_SEGUNDO_T7B.video[r])
      expect(CIFRAS_POR_SEGUNDO_AL_TRIPLE.encargo[r]).toBeGreaterThanOrEqual(CIFRAS_POR_SEGUNDO_T7B.encargo[r])
    }
  })
  it('🔴 el encargo sube lo mismo que el video (lo cuenta UNA vez): +0,96/s a 720p, +0 a 1080p', () => {
    for (const r of ['720p', '1080p'] as const) {
      expect(r2(CIFRAS_POR_SEGUNDO_AL_TRIPLE.encargo[r] - CIFRAS_POR_SEGUNDO_T7B.encargo[r])).toBe(r2(CIFRAS_POR_SEGUNDO_AL_TRIPLE.video[r] - CIFRAS_POR_SEGUNDO_T7B.video[r]))
    }
  })
  it('a 15 s y 720p (la pieza de hoy): video 29,4 · borrador 10,5 · imágenes 3 + 3 · encargo 45 + 4,86 × 15 = 117,9', () => {
    const p = VIDEO_MESA_ENCENDIDA
    expect([tope(p, 'video'), tope(p, 'borrador_video'), tope(p, 'imagenes_clave'), tope(p, 'imagenes_clave_final')]).toEqual([29.4, 10.5, 3, 3])
    expect(p.limites.tope_encargo_usd).toBe(117.9)
    expect(json(con(15, '720p'))).toEqual(json(VIDEO_MESA_ENCENDIDA))
  })
  it('a 120 s: 720p video 235,2 y encargo 628,2; 1080p sigue en 240 y 633; todo bajo el techo de la base (650)', () => {
    const a = con(120, '720p'), b = con(120, '1080p')
    expect([tope(a, 'video'), a.limites.tope_encargo_usd]).toEqual([235.2, 628.2])
    expect([tope(b, 'video'), b.limites.tope_encargo_usd]).toEqual([240, 633])
    for (const p of [a, b]) expect(p.limites.tope_encargo_usd).toBeLessThanOrEqual(TOPE_MAXIMO_DEL_SOBRE_USD)
  })
})

describe('topes al triple · la cobertura del tope (condición 1118 de CC6) con las cifras nuevas', () => {
  it('a 15 s y 720p lo requerido sube a 77,4 (la mesa guarda) y la pasada con 2 rondas a 75,7; el encargo (117,9) cubre', () => {
    const c = coberturaDelTope(VIDEO_MESA_ENCENDIDA, 117.9)
    expect(c.requerido).toBe(77.4)
    expect(c.cubre).toBe(true)
    expect(c.detalle).toContain('= 75.7')
    expect(c.detalle).toContain('la mesa del video guarda 77.4')
    expect(coberturaDelTope(VIDEO_MESA_ENCENDIDA, 77.3).cubre).toBe(false)
  })
  it('🔴 a cualquier largo y resolución, el encargo cubre lo requerido y lo requerido ≥ un turno + lo que guarda la mesa', () => {
    for (const pl of [VIDEO_MESA_ENCENDIDA, con(15, '1080p'), con(30, '720p'), con(120, '720p'), con(120, '1080p')]) {
      const c = coberturaDelTope(pl, pl.limites.tope_encargo_usd)
      expect(c.cubre).toBe(true)
      expect(c.requerido).toBeGreaterThanOrEqual(COTAS.RESERVA_POR_TURNO_USD + loQueSigueDeLaMesa(pl, { vueltas: {} }))
    }
  })
  it('🔴 el margen (encargo − requerido) es el mismo que con T7b a cualquier largo (video y encargo suben juntos)', () => {
    const viejo = (seg: number) => {
      const p = copia(VIDEO_MESA_POR_SEGUNDO_1900)
      ;(p.limites.video as Record<string, unknown>).segundos_max = seg
      return aplicarTopesPorDuracion(p).plantilla
    }
    for (const seg of [15, 30, 120]) {
      const n = con(seg, '720p'), v = viejo(seg)
      expect(r2(n.limites.tope_encargo_usd - coberturaDelTope(n, 1).requerido)).toBe(r2(v.limites.tope_encargo_usd - coberturaDelTope(v, 1).requerido))
    }
  })
})

/** por el MOTOR REAL hasta el cierre, peor caso (igual que en T7b): cada paso a su tope, la mesa hasta su cota, la jefatura entera, 2 rondas del dueño */
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

describe('topes al triple · por el motor real hasta el cierre (condición fuerte de CC6)', () => {
  const casos: Array<[string, Plantilla]> = [['15 s · 720p (hoy)', VIDEO_MESA_ENCENDIDA], ['15 s · 1080p', con(15, '1080p')], ['120 s · 720p', con(120, '720p')], ['120 s · 1080p', con(120, '1080p')]]
  for (const [nombre, pl] of casos) {
    it(`🔴 ${nombre}: llega a la entrega y al cierre, con el video a su tope, la jefatura entera y sin pasar del tope (${pl.limites.tope_encargo_usd})`, () => {
      const x = hastaElCierre(pl, 2)
      expect(x.fin.accion).toBe('fin')
      expect(x.hechos.filter((h) => h === 'mesa')).toHaveLength(3)
      expect(x.hechos).toContain('video')
      expect(x.hechos.slice(-2)).toEqual(['entrega', 'cierre'])
      expect(x.jefatura).toBe(1.5)
      expect(x.gasto).toBeLessThanOrEqual(pl.limites.tope_encargo_usd)
    })
  }
  it('🔴 con el tope JUSTO = lo requerido (77,4), la mesa trabaja en cada ronda y llega al cierre', () => {
    const justo = coberturaDelTope(VIDEO_MESA_ENCENDIDA, 1).requerido
    expect(justo).toBe(77.4)
    const x = hastaElCierre(VIDEO_MESA_ENCENDIDA, 2, justo)
    expect(x.fin.accion).toBe('fin')
    expect(x.mesas).toHaveLength(3)
    for (const m of x.mesas) expect(m).toBeGreaterThanOrEqual(COTAS.RESERVA_POR_TURNO_USD)
    expect(x.gasto).toBeLessThanOrEqual(justo)
  })
  it('🔴 control: con el video nuevo y el encargo por segundo VIEJO (3,9/s), a 120 s y 720p el encargo (513) NO cubre lo requerido: por eso sube a 4,86/s', () => {
    const pl = con(120, '720p')
    expect(coberturaDelTope(pl, 45 + 3.9 * 120).cubre).toBe(false)
    expect(coberturaDelTope(pl, pl.limites.tope_encargo_usd).cubre).toBe(true)
  })
})

describe('topes al triple · el brazo (no se toca aquí: va con CC5 en G5)', () => {
  it('a 15 s el brazo vivo (60 y 2,0/s) deja llegar al video a su tope en las dos resoluciones', () => {
    const cfg = configDelBrazo(tomar(MIG_1900, 'brazo'))
    expect(topeDeLaLlamada(cfg, 15)).toBeGreaterThanOrEqual(tope(VIDEO_MESA_ENCENDIDA, 'video'))
    expect(topeDeLaLlamada(cfg, 15)).toBeGreaterThanOrEqual(tope(con(15, '1080p'), 'video'))
  })
  it('🔴 la migración no toca la configuración del brazo', () => {
    for (const sql of [MIG, REV]) expect(sql).not.toMatch(/UPDATE\s+public\.cadena_config/)
    for (const sql of [MIG, REV]) expect(sql.match(/^UPDATE /gm)).toHaveLength(1)
  })
})

describe('la migración 202611190330 y su reversa', () => {
  it('🔴 CC6 #1200 · el borrador del video APAGADO en vivo se conserva: los límites cambian con jsonb_set (solo la cifra del encargo a 720p), no se reescriben', () => {
    for (const sql of [MIG, REV]) {
      expect(sql).not.toMatch(/limites = \$lim\$/)
      expect(tomar(sql, 'lim_antes').video.borrador).toEqual({ activo: false, resolucion: '480p' })
      expect(tomar(sql, 'lim').video.borrador).toEqual({ activo: false, resolucion: '480p' })
      // aplicar el jsonb_set a lo vivo da EXACTAMENTE lo que la verificación posterior exige
      expect(aplicarJsonbSet(sql, tomar(sql, 'lim_antes'))).toEqual(tomar(sql, 'lim'))
    }
    expect(aplicarJsonbSet(MIG, tomar(MIG, 'lim_antes')).tope_encargo_usd_por_segundo).toEqual({ '720p': 4.86, '1080p': 4.9 })
    expect(aplicarJsonbSet(REV, tomar(REV, 'lim_antes')).tope_encargo_usd_por_segundo).toEqual({ '720p': 3.9, '1080p': 4.9 })
  })
  it('🔴 CC6 #1200 · después de aplicar, se niega si el borrador no quedó apagado, y si los límites no son los exigidos', () => {
    for (const sql of [MIG, REV]) {
      expect(sql).toContain("IF (SELECT limites->'video'->'borrador'->>'activo' FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 'false' THEN")
      expect(sql.lastIndexOf("->>'activo'")).toBeGreaterThan(sql.indexOf('UPDATE public.oficina_tipos_de_grupo'))
      expect(sql.lastIndexOf('IS DISTINCT FROM $lim$')).toBeGreaterThan(sql.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    }
  })
  it('🔴 «antes» = lo que dejó 202611171900; «después» = el dato del código (encargo 117,9)', () => {
    expect(tomar(MIG, 'pasos_antes')).toEqual(tomar(MIG_1900, 'pasos'))
    expect(tomar(MIG, 'lim_antes')).toEqual(apagado(tomar(MIG_1900, 'lim')))
    expect(tomar(MIG, 'pasos_antes')).toEqual(json(VIDEO_MESA_POR_SEGUNDO_1900.pasos))
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA_POR_SEGUNDO.pasos))
    expect(tomar(MIG, 'lim')).toEqual(apagado(json(VIDEO_MESA_POR_SEGUNDO.limites)))
    expect(MIG).toContain('IS DISTINCT FROM 103.5::numeric THEN')
    expect(MIG).toContain('SET tope_encargo_usd = 117.9,')
    expect(topeDelEncargoDeLaFila({ tope_encargo_usd: 117.9, limites: tomar(MIG, 'lim'), pasos: tomar(MIG, 'pasos') })).toBe(117.9)
  })
  it('🔴 solo cambian la cifra del video y la del encargo a 720p (lo demás de la fila, igual)', () => {
    const quitar = (pasos: Array<Record<string, unknown>>) => pasos.map((s) => (s.funcion === 'video' ? { ...s, tope_usd_por_segundo: null } : s))
    expect(quitar(tomar(MIG, 'pasos'))).toEqual(quitar(tomar(MIG, 'pasos_antes')))
    expect({ ...tomar(MIG, 'lim'), tope_encargo_usd_por_segundo: null }).toEqual({ ...tomar(MIG, 'lim_antes'), tope_encargo_usd_por_segundo: null })
  })
  it('🔴 se niega con encargos vivos (salvo los parados esperando al dueño) y va en una sola transacción', () => {
    // la condición ENTERA del freno, la misma de 202611171900 (no fragmentos: un «AND false» al final dejaba pasar los fragmentos)
    const i = MIG_1900.indexOf('IF EXISTS (SELECT 1 FROM public.oficina_encargos e')
    const freno = MIG_1900.slice(i, MIG_1900.indexOf(' THEN', i) + ' THEN'.length)
    expect(freno.length).toBeGreaterThan(300)
    for (const sql of [MIG, REV]) {
      expect(sql).toContain(freno)
      expect(sql.indexOf(freno)).toBeLessThan(sql.indexOf('UPDATE public.oficina_tipos_de_grupo'))
      expect(sql).toMatch(/estado IN \('abierto', 'en_paso'\)/)
      expect(sql).toContain("t.estado IN ('pendiente', 'corriendo') AND t.tipo = 'dueno')")
      expect(sql).toContain("AND NOT EXISTS (SELECT 1 FROM public.oficina_turnos t WHERE t.encargo_id = e.id AND t.estado IN ('pendiente', 'corriendo') AND t.tipo <> 'dueno')")
      expect(sql.includes('\nBEGIN;')).toBe(true)
      expect(sql.trim().endsWith('COMMIT;')).toBe(true)
      expect(sql).toContain("WHERE familia = 'video_mesa';")
    }
  })
  it('🔴 la reversa es el espejo: «antes» = el «después» de la migración; vuelve al dato de 1900 y a 103,5', () => {
    expect(tomar(REV, 'pasos_antes')).toEqual(tomar(MIG, 'pasos'))
    expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(tomar(REV, 'pasos')).toEqual(tomar(MIG, 'pasos_antes'))
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes'))
    expect(REV).toContain('IS DISTINCT FROM 117.9::numeric THEN')
    expect(REV).toContain('SET tope_encargo_usd = 103.5,')
  })
})
