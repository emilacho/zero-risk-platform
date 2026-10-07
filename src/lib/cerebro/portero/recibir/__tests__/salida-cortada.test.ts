/**
 * PASO 8 · arreglo de `salida_cortada` (renglón 6 de CC#3): 8 de 42 ingresos fallaron porque la respuesta del modelo pasó el tope de salida (2.000) con páginas de ~17-24 productos.
 * Estructural, sin subir el tope a ciegas: (1) un trozo no lleva más de 24 segmentos por llamada (la salida esperada es proporcional); (2) si una respuesta se corta, el trozo se DIVIDE en dos
 * y se reintenta solo ese trozo, de forma acotada; (3) solo si un trozo de un segmento sigue cortándose, o se agota lo acotado, el ingreso falla como antes. Modelo simulado, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { MAXIMO_DE_LLAMADAS_POR_INGRESO, MAX_SEGMENTOS_POR_PASADA, PROFUNDIDAD_MAXIMA_DE_DIVISION, recibir, type DepsDeRecibir } from '../recibir'
import { A, AHORA, BaseSimulada, crearModelo, cuerpo, numerosDelMensaje, respuestaJson, type Respuesta } from './casos'

const producto = (n: number): string => [`Repuesto ${n}`, `Precio: ${10 + n} USD`, `Garantía: ${6 + (n % 3)} meses`].join('\n\n')
const catalogo = (n: number): string => Array.from({ length: n }, (_x, i) => producto(i + 1)).join('\n\n')

/** un modelo cuya salida tiene capacidad para `capacidad` segmentos: si el trozo trae más, la respuesta SE CORTA (JSON a medias, stop_reason max_tokens) */
const conCapacidad = (capacidad: number, agrupa = 3): Respuesta => (p) => {
  const ns = numerosDelMensaje(p)
  if (ns.length > capacidad) return { texto: '{"fichas":[{"clase":"producto","titulo":"Repues', stop_reason: 'max_tokens', usage: { input_tokens: 2500, output_tokens: 2000 } }
  const fichas = []
  for (let i = 0; i < ns.length; i += agrupa) fichas.push({ clase: 'producto', titulo: `Cosa ${ns[i]}`, que_es: 'x', segmentos: ns.slice(i, i + agrupa), propiedad: 'propia', plazo: 'precio_oferta_horario' })
  return respuestaJson({ fichas, descartes: [] }, { input_tokens: 2500, output_tokens: 400 })
}

function armar(respuesta: Respuesta, extra: Partial<DepsDeRecibir> = {}) {
  const base = new BaseSimulada()
  const m = crearModelo(respuesta)
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId, ...extra }
  const correr = async (c: Record<string, unknown>) => { const r = await recibir(deps, c); return { ...r, c: r.cuerpo as Record<string, any> } }
  return { base, m, correr }
}
const firmasGuardadas = (base: BaseSimulada): string[] => base.fichas.flatMap((f) => f.firmas as string[])

describe('una página de 17, 24 y 40 productos entra COMPLETA (permanente: ≥ 17 productos)', () => {
  it.each([17, 24, 40])('%s productos: fichado, 0 residuales, cada segmento en una ficha, sin ninguna llamada cortada', async (n) => {
    const { base, m, correr } = armar(conCapacidad(MAX_SEGMENTOS_POR_PASADA))
    const r = await correr(cuerpo({ texto: catalogo(n) }))
    expect(r.c).toMatchObject({ estado: 'fichado', segmentos: { total: n * 3, residuales: 0, al_modelo: n * 3 } })
    expect(m.espia.peticiones.every((p) => numerosDelMensaje(p).length <= MAX_SEGMENTOS_POR_PASADA)).toBe(true)
    expect(m.espia.peticiones.length).toBe(Math.ceil((n * 3) / MAX_SEGMENTOS_POR_PASADA))
    expect(firmasGuardadas(base)).toHaveLength(n * 3)
    expect(r.c.divisiones ?? 0).toBe(0)
  })
  it('el tope de segmentos por pasada es 24 (la salida esperada es proporcional) y el tope de llamadas por ingreso es 12', () => {
    expect(MAX_SEGMENTOS_POR_PASADA).toBe(24)
    expect(MAXIMO_DE_LLAMADAS_POR_INGRESO).toBe(12)
  })
})

describe('la profundidad de la división está acotada (recomendación de CC#3: M3)', () => {
  it('24 → 12 → 6 → 3 → 2: un trozo de 2 segmentos que sigue cortándose YA NO se divide (profundidad 4), y el ingreso falla limpio con el reintento acotado', async () => {
    expect(PROFUNDIDAD_MAXIMA_DE_DIVISION).toBe(4)
    const { m, correr } = armar(conCapacidad(0), { /* sin tope de llamadas que estorbe */ })
    const r = await correr(cuerpo({ texto: catalogo(8) }))
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p).length)
    expect(largos.slice(0, 5)).toEqual([24, 12, 6, 3, 2])
    expect(largos.slice(5, 7)).toEqual([1, 3]) // el 1 es la otra mitad del 3; tras el trozo de 2 (profundidad 4) NO se baja a 1+1: sigue la otra mitad del 6
    expect(r.c.estado).toBe('fallido')
  })
})

describe('si una respuesta se corta, ese trozo se DIVIDE y se reintenta (no se tira el ingreso)', () => {
  it('un modelo con capacidad para 9 segmentos: el trozo de 24 se corta, se divide en 12+12, luego en 6+6, y todo queda fichado', async () => {
    const { base, m, correr } = armar(conCapacidad(9))
    const r = await correr(cuerpo({ texto: catalogo(8) })) // 24 segmentos: UN trozo
    expect(r.c.estado).toBe('fichado')
    expect(r.c.segmentos).toMatchObject({ total: 24, residuales: 0 })
    expect(firmasGuardadas(base)).toHaveLength(24)
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p).length)
    expect(largos.slice(0, 3)).toEqual([24, 12, 6])
    // las llamadas que SÍ terminaron nunca superan la capacidad del modelo; las que se cortaron fueron las de más de 9
    const terminadas = m.espia.registros.map((x, i) => ({ largo: largos[i], cortada: (x.metadata as Record<string, unknown>).motivo_de_caida === 'salida_cortada' })).filter((x) => !x.cortada)
    expect(terminadas.every((x) => x.largo <= 9)).toBe(true)
    expect(largos.filter((n) => n > 9).length).toBe(m.espia.registros.filter((x) => (x.metadata as Record<string, unknown>).motivo_de_caida === 'salida_cortada').length)
    expect(r.c.divisiones).toBeGreaterThanOrEqual(2)
    expect(r.c.pasadas).toBe(m.espia.peticiones.length)
  })
  it('lo cortado se COBRA y se REGISTRA (cada llamada, también la cortada) y el costo del ingreso las suma todas', async () => {
    const { m, correr } = armar(conCapacidad(9))
    const r = await correr(cuerpo({ texto: catalogo(8) }))
    expect(m.espia.registros).toHaveLength(m.espia.peticiones.length)
    const cortadas = m.espia.registros.filter((x) => (x.metadata as Record<string, unknown>).motivo_de_caida === 'salida_cortada')
    expect(cortadas.length).toBeGreaterThan(0)
    expect(cortadas.every((x) => x.status === 'completed')).toBe(true)
    expect(m.espia.registros.every((x) => x.workflow_id === 'wf-recibir' && x.client_id === A)).toBe(true)
    const suma = m.espia.registros.reduce((a, x) => a + Number(x.cost_usd), 0)
    expect(r.c.costo_usd).toBeCloseTo(suma, 8)
  })
  it('lo cortado NO entra a las fichas: ninguna ficha sale de una respuesta cortada, y no hay segmentos duplicados', async () => {
    const { base, correr } = armar(conCapacidad(9))
    await correr(cuerpo({ texto: catalogo(8) }))
    expect(firmasGuardadas(base)).toHaveLength(24) // cada posición, una sola vez (los textos de garantía se repiten entre productos: se cuentan posiciones, no textos distintos)
    expect(base.fichas.every((x) => !String(x.titulo).startsWith('Repues'))).toBe(true)
    expect(base.fichas.map((x) => String(x.contenido).split('\n\n').length).reduce((a, b) => a + b, 0)).toBe(24)
  })
  it('un trozo de UN solo segmento que sigue cortándose → el ingreso falla como antes (salida_cortada), sin fichas y con el original guardado', async () => {
    const { base, correr } = armar(conCapacidad(0))
    const r = await correr(cuerpo({ texto: 'Una sola línea de material' }))
    expect(r.c).toMatchObject({ estado: 'fallido' })
    expect(String(r.c.motivo)).toMatch(/salida_cortada/)
    expect(base.fichas).toHaveLength(0)
    expect(base.ingresos[0]).toMatchObject({ estado: 'fallido', material: 'Una sola línea de material' })
  })
  it('un modelo que SIEMPRE se corta: el reintento está acotado (≤ 12 llamadas), el costo no pasa del tope por ingreso, y el ingreso falla limpio', async () => {
    const { base, m, correr } = armar(conCapacidad(0))
    const r = await correr(cuerpo({ texto: catalogo(8) }))
    expect(m.espia.peticiones.length).toBeLessThanOrEqual(MAXIMO_DE_LLAMADAS_POR_INGRESO)
    expect(r.c.costo_usd).toBeLessThanOrEqual(0.4)
    expect(r.c.estado).toBe('fallido')
    expect(String(r.c.motivo)).toMatch(/salida_cortada/)
    expect(base.fichas).toHaveLength(0)
  })
  it('si el modelo falla (error) en un reintento, el ingreso cae como siempre, sin fichas a medias', async () => {
    let n = 0
    const { base, correr } = armar((p, k) => { n++; return n === 1 ? (conCapacidad(0)(p, k) as never) : new Error('boom') })
    const r = await correr(cuerpo({ texto: catalogo(8) }))
    expect(r.c.estado).toBe('fallido')
    expect(base.fichas).toHaveLength(0)
  })
  it('el tope de gasto del ingreso corta las divisiones: lo que no se alcanzó a ver queda «sin clasificar» y el ingreso «parcial», sin perder ningún segmento', async () => {
    const { base, correr } = armar(conCapacidad(9), { topeDeGastoPorIngresoUsd: 0.06 })
    const r = await correr(cuerpo({ texto: catalogo(8) }))
    expect(['parcial', 'fichado']).toContain(r.c.estado)
    expect(firmasGuardadas(base)).toHaveLength(24)
    if (r.c.estado === 'parcial') expect(String(r.c.motivo)).toMatch(/tope_de_gasto_del_ingreso|cobertura baja/)
  })
  it('el reloj: pasados 240 s desde la primera llamada no se lanzan más pasadas; lo pendiente queda «sin clasificar» (parcial)', async () => {
    let t = 0
    const { base, m, correr } = armar(conCapacidad(24), { reloj: () => { t += 100_000; return t } })
    const r = await correr(cuerpo({ texto: catalogo(30) })) // 90 segmentos → 4 trozos
    expect(r.c.estado).toBe('parcial')
    expect(String(r.c.motivo)).toMatch(/tiempo/)
    expect(m.espia.peticiones.length).toBeLessThan(4)
    expect(firmasGuardadas(base)).toHaveLength(90)
  })
})

describe('el corte NO cambia lo que ya funcionaba', () => {
  it('una respuesta que termina sola no se divide, y el mensaje de cada pasada trae solo sus segmentos', async () => {
    const { m, correr } = armar(conCapacidad(24))
    const r = await correr(cuerpo({ texto: catalogo(4) }))
    expect(m.espia.peticiones).toHaveLength(1)
    expect(r.c.estado).toBe('fichado')
  })
})
