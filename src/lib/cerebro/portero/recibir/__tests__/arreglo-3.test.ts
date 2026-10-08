/**
 * PASO 8 · ARREGLO 3 (deuda del renglón 6, medición 3). US$ 0, modelo simulado. La herencia NO se toca.
 *  1 · la pasada NO crece tras una salida densa (R2-13 bajó a 36 %: las pasadas grandes se cortaban y cada corte desperdicia una llamada);
 *  2 · el mensaje dice el TOTAL de segmentos del material y si este tramo es el último (para que el modelo agrupe artículos y no productos);
 *  3 · el modelo puede marcar «el último elemento quedó incompleto: empieza en el segmento N»: ese arranque pasa al tramo siguiente y no se parte un producto (R1-01);
 *  4 · un CSV recibido como ARCHIVO sigue dando una ficha por fila (prueba permanente).
 */
import { describe, expect, it } from 'vitest'
import { MAX_SEGMENTOS_POR_PASADA, MAXIMO_DE_SEGMENTOS_ARRASTRADOS, UMBRAL_DE_SALIDA_DENSA, recibir, type DepsDeRecibir } from '../recibir'
import { armarMensajeDeRecibir, INSTRUCCION_DE_RECIBIR } from '../instruccion'
import { AHORA, BaseSimulada, crearModelo, cuerpo, numerosDelMensaje, respuestaJson, type Respuesta } from './casos'

function armar(r: Respuesta, extra: Partial<DepsDeRecibir> = {}) {
  const base = new BaseSimulada()
  const m = crearModelo(r)
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId, topeDeGastoPorIngresoUsd: 5, topeDeGastoPorLlamadaUsd: 1, ...extra }
  return { base, m, correr: async (c: Record<string, unknown>) => { const x = await recibir(deps, c); return { ...x, c: x.cuerpo as Record<string, any> } } }
}
const agrupa = (tam: number, salida: number | ((n: number, llamada: number) => number), extra: Record<string, unknown> | ((ns: number[], llamada: number) => Record<string, unknown>) = {}): Respuesta => (p, llamada) => {
  const ns = numerosDelMensaje(p)
  const fichas = []
  for (let i = 0; i < ns.length; i += tam) fichas.push({ clase: 'cosa', titulo: `Cosa ${ns[i]}`, que_es: 'x', segmentos: ns.slice(i, i + tam), propiedad: 'propia', plazo: 'sin_plazo' })
  const o = typeof salida === 'function' ? salida(ns.length, llamada) : salida
  const e = typeof extra === 'function' ? extra(ns, llamada) : extra
  return respuestaJson({ fichas, descartes: [], ...e }, { input_tokens: 2500, output_tokens: o })
}
const articulo = (n: number): string => `Artículo ${n}. Los copropietarios deberán cumplir la disposición número ${n} de este reglamento, respetando los horarios de uso de áreas comunes y el pago puntual de las alícuotas.`
const reglamento = (n: number): string => Array.from({ length: n }, (_x, i) => articulo(i + 1)).join('\n\n')
const producto = (n: number): string => [`Producto ${n} · código CN-${String(n).padStart(3, '0')}`, `Precio: ${10 + n} USD`, `Garantía: ${6 + (n % 3)} meses`].join('\n\n')
const catalogo = (n: number): string => Array.from({ length: n }, (_x, i) => producto(i + 1)).join('\n\n')
const firmas = (b: BaseSimulada): string[] => b.fichas.flatMap((f) => f.firmas as string[])

describe('1 · la pasada no crece tras una salida densa', () => {
  it('el umbral de «densa» es la mitad del tope de salida', () => { expect(UMBRAL_DE_SALIDA_DENSA).toBe(1000) })
  it('una primera pasada DENSA (1.200 tokens para 24 segmentos): todas las pasadas se quedan en 24', async () => {
    const { m, correr } = armar(agrupa(1, 1200))
    await correr(cuerpo({ texto: reglamento(120) }))
    expect(m.espia.peticiones.map((p) => numerosDelMensaje(p).length).every((n) => n <= MAX_SEGMENTOS_POR_PASADA)).toBe(true)
  })
  it('crece mientras la salida es corta; en cuanto UNA pasada es densa vuelve a 24 y no vuelve a crecer aunque la siguiente salga corta', async () => {
    const { m, correr } = armar(agrupa(40, (n, llamada) => (llamada === 2 ? 1300 : 200)))
    const r = await correr(cuerpo({ texto: reglamento(400) }))
    expect(r.c.estado).toBe('fichado')
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p).length)
    expect(largos[0]).toBe(MAX_SEGMENTOS_POR_PASADA)
    expect(largos[1]).toBeGreaterThan(MAX_SEGMENTOS_POR_PASADA) // creció tras la primera (salida corta)
    expect(largos.slice(2).slice(0, -1).every((n) => n <= MAX_SEGMENTOS_POR_PASADA)).toBe(true) // tras la densa: 24 y no más
  })
  it('la salida corta de siempre sigue creciendo (no se perdió lo ganado en el arreglo 2)', async () => {
    const { m, correr } = armar(agrupa(40, 300))
    const r = await correr(cuerpo({ texto: reglamento(561) }))
    expect(r.c.estado).toBe('fichado')
    expect(m.espia.peticiones.length).toBeLessThanOrEqual(12)
  })
})

describe('2 · el mensaje dice el total del material y si es el último tramo', () => {
  const seg = (n: number) => ({ n, texto: `texto ${n}`, inicio: 0, fin: 0, firma: `f${n}` })
  it('sin total (o con un solo tramo) el mensaje no cambia', () => {
    const base = { origen: 'su_fuente' as const, fuenteRef: 'x', fechaFuente: null, segmentos: [seg(1), seg(2)], afectadas: [] }
    expect(armarMensajeDeRecibir(base)).not.toMatch(/TOTAL DEL MATERIAL/)
    expect(armarMensajeDeRecibir({ ...base, totalDeSegmentos: 2 })).not.toMatch(/TOTAL DEL MATERIAL/)
  })
  it('con más segmentos que este tramo: «TOTAL DEL MATERIAL: N segmentos», los números de este tramo y si es o no el último', () => {
    const base = { origen: 'su_fuente' as const, fuenteRef: 'x', fechaFuente: null, segmentos: [seg(25), seg(26), seg(27)], afectadas: [], totalDeSegmentos: 561 }
    expect(armarMensajeDeRecibir({ ...base, hayTramoSiguiente: true })).toMatch(/TOTAL DEL MATERIAL: 561 segmentos.*25.*27.*NO es el último tramo/)
    expect(armarMensajeDeRecibir({ ...base, hayTramoSiguiente: false })).toMatch(/TOTAL DEL MATERIAL: 561 segmentos.*25.*27.*es el último tramo/)
  })
  it('en `recibir`: cada pasada de un material largo lleva el total y el último lleva «es el último tramo»', async () => {
    const { m, correr } = armar(agrupa(3, 300))
    await correr(cuerpo({ texto: catalogo(30) })) // 90 segmentos
    const msgs = m.espia.peticiones.map((p) => p.messages[0].content)
    expect(msgs.length).toBeGreaterThan(1)
    expect(msgs.every((x) => /TOTAL DEL MATERIAL: 90 segmentos/.test(x))).toBe(true)
    expect(msgs.slice(0, -1).every((x) => /NO es el último tramo/.test(x))).toBe(true)
    expect(msgs[msgs.length - 1]).toMatch(/es el último tramo/)
    expect(msgs[msgs.length - 1]).not.toMatch(/NO es el último tramo/)
  })
  it('la instrucción explica el total, agrupar artículos (no productos) y el marcador de incompleto', () => {
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/TOTAL DEL MATERIAL/)
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/art[íi]culos o cl[áa]usulas de un mismo texto/)
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/incompleto_desde/)
  })
})

describe('3 · el último elemento incompleto pasa al tramo siguiente (no se parte un producto)', () => {
  // catálogo de 30 productos de 3 líneas = 90 segmentos; el tramo 1 son los segmentos 1-24; el producto 8 empieza en el 22
  const conMarcador = (desde: number | ((ns: number[]) => number | undefined), solo1 = true): Respuesta => agrupa(3, 300, (ns, llamada) => {
    const d = typeof desde === 'function' ? desde(ns) : desde
    return d !== undefined && (!solo1 || llamada === 1) ? { incompleto_desde: d } : {}
  })
  it('el marcador mueve los segmentos 22-24 al tramo siguiente: el producto 8 queda ENTERO en una sola ficha y nada se duplica ni se pierde', async () => {
    const respuesta: Respuesta = (p, llamada) => {
      const ns = numerosDelMensaje(p)
      // agrupa de a 3 empezando donde empieza el tramo; en el tramo 1 declara incompleto el producto que empieza en el 22 y no lo incluye
      const fichas = []
      const hasta = llamada === 1 ? ns.filter((n) => n < 22) : ns
      for (let i = 0; i < hasta.length; i += 3) fichas.push({ clase: 'producto', titulo: `Cosa ${hasta[i]}`, que_es: 'x', segmentos: hasta.slice(i, i + 3), propiedad: 'propia', plazo: 'sin_plazo' })
      return respuestaJson({ fichas, descartes: [], ...(llamada === 1 ? { incompleto_desde: 22 } : {}) }, { input_tokens: 2500, output_tokens: 300 })
    }
    const { base, m, correr } = armar(respuesta)
    const r = await correr(cuerpo({ texto: catalogo(30) }))
    expect(r.c).toMatchObject({ estado: 'fichado', segmentos: { total: 90, residuales: 0 } })
    expect(numerosDelMensaje(m.espia.peticiones[1])[0]).toBe(22) // el tramo siguiente EMPIEZA en el producto incompleto
    expect(firmas(base)).toHaveLength(90)
    const producto8 = base.fichas.filter((f) => String(f.contenido).includes('CN-008'))
    expect(producto8).toHaveLength(1)
    expect(String(producto8[0].contenido)).toMatch(/CN-008[\s\S]*Precio: 18 USD[\s\S]*Garantía/)
  })
  it('aunque el modelo SÍ incluya los segmentos marcados en sus fichas, quedan fuera de ese tramo: la ficha que los trae empieza en el producto incompleto, no en el anterior', async () => {
    const { base, correr } = armar(agrupa(4, 300, (_ns, llamada) => (llamada === 1 ? { incompleto_desde: 22 } : {}))) // el tramo 1 agrupa de a 4 → [21-24] mezclaría el producto 7 con el 8
    const r = await correr(cuerpo({ texto: catalogo(30) }))
    expect(r.c.segmentos.residuales).toBe(0)
    expect(firmas(base)).toHaveLength(90)
    const delOcho = base.fichas.filter((f) => String(f.contenido).includes('CN-008'))
    expect(delOcho).toHaveLength(1)
    expect(String(delOcho[0].contenido).startsWith('Producto 8 · código CN-008')).toBe(true)
  })
  it('un marcador inválido se IGNORA con una nota y nada se pierde: fuera del tramo, en el primer segmento, no entero, o con más de 8 segmentos por arrastrar', async () => {
    for (const malo of [999, 1, 0, -3, 22.5, '22', null]) {
      const { base, m, correr } = armar(agrupa(3, 300, (_ns, llamada) => (llamada === 1 ? { incompleto_desde: malo } : {})))
      const r = await correr(cuerpo({ texto: catalogo(30) }))
      expect(r.c.segmentos.residuales, String(malo)).toBe(0)
      expect(firmas(base), String(malo)).toHaveLength(90)
      expect(numerosDelMensaje(m.espia.peticiones[1])[0], String(malo)).toBe(25) // sin arrastre: el tramo siguiente empieza donde terminó
      if (malo !== null) expect(r.c.notas.join(' '), String(malo)).toMatch(/incompleto_desde/) // se dice que no se usó
    }
    expect(MAXIMO_DE_SEGMENTOS_ARRASTRADOS).toBe(8)
    const { base, m, correr } = armar(conMarcador(10)) // 15 segmentos por arrastrar (10-24) > 8: se ignora
    await correr(cuerpo({ texto: catalogo(30) }))
    expect(numerosDelMensaje(m.espia.peticiones[1])[0]).toBe(25)
    expect(firmas(base)).toHaveLength(90)
  })
  it('una marca en el PRIMER segmento de un tramo (aunque quepa en el arrastre) no se usa: no habría avance', async () => {
    const { base, m, correr } = armar(agrupa(1, 300, (ns) => ({ incompleto_desde: ns[0] })), { topeDeEntradaTokens: 1_700 })
    const r = await correr(cuerpo({ texto: catalogo(4) })) // 12 segmentos en varios tramos chicos
    expect(m.espia.peticiones.map((p) => numerosDelMensaje(p))).toEqual(Array.from({ length: 12 }, (_x, k) => [k + 1])) // cada tramo trae SOLO lo suyo: la marca en su primer segmento no arrastra nada
    expect(m.espia.peticiones.length).toBeGreaterThan(2)
    expect(m.espia.peticiones.length).toBeLessThanOrEqual(12)
    expect(r.c.segmentos.residuales).toBe(0)
    expect(firmas(base)).toHaveLength(12)
  })
  it('en el ÚLTIMO tramo el marcador se ignora (no hay a dónde arrastrar) y los segmentos se archivan', async () => {
    const { base, correr } = armar(agrupa(3, 300, (ns) => ({ incompleto_desde: ns[ns.length - 1] })))
    const r = await correr(cuerpo({ texto: catalogo(4) })) // un solo tramo de 12 segmentos
    expect(r.c.segmentos.residuales).toBe(0)
    expect(firmas(base)).toHaveLength(12)
  })
  it('tras una respuesta cortada y dividida el marcador de las mitades no se usa (solo vale en tramos enteros)', async () => {
    const cortaLaPrimera: Respuesta = (p, llamada) => (llamada === 1 ? { texto: '{"fichas":[{"clase":"p', stop_reason: 'max_tokens', usage: { input_tokens: 2500, output_tokens: 2000 } } : (agrupa(3, 300, (ns) => ({ incompleto_desde: ns[ns.length - 1] }))(p, llamada) as never))
    const { base, m, correr } = armar(cortaLaPrimera)
    const r = await correr(cuerpo({ texto: catalogo(30) }))
    expect(r.c.segmentos.residuales).toBe(0)
    expect(firmas(base)).toHaveLength(90)
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p))
    expect(largos[1][0]).toBe(1) // primera mitad
    expect(largos[2][0]).toBe(13) // segunda mitad: nadie arrastró nada de la primera
    expect(largos[3][0]).toBe(25) // y el siguiente tramo entero empieza donde terminó el cortado
  })
  it('con el marcador, TODO el catálogo de 24 productos entra sin dejar un producto partido en las fronteras (fichas = 24 productos)', async () => {
    // el modelo simulado agrupa por producto reconociendo el nombre («Producto n · código»): un producto cortado en la frontera se declara incompleto
    const porProducto: Respuesta = (p, llamada) => {
      const m = p.messages[0].content
      const material = m.split('FICHAS YA ARCHIVADAS')[0].split('MATERIAL (')[1] ?? ''
      const lineas = [...material.matchAll(/^\[(\d+)\] (.*)$/gm)].map((x) => ({ n: Number(x[1]), t: x[2] }))
      const inicios = lineas.filter((l) => /^Producto \d+ · código/.test(l.t)).map((l) => l.n)
      const ultimoInicio = inicios[inicios.length - 1]
      const ultimo = lineas[lineas.length - 1].n
      const hayMas = /NO es el último tramo/.test(m)
      const incompleto = hayMas && ultimo - ultimoInicio + 1 < 3 ? ultimoInicio : undefined
      const fichas = []
      for (const i of inicios) {
        if (incompleto !== undefined && i >= incompleto) continue
        fichas.push({ clase: 'producto', titulo: `Producto ${i}`, que_es: 'x', segmentos: [i, i + 1, i + 2], propiedad: 'propia', plazo: 'sin_plazo' })
      }
      void llamada
      return respuestaJson({ fichas, descartes: [], ...(incompleto !== undefined ? { incompleto_desde: incompleto } : {}) }, { input_tokens: 2500, output_tokens: 1500 })
    }
    // un catálogo cuya frontera de 24 segmentos cae en medio de un producto: 25 productos de 3 líneas con un encabezado de 1 línea → los productos empiezan en 2, 5, … y el tramo 1 (1-24) corta el producto 8 (23-25)
    const texto = ['Catálogo de repuestos', catalogo(25)].join('\n\n')
    const { base, correr } = armar(porProducto)
    const r = await correr(cuerpo({ texto }))
    const productos = base.fichas.filter((f) => /^Producto \d+$/.test(String(f.titulo)))
    expect(productos).toHaveLength(25)
    expect(productos.every((f) => /Precio: \d+ USD/.test(String(f.contenido)) && /CN-\d+/.test(String(f.contenido)) && /Garantía/.test(String(f.contenido)))).toBe(true)
    expect(r.c.segmentos.residuales).toBeLessThanOrEqual(1) // a lo más el encabezado
  })
})

describe('4 · un CSV recibido como ARCHIVO da una ficha por fila (prueba permanente)', () => {
  const csv = 'servicio,precio,unidad\n' + Array.from({ length: 12 }, (_x, i) => `serv${i + 1},${10 + i},hora`).join('\n') + '\n'
  it('12 filas → 12 segmentos de fila (más el encabezado) y, con un modelo que da una ficha por segmento, 12 fichas de fila', async () => {
    const { base, m, correr } = armar(agrupa(1, 300))
    const r = await correr(cuerpo({ texto: undefined, fuente_ref: 'drive:tarifas', archivo: { nombre: 'tarifas.csv', tipo: 'csv', base64: Buffer.from(csv, 'utf8').toString('base64') } }))
    expect(r.c.estado).toBe('fichado')
    expect(numerosDelMensaje(m.espia.peticiones[0])).toHaveLength(13)
    expect(base.fichas.filter((f) => /^fila \d+: servicio: serv\d+ \| precio: \d+ \| unidad: hora$/.test(String(f.contenido)))).toHaveLength(12)
  })
})
