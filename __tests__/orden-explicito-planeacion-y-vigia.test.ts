/**
 * EL ORDEN DE LOS NODOS ES EXPLÍCITO, NO DE POSICIÓN · pruebas a costo cero · CC#1 · 2026-09-30 · decisión de Emilio.
 * Arreglo de raíz de la planeación (X9F0zp6LQ2xGEYVS) y del Vigía del silencio (0WRWM0cChdiAxfTY): el nodo que se LEE pasa a ser ANTECESOR del que lo lee.
 * Y la regla adoptada como prueba automática: toda lectura por nombre `$('X')` apunta a un antecesor (salvo disparadores).
 *
 * 🔴 Cada rojo se prueba contra el defecto real: el flujo de ANTES tiene que dar el hallazgo viejo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30')
type Nodo = { name: string; type: string; parameters: Record<string, any>; position: number[]; alwaysOutputData?: boolean; onError?: string }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; settings: Record<string, unknown> }
const leer = (f: string): Flujo => JSON.parse(readFileSync(join(DIR, f), 'utf8'))
const L = await import(pathToFileURL(join(DIR, 'lecturas-fuera-de-orden.mjs')).href)
const C = await import(pathToFileURL(join(DIR, 'construir-orden-explicito-2026-09-30.mjs')).href)
const { lecturasFueraDeOrden, antecesoresDe, referenciasDe, ordenDeEjecucion } = L
const { construirPlaneacion, construirVigia, PLANEACION: P, VIGIA: V } = C

const P_ANTES = leer('planeacion-antes-orden-explicito-2026-09-30.json')
const P_DESPUES: Flujo = construirPlaneacion(P_ANTES)
const V_ANTES = leer('vigia-antes-orden-explicito-2026-09-30.json')
const V_DESPUES: Flujo = construirVigia(V_ANTES)
const hijos = (f: Flujo, n: string) => (f.connections[n]?.main?.[0] ?? []).map((x) => x.node)
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

describe('🔴 la definición de «lectura fuera de orden» (una sola, para el auditor y las pruebas)', () => {
  it('detecta el defecto de planeación EN EL FLUJO DE ANTES: «Derivador» lee la casa y «armar el paquete» lee la referencia, que cuelgan de una rama hermana', () => {
    const h = lecturasFueraDeOrden(P_ANTES).map((x: { nodo_que_lee: string; lee_a: string }) => `${x.nodo_que_lee}→${x.lee_a}`).sort()
    expect(h).toEqual([`Derivador (B5)→${P.CASA}`, `armar el paquete→${P.REFERENCIA}`].sort())
  })
  it('detecta el del Vigía en el de ANTES: «decide» lee dos ramas ciegas', () => {
    const h = lecturasFueraDeOrden(V_ANTES).map((x: { nodo_que_lee: string; lee_a: string }) => `${x.nodo_que_lee}→${x.lee_a}`).sort()
    expect(h).toEqual([`${V.DECIDE}→${V.UMBRAL}`, `${V.DECIDE}→${V.RELOJ_SALA}`].sort())
  })
  it('no marca a los disparadores (alternativos entre sí: sólo corre uno) ni a los antecesores reales', () => {
    // «decide» lee la Puerta (webhook) con try/catch: legítimo · «Derivador» lee a «Junta de brazos» (su antecesor): legítimo
    expect(referenciasDe(nodo(V_ANTES, V.DECIDE)).has(V.PUERTA)).toBe(true)
    expect(lecturasFueraDeOrden(V_ANTES).some((x: { lee_a: string }) => x.lee_a === V.PUERTA)).toBe(false)
  })
  it('antecesoresDe recorre el grafo hacia atrás (transitivo)', () => {
    const f: Flujo = { name: 'x', settings: {}, nodes: ['a', 'b', 'c', 'd'].map((n) => ({ name: n, type: 'n8n-nodes-base.code', parameters: {}, position: [0, 0] })), connections: { a: { main: [[{ node: 'b' }]] }, b: { main: [[{ node: 'c' }]] }, d: { main: [[{ node: 'c' }]] } } }
    expect([...antecesoresDe(f)('c')].sort()).toEqual(['a', 'b', 'd'])
    expect([...antecesoresDe(f)('a')]).toEqual([])
  })
  it('ordenDeEjecucion ordena por hora de inicio y numera desde 1', () => {
    const o = ordenDeEjecucion({ B: [{ startTime: 20, data: { main: [[{}, {}]] } }], A: [{ startTime: 10, data: { main: [[{}]] } }], C: [{ startTime: 30 }] })
    expect(o).toEqual([{ n: 1, nodo: 'A', items: 1 }, { n: 2, nodo: 'B', items: 2 }, { n: 3, nodo: 'C', items: 0 }])
  })
})

describe('① PLANEACIÓN · la casa y la referencia son ANTECESORES de quien las lee', () => {
  it('🔴 cadena en serie: ① GUARDA → casa → referencia → ficha (antes: los tres EN PARALELO)', () => {
    expect(hijos(P_ANTES, P.GUARDA)).toEqual([P.FICHA, P.CASA, P.REFERENCIA])
    expect(hijos(P_DESPUES, P.GUARDA)).toEqual([P.CASA])
    expect(hijos(P_DESPUES, P.CASA)).toEqual([P.REFERENCIA])
    expect(hijos(P_DESPUES, P.REFERENCIA)).toEqual([P.FICHA])
    expect(hijos(P_DESPUES, P.FICHA)).toEqual(hijos(P_ANTES, P.FICHA)) // lo de abajo NO cambia
  })
  it('🔴 quedan 0 lecturas fuera de orden (antes 2) · y esto NO depende de la posición: se cumple con el dibujo ORIGINAL malo', () => {
    expect(lecturasFueraDeOrden(P_ANTES)).toHaveLength(2)
    expect(lecturasFueraDeOrden(P_DESPUES)).toHaveLength(0)
    const conDibujoViejo: Flujo = JSON.parse(JSON.stringify(P_DESPUES))
    nodo(conDibujoViejo, P.CASA).position = [660, 520]
    nodo(conDibujoViejo, P.REFERENCIA).position = [660, 700]
    expect(lecturasFueraDeOrden(conDibujoViejo)).toHaveLength(0)
    // y la casa y la referencia son antecesores de «Derivador» y de «armar el paquete» por el GRAFO
    const anc = antecesoresDe(P_DESPUES)
    for (const lector of ['Derivador (B5)', 'armar el paquete']) for (const leido of [P.CASA, P.REFERENCIA]) expect(anc(lector).has(leido), `${lector} ← ${leido}`).toBe(true)
  })
  it('sólo cambian CONEXIONES y UN bloque de «elegir brazos»: los otros 43 nodos son idénticos (parámetros, posición, ajustes de error)', () => {
    expect(P_DESPUES.nodes).toHaveLength(P_ANTES.nodes.length)
    P_ANTES.nodes.forEach((n, i) => { if (n.name !== 'elegir brazos') expect(JSON.stringify(P_DESPUES.nodes[i]), n.name).toBe(JSON.stringify(n)) })
    // …y en «elegir brazos» lo ÚNICO que cambia es el bloque insertado: quitándolo se recupera el código original byte a byte
    const viejo = String(nodo(P_ANTES, 'elegir brazos').parameters.jsCode)
    const nuevo = String(nodo(P_DESPUES, 'elegir brazos').parameters.jsCode)
    const CRLF = '\r\n'
    const i = nuevo.indexOf('// 🔴 «NINGÚN BRAZO SALIÓ»')
    const j = nuevo.indexOf(CRLF + '}' + CRLF, i) + 3 + CRLF.length * 2 // hasta el cierre del bloque + su salto y el salto que ya traía el original
    expect(i).toBeGreaterThan(0)
    expect(nuevo.slice(0, i) + nuevo.slice(j)).toBe(viejo)
    expect(viejo.includes(CRLF) && nuevo.includes(CRLF)).toBe(true)
    // …y el ÚNICO otro cambio del nodo es que ahora DETIENE la corrida ante su error (antes la tragaba como un ítem {error})
    const sinCodigo = (n: Nodo) => JSON.stringify({ ...n, onError: undefined, parameters: { ...n.parameters, jsCode: undefined } })
    expect(nodo(P_ANTES, 'elegir brazos').onError).toBe('continueRegularOutput')
    expect(nodo(P_DESPUES, 'elegir brazos').onError).toBe('stopWorkflow')
    expect(sinCodigo(nodo(P_DESPUES, 'elegir brazos'))).toBe(sinCodigo(nodo(P_ANTES, 'elegir brazos')))
    const cambiadas = Object.keys({ ...P_ANTES.connections, ...P_DESPUES.connections }).filter((k) => JSON.stringify(P_ANTES.connections[k]) !== JSON.stringify(P_DESPUES.connections[k]))
    expect(cambiadas.sort()).toEqual([P.CASA, P.GUARDA, P.REFERENCIA].sort())
    expect(Object.keys(P_DESPUES.settings)).toEqual(['executionOrder'])
  })
  it('🔴 es SEGURO encadenar: los tres nodos siempre entregan salida, continúan ante error y no leen su entrada (por eso una entrada más no cambia lo que piden)', () => {
    for (const n of [P.CASA, P.REFERENCIA, P.FICHA]) {
      const x = nodo(P_DESPUES, n)
      expect(x.alwaysOutputData, n).toBe(true)
      expect(x.onError, n).toBe('continueRegularOutput')
      expect(JSON.stringify(x.parameters), n).not.toMatch(/\$json|\$input/)
    }
  })
  it('el constructor SE NIEGA si el nodo a encadenar podría cortar la cadena o leer su entrada · y si ya está construido o el flujo cambió', () => {
    const sin = (mut: (f: Flujo) => void) => { const f: Flujo = JSON.parse(JSON.stringify(P_ANTES)); mut(f); return f }
    expect(() => construirPlaneacion(sin((f) => { nodo(f, P.CASA).alwaysOutputData = false }))).toThrow(/alwaysOutputData/)
    expect(() => construirPlaneacion(sin((f) => { nodo(f, P.REFERENCIA).onError = undefined }))).toThrow(/no continúa ante error/)
    expect(() => construirPlaneacion(sin((f) => { nodo(f, P.FICHA).parameters.url = '={{ $json.id }}' }))).toThrow(/lee su entrada/)
    expect(() => construirPlaneacion(sin((f) => { f.connections[P.GUARDA] = { main: [[{ node: P.FICHA }]] } }))).toThrow(/cambió desde la foto/)
    expect(() => construirPlaneacion(P_DESPUES)).toThrow(/ya está construido/)
  })
})

describe('② VIGÍA DEL SILENCIO · el umbral, el reloj y el libro van EN SERIE antes de «decide»', () => {
  it('🔴 Reloj y Puerta → umbral → reloj de la sala → libro → decide (antes: los tres en paralelo y sólo el libro iba a «decide»)', () => {
    expect(hijos(V_ANTES, V.RELOJ)).toEqual([V.UMBRAL, V.RELOJ_SALA, V.LIBRO])
    expect(hijos(V_DESPUES, V.RELOJ)).toEqual([V.UMBRAL])
    expect(hijos(V_DESPUES, V.PUERTA)).toEqual([V.UMBRAL])
    expect(hijos(V_DESPUES, V.UMBRAL)).toEqual([V.RELOJ_SALA])
    expect(hijos(V_DESPUES, V.RELOJ_SALA)).toEqual([V.LIBRO])
    expect(hijos(V_DESPUES, V.LIBRO)).toEqual([V.DECIDE])
  })
  it('quedan 0 lecturas fuera de orden (antes 2) y no depende de la posición (dibujo cambiado a propósito)', () => {
    expect(lecturasFueraDeOrden(V_DESPUES)).toHaveLength(0)
    const f: Flujo = JSON.parse(JSON.stringify(V_DESPUES))
    nodo(f, V.UMBRAL).position = [240, 900]
    nodo(f, V.RELOJ_SALA).position = [240, 800]
    expect(lecturasFueraDeOrden(f)).toHaveLength(0)
    const anc = antecesoresDe(V_DESPUES)(V.DECIDE)
    for (const n of [V.UMBRAL, V.RELOJ_SALA, V.LIBRO, V.RELOJ, V.PUERTA]) expect(anc.has(n), n).toBe(true)
  })
  it('sólo cambian conexiones (los 10 nodos idénticos) y «decide» sigue yendo a «¿Grita?»', () => {
    V_ANTES.nodes.forEach((n, i) => expect(JSON.stringify(V_DESPUES.nodes[i])).toBe(JSON.stringify(n)))
    expect(hijos(V_DESPUES, V.DECIDE)).toEqual(hijos(V_ANTES, V.DECIDE))
    // los ajustes se conservan tal cual (sólo los que la API de n8n acepta al escribir)
    const PERMITIDOS = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
    expect(V_DESPUES.settings).toEqual(Object.fromEntries(Object.entries(V_ANTES.settings).filter(([k]) => PERMITIDOS.includes(k))))
  })
  it('🔴 es SEGURO: los tres nodos siempre entregan salida (aunque la fila del umbral no exista), continúan ante error y no usan $json', () => {
    for (const n of [V.UMBRAL, V.RELOJ_SALA, V.LIBRO]) {
      const x = nodo(V_DESPUES, n)
      expect(x.alwaysOutputData, n).toBe(true)
      expect(x.onError, n).toBe('continueRegularOutput')
      expect(JSON.stringify(x.parameters), n).not.toMatch(/\$json|\$input/)
    }
  })
  it('«decide» sigue declarando cada lectura fallida (no calla): las tres cadenas «no se pudo leer…» siguen en su código', () => {
    const js = String(nodo(V_DESPUES, V.DECIDE).parameters.jsCode)
    for (const t of ['no se pudo leer el nodo del umbral', 'no se pudo leer el estado del reloj', 'no se pudo leer el nodo del libro']) expect(js).toContain(t)
  })
  it('el constructor se niega si el flujo cambió o ya está construido', () => {
    const f: Flujo = JSON.parse(JSON.stringify(V_ANTES))
    f.connections[V.PUERTA] = { main: [[{ node: V.UMBRAL }]] }
    expect(() => construirVigia(f)).toThrow(/cambió desde la foto/)
    expect(() => construirVigia(V_DESPUES)).toThrow(/ya está construido/)
  })
})

describe('③ 🔴 «NINGÚN BRAZO SALIÓ» ES ERROR, NO ÉXITO (el éxito mudo, cerrado)', () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const elegir = (f: Flujo, ficha: Record<string, unknown>) => {
    const items = [{ json: ficha }]
    const rf = () => ({ first: () => ({ json: {} }), all: () => [] })
    return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', String(nodo(f, 'elegir brazos').parameters.jsCode))({ first: () => items[0], all: () => items }, rf, {}, ficha, { id: 'W' }, { id: '1' })
  }
  const NAUFRAGO = { id: 'c1', name: 'Náufrago', industry: 'restaurante', website_url: 'https://www.naufrago.ec', country: 'Ecuador' }
  const VACIA = { id: 'c-vacio' } // sin nombre, sin rubro, sin sitio, sin cuentas: ningún pedido posible
  const RAMAS = ['apify', 'posthog', 'cerebro']
  it('🔴 una ficha sin nada ⇒ el flujo de ANTES «salía bien» con CERO brazos (éxito mudo) · el nuevo LANZA PLANEACION_NINGUN_BRAZO_SALIO con el motivo de cada descarte', async () => {
    const [{ json: antes }] = await elegir(P_ANTES, VACIA)
    expect(antes.pedidos.filter((p: { brazo: string }) => RAMAS.includes(p.brazo))).toHaveLength(0) // ANTES: ningún brazo, y aun así devolvía normalmente (la junta jamás disparaba)
    await expect(elegir(P_DESPUES, VACIA)).rejects.toThrow(/PLANEACION_NINGUN_BRAZO_SALIO/)
    await expect(elegir(P_DESPUES, VACIA)).rejects.toThrow(/ANTES DE GASTAR/)
    await expect(elegir(P_DESPUES, VACIA)).rejects.toThrow(/sitio_propio \(el cliente no tiene sitio cargado/)
    await expect(elegir(P_DESPUES, VACIA)).rejects.toThrow(/c-vacio/)
  })
  it('🔴 el error DETIENE la corrida: con `onError: continueRegularOutput` el throw se volvía un ítem {error} y la corrida seguía «success» (medido en el ensayo 158487)', () => {
    expect(nodo(P_ANTES, 'elegir brazos').onError).toBe('continueRegularOutput')
    expect(nodo(P_DESPUES, 'elegir brazos').onError).toBe('stopWorkflow')
  })
  it('el pedido de plataforma (costo_pauta) NO cuenta como brazo: no tiene rama que lo atienda', async () => {
    const [{ json: antes }] = await elegir(P_ANTES, VACIA)
    expect(antes.pedidos.map((p: { brazo: string }) => p.brazo)).toEqual(['plataforma'])
    await expect(elegir(P_DESPUES, VACIA)).rejects.toThrow(/PLANEACION_NINGUN_BRAZO_SALIO/)
  })
  it('con UN solo brazo posible NO lanza (hay evidencia que buscar): sólo el sitio, sólo el nombre, sólo el rubro', async () => {
    for (const ficha of [{ id: 'c2', website_url: 'https://negocio.test' }, { id: 'c3', name: 'Negocio' }, { id: 'c4', industry: 'panadería' }]) {
      const [{ json }] = await elegir(P_DESPUES, ficha)
      expect(json.pedidos.some((p: { brazo: string }) => RAMAS.includes(p.brazo)), JSON.stringify(ficha)).toBe(true)
    }
  })
  it('el caso normal NO cambia: Náufrago sale igual que antes (mismos pedidos y descartados)', async () => {
    const [{ json: a }] = await elegir(P_ANTES, NAUFRAGO)
    const [{ json: d }] = await elegir(P_DESPUES, NAUFRAGO)
    expect(d).toEqual(a)
    expect(d.pedidos.some((p: { objetivo: string }) => p.objetivo === 'analitica_propia')).toBe(true)
  })
  it('lanza ANTES de gastar: «elegir brazos» es antecesor de los tres brazos y del redactor, así que el error nace sin haber llamado a ninguno', () => {
    const anc = antecesoresDe(P_DESPUES)
    for (const b of ['Brazo · Apify', 'Brazo · PostHog', 'Brazo · cerebro', 'Pedir el plan al redactor']) expect(anc(b).has('elegir brazos'), b).toBe(true)
  })
})

describe('🔴 LA REGLA ADOPTADA · toda lectura por nombre apunta a un antecesor · vale también para el flujo del BRIEF y para cualquier flujo que se construya', () => {
  it('el flujo del brief (construido por su constructor) tiene 0 lecturas fuera de orden', async () => {
    const { construirFlujo } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo', 'construir-brief.mjs')).href)
    expect(lecturasFueraDeOrden(construirFlujo())).toEqual([])
  })
  it('planeación y Vigía ya construidos: 0 · y el auditor sigue viendo el defecto en los de antes (la regla puede fallar)', () => {
    expect(lecturasFueraDeOrden(P_DESPUES)).toEqual([])
    expect(lecturasFueraDeOrden(V_DESPUES)).toEqual([])
    expect(lecturasFueraDeOrden(P_ANTES).length + lecturasFueraDeOrden(V_ANTES).length).toBe(4)
  })
})
