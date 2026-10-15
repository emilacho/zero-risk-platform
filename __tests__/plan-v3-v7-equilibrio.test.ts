/**
 * Plan v3 · V7 · `meta_de_equilibrio_semana` en la calculadora + la obligación del paso `ajuste` de F8. Puro, sin modelo, US$ 0.
 *   · la función pura (borde: meta < equilibrio / = equilibrio / sin ticket / sin contribución / nunca / siempre);
 *   · la integración con `calcular`: es la MISMA cadena (a la meta de equilibrio el plan se paga) y no mueve la confianza ni el techo de hoy;
 *   · el ajuste ve el equilibrio calculado por código y, si la meta no lo cubre, DEBE responderlo.
 */
import { describe, expect, it } from 'vitest'
import { calcular, metaDeEquilibrio, SEMANAS_POR_MES } from '../src/lib/finanzas/calculadora'
import type { Entrada } from '../src/lib/finanzas/tipos'
import { equilibrioParaElAjuste, pedidoDelAgente } from '../src/lib/finanzas/conversa/orquestador'
import { respuestaDeEquilibrioValida, validarPlanteo } from '../src/lib/finanzas/conversa/esquemas'
import { PLANTILLA_FINANCIERA } from '../src/lib/finanzas/conversa/plantilla'

describe('V7 · la función pura', () => {
  // modelo: un fijo de 400 al mes + 50 por cada unidad de meta semanal ⇒ costo por venta decreciente
  const totalPara = (w: number) => 400 + 50 * w
  const E = (contribucion: number | null, meta: number, t = totalPara) => metaDeEquilibrio({ contribucion, meta, totalPara: t })
  it('encuentra el umbral: total(W) ÷ (W × 52/12) = contribución', () => {
    const r = E(20, 5)
    const w = r.meta_de_equilibrio_semana!
    expect(totalPara(w) / (w * SEMANAS_POR_MES)).toBeCloseTo(20, 1)
    expect(w).toBeGreaterThan(10)
    expect(w).toBeLessThan(12)
  })
  it('borde · meta < equilibrio: no cubre y propone la primera meta ENTERA que sí (supuesto)', () => {
    const r = E(20, 10)
    expect(r.cubre).toBe(false)
    expect(r.meta_sugerida_semana).toBe(Math.ceil(r.meta_de_equilibrio_semana!))
    expect(E(20, r.meta_sugerida_semana!).cubre).toBe(true)
  })
  it('borde · meta = equilibrio y meta > equilibrio cubren, sin sugerencia', () => {
    const w = E(20, 1).meta_de_equilibrio_semana!
    expect(E(20, w).cubre).toBe(true)
    expect(E(20, w).meta_sugerida_semana).toBeNull()
    expect(E(20, w * 3).cubre).toBe(true)
  })
  it('sin ticket o margen: null con su motivo (no se inventa)', () => {
    const r = E(null, 14)
    expect(r).toMatchObject({ meta_de_equilibrio_semana: null, cubre: null, meta_sugerida_semana: null })
    expect(r.motivo).toMatch(/sin ticket o margen/)
  })
  it('contribución cero o negativa: ninguna meta cubre', () => {
    for (const c of [0, -3]) expect(E(c, 14)).toMatchObject({ meta_de_equilibrio_semana: null, cubre: null })
    expect(E(0, 14).motivo).toMatch(/contribución positiva/)
  })
  it('si la venta nunca paga lo que cuesta venderla (costo lineal por encima de lo que deja): el equilibrio no existe', () => {
    const r = E(5, 14, (w) => 30 * w * SEMANAS_POR_MES) // cuesta 30 por venta y deja 5
    expect(r).toMatchObject({ meta_de_equilibrio_semana: null, cubre: null })
    expect(r.motivo).toMatch(/no existe/)
  })
  it('si cualquier meta cubre: 0 y cubre', () => {
    const r = E(100, 1, (w) => 2 * w * SEMANAS_POR_MES)
    expect(r).toMatchObject({ meta_de_equilibrio_semana: 0, cubre: true })
  })
})

describe('V7 · integrada con `calcular`', () => {
  const base: Entrada = {
    meta_por_semana: 14, pasos: [{ tasa: 0.3 }], ticket: 12, margen: 0.55, periodos: 1, costo_entrega: 0,
    referencia: { min: 0.4, max: 1.2, base: 0.8, tipo: 'supuesto', fuente: 'referencia de prueba' }, dias_activos_por_semana: 7,
    produccion: { monto: 600, origen: 'plan' }, canales: [],
  }
  const r = calcular(base)
  it('el bloque trae el equilibrio y las cifras como SUPUESTO', () => {
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.equilibrio.meta_de_equilibrio_semana).toBeGreaterThan(0)
    expect(r.cifras.meta_de_equilibrio_semana).toMatchObject({ tipo: 'supuesto' })
    expect(r.cifras.meta_de_equilibrio_semana.valor).toBe(r.equilibrio.meta_de_equilibrio_semana)
    expect(r.equilibrio.contribucion_por_venta).toBe(6.6)
  })
  it('es la MISMA cadena: a la meta de equilibrio el total del plan paga lo que dejan las ventas (±1 %)', () => {
    if (!r.ok) return
    const w = r.equilibrio.meta_de_equilibrio_semana!
    const en = calcular({ ...base, meta_por_semana: w })
    expect(en.ok).toBe(true)
    if (!en.ok) return
    const deja = w * SEMANAS_POR_MES * 6.6
    expect(Math.abs(en.reparto.total_mes - deja) / deja).toBeLessThan(0.01)
  })
  it('meta < equilibrio ⇒ alerta con la sugerida; meta ≥ equilibrio ⇒ sin alerta de equilibrio', () => {
    if (!r.ok) return
    const w = r.equilibrio.meta_de_equilibrio_semana!
    const debajo = calcular({ ...base, meta_por_semana: Math.max(0.5, w / 2) })
    expect(debajo.ok && debajo.equilibrio.cubre).toBe(false)
    expect(debajo.ok && debajo.alertas.some((a) => /no cubre el equilibrio/.test(a))).toBe(true)
    expect(debajo.ok && debajo.cifras.meta_sugerida_semana?.tipo).toBe('supuesto')
    const arriba = calcular({ ...base, meta_por_semana: w * 2 })
    expect(arriba.ok && arriba.equilibrio.cubre).toBe(true)
    expect(arriba.ok && arriba.alertas.some((a) => /no cubre el equilibrio/.test(a))).toBe(false)
    expect(arriba.ok && arriba.cifras.meta_sugerida_semana).toBeUndefined()
  })
  it('NO mueve la confianza del tablero ni el techo (el aviso es aparte)', () => {
    if (!r.ok) return
    const propias = Object.keys(r.cifras).filter((k) => k !== 'meta_de_equilibrio_semana' && k !== 'meta_sugerida_semana')
    expect(r.confianza.total).toBe(propias.length)
  })
  it('sin ticket o margen: el bloque sale como hoy, sin cifra de equilibrio y con su motivo', () => {
    const s = calcular({ ...base, ticket: null, margen: null })
    expect(s.ok).toBe(true)
    if (!s.ok) return
    expect(s.cifras.meta_de_equilibrio_semana).toBeUndefined()
    expect(s.equilibrio).toMatchObject({ meta_de_equilibrio_semana: null, cubre: null })
  })
  it('es determinista', () => {
    expect(JSON.stringify(calcular(base))).toBe(JSON.stringify(calcular(base)))
  })
})

describe('V7 · el paso `ajuste` de F8', () => {
  const rango = (min: number, max: number, base?: number) => ({ min, max, ...(base !== undefined ? { base } : {}) })
  const planteo = (meta: number) => ({ meta_por_semana: meta, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], produccion: { monto: 600 }, no_se: [], habla: { fpa: true, redes: true, busqueda: false, medicion: false, sin_pauta: false } })
  const arts = (meta: number): Record<string, Record<string, unknown>> => ({
    expediente: { referencias: [], evento_alterno: {}, pisos: {} },
    planteo: planteo(meta),
    consulta_fpa: { agente: 'finance-fpa-analyst', resumen: 'x', supuestos: { ticket: rango(10, 14, 12), margen: rango(0.5, 0.6, 0.55), tasa_cierre: rango(0.25, 0.35, 0.3) }, preguntas_a_otros: [], alertas: [] },
    consulta_redes: { agente: 'paid_media_paid_social_strategist', resumen: 'x', supuestos: { costo_por_resultado: rango(0.4, 1.2, 0.8) }, preguntas_a_otros: [], alertas: [] },
  })
  it('el ajuste recibe el equilibrio calculado por código, rotulado como supuesto', () => {
    const q = equilibrioParaElAjuste(arts(1), 1)
    expect(q).not.toBeNull()
    expect(q!.cubre).toBe(false)
    expect(q!.meta_de_equilibrio_semana).toBeGreaterThan(1)
    expect(q!.meta_sugerida_semana).toBeGreaterThanOrEqual(q!.meta_de_equilibrio_semana!)
    expect(q!.es).toMatch(/SUPUESTO/)
    expect(equilibrioParaElAjuste(arts(500), 1)!.cubre).toBe(true)
  })
  it('sin planteo o sin base todavía: null (no inventa un equilibrio)', () => {
    expect(equilibrioParaElAjuste({}, 1)).toBeNull()
    expect(equilibrioParaElAjuste({ planteo: planteo(5) }, 1)).toBeNull()
  })
  it('el pedido del ajuste declara la obligación y el contexto lleva el equilibrio', () => {
    const paso = PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'ajuste')!
    const tarea = pedidoDelAgente(paso, { equilibrio: equilibrioParaElAjuste(arts(1), 1) })
    expect(tarea).toMatch(/equilibrio_respuesta/)
    expect(tarea).toMatch(/subo_la_meta/)
    expect(tarea).toMatch(/"cubre":false/)
  })
  it('equilibrio_respuesta: forma válida; con decisión o motivo inválidos no vale', () => {
    expect(respuestaDeEquilibrioValida({ equilibrio_respuesta: { decision: 'subo_la_meta', motivo: 'la meta sube a 40 por la base de reservas' } })).toBe(true)
    expect(respuestaDeEquilibrioValida({ equilibrio_respuesta: { decision: 'mantengo_la_meta', motivo: '' } })).toBe(false)
    expect(respuestaDeEquilibrioValida({ equilibrio_respuesta: { decision: 'otra', motivo: 'x' } })).toBe(false)
    expect(respuestaDeEquilibrioValida({})).toBe(false)
    const base = planteo(10)
    expect(validarPlanteo({ ...base, equilibrio_respuesta: { decision: 'no_aplica', motivo: 'cubre' } }).ok).toBe(true)
    expect(validarPlanteo({ ...base, equilibrio_respuesta: { decision: 'xx', motivo: 'm' } }).ok).toBe(false)
    expect(validarPlanteo(base).ok).toBe(true)
  })
})
