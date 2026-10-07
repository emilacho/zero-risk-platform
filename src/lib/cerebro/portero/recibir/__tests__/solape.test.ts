/**
 * PASO 8 · C1 de CC#3 (#439): el tope de 24 segmentos por llamada partía un producto en la frontera (el nombre en una llamada, su precio en la otra).
 * Arreglo estructural, sin reglas por tema: cada pasada lleva un SOLAPE de contexto — los últimos segmentos que venían justo antes de su trozo — rotulado como «solo contexto»:
 * sin número (no se puede citar), nunca entra a una ficha por su cuenta. Vale igual para el trozo que sale de dividir una respuesta cortada. Modelo simulado, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { SEGMENTOS_DE_SOLAPE, recibir, type DepsDeRecibir } from '../recibir'
import { armarMensajeDeRecibir, ENCABEZADO_DE_CONTEXTO } from '../instruccion'
import { AHORA, BaseSimulada, crearModelo, cuerpo, numerosDelMensaje, respuestaJson, type Respuesta } from './casos'

const producto = (n: number): string => [`Producto ${n} · código CN-${String(n).padStart(3, '0')}`, `Precio: ${10 + n} USD`, `Garantía: ${6 + (n % 3)} meses`].join('\n\n')
const catalogo = (n: number): string => Array.from({ length: n }, (_x, i) => producto(i + 1)).join('\n\n')

/** agrupa de a 3 SUS segmentos; además registra qué contexto vio en cada llamada */
const modelo: Respuesta = (p) => {
  const ns = numerosDelMensaje(p)
  const fichas = []
  for (let i = 0; i < ns.length; i += 3) fichas.push({ clase: 'producto', titulo: `Cosa ${ns[i]}`, que_es: 'x', segmentos: ns.slice(i, i + 3), propiedad: 'propia', plazo: 'precio_oferta_horario' })
  return respuestaJson({ fichas, descartes: [] }, { input_tokens: 2500, output_tokens: 1500 }) // salida realista de un catálogo: la pasada no crece
}
function armar(r: Respuesta = modelo, extra: Partial<DepsDeRecibir> = {}) {
  const base = new BaseSimulada()
  const m = crearModelo(r)
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId, ...extra }
  return { base, m, correr: async (c: Record<string, unknown>) => { const x = await recibir(deps, c); return { ...x, c: x.cuerpo as Record<string, any> } } }
}
const contextoDe = (mensaje: string): string[] => {
  const i = mensaje.indexOf(ENCABEZADO_DE_CONTEXTO)
  if (i < 0) return []
  const bloque = mensaje.slice(i + ENCABEZADO_DE_CONTEXTO.length).split('\nMATERIAL')[0]
  return bloque.split('\n- ').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
}

describe('el mensaje de una pasada', () => {
  const seg = (n: number) => ({ n, texto: `texto ${n}` }) as never
  it('sin contexto no cambia (la primera pasada y los re-ingresos de un solo trozo quedan como estaban)', () => {
    const a = armarMensajeDeRecibir({ origen: 'su_fuente', fuenteRef: 'x', fechaFuente: null, segmentos: [seg(1)], afectadas: [] })
    expect(a).not.toContain(ENCABEZADO_DE_CONTEXTO)
    expect(a).toBe(armarMensajeDeRecibir({ origen: 'su_fuente', fuenteRef: 'x', fechaFuente: null, segmentos: [seg(1)], afectadas: [], contexto: [] }))
  })
  it('con contexto: va ANTES del material, sin números «[n]» (no se puede citar) y rotulado «no lo clasifiques ni lo cites»', () => {
    const m = armarMensajeDeRecibir({ origen: 'su_fuente', fuenteRef: 'x', fechaFuente: null, segmentos: [seg(5)], afectadas: [], contexto: [seg(3), seg(4)] })
    expect(m.indexOf(ENCABEZADO_DE_CONTEXTO)).toBeLessThan(m.indexOf('MATERIAL'))
    expect(m).toMatch(/NO lo clasifiques ni lo cites/)
    expect(m).toContain('texto 3')
    expect(m).toContain('texto 4')
    expect([...m.matchAll(/^\[(\d+)\] /gm)].map((x) => Number(x[1]))).toEqual([5])
  })
})

describe('C1 · el nombre de un producto llega al modelo CON su precio aunque la frontera caiga en medio', () => {
  it('el solape es de 4 segmentos', () => { expect(SEGMENTOS_DE_SOLAPE).toBe(4) })
  it('catálogo de 24 productos de 3 líneas (72 segmentos, fronteras tras 24 y 48): cada trozo después del primero trae como contexto los 4 segmentos anteriores', async () => {
    const { m, correr } = armar()
    const r = await correr(cuerpo({ texto: catalogo(24) }))
    expect(r.c.estado).toBe('fichado')
    const msgs = m.espia.peticiones.map((p) => p.messages[0].content)
    expect(msgs).toHaveLength(3)
    expect(contextoDe(msgs[0])).toEqual([])
    // el trozo 2 empieza en el segmento 25: su contexto son los segmentos 21 a 24
    expect(contextoDe(msgs[1])).toEqual(textosDeSegmentos(catalogo(24), [21, 22, 23, 24]))
    expect(contextoDe(msgs[2])).toEqual(textosDeSegmentos(catalogo(24), [45, 46, 47, 48]))
  })
  it('un producto cuyo NOMBRE cierra un trozo: el trozo siguiente ve ese nombre en su contexto, justo antes de su precio', async () => {
    // un material donde el NOMBRE de un producto cae justo en el segmento 24 (el último del primer trozo)
    const lineas = Array.from({ length: 23 }, (_x, i) => `Relleno ${i + 1}`)
    const texto = [...lineas, 'Potencia ajustable · código CN-008', 'Precio: US$ 17,00', 'Garantía: 12 meses'].join('\n\n')
    const { m, correr } = armar()
    await correr(cuerpo({ texto }))
    const msgs = m.espia.peticiones.map((p) => p.messages[0].content)
    expect(msgs).toHaveLength(2)
    expect(numerosDelMensaje(m.espia.peticiones[1])).toEqual([25, 26])
    expect(contextoDe(msgs[1])).toContain('Potencia ajustable · código CN-008')
    expect(msgs[1].indexOf('Potencia ajustable')).toBeLessThan(msgs[1].indexOf('[25] Precio'))
  })
  it('lo del contexto NO entra a una ficha por su cuenta: si el modelo lo cita igual por su número, el segmento queda con quien lo pidió primero (sin duplicar)', async () => {
    const citaElDeAntes: Respuesta = (p, n) => {
      const ns = numerosDelMensaje(p)
      const extra = n > 1 ? [ns[0] - 1] : [] // cita el segmento justo anterior (del contexto)
      return respuestaJson({ fichas: [{ clase: 'producto', titulo: 'x', que_es: 'x', segmentos: [...extra, ...ns], propiedad: 'propia', plazo: 'precio_oferta_horario' }], descartes: [] })
    }
    const { base, correr } = armar(citaElDeAntes)
    const r = await correr(cuerpo({ texto: catalogo(10) }))
    expect(r.c.segmentos.total).toBe(30)
    expect(base.fichas.flatMap((f) => f.firmas as string[])).toHaveLength(30)
  })
  it('el trozo que sale de DIVIDIR una respuesta cortada también lleva el contexto de lo que venía antes (la segunda mitad ve el final de la primera)', async () => {
    const corta: Respuesta = (p, n) => {
      if (n === 1) return { texto: '{"fichas":[{"clase":"prod', stop_reason: 'max_tokens', usage: { input_tokens: 2500, output_tokens: 2000 } }
      return modelo(p, n) as never
    }
    const { m, correr } = armar(corta)
    const r = await correr(cuerpo({ texto: catalogo(8) })) // 24 segmentos: un trozo que se corta y se divide en 12 + 12
    expect(r.c.estado).toBe('fichado')
    const msgs = m.espia.peticiones.map((p) => p.messages[0].content)
    expect(numerosDelMensaje(m.espia.peticiones[2])[0]).toBe(13)
    expect(contextoDe(msgs[1])).toEqual([])
    expect(contextoDe(msgs[2])).toEqual(textosDeSegmentos(catalogo(8), [9, 10, 11, 12]))
  })
  it('un material de un solo trozo no trae contexto (nada que solapar)', async () => {
    const { m, correr } = armar()
    await correr(cuerpo({ texto: catalogo(4) }))
    expect(m.espia.peticiones).toHaveLength(1)
    expect(contextoDe(m.espia.peticiones[0].messages[0].content)).toEqual([])
  })
})

/** los textos de los segmentos n (1-based) del catálogo: cada bloque separado por línea en blanco es un segmento */
function textosDeSegmentos(texto: string, ns: number[]): string[] {
  const todos = texto.split('\n\n')
  return ns.map((n) => todos[n - 1])
}
