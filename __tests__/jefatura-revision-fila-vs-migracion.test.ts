/**
 * JEFATURA como oficina propia · J2 · las 6 filas de política que usan las pruebas (`FILAS_DE_POLITICA`) coinciden con las que SIEMBRA la migración J1 (`202610131000`).
 * Si la migración no está en esta rama (J1 y J2 son PR distintos), la prueba se SALTA; apenas J1 llega a main, queda obligatoria: una fila que cambia en un lado y no en el otro se pone en rojo.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { politicaDeFila } from '../src/lib/jefatura/revision/politicas'
import { FILAS_DE_POLITICA } from './_helpers/jefatura-revision'

const RUTA = resolve(__dirname, '..', 'supabase', 'migrations', '202610131000_jefatura_revision_oficina_propia.sql')
const hay = existsSync(RUTA)
const SQL = hay ? readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n') : ''
const bloque = SQL.slice(SQL.indexOf('INSERT INTO public.jefatura_grading_policies'))
const fila = (t: string): string => {
  const m = new RegExp(String.raw`^\s*\('${t}', 'revision'`, 'm').exec(bloque)
  if (!m) return ''
  const resto = bloque.slice(m.index + m[0].length)
  const j = resto.search(/^\s*\('\w+', 'revision'/m)
  return m[0] + (j < 0 ? resto.slice(0, resto.indexOf('ON CONFLICT')) : resto.slice(0, j))
}
const json = (s: string, etiqueta: string): unknown => { const m = new RegExp(String.raw`\$${etiqueta}\$([\s\S]*?)\$${etiqueta}\$`).exec(s); return m ? JSON.parse(m[1]) : null }

describe.skipIf(!hay)('filas de prueba = filas de la migración J1', () => {
  for (const t of ['plan', 'estrategia', 'calendario', 'brief', 'pieza']) {
    it(`${t}: mismos topes, destino, re-entrega, esquema, productores, contexto, huecos y línea de contexto`, () => {
      const f = fila(t)
      const p = FILAS_DE_POLITICA[t]
      expect(f.length).toBeGreaterThan(100)
      expect(json(f, 'tp')).toEqual(p.tope_paso_usd)
      expect(json(f, 'pr')).toEqual(p.productores)
      expect(json(f, 'cq')).toEqual(p.contra_que)
      expect(json(f, 'hp')).toEqual(p.huecos_pregunta)
      expect(f).toMatch(new RegExp(String.raw`ARRAY\[${(p.chequeos_previos as string[]).map((c) => `'${c}'`).join(',')}\], ${Number(p.tope_revision_usd).toFixed(2)},`))
      expect(f).toContain(`'${String(p.destino_cierre)}', '${String(p.reentrega)}')`)
      expect(f).toContain(p.esquema_correccion ? `'${String(p.esquema_correccion)}'` : 'NULL,\n   $hp$')
      expect(f).toContain(`'${String(p.revisor_fondo)}', true, 'JEFATURA_REVISOR_MODEL'`)
      const linea = /\n   (?:'([^']*)'|\$ind\$([\s\S]*?)\$ind\$),\n   ARRAY\[/.exec(f)
      expect(linea?.[1] ?? linea?.[2]).toBe(p.indicacion_fondo)
    })
  }
  it('el manual es la fila apagada sin revisor, y las 6 son de clase revision y nacen inactivas', () => {
    expect(fila('manual')).toContain("NULL, false, NULL, NULL, '[]'::jsonb")
    expect(politicaDeFila({ ...FILAS_DE_POLITICA.manual }).ok).toBe(false)
    for (const t of ['plan', 'estrategia', 'calendario', 'brief', 'pieza', 'manual']) expect(fila(t)).toMatch(/'revision', true, false, 'par_fondo_y_ciego', NULL, 1, NULL, NULL,\s*'[^']*', false,/)
  })
})

describe('el contrato se sostiene sin la migración', () => {
  it('las 5 filas de prueba son políticas válidas', () => { for (const t of ['plan', 'estrategia', 'calendario', 'brief', 'pieza']) expect(politicaDeFila({ ...FILAS_DE_POLITICA[t] }).ok, t).toBe(true) })
})
