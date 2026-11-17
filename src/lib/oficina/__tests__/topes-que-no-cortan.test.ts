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
    expect(TOPE_DE_LA_MESA_DE_CONCEPTO_USD).toBe(7)
    expect(CONCEPTO_MESA.limites.tope_encargo_usd).toBe(7)
    expect(techoDe(7)).toBeGreaterThanOrEqual(6.15)
  })
})

describe('202611170900 · la migración', () => {
  it('🔴 los 4 topes nuevos son los de la cuenta y caben bajo el techo de la base (50)', () => {
    const valores = /FROM \(VALUES ([^\n]*)\) AS n\(familia, tope, reserva\)/.exec(MIG)![1]
    expect(valores).toBe("('post_img', 4::numeric, 2.5::numeric), ('kit_historias', 5::numeric, 2.5::numeric), ('carrusel_ig_v1', 7::numeric, 2.5::numeric), ('concepto_mesa', 7::numeric, NULL::numeric)")
    for (const [f, , nuevo] of CASOS) expect(valores).toContain(`('${f}', ${nuevo}::numeric`)
    expect(valores).toContain(`('concepto_mesa', ${TOPE_DE_LA_MESA_DE_CONCEPTO_USD}::numeric`)
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
