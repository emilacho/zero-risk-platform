/**
 * 202611170830 · el borrador en video de video_mesa reserva US$ 10 (no 20) · CC1 · DECISIÓN Lenovo 17-nov (respuesta al ⚠️ de CC6 sobre #1087) · certifica CC6.
 * Cuenta por el MOTOR REAL (`siguientePaso`/`registrarPaso`) en el peor caso de CC6 (mesa 3,6 · imágenes 1 · borrador 7,06 · imágenes finales 1 · revisión 0,05 · video 13):
 * 0 y 1 ronda entregan; con 2 rondas el 3.er borrador YA entra (con 20 no), pero el encargo se corta ANTES del video (36,03 + 15 > 45) · eso va en la PREGUNTA a Lenovo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { registrarPaso, siguientePaso } from '../motor'
import { TOPE_DEL_BORRADOR_DE_VIDEO_USD, VIDEO_MESA_ENCENDIDA } from '../plantillas/video-mesa'
import type { Estado, Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611170830_oficina_video_borrador_tope_10.sql')
const REV = leer('reversas', '202611170830_oficina_video_borrador_tope_10_REVERSA.sql')
const M0720 = leer('migrations', '202611170720_oficina_video_encendido_sprint2.sql')
const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

const PEOR: Record<string, number> = { mesa: 3.6, imagenes_clave: 1, borrador_video: 7.06, imagenes_clave_final: 1, revisar_imagenes_clave: 0.05, video: 13, mirar_video: 0.05 }
function porElMotor(pl: Plantilla, rondas: number) {
  let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
  let quedan = rondas
  const hechos: string[] = []
  for (let k = 0; k < 80; k++) {
    const s = siguientePaso(e, pl)
    if (s.accion !== 'ejecutar') return { fin: s, hechos, gasto: Math.round(e.gasto_usd * 100) / 100 }
    const c = s.paso.clave
    const datos = c === 'aprobar_propuestas' ? { vuelve_a_la_mesa: quedan-- > 0 } : { hay_imagenes: true, ok: true }
    e = registrarPaso(e, pl, s.indice, { costo_usd: PEOR[c] ?? 0, artefacto: datos, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
    hechos.push(c)
  }
  throw new Error('no terminó')
}
/** el estado que dejó 0830: el encargo en 45 (202611170930 lo subió a 58; esa cuenta vive en `techo-60-y-video-58.test.ts`) */
const EN_45: Plantilla = { ...VIDEO_MESA_ENCENDIDA, limites: { ...VIDEO_MESA_ENCENDIDA.limites, tope_encargo_usd: 45 } }
const conBorrador = (t: number): Plantilla => ({ ...EN_45, pasos: VIDEO_MESA_ENCENDIDA.pasos.map((p) => (p.clave === 'borrador_video' ? { ...p, tope_usd: t } : p)) })
const veces = (h: string[], c: string) => h.filter((x) => x === c).length

describe('el borrador reserva 10, por el motor real (peor caso de CC6)', () => {
  it('🔴 el código: el paso borrador_video reserva 10; el video en 15 (el encargo, 58 desde 0930)', () => {
    expect(TOPE_DEL_BORRADOR_DE_VIDEO_USD).toBe(10)
    expect(VIDEO_MESA_ENCENDIDA.pasos.find((p) => p.clave === 'borrador_video')!.tope_usd).toBe(10)
    expect(VIDEO_MESA_ENCENDIDA.pasos.find((p) => p.clave === 'video')!.tope_usd).toBe(15)
    expect(VIDEO_MESA_ENCENDIDA.limites.tope_encargo_usd).toBe(58)
  })
  it('🔴 0 y 1 ronda de cambios del dueño: entrega con el video (25,71 y 37,37)', () => {
    for (const [r, g] of [[0, 25.71], [1, 37.37]] as const) {
      const x = porElMotor(EN_45, r)
      expect(x.fin.accion, `rondas ${r}`).toBe('fin')
      expect(x.hechos).toContain('video')
      expect(veces(x.hechos, 'borrador_video')).toBe(r + 1)
      expect(x.gasto).toBe(g)
    }
  })
  it('🔴 2 rondas: con 20 se cortaba ANTES del 3.er borrador (esperando al dueño); con 10 el 3.er borrador SÍ se hace', () => {
    const con20 = porElMotor(conBorrador(20), 2)
    expect(con20.fin).toMatchObject({ accion: 'cierre_por_tope', razon: 'tope_de_gasto' })
    expect(veces(con20.hechos, 'borrador_video')).toBe(2)
    const con10 = porElMotor(EN_45, 2)
    expect(veces(con10.hechos, 'borrador_video')).toBe(3)
    expect(veces(con10.hechos, 'aprobar_propuestas')).toBe(3)
  })
  it('⚠️ (para la PREGUNTA a Lenovo) 2 rondas con 10: se corta ANTES del video, 36,03 + 15 > 45 · no se esconde', () => {
    const x = porElMotor(EN_45, 2)
    expect(x.fin).toMatchObject({ accion: 'cierre_por_tope', razon: 'tope_de_gasto' })
    expect('detalle' in x.fin && x.fin.detalle).toBe('gasto 36.0300 + tope del paso «video» 15 > 45')
    expect(x.hechos).not.toContain('video')
  })
})

describe('202611170830 · la migración', () => {
  it('🔴 de los pasos EXACTOS de 0720 a los EXACTOS del código; solo cambia el tope del borrador (20 → 10)', () => {
    expect(tomar(MIG, 'pasos_antes')).toEqual(tomar(M0720, 'pasos'))
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA_ENCENDIDA.pasos))
    expect(tomar(MIG, 'lim')).toEqual(json(EN_45.limites))
    expect(tomar(MIG, 'lim')).toEqual(tomar(M0720, 'lim'))
    const antes = tomar(MIG, 'pasos_antes') as Array<{ clave: string; tope_usd: number }>
    const despues = tomar(MIG, 'pasos') as Array<{ clave: string; tope_usd: number }>
    const cambian = antes.filter((p, i) => JSON.stringify(p) !== JSON.stringify(despues[i])).map((p) => p.clave)
    expect(cambian).toEqual(['borrador_video'])
    expect([antes.find((p) => p.clave === 'borrador_video')!.tope_usd, despues.find((p) => p.clave === 'borrador_video')!.tope_usd]).toEqual([20, 10])
  })
  it('🔴 un solo UPDATE, solo de pasos de video_mesa; guardas (vivos · pasos · límites · tope 45) ANTES; comprobación después; nada se borra ni se activa', () => {
    const s = sentencias(MIG)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s).toMatch(/UPDATE public\.oficina_tipos_de_grupo SET pasos = \$pasos\$[^\n]*\$pasos\$::jsonb WHERE familia = 'video_mesa';/)
    const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
    for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM $pasos_antes$', 'IS DISTINCT FROM $lim$', 'IS DISTINCT FROM 45::numeric THEN']) {
      expect(s.indexOf(g), g).toBeGreaterThan(0)
      expect(s.indexOf(g), g).toBeLessThan(upd)
    }
    expect(s.slice(upd)).toContain("WHERE p->>'clave' = 'borrador_video'")
    expect(s.slice(upd)).toContain('IS DISTINCT FROM 10::numeric THEN')
    expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP|INSERT)\b|familias_activas|limites\s*=|tope_encargo_usd\s*=|activo\s*=/)
    expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
  it('la reversa es el espejo: exige los de hoy y devuelve los EXACTOS de 0720 (borrador 20)', () => {
    expect(tomar(REV, 'pasos_antes')).toEqual(json(VIDEO_MESA_ENCENDIDA.pasos))
    expect(tomar(REV, 'pasos')).toEqual(tomar(M0720, 'pasos'))
    const s = sentencias(REV)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s.slice(s.indexOf('UPDATE'))).toContain('IS DISTINCT FROM 20::numeric THEN')
  })
})
