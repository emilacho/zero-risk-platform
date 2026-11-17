/**
 * 202611171130 · QUITAR REJAS, tramo 2 de CC1 (filas 6 y 7 de la auditoría · GO Lenovo 17-nov, Emilio 09:08 «apruebo todo»):
 *  · curador: «No inventes marcas, rostros…» prohibía los rostros GENERADOS (Emilio los permitió el 16-nov) → queda la ley: la cara real identificable solo con permiso;
 *  · ingeniero de prompts: sin «fotógrafos» (el estilo no es reja); siguen marcas de otro negocio y personas reales.
 * La migración escribe EXACTAMENTE lo del código, solo esas 2 reglas, solo en las 3 plantillas; se niega con encargos vivos o si lo viejo no está exacto; la reversa lo devuelve.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { POST_IMG } from '../plantillas/post-img'
import { REGLAS_ANTES_DE_1130, indicacionesAntesDe1130 } from './indicacion-antes-de-0800'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const NOMBRE = '202611171130_oficina_rejas_indicaciones_rostros_y_fotografos'
const MIG = leer('migrations', `${NOMBRE}.sql`)
const REV = leer('reversas', `${NOMBRE}_REVERSA.sql`)
const textos = (sql: string, d: string) => [...sql.matchAll(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`, 'g'))].map((m) => m[1])
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const curador = POST_IMG.indicaciones.marketing_instagram_curator.map((r) => r.regla)
const ingeniero = POST_IMG.indicaciones['design-image-prompt-engineer'].map((r) => r.regla)
const CUR_NUEVA = 'No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.'
const ING_NUEVA = 'No nombres marcas de otro negocio ni personas reales identificables.'
const BORRA = new RegExp(['DEL' + 'ETE', 'TRUN' + 'CATE', 'DR' + 'OP', 'INS' + 'ERT'].map((w) => `\\b${w}\\b`).join('|'))

/** aplica en JS lo que hace el UPDATE: reemplaza la regla exacta `de` por `a` en ese agente, en su lugar */
const aplicar = (ind: Record<string, Array<{ regla: string }>>, cambios: Array<[string, string, string]>) => {
  const c = JSON.parse(JSON.stringify(ind)) as Record<string, Array<{ regla: string }>>
  for (const [ag, de, a] of cambios) c[ag] = c[ag].map((r) => (r.regla === de ? { ...r, regla: a } : r))
  return c
}

describe('el código (las 3 plantillas con curador e ingeniero de prompts)', () => {
  it('🔴 el curador ya no prohíbe «rostros»: dice la ley (cara real identificable solo con permiso) y que los generados sí', () => {
    expect(curador).toContain(CUR_NUEVA)
    expect(JSON.stringify(curador)).not.toMatch(/No inventes marcas, rostros/)
  })
  it('🔴 el ingeniero de prompts ya no prohíbe nombrar «fotógrafos»; siguen marcas de otro negocio y personas reales', () => {
    expect(ingeniero).toContain(ING_NUEVA)
    expect(JSON.stringify(ingeniero)).not.toMatch(/fotógrafos/)
  })
  it('carrusel e historias heredan las mismas reglas', () => {
    for (const p of [CARRUSEL_IG_V1, KIT_HISTORIAS]) {
      expect(p.indicaciones.marketing_instagram_curator.map((r) => r.regla)).toContain(CUR_NUEVA)
      expect(p.indicaciones['design-image-prompt-engineer'].map((r) => r.regla)).toContain(ING_NUEVA)
    }
  })
})

describe(`${NOMBRE} · la migración`, () => {
  it('🔴 lo nuevo es EXACTAMENTE lo del código y lo viejo es lo de antes (el par que deshace la ayuda de las pruebas viejas)', () => {
    expect(new Set(textos(MIG, 'a'))).toEqual(new Set([CUR_NUEVA, ING_NUEVA]))
    expect(new Set(textos(MIG, 'de'))).toEqual(new Set(Object.values(REGLAS_ANTES_DE_1130)))
    expect(REGLAS_ANTES_DE_1130[CUR_NUEVA]).toBe('No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.')
    expect(REGLAS_ANTES_DE_1130[ING_NUEVA]).toBe('No nombres marcas, fotógrafos ni personas reales.')
    // la reversa: de lo nuevo EXACTO a lo viejo EXACTO
    expect(new Set(textos(REV, 'de'))).toEqual(new Set([CUR_NUEVA, ING_NUEVA]))
    expect(new Set(textos(REV, 'a'))).toEqual(new Set(Object.values(REGLAS_ANTES_DE_1130)))
  })
  it('🔴 aplicada sobre lo de antes, deja cada plantilla IDÉNTICA al código (solo esas 2 reglas, en su lugar); la reversa vuelve a lo de antes', () => {
    for (const p of [POST_IMG, CARRUSEL_IG_V1, KIT_HISTORIAS]) {
      const antes = indicacionesAntesDe1130(p.indicaciones) as Record<string, Array<{ regla: string }>>
      expect(antes).not.toEqual(JSON.parse(JSON.stringify(p.indicaciones)))
      const despues = aplicar(antes, [['marketing_instagram_curator', REGLAS_ANTES_DE_1130[CUR_NUEVA], CUR_NUEVA], ['design-image-prompt-engineer', REGLAS_ANTES_DE_1130[ING_NUEVA], ING_NUEVA]])
      expect(despues).toEqual(JSON.parse(JSON.stringify(p.indicaciones)))
      expect(aplicar(despues, [['marketing_instagram_curator', CUR_NUEVA, REGLAS_ANTES_DE_1130[CUR_NUEVA]], ['design-image-prompt-engineer', ING_NUEVA, REGLAS_ANTES_DE_1130[ING_NUEVA]]])).toEqual(antes)
    }
  })
  it('🔴 dos UPDATE, solo de `indicaciones` de esos 2 agentes, solo de las 3 familias; guardas ANTES y comprobación DESPUÉS; nada se borra', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      expect(s.match(/\bUPDATE\b/g)).toHaveLength(2)
      expect(s).toContain("SET indicaciones = jsonb_set(indicaciones, '{marketing_instagram_curator}'")
      expect(s).toContain("SET indicaciones = jsonb_set(indicaciones, '{design-image-prompt-engineer}'")
      expect(s.match(/WHERE familia IN \('post_img', 'carrusel_ig_v1', 'kit_historias'\);/g)).toHaveLength(2)
      expect(s).not.toMatch(/\b(pasos|limites|tope_encargo_usd|activo|version)\s*=/)
      expect(s).not.toMatch(BORRA)
      const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM 3']) {
        expect(s.indexOf(g), g).toBeGreaterThan(0)
        expect(s.indexOf(g), g).toBeLessThan(upd)
      }
      expect(s.slice(s.lastIndexOf('UPDATE'))).toContain('RAISE EXCEPTION')
      expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
      expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
    }
  })
  it('🔴 la comprobación final de la migración busca lo viejo con LIKE (no puede quedar ni una copia) y la de la reversa, lo nuevo', () => {
    const fin = (sql: string) => sentencias(sql).slice(sentencias(sql).lastIndexOf('UPDATE'))
    expect(fin(MIG)).toContain("LIKE '%No inventes marcas, rostros%'")
    expect(fin(MIG)).toContain("LIKE '%fotógrafos ni personas reales%'")
    expect(fin(REV)).toContain("LIKE '%No nombres marcas de otro negocio ni personas reales identificables%'")
  })
  it('la reversa NO vive en migrations (una herramienta la correría sola)', () => {
    expect(fs.existsSync(path.join(RAIZ, 'migrations', `${NOMBRE}_REVERSA.sql`))).toBe(false)
  })
})
