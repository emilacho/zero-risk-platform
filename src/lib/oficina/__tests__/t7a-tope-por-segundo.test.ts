/**
 * 17-nov · Sprint 3 · T7a · EL TOPE POR SEGUNDO TERMINADO (CC2 · 🟢 CC6 al diseño con 4 condiciones: `REVISION-CC6-a-CC2-LENOVO-t7-tope-por-segundo`).
 * Lo que se prueba: (1) con las cifras que reproducen hoy, la plantilla por segundo CARGADA es la de hoy campo por campo; (2) la migración y su reversa
 * escriben exactamente eso (antes = la fila viva del 17-nov); (3) el tope crece con el largo máximo; (4) el invariante en el código (condición 1):
 * un encargo cuyo tope no cubre una pasada por los pasos que gastan NO abre; (5) el freno de la campaña usa la misma cuenta (condición 2);
 * (6) el brazo, por llamada; (7) por el motor real, hasta el cierre, igual que con los topes fijos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { reservasDesdeLaHistoria } from '../gasto-de-encargos'
import { registrarPaso, siguientePaso } from '../motor'
import { abrirEncargo, plantillaDe } from '../orquestador'
import { validarPlantilla } from '../plantilla'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
// 17-nov · T7b: este archivo prueba T7a con su forma (202611171800: cifras que reproducían los topes fijos de 0930). Desde 202611171900 la viva es otra (ver t7b-*)
import { VIDEO_MESA_ENCENDIDA_0930 as VIDEO_MESA_ENCENDIDA, VIDEO_MESA_POR_SEGUNDO_1800 as VIDEO_MESA_POR_SEGUNDO } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Plantilla } from '../tipos'
import { aplicarTopesPorDuracion, coberturaDelTope, topeDelEncargoDeLaFila } from '../topes-por-duracion'
import { configDelBrazo, topeDeLaLlamada } from '../../video/parametros'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611171800_oficina_video_tope_por_segundo.sql')
const REV = leer('reversas', '202611171800_oficina_video_tope_por_segundo_REVERSA.sql')
const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const copia = (p: Plantilla): Plantilla => JSON.parse(JSON.stringify(p))
const conSegundos = (p: Plantilla, s: number): Plantilla => { const c = copia(p); (c.limites.video as Record<string, unknown>).segundos_max = s; return c }
const video = (p: Plantilla) => p.pasos.find((x) => x.funcion === 'video')!

describe('T7a · con las cifras de hoy no cambia NADA', () => {
  it('🔴 la plantilla por segundo, cargada, es la de hoy campo por campo (video 15 · encargo 58 · tope por video 15)', () => {
    const a = aplicarTopesPorDuracion(VIDEO_MESA_POR_SEGUNDO)
    expect(a.errores).toEqual([])
    expect(json(a.plantilla)).toEqual(json(VIDEO_MESA_ENCENDIDA))
    expect(video(a.plantilla).tope_usd).toBe(15)
    expect(a.plantilla.limites.tope_encargo_usd).toBe(58)
    expect((a.plantilla.limites.video as Record<string, unknown>).tope_por_video_usd).toBe(15)
  })
  it('es idempotente: aplicarla dos veces da lo mismo (la carga y `plantillaDe` pueden aplicarla las dos)', () => {
    const una = aplicarTopesPorDuracion(VIDEO_MESA_POR_SEGUNDO).plantilla
    expect(json(aplicarTopesPorDuracion(una).plantilla)).toEqual(json(una))
  })
  it('una familia sin dato por segundo vuelve IGUAL (el mismo objeto): las demás familias no cambian', () => {
    expect(aplicarTopesPorDuracion(CARRUSEL_IG_V1).plantilla).toBe(CARRUSEL_IG_V1)
    expect(aplicarTopesPorDuracion(VIDEO_MESA_ENCENDIDA).plantilla).toBe(VIDEO_MESA_ENCENDIDA)
  })
  it('`validarPlantilla` no suma ningún error por el dato por segundo (los mismos de siempre de la plantilla de video: la mesa y `chequeos_2`)', () => {
    expect(validarPlantilla(VIDEO_MESA_POR_SEGUNDO)).toEqual(validarPlantilla(VIDEO_MESA_ENCENDIDA))
  })
})

describe('T7a · la migración 202611171800 y su reversa', () => {
  it('🔴 «antes» = la plantilla de hoy; «después» = la plantilla por segundo (exactas)', () => {
    expect(tomar(MIG, 'pasos_antes')).toEqual(json(VIDEO_MESA_ENCENDIDA.pasos))
    expect(tomar(MIG, 'lim_antes')).toEqual(json(VIDEO_MESA_ENCENDIDA.limites))
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA_POR_SEGUNDO.pasos))
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA_POR_SEGUNDO.limites))
  })
  it('🔴 la reversa es la inversa exacta, y vuelve a 15 / 58 con `tope_por_video_usd`', () => {
    expect(tomar(REV, 'pasos_antes')).toEqual(tomar(MIG, 'pasos'))
    expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(tomar(REV, 'pasos')).toEqual(tomar(MIG, 'pasos_antes'))
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes'))
    expect(REV).toContain("limites->'video' ? 'tope_por_video_usd'")
  })
  it('las dos se niegan con encargos vivos y si el dato no es el esperado; ninguna toca la columna (58) ni las reglas de la base', () => {
    for (const sql of [MIG, REV]) {
      expect(sql).toContain("WHERE estado IN ('abierto', 'en_paso')")
      expect(sql).toContain('IS DISTINCT FROM 58::numeric')
      expect(sql).not.toMatch(/SET\s+tope_encargo_usd\s*=/)
      expect(sql).not.toMatch(/ALTER TABLE/)
      expect(sql).toMatch(/^BEGIN;$/m)
      expect(sql).toMatch(/^COMMIT;$/m)
    }
  })
})

describe('T7a · el tope crece con el largo máximo de la pieza', () => {
  it('con 120 s (lo que abriría T1): video 0 + 1,0 × 120 = 120 · encargo 43 + 1,0 × 120 = 163 · tope por video 120', () => {
    const a = aplicarTopesPorDuracion(conSegundos(VIDEO_MESA_POR_SEGUNDO, 120))
    expect(video(a.plantilla).tope_usd).toBe(120)
    expect(a.plantilla.limites.tope_encargo_usd).toBe(163)
    expect((a.plantilla.limites.video as Record<string, unknown>).tope_por_video_usd).toBe(120)
  })
  it('la salida ya no trae partes por segundo ni por plano (el motor ve números)', () => {
    const t = JSON.stringify(aplicarTopesPorDuracion(VIDEO_MESA_POR_SEGUNDO).plantilla)
    expect(t).not.toContain('tope_usd_por_segundo')
    expect(t).not.toContain('tope_encargo_usd_por_segundo')
  })
  it('por plano: × `limites.video.planos_max`', () => {
    const p = copia(VIDEO_MESA_POR_SEGUNDO)
    const ic = p.pasos.find((x) => x.clave === 'imagenes_clave')!
    ic.tope_usd = 1; ic.tope_usd_por_plano = 0.25
    ;(p.limites.video as Record<string, unknown>).planos_max = 12
    expect(aplicarTopesPorDuracion(p).plantilla.pasos.find((x) => x.clave === 'imagenes_clave')!.tope_usd).toBe(4)
  })
  it('🔴 dato inválido: sin `segundos_max` (o sin `planos_max`) no calcula nada, devuelve el error y `validarPlantilla` lo rechaza', () => {
    const sin = copia(VIDEO_MESA_POR_SEGUNDO); delete (sin.limites.video as Record<string, unknown>).segundos_max
    const a = aplicarTopesPorDuracion(sin)
    expect(a.errores.join(' ')).toMatch(/segundos_max/)
    expect(a.plantilla).toBe(sin)
    expect(validarPlantilla(sin).join(' ')).toMatch(/segundos_max/)
    const pp = copia(VIDEO_MESA_POR_SEGUNDO); pp.pasos.find((x) => x.clave === 'imagenes_clave')!.tope_usd_por_plano = 0.25
    expect(aplicarTopesPorDuracion(pp).errores.join(' ')).toMatch(/planos_max/)
    const neg = copia(VIDEO_MESA_POR_SEGUNDO); video(neg).tope_usd_por_segundo = -1
    expect(aplicarTopesPorDuracion(neg).errores.join(' ')).toMatch(/≥ 0/)
  })
  it('un paso de código SIN gasto (o la jefatura) no lleva tope por segundo', () => {
    const p = copia(VIDEO_MESA_POR_SEGUNDO); p.pasos.find((x) => x.clave === 'chequeos')!.tope_usd_por_segundo = 1
    expect(validarPlantilla(p).join(' ')).toMatch(/sin gasto no lleva tope por segundo/)
    const j = copia(VIDEO_MESA_POR_SEGUNDO); j.pasos.find((x) => x.tipo === 'jefatura')!.tope_usd_por_segundo = 1
    expect(validarPlantilla(j).join(' ')).toMatch(/jefatura no lleva tope por segundo/)
  })
})

describe('T7a · condición 1 de CC6 · el invariante está en el CÓDIGO', () => {
  it('lo requerido sale de los pasos de la plantilla: una pasada (imágenes 3 + borrador 10 + finales 3 + revisar 0,5 + video 15 + mirar 0,5 + un turno de la mesa 0,6 = 32,6) + desde T7b las 2 rondas del dueño (2 × 13,6) = 59,8: el 58 de 1800 ya NO cubre', () => {
    const c = coberturaDelTope(VIDEO_MESA_ENCENDIDA, 58)
    expect(c.requerido).toBe(59.8)
    expect(c.cubre).toBe(false)
    expect(coberturaDelTope(VIDEO_MESA_ENCENDIDA, 59.79).cubre).toBe(false)
    expect(coberturaDelTope(VIDEO_MESA_ENCENDIDA, 59.8).cubre).toBe(true)
  })
  it('con 120 s el requerido crece con el video (59,8 − 15 + 120 = 164,8) y el 163 de la forma de 1800 no lo cubre', () => {
    const a = aplicarTopesPorDuracion(conSegundos(VIDEO_MESA_POR_SEGUNDO, 120)).plantilla
    expect(coberturaDelTope(a, a.limites.tope_encargo_usd)).toMatchObject({ requerido: 164.8, cubre: false })
  })
  it('🔴 un encargo cuyo tope no cubre la pasada NO abre (409 claro, sin crear nada)', async () => {
    const mal = copia(VIDEO_MESA_POR_SEGUNDO); mal.limites.tope_encargo_usd_por_segundo = 0 // encargo 43 · video 15 → cubre (32,6)
    const peor = conSegundos(mal, 120) // encargo 43 y video 120 → requerido 164,8 (con las 2 rondas): NO cubre
    const M = crearMemoria({ plantilla: peor })
    const r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-T7A', dry_run: true, familia: peor.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'tope_no_cubre', requerido_usd: 164.8, tope_usd: 43 })
    expect(M.encargos.size).toBe(0)
  })
  it('🔴 condición 2 · un sobre que pide MENOS que lo requerido tampoco abre', async () => {
    const M = crearMemoria({ plantilla: VIDEO_MESA_POR_SEGUNDO })
    const r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-T7A', dry_run: true, familia: VIDEO_MESA_POR_SEGUNDO.familia, tope_usd: 30 }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'tope_no_cubre', tope_usd: 30 })
    expect(M.encargos.size).toBe(0)
  })
  it('🔴 T7b · con el dato de 1800 (58) el video ya NO abre: lo requerido con las 2 rondas es 59,8 (por eso 202611171900); sin cortar nada, solo no empieza', async () => {
    const M = crearMemoria({ plantilla: VIDEO_MESA_POR_SEGUNDO })
    const r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-T7A', dry_run: true, familia: VIDEO_MESA_POR_SEGUNDO.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'tope_no_cubre', requerido_usd: 59.8, tope_usd: 58 })
    expect(M.encargos.size).toBe(0)
  })
  it('dato inválido: el encargo no abre (409 `topes_invalidos`)', async () => {
    const sin = copia(VIDEO_MESA_POR_SEGUNDO); delete (sin.limites.video as Record<string, unknown>).segundos_max
    const M = crearMemoria({ plantilla: sin })
    const r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-T7A', dry_run: true, familia: sin.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'topes_invalidos' })
    expect(M.encargos.size).toBe(0)
  })
})

describe('T7a · condición 2 de CC6 · el freno de la campaña usa la misma cuenta', () => {
  const fila = (p: Plantilla, col: number) => ({ familia: p.familia, tope_encargo_usd: col, limites: json(p.limites), pasos: json(p.pasos) })
  it('una fila por segundo da el tope calculado (58; con 120 s, 163), no la parte fija', () => {
    expect(topeDelEncargoDeLaFila(fila(VIDEO_MESA_POR_SEGUNDO, 58))).toBe(58)
    expect(topeDelEncargoDeLaFila(fila(conSegundos(VIDEO_MESA_POR_SEGUNDO, 120), 58))).toBe(163)
  })
  it('una fila sin dato por segundo da la columna, como siempre; dato inválido → null (el freno no la cuenta)', () => {
    expect(topeDelEncargoDeLaFila({ tope_encargo_usd: 7, limites: json(CARRUSEL_IG_V1.limites), pasos: json(CARRUSEL_IG_V1.pasos) })).toBe(7)
    expect(topeDelEncargoDeLaFila({ tope_encargo_usd: '7' })).toBe(7)
    const sin = copia(VIDEO_MESA_POR_SEGUNDO); delete (sin.limites.video as Record<string, unknown>).segundos_max
    expect(topeDelEncargoDeLaFila(fila(sin, 58))).toBeNull()
  })
  it('lo esperado por pieza (30) no pasa del tope calculado: con la cuenta por segundo sigue en 30', () => {
    expect(reservasDesdeLaHistoria([fila(VIDEO_MESA_POR_SEGUNDO, 58)], [])).toEqual({ video_mesa: 30 })
  })
  it('🔴 el freno lee el tope CALCULADO, no la columna: con una columna vieja de 20 y el cálculo en 163, lo esperado sigue en 30 (no 20)', () => {
    expect(reservasDesdeLaHistoria([fila(conSegundos(VIDEO_MESA_POR_SEGUNDO, 120), 20)], [])).toEqual({ video_mesa: 30 })
    expect(reservasDesdeLaHistoria([{ familia: 'video_mesa', tope_encargo_usd: 20, limites: { reserva_por_pieza_usd: 30 } }], [])).toEqual({ video_mesa: 20 })
  })
})

describe('T7a · el brazo, por llamada', () => {
  it('sin cifra por segundo en la configuración: igual que antes (el menor entre lo pedido y el tope por video)', () => {
    const cfg = configDelBrazo({ tope_por_video_usd: 15 })
    expect(cfg).toMatchObject({ tope_por_video_usd: 15, descuento: null })
    expect(cfg).not.toHaveProperty('tope_por_segundo_usd')
    expect(topeDeLaLlamada(cfg, 8)).toBe(15)
    expect(topeDeLaLlamada(cfg, 8, 4)).toBe(4)
    expect(topeDeLaLlamada(cfg, 8, 40)).toBe(15)
    expect(topeDeLaLlamada(cfg, 8, 0)).toBe(15)
    expect(topeDeLaLlamada(cfg, 8, Number.POSITIVE_INFINITY)).toBe(15)
  })
  it('🔴 con cifra por segundo: un plano de 4 s no puede gastar lo de uno de 15', () => {
    const cfg = configDelBrazo({ tope_por_video_usd: 15, tope_por_segundo_usd: 1 })
    expect(cfg.tope_por_segundo_usd).toBe(1)
    expect(topeDeLaLlamada(cfg, 4)).toBe(4)
    expect(topeDeLaLlamada(cfg, 4, 10)).toBe(4)
    expect(topeDeLaLlamada(cfg, 30)).toBe(15)
    const invalida = configDelBrazo({ tope_por_video_usd: 15, tope_por_segundo_usd: -1 })
    expect(invalida).toMatchObject({ tope_por_video_usd: 15, descuento: null })
    expect(invalida).not.toHaveProperty('tope_por_segundo_usd')
  })
})

describe('T7a · por el motor real, hasta el cierre (la cuenta de 202611170930, ahora con la plantilla por segundo cargada)', () => {
  const PEOR: Record<string, number> = { mesa: 3.6, imagenes_clave: 1, borrador_video: 7.06, imagenes_clave_final: 1, revisar_imagenes_clave: 0.1, video: 15, mirar_video: 0.2, jefatura: 1 }
  function hastaElCierre(pl: Plantilla, rondas: number) {
    let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
    let quedan = rondas
    const hechos: string[] = []
    for (let k = 0; k < 80; k++) {
      const s = siguientePaso(e, pl)
      if (s.accion !== 'ejecutar') return { fin: s, hechos, gasto: Math.round(e.gasto_usd * 100) / 100 }
      const c = s.paso.clave
      e = registrarPaso(e, pl, s.indice, { costo_usd: PEOR[c] ?? 0, artefacto: c === 'aprobar_propuestas' ? { vuelve_a_la_mesa: quedan-- > 0 } : { hay_imagenes: true, ok: true }, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
      hechos.push(c)
    }
    throw new Error('no terminó')
  }
  it('🔴 0 · 1 · 2 rondas llegan a la entrega y al cierre, con los mismos gastos que con los topes fijos (28,76 · 40,42 · 52,08)', () => {
    const pl = aplicarTopesPorDuracion(VIDEO_MESA_POR_SEGUNDO).plantilla
    for (const [r, g] of [[0, 28.76], [1, 40.42], [2, 52.08]] as const) {
      const x = hastaElCierre(pl, r)
      expect(x.fin.accion, `rondas ${r}`).toBe('fin')
      expect(x.hechos.slice(-2)).toEqual(['entrega', 'cierre'])
      expect(x.gasto).toBe(g)
    }
  })
})
