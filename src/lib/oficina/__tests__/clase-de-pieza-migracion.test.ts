/**
 * Fila #19 · pedido CC6 (certificación #1037): la migración de la clase queda ATADA al código. US$ 0 · sin base ni red.
 *   · cada familia del CASE tiene la MISMA clase que su plantilla en el código, y están las 9;
 *   · el check lista exactamente `CLASES_DE_PIEZA`;
 *   · existen el relleno solo de lo vacío, la guarda que lanza y el `set not null`; la reversa quita lo mismo que agrega.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLASES_DE_PIEZA } from '../clase'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { BRIEF_MESA, CARRUSEL_MESA, CONCEPTO_MESA, KIT_MESA, REUBICACION_MESA } from '../plantillas/mesa'
import { POST_IMG } from '../plantillas/post-img'
import { VIDEO_MESA } from '../plantillas/video-mesa'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611111401_oficina_clase_de_pieza.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202611111401_oficina_clase_de_pieza_REVERSA.sql'), 'utf8')
const PLANTILLAS = [POST_IMG, CARRUSEL_IG_V1, KIT_HISTORIAS, CARRUSEL_MESA, KIT_MESA, VIDEO_MESA, BRIEF_MESA, CONCEPTO_MESA, REUBICACION_MESA]
const sinComentarios = SQL.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
const DEL_CASE = Object.fromEntries([...sinComentarios.matchAll(/when '([a-z0-9_]+)' then '([a-z_]+)'/g)].map((m) => [m[1], m[2]]))

describe('la migración de la clase y el código dicen lo mismo', () => {
  it('cada familia del CASE tiene la clase de su plantilla del código, y son las 9', () => {
    expect(Object.keys(DEL_CASE).sort()).toEqual(PLANTILLAS.map((p) => p.familia).sort())
    for (const p of PLANTILLAS) expect({ familia: p.familia, clase: DEL_CASE[p.familia] }).toEqual({ familia: p.familia, clase: p.clase })
  })
  it('el reel (video_mesa) es de clase video en los dos lados: no vuelve a la pasarela como un post', () => {
    expect(DEL_CASE.video_mesa).toBe('video'); expect(VIDEO_MESA.clase).toBe('video')
  })
  it('el check lista exactamente las clases que conoce el código', () => {
    const m = sinComentarios.match(/check \(clase in \(([^)]*)\)\)/)
    expect(m).not.toBeNull()
    expect([...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual([...CLASES_DE_PIEZA].sort())
  })
  it('rellena solo lo vacío, lanza si queda una plantilla sin clase y después exige la columna', () => {
    expect(sinComentarios).toMatch(/add column if not exists clase text;/)
    expect(sinComentarios).toMatch(/end\s+where clase is null;/)
    expect(sinComentarios).toMatch(/where clase is null;\s+if sin_clase is not null then\s+raise exception/)
    expect(sinComentarios).toMatch(/alter column clase set not null;/)
    const orden = ['add column if not exists clase', 'where clase is null;', 'raise exception', 'set not null', 'add constraint oficina_tipos_de_grupo_clase_valida'].map((x) => sinComentarios.indexOf(x))
    expect(orden.every((i) => i >= 0)).toBe(true); expect([...orden].sort((a, b) => a - b)).toEqual(orden)
    expect(sinComentarios).not.toMatch(/\bdrop\s+column\b|\bdelete\b|\btruncate\b|\bgrant\b/i)
  })
  it('la reversa quita la restricción y la columna, y nada más', () => {
    expect(REVERSA).toMatch(/drop constraint if exists oficina_tipos_de_grupo_clase_valida;/)
    expect(REVERSA).toMatch(/drop column if exists clase;/)
    expect(REVERSA).not.toMatch(/\bdelete\b|\btruncate\b|drop table/i)
  })
})
