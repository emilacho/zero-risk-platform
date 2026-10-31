/**
 * +2 días de anticipación a cada formato (31-oct, ENCARGO «dos días más de margen»): dato, idempotente y con reversa. La prueba real de las dos migraciones
 * (sumar, repetir sin sumar de más, restar, repetir sin restar de más) se corrió en la base dentro de un bloque que siempre se deshace: ver el APLICADO.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const UP = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610311500_cadena_dos_dias_mas_de_margen.sql'), 'utf8')
const DOWN = readFileSync(join(RAIZ, 'supabase', 'reversas', '202610311500_cadena_dos_dias_mas_de_margen_REVERSA.sql'), 'utf8')
const sinComentarios = (s: string) => s.replace(/--.*\n/g, '')

describe('la migración suma 2 a TODOS los formatos, una sola vez', () => {
  it('actualiza toda la tabla (sin WHERE) en +2 y deja una marca; solo corre si la marca no existe', () => {
    const t = sinComentarios(UP)
    expect(t).toMatch(/UPDATE public\.cadena_formatos_por_red SET lead_dias = lead_dias \+ 2;/)
    expect(t).not.toMatch(/WHERE\s+(red|formato)/i)
    expect(t).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.cadena_config WHERE clave = 'lead_mas_2_aplicado'\)/)
    expect(t).toMatch(/INSERT INTO public\.cadena_config \(clave, valor\) VALUES \('lead_mas_2_aplicado'/)
  })
  it('no toca fechas, horas ni canales: solo `lead_dias` de una tabla', () => {
    const t = sinComentarios(UP)
    expect(t.match(/UPDATE /g)).toHaveLength(1)
    expect(t).not.toMatch(/cadena_calendario_filas|cadena_plazos|cadena_campanas/)
  })
  it('la reversa resta 2 solo si la marca existe, nunca baja de 0, y quita la marca', () => {
    const t = sinComentarios(DOWN)
    expect(t).toMatch(/IF EXISTS \(SELECT 1 FROM public\.cadena_config WHERE clave = 'lead_mas_2_aplicado'\)/)
    expect(t).toMatch(/lead_dias = GREATEST\(lead_dias - 2, 0\)/)
    expect(t).toMatch(/DELETE FROM public\.cadena_config WHERE clave = 'lead_mas_2_aplicado'/)
  })
  it('la tabla acepta cualquier lead ≥ 0 (el 9 de YouTube video cabe)', () => {
    const base = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610090200_cadena_tablas.sql'), 'utf8')
    expect(base).toMatch(/CHECK \(lead_dias >= 0\)/)
  })
})
