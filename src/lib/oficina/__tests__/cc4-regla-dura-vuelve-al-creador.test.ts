/**
 * 18-nov · GO Lenovo 13:52Z · LA REGLA DURA ROTA VUELVE AL CREADOR (grupo 1 de `PLAN-CC4-jefatura-la-regla-dura-vuelve-al-creador.md`) · el DATO y sus frenos:
 *  · la migración 202611181530 escribe EXACTAMENTE la vuelta del código en las cuatro familias con mesa, no pisa lo que no espera y su reversa devuelve lo de antes;
 *  · la vuelta también tiene que caber en los PASOS de la plantilla (no solo en el dinero);
 *  · lo exacto se autocorrige también en el video (el pie que se publica). US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ejecutarCodigoV } from '../orquestador-video'
import { puedeVolverALaMesa } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { KIT_MESA, VUELTA_DE_LA_JEFATURA_A_LA_MESA } from '../plantillas/mesa'
import { FAMILIAS_CON_VUELTA_POR_REGLA_DURA, VUELTAS_POR_REGLA_DURA, VUELTA_POR_REGLA_DURA, conVueltaPorReglaDura } from '../plantillas/vuelta-por-regla-dura'
import { CLAVE_DEL_PASO_JEFATURA, avisoDeLaJefaturaALaMesa } from '../paso-jefatura'
import type { Estado, Plantilla } from '../tipos'
import { crearMemoria } from './memoria'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const MIG = fs.readFileSync(path.join(RAIZ, 'migrations', '202611181530_oficina_jefatura_vuelve_por_regla_dura.sql'), 'utf8')
const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611181530_oficina_jefatura_vuelve_por_regla_dura_REVERSA.sql'), 'utf8')
const tomar = (sql: string, d: string) => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

describe('el dato: la vuelta por regla dura', () => {
  it('🔴 la red de seguridad es 6 y la condición es la de siempre (la jefatura pidió volver a la mesa)', () => {
    expect(VUELTAS_POR_REGLA_DURA).toBe(6)
    expect(VUELTA_POR_REGLA_DURA).toEqual({ paso: 'mesa', max: 6, si: { tipo: 'si_artefacto', artefacto: 'respuesta_imagen', campo: 'vuelve_a_la_mesa', igual: true } })
    expect(FAMILIAS_CON_VUELTA_POR_REGLA_DURA).toEqual(['post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'])
  })
  it('se pone SOLO en el paso jefatura, sin cambiar el orden ni otro campo; sin mesa antes de la jefatura no hay a quién volver', () => {
    const con = conVueltaPorReglaDura(KIT_MESA)
    expect(con.pasos.map((p) => p.clave)).toEqual(KIT_MESA.pasos.map((p) => p.clave))
    con.pasos.forEach((p, i) => (p.clave === CLAVE_DEL_PASO_JEFATURA ? expect(p).toEqual({ ...KIT_MESA.pasos[i], vuelve_a: VUELTA_POR_REGLA_DURA }) : expect(p).toEqual(KIT_MESA.pasos[i])))
    const sinMesa: Plantilla = { ...KIT_MESA, pasos: KIT_MESA.pasos.filter((p) => p.clave !== 'mesa') }
    expect(() => conVueltaPorReglaDura(sinMesa)).toThrow(/no hay a quién devolver la pieza/)
  })
})

describe('la migración 202611181530 y su reversa', () => {
  it('🔴 escribe EXACTAMENTE la vuelta del código, en las cuatro familias y solo en el paso jefatura', () => {
    expect(tomar(MIG, 'vuelta')).toEqual(VUELTA_POR_REGLA_DURA)
    const s = sentencias(MIG)
    expect(s).toContain("WHERE t.familia IN ('post_mesa', 'carrusel_mesa', 'video_mesa', 'kit_mesa');")
    expect(s).toMatch(/CASE WHEN x\.p->>'clave' = 'jefatura' THEN x\.p \|\| jsonb_build_object\('vuelve_a'/)
    expect(s).toContain('ORDER BY x.i')
    // una sola sentencia que escribe
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s).not.toMatch(/\b(DELETE|INSERT|DROP|ALTER)\b/)
  })
  it('🔴 no pisa: se niega con encargos vivos, si falta un paso jefatura, si ya hay vuelta o si la de kit_mesa no es la de antes', () => {
    const s = sentencias(MIG)
    expect(s).toContain("estado IN ('abierto', 'en_paso')")
    expect(s).toContain('IS DISTINCT FROM 4::bigint')
    expect(s).toContain("AND p ? 'vuelve_a'")
    expect(tomar(MIG, 'antes')).toEqual(VUELTA_DE_LA_JEFATURA_A_LA_MESA)
  })
  it('🔴 la reversa devuelve lo de antes: kit_mesa con su vuelta de 1, las otras tres SIN vuelta; y solo si hoy está la de 202611181530', () => {
    expect(tomar(REV, 'antes')).toEqual(VUELTA_DE_LA_JEFATURA_A_LA_MESA)
    expect(tomar(REV, 'hoy')).toEqual(VUELTA_POR_REGLA_DURA)
    const s = sentencias(REV)
    expect(s).toContain("ELSE x.p - 'vuelve_a' END ORDER BY x.i")
    expect(s).toContain("WHEN t.familia = 'kit_mesa' THEN")
    expect(s).toContain("estado IN ('abierto', 'en_paso')")
  })
})

describe('la vuelta también tiene que caber en los PASOS de la plantilla', () => {
  const pl = conVueltaPorReglaDura(KIT_MESA)
  const jef = pl.pasos.find((p) => p.clave === CLAVE_DEL_PASO_JEFATURA)!
  const iMesa = pl.pasos.findIndex((p) => p.clave === 'mesa')
  const limite = pl.pasos.length + pl.limites.margen
  const e = (pasos_ejecutados: number) => ({ ultimo: 0, pasos_ejecutados, gasto_usd: 0, vueltas: {}, fichas: [], artefactos: {} }) as unknown as Estado
  it('🔴 con lo que falta desde la mesa dentro de plantilla + margen, vuelve; un paso más y no (el motor cerraría a mitad de la vuelta)', () => {
    const justo = limite - (pl.pasos.length - iMesa) - 1
    expect(puedeVolverALaMesa(pl, jef, e(justo))!(0)).toBe(true)
    expect(puedeVolverALaMesa(pl, jef, e(justo + 1))!(0)).toBe(false)
  })
  it('sin vueltas que queden, no hay función (la plantilla no puede volver)', () => {
    expect(puedeVolverALaMesa(pl, jef, { ...e(0), vueltas: { [CLAVE_DEL_PASO_JEFATURA]: VUELTAS_POR_REGLA_DURA } } as Estado)).toBeUndefined()
  })
})

describe('lo exacto se autocorrige también en el video (el pie y el llamado que se publican)', () => {
  const PASO = VIDEO_MESA.pasos.find((p) => p.clave === 'chequeos')!
  const fuentes = { palabras_prohibidas: [], telefonos: ['0997 744 288'], handles: ['@la_marca'], precios: [], competidores: [], registro: 'tuteo' }
  const enc = (copy: Record<string, unknown>) => ({
    id: 'enc-v', client_id: 'cli', familia: 'video_mesa', dry_run: false,
    estado_del_motor: { ultimo: 1, pasos_ejecutados: 9, gasto_usd: 1, vueltas: {}, fichas: [], artefactos: {
      encargo: { version: 1, version_consumida: 1, datos: { brief: { texto: 'FILA', red: 'instagram', prohibido: [] }, proporcion: '9:16', F: { fuentes, fotos: [] } } },
      copy_video: { version: 1, version_consumida: 0, datos: copy },
      video: { version: 1, version_consumida: 0, datos: { video_url: 'https://v.test/1.mp4', costo_usd: 1, costo_estimado_usd: 1, simulado: true } },
    } } as unknown as Estado,
  })
  it('🔑 el pie con un teléfono y un @ ajenos sale corregido como versión nueva del copy, declarado, y sin la ficha «no es del cliente»', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, enc({ pie_de_foto: 'Pide al 0988 111 222', llamado: 'Escribe a @otra_marca', hashtags: [] }) as never, VIDEO_MESA, PASO)
    expect(s.res.otros_artefactos?.copy_video).toMatchObject({ pie_de_foto: 'Pide al 0997 744 288', llamado: 'Escribe a @la_marca' })
    expect((s.res.artefacto as { autocorregido?: string[] }).autocorregido).toHaveLength(2)
    expect((s.res.fichas ?? []).filter((f) => /no es del cliente/.test(f.que ?? ''))).toEqual([])
  })
  it('sin nada ajeno no hay versión nueva del copy', async () => {
    const M = crearMemoria({})
    const s = await ejecutarCodigoV(M.P, enc({ pie_de_foto: 'Pide al 0997 744 288', hashtags: [] }) as never, VIDEO_MESA, PASO)
    expect(s.res.otros_artefactos).toBeUndefined()
    expect((s.res.artefacto as { autocorregido?: string[] }).autocorregido).toBeUndefined()
  })
})

describe('19-nov · «nada se recorta» (G6/G9) también en la vuelta por regla dura', () => {
  it('🔴 30 reglas duras de 900 caracteres: van las 30, enteras, y sigue diciendo que la pieza queda en corrección', () => {
    const d = Array.from({ length: 30 }, (_, i) => `R${i + 1} ${'x'.repeat(900)} R${i + 1}-FINAL`)
    const t = avisoDeLaJefaturaALaMesa(d, true)
    for (let i = 1; i <= 30; i++) expect(t).toContain(`R${i}-FINAL`)
    expect(t).toMatch(/REGLAS DURAS siguen rotas/)
    expect(t).toMatch(/queda en corrección/)
  })
})
