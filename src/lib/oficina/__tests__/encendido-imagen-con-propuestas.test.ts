/**
 * 17-nov · ENCENDIDO de propuestas en imagen (paso 2 del GO de Lenovo) · la migración 202611172100 deja en kit_mesa, carrusel_mesa y post_mesa EXACTAMENTE lo que
 * produce el código (`conPropuestasDeImagen` sobre la plantilla vigente) · lee el SQL y lo compara con el código; la reversa existe y deshace lo mismo. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_MESA_CON_PROPUESTAS, COTA_DE_LA_MESA_CON_PROPUESTAS_USD, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS, PROPUESTAS_DE_IMAGEN } from '../plantillas/imagen-propuestas'
import { CARRUSEL_MESA, KIT_MESA, POST_MESA } from '../plantillas/mesa'
import type { Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const MIG = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611172100_oficina_imagen_con_propuestas.sql'), 'utf8')
const REV = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611172100_oficina_imagen_con_propuestas_REVERSA.sql'), 'utf8')
const json = <T>(o: T): T => JSON.parse(JSON.stringify(o))
const paso = (pl: Plantilla, clave: string) => json(pl.pasos.find((p) => p.clave === clave)!)

/** el objeto `borrador_imagen` tal como lo ARMA el SQL: los pares clave/valor de su `jsonb_build_object` (texto o `'…'::jsonb`), más el tope de su CASE (CC6 · m5) */
const borradorDelSql = (tipo: string): Record<string, unknown> => {
  const cuerpo = /jsonb_build_object\(('clave', 'borrador_imagen'[\s\S]*?), 'tope_usd', CASE WHEN g\.tipo = 'post_mesa' THEN ([\d.]+) ELSE ([\d.]+) END\)/.exec(MIG)!
  const vals = [...cuerpo[1].matchAll(/'([^']*)'(::jsonb)?/g)].map((m) => (m[2] ? JSON.parse(m[1]) : m[1]))
  expect(vals.length % 2).toBe(0)
  const o: Record<string, unknown> = {}
  for (let i = 0; i < vals.length; i += 2) o[vals[i] as string] = vals[i + 1]
  o.tope_usd = Number(tipo === 'post_mesa' ? cuerpo[2] : cuerpo[3])
  return o
}

/** lo que la migración pone, leído del SQL (los números de sus CASE y el JSON literal de `aprobar_propuestas`) */
const delSql = {
  aprobar: JSON.parse(/\$a\$([\s\S]*?)\$a\$/.exec(MIG)![1]),
  borradorPost: Number(/WHEN g\.tipo = 'post_mesa' THEN ([\d.]+) ELSE ([\d.]+) END\)/.exec(MIG)![1]),
  borradorOtros: Number(/WHEN g\.tipo = 'post_mesa' THEN ([\d.]+) ELSE ([\d.]+) END\)/.exec(MIG)![2]),
  topeKit: Number(/'tope_encargo_usd', CASE WHEN g\.tipo = 'kit_mesa' THEN (\d+) ELSE (\d+) END/.exec(MIG)![1]),
  topeOtros: Number(/'tope_encargo_usd', CASE WHEN g\.tipo = 'kit_mesa' THEN (\d+) ELSE (\d+) END/.exec(MIG)![2]),
  cota: Number(/'cota_de_la_mesa_usd', ([\d.]+)/.exec(MIG)![1]),
  n: Number(/'propuestas', '\{"n":(\d+)\}'::jsonb/.exec(MIG)![1]),
}

describe('🔴 la migración del encendido es EXACTAMENTE el código', () => {
  it.each([['kit_mesa', KIT_MESA, KIT_MESA_CON_PROPUESTAS], ['carrusel_mesa', CARRUSEL_MESA, CARRUSEL_MESA_CON_PROPUESTAS], ['post_mesa', POST_MESA, POST_MESA_CON_PROPUESTAS]] as const)('%s: los dos pasos nuevos van justo después de `mesa`, con los mismos campos; el resto de los pasos no cambia', (tipo, hoy, con) => {
    const claves = con.pasos.map((p) => p.clave)
    const i = claves.indexOf('mesa')
    expect(claves.slice(i, i + 3)).toEqual(['mesa', 'borrador_imagen', 'aprobar_propuestas'])
    expect(con.pasos.filter((p) => p.clave !== 'borrador_imagen' && p.clave !== 'aprobar_propuestas').map((p) => json(p))).toEqual(json(hoy.pasos))
    // aprobar_propuestas: el JSON literal del SQL es el paso del código
    expect(delSql.aprobar).toEqual(paso(con, 'aprobar_propuestas'))
    // borrador_imagen: el objeto que ARMA el SQL (pares de su jsonb_build_object) es exactamente el del código, con SU tope
    expect(borradorDelSql(tipo)).toEqual(paso(con, 'borrador_imagen'))
  })
  it.each([['kit_mesa', KIT_MESA, KIT_MESA_CON_PROPUESTAS], ['carrusel_mesa', CARRUSEL_MESA, CARRUSEL_MESA_CON_PROPUESTAS], ['post_mesa', POST_MESA, POST_MESA_CON_PROPUESTAS]] as const)('%s: los límites que cambian son solo propuestas, cota y tope, con las cifras del código', (tipo, hoy, con) => {
    const cambian = Object.keys(con.limites).filter((k) => JSON.stringify((con.limites as Record<string, unknown>)[k]) !== JSON.stringify((hoy.limites as Record<string, unknown>)[k])).sort()
    expect(cambian).toEqual(['cota_de_la_mesa_usd', 'propuestas', 'tope_encargo_usd'])
    expect(con.limites.propuestas).toEqual({ n: delSql.n })
    expect(delSql.n).toBe(PROPUESTAS_DE_IMAGEN)
    expect(con.limites.cota_de_la_mesa_usd).toBe(delSql.cota)
    expect(delSql.cota).toBe(COTA_DE_LA_MESA_CON_PROPUESTAS_USD)
    expect(con.limites.tope_encargo_usd).toBe(tipo === 'kit_mesa' ? delSql.topeKit : delSql.topeOtros)
    // la guarda de la migración exige el tope leído (5): es el de la plantilla de hoy
    expect(hoy.limites.tope_encargo_usd).toBe(5)
  })
})

describe('las guardas y la reversa', () => {
  it('la migración se niega con encargos vivos (salvo el que solo espera al dueño), con una fila distinta de la leída y si ya hay propuestas', () => {
    expect(MIG).toMatch(/hay encargos de la oficina vivos/)
    expect(MIG).toMatch(/t\.tipo = 'dueno'|x\.tipo = 'dueno'/)
    expect(MIG).toMatch(/no es el leído \(5\)/)
    expect(MIG).toMatch(/ya tiene propuestas; no se pisa/)
    expect(MIG).toMatch(/no quedó con mesa → borrador_imagen → aprobar_propuestas → imagen/)
  })
  it('la reversa quita los dos pasos, propuestas y cota, y deja el tope en 5 (columna y límite); se niega con encargos vivos de imagen', () => {
    expect(REV).toMatch(/NOT IN \('borrador_imagen', 'aprobar_propuestas'\)/)
    expect(REV).toMatch(/- 'propuestas' - 'cota_de_la_mesa_usd'\) \|\| jsonb_build_object\('tope_encargo_usd', 5\)/)
    expect(REV).toMatch(/tope_encargo_usd = 5/)
    expect(REV).toMatch(/e\.familia IN \('kit_mesa', 'carrusel_mesa', 'post_mesa'\)/)
  })
})
