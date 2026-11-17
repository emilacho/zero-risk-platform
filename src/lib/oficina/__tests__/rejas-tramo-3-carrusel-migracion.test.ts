/**
 * 202611171200 · QUITAR REJAS, tramo 3 de CC1 (fila 4 en lo vivo · GO Lenovo 17-nov, Emilio 09:08 «apruebo todo»): las 2 indicaciones del carrusel que pedían
 * el recorte LITERAL del texto del autor. La migración escribe EXACTAMENTE lo del código, solo esas 2 reglas, solo en carrusel_ig_v1; se niega con encargos vivos
 * o si lo viejo no está exacto; la reversa lo devuelve.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { REGLAS_ANTES_DE_1200, indicacionesAntesDe1200 } from './indicacion-antes-de-0800'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const NOMBRE = '202611171200_oficina_rejas_carrusel_texto_del_autor'
const MIG = leer('migrations', `${NOMBRE}.sql`)
const REV = leer('reversas', `${NOMBRE}_REVERSA.sql`)
const textos = (sql: string, d: string) => [...sql.matchAll(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`, 'g'))].map((m) => m[1])
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const reglas = (ag: string) => (CARRUSEL_IG_V1.indicaciones[ag] ?? []).map((r) => r.regla)
const [CC_NUEVA, CD_NUEVA] = Object.keys(REGLAS_ANTES_DE_1200)
const BORRA = new RegExp(['DEL' + 'ETE', 'TRUN' + 'CATE', 'DR' + 'OP', 'INS' + 'ERT'].map((w) => `\\b${w}\\b`).join('|'))

const aplicar = (ind: Record<string, Array<{ regla: string }>>, cambios: Array<[string, string, string]>) => {
  const c = JSON.parse(JSON.stringify(ind)) as Record<string, Array<{ regla: string }>>
  for (const [ag, de, a] of cambios) c[ag] = c[ag].map((r) => (r.regla === de ? { ...r, regla: a } : r))
  return c
}

describe('el código (plantilla del carrusel)', () => {
  it('🔴 ninguna indicación del carrusel pide el recorte LITERAL; el diseñador puede ajustar palabras sin cambiar lo que dice ni agregar datos', () => {
    expect(JSON.stringify(CARRUSEL_IG_V1.indicaciones)).not.toMatch(/LITERALMENTE|trozo exacto de lo que escribió/)
    expect(reglas('content-creator')).toContain(CC_NUEVA)
    expect(reglas('carousel-designer')).toContain(CD_NUEVA)
    expect(CD_NUEVA).toMatch(/sin cambiar lo que dice ni agregar datos, cifras o promesas/)
  })
})

describe(`${NOMBRE} · la migración`, () => {
  it('🔴 lo nuevo es EXACTAMENTE lo del código y lo viejo es lo de antes; la reversa, al revés', () => {
    expect(new Set(textos(MIG, 'a'))).toEqual(new Set([CC_NUEVA, CD_NUEVA]))
    expect(new Set(textos(MIG, 'de'))).toEqual(new Set(Object.values(REGLAS_ANTES_DE_1200)))
    expect(new Set(textos(REV, 'de'))).toEqual(new Set([CC_NUEVA, CD_NUEVA]))
    expect(new Set(textos(REV, 'a'))).toEqual(new Set(Object.values(REGLAS_ANTES_DE_1200)))
    for (const v of Object.values(REGLAS_ANTES_DE_1200)) expect(v).toMatch(/LITERALMENTE/)
  })
  it('🔴 aplicada sobre lo de antes deja la plantilla IDÉNTICA al código (solo esas 2 reglas, en su lugar); la reversa vuelve a lo de antes', () => {
    const antes = indicacionesAntesDe1200(CARRUSEL_IG_V1.indicaciones) as Record<string, Array<{ regla: string }>>
    expect(antes).not.toEqual(JSON.parse(JSON.stringify(CARRUSEL_IG_V1.indicaciones)))
    const despues = aplicar(antes, [['content-creator', REGLAS_ANTES_DE_1200[CC_NUEVA], CC_NUEVA], ['carousel-designer', REGLAS_ANTES_DE_1200[CD_NUEVA], CD_NUEVA]])
    expect(despues).toEqual(JSON.parse(JSON.stringify(CARRUSEL_IG_V1.indicaciones)))
    expect(aplicar(despues, [['content-creator', CC_NUEVA, REGLAS_ANTES_DE_1200[CC_NUEVA]], ['carousel-designer', CD_NUEVA, REGLAS_ANTES_DE_1200[CD_NUEVA]]])).toEqual(antes)
  })
  it('🔴 dos UPDATE, solo de `indicaciones` de esos 2 agentes, solo del carrusel; guardas ANTES y comprobación DESPUÉS; nada se borra', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      expect(s.match(/\bUPDATE\b/g)).toHaveLength(2)
      expect(s).toContain("SET indicaciones = jsonb_set(indicaciones, '{content-creator}'")
      expect(s).toContain("SET indicaciones = jsonb_set(indicaciones, '{carousel-designer}'")
      expect(s.match(/WHERE familia = 'carrusel_ig_v1';/g)).toHaveLength(2)
      expect(s).not.toMatch(/\b(pasos|limites|tope_encargo_usd|activo|version)\s*=/)
      expect(s).not.toMatch(BORRA)
      const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
      for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM 1 THEN']) {
        expect(s.indexOf(g), g).toBeGreaterThan(0)
        expect(s.indexOf(g), g).toBeLessThan(upd)
      }
      expect(s.slice(s.lastIndexOf('UPDATE'))).toContain('RAISE EXCEPTION')
      expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
      expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
    }
    expect(sentencias(MIG).slice(sentencias(MIG).lastIndexOf('UPDATE'))).toContain("LIKE '%LITERALMENTE%'")
  })
  it('la reversa NO vive en migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, 'migrations', `${NOMBRE}_REVERSA.sql`))).toBe(false)
  })
})
