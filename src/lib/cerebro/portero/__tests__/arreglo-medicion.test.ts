/**
 * Los cinco defectos que mostró la medición real 1 (20 casos, 20 llamadas reales a Sonnet 5.5), con el modelo SIMULADO.
 * Escritas ANTES del código. Cada bloque nombra el hecho medido que lo origina.
 *  1. el gasto de la llamada sin registro debe VERSE         2. el lector toma la decisión aunque venga con texto alrededor
 *  3. el tope de la lista se mide en «tokens» con el factor medido  4. una lista grande se razona en dos pasadas
 *  5. el dorado corre entero por la ruta con una lista de prueba que no lee ni escribe ninguna tabla
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { interpretarDecision } from '../decision'
import { INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { numerarLista } from '../lista-numerada'
import { CARACTERES_POR_TOKEN, TOPE_DE_ENTRADA_EN_TOKENS, estimarTokens } from '../medida'
import { INSTRUCCION_DE_ESTANTES, TOPE_DE_GASTO_POR_PEDIDO_USD, razonar, type DepsDeRazonar, type PeticionAlModelo, type RespuestaDelModelo } from '../razonar'

afterEach(() => { vi.restoreAllMocks() })

// ───────────────────────── herramientas
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, que_es = 'una cosa del archivo del cliente que sirve para producir piezas de comunicación nuevas'): Ficha => ({
  ref: `prueba:${estante}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: '2026-09-20T00:00:00.000Z', vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40,
})
/** el caso inventado de 571 líneas de CC#2 (W3): un catálogo enorme y unos pocos estantes chicos */
function listaGrande(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E1', 'plan', `Plan de comunicación ${i}`))
  for (let i = 0; i < 545; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} · referencia ${(i * 7919) % 10007} de la familia ${i % 23}`, 'ficha de un producto del catálogo con su presentación, su medida y su precio de lista vigente'))
  for (let i = 0; i < 13; i++) f.push(ficha(i, 'E3', 'sede', `Sede ${i}`))
  for (let i = 0; i < 7; i++) f.push(ficha(i, 'E5', 'foto', `Foto ${i}`))
  f.push(ficha(0, 'E6', 'sitio', 'Página principal'))
  return f
}
const listaChica = (): Ficha[] => [ficha(1, 'E1', 'plan', 'Plan uno'), ficha(2, 'E2', 'catalogo_item', 'Producto dos'), ficha(3, 'E3', 'sede', 'Sede tres')]

interface Espia { peticiones: PeticionAlModelo[]; registros: Array<Record<string, unknown>> }
type Contesta = (p: PeticionAlModelo, n: number) => string | Error | (Partial<RespuestaDelModelo> & { texto: string })
function armar(contesta: Contesta, over: Partial<DepsDeRazonar> = {}, tablas = tablasDeLaBase()): { deps: DepsDeRazonar; espia: Espia; base: ReturnType<typeof crearBaseFalsa> } {
  const espia: Espia = { peticiones: [], registros: [] }
  const base = crearBaseFalsa(tablas)
  const deps: DepsDeRazonar = {
    consulta: base.consulta,
    llamarModelo: async (p) => {
      espia.peticiones.push(p)
      const r = contesta(p, espia.peticiones.length)
      if (r instanceof Error) throw r
      const o = typeof r === 'string' ? { texto: r } : r
      return { usage: { input_tokens: 7000, output_tokens: 600 }, ...o }
    },
    registrar: async (fila) => { espia.registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
    ...over,
  }
  return { deps, espia, base }
}
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1',
  voy_a_producir: { output: 'carrusel de reels', material: 'video', canal: 'red social', objetivo: 'vender el servicio uno' },
  necesito: 'tengo que hacer un carrusel de reels', ronda: 1, ...extra,
})
const conLista = (fichas: Ficha[], extra: Record<string, unknown> = {}) => cuerpo({ prueba: true, lista_de_prueba: fichas, ...extra })
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const numerosDe = (texto: string) => [...texto.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const buenaDecision = (n: number[]) => JSON.stringify({ entregar: n, pixeles: [], por_que: [{ numeros: n.slice(0, 1), linea: 'sirve' }], faltantes: [], duda: [] })

// ───────────────────────── 1 · el gasto sin registro debe verse
describe('defecto 1 · una llamada al modelo sin registro es un defecto que se VE, no una nota', () => {
  it('si el registro responde {ok:false}: la respuesta lleva la alerta de primer nivel y cuánto costó lo que no quedó anotado', async () => {
    const { deps } = armar(() => buenaDecision([1]), { registrar: async () => ({ ok: false, detalle: 'log-invocation respondió 500' }) })
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r.alerta).toBe('llamada_sin_registro')
    expect(r.registro_fallido).toBe(true)
    expect(r.gasto_sin_registrar_usd).toBeCloseTo(r.costo_usd, 10)
    expect(r.gasto_sin_registrar_usd).toBeGreaterThan(0)
    expect(r.registro).toMatchObject({ ok: false, detalle: 'log-invocation respondió 500' })
  })
  it('también deja un renglón de error en el registro del servidor (lo que se lee en los logs), con el workflow y el costo', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = armar(() => buenaDecision([1]), { registrar: async () => { throw new Error('sin red') } })
    await razonar(deps, conLista(listaChica()))
    const texto = error.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(texto).toMatch(/portero\.razonar/)
    expect(texto).toMatch(/LLAMADA_SIN_REGISTRO/)
    expect(texto).toMatch(/wf-prueba/)
    expect(texto).not.toMatch(/INTERNAL_API_KEY|CLAUDE_API_KEY/)
  })
  it('si el registro funciona NO hay alerta', async () => {
    const { deps } = armar(() => buenaDecision([1]))
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r).not.toHaveProperty('alerta')
    expect(r.registro_fallido).toBeUndefined()
    expect(r.registro).toEqual({ ok: true })
  })
  it('una llamada que falló (pero se pagó o se intentó) y no se registró también alerta', async () => {
    const { deps } = armar(() => new Error('boom'), { registrar: async () => ({ ok: false, detalle: 'x' }) })
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r.alerta).toBe('llamada_sin_registro')
  })
})

// ───────────────────────── 2 · el lector
describe('defecto 2 · el lector toma la decisión aunque venga con texto alrededor (4 de 20 respuestas reales caían a respaldo por eso)', () => {
  const lista = () => numerarLista({ cliente_id: 'x', generada_en: 'x', estado: 'ok', fuentes: {} as never, lineas: listaChica() })
  const dec = JSON.stringify({ entregar: [1, 2], pixeles: [], por_que: [{ numeros: [1], linea: 'sirve' }], faltantes: ['algo'], duda: [] })
  const ok = (texto: string, o: Parameters<typeof interpretarDecision>[2] = { pixeles: true }) => interpretarDecision(texto, lista(), o)
  it.each([
    ['un párrafo y después el JSON', `El trabajo necesita el plan y el producto, así que entrego lo siguiente.\n\n${dec}`],
    ['un párrafo y el JSON en bloque de código', `Para el cotizador necesito el catálogo.\n\n\`\`\`json\n${dec}\n\`\`\``],
    ['el JSON y un comentario después', `${dec}\n\nNota: dudé de la sede.`],
    ['el JSON con llaves y corchetes dentro de un texto del párrafo previo', `Piensa en {algo} [así] y entrega.\n${dec}`],
    ['bloque de código sin cierre', `Aquí va:\n\`\`\`json\n${dec}`],
  ])('%s', (_n, texto) => {
    const r = ok(texto)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    if (r.ok) { expect(r.decision.entregar_numeros).toEqual([1, 2]); expect(r.decision.faltantes).toEqual(['algo']) }
  })
  it('una llave o una comilla dentro de una frase del JSON no corta la lectura', () => {
    const j = JSON.stringify({ entregar: [1], por_que: [{ numeros: [1], linea: 'incluye {llaves} y "comillas" y } sueltas' }] })
    const r = ok(`antes {con llave\n${j}\ndespués }`)
    expect(r.ok && r.decision.por_que[0].linea).toBe('incluye {llaves} y "comillas" y } sueltas')
  })
  it('si hay dos objetos, toma el primero que trae «entregar» (no el primer corchete que aparezca)', () => {
    const r = ok(`mira {"otra":"cosa"} y ahora sí: ${dec}`)
    expect(r.ok && r.decision.entregar_numeros).toEqual([1, 2])
  })
  it('sin ningún JSON sigue siendo json_roto (no se inventa una decisión del texto)', () => {
    expect(ok('claro, aquí tienes: 1 y 2')).toEqual({ ok: false, caida: 'json_roto' })
    expect(ok('')).toEqual({ ok: false, caida: 'json_roto' })
  })
  it('lo que había en el texto de alrededor NUNCA entra a la decisión: solo lo que trae el JSON', () => {
    const r = ok(`entrega el 3, el 3, el 3 ${dec}`)
    expect(r.ok && r.decision.entregar_numeros).toEqual([1, 2])
  })
  it('SALIDA CORTADA por max_tokens: se dice como tal, no «json roto»', () => {
    const cortado = '{"entregar":[1,2],"pixeles":[],"por_que":[{"numeros":[1],"linea":"el trabajo necesita'
    expect(ok(cortado, { pixeles: true, cortada: true })).toEqual({ ok: false, caida: 'salida_cortada' })
    expect(ok(cortado, { pixeles: true })).toEqual({ ok: false, caida: 'json_roto' }) // sin saber que se cortó, es lo que es
  })
  it('si la salida se cortó pero el JSON ya estaba COMPLETO antes del corte, la decisión vale', () => {
    const r = ok(`${dec}\n\nAdemás quiero explicar que el trabajo neces`, { pixeles: true, cortada: true })
    expect(r.ok).toBe(true)
  })
  it('un párrafo largo y un JSON que se corta a media lista: salida_cortada (el caso W1-75 real)', () => {
    expect(ok('Un cotizador necesita el catálogo completo ... {"entregar":[1,2,3,', { pixeles: true, cortada: true })).toEqual({ ok: false, caida: 'salida_cortada' })
  })
})

describe('defecto 2 · en la ruta: la salida cortada se declara con su motivo y el modelo dijo por qué paró', () => {
  it('stop_reason max_tokens + JSON a medias → respaldo con motivo salida_cortada, y el registro guarda el stop_reason', async () => {
    const { deps, espia } = armar(() => ({ texto: '{"entregar":[1,2],"por_que":[{"numeros":[1],"linea":"el tra', stop_reason: 'max_tokens', usage: { input_tokens: 9000, output_tokens: 1500 } }))
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'salida_cortada', llamo_al_modelo: true, stop_reason: 'max_tokens' })
    expect(espia.registros[0].metadata).toMatchObject({ motivo_de_respaldo: 'salida_cortada', stop_reason: 'max_tokens' })
  })
  it('un párrafo antes del JSON ya no cae al respaldo', async () => {
    const { deps } = armar(() => `Entrego lo que sirve para el trabajo.\n\n${buenaDecision([1, 2])}`)
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r).toMatchObject({ modo: 'conversado', llamo_al_modelo: true })
    expect(r.decision.entregar_numeros).toEqual([1, 2])
  })
})

describe('defecto 2 · ¿alcanzan 1.500 de salida? (respuestas crudas de la medición real)', () => {
  it('el tope sigue en 1.500 y la medición lo respalda: 19 de 20 terminaron solas (523–1.282); la única que se cortó traía un párrafo de 3.243 caracteres', async () => {
    const { MAX_TOKENS_DE_SALIDA } = await import('../razonar')
    expect(MAX_TOKENS_DE_SALIDA).toBe(1500)
  })
})

// ───────────────────────── instrucción (la parte GENERAL de la ronda 2 de CC#2)
describe('instrucción · se toma de la ronda 2 solo lo general', () => {
  it('pide la respuesta como UN solo JSON, sin texto antes ni después, y dice que lo de afuera se pierde', () => {
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/UN solo JSON, de la primera llave a la última, sin una palabra antes ni después/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/Todo lo que quieras explicar va en «por_que»/)
  })
  it('la regla 2 incluye lo que identifica un lugar o canal al que se manda a la persona (general: no nombra rubro ni cliente ni tipo de trabajo)', () => {
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/manda a la persona a otro lugar o canal/)
  })
  it('ninguna de las dos instrucciones nombra un rubro, un cliente o un tipo de trabajo', () => {
    for (const t of [INSTRUCCION_DEL_PORTERO, INSTRUCCION_DE_ESTANTES]) {
      expect(t).not.toMatch(/laboratorio|cl[ií]nica|restaurante|marisquer|cotizador|chequeo|n[aá]ufrago|p[eé]rez|ferreter|inmobiliari/i)
    }
  })
})

// ───────────────────────── 3 · la medida
describe('defecto 3 · el tope se mide en «tokens» con el factor MEDIDO (no con caracteres ÷ 2,8)', () => {
  it('el factor sale de los conteos reales: 1,91–1,96 caracteres por «token»; se usa 1,7 (margen ≈ 12 %) y la estimación nunca queda por debajo del contador real', () => {
    expect(CARACTERES_POR_TOKEN).toBe(1.7)
    // [caracteres de instrucción + mensaje, «tokens» de entrada que contó el modelo] · medición real 1, W1 y W2
    for (const [caracteres, real] of [[23807, 12440], [23770, 12430], [23733, 12406], [19638, 10011], [19640, 10005], [19621, 9986]]) {
      expect(estimarTokens(caracteres), `${caracteres} caracteres`).toBeGreaterThanOrEqual(real)
      expect(estimarTokens(caracteres)).toBeLessThanOrEqual(real * 1.2) // con margen, no con exceso
    }
  })
  it('estimarTokens redondea hacia arriba y no se rompe con vacío', () => {
    expect(estimarTokens(0)).toBe(0)
    expect(estimarTokens(1)).toBe(1)
    expect(estimarTokens(17)).toBe(10)
    expect(estimarTokens(18)).toBe(11)
  })
  it('el tope de entrada declarado es 20.000 «tokens» y su peor caso (con 1.500 de salida) cuesta menos que el tope por llamada', async () => {
    const { TOPE_DE_GASTO_POR_LLAMADA_USD, costoDeLaLlamada, MAX_TOKENS_DE_SALIDA } = await import('../razonar')
    expect(TOPE_DE_ENTRADA_EN_TOKENS).toBe(20_000)
    expect(costoDeLaLlamada({ input_tokens: TOPE_DE_ENTRADA_EN_TOKENS, output_tokens: MAX_TOKENS_DE_SALIDA })).toBeLessThan(TOPE_DE_GASTO_POR_LLAMADA_USD)
  })
  it('una lista de las líneas medidas (≈ 95–105 «tokens» por línea) cabe entera hasta ≈ 170–190 líneas; la de 131 (W1, la que antes caía) pasa en UNA pasada', async () => {
    const f: Ficha[] = Array.from({ length: 131 }, (_, i) => ficha(i, 'E2', 'catalogo_item', `Producto ${i} de la familia ${i % 9}`, 'ficha de un producto del catálogo con su presentación, su medida y su precio de lista vigente'))
    const { deps, espia } = armar(() => buenaDecision([1]))
    const r = salida(await razonar(deps, conLista(f)))
    expect(r.pasadas).toBe(1)
    expect(espia.peticiones).toHaveLength(1)
  })
})

// ───────────────────────── 4 · dos pasadas
describe('defecto 4 · la lista grande (571 líneas inventadas) SÍ se razona: dos pasadas por estante, con costo máximo por pedido', () => {
  const contestaDosPasadas = (estantes: string[], tras: (n: number[]) => string = buenaDecision): Contesta => (p) => {
    if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes, por_que: 'el producto está en el catálogo' })
    return tras(numerosDe(listaDe(p)).slice(0, 3))
  }
  it('pasada 1: una línea por estante con su conteo, su peso y los títulos de las 5 cosas más recientes; el modelo elige estantes', async () => {
    const { deps, espia } = armar(contestaDosPasadas(['E2', 'E3']))
    await razonar(deps, conLista(listaGrande()))
    const p1 = espia.peticiones[0]
    expect(p1.system).toBe(INSTRUCCION_DE_ESTANTES)
    expect(p1.max_tokens).toBeLessThanOrEqual(600)
    expect(p1.thinking).toEqual({ type: 'between_tools' })
    const texto = /<estantes>\n([\s\S]*)\n<\/estantes>/.exec(p1.messages[0].content)![1].split('\n')
    expect(texto).toHaveLength(5) // E1 E2 E3 E5 E6
    expect(texto.find((l) => l.startsWith('E2'))).toMatch(/545 cosas/)
    expect(texto.find((l) => l.startsWith('E3'))).toMatch(/13 cosas/)
    expect(p1.messages[0].content).toMatch(/<pedido>[\s\S]*carrusel de reels/)
    expect(p1.messages[0].content).not.toMatch(/^#\d+ /m) // la pasada 1 NO lleva la lista de líneas
  })
  it('pasada 2: solo las líneas de los estantes elegidos, con SU número de la lista completa; el resto no se muestra', async () => {
    const { deps, espia } = armar(contestaDosPasadas(['E3', 'E5']))
    const r = salida(await razonar(deps, conLista(listaGrande())))
    expect(espia.peticiones).toHaveLength(2)
    const p2 = espia.peticiones[1]
    expect(p2.system).toBe(INSTRUCCION_DEL_PORTERO)
    const lineas = listaDe(p2).split('\n')
    expect(lineas).toHaveLength(13 + 7)
    expect(lineas.every((l) => / E3 sede · | E5 foto · /.test(l))).toBe(true)
    const completa = numerarLista({ cliente_id: 'x', generada_en: 'x', estado: 'ok', fuentes: {} as never, lineas: listaGrande() })
    const num = (ref: string) => completa.lineas.find((l) => l.ficha.ref === ref)!.numero
    expect(numerosDe(listaDe(p2)).slice(0, 2)).toEqual([num('prueba:E3-0000'), num('prueba:E3-0001')]) // los números son los de la lista completa
    expect(r).toMatchObject({ modo: 'conversado', pasadas: 2, llamo_al_modelo: true })
    expect(r.decision.entregar.every((x: string) => x.startsWith('prueba:E3-') || x.startsWith('prueba:E5-'))).toBe(true)
  })
  it('un estante que solo ya pasa el tope: muestra las líneas que más coinciden en texto con el pedido (máx. 100), y lo demás queda por conteo', async () => {
    const f = listaGrande()
    // una línea del catálogo que coincide con el pedido, escondida al fondo del estante
    const buscada = f.find((x) => x.ref === 'prueba:E2-0444')!
    buscada.titulo = 'Producto de servicio uno para vender · carrusel de reels'
    const { deps, espia } = armar(contestaDosPasadas(['E2']))
    const r = salida(await razonar(deps, conLista(f, { necesito: 'carrusel de reels para vender el servicio uno' })))
    const p2 = espia.peticiones[1]
    const lineas = listaDe(p2).split('\n').filter((l) => /^#\d+ /.test(l))
    expect(lineas.length).toBeLessThanOrEqual(100)
    expect(lineas.some((l) => l.includes('carrusel de reels'))).toBe(true) // la que coincide entra aunque estaba al fondo
    expect(listaDe(p2)).toMatch(/545 .*(100|mostradas)|445 (cosas )?más/i) // dice cuántas quedaron fuera
    expect(r.pasada_2).toMatchObject({ recortada_por_coincidencia: true, lineas_mostradas: lineas.length, lineas_no_mostradas: 545 - lineas.length })
    // la entrada de la pasada 2 respeta el tope de entrada
    expect(estimarTokens(p2.system.length + p2.messages[0].content.length)).toBeLessThanOrEqual(TOPE_DE_ENTRADA_EN_TOKENS)
  })
  it('el modelo no puede elegir una línea que no se le mostró (número fuera de lo desplegado → inválido, anotado)', async () => {
    const { deps } = armar(contestaDosPasadas(['E3'], () => JSON.stringify({ entregar: [1, 5, 600], pixeles: [] })))
    const r = salida(await razonar(deps, conLista(listaGrande())))
    // los números 1 y 5 son del estante E1 (no mostrado) y 600 no existe: todos inválidos → respaldo declarado
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'todos_los_numeros_invalidos' })
  })
  it('costo declarado y con tope: nunca más de DOS llamadas, la suma se informa y el peor caso de la pasada 2 no pasa el tope por pedido', async () => {
    expect(TOPE_DE_GASTO_POR_PEDIDO_USD).toBeGreaterThan(0.08)
    expect(TOPE_DE_GASTO_POR_PEDIDO_USD).toBeLessThanOrEqual(0.15)
    const { deps, espia } = armar(contestaDosPasadas(['E2']))
    const r = salida(await razonar(deps, conLista(listaGrande())))
    expect(espia.peticiones).toHaveLength(2)
    expect(r.costo_usd).toBeCloseTo(2 * ((7000 * 2 + 600 * 10) / 1_000_000), 8)
    expect(r.tokens).toEqual({ entrada: 14000, salida: 1200 })
    expect(r.costo_usd).toBeLessThanOrEqual(TOPE_DE_GASTO_POR_PEDIDO_USD)
    expect(espia.registros).toHaveLength(2) // cada llamada se registra
    expect(espia.registros.map((x) => (x.metadata as { pasada: number }).pasada)).toEqual([1, 2])
    expect(espia.registros.every((x) => x.workflow_id === 'wf-prueba')).toBe(true)
  })
  it('si el gasto de la pasada 1 + el peor caso de la 2 pasaría el tope por pedido, la pasada 2 NO se hace (respaldo tope_de_gasto, ya pagado lo de la 1)', async () => {
    const { deps, espia } = armar(contestaDosPasadas(['E2']), { topeDeGastoPorPedidoUsd: 0.03 })
    const r = salida(await razonar(deps, conLista(listaGrande())))
    expect(espia.peticiones).toHaveLength(1)
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tope_de_gasto', pasadas: 1 })
    expect(r.costo_usd).toBeGreaterThan(0)
  })
  it('pasada 1 con estantes inventados o vacíos → respaldo con su motivo y SIN pasada 2', async () => {
    for (const texto of [JSON.stringify({ estantes: ['E9'] }), JSON.stringify({ estantes: [] }), '{"estantes": "todos"}']) {
      const { deps, espia } = armar(() => texto)
      const r = salida(await razonar(deps, conLista(listaGrande())))
      expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'estantes_invalidos', llamo_al_modelo: true })
      expect(espia.peticiones).toHaveLength(1)
    }
  })
  it('un estante inventado mezclado con uno bueno: se usa el bueno y se anota el otro', async () => {
    const { deps, espia } = armar(contestaDosPasadas(['E9', 'E3']))
    const r = salida(await razonar(deps, conLista(listaGrande())))
    expect(espia.peticiones).toHaveLength(2)
    expect(r.pasada_1).toMatchObject({ estantes_elegidos: ['E3'], estantes_invalidos: ['E9'] })
  })
  it('la pasada 1 lee el JSON aunque venga con texto alrededor, y si se corta lo dice (salida_cortada)', async () => {
    const a = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? `Miro los estantes.\n{"estantes":["E3"]}` : buenaDecision(numerosDe(listaDe(p)).slice(0, 1))))
    expect(salida(await razonar(a.deps, conLista(listaGrande())))).toMatchObject({ modo: 'conversado', pasadas: 2 })
    const b = armar(() => ({ texto: '{"estantes":["E3","E', stop_reason: 'max_tokens' }))
    expect(salida(await razonar(b.deps, conLista(listaGrande())))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'salida_cortada' })
  })
  it('si falla la pasada 1 (error del modelo / tiempo) → respaldo, UNA llamada, registrada; si falla la 2 → respaldo con las dos registradas', async () => {
    const a = armar(() => new Error('boom'))
    const ra = salida(await razonar(a.deps, conLista(listaGrande())))
    expect(ra).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'error_del_modelo' })
    expect(a.espia.peticiones).toHaveLength(1)
    expect(a.espia.registros).toHaveLength(1)
    const b = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E3'] }) : Object.assign(new Error('t'), { name: 'AbortError' })))
    const rb = salida(await razonar(b.deps, conLista(listaGrande())))
    expect(rb).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tiempo' })
    expect(b.espia.peticiones).toHaveLength(2) // sin reintentos
    expect(b.espia.registros).toHaveLength(2)
    expect(b.espia.registros[1]).toMatchObject({ status: 'timeout' })
  })
  it('la lista que cabe sigue en UNA pasada y sin pasada 1 (no se gasta de más)', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(espia.peticiones).toHaveLength(1)
    expect(espia.peticiones[0].system).toBe(INSTRUCCION_DEL_PORTERO)
    expect(r.pasadas).toBe(1)
  })
  it('sin regla por rubro ni por tipo de trabajo: los estantes se agrupan por la etiqueta de la propia ficha y la coincidencia es solo de palabras del pedido', async () => {
    const f = listaGrande().map((x) => ({ ...x, clase: 'otra_clase_que_no_existe' }))
    const { deps, espia } = armar(contestaDosPasadas(['E2']))
    const r = salida(await razonar(deps, conLista(f)))
    expect(r.pasadas).toBe(2)
    expect(espia.peticiones).toHaveLength(2)
  })
})

// ───────────────────────── 5 · probar sin salirse del flujo
describe('defecto 5 · el dorado corre entero por la ruta con una lista de prueba: sin leer ni escribir tablas de cliente', () => {
  it('con prueba:true y lista_de_prueba NO se lee ninguna tabla (0 consultas): no hay forma de leer a otro cliente por esta vía', async () => {
    const { deps, base } = armar(() => buenaDecision([1]))
    const r = salida(await razonar(deps, conLista(listaChica(), { cliente: 'cliente-que-no-existe-en-ninguna-tabla' })))
    expect(base.llamadas).toHaveLength(0)
    expect(r).toMatchObject({ modo: 'conversado', prueba: true, llamo_al_modelo: true })
  })
  it('la lista de prueba no se mezcla con la real: aunque el cliente sea uno REAL con material, solo se ve lo que vino en la petición', async () => {
    const { deps, espia, base } = armar(() => buenaDecision([1]))
    await razonar(deps, conLista(listaChica(), { cliente: A }))
    expect(base.llamadas).toHaveLength(0)
    expect(listaDe(espia.peticiones[0]).split('\n')).toHaveLength(3)
  })
  it('queda registrada MARCADA como prueba y sin client_id (no se escribe ningún cliente inventado en tablas de cliente)', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    await razonar(deps, conLista(listaChica(), { cliente: 'W1' }))
    const fila = espia.registros[0]
    expect(fila.workflow_id).toBe('wf-prueba')
    expect(fila).not.toHaveProperty('client_id')
    expect(fila.command).toBe('portero.razonar.prueba')
    expect(fila.metadata).toMatchObject({ prueba: true, cliente_de_prueba: 'W1' })
  })
  it('la lista de prueba SIN prueba:true se rechaza (400): no hay modo de prueba por accidente', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    const r = await razonar(deps, cuerpo({ lista_de_prueba: listaChica() }))
    expect(r.status).toBe(400)
    expect(espia.peticiones).toHaveLength(0)
  })
  it('prueba:true sin lista NO hace nada especial: lee la base del cliente como siempre y NO se marca como prueba', async () => {
    const { deps, base } = armar(() => buenaDecision([1]))
    const r = salida(await razonar(deps, cuerpo({ prueba: true })))
    expect(base.llamadas.length).toBeGreaterThan(0)
    expect(r.prueba).toBeUndefined()
  })
  it('sigue exigiendo workflow_id y execution id (403) también en prueba', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    const c = conLista(listaChica()) as Record<string, unknown>
    delete c.workflow_execution_id
    expect((await razonar(deps, c)).status).toBe(403)
    expect(espia.peticiones).toHaveLength(0)
  })
  it('acota lo que se acepta: más de 800 líneas, un texto de más de 400.000 caracteres o una ficha mal armada → 400 y el modelo no se llama', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    const muchas = Array.from({ length: 801 }, (_, i) => ficha(i, 'E2', 'catalogo_item', `P${i}`))
    expect((await razonar(deps, conLista(muchas))).status).toBe(400)
    const gorda = [ficha(1, 'E1', 'plan', 'x'.repeat(400_001))]
    expect((await razonar(deps, conLista(gorda))).status).toBe(400)
    for (const mala of [[{ ref: 'a' }], [null], ['texto'], [{ ...ficha(1, 'E1', 'plan', 't'), peso_estimado: 'mucho' }]]) {
      expect((await razonar(deps, conLista(mala as never))).status).toBe(400)
    }
    expect((await razonar(deps, conLista([] as never))).status).toBe(400)
    expect(espia.peticiones).toHaveLength(0)
  })
  it('no devuelve contenido alguno: solo números y referencias de la propia lista de prueba (las referencias de prueba no apuntan a ninguna tabla)', async () => {
    const { deps } = armar(() => buenaDecision([1, 2]))
    const r = salida(await razonar(deps, conLista(listaChica())))
    expect(r.decision.entregar).toEqual(['prueba:E1-0001', 'prueba:E2-0002'])
    expect(JSON.stringify(r)).not.toMatch(/contenido/)
  })
  it('una ficha de prueba no puede traer `contenido` ni campos extra: se ignoran (no llegan al modelo)', async () => {
    const { deps, espia } = armar(() => buenaDecision([1]))
    const f = { ...ficha(1, 'E1', 'plan', 'Plan uno'), contenido: 'SECRETO-DEL-CONTENIDO', extra: 'SECRETO-EXTRA' } as Ficha
    await razonar(deps, conLista([f]))
    expect(JSON.stringify(espia.peticiones[0])).not.toMatch(/SECRETO/)
  })
  it('la lista grande también corre por esta vía en dos pasadas (el caso W3 del dorado)', async () => {
    const { deps, espia, base } = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E2'] }) : buenaDecision(numerosDe(listaDe(p)).slice(0, 4))))
    const r = salida(await razonar(deps, conLista(listaGrande())))
    expect(base.llamadas).toHaveLength(0)
    expect(r).toMatchObject({ prueba: true, pasadas: 2, modo: 'conversado' })
    expect(espia.registros.every((x) => (x.metadata as { prueba: boolean }).prueba === true)).toBe(true)
  })
})
