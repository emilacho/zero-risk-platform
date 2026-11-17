/**
 * 202611171215 · RESPUESTA Lenovo 17-nov (punto 6 + fila 9): los largos de la lámina del carrusel son DATO de la plantilla. La migración agrega SOLO la clave
 * `largos_de_lamina` (igual a la del código) a `limites` de carrusel_ig_v1; se niega con vivos o si ya está; la reversa la quita.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { limitesAntesDe1215 } from './indicacion-antes-de-0800'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const NOMBRE = '202611171215_oficina_carrusel_largos_de_lamina'
const MIG = leer('migrations', `${NOMBRE}.sql`)
const REV = leer('reversas', `${NOMBRE}_REVERSA.sql`)
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const BORRA = new RegExp(['DEL' + 'ETE', 'TRUN' + 'CATE', 'DR' + 'OP', 'INS' + 'ERT'].map((w) => `\\b${w}\\b`).join('|'))
const JSONB = (sql: string) => [...sql.matchAll(/'(\{[^']*\})'::jsonb/g)].map((m) => JSON.parse(m[1]))

describe(`${NOMBRE}`, () => {
  it('🔴 el valor de la migración (y de la reversa) es EXACTAMENTE el del código', () => {
    for (const sql of [MIG, REV]) {
      const vs = JSONB(sql)
      expect(vs.length).toBeGreaterThan(0)
      for (const v of vs) expect(v).toEqual(CARRUSEL_IG_V1.limites.largos_de_lamina)
    }
  })
  it('🔴 la mesa NO hereda los largos (sin tope de caracteres); lo demás de los límites del carrusel, igual que antes', () => {
    expect(CARRUSEL_MESA.limites.largos_de_lamina).toBeUndefined()
    expect(Object.keys(limitesAntesDe1215(CARRUSEL_IG_V1.limites) as object)).not.toContain('largos_de_lamina')
  })
  it('🔴 un UPDATE, solo de `limites` y solo de esa clave, solo del carrusel; guardas ANTES y comprobación DESPUÉS; nada se borra', () => {
    const m = sentencias(MIG), r = sentencias(REV)
    for (const s of [m, r]) {
      expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
      expect(s.match(/WHERE familia = 'carrusel_ig_v1';/g)).toHaveLength(1)
      expect(s).not.toMatch(/\b(pasos|indicaciones|tope_encargo_usd|activo|version)\s*=/)
      expect(s).not.toMatch(BORRA)
      const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      expect(s.indexOf("IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN")).toBeLessThan(upd)
      expect(s.slice(upd)).toContain('RAISE EXCEPTION')
      expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
      expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
    }
    expect(m).toContain("SET limites = limites || jsonb_build_object('largos_de_lamina', ")
    expect(m.slice(0, m.indexOf('UPDATE'))).toContain("NOT (limites ? 'largos_de_lamina')")
    expect(r).toContain("SET limites = limites - 'largos_de_lamina'")
  })
  it('la reversa NO vive en migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, 'migrations', `${NOMBRE}_REVERSA.sql`))).toBe(false)
  })
})
