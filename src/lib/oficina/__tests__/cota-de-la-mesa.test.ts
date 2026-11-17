/**
 * 17-nov · GO Lenovo (encendido de propuestas en imagen) · «nunca cortar a medias; mejor un tope que cubra el trabajo»: lo requerido cuenta los turnos de la mesa con
 * SU COTA. La cota es DATO de la plantilla (`limites.cota_de_la_mesa_usd`, por pasada); la mesa la hace cumplir (cierra con lo que hay: una integración y a dibujar)
 * y la cuenta del tope reserva esa cota por cada pasada (la primera y cada vuelta que no se salta). Sin el dato, todo como hoy. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirDecisionDelDueno } from '../orquestador'
import { cotaAgotada } from '../mesa/planificador'
import { cotaDeLaMesaEnCurso } from '../mesa/orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { conPropuestasDeImagen, CARRUSEL_MESA_CON_PROPUESTAS, COTA_DE_LA_MESA_CON_PROPUESTAS_USD, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS } from '../plantillas/imagen-propuestas'
import { coberturaDelTope, costoDeVolver, cotaDeLaMesa, loQueSigueDeLaMesa, pasadasDeLaMesa, reservaPorPasadaDeLaMesa } from '../topes-por-duracion'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { COTAS, type EstadoMesa } from '../mesa/tipos'
import type { Estado, Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, POR_OMISION, jugar, parteCon, seccionesDeLaminas, type Turno } from './mesa-arnes'

const est = (gasto?: number): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: [], direccion: 'd', turnos: 3, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', ...(gasto !== undefined ? { gasto_de_los_turnos_usd: gasto } : {}) } as unknown as EstadoMesa)
const motor = (vueltas: Record<string, number> = {}, ultimo = -1): Estado => ({ ultimo, pasos_ejecutados: 0, gasto_usd: 0, vueltas, artefactos: {}, fichas: [] } as unknown as Estado)

describe('la cota de la mesa · el dato', () => {
  it('cotaDeLaMesa: número > 0 o null; reservaPorPasadaDeLaMesa: la cota, o un turno sin el dato (como hoy)', () => {
    expect(cotaDeLaMesa(CARRUSEL_MESA_CON_PROPUESTAS)).toBe(COTA_DE_LA_MESA_CON_PROPUESTAS_USD)
    expect(cotaDeLaMesa(CARRUSEL_MESA)).toBeNull()
    expect(cotaDeLaMesa({ limites: { cota_de_la_mesa_usd: 0 } } as unknown as Plantilla)).toBeNull()
    expect(cotaDeLaMesa({ limites: { cota_de_la_mesa_usd: '2' } } as unknown as Plantilla)).toBeNull()
    expect(reservaPorPasadaDeLaMesa(CARRUSEL_MESA_CON_PROPUESTAS)).toBe(2.5)
    expect(reservaPorPasadaDeLaMesa(CARRUSEL_MESA)).toBe(COTAS.RESERVA_POR_TURNO_USD)
  })
  it('pasadasDeLaMesa: 1 + las vueltas a la mesa ya contadas + la que está en curso', () => {
    const pl = CARRUSEL_MESA_CON_PROPUESTAS
    expect(pasadasDeLaMesa(pl, motor())).toBe(1)
    expect(pasadasDeLaMesa(pl, motor({ aprobar_propuestas: 1 }))).toBe(2)
    // en curso: el último paso hecho es la aprobación y pidió volver (su condición se cumple): esa pasada ya cuenta
    const iAprobar = pl.pasos.findIndex((p) => p.clave === 'aprobar_propuestas')
    const enCurso = { ...motor({}, iAprobar), artefactos: { aprobacion_propuestas: { version: 1, datos: { vuelve_a_la_mesa: true } } } } as unknown as Estado
    expect(pasadasDeLaMesa(pl, enCurso)).toBe(2)
    // una vuelta de otro paso que NO vuelve a la mesa no cuenta
    expect(pasadasDeLaMesa(pl, motor({ chequeos: 3 }))).toBe(1)
  })
})

describe('la mesa HACE CUMPLIR su cota (cierra con lo que hay)', () => {
  const ctx = { gasto_usd: 0, tope_usd: 100, hayImagenGenerada: false, tipo: 'carrusel' as const, reserva_posterior_usd: 0 }
  it('🔴 un turno más que no cabe en lo permitido → cota agotada; si cabe, sigue', () => {
    expect(cotaAgotada(est(2), { ...ctx, cota_de_la_mesa: { gastado: 2, permitido: 2.5 } })).toMatch(/pasa su cota \(2.5\)/)
    expect(cotaAgotada(est(2), { ...ctx, cota_de_la_mesa: { gastado: 2, permitido: 2.5 } })).toMatch(/llevan 2.00/)
    // justo en el borde (1,9 + 0,6 = 2,5) todavía cabe
    expect(cotaAgotada(est(1.9), { ...ctx, cota_de_la_mesa: { gastado: 1.9, permitido: 2.5 } })).toBeNull()
    expect(cotaAgotada(est(1.8), { ...ctx, cota_de_la_mesa: { gastado: 1.8, permitido: 2.5 } })).toBeNull()
    // sin la cota: como hoy
    expect(cotaAgotada(est(50), ctx)).toBeNull()
  })
  it('🔴 cotaDeLaMesaEnCurso: lo gastado por los turnos contra la cota × las pasadas; sin el dato, nada', () => {
    expect(cotaDeLaMesaEnCurso(CARRUSEL_MESA_CON_PROPUESTAS, est(1.2), motor())).toEqual({ cota_de_la_mesa: { gastado: 1.2, permitido: 2.5 } })
    expect(cotaDeLaMesaEnCurso(CARRUSEL_MESA_CON_PROPUESTAS, est(3.1), motor({ aprobar_propuestas: 1 }))).toEqual({ cota_de_la_mesa: { gastado: 3.1, permitido: 5 } })
    expect(cotaDeLaMesaEnCurso(CARRUSEL_MESA_CON_PROPUESTAS, est(), motor())).toEqual({ cota_de_la_mesa: { gastado: 0, permitido: 2.5 } })
    expect(cotaDeLaMesaEnCurso(CARRUSEL_MESA, est(1), motor())).toEqual({})
  })
})

describe('🔴 la cuenta del tope reserva la COTA por cada pasada de la mesa', () => {
  it('costoDeVolver a la mesa: los pasos que se repiten + la cota (no un turno)', () => {
    const pl = CARRUSEL_MESA_CON_PROPUESTAS
    const aprobar = pl.pasos.find((p) => p.clave === 'aprobar_propuestas')!
    const borrador = Number(pl.pasos.find((p) => p.clave === 'borrador_imagen')!.tope_usd)
    expect(costoDeVolver(pl, aprobar)).toBe(+(borrador + 2.5).toFixed(6))
  })
  it.each([['kit', KIT_MESA_CON_PROPUESTAS], ['carrusel', CARRUSEL_MESA_CON_PROPUESTAS], ['foto', POST_MESA_CON_PROPUESTAS]])('%s con propuestas: lo requerido = antes de la mesa + su cota + lo que sigue (rondas con su cota) y el tope lo cubre', (_n, pl) => {
    const c = coberturaDelTope(pl, Number(pl.limites.tope_encargo_usd))
    const antes = pl.pasos.slice(0, pl.pasos.findIndex((p) => p.funcion === 'mesa')).reduce((a, p) => a + (Number(p.tope_usd) || 0), 0)
    expect(c.requerido).toBeCloseTo(antes + 2.5 + loQueSigueDeLaMesa(pl, { vueltas: {} }), 6)
    expect(c.cubre).toBe(true)
    expect(c.detalle).toContain('la cota de la mesa 2.5')
    expect(c.detalle).toContain('su cota + lo que sigue')
  })
  it('🔴 con un tope base chico, el tope SUBE a lo que pide la cuenta (no se queda en el de hoy × 3) y la cubre', () => {
    const chica = conPropuestasDeImagen({ ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, tope_encargo_usd: 1 } } as Plantilla)
    const sinTope = { ...chica, limites: { ...chica.limites, tope_encargo_usd: 0 } } as Plantilla
    const req = coberturaDelTope(sinTope, 0).requerido
    expect(req).toBeGreaterThan(3)
    expect(chica.limites.tope_encargo_usd).toBe(Math.ceil(req))
    expect(coberturaDelTope(chica, Number(chica.limites.tope_encargo_usd)).cubre).toBe(true)
  })
  it('sin el dato, la cuenta es la de hoy (un turno de la mesa)', () => {
    const c = coberturaDelTope(CARRUSEL_MESA, Number(CARRUSEL_MESA.limites.tope_encargo_usd))
    expect(c.detalle).toContain(`un turno de la mesa ${COTAS.RESERVA_POR_TURNO_USD}`)
  })
  it('las plantillas: el tope sale de la cuenta (redondeado hacia arriba), nunca menos que el de hoy × 3', () => {
    for (const pl of [KIT_MESA_CON_PROPUESTAS, CARRUSEL_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS]) {
      const sinTope = { ...pl, limites: { ...pl.limites, tope_encargo_usd: 0 } } as Plantilla
      expect(pl.limites.tope_encargo_usd).toBe(Math.max(15, Math.ceil(coberturaDelTope(sinTope, 0).requerido)))
    }
  })
})

describe('🔴 de punta a punta: turnos CAROS no cortan el encargo a medias', () => {
  it('carrusel con propuestas, cada turno cuesta 0,5: la mesa cierra con lo que hay al llegar a su cota, presenta, el dueño pide cambios, vuelve (otra cota), aprueba y la pieza llega sin cortarse', async () => {
    const T = ['El plato de la mañana', 'Lo de siempre, distinto', 'Hoy se cocina aquí']
    const prop = (i: number) => [`# Propuesta ${i + 1} · ${T[i]}`, `Concepto: c${i + 1} · Por qué: p${i + 1}`, seccionesDeLaminas(LAMINAS_OK.map(([rol, t, x, img], k) => [rol, k === 0 ? T[i] : t, x, img])), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato'].join('\n')
    const TRES = [prop(0), prop(1), prop(2), CITAS_COMPLETAS].join('\n')
    const ING = '## P1-hook\nuno\n## P2-hook\ndos\n## P3-hook\ntres'
    const pl = CARRUSEL_MESA_CON_PROPUESTAS
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: pl })
    M.P.mesa = crearMesaEnMemoria(DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t)))
    const tope = Number(pl.limites.tope_encargo_usd)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa', tope_usd: tope }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const caro = (t: Turno) => ({ ...(t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: TRES } : t.tipo === 'redactar_prompts' ? { texto: ING } : POR_OMISION(t)), costo_usd: 0.5 })
    const mesa = () => M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
    const r1 = await jugar(M, id, a, caro, 80)
    expect(r1.ultima.cuerpo.accion).toBe('esperar_dueno')
    // la 1.ª pasada no pasó su cota (2,5) más lo que se reserva por un turno (la integración)
    expect(mesa().gasto_de_los_turnos_usd!).toBeLessThanOrEqual(2.5 + COTAS.RESERVA_POR_TURNO_USD)
    const d = await recibirDecisionDelDueno(M.P, id, { decision: 'cambios', ronda: 1, observaciones: 'más cerca' })
    const r2 = await jugar(M, id, d, caro, 80)
    expect(r2.ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 2 })
    expect(mesa().gasto_de_los_turnos_usd!).toBeLessThanOrEqual(2 * 2.5 + COTAS.RESERVA_POR_TURNO_USD)
    const ap = await recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 2, propuesta_id: 'P2' })
    const fin = await jugar(M, id, ap, caro, 80)
    expect(fin.ultima.cuerpo).toMatchObject({ estado: 'cerrado', decision: { estado: 'aprobada', propuesta_id: 'P2' } })
    expect(JSON.stringify(fin.ultima.cuerpo.desacuerdos ?? [])).not.toMatch(/tope/)
    expect(M.encargos.get(id)!.estado_del_motor.gasto_usd).toBeLessThanOrEqual(tope)
  })
})
