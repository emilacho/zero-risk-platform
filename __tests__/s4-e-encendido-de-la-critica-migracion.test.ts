/**
 * Sprint 4 · E · el ENCENDIDO de la crítica es DATO (dos migraciones + sus reversas). Lo que se prueba sin base:
 *  - las marcas que escribe la migración son las que el código lee (`criticoDe` en cada tipo de pieza, ninguna en `concepto` hasta la segunda);
 *  - la tarjeta critica y NO aporta en esos tipos (observación de CC7);
 *  - la de la gran idea frena si el tope de `concepto_mesa` sigue en 7 y va después de la de piezas;
 *  - las reversas dejan la fila como se leyó en vivo (apagada, sin marcas).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { criticoDe, especialistasPertinentes } from '@/lib/oficina/mesa/directorio'
import type { Tarjeta } from '@/lib/oficina/mesa/tipos'

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PIEZAS = leer('supabase/migrations/202611172120_oficina_directorio_critica_en_las_piezas.sql')
const CONCEPTO = leer('supabase/migrations/202611172210_oficina_directorio_critica_en_la_gran_idea.sql')
const REV_PIEZAS = leer('supabase/reversas/202611172120_oficina_directorio_critica_en_las_piezas_REVERSA.sql')
const REV_CONCEPTO = leer('supabase/reversas/202611172210_oficina_directorio_critica_en_la_gran_idea_REVERSA.sql')

/** el ARRAY de `SET pertinente_en = ARRAY[...]` de la migración de piezas */
const marcasDe = (sql: string): string[] => {
  const m = /SET[\s\S]*?pertinente_en = ARRAY\[([^\]]+)\]/.exec(sql)
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []
}
const tarjeta = (pertinente_en: string[]): Tarjeta => ({ agente: 'social-media-strategist', rol: 'miembro', especialidad: 'x', sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 2 })
const OTRO: Tarjeta = { agente: 'content-creator', rol: 'miembro', especialidad: 'x', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel', 'kit', 'post', 'video', 'concepto'], activo: true, version: 1 }

describe('E · encendido de la crítica · migraciones', () => {
  const marcas = marcasDe(PIEZAS)
  it('piezas: la tarjeta queda activa, miembro, crítica en carrusel/kit/post/video y en NINGÚN tipo como aporte', () => {
    expect(marcas).toEqual(['carrusel:critica', 'kit:critica', 'post:critica', 'video:critica'])
    expect(PIEZAS).toMatch(/SET activo = true/)
    expect(PIEZAS).toMatch(/WHERE agente = 'social-media-strategist'/)
    const dir = [tarjeta(marcas), OTRO]
    for (const tipo of ['carrusel', 'kit', 'post', 'video'] as const) {
      expect(criticoDe(dir, tipo)?.agente).toBe('social-media-strategist')
      expect(especialistasPertinentes(dir, tipo, true)).toEqual(['content-creator'])
    }
    expect(criticoDe(dir, 'concepto')).toBeNull()
    expect(marcas.some((m) => !m.includes(':'))).toBe(false)
  })
  it('piezas: la guarda frena si una tarjeta critica y aporta en el mismo tipo, y si la fila no quedó como se pidió', () => {
    expect(PIEZAS).toMatch(/una tarjeta activa critica y aporta en el mismo tipo/)
    expect(PIEZAS).toMatch(/IF i <> 1 THEN RAISE EXCEPTION/)
    expect(PIEZAS).toMatch(/^BEGIN;/m)
    expect(PIEZAS).toMatch(/^COMMIT;/m)
  })
  it('gran idea: frena con el tope en 7 o menos, agrega SOLO concepto:critica y exige la de piezas antes', () => {
    expect(CONCEPTO).toMatch(/FROM public\.oficina_tipos_de_grupo WHERE familia = 'concepto_mesa'/)
    expect(CONCEPTO).toMatch(/IF t IS NULL OR t <= 7 THEN RAISE EXCEPTION/)
    expect(CONCEPTO.indexOf('t <= 7')).toBeLessThan(CONCEPTO.indexOf('UPDATE public.oficina_directorio'))
    expect(CONCEPTO).toMatch(/pertinente_en \|\| ARRAY\['concepto:critica'\]/)
    expect(CONCEPTO).not.toMatch(/'concepto'[,\]]/)
    expect(CONCEPTO).toMatch(/AND activo\s/)
    const dir = [tarjeta([...marcas, 'concepto:critica']), OTRO]
    expect(criticoDe(dir, 'concepto')?.agente).toBe('social-media-strategist')
    expect(especialistasPertinentes(dir, 'concepto', false)).toEqual(['content-creator'])
  })
  it('reversas: piezas deja la fila apagada y sin marcas (como se leyó en vivo); gran idea quita solo concepto:critica', () => {
    expect(REV_PIEZAS).toMatch(/SET activo = false,\s+pertinente_en = '\{\}'::text\[\]/)
    expect(REV_PIEZAS).toMatch(/especialidad = 'estrategia de redes sociales y calendario'/)
    expect(REV_CONCEPTO).toMatch(/array_remove\(pertinente_en, 'concepto:critica'\)/)
    expect(REV_CONCEPTO).not.toMatch(/activo = false/)
  })
})
