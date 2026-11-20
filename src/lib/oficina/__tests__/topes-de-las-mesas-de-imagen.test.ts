/**
 * 202611201100 · topes de las 3 mesas de imagen (CC4 · decisión (a) de Lenovo 12:09Z) · certifican CC6 y CC7.
 * Hoy las filas vivas (cota 9,54, tope 15/15/18) no cubren su peor caso → 409 al abrir. La migración pone en la fila EXACTAMENTE la cifra del código.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS, reservaDeUnaVueltaDeLaJefatura } from '../plantillas/imagen-propuestas'
import { TOPES_DE_LAS_MESAS_DE_IMAGEN_USD as NUEVO, TOPES_LEIDOS_DE_LAS_MESAS_DE_IMAGEN_USD as LEIDO } from '../plantillas/topes-de-las-mesas-de-imagen'
import { coberturaDelTope } from '../topes-por-duracion'
import type { Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611201100_oficina_topes_de_las_mesas_de_imagen.sql')
const REV = leer('reversas', '202611201100_oficina_topes_de_las_mesas_de_imagen_REVERSA.sql')
const FAMILIAS = { post_mesa: POST_MESA_CON_PROPUESTAS, carrusel_mesa: CARRUSEL_MESA_CON_PROPUESTAS, kit_mesa: KIT_MESA_CON_PROPUESTAS } as const
const conTope = (pl: Plantilla, t: number) => ({ ...pl, limites: { ...pl.limites, tope_encargo_usd: t } }) as Plantilla
const tipos = Object.keys(FAMILIAS) as Array<keyof typeof FAMILIAS>

describe('202611201100 · los topes de las 3 mesas de imagen', () => {
  it('🔴 el peor caso de hoy (cota 9,54) es el medido en las filas vivas: con el tope leído NO cubre, con el nuevo SÍ', () => {
    const medido = { post_mesa: 31.06, carrusel_mesa: 32.06, kit_mesa: 32.06 }
    for (const t of tipos) {
      const pl = FAMILIAS[t]
      expect(pl.limites.cota_de_la_mesa_usd).toBe(9.54)
      expect(coberturaDelTope(pl, 0).requerido).toBe(medido[t])
      expect(coberturaDelTope(conTope(pl, LEIDO[t]), LEIDO[t]).cubre).toBe(false)
      expect(coberturaDelTope(conTope(pl, NUEVO[t]), NUEVO[t]).cubre).toBe(true)
      // deja lugar también a una vuelta de la jefatura (la cuenta de `conPropuestasDeImagen`) y a una de GPT (11,72 más en el post, 12,02 en carrusel y kit · rama del segundo doctor)
      expect(NUEVO[t]).toBeGreaterThanOrEqual(Math.ceil(medido[t] + reservaDeUnaVueltaDeLaJefatura(pl)))
      expect(NUEVO[t] - medido[t]).toBeGreaterThanOrEqual(t === 'post_mesa' ? 11.72 : 12.02)
    }
  })
  it('🔴 la migración pone en la fila EXACTAMENTE la cifra del código, en columna y límite, y comprueba al final que quedó', () => {
    for (const t of tipos) {
      const n = NUEVO[t]
      expect(MIG).toContain(`SET tope_encargo_usd = ${n}, limites = g.limites || jsonb_build_object('tope_encargo_usd', ${n}), version = g.version + 1\nWHERE g.tipo = '${t}';`)
      expect(MIG).toContain(`g.tipo = '${t}' AND g.tope_encargo_usd = ${n} AND (g.limites->>'tope_encargo_usd')::numeric = ${n}) THEN\n    RAISE EXCEPTION '202611201100: ${t} no quedó en ${n}'`)
    }
    expect(MIG.match(/^UPDATE /gm)).toHaveLength(3)
    expect(MIG).toMatch(/^BEGIN;$/m)
    expect(MIG).toMatch(/^COMMIT;$/m)
  })
  it('🔴 exige el tope leído en columna y límite, y frena con un encargo vivo, todo ANTES de cambiar', () => {
    for (const t of tipos) {
      const l = LEIDO[t]
      expect(MIG).toContain(`g.tipo = '${t}' AND g.tope_encargo_usd = ${l} AND (g.limites->>'tope_encargo_usd')::numeric = ${l}) THEN\n    RAISE EXCEPTION '202611201100: el tope de ${t} no es el leído`)
    }
    expect(MIG).toContain("IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN")
    expect(MIG).toContain('LOCK TABLE public.oficina_encargos IN SHARE MODE;')
    // 🟡 CC7 12:25Z · t4 y t6: la guarda FRENA (no solo avisa) y las 3 filas quedan tomadas
    expect(MIG).toContain("THEN\n    RAISE EXCEPTION '202611201100: hay un encargo vivo")
    expect(MIG).toContain("WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;")
    // 🟡 CC6 12:32Z · la espera del candado tiene techo (no se queda colgada detrás de un encargo)
    expect(MIG).toContain("BEGIN;\n\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE public.oficina_encargos IN SHARE MODE;")
    expect(MIG.indexOf('hay un encargo vivo')).toBeLessThan(MIG.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(MIG.indexOf('no es el leído')).toBeLessThan(MIG.indexOf('UPDATE public.oficina_tipos_de_grupo'))
  })
  it('la reversa vuelve a lo leído en columna y límite, exige lo que dejó la migración y se niega con encargos vivos', () => {
    for (const t of tipos) {
      const l = LEIDO[t]
      expect(REV).toContain(`SET tope_encargo_usd = ${l}, limites = g.limites || jsonb_build_object('tope_encargo_usd', ${l}), version = g.version + 1 WHERE g.tipo = '${t}';`)
    }
    expect(NUEVO.carrusel_mesa).toBe(NUEVO.kit_mesa)
    expect(REV).toContain(`(g.tipo = 'post_mesa' AND g.tope_encargo_usd = ${NUEVO.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = ${NUEVO.carrusel_mesa})`)
    expect(REV).toContain("IF EXISTS (SELECT 1 FROM public.oficina_encargos e WHERE e.estado IN ('abierto', 'en_paso') AND e.familia IN ('post_mesa', 'carrusel_mesa', 'kit_mesa')) THEN")
    expect(REV.indexOf('hay un encargo vivo')).toBeLessThan(REV.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    // 🟡 CC7 12:25Z · t10, t11 y t6: la guarda de la reversa FRENA, exige las 3 filas (no 2 de 3) y las toma
    expect(REV).toContain("THEN\n    RAISE EXCEPTION 'REVERSA 202611201100: hay un encargo vivo")
    expect(REV).toContain("AND g.tope_encargo_usd = 45)) <> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201100: los topes no son los que dejó la migración")
    expect(REV).toContain("WHERE tipo IN ('post_mesa', 'carrusel_mesa', 'kit_mesa') FOR UPDATE;")
    // 🟡 CC6 12:32Z · la reversa también toma el candado con techo de espera, y cierra (sin COMMIT no deshace nada)
    expect(REV).toContain("BEGIN;\n\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE public.oficina_encargos IN SHARE MODE;")
    expect(REV).toMatch(/^COMMIT;$/m)
    expect(REV.lastIndexOf('COMMIT;')).toBeGreaterThan(REV.lastIndexOf('no quedaron en'))
    // 🟡 sin freno de CC7 · la reversa comprueba al final que quedó lo leído (como la ida)
    expect(REV).toContain(`<> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201100: los topes no quedaron en ${LEIDO.post_mesa}/${LEIDO.carrusel_mesa}/${LEIDO.kit_mesa}'`)
    expect(REV.lastIndexOf('no quedaron en')).toBeGreaterThan(REV.lastIndexOf('UPDATE public.oficina_tipos_de_grupo'))
  })
})
