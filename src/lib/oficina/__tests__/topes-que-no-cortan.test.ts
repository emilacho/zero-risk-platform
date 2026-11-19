/**
 * 202611170900 · topes que no cortan el trabajo (CC1 · ADENDA 08:06 de Lenovo · regla de Emilio) · certifica CC6.
 * La cuenta por el MOTOR REAL en el PEOR caso: todas las vueltas tomadas al máximo y todos los pasos condicionales corridos (la re-imagen incluida);
 * cada paso cuesta el MAYOR entre su reserva y su gasto real máximo por encargo (oficina_turnos, lectura del 17-nov); la jefatura, el mayor real visto (0,985).
 * Con 2,50 la foto, el carrusel y el kit se cortaban a medias; con los topes nuevos entregan. La mesa de concepto corta en 1,2 × tope: con 5 (= 6) cortaba un encargo real de 6,15.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { techoDe } from '../mesa/planificador'
import { registrarPaso, siguientePaso } from '../motor'
import { CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA, POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { CONCEPTO_MESA, TOPE_DE_LA_MESA_DE_CONCEPTO_USD } from '../plantillas/mesa'
import type { Estado, Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611170900_oficina_topes_que_no_cortan.sql')
const REV = leer('reversas', '202611170900_oficina_topes_que_no_cortan_REVERSA.sql')
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

/** gasto real máximo por encargo y paso (oficina_turnos · lectura 17-nov); lo que no aparece, gastó 0 */
const REALES: Record<string, Record<string, number>> = {
  post_img: { direccion_visual: 0.297, mirar: 0.168 },
  carrusel_ig_v1: { laminas: 0.345, prompts: 0.736, texto: 0.178, direccion_visual: 0.258 },
  kit_historias: { narrativa: 0.156, direccion_visual: 0.199, texto: 0.164 },
}
const JEFATURA_REAL_MAX = 0.985
const siempre = { tipo: 'siempre' } as never
const raiz = (c: string) => c.replace(/^reimagen_/, '').replace(/_\d+$/, '')

function peorCaso(base: Plantilla, familia: string, tope: number) {
  const pl: Plantilla = { ...base, limites: { ...base.limites, tope_encargo_usd: tope }, pasos: base.pasos.map((p) => ({ ...p, condicion: siempre, ...(p.vuelve_a ? { vuelve_a: { ...p.vuelve_a, si: siempre } } : {}) })) }
  const r = REALES[familia]
  let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
  for (let k = 0; k < 400; k++) {
    const s = siguientePaso(e, pl)
    if (s.accion !== 'ejecutar') return { accion: s.accion, gasto: Math.round(e.gasto_usd * 1000) / 1000 }
    const c = s.paso.clave
    const costo = raiz(c) === 'jefatura' ? JEFATURA_REAL_MAX : Math.max(s.paso.tope_usd, r[c] ?? r[raiz(c)] ?? 0)
    e = registrarPaso(e, pl, s.indice, { costo_usd: costo, artefacto: { ok: true }, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
  }
  throw new Error('no terminó')
}
const CASOS: Array<[string, Plantilla, number, number]> = [
  ['post_img', POST_IMG_CON_JEFATURA, 4, 3.342],
  ['kit_historias', KIT_HISTORIAS_CON_JEFATURA, 5, 4.065],
  ['carrusel_ig_v1', CARRUSEL_IG_CON_JEFATURA, 7, 5.831],
]

describe('por el motor real, el peor caso', () => {
  for (const [familia, pl, nuevo, gasto] of CASOS) {
    it(`🔴 ${familia}: con 2,50 se corta a medias; con ${nuevo} entrega (gasto ${gasto})`, () => {
      expect(peorCaso(pl, familia, 2.5).accion).toBe('cierre_por_tope')
      expect(peorCaso(pl, familia, nuevo)).toEqual({ accion: 'fin', gasto })
    })
  }
  it('🔴 concepto_mesa: la mesa corta en 1,2 × tope; con 5 (6,00) un encargo real terminado de 6,15 no entraba, con 7 (8,40) sí', () => {
    expect(techoDe(5)).toBeLessThan(6.15)
    // 17-nov · Sprint 4 · D (ADENDA 4): el vigente subió a 10 (crítica + brief largo); 202611170900 sigue diciendo 7 (historia)
    // 18-nov · 3 × lo medido: la gran idea real costó 5,93 → 17,79 (la fila la pone la 202611181700)
    expect(TOPE_DE_LA_MESA_DE_CONCEPTO_USD).toBe(17.79)
    expect(CONCEPTO_MESA.limites.tope_encargo_usd).toBe(TOPE_DE_LA_MESA_DE_CONCEPTO_USD)
    expect(TOPE_DE_LA_MESA_DE_CONCEPTO_USD).toBeGreaterThanOrEqual(6.15 + 2 * 0.79 + 0.07 + 0.6) // peor caso + reserva de un turno = 8,40
    expect(techoDe(7)).toBeGreaterThanOrEqual(6.15)
  })
})

describe('202611170900 · la migración', () => {
  it('🔴 los 4 topes nuevos son los de la cuenta y caben bajo el techo de la base (50)', () => {
    const valores = /FROM \(VALUES ([^\n]*)\) AS n\(familia, tope, reserva\)/.exec(MIG)![1]
    expect(valores).toBe("('post_img', 4::numeric, 2.5::numeric), ('kit_historias', 5::numeric, 2.5::numeric), ('carrusel_ig_v1', 7::numeric, 2.5::numeric), ('concepto_mesa', 7::numeric, NULL::numeric)")
    for (const [f, , nuevo] of CASOS) expect(valores).toContain(`('${f}', ${nuevo}::numeric`)
    expect(valores).toContain(`('concepto_mesa', 7::numeric`)
  })
  it('🔴 la campaña no cambia: las 3 de pieza llevan reserva 2,5 (lo que hoy reserva); concepto (con historia) no lleva dato', () => {
    expect(MIG).toContain("'{reserva_por_pieza_usd}', to_jsonb(n.reserva)")
    expect(MIG).toContain('CASE WHEN n.reserva IS NULL THEN')
  })
  it('🔴 un solo UPDATE; guardas (vivos · los 4 topes de hoy exactos) ANTES; comprobación después; columna y llave juntas; nada se enciende ni se borra', () => {
    const s = sentencias(MIG)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
    const vivos = s.indexOf("IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN")
    expect(vivos).toBeGreaterThan(0)
    expect(vivos).toBeLessThan(upd)
    expect(s.indexOf('IS DISTINCT FROM 4 THEN')).toBeLessThan(upd)
    expect(s.slice(upd)).toContain('IS DISTINCT FROM 4 THEN')
    expect(s).toMatch(/SET tope_encargo_usd = n\.tope,\n\s+limites = CASE/)
    expect(s).toContain('version = t.version + 1')
    expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP|INSERT|ALTER)\b|familias_activas|activo\s*=|pasos\s*=/)
  })
  it('la reversa devuelve 2,5 · 2,5 · 2,5 · 5 y quita el dato de reserva, exigiendo lo que dejó la migración', () => {
    const s = sentencias(REV)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s).toContain("FROM (VALUES ('post_img', 2.5::numeric), ('kit_historias', 2.5::numeric), ('carrusel_ig_v1', 2.5::numeric), ('concepto_mesa', 5::numeric)) AS n(familia, tope)")
    expect(s).toContain("limites = jsonb_set(t.limites - 'reserva_por_pieza_usd', '{tope_encargo_usd}', to_jsonb(n.tope))")
    expect(s.indexOf('IS DISTINCT FROM 4 THEN')).toBeLessThan(s.indexOf('UPDATE public.oficina_tipos_de_grupo'))
  })
})

describe('202611172200 · el tope de la gran idea 7 → 10 (Sprint 4 · D · ADENDA 4)', () => {
  const MIG10 = leer('migrations', '202611172200_oficina_tope_de_la_gran_idea.sql')
  const REV10 = leer('reversas', '202611172200_oficina_tope_de_la_gran_idea_REVERSA.sql')
  it('🔴 la migración puso en la fila el tope de entonces, 10 (columna y límite; el de hoy lo pone la 202611181700), exige el leído (7) y frena con una gran idea en curso', () => {
    expect(MIG10).toContain('SET tope_encargo_usd = 10,')
    expect(MIG10).toContain("jsonb_build_object('tope_encargo_usd', 10)")
    expect(MIG10).toMatch(/g\.tope_encargo_usd = 7 AND \(g\.limites->>'tope_encargo_usd'\)::numeric = 7/)
    expect(MIG10).toMatch(/e\.estado IN \('abierto', 'en_paso'\) AND e\.familia = 'concepto_mesa'/)
  })
  it('la reversa vuelve a 7 en columna y límite', () => {
    expect(REV10).toContain('SET tope_encargo_usd = 7,')
    expect(REV10).toContain("jsonb_build_object('tope_encargo_usd', 7)")
  })
})

describe('202611181700 · el tope de la gran idea al triple de lo medido (18-nov: 10 → 17,79)', () => {
  const MIG_1700 = leer('migrations', '202611181700_oficina_topes_al_triple_de_lo_medido.sql')
  const REV_1700 = leer('reversas', '202611181700_oficina_topes_al_triple_de_lo_medido_REVERSA.sql')
  const MIG10 = leer('migrations', '202611172200_oficina_tope_de_la_gran_idea.sql')
  it('🔴 la migración pone en la fila EXACTAMENTE el tope del código (columna y límite) y comprueba al final que quedó', () => {
    const nuevo = /UPDATE public\.oficina_tipos_de_grupo g\nSET tope_encargo_usd = ([\d.]+), limites = g\.limites \|\| jsonb_build_object\('tope_encargo_usd', ([\d.]+)\), version = g\.version \+ 1\nWHERE g\.tipo = 'concepto_mesa';/.exec(MIG_1700)
    expect(nuevo).not.toBeNull()
    expect([Number(nuevo![1]), Number(nuevo![2])]).toEqual([TOPE_DE_LA_MESA_DE_CONCEPTO_USD, TOPE_DE_LA_MESA_DE_CONCEPTO_USD])
    expect(MIG_1700).toMatch(new RegExp(`g\\.tipo = 'concepto_mesa' AND g\\.tope_encargo_usd = ${TOPE_DE_LA_MESA_DE_CONCEPTO_USD} AND \\(g\\.limites->>'tope_encargo_usd'\\)::numeric = ${TOPE_DE_LA_MESA_DE_CONCEPTO_USD}\\) THEN\\n\\s+RAISE EXCEPTION '202611181700: concepto_mesa no quedó`))
    expect(MIG_1700).toMatch(/^BEGIN;$/m)
    expect(MIG_1700).toMatch(/^COMMIT;$/m)
  })
  it('🔴 exige el leído (10, el que dejó la 202611172200) en columna y límite, y frena con un encargo vivo de las mesas', () => {
    const leido = /g\.tipo = 'concepto_mesa' AND g\.tope_encargo_usd = ([\d.]+) AND \(g\.limites->>'tope_encargo_usd'\)::numeric = ([\d.]+)\) THEN\n\s+RAISE EXCEPTION '202611181700: el tope de concepto_mesa no es el leído/.exec(MIG_1700)
    expect(leido).not.toBeNull()
    expect([Number(leido![1]), Number(leido![2])]).toEqual([10, 10])
    expect(MIG10).toContain(`SET tope_encargo_usd = ${leido![1]},`)
    expect(MIG_1700).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa'\)\) THEN\n\s+RAISE EXCEPTION '202611181700: hay un encargo vivo/)
    // las guardas van ANTES de los cambios
    expect(MIG_1700.indexOf('hay un encargo vivo')).toBeLessThan(MIG_1700.indexOf('UPDATE public.oficina_tipos_de_grupo'))
  })
  it('la reversa vuelve a 10 en columna y límite, exige el 17,79 que dejó la migración y se niega con encargos vivos', () => {
    expect(REV_1700).toContain("SET tope_encargo_usd = 10, limites = g.limites || jsonb_build_object('tope_encargo_usd', 10), version = g.version + 1 WHERE g.tipo = 'concepto_mesa';")
    expect(REV_1700).toContain(`g.tipo = 'concepto_mesa' AND g.tope_encargo_usd = ${TOPE_DE_LA_MESA_DE_CONCEPTO_USD})`)
    expect(REV_1700).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('brief_mesa', 'concepto_mesa', 'carrusel_mesa', 'kit_mesa', 'post_mesa'\)\) THEN\n\s+RAISE EXCEPTION 'reversa 202611181700: hay un encargo vivo/)
  })
})
