/**
 * Los DOS costos por venta (CC#3 · 19-oct · Parte B del encargo de Lenovo): solo pauta y plan completo, siempre juntos, desde el código.
 * US$ 0: puro y con agentes simulados. El caso real es una COPIA de solo lectura del bloque de la corrida del 19-oct (finanzas_artefactos).
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/finanzas/bloque-real-19-oct.json'
import { dosCostos, monto, textoDosCostos, validarTextoDeCostos } from '../src/lib/finanzas/dos-costos'
import { cerrar, textoDelTurno } from '../src/lib/finanzas/conversa/orquestador'
import { montosDeclarados, resumenDelBloque } from '../src/lib/finanzas/resumen'
import type { Bloque } from '../src/lib/finanzas/tipos'
import type { EncargoDeConversa, PuertosDeConversa } from '../src/lib/finanzas/conversa/puertos'

const BLOQUE = fixture.bloque as unknown as Bloque
const ENTRADA = fixture.entrada
const clonar = <T,>(x: T): T => structuredClone(x)

describe('las cifras salen del bloque (caso real del 19-oct)', () => {
  const d = dosCostos(BLOQUE, ENTRADA)
  it('solo pauta 14,63 y plan completo 27,08, cada uno con su veredicto de equilibrio', () => {
    expect(d.solo_pauta).toBe(14.63)
    expect(d.plan_completo).toBe(27.08)
    expect(d.contribucion_por_venta).toBe(19.26)
    expect(d.equilibrio_solo_pauta).toBe('se_paga')
    expect(d.equilibrio_plan_completo).toBe('no_se_paga')
    expect(d.meta_sugerida_semana).toBeNull()
  })
  it('la primera venta deja lo de ticket × margen, sin periodos', () => {
    expect(d.deja_primera_venta).toBeCloseTo(4.81, 1)
  })
  it('coincide con la alerta que ya traía el bloque (no es otra cuenta)', () => {
    const alerta = BLOQUE.alertas.find((a) => a.includes('con marca y producción'))
    expect(alerta).toContain(String(d.plan_completo))
  })
  it('el texto para el dueño lleva los dos costos y dice que con el completo el equilibrio no existe', () => {
    const t = textoDosCostos(d).join(' ')
    expect(t).toContain('14,63')
    expect(t).toContain('27,08')
    expect(t).toContain('el equilibrio no existe con estos supuestos')
  })
})

describe('el validador falla al texto que cita solo el optimista', () => {
  const d = dosCostos(BLOQUE, ENTRADA)
  it('cita 14,69 (el CAC solo de pauta) sin el 27,08: falla', () => {
    const r = validarTextoDeCostos('CAC real $14.63; el break-even llega en 3,4 visitas y el plan se paga.', d)
    expect(r.ok).toBe(false)
    expect(r.errores[0]).toContain('27,08')
  })
  it('el redondeo del jefe (14,6 o 14,69) también cuenta como citar el optimista', () => {
    expect(validarTextoDeCostos('costo por venta 14,6', d).ok).toBe(false)
    expect(validarTextoDeCostos('CAC base $14.69', d).ok).toBe(false)
  })
  it('cita los dos: pasa; no cita ninguno: pasa', () => {
    expect(validarTextoDeCostos('solo pauta 14,63 y plan completo 27,08: con el completo no se paga', d).ok).toBe(true)
    expect(validarTextoDeCostos('el margen real es 40 % y la retención es de 4 visitas', d).ok).toBe(true)
  })
  it('cita solo el completo: pasa (el pesimista suelto no engaña)', () => {
    expect(validarTextoDeCostos('con marca y producción cada venta cuesta 27,08', d).ok).toBe(true)
  })
  it('un número lejano al optimista no lo confunde', () => {
    expect(validarTextoDeCostos('presupuesto 191 por semana, 200 confirmados, 17 % del ingreso', d).ok).toBe(true)
  })
})

describe('bordes del cálculo', () => {
  it('sin ticket ni margen: los dos costos salen igual y el equilibrio dice «sin base»', () => {
    const b = clonar(BLOQUE)
    b.equilibrio = { ...b.equilibrio, contribucion_por_venta: null, motivo: 'sin ticket o margen' }
    const d = dosCostos(b)
    expect(d.plan_completo).toBe(27.08)
    expect(d.equilibrio_solo_pauta).toBe('sin_base')
    expect(d.equilibrio_plan_completo).toBe('sin_base')
    expect(textoDosCostos(d).join(' ')).toContain('sin ticket o margen no se puede decir')
  })
  it('si el plan no añade ventas, el completo no se calcula y se dice (no se inventa un número)', () => {
    const b = clonar(BLOQUE)
    b.cifras.meta_incremental_por_semana = { ...b.cifras.meta_incremental_por_semana, valor: 0 }
    const d = dosCostos(b)
    expect(d.plan_completo).toBeNull()
    expect(textoDosCostos(d).join(' ')).toContain('no añade ventas')
    expect(validarTextoDeCostos('costo 14,63', d).ok).toBe(true)
  })
  it('si una meta mayor sí paga el plan completo, lo dice con esa meta', () => {
    const b = clonar(BLOQUE)
    b.equilibrio = { ...b.equilibrio, meta_de_equilibrio_semana: 180, cubre: false, meta_sugerida_semana: 181, motivo: null }
    const d = dosCostos(b)
    expect(d.equilibrio_plan_completo).toBe('solo_con_otra_meta')
    expect(d.meta_sugerida_semana).toBe(181)
    expect(textoDosCostos(d).join(' ')).toContain('meta de 181 por semana')
  })
  it('si el equilibrio del plan completo se cubre, lo dice', () => {
    const b = clonar(BLOQUE)
    b.equilibrio = { ...b.equilibrio, meta_de_equilibrio_semana: 100, cubre: true, meta_sugerida_semana: null, motivo: null }
    expect(dosCostos(b).equilibrio_plan_completo).toBe('se_paga')
  })
  it('borde: si la contribución es IGUAL al costo solo de pauta, se paga (queda decidido: cubrir el costo es pagarlo)', () => {
    const b = clonar(BLOQUE)
    b.equilibrio = { ...b.equilibrio, contribucion_por_venta: b.costo_por_venta }
    expect(dosCostos(b).equilibrio_solo_pauta).toBe('se_paga')
    b.equilibrio = { ...b.equilibrio, contribucion_por_venta: b.costo_por_venta - 0.01 }
    expect(dosCostos(b).equilibrio_solo_pauta).toBe('no_se_paga')
  })
  it('si cada venta deja menos que el costo solo de pauta, ni el optimista se paga', () => {
    const b = clonar(BLOQUE)
    b.equilibrio = { ...b.equilibrio, contribucion_por_venta: 10 }
    expect(dosCostos(b).equilibrio_solo_pauta).toBe('no_se_paga')
  })
  it('el formato de dinero no depende del entorno: coma decimal y dos decimales', () => {
    expect(monto(14.6)).toBe('14,60')
    expect(monto(27.075)).toMatch(/^27,0[78]$/)
  })
})

describe('el resumen del bloque y los montos declarados', () => {
  it('el resumen que lee el plan lleva los dos costos', () => {
    const t = resumenDelBloque(BLOQUE).lineas.join('\n')
    expect(t).toContain('solo pauta: 14,63')
    expect(t).toContain('plan completo (pauta, marca y producción): 27,08')
  })
  it('el 27,08 es un monto declarado: el chequeo de cifras del plan no lo rechaza', () => {
    expect(montosDeclarados(BLOQUE)).toContain(27.08)
  })
})

describe('el cierre: lo que arma el código lleva los dos costos y el jefe no puede dejar solo el optimista', () => {
  const E = { id: 'enc-x', client_id: 'cliente-prueba', estado: 'en_curso', dry_run: true, semilla: { moneda: 'USD' } } as unknown as EncargoDeConversa
  const P = {} as PuertosDeConversa
  const arts = (acuerdo: Record<string, unknown>) => ({
    expediente: { datos: [] },
    bloque_2: { hay_bloque: true, bloque: BLOQUE, entrada: ENTRADA, huella: fixture.huella, cambio: true },
    acuerdo_2: { salida: 'sale', hallazgos: [], conflictos_resueltos: [], requiere_ronda_2: false, ...acuerdo },
    acuerdo: { requiere_ronda_2: true },
  })
  it('siempre trae costos_por_venta y el resumen con los dos, venga lo que venga del jefe', async () => {
    const r = await cerrar(P, E, arts({}) as never)
    const a = r.artefacto as Record<string, any>
    expect(a.costos_por_venta.solo_pauta).toBe(14.63)
    expect(a.costos_por_venta.plan_completo).toBe(27.08)
    expect(a.resumen_para_el_dueno.join(' ')).toContain('14,63')
    expect(a.resumen_para_el_dueno.join(' ')).toContain('27,08')
    expect(a).not.toHaveProperty('resumen_lleva_los_dos_costos')
    expect(a.alerta_texto_optimista).toBeNull()
  })
  it('el jefe cita solo el optimista: el cierre queda «con alerta» y lo registra', async () => {
    const r = await cerrar(P, E, arts({ dato_que_no_bloquea: 'El break-even es 3,4 visitas con CAC base $14.69; ROI positivo.' }) as never)
    const a = r.artefacto as Record<string, any>
    expect(a.salida).toBe('sale_con_alerta')
    expect(a.alerta_texto_optimista).toHaveLength(1)
    expect(a.resumen_para_el_dueno.join(' ')).toContain('27,08')
  })
  it('el optimista escondido en un hallazgo también se detecta', async () => {
    const r = await cerrar(P, E, arts({ hallazgos: [{ severidad: 'medio', que: 'Costo por venta 14,63 cubierto por el LTV.', estado: 'resuelto' }] }) as never)
    expect((r.artefacto as Record<string, any>).alerta_texto_optimista).not.toBeNull()
  })
  it('el turno de la firma publica los dos costos en el hilo; sin ellos (cierre viejo) no inventa nada', async () => {
    const r = await cerrar(P, E, arts({}) as never)
    const paso = { clave: 'firma', tipo: 'codigo', ronda: 1 } as never
    const t = textoDelTurno(paso, 17, r.artefacto, null)
    expect(t).toContain('solo pauta: 14,63')
    expect(t).toContain('plan completo (pauta, marca y producción): 27,08')
    expect(textoDelTurno(paso, 17, { estado: 'firmado' }, null)).not.toContain('plan completo')
  })
  it('el jefe cita los dos: la salida que emitió se respeta', async () => {
    const r = await cerrar(P, E, arts({ dato_que_no_bloquea: 'Solo pauta 14,63; con marca y producción 27,08: con el completo no se paga.' }) as never)
    const a = r.artefacto as Record<string, any>
    expect(a.salida).toBe('sale')
    expect(a.alerta_texto_optimista).toBeNull()
  })
})
