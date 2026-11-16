/**
 * 202611162300 · S2-3 · la migración de las imágenes clave (CC2 · certifica CC7). Es DATO: escribe EXACTAMENTE la plantilla del código, no pisa (exige el dato
 * ENTERO que dejó 202611111930), se niega con encargos de video vivos, la reversa devuelve lo de antes, y cada guarda va antes de tocar nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOPE_DE_VIDEO_MESA_USD, VIDEO_MESA } from '../plantillas/video-mesa'
import { TOPE_DE_VIDEO_MESA_ANTES_DE_S2_3_USD, VIDEO_MESA_ANTES_DE_S2_3 } from './video-mesa-antes-de-s2-3'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const MIG = leer('migrations', '202611162300_oficina_video_imagen_clave.sql')
const REV = leer('reversas', '202611162300_oficina_video_imagen_clave_REVERSA.sql')
const M1930 = leer('migrations', '202611111930_oficina_video_tope_15_35.sql')
const M1730 = leer('migrations', '202611111730_oficina_un_agente_mira_el_video.sql')
const tomar = (sql: string, d: string) => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

describe('la migración 202611162300', () => {
  it('🔴 escribe EXACTAMENTE el dato del código: pasos, límites (con la calidad por fase), indicaciones y el tope 45', () => {
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA.pasos))
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA.limites))
    expect(tomar(MIG, 'ind')).toEqual(json(VIDEO_MESA.indicaciones))
    expect(sentencias(MIG)).toContain(`tope_encargo_usd = ${TOPE_DE_VIDEO_MESA_USD} WHERE familia = 'video_mesa';`)
  })
  it('🔴 no pisa: exige el dato ENTERO que dejó 202611111930 (pasos, límites, tope 35) y las indicaciones de 202611111730', () => {
    expect(tomar(MIG, 'antes')).toEqual(tomar(M1930, 'pasos'))
    expect(tomar(MIG, 'lim_antes')).toEqual(tomar(M1930, 'lim'))
    expect(tomar(MIG, 'ind_antes')).toEqual(tomar(M1730, 'ind'))
    expect(sentencias(MIG)).toContain(`IS DISTINCT FROM ${TOPE_DE_VIDEO_MESA_ANTES_DE_S2_3_USD}::numeric THEN`)
    // y eso es exactamente la plantilla de código sin lo que agregó S2-3
    expect(tomar(MIG, 'antes')).toEqual(json(VIDEO_MESA_ANTES_DE_S2_3.pasos))
    expect(tomar(MIG, 'lim_antes')).toEqual(json(VIDEO_MESA_ANTES_DE_S2_3.limites))
    expect(tomar(MIG, 'ind_antes')).toEqual(json(VIDEO_MESA_ANTES_DE_S2_3.indicaciones))
  })
  it('🔴 la reversa devuelve todo lo de antes y exige lo que dejó la migración', () => {
    expect(tomar(REV, 'pasos')).toEqual(tomar(MIG, 'antes')); expect(tomar(REV, 'antes')).toEqual(tomar(MIG, 'pasos'))
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes')); expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(tomar(REV, 'ind')).toEqual(tomar(MIG, 'ind_antes')); expect(tomar(REV, 'ind_antes')).toEqual(tomar(MIG, 'ind'))
    expect(sentencias(REV)).toContain(`tope_encargo_usd = ${TOPE_DE_VIDEO_MESA_ANTES_DE_S2_3_USD} WHERE familia = 'video_mesa';`)
    expect(sentencias(REV)).toContain(`IS DISTINCT FROM ${TOPE_DE_VIDEO_MESA_USD}::numeric THEN`)
  })
  it('🔴 cada guarda va ANTES de tocar nada, se niega con encargos de video vivos y la comprobación final va DESPUÉS', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      const update = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      expect(update).toBeGreaterThan(0)
      expect(s.split('UPDATE ').length - 1).toBe(1) // un solo UPDATE: nada más se toca
      for (const g of ["estado IN ('abierto', 'en_paso')", '$antes$', '$lim_antes$', '$ind_antes$', 'tope_encargo_usd FROM public.oficina_tipos_de_grupo']) expect(s.indexOf(g)).toBeLessThan(update)
      expect(s.lastIndexOf('RAISE EXCEPTION')).toBeGreaterThan(update)
      expect(s.trim().startsWith('BEGIN;')).toBe(true)
      expect(s.trim().endsWith('COMMIT;')).toBe(true)
      expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/)
    }
    // la comprobación final de la migración exige los 13 pasos nuevos y el tope 45
    expect(sentencias(MIG)).toContain("ARRAY['abrir','mesa','imagenes_clave','revisar_imagenes_clave','pedido','video','cuadros_video','mirar_video','chequeos','jefatura','chequeos_2','entrega','cierre']")
    expect(sentencias(REV)).toContain("ARRAY['abrir','mesa','pedido','video','cuadros_video','mirar_video','chequeos','jefatura','chequeos_2','entrega','cierre']")
  })
})
