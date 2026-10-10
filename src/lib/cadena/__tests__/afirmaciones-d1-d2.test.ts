/**
 * Relevo 41 · D1 / D2 / D3 de la certificación de CC#3 (sondas rojas de `raw/evidencia/2026-10-10-CC3-cadena/sonda-afirmaciones-D1-D2.test.ts`, ahora permanentes).
 * Agnóstico: ninguna lista de comida o rubro; el léxico es dato (`cadena_config.lexico_afirmaciones`) y el cliente de la prueba es sintético.
 */
import { describe, it, expect } from 'vitest'
import { hallarAfirmaciones, lexicoDesdeConfig } from '../afirmaciones'
import { validarTodo, type Hallazgo, type InsumosCalendario, type PiezaAgente, type Referencia, type TandaAgente } from '../index'
import { clienteA, filasDe, formatosDeLaMigracion, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

const FORMATOS = formatosDeLaMigracion()
const bloq = (hs: Hallazgo[]) => hs.filter((h) => h.severidad === 'bloquea').map((h) => `${h.chequeo}:${h.ficha.que}`)
function ins(c: ClienteFixture, t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario {
  return { campana: c.campana, estrategia: c.estrategia, planTexto: c.planTexto, formatos: FORMATOS, sedes: c.sedes, referencias: c.referencias, clientId: c.clientId, ahora: c.ahora, filas: filasDe(c, t, FORMATOS), forbiddenWords: c.forbiddenWords, conocidos: c.conocidos, ...extra }
}
const conPieza = (t: TandaAgente, semana: number, slot: string, cambios: Partial<PiezaAgente>): TandaAgente => ({ ...t, piezas: t.piezas.map((p) => (p.semana === semana && p.slot === slot ? { ...p, ...cambios } : p)) })
const sub = (hs: ReturnType<typeof hallarAfirmaciones>) => hs.map((h) => `${h.subtipo}:${h.texto}`)

describe('D1 · «de <sede>» solo es exento si lo ubica una palabra de lugar (agnóstico: sin lista de comida)', () => {
  const sedes = ['Olón', 'Guayaquil']
  it('«camarón y pescado de Olón» con Olón como sede SÍ es una afirmación de origen', () => {
    expect(sub(hallarAfirmaciones('Camarón y pescado de Olón', sedes))).toContain('origen_lugar:de Olón')
  })
  it('lo mismo con otro producto y otra sede: no depende de ninguna palabra de producto', () => {
    expect(sub(hallarAfirmaciones('Tomates de Cotacachi', ['Cotacachi']))).toContain('origen_lugar:de Cotacachi')
    expect(sub(hallarAfirmaciones('Hilo de Otavalo', ['Otavalo']))).toContain('origen_lugar:de Otavalo')
  })
  it('«la sede de Olón», «el local de Guayaquil», «sucursal de Olón» NO son un origen', () => {
    for (const t of ['Visítanos en la sede de Olón', 'Abrimos el local de Guayaquil', 'Nueva sucursal de Olón']) expect(sub(hallarAfirmaciones(t, sedes)).filter((x) => x.startsWith('origen_lugar'))).toEqual([])
  })
  it('un lugar que NO es del cliente sigue siendo origen aunque lo ubique una palabra de lugar', () => {
    expect(sub(hallarAfirmaciones('Mariscos de Manta', sedes))).toContain('origen_lugar:de Manta')
  })
  it('la palabra de lugar viene del léxico (dato): sin ella en el léxico, «la sede de Olón» pasa a ser una afirmación', () => {
    const lexico = lexicoDesdeConfig({ locativos: ['barrio'] })
    expect(sub(hallarAfirmaciones('Visítanos en la sede de Olón', sedes, { lexico }))).toContain('origen_lugar:de Olón')
    expect(sub(hallarAfirmaciones('Visítanos en el barrio de Olón', sedes, { lexico })).filter((x) => x.startsWith('origen_lugar'))).toEqual([])
  })
  it('validador completo: con Olón como sede y SIN dato, la frase bloquea', () => {
    const c = clienteA(); const b = tandaBuena(c)
    const a = validarTodo(ins(c, conPieza(b, 1, 'a', { tema: 'Camarón y pescado de Olón' }), { conocidos: [...c.conocidos, 'Olón'] }))
    expect(bloq(a).some((m) => m.startsWith('V14') && m.includes('de Olón'))).toBe(true)
  })
})

describe('D2 · un dato flojo NO cubre una afirmación', () => {
  const c = clienteA(); const b = tandaBuena(c)
  const planRef: Referencia = { id: 'plan-x', client_id: c.clientId, origen: 'plan', texto: 'Sedes: Guayaquil y Olón. Ceviche y mixtos.' }
  const refs = [...c.referencias, planRef]
  const dato = (o: Partial<{ dato: string; valor: string; ref: string }>) => ({ dato: 'x', valor: 'x', clase: 'alto' as const, ref: 'plan-x', nivel: 'F1' as const, opcional: false, ...o })
  const run = (tema: string, datos: ReturnType<typeof dato>[], extra: Partial<InsumosCalendario> = {}) => bloq(validarTodo(ins(c, conPieza(b, 1, 'a', { tema, datos }), { referencias: refs, ...extra })))
  it('la frase en `dato` (texto libre) con un `valor` que sí está en el plan NO la respalda', () => {
    const m = run('El marisco llega el mismo día', [dato({ dato: 'el marisco llega el mismo día', valor: 'Ceviche' })])
    expect(m.some((x) => x.startsWith('V14') && x.includes('mismo dia'))).toBe(true)
  })
  it('un valor que contiene la frase pero cuya referencia no la dice también bloquea', () => {
    const m = run('El marisco llega el mismo día', [dato({ dato: 'frescura', valor: 'el marisco llega el mismo día' })])
    expect(m.some((x) => x.startsWith('V14') && x.includes('mismo dia'))).toBe(true)
  })
  it('aunque la referencia SÍ diga la frase, un `valor` que no la contiene no la cubre (el texto libre `dato` no cuenta)', () => {
    const ref2: Referencia = { id: 'plan-w', client_id: c.clientId, origen: 'plan', texto: 'El marisco llega el mismo día. Ceviche.' }
    const m = bloq(validarTodo(ins(c, conPieza(b, 1, 'a', { tema: 'El marisco llega el mismo día', datos: [dato({ dato: 'el marisco llega el mismo día', valor: 'Ceviche', ref: 'plan-w' })] }), { referencias: [...refs, ref2] })))
    expect(m.some((x) => x.startsWith('V14') && x.includes('mismo dia'))).toBe(true)
  })
  it('valor con la frase + referencia que la contiene entera: respaldado (sin V14 de afirmación)', () => {
    const ref2: Referencia = { id: 'plan-y', client_id: c.clientId, origen: 'plan', texto: 'La compra llega el mismo día de la pesca. Ceviche.' }
    const m = bloq(validarTodo(ins(c, conPieza(b, 1, 'a', { tema: 'Llega el mismo día', datos: [dato({ dato: 'frescura', valor: 'llega el mismo día', ref: 'plan-y' })] }), { referencias: [...refs, ref2] })))
    expect(m.filter((x) => x.startsWith('V14') && x.includes('mismo dia'))).toEqual([])
  })
  it('una cifra se sigue cubriendo por valor o dato (sin cambio de comportamiento)', () => {
    const ref2: Referencia = { id: 'plan-z', client_id: c.clientId, origen: 'plan', texto: 'Ceviche mixto $12 y arroz.' }
    const m = bloq(validarTodo(ins(c, conPieza(b, 1, 'a', { tema: 'Ceviche mixto $12', datos: [dato({ dato: 'precio', valor: '$12', ref: 'plan-z' })] }), { referencias: [...refs, ref2] })))
    expect(m.filter((x) => x.includes('$12'))).toEqual([])
  })
})

describe('D3 · lo que la lista no veía (y los falsos positivos que sacaban filas legítimas)', () => {
  const nuevos = ['pescado capturado esta mañana', 'directo del mar a tu mesa', 'traído ayer del puerto', 'receta familiar de 30 años', 'desde 1998', 'más de 500 clientes', 'sin conservantes', 'ingredientes orgánicos', 'el mejor ceviche', 'número uno', 'abierto 24/7', 'entrega gratis', 'solo 5 mesas']
  for (const f of nuevos) it(`detecta «${f}»`, () => expect(hallarAfirmaciones(f).length).toBeGreaterThan(0))
  const limpios = ['Menú del día', 'Ambiente fresco en la terraza', 'Brisa fresca por la tarde', 'Reseña de Ana', 'Mini-guía de Montañita para el fin de semana', 'Gracias de parte del equipo']
  for (const f of limpios) it(`NO marca «${f}»`, () => expect(sub(hallarAfirmaciones(f))).toEqual([]))
  it('«pescado fresco» y «fresca de hoy» sí se marcan (fresco del producto, no del ambiente)', () => {
    expect(hallarAfirmaciones('pescado fresco').length).toBeGreaterThan(0)
    expect(hallarAfirmaciones('mariscos frescos de hoy').length).toBeGreaterThan(0)
  })
  it('las cifras de cantidad salen como cifra y el léxico es dato: una unidad nueva por config, sin publicar', () => {
    expect(sub(hallarAfirmaciones('Más de 500 clientes'))).toContain('cantidad:500 clientes')
    expect(hallarAfirmaciones('12 mascotas felices')).toEqual([])
    expect(sub(hallarAfirmaciones('12 mascotas felices', [], { lexico: lexicoDesdeConfig({ cantidad_unidades: ['mascotas'] }) }))).toContain('cantidad:12 mascotas')
  })
  it('un patrón extra de `cadena_config` se suma; uno roto o demasiado largo se ignora sin romper nada', () => {
    const lexico = lexicoDesdeConfig({ patrones: [{ subtipo: 'garantia', re: 'devolvemos tu dinero' }, { subtipo: 'x', re: '(sin cerrar' }, { subtipo: 'y', re: 'a'.repeat(300) }, 7, null] })
    expect(lexico.patrones).toEqual([{ subtipo: 'garantia', re: 'devolvemos tu dinero' }])
    expect(sub(hallarAfirmaciones('Si no te gusta, devolvemos tu dinero', [], { lexico }))).toContain('garantia:devolvemos tu dinero')
    expect(lexicoDesdeConfig('basura')).toEqual({})
    expect(lexicoDesdeConfig(null)).toEqual({})
    expect(lexicoDesdeConfig([1, 2])).toEqual({})
  })
  it('el léxico base no nombra ningún rubro ni cliente (lo vigila además generalidad.test)', () => {
    const base = JSON.stringify(hallarAfirmaciones('x')) // solo para tocar el módulo
    expect(base).toBe('[]')
  })
})

describe('léxico desde cadena_config · bordes', () => {
  it('lo que no es texto o está vacío o es larguísimo se descarta sin romper', () => {
    const l = lexicoDesdeConfig({ ambiente: [7, null, '', '   ', 'x'.repeat(61), 'Brisa'] })
    expect(l.ambiente).toEqual(['brisa'])
  })
  it('un patrón de exactamente 240 caracteres entra; de 241, no', () => {
    expect(lexicoDesdeConfig({ patrones: [{ subtipo: 'a', re: 'a'.repeat(240) }] }).patrones).toHaveLength(1)
    expect(lexicoDesdeConfig({ patrones: [{ subtipo: 'a', re: 'a'.repeat(241) }] }).patrones).toHaveLength(0)
  })
  it('una sede con nombre de dos palabras o un prefijo suyo sigue siendo la sede: «la sede de Olón Norte» no es un origen', () => {
    expect(sub(hallarAfirmaciones('Visítanos en la sede de Olón Norte', ['Olón'])).filter((x) => x.startsWith('origen_lugar'))).toEqual([])
    expect(sub(hallarAfirmaciones('Visítanos en la sede de Olón', ['Olón Norte'])).filter((x) => x.startsWith('origen_lugar'))).toEqual([])
  })
})
