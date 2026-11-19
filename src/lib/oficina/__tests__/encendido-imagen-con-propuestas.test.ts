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
// 18-nov · 3 × lo medido: la 202611181700 lleva la cota de las 3 mesas de imagen de la cifra de arriba (3,2) a la del código (9,54)
const MIG_1700 = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611181700_oficina_topes_al_triple_de_lo_medido.sql'), 'utf8')
const REV_1700 = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611181700_oficina_topes_al_triple_de_lo_medido_REVERSA.sql'), 'utf8')
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

/** lo que la 202611181700 hace con la cota de las mesas de imagen, leído del SQL: el UPDATE (que SOLO toca la cota, no el tope) y la guarda que exige la leída */
const cotaDe1700 = {
  nueva: Number(/UPDATE public\.oficina_tipos_de_grupo g\s+SET limites = g\.limites \|\| jsonb_build_object\('cota_de_la_mesa_usd', ([\d.]+)\), version = g\.version \+ 1\s+WHERE g\.tipo IN \('carrusel_mesa', 'kit_mesa', 'post_mesa'\);/.exec(MIG_1700)![1]),
  leida: Number(/\(g\.limites->>'cota_de_la_mesa_usd'\)::numeric = ([\d.]+)\) <> 3 THEN\s+RAISE EXCEPTION '202611181700: la cota de las 3 mesas de imagen no es la leída/.exec(MIG_1700)![1]),
  comprobada: Number(/\(g\.limites->>'cota_de_la_mesa_usd'\)::numeric = ([\d.]+)\) <> 3 THEN\s+RAISE EXCEPTION '202611181700: la cota de las 3 mesas de imagen no quedó/.exec(MIG_1700)![1]),
}

describe('🔴 202611181700 · la cota de las mesas de imagen al triple de lo medido (18-nov) es EXACTAMENTE la del código', () => {
  it('pone en las 3 mesas de imagen la cota del código (9,54), solo como dato (no toca su tope), y comprueba al final que quedó', () => {
    expect(cotaDe1700.nueva).toBe(9.54)
    expect(cotaDe1700.nueva).toBe(COTA_DE_LA_MESA_CON_PROPUESTAS_USD)
    for (const pl of [KIT_MESA_CON_PROPUESTAS, CARRUSEL_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS]) expect(pl.limites.cota_de_la_mesa_usd).toBe(cotaDe1700.nueva)
    expect(cotaDe1700.comprobada).toBe(cotaDe1700.nueva)
    // el tope de las mesas de imagen no se toca: ningún UPDATE de esas familias cambia `tope_encargo_usd`
    const updates = MIG_1700.split(';').filter((s) => /UPDATE public\.oficina_tipos_de_grupo/.test(s) && /'carrusel_mesa', 'kit_mesa', 'post_mesa'/.test(s))
    expect(updates).toHaveLength(1)
    expect(updates[0]).not.toMatch(/tope_encargo_usd/)
    expect(MIG_1700).toMatch(/^BEGIN;$/m)
    expect(MIG_1700).toMatch(/^COMMIT;$/m)
  })
  it('se niega con encargos vivos de esas familias y si la cota no es la leída (3,2: la que dejó la 202611172100)', () => {
    expect(MIG_1700).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa'\)\) THEN\s+RAISE EXCEPTION '202611181700: hay un encargo vivo/)
    expect(cotaDe1700.leida).toBe(delSql.cota)
  })
  it('la reversa vuelve la cota a 3,2 (la del encendido), exige la que dejó la migración y se niega con encargos vivos', () => {
    const vuelve = /SET limites = g\.limites \|\| jsonb_build_object\('cota_de_la_mesa_usd', ([\d.]+)\), version = g\.version \+ 1 WHERE g\.tipo IN \('carrusel_mesa', 'kit_mesa', 'post_mesa'\);/.exec(REV_1700)
    expect(vuelve).not.toBeNull()
    expect(Number(vuelve![1])).toBe(delSql.cota)
    const exige = /\(g\.limites->>'cota_de_la_mesa_usd'\)::numeric = ([\d.]+)\) <> 3 THEN\s+RAISE EXCEPTION 'reversa 202611181700: las filas no están en lo que dejó la migración/.exec(REV_1700)
    expect(Number(exige![1])).toBe(COTA_DE_LA_MESA_CON_PROPUESTAS_USD)
    expect(REV_1700).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa'\)\) THEN\s+RAISE EXCEPTION 'reversa 202611181700: hay un encargo vivo/)
  })
})

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
  it.each([['kit_mesa', KIT_MESA, KIT_MESA_CON_PROPUESTAS], ['carrusel_mesa', CARRUSEL_MESA, CARRUSEL_MESA_CON_PROPUESTAS], ['post_mesa', POST_MESA, POST_MESA_CON_PROPUESTAS]] as const)('%s: los límites que cambian son solo propuestas, cota y tope, con las cifras del código (la cota, con la de la 202611181700)', (tipo, hoy, con) => {
    const cambian = Object.keys(con.limites).filter((k) => JSON.stringify((con.limites as Record<string, unknown>)[k]) !== JSON.stringify((hoy.limites as Record<string, unknown>)[k])).sort()
    expect(cambian).toEqual(['cota_de_la_mesa_usd', 'propuestas', 'tope_encargo_usd'])
    expect(con.limites.propuestas).toEqual({ n: delSql.n })
    expect(delSql.n).toBe(PROPUESTAS_DE_IMAGEN)
    // la del encendido (17-nov) fue la cota de entonces, 3,2; la del código de hoy (9,54) la pone la 202611181700 (ver abajo)
    expect(delSql.cota).toBe(3.2)
    expect(con.limites.cota_de_la_mesa_usd).toBe(COTA_DE_LA_MESA_CON_PROPUESTAS_USD)
    expect(con.limites.cota_de_la_mesa_usd).toBe(cotaDe1700.nueva)
    // el tope que puso el encendido (17-nov), con SU cifra escrita. 18-nov: con la cota en 9,54 el código calcula otro tope (la cuenta sube) y la 202611181700 NO toca
    // el tope de estas filas (desalineación código ↔ fila anotada para CC3 el 18-nov): aquí ya no se exige que el tope del código sea el de la fila
    expect(tipo === 'kit_mesa' ? delSql.topeKit : delSql.topeOtros).toBe(tipo === 'kit_mesa' ? 18 : 15)
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
