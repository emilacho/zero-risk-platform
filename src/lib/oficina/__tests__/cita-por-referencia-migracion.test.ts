/**
 * 202611170800 · la indicación del director visual pide la referencia (fuente + campo), no la cita literal (CC1 · GO creativos punto 5 · certifica CC6).
 * La migración escribe EXACTAMENTE la regla del código, solo en las 3 plantillas con director visual, solo esa regla; se niega con encargos vivos o si la regla vieja
 * no está exacta; la reversa devuelve la vieja.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { POST_IMG } from '../plantillas/post-img'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611170800_oficina_cita_por_referencia.sql')
const REV = leer('reversas', '202611170800_oficina_cita_por_referencia_REVERSA.sql')
const VIEJA = 'Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.'
const textos = (sql: string, d: string) => [...sql.matchAll(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`, 'g'))].map((m) => m[1])
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const reglaDelCodigo = POST_IMG.indicaciones.marketing_instagram_curator[0].regla

describe('el código', () => {
  it('🔴 la regla del director visual pide referencia (fuente + campo), dice que lo no comprobable se usa marcado, y ya no pide la cita literal', () => {
    expect(reglaDelCodigo).toMatch(/su referencia: la fuente \(brief, hoja, gran idea, manual o plan\) y el campo/)
    expect(reglaDelCodigo).toMatch(/se usa igual, marcado/)
    expect(reglaDelCodigo).not.toMatch(/cita literal/)
    expect(POST_IMG.indicaciones.marketing_instagram_curator[0].aplica).toBe('codigo:citas_existen')
  })
  it('las 3 plantillas con director visual la heredan (la misma regla, en el mismo lugar)', () => {
    for (const p of [CARRUSEL_IG_V1, KIT_HISTORIAS]) expect(p.indicaciones.marketing_instagram_curator[0]).toEqual(POST_IMG.indicaciones.marketing_instagram_curator[0])
  })
  it('ningún texto del código le pide al agente una cita literal', () => {
    const json = JSON.stringify([POST_IMG.indicaciones, CARRUSEL_IG_V1.indicaciones, KIT_HISTORIAS.indicaciones])
    expect(json).not.toMatch(/cita literal|copia LITERAL/i)
  })
})

describe('202611170800 · la migración', () => {
  it('🔴 la regla nueva es EXACTAMENTE la del código; la vieja es la que hoy está viva (la de las migraciones de octubre)', () => {
    expect(new Set(textos(MIG, 'nueva'))).toEqual(new Set([reglaDelCodigo]))
    expect(new Set(textos(MIG, 'vieja'))).toEqual(new Set([VIEJA]))
    expect(leer('migrations', '202610141000_oficina_paso_jefatura.sql')).toContain(VIEJA)
  })
  it('🔴 un solo UPDATE, solo de `indicaciones`, solo de las 3 familias; con las guardas ANTES y la comprobación DESPUÉS; nada se borra', () => {
    const s = sentencias(MIG)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s).toMatch(/UPDATE public\.oficina_tipos_de_grupo\nSET indicaciones = jsonb_set\(indicaciones, '\{marketing_instagram_curator\}'/)
    expect(s).toContain("WHERE familia IN ('post_img', 'carrusel_ig_v1', 'kit_historias');")
    expect(s).not.toMatch(/\b(pasos|limites|tope_encargo_usd|activo)\s*=/)
    expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP|INSERT)\b/)
    const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
    for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM 3 THEN']) {
      expect(s.indexOf(g), g).toBeGreaterThan(0)
      expect(s.indexOf(g), g).toBeLessThan(upd)
    }
    expect(s.slice(upd)).toContain("LIKE '%cita literal del brief%'")
    expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
  it('🔴 solo cambia ESA regla: las demás del director visual se conservan en su orden', () => {
    expect(MIG).toContain("ELSE r END ORDER BY o)")
    expect(MIG).toContain('WITH ORDINALITY AS t(r, o)')
  })
  it('la reversa es el espejo: exige la nueva en las 3 y devuelve la vieja', () => {
    const s = sentencias(REV)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(new Set(textos(REV, 'nueva'))).toEqual(new Set([reglaDelCodigo]))
    expect(new Set(textos(REV, 'vieja'))).toEqual(new Set([VIEJA]))
    const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
    expect(s.slice(0, upd)).toContain(`r->>'regla' = $nueva$`)
    expect(s.slice(upd)).toContain(`THEN jsonb_set(r, '{regla}', to_jsonb($vieja$`)
  })
})
