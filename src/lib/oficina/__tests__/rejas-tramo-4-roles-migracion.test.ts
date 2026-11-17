/**
 * 202611171230 · QUITAR REJAS, tramo 4 de CC1 (filas 5 y 11 en lo vivo · GO Lenovo 17-nov): la indicación del curador del carrusel ya no cierra los roles en 9.
 * La migración escribe EXACTAMENTE lo del código, solo esa regla, solo en carrusel_ig_v1; se niega con encargos vivos o si lo viejo no está exacto; la reversa lo devuelve.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { REGLAS_ANTES_DE_1230, indicacionesAntesDe1230 } from './indicacion-antes-de-0800'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const NOMBRE = '202611171230_oficina_rejas_carrusel_roles_libres'
const MIG = leer('migrations', `${NOMBRE}.sql`)
const REV = leer('reversas', `${NOMBRE}_REVERSA.sql`)
const textos = (sql: string, d: string) => [...sql.matchAll(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`, 'g'))].map((m) => m[1])
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const [NUEVA] = Object.keys(REGLAS_ANTES_DE_1230)
const VIEJA = REGLAS_ANTES_DE_1230[NUEVA]
const AG = 'marketing_instagram_curator'
const BORRA = new RegExp(['DEL' + 'ETE', 'TRUN' + 'CATE', 'DR' + 'OP', 'INS' + 'ERT'].map((w) => `\\b${w}\\b`).join('|'))
const aplicar = (ind: Record<string, Array<{ regla: string }>>, de: string, a: string) => {
  const c = JSON.parse(JSON.stringify(ind)) as Record<string, Array<{ regla: string }>>
  c[AG] = c[AG].map((r) => (r.regla === de ? { ...r, regla: a } : r))
  return c
}

describe('el código (plantilla del carrusel)', () => {
  it('🔴 ninguna indicación del carrusel cierra los roles en la lista de 9; el curador los toma de la estructura del manual y el brief, o de la lista de la plantilla', () => {
    expect(JSON.stringify(CARRUSEL_IG_V1.indicaciones)).not.toMatch(/hook, problem, reframe/)
    expect(CARRUSEL_IG_V1.indicaciones[AG].map((r) => r.regla)).toContain(NUEVA)
    expect(NUEVA).toMatch(/si la plantilla trae una lista de roles, solo esos/)
  })
})

describe(`${NOMBRE} · la migración`, () => {
  it('🔴 lo nuevo es EXACTAMENTE lo del código y lo viejo es lo de antes; la reversa, al revés', () => {
    expect(textos(MIG, 'a')).toEqual([NUEVA]); expect(textos(MIG, 'de')).toEqual([VIEJA])
    expect(textos(REV, 'a')).toEqual([VIEJA]); expect(textos(REV, 'de')).toEqual([NUEVA])
    expect(VIEJA).toMatch(/\(hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre\)/)
  })
  it('🔴 aplicada sobre lo de antes deja la plantilla IDÉNTICA al código (solo esa regla, en su lugar); la reversa vuelve a lo de antes', () => {
    const antes = indicacionesAntesDe1230(CARRUSEL_IG_V1.indicaciones) as Record<string, Array<{ regla: string }>>
    expect(antes).not.toEqual(JSON.parse(JSON.stringify(CARRUSEL_IG_V1.indicaciones)))
    const despues = aplicar(antes, VIEJA, NUEVA)
    expect(despues).toEqual(JSON.parse(JSON.stringify(CARRUSEL_IG_V1.indicaciones)))
    expect(aplicar(despues, NUEVA, VIEJA)).toEqual(antes)
  })
  it('🔴 un UPDATE, solo de `indicaciones` del curador, solo del carrusel; guardas ANTES y comprobación DESPUÉS; nada se borra', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
      expect(s).toContain("SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}'")
      expect(s.match(/WHERE familia = 'carrusel_ig_v1';/g)).toHaveLength(1)
      expect(s).not.toMatch(/\b(pasos|limites|tope_encargo_usd|activo|version)\s*=/)
      expect(s).not.toMatch(BORRA)
      const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM 1 THEN']) {
        expect(s.indexOf(g), g).toBeGreaterThan(0)
        expect(s.indexOf(g), g).toBeLessThan(upd)
      }
      expect(s.slice(upd)).toContain('RAISE EXCEPTION')
      expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
      expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
    }
    expect(sentencias(MIG).slice(sentencias(MIG).indexOf('UPDATE'))).toContain("LIKE '%(hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre)%'")
  })
  it('la reversa NO vive en migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, 'migrations', `${NOMBRE}_REVERSA.sql`))).toBe(false)
  })
})
