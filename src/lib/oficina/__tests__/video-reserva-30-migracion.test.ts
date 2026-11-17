/**
 * 202611170520 · lo esperado por video para el freno de la campaña 12 → 30 (CC1 · DECISION Lenovo 17-nov 05:07 + CORRECCIÓN 05:16 · certifica CC6).
 * Es DATO: escribe EXACTAMENTE los límites del código, no pisa (exige el `limites` ENTERO que dejó 202611162300 y el tope 45), se niega con encargos vivos,
 * la reversa devuelve lo de antes, y SOLO cambia la reserva: ni los pasos, ni el tope del encargo (45), ni el del video (15) — el motor reserva el tope
 * ENTERO de cada paso contra lo que queda del encargo (`motor.ts`), así que esos no se tocan sin su propia cuenta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESERVA_POR_VIDEO_USD, TOPE_DE_VIDEO_MESA_USD, TOPE_DEL_PASO_VIDEO_USD, VIDEO_MESA } from '../plantillas/video-mesa'
import { RESERVA_POR_VIDEO_ANTES_DE_30_USD, VIDEO_MESA_ANTES_DE_RESERVA_30 } from './video-mesa-antes-de-reserva-30'
import { reservasDesdeLaHistoria } from '../gasto-de-encargos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const MIG = leer('migrations', '202611170520_oficina_video_reserva_30.sql')
const REV = leer('reversas', '202611170520_oficina_video_reserva_30_REVERSA.sql')
const M2300 = leer('migrations', '202611162300_oficina_video_imagen_clave.sql')
const tomar = (sql: string, d: string) => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
/** las guardas que tienen que ESTAR y estar ANTES del único UPDATE (un -1 de «no está» no cuenta como «antes») */
const GUARDAS = [
  "IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN",
  'IS DISTINCT FROM $lim_antes$',
  "IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN",
]

describe('la plantilla de código · reserva 30, el resto igual', () => {
  it('🔴 la reserva es 30; el tope del encargo sigue en 45 y el del video en 15', () => {
    expect(RESERVA_POR_VIDEO_USD).toBe(30)
    expect(RESERVA_POR_VIDEO_ANTES_DE_30_USD).toBe(12)
    expect(TOPE_DE_VIDEO_MESA_USD).toBe(45)
    expect(TOPE_DEL_PASO_VIDEO_USD).toBe(15)
    expect(VIDEO_MESA.limites).toMatchObject({ tope_encargo_usd: 45, reserva_por_pieza_usd: 30, video: { tope_por_video_usd: 15 } })
    expect(VIDEO_MESA.pasos.find((p) => p.funcion === 'video')?.tope_usd).toBe(15)
  })
  it('🔴 sin historia, el freno de la campaña espera 30 por video (no el tope de 45)', () => {
    const fila = { familia: 'video_mesa', tope_encargo_usd: 45, limites: tomar(MIG, 'lim') }
    expect(reservasDesdeLaHistoria([fila], [])).toEqual({ video_mesa: 30 })
  })
})

describe('la migración 202611170520', () => {
  it('🔴 escribe EXACTAMENTE los límites del código', () => {
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA.limites))
  })
  it('🔴 no pisa: exige el `limites` ENTERO que dejó 202611162300 (con la reserva 12) y el tope 45', () => {
    expect(tomar(MIG, 'lim_antes')).toEqual(tomar(M2300, 'lim'))
    expect(tomar(MIG, 'lim_antes')).toEqual(json(VIDEO_MESA_ANTES_DE_RESERVA_30.limites))
    expect(sentencias(MIG)).toContain('IS DISTINCT FROM 45::numeric THEN')
  })
  it('🔴 SOLO cambia la reserva: lo de antes y lo de después difieren en esa clave y en nada más', () => {
    const a = tomar(MIG, 'lim_antes') as Record<string, unknown>, d = tomar(MIG, 'lim') as Record<string, unknown>
    expect(a.reserva_por_pieza_usd).toBe(12)
    expect(d.reserva_por_pieza_usd).toBe(30)
    expect({ ...d, reserva_por_pieza_usd: 12 }).toEqual(a)
    const s = sentencias(MIG)
    expect(s).not.toMatch(/\bpasos\s*=/)
    expect(s).not.toMatch(/tope_encargo_usd\s*=/)
    expect(s).not.toMatch(/cadena_config/)
    expect(s).not.toMatch(/CONSTRAINT/)
  })
  it('🔴 la reversa devuelve lo de antes y exige lo que dejó la migración', () => {
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes'))
    expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(sentencias(REV)).toContain('IS DISTINCT FROM 12::numeric')
  })
  it('🔴 cada guarda ESTÁ y va ANTES de tocar nada, se niega con encargos vivos y la comprobación final va DESPUÉS', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      const update = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      expect(update).toBeGreaterThan(0)
      expect(s.split('UPDATE ').length - 1).toBe(1) // un solo UPDATE: nada más se toca
      expect(s).toContain("WHERE familia = 'video_mesa';")
      for (const g of GUARDAS) {
        const i = s.indexOf(g)
        expect(i, g).toBeGreaterThan(0)
        expect(i, g).toBeLessThan(update)
      }
      expect(s.lastIndexOf('RAISE EXCEPTION')).toBeGreaterThan(update)
      expect(s.trim().startsWith('BEGIN;')).toBe(true)
      expect(s.trim().endsWith('COMMIT;')).toBe(true)
      expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/)
    }
    expect(sentencias(MIG)).toContain('IS DISTINCT FROM 30::numeric')
  })
})
