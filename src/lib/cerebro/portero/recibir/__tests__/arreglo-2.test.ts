/**
 * PASO 8 · ARREGLO 2 (renglón 7 que quedó en NO tras la medición 2). US$ 0, modelo simulado.
 *  1 · un PDF escaneado queda con FICHA DE ARCHIVO (nombre, tipo, tamaño, aviso «escaneado, sin texto»), como el video y el audio; nunca se inventa texto.
 *  2 · ninguna ficha se entrega cortada: lo largo se parte en fichas de a lo más MAXIMO_DE_CARACTERES_POR_FICHA y `entregar` devuelve cada una entera.
 *  3 · un documento largo no retrocede: el tope de llamadas sigue a los segmentos y cada pasada crece con lo que el modelo gasta de salida (mide, no adivina).
 *  4 · una hoja o una tabla trae UNA FILA POR SEGMENTO: se archiva, vence o retira una fila sola.
 * La herencia NO se toca (ni los descartes que no se heredan, ni H1b).
 */
import { describe, expect, it } from 'vitest'
import { MAXIMO_DE_CARACTERES_POR_FICHA } from '../traducir'
import { MAX_SEGMENTOS_POR_PASADA, MAXIMO_ABSOLUTO_DE_LLAMADAS, llamadasMaximasPara, recibir, type DepsDeRecibir } from '../recibir'
import { INSTRUCCION_DE_RECIBIR } from '../instruccion'
import { entregarContenido } from '../../entregar'
import { A, AHORA, BaseSimulada, crearModelo, cuerpo, numerosDelMensaje, respuestaJson, type Respuesta } from './casos'

function armar(r: Respuesta, extra: Partial<DepsDeRecibir> = {}) {
  const base = new BaseSimulada()
  const m = crearModelo(r)
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId, ...extra }
  return { base, m, correr: async (c: Record<string, unknown>) => { const x = await recibir(deps, c); return { ...x, c: x.cuerpo as Record<string, any> } } }
}
/** una ficha por grupo de `tam` segmentos de SU llamada; `salida` = tokens de salida que dice haber gastado */
const agrupa = (tam: number, salida = 300): Respuesta => (p) => {
  const ns = numerosDelMensaje(p)
  const fichas = []
  for (let i = 0; i < ns.length; i += tam) fichas.push({ clase: 'cosa', titulo: `Cosa ${ns[i]}`, que_es: 'x', segmentos: ns.slice(i, i + tam), propiedad: 'propia', plazo: 'sin_plazo' })
  return respuestaJson({ fichas, descartes: [] }, { input_tokens: 2500, output_tokens: salida })
}
const articulo = (n: number): string => `Artículo ${n}. Los copropietarios deberán cumplir la disposición número ${n} de este reglamento, respetando los horarios de uso de áreas comunes y el pago puntual de las alícuotas.`
const reglamento = (n: number): string => Array.from({ length: n }, (_x, i) => articulo(i + 1)).join('\n\n')

describe('1 · PDF escaneado: ficha de archivo, sin modelo, sin inventar texto', () => {
  const escaneado = async () => ({ estado: 'escaneado' as const, tipo: 'pdf' as const, nombre: 'acta.pdf', huella: 'h'.repeat(64), bytes: 48_213, texto: '', avisos: ['páginas sin texto: 1, 2'], paginas: 2, paginas_sin_texto: [1, 2], motivo: 'el PDF es una imagen escaneada: no trae texto' })
  it('queda FICHADO con una ficha de archivo (nombre, tipo, tamaño, aviso), US$ 0, sin llamar al modelo y sin contenido', async () => {
    const { base, m, correr } = armar(agrupa(3), { leerArchivo: escaneado })
    const r = await correr(cuerpo({ texto: undefined, fuente_ref: 'drive:acta', archivo: { nombre: 'acta.pdf', tipo: 'pdf', base64: 'AAAA', fecha: '2026-09-30' } }))
    expect(r.c).toMatchObject({ estado: 'fichado', llamo_al_modelo: false, costo_usd: 0, fichas: { archivadas: 1 } })
    expect(m.espia.peticiones).toHaveLength(0)
    expect(base.fichas).toHaveLength(1)
    expect(base.fichas[0]).toMatchObject({ clase: 'archivo', archivo_nombre: 'acta.pdf', archivo_tipo: 'pdf', archivo_bytes: 48_213, plazo: 'archivo_propio', contenido: null, residual: false })
    expect(String(base.fichas[0].que_es)).toMatch(/escaneado, sin texto/)
    expect(base.ingresos[0]).toMatchObject({ estado: 'fichado', material: null, archivo_nombre: 'acta.pdf', archivo_bytes: 48_213 })
    expect(r.c.notas.join(' ')).toMatch(/escaneado/)
  })
  it('el mismo PDF otra vez hereda su ficha (no se duplica)', async () => {
    const { base, correr } = armar(agrupa(3), { leerArchivo: escaneado })
    const c = cuerpo({ texto: undefined, fuente_ref: 'drive:acta', archivo: { nombre: 'acta.pdf', tipo: 'pdf', base64: 'AAAA' } })
    await correr(c)
    const otra = await correr({ ...c, workflow_execution_id: 'ex-2' })
    expect(otra.c.fichas).toMatchObject({ archivadas: 0, heredadas: 1 })
    expect(base.fichas).toHaveLength(1)
  })
  it('lo ilegible, protegido, vacío o sobre el tope SIGUE siendo «fallido» (sin ficha): solo el escaneado tiene ficha de archivo', async () => {
    for (const estado of ['ilegible', 'protegido', 'vacio', 'sobre_el_tope', 'tipo_no_admitido'] as const) {
      const { base, correr } = armar(agrupa(3), { leerArchivo: async () => ({ estado, tipo: 'pdf', nombre: 'x.pdf', huella: 'h'.repeat(64), bytes: 10, texto: '', avisos: [], motivo: estado }) })
      const r = await correr(cuerpo({ texto: undefined, archivo: { nombre: 'x.pdf', tipo: 'pdf', base64: 'AAAA' } }))
      expect(r.c.estado, estado).toBe('fallido')
      expect(base.fichas, estado).toHaveLength(0)
    }
  })
})

describe('2 · ninguna ficha se entrega cortada', () => {
  it('el máximo por ficha cabe en el límite de entrega (60.000) con margen', () => { expect(MAXIMO_DE_CARACTERES_POR_FICHA).toBeLessThanOrEqual(40_000) })
  it('un residual de ~118.000 caracteres se parte en fichas «sin clasificar» de a lo más el máximo, que juntas cubren TODOS los segmentos y entran enteras por `entregar`', async () => {
    const largo = 'x'.repeat(590)
    const texto = Array.from({ length: 200 }, (_x, i) => `S${i + 1} ${largo}`).join('\n\n')
    const { base, correr } = armar(() => respuestaJson({ fichas: [], descartes: [] }))
    base.otras.clients = [{ id: A, name: 'Cliente', website_url: null, status: 'active', config: {}, created_at: '2026-01-01T00:00:00Z' }]
    const r = await correr(cuerpo({ texto }))
    expect(r.c.segmentos).toMatchObject({ total: 200 })
    const fichas = base.fichas.filter((f) => f.residual === true)
    expect(fichas.length).toBeGreaterThan(2)
    expect(fichas.every((f) => String(f.contenido).length <= MAXIMO_DE_CARACTERES_POR_FICHA)).toBe(true)
    expect(fichas.flatMap((f) => f.firmas as string[])).toHaveLength(200)
    expect(String(fichas[0].titulo)).toMatch(/parte 1 de \d+/)
    const entrega = await entregarContenido(base.consulta, { cliente: String(fichas[0].client_id), refs: fichas.map((f) => `cerebro_fichas:${f.id}`) }, { ahora: AHORA })
    const material = (entrega.cuerpo.material as Array<Record<string, any>>) ?? []
    expect(material).toHaveLength(fichas.length)
    expect(material.every((x) => x.cortado === false)).toBe(true)
    expect(material.map((x) => x.texto).join('\n\n')).toBe(fichas.map((f) => f.contenido).join('\n\n'))
  })
  it('una ficha DEL MODELO con demasiado texto también se parte; `reemplaza` va solo en la primera parte y las demás son fichas nuevas', async () => {
    const largo = 'y'.repeat(590)
    const texto = Array.from({ length: 120 }, (_x, i) => `T${i + 1} ${largo}`).join('\n\n')
    const { base, correr } = armar((p) => respuestaJson({ fichas: [{ clase: 'doc', titulo: 'Todo el documento', que_es: 'x', segmentos: numerosDelMensaje(p), propiedad: 'propia', plazo: 'sin_plazo' }], descartes: [] }), { topeDeEntradaTokens: 100_000 })
    await correr(cuerpo({ texto }))
    const partes = base.fichas.filter((f) => /Todo el documento/.test(String(f.titulo)))
    expect(partes.length).toBeGreaterThan(1)
    expect(partes.every((f) => String(f.contenido).length <= MAXIMO_DE_CARACTERES_POR_FICHA)).toBe(true)
    expect(new Set(partes.map((f) => f.id)).size).toBe(partes.length)
  })
  it('lo corto NO se parte (una ficha normal queda una sola ficha, sin «parte»)', async () => {
    const { base, correr } = armar(agrupa(3))
    await correr(cuerpo({ texto: reglamento(6) }))
    expect(base.fichas.every((f) => !/parte \d+ de/.test(String(f.titulo)))).toBe(true)
  })
})

describe('3 · un documento largo no retrocede', () => {
  it('el tope de llamadas sigue a los segmentos (24 por pasada + 4 de margen), nunca baja de 12 y tiene un techo absoluto', () => {
    expect(llamadasMaximasPara(10)).toBe(12)
    expect(llamadasMaximasPara(561)).toBe(Math.ceil(561 / MAX_SEGMENTOS_POR_PASADA) + 4)
    expect(llamadasMaximasPara(100_000)).toBe(MAXIMO_ABSOLUTO_DE_LLAMADAS)
  })
  it('un reglamento de 561 artículos con un modelo de salida corta entra COMPLETO: las pasadas crecen con lo que la salida deja (pocas, no 24)', async () => {
    const { base, m, correr } = armar(agrupa(40, 300), { topeDeGastoPorIngresoUsd: 5, topeDeGastoPorLlamadaUsd: 1 })
    const r = await correr(cuerpo({ texto: reglamento(561) }))
    expect(r.c).toMatchObject({ estado: 'fichado', cobertura: 1, segmentos: { total: 561, residuales: 0 } })
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p).length)
    expect(largos[0]).toBe(MAX_SEGMENTOS_POR_PASADA) // la primera pasada mide
    expect(Math.max(...largos)).toBeGreaterThan(MAX_SEGMENTOS_POR_PASADA)
    expect(m.espia.peticiones.length).toBeLessThanOrEqual(14)
    expect(base.fichas.flatMap((f) => f.firmas as string[])).toHaveLength(561)
  })
  it('un modelo que gasta MUCHA salida por segmento (catálogo) se queda en 24 por pasada', async () => {
    const { m, correr } = armar(agrupa(3, 1700), { topeDeGastoPorIngresoUsd: 5, topeDeGastoPorLlamadaUsd: 1 })
    await correr(cuerpo({ texto: reglamento(96) }))
    expect(m.espia.peticiones.map((p) => numerosDelMensaje(p).length).every((n) => n <= MAX_SEGMENTOS_POR_PASADA)).toBe(true)
  })
  it('si una pasada grande se corta, vuelve a 24 y la cola pendiente se vuelve a partir a 24 (nada se pierde)', async () => {
    let n = 0
    const { base, m, correr } = armar((p) => {
      n++
      const ns = numerosDelMensaje(p)
      if (ns.length > MAX_SEGMENTOS_POR_PASADA) return { texto: '{"fichas":[{"clase":"prod', stop_reason: 'max_tokens', usage: { input_tokens: 2500, output_tokens: 2000 } }
      return agrupa(3, n === 1 ? 100 : 300)(p, n) as never
    }, { topeDeGastoPorIngresoUsd: 5, topeDeGastoPorLlamadaUsd: 1 })
    const r = await correr(cuerpo({ texto: reglamento(200) }))
    expect(r.c.estado).toBe('fichado')
    expect(base.fichas.flatMap((f) => f.firmas as string[])).toHaveLength(200)
    const largos = m.espia.peticiones.map((p) => numerosDelMensaje(p).length)
    expect(largos.some((x) => x > MAX_SEGMENTOS_POR_PASADA)).toBe(true) // creció una vez…
    expect(largos.slice(largos.findIndex((x) => x > MAX_SEGMENTOS_POR_PASADA) + 1).filter((x) => x > MAX_SEGMENTOS_POR_PASADA && x < 200).length).toBeLessThanOrEqual(0) // …y tras el corte no volvió a pasarse
  })
  it('el tope de llamadas por segmentos: 24 pasadas de 24 segmentos caben (antes paraba en 12 y dejaba el documento a medias)', async () => {
    const { m, correr } = armar(agrupa(3, 1700), { topeDeGastoPorIngresoUsd: 50, topeDeGastoPorLlamadaUsd: 5 })
    const r = await correr(cuerpo({ texto: reglamento(561) }))
    expect(m.espia.peticiones.length).toBe(Math.ceil(561 / MAX_SEGMENTOS_POR_PASADA))
    expect(r.c.segmentos.residuales).toBe(0)
  })
})

describe('4 · una hoja o una tabla: una fila = un segmento = (a juicio del modelo) una ficha', () => {
  const csv = 'servicio,precio,unidad\n' + Array.from({ length: 12 }, (_x, i) => `serv${i + 1},${10 + i},hora`).join('\n') + '\n'
  const b64 = Buffer.from(csv, 'utf8').toString('base64')
  it('un CSV de 12 filas llega al modelo como 1 encabezado + 12 segmentos, y con un modelo que da una ficha por fila quedan 12 fichas de fila (cada una con su fila entera)', async () => {
    const { base, m, correr } = armar(agrupa(1))
    const r = await correr(cuerpo({ texto: undefined, fuente_ref: 'drive:tarifas', archivo: { nombre: 'tarifas.csv', tipo: 'csv', base64: b64 } }))
    expect(r.c.estado).toBe('fichado')
    expect(numerosDelMensaje(m.espia.peticiones[0])).toHaveLength(13)
    const filas = base.fichas.filter((f) => /^fila \d+: servicio: serv\d+ \| precio: \d+ \| unidad: hora$/.test(String(f.contenido)))
    expect(filas).toHaveLength(12)
    expect(new Set(filas.map((f) => f.contenido)).size).toBe(12)
  })
  it('cambiar UNA fila del CSV re-ingresado va al modelo solo con esa fila (las otras 11 se heredan): se puede vencer o retirar una fila sola', async () => {
    const { base, m, correr } = armar(agrupa(1))
    const entrada = (t: string) => cuerpo({ texto: undefined, fuente_ref: 'drive:tarifas', archivo: { nombre: 'tarifas.csv', tipo: 'csv', base64: Buffer.from(t, 'utf8').toString('base64') } })
    await correr(entrada(csv))
    const antes = m.espia.peticiones.length
    const nuevo = csv.replace('serv5,14,hora', 'serv5,99,hora')
    const r = await correr({ ...entrada(nuevo), workflow_execution_id: 'ex-2' })
    expect(r.c.estado).toBe('fichado')
    expect(m.espia.peticiones.length).toBe(antes + 1)
    expect(numerosDelMensaje(m.espia.peticiones[antes])).toHaveLength(1)
    expect(base.fichas.filter((f) => f.retirada_en)).toHaveLength(1) // este modelo simulado no manda «reemplaza»: la fila vieja se retira, solo ELLA (la herencia no cambia)
  })
  it('la instrucción pide una ficha por fila, cláusula o entrada (y agrupar cuando el documento es largo)', () => {
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/una ficha por fila/i)
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/cl[áa]usula/i)
    expect(INSTRUCCION_DE_RECIBIR).toMatch(/agrupa/i)
  })
})

describe('3b · una pasada que crece nunca pasa del gasto máximo por llamada', () => {
  it('120 segmentos largos (590 caracteres) con un modelo de salida corta y el tope por llamada de FÁBRICA: las pasadas crecen sólo hasta lo que cabe en US$ 0,08 de peor caso → «fichado», no «parcial»', async () => {
    const largo = 'z'.repeat(590)
    const texto = Array.from({ length: 120 }, (_x, i) => `U${i + 1} ${largo}`).join('\n\n')
    const { base, m, correr } = armar(agrupa(40, 300), { topeDeEntradaTokens: 100_000 })
    const r = await correr(cuerpo({ texto }))
    expect(r.c.estado).toBe('fichado')
    expect(r.c.segmentos.residuales).toBe(0)
    expect(base.fichas.flatMap((f) => f.firmas as string[])).toHaveLength(120)
    expect(Math.max(...m.espia.peticiones.map((p) => numerosDelMensaje(p).length))).toBeGreaterThan(MAX_SEGMENTOS_POR_PASADA)
  })
})
