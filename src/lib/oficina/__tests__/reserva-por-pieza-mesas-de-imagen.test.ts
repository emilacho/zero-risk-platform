/**
 * 202611201330 · reserva por pieza de las 3 mesas de imagen (CC2 · GO Lenovo 12:44Z + 12:57Z) · certifican CC6 y CC7.
 * Con las filas VIVAS (fixture leído el 20-nov, ya con los topes de #1249: 43/45/45) y la historia REAL de `carrusel_mesa` (sus 3 encargos terminados),
 * el freno de la campaña aparta el tope entero en post y kit (43 / 45) y 2,50 en carrusel (gana el piso de `carrusel_ig_v1`).
 * Con la migración aparta lo esperado (2,95 / 3,10 / 3,10). La reversa lo deshace.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { reservasDesdeLaHistoria } from '../gasto-de-encargos'
import { FAMILIA_CON_MESA, topesConMesa } from '../mesa/con-mesa'
import { RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD as RESERVA } from '../plantillas/reserva-de-las-mesas-de-imagen'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611201330_oficina_reserva_por_pieza_mesas_de_imagen.sql')
const REV = leer('reversas', '202611201330_oficina_reserva_por_pieza_mesas_de_imagen_REVERSA.sql')
type Fila = { tipo: string; familia: string; version: number; tope_encargo_usd: number; limites: Record<string, unknown>; pasos: unknown }
const FILAS: Fila[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mesas-de-imagen-filas-vivas-2026-11-20.json'), 'utf8')).filas
/** los 3 encargos reales terminados de `carrusel_mesa` (48776d13 · c6f3322e · 8adbfb3d, leídos el 20-nov): la historia que hoy le da 1,58 */
const HISTORIA = [2.051572, 0.984574, 1.690998].map((g) => ({ familia: 'carrusel_mesa', gasto_usd: g }))
const MESAS = ['post_mesa', 'carrusel_mesa', 'kit_mesa'] as const

/** lo que hace cada UPDATE de la migración y de la reversa, leído del SQL: `limites || {reserva}` o `limites - 'reserva_por_pieza_usd'`, y version + 1 */
function aplicar(sql: string, filas: Fila[]): Fila[] {
  return filas.map((f) => {
    const pone = new RegExp(`SET limites = g\\.limites \\|\\| jsonb_build_object\\('reserva_por_pieza_usd', ([0-9.]+)\\), version = g\\.version \\+ 1\\nWHERE g\\.tipo = '${f.tipo}';`).exec(sql)
    if (pone) return { ...f, version: f.version + 1, limites: { ...f.limites, reserva_por_pieza_usd: Number(pone[1]) } }
    if (sql.includes(`SET limites = g.limites - 'reserva_por_pieza_usd', version = g.version + 1 WHERE g.tipo = '${f.tipo}';`)) {
      const { reserva_por_pieza_usd: _fuera, ...resto } = f.limites
      return { ...f, version: f.version + 1, limites: resto }
    }
    return f
  })
}
/** el freno de la campaña, como lo arma la cadena: reservas por familia (con la historia real) y luego `topesConMesa` (20-nov, #1248: para cualquier cliente, sin palanca) */
function freno(filas: Fila[]) {
  const reservas = reservasDesdeLaHistoria(filas, HISTORIA)
  const topes = Object.fromEntries(filas.map((f) => [f.familia, f.tope_encargo_usd]))
  return topesConMesa(topes, reservas).reservas ?? {}
}

describe('202611201330 · reserva por pieza de las 3 mesas de imagen', () => {
  it('🔴 hoy (filas vivas): post y kit apartan su tope ENTERO (43 / 45) y el carrusel 2,50, menos de lo que cuesta una pieza con propuestas', () => {
    for (const t of MESAS) expect(FILAS.find((f) => f.tipo === t)!.limites).not.toHaveProperty('reserva_por_pieza_usd')
    expect(reservasDesdeLaHistoria(FILAS, HISTORIA).carrusel_mesa).toBe(1.5757)
    const r = freno(FILAS)
    expect(r.post_img).toBe(43)
    expect(r.kit_historias).toBe(45)
    // el carrusel de la cadena entra a su mesa con #1248 (FAMILIA_CON_MESA): ahí gana el piso de carrusel_ig_v1 (2,50), menos de lo que cuesta
    if (FAMILIA_CON_MESA.carrusel_ig_v1 === 'carrusel_mesa') expect(r.carrusel_ig_v1).toBe(2.5)
    expect(Math.max(2.5, reservasDesdeLaHistoria(FILAS, HISTORIA).carrusel_mesa)).toBeLessThan(RESERVA.carrusel_mesa)
  })
  it('🔴 con la migración el freno aparta lo esperado: post 2,95, carrusel 3,10 y kit 3,10', () => {
    const despues = aplicar(MIG, FILAS)
    // lo que reserva cada mesa (el carrusel, con su historia vieja de 1,58: manda el piso)
    const propias = reservasDesdeLaHistoria(despues, HISTORIA)
    for (const t of MESAS) expect(propias[t]).toBe(RESERVA[t])
    // y lo que aparta la cadena por cada familia de siempre que va a su mesa (post y kit hoy; también el carrusel con #1248)
    const r = freno(despues)
    expect(r.post_img).toBe(RESERVA.post_mesa)
    expect(r.kit_historias).toBe(RESERVA.kit_mesa)
    for (const [de, a] of Object.entries(FAMILIA_CON_MESA)) if ((MESAS as readonly string[]).includes(a)) expect(r[de]).toBe(RESERVA[a as (typeof MESAS)[number]])
  })
  it('🔴 solo cambian la reserva y la versión de las 3 mesas: topes, pasos, el resto de los límites y las familias de siempre quedan iguales', () => {
    const despues = aplicar(MIG, FILAS)
    for (const a of FILAS) {
      const d = despues.find((f) => f.tipo === a.tipo)!
      if (!MESAS.includes(a.tipo as (typeof MESAS)[number])) { expect(d).toEqual(a); continue }
      expect(d.version).toBe(a.version + 1)
      expect(d.limites.reserva_por_pieza_usd).toBe(RESERVA[a.tipo as (typeof MESAS)[number]])
      const { reserva_por_pieza_usd: _r, ...resto } = d.limites
      expect({ ...d, version: a.version, limites: resto }).toEqual(a)
    }
  })
  it('🔴 lo esperado es un piso, no el peor caso: bajo el tope de cada mesa, sobre el piso de la familia de siempre (2,50) y sobre la historia vieja del carrusel', () => {
    for (const t of MESAS) expect(RESERVA[t]).toBeLessThan(FILAS.find((f) => f.tipo === t)!.tope_encargo_usd)
    for (const t of ['post_img', 'kit_historias', 'carrusel_ig_v1']) expect(FILAS.find((f) => f.tipo === t)!.limites.reserva_por_pieza_usd).toBe(2.5)
    for (const t of MESAS) expect(RESERVA[t]).toBeGreaterThan(2.5)
    // con historia manda el MAYOR: si las piezas reales salen más caras que el piso, el freno sube con ellas
    const cara = Array.from({ length: 3 }, () => ({ familia: 'carrusel_mesa', gasto_usd: 5 }))
    expect(reservasDesdeLaHistoria(aplicar(MIG, FILAS), cara).carrusel_mesa).toBe(5)
  })
  it('🔴 la reversa deshace: las filas vuelven a las leídas (salvo la versión, que sube otra vez) y el freno vuelve a 43 / 2,50 / 45', () => {
    const vuelta = aplicar(REV, aplicar(MIG, FILAS))
    for (const f of FILAS) {
      const v = vuelta.find((x) => x.tipo === f.tipo)!
      expect({ ...v, version: f.version }).toEqual(f)
      expect(v.version).toBe(MESAS.includes(f.tipo as (typeof MESAS)[number]) ? f.version + 2 : f.version)
    }
    expect(freno(vuelta)).toEqual(freno(FILAS))
  })
  it('🔴 la migración pone EXACTAMENTE la cifra del código, frena antes de cambiar y comprueba al final', () => {
    for (const t of MESAS) expect(MIG).toContain(`jsonb_build_object('reserva_por_pieza_usd', ${RESERVA[t]}), version = g.version + 1\nWHERE g.tipo = '${t}';`)
    expect(MIG.match(/^UPDATE /gm)).toHaveLength(3)
    expect(MIG).toContain("BEGIN;\n\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE public.oficina_encargos IN SHARE MODE;")
    expect(MIG).toContain("WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;")
    expect(MIG).toContain("IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN\n    RAISE EXCEPTION '202611201330: hay un encargo vivo")
    // m24 · la guarda del leído mira las 3 mesas (no solo 2)
    expect(MIG).toContain("WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND NOT (g.limites ? 'reserva_por_pieza_usd')) <> 3 THEN\n    RAISE EXCEPTION '202611201330: las 3 mesas de imagen no son las leídas")
    const puestas = MESAS.map((t) => `(g.tipo = '${t}' AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${RESERVA[t]})`).join(' OR ')
    expect(MIG).toContain(`${puestas}) <> 3 THEN\n    RAISE EXCEPTION '202611201330: la reserva no quedó`)
    const primerUpdate = MIG.indexOf('UPDATE public.oficina_tipos_de_grupo')
    expect(MIG.indexOf('hay un encargo vivo')).toBeLessThan(primerUpdate)
    expect(MIG.indexOf('no son las leídas')).toBeLessThan(primerUpdate)
    expect(MIG.lastIndexOf('la reserva no quedó')).toBeGreaterThan(MIG.lastIndexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(MIG).toMatch(/^COMMIT;$/m)
    expect(MIG.lastIndexOf('COMMIT;')).toBeGreaterThan(MIG.lastIndexOf('la reserva no quedó'))
    expect(MIG).not.toMatch(/tope_encargo_usd\s*=/)
  })
  it('🔴 la reversa exige lo que dejó la migración, frena con encargos vivos, toma el candado con techo y cierra', () => {
    expect(REV.match(/^UPDATE /gm)).toHaveLength(3)
    expect(REV).toContain("BEGIN;\n\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE public.oficina_encargos IN SHARE MODE;")
    expect(REV).toContain("WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;")
    expect(REV).toContain("THEN\n    RAISE EXCEPTION 'REVERSA 202611201330: hay un encargo vivo")
    const puestas = MESAS.map((t) => `(g.tipo = '${t}' AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${RESERVA[t]})`).join(' OR ')
    expect(REV).toContain(`${puestas}) <> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201330: la reserva no es la que dejó`)
    expect(REV).toContain("WHERE g.tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') AND NOT (g.limites ? 'reserva_por_pieza_usd')) <> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201330: la reserva no se quitó")
    const primerUpdate = REV.indexOf('UPDATE public.oficina_tipos_de_grupo')
    expect(REV.indexOf('hay un encargo vivo')).toBeLessThan(primerUpdate)
    expect(REV.indexOf('no es la que dejó')).toBeLessThan(primerUpdate)
    expect(REV.lastIndexOf('no se quitó')).toBeGreaterThan(REV.lastIndexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(REV).toMatch(/^COMMIT;$/m)
    expect(REV.lastIndexOf('COMMIT;')).toBeGreaterThan(REV.lastIndexOf('no se quitó'))
  })
})
