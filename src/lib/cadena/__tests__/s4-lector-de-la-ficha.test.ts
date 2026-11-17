/**
 * Sprint 4 · A entrega 2 · EL LECTOR de las fichas de hechos por oferta (17-nov · CC3) · a costo cero: almacén en memoria y agente simulado.
 * Tres clientes de práctica distintos (agnóstico). Lo que se prueba:
 *   · lo que entrega el lector se lleva a la ficha sin inventar (dato sin fuente NO entra y se cuenta; vacío = ausente; fecha rara = sin fecha)
 *   · el cerebro es el dueño del hecho: se suma por código y manda
 *   · el paso: una vez por campaña · NO es reja (agotar intentos no pasa la campaña a «necesita humano») · campaña terminada = no corre
 *   · el calendario recibe las ofertas con ficha; sin fichas su tarea queda igual
 *   · el parche de la puerta viva: solo suma los 3 nodos y desvía una conexión; no se aplica dos veces ni sobre otra puerta
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { abrirCampana, estrategiaGuardar, estrategiaPreparar, calendarioPreparar } from '../index'
import { fichasGuardar, fichasPreparar } from '../pasos'
import { ACCIONES } from '../acciones'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import { fichasConHechos, fichasEnTexto, hechoEnTexto, leerFichasDelLector, type HechoDelNegocioPorOferta } from '../ficha-de-oferta'
import { ESQUEMAS } from '../esquemas'
import { gastoDeCampana } from '../nucleo'
import { medidaDeCampana, PASOS_SIN_REVISION, topeDelPaso } from '../constantes'

const AHORA = '2026-10-09T12:00:00Z'
const RAIZ = resolve(__dirname, '..', '..', '..', '..')
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (x: unknown, costo = 0.3) => ({ success: true, structured_output: x, cost_usd: costo })

/** un tercer cliente de práctica: otro id, otro nombre, otras ofertas (clonado de A para no depender de un rubro) */
function clienteC(): ClienteFixture {
  const a = clienteA()
  return { ...a, clientId: '33333333-3333-4333-8333-333333333333', conocidos: ['Taller de práctica C'], sedes: a.sedes.map((s, i) => ({ ...s, clave: `linea-${i + 1}` })) }
}
const CLIENTES: Array<[string, () => ClienteFixture]> = [['A', clienteA], ['B', clienteB], ['C', clienteC]]

function almacen(c: ClienteFixture) {
  return new AlmacenMemoria({
    contextos: { [c.clientId]: contextoDe(c) },
    planes: { [c.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta' },
  })
}
async function conEstrategia(al: AlmacenMemoria, c: ClienteFixture) {
  const ab = await abrirCampana(al, { ...wf(), client_id: c.clientId, seco: true }, AHORA)
  const id = (ab.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(c.estrategia) }, AHORA)
  expect(g.status, JSON.stringify(g.cuerpo)).toBe(200)
  return id
}
const D = (valor: string, fuente = 'manual:1', extra: Partial<Record<'vigente_desde' | 'vigente_hasta' | 'red', string>> = {}) => ({ valor, fuente, vigente_desde: '', vigente_hasta: '', red: '', ...extra })
const vacia = (clave: string, nombre = '') => ({
  clave, nombre, que_es: [], para_quien_y_donde: [], se_puede_afirmar: [], no_se_puede_afirmar: [], oferta_y_precio: [], como_se_compra: [], que_mostrar: [], que_nunca_mostrar: [], obligatorios_legales: [], objetivo_por_fecha: [],
})
const salidaDe = (c: ClienteFixture) => ({
  fichas: [c.sedes[0].clave, 'oferta-sin-sede'].map((clave, i) => ({ ...vacia(clave, `Oferta ${i + 1}`), que_es: [D(`qué es la oferta ${i + 1}`)], se_puede_afirmar: [D(`se afirma ${i + 1}`), D('sin fuente', '')] })),
  pendientes: ['el precio no consta en las fuentes'],
})

describe('lo que entrega el lector → la ficha (sin inventar)', () => {
  it('🔴 un dato sin fuente NO entra y se cuenta; vacío = ausente; una fecha que no es AAAA-MM-DD se pierde, el dato queda', () => {
    const r = leerFichasDelLector({
      fichas: [{ ...vacia('of-1', 'Uno'), que_es: [D('primero'), D('segundo')], se_puede_afirmar: [D('afirmable', 'manual:2', { vigente_desde: '2026-11-01', vigente_hasta: 'mañana', red: 'instagram' }), D('suelto', '  ')], oferta_y_precio: [D('', 'manual:1')] }],
      pendientes: ['  falta el horario ', ''],
    })
    expect(r.fichas).toEqual([{ clave: 'of-1', nombre: 'Uno', que_es: { valor: 'primero', fuente: 'manual:1' }, se_puede_afirmar: [{ valor: 'afirmable', fuente: 'manual:2', vigente_desde: '2026-11-01', red: 'instagram' }] }])
    expect(r.descartados).toBe(1)
    expect(r.pendientes).toEqual(['falta el horario'])
    expect(r.avisos).toEqual(['1 dato vino sin fuente · no entra'])
  })
  it('🔴 una ficha sin clave no entra (se avisa); una clave repetida se junta con la primera; basura no rompe', () => {
    const r = leerFichasDelLector({ fichas: [vacia('  '), { ...vacia('Of-1'), que_mostrar: [D('a')] }, { ...vacia('of-1'), que_mostrar: [D('b')], que_es: [D('qué')] }, null, 7] })
    expect(r.fichas).toHaveLength(1)
    expect(r.fichas[0].que_mostrar?.map((d) => d.valor)).toEqual(['a', 'b'])
    expect(r.fichas[0].que_es?.valor).toBe('qué')
    expect(r.avisos).toEqual(['una ficha vino sin clave · no entra', 'la oferta «of-1» vino dos veces · se juntan sus datos'])
    expect(leerFichasDelLector(null)).toEqual({ fichas: [], pendientes: [], descartados: 0, avisos: [] })
  })
  it('un objetivo por fecha sin fuente tampoco entra (y cuenta)', () => {
    const r = leerFichasDelLector({ fichas: [{ ...vacia('x'), objetivo_por_fecha: [{ desde: '2026-12-01', hasta: '', objetivo: 'vender', fuente: 'plan' }, { desde: '', hasta: '', objetivo: 'otro', fuente: '' }] }] })
    expect(r.fichas[0].objetivo_por_fecha).toEqual([{ objetivo: 'vender', fuente: 'plan', desde: '2026-12-01' }])
    expect(r.descartados).toBe(1)
  })
  it('el esquema del contrato está registrado y pide exactamente los campos de la ficha', () => {
    const e = ESQUEMAS['fichas_de_oferta.v1'] as { properties: Record<string, any> }
    expect(Object.keys(e.properties)).toEqual(['fichas', 'pendientes'])
    expect(Object.keys(e.properties.fichas.items.properties)).toEqual(Object.keys(vacia('x')))
  })
})

describe('el cerebro es el dueño del hecho (se suma por código y manda)', () => {
  const h = (x: Partial<HechoDelNegocioPorOferta>): HechoDelNegocioPorOferta => ({ oferta: 'of-1', sede_id: null, tipo: 'apertura', valor: 'v', vigente_desde: null, vigente_hasta: null, fuente: 'web', fecha_de_la_fuente: '2026-11-01', confianza: 'alta', ...x } as HechoDelNegocioPorOferta)
  it('🔴 reemplaza «para quién y dónde», va primero en las listas y quita el dato del lector con el mismo valor', () => {
    const fichas = leerFichasDelLector({ fichas: [{ ...vacia('of-1'), para_quien_y_donde: [D('lo que dijo el lector')], se_puede_afirmar: [D('abre los lunes'), D('otra cosa')] }] }).fichas
    const r = fichasConHechos(fichas, [h({ tipo: 'sede', valor: 'lo que dice el cerebro' }), h({ tipo: 'apertura', valor: 'abre los lunes', vigente_desde: '2026-12-01' })])
    expect(r[0].para_quien_y_donde?.valor).toBe('lo que dice el cerebro')
    expect(r[0].para_quien_y_donde?.fuente).toMatch(/^cerebro:web/)
    expect(r[0].se_puede_afirmar?.map((d) => d.valor)).toEqual(['abre los lunes', 'otra cosa'])
    expect(r[0].se_puede_afirmar?.[0]).toMatchObject({ vigente_desde: '2026-12-01' })
    expect(r[0].se_puede_afirmar?.[0].fuente).toMatch(/^cerebro:/)
    expect(fichas[0].para_quien_y_donde?.valor).toBe('lo que dijo el lector') // puro: no toca la entrada
  })
  it('🔴 un hecho de una oferta sin ficha crea su ficha; uno sin oferta va a todas; sin hechos (null) nada cambia', () => {
    const fichas = leerFichasDelLector({ fichas: [vacia('of-1'), vacia('of-2')] }).fichas
    const r = fichasConHechos(fichas, [h({ oferta: 'of-3', tipo: 'aun_no_existe', valor: 'todavía no existe' }), h({ oferta: null, tipo: 'zona_de_entrega', valor: 'entrega en toda la ciudad' })])
    expect(r.map((f) => f.clave)).toEqual(['of-1', 'of-2', 'of-3'])
    for (const f of r) expect(f.como_se_compra?.map((d) => d.valor)).toEqual(['entrega en toda la ciudad'])
    expect(r[2].no_se_puede_afirmar?.map((d) => d.valor)).toEqual(['todavía no existe'])
    expect(fichasConHechos(fichas, null)).toEqual(fichas)
  })
  it('el hecho como línea del pedido nombra su oferta (o «todo el negocio»), su vigencia y su fuente', () => {
    expect(hechoEnTexto(h({ tipo: 'cierre_retiro', valor: 'cierra el retiro', vigente_desde: '2026-12-24' }))).toBe('[of-1] cierre_retiro: cierra el retiro · desde 2026-12-24 (fuente: cerebro:web)')
    expect(hechoEnTexto(h({ oferta: null }))).toMatch(/^\[todo el negocio\] /)
  })
})

describe.each(CLIENTES)('el paso del lector · cliente %s', (_n, hacer) => {
  it('🔴 una vez por campaña: prepara la llamada con su contrato, guarda las fichas validadas (sin el dato sin fuente) y la segunda vez ya está hecha', async () => {
    const c = hacer(), al = almacen(c), id = await conEstrategia(al, c)
    const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200)
    const run = p.cuerpo.run_sdk as { agent: string; task: string; client_id: string; extra: { contrato: string } }
    expect(run).toMatchObject({ agent: 'social-media-strategist', client_id: c.clientId, extra: { contrato: 'fichas_de_oferta.v1' } })
    expect(p.cuerpo.headers).toEqual({ 'x-skip-editor-middleware': '1' })
    expect(run.task).toContain('(hechos del negocio: aún no disponibles)')
    for (const s of c.sedes) expect(run.task).toContain(s.clave)
    const g = await fichasGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(salidaDe(c)) })
    expect(g.cuerpo).toMatchObject({ ok: true, fichas: 2, descartados: 2, pendientes: ['el precio no consta en las fuentes'] })
    expect(g.cuerpo.avisos).toContain('hechos del negocio: aún no disponibles')
    const guardadas = await al.ultimasFichas(id)
    expect(guardadas).toMatchObject({ version: 1, estado: 'validada', descartados: 2, seco: true, costo_usd: 0.3 })
    expect(JSON.stringify(guardadas!.contenido)).not.toContain('sin fuente')
    expect((await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo).toEqual({ ya_hecha: true, version: 1 })
    expect(al.corridas.filter((x) => x.paso === 'fichas')).toHaveLength(1)
  })
  it('🔴 con hechos del cerebro: el pedido los trae y lo guardado los suma (el cerebro manda)', async () => {
    const c = hacer(), al = almacen(c), id = await conEstrategia(al, c)
    const clave = c.sedes[0].clave
    al.hechos = [{ oferta: clave, sede_id: null, tipo: 'sede', valor: 'el lugar que dice el cerebro', vigente_desde: null, vigente_hasta: null, fuente: 'web', fecha_de_la_fuente: '2026-11-01', confianza: 'alta' } as HechoDelNegocioPorOferta]
    const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect((p.cuerpo.run_sdk as { task: string }).task).toContain(`[${clave}] sede: el lugar que dice el cerebro`)
    await fichasGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(salidaDe(c)) })
    const f = (await al.ultimasFichas(id))!.contenido.find((x) => x.clave === clave)!
    expect(f.para_quien_y_donde).toMatchObject({ valor: 'el lugar que dice el cerebro' })
  })
  it('🔴 NO es reja: tres llamadas sin objeto = «sin fichas» declarado; la campaña NO pasa a necesita humano y el calendario sigue', async () => {
    const c = hacer(), al = almacen(c), id = await conEstrategia(al, c)
    const antes = (await al.campana(id))!.estado
    let ultimo: Record<string, unknown> = {}
    for (let i = 0; i < 4; i++) {
      const p = await fichasPreparar(al, { ...wf(), workflow_execution_id: `ex-${i}`, campana_id: id }, AHORA)
      ultimo = p.cuerpo
      if (!p.cuerpo.corrida_id) break
      const g = await fichasGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, error: 'E-OUTPUT-SCHEMA-MISSING', cost_usd: 0.1 } })
      expect(g.status).toBe(200)
      expect(g.cuerpo.necesita_humano).toBeUndefined()
    }
    expect(ultimo).toMatchObject({ ya_hecha: true })
    expect(String(ultimo.sin_fichas)).toMatch(/agotó sus 3 intentos/)
    expect((await al.campana(id))!.estado).toBe(antes)
    expect(await al.ultimasFichas(id)).toBeNull()
    const cal = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    expect(cal.status, JSON.stringify(cal.cuerpo)).toBe(200)
    expect((cal.cuerpo.run_sdk as { task: string }).task).not.toContain('# OFERTAS')
  })
  it('🔴 el calendario recibe las ofertas con ficha (su clave va a `sede`); sin fichas, su tarea es la de antes, byte a byte', async () => {
    const c = hacer()
    const sin = almacen(c), idSin = await conEstrategia(sin, c)
    const con = almacen(c), idCon = await conEstrategia(con, c)
    const p = await fichasPreparar(con, { ...wf(), campana_id: idCon }, AHORA)
    await fichasGuardar(con, { ...wf(), campana_id: idCon, corrida_id: p.cuerpo.corrida_id, resultado: ok(salidaDe(c)) })
    const tSin = ((await calendarioPreparar(sin, { ...wf(), campana_id: idSin, tanda: 1 }, AHORA)).cuerpo.run_sdk as { task: string }).task
    const tCon = ((await calendarioPreparar(con, { ...wf(), campana_id: idCon, tanda: 1 }, AHORA)).cuerpo.run_sdk as { task: string }).task
    expect(tCon).toContain('# OFERTAS (las que tienen ficha de hechos)')
    expect(tCon).toContain(`- ${c.sedes[0].clave} (Oferta 1)`)
    expect(tCon.replace(/# OFERTAS[\s\S]*?déjala vacía\.\n\n/, '').replace(idCon, idSin)).toBe(tSin)
  })
})

describe('el paso del lector · bordes', () => {
  it('🔴 campaña cerrada o reemplazada: el lector no corre (409) y no gasta', async () => {
    const c = clienteA(), al = almacen(c), id = await conEstrategia(al, c)
    for (const estado of ['cerrada', 'reemplazada'] as const) {
      al.campanas.find((x) => x.id === id)!.estado = estado
      const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
      expect(p.status).toBe(409)
      expect(p.cuerpo.code).toBe('E-ESTADO')
    }
    expect(al.corridas.filter((x) => x.paso === 'fichas')).toHaveLength(0)
  })
  it('🔴 un almacén que no guarda fichas: «ya hecha» con su motivo, sin llamar a nadie', async () => {
    const c = clienteB(), al = almacen(c), id = await conEstrategia(al, c)
    Object.assign(al, { insertarFichas: undefined })
    expect((await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo).toEqual({ ya_hecha: true, sin_fichas: 'este almacén no guarda fichas' })
    expect(al.corridas.filter((x) => x.paso === 'fichas')).toHaveLength(0)
  })
  it('un cerebro que falla al leer los hechos = «aún no disponibles» (nunca frena)', async () => {
    const c = clienteC(), al = almacen(c), id = await conEstrategia(al, c)
    Object.assign(al, { hechosDelNegocio: async () => { throw new Error('cerebro caído') } })
    const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect((p.cuerpo.run_sdk as { task: string }).task).toContain('(hechos del negocio: aún no disponibles)')
  })
  it('la ruta existe en las acciones (preparar y guardar)', () => {
    expect(Object.keys(ACCIONES.fichas).sort()).toEqual(['guardar', 'preparar'])
  })
})

describe('el armador de la cadena (construir.mjs)', () => {
  type Flujo = { nodes: Array<{ name: string }>; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
  const armar = async (ids: Record<string, string>) => ((await import(/* @vite-ignore */ pathToFileURL(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'construir.mjs')).href)) as { construirFlujos: (o: { ids: Record<string, string> }) => Record<string, Flujo> }).construirFlujos({ ids })
  const BASE = { estrategia: 'E', calendario: 'C', fechas: 'F', puerta: 'P' }
  it('🔴 sin el id del lector, la puerta sale como antes (sin 2b y «2 · ¿Sigue?» → fechas); con su id, el lector va en medio', async () => {
    const sin = (await armar(BASE))['cadena-puerta'], con = (await armar({ ...BASE, fichas: 'FIC' }))['cadena-puerta']
    expect(sin.nodes.filter((n) => n.name.startsWith('2b'))).toEqual([])
    expect(sin.connections['2 · ¿Sigue?'].main.map((r) => r.map((x) => x.node))).toEqual([['3 · Fechas · expandir'], ['Cable · armar']])
    expect(con.connections['2 · ¿Sigue?'].main.map((r) => r.map((x) => x.node))).toEqual([['2b · Entrada de las fichas'], ['Cable · armar']])
    expect(con.connections['2b · Seguir'].main[0].map((x) => x.node)).toEqual(['3 · Fechas · expandir'])
    expect(con.nodes.length - sin.nodes.length).toBe(3)
  })
})

describe('el parche de la puerta VIVA (respaldo 17-nov)', () => {
  type Flujo = { nodes: Array<{ name: string; type: string; parameters: Record<string, any>; onError?: string }>; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
  const cargar = async () => (await import(/* @vite-ignore */ pathToFileURL(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'construir-s4-fichas-puerta.mjs')).href)) as { construirFlujo: (f: Flujo, id: string) => Flujo; NODOS: Record<string, string> }
  const ANTES = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'puerta-s4-fichas-ANTES.json'), 'utf8')) as Flujo
  it('🔴 solo suma los 3 nodos del lector y desvía «2 · ¿Sigue?» → lector → «3 · Fechas · expandir»; ningún otro nodo ni conexión cambia', async () => {
    const { construirFlujo, NODOS } = await cargar()
    const d = construirFlujo(ANTES, 'ID-FICHAS')
    expect(d.nodes.slice(0, ANTES.nodes.length)).toEqual(ANTES.nodes)
    expect(d.nodes.slice(ANTES.nodes.length).map((n) => n.name)).toEqual([NODOS.entrada, NODOS.sub, NODOS.seguir])
    const sub = d.nodes.find((n) => n.name === NODOS.sub)!
    expect(sub.parameters.workflowId.value).toBe('ID-FICHAS')
    expect(sub.onError).toBe('continueRegularOutput')
    expect(d.connections['2 · ¿Sigue?'].main[0].map((x) => x.node)).toEqual([NODOS.entrada])
    expect(d.connections['2 · ¿Sigue?'].main[1]).toEqual(ANTES.connections['2 · ¿Sigue?'].main[1])
    expect(d.connections[NODOS.seguir].main[0].map((x) => x.node)).toEqual(['3 · Fechas · expandir'])
    const resto = (f: Flujo) => Object.fromEntries(Object.entries(f.connections).filter(([k]) => k !== '2 · ¿Sigue?' && !k.startsWith('2b ·')))
    expect(resto(d)).toEqual(resto(ANTES))
    for (const n of d.nodes.filter((x) => x.name.startsWith('2b ·') && x.type === 'n8n-nodes-base.code')) {
      expect(() => new (Object.getPrototypeOf(async function () { /* */ }).constructor)('$input', '$', n.parameters.jsCode)).not.toThrow()
    }
  })
  it('🔴 «2b · Seguir» deja pasar lo de la estrategia tal cual, con o sin fallo del lector', async () => {
    const { construirFlujo, NODOS } = await cargar()
    const code = construirFlujo(ANTES, 'X').nodes.find((n) => n.name === NODOS.seguir)!.parameters.jsCode as string
    const estrategia = { campana_id: 'c1', sigue: true, fechas_pedidas: ['feriados'], dry_run: true }
    const correr = (entrada: unknown) => new Function('$input', '$', code)({ first: () => ({ json: entrada }) }, () => ({ last: () => ({ json: estrategia }) })) as Array<{ json: Record<string, unknown> }>
    expect(correr({ error: { message: 'el sub-flujo cayó' } })[0].json).toEqual({ ...estrategia, lector_de_fichas: { resultado: 'fallo', error: 'el sub-flujo cayó' } })
    expect(correr({ resultado: 'ok', detalle: { fichas: 2 } })[0].json).toEqual({ ...estrategia, lector_de_fichas: { resultado: 'ok', detalle: { fichas: 2 } } })
  })
  it('🔴 no se aplica dos veces, ni sin id, ni sobre una puerta cuya rama ya no es la del respaldo', async () => {
    const { construirFlujo } = await cargar()
    const d = construirFlujo(ANTES, 'X')
    expect(() => construirFlujo(d, 'X')).toThrow(/no se aplica dos veces/)
    expect(() => construirFlujo(ANTES, ' ')).toThrow(/falta el id/)
    const otra = JSON.parse(JSON.stringify(ANTES)) as Flujo
    otra.connections['2 · ¿Sigue?'].main[0] = [{ node: '4 · Entrada del calendario' }]
    expect(() => construirFlujo(otra, 'X')).toThrow(/rehacer desde el vivo/)
  })
})

// ─────────────────────────────────────────────── 🟡 de CC6 a #1138 (cabeza aad6a21)
describe('🟡 1 de CC6 · el lector no puede volverse reja por el presupuesto', () => {
  const reserva = (al: AlmacenMemoria, id: string) => medidaDeCampana(al.campanas.find((x) => x.id === id)!).totalTandas * topeDelPaso('calendario')
  it('🔴 (l1) si su intento se comería la reserva de las tandas: 200 «ya hecha · sin fichas por presupuesto», sin corrida, sin necesita humano; y el calendario abre', async () => {
    const c = clienteA(), al = almacen(c), id = await conEstrategia(al, c)
    const campana = al.campanas.find((x) => x.id === id)!
    campana.presupuesto_planificacion_usd = (await gastoDeCampana(al, id)) + topeDelPaso('fichas') + reserva(al, id) - 0.01
    const antes = campana.estado
    const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(p.status).toBe(200)
    expect(p.cuerpo.ya_hecha).toBe(true)
    expect(String(p.cuerpo.sin_fichas)).toMatch(/no alcanza para el lector sin quitarle al calendario/)
    expect(al.corridas.filter((x) => x.paso === 'fichas')).toHaveLength(0)
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe(antes)
    expect((await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)).status).toBe(200)
  })
  it('🔴 con lo justo (gastado + su tope + la reserva = presupuesto), el lector sí corre', async () => {
    const c = clienteB(), al = almacen(c), id = await conEstrategia(al, c)
    al.campanas.find((x) => x.id === id)!.presupuesto_planificacion_usd = (await gastoDeCampana(al, id)) + topeDelPaso('fichas') + reserva(al, id)
    expect((await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)).cuerpo.corrida_id).toBeDefined()
  })
  it.each([[0.7, true], [2.02, false]])('🔴 un lector que falla todo lo que puede deja SIEMPRE el tope de cada tanda libre (estrategia de US$ %s · ¿corre? %s)', async (costoEstrategia, corre) => {
    const c = clienteC(), al = almacen(c)
    const ab = await abrirCampana(al, { ...wf(), client_id: c.clientId, seco: true }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    const pe = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(c.estrategia, costoEstrategia) }, AHORA)
    for (let i = 0; i < 4; i++) {
      const p = await fichasPreparar(al, { ...wf(), workflow_execution_id: `ex-${i}`, campana_id: id }, AHORA)
      if (!p.cuerpo.corrida_id) break
      await fichasGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: false, error: 'x', cost_usd: 1 } })
    }
    const campana = al.campanas.find((x) => x.id === id)!
    // con la estrategia cara (la última campaña real gastó US$ 2,02 en ella), el lector NI SIQUIERA abre: la reserva ya no deja lugar
    expect(al.corridas.filter((x) => x.paso === 'fichas').length > 0).toBe(corre)
    // corra o no, lo que el lector gastó nunca le quita a la reserva: sin él, gasto = solo la estrategia
    const sinLector = costoEstrategia + reserva(al, id) > campana.presupuesto_planificacion_usd
    if (sinLector) expect(await gastoDeCampana(al, id)).toBe(costoEstrategia)
    else expect((await gastoDeCampana(al, id)) + reserva(al, id)).toBeLessThanOrEqual(campana.presupuesto_planificacion_usd)
    expect(campana.estado).not.toBe('necesita_humano')
  })
})

describe('🟡 2 de CC6 · el cerebro manda también sobre lo que el lector afirma (la ficha no se contradice)', () => {
  const h = (x: Partial<HechoDelNegocioPorOferta>): HechoDelNegocioPorOferta => ({ oferta: 'of-1', sede_id: null, tipo: 'cierre_retiro', valor: 'se retira la oferta', vigente_desde: null, vigente_hasta: null, fuente: 'manual', fecha_de_la_fuente: '2026-11-01', confianza: 'alta', ...x } as HechoDelNegocioPorOferta)
  const lector = () => leerFichasDelLector({ fichas: [{ ...vacia('of-1'), para_quien_y_donde: [D('en la plaza central y el barrio norte', 'web')], se_puede_afirmar: [D('está abierta todos los días', 'web')], como_se_compra: [D('se pide por mensaje', 'web')], que_mostrar: [D('la vitrina', 'web')] }] }).fichas
  const lineaCon = (t: string, x: string) => t.split('\n').find((l) => l.includes(x)) ?? ''
  it('🔴 cierra el día D (valor que NO coincide con lo del lector): lo afirmado vale hasta D−1 · desde D sale VENCIDO · la ficha declara el choque', () => {
    const f = fichasConHechos(lector(), [h({ vigente_desde: '2026-12-01' })])[0]
    for (const d of [f.para_quien_y_donde!, ...f.se_puede_afirmar!.filter((x) => !x.fuente.startsWith('cerebro:')), ...f.como_se_compra!]) expect(d.vigente_hasta).toBe('2026-11-30')
    expect(f.que_mostrar![0].vigente_hasta).toBeUndefined() // solo los campos que afirman
    expect(f.no_se_puede_afirmar!.map((d) => d.valor)).toContain('choque con el cerebro: esta oferta cierra desde 2026-12-01 · lo que se afirmaba de ella por otras fuentes vale solo hasta 2026-11-30')
    expect(lineaCon(fichasEnTexto([f], '2026-12-02'), 'está abierta todos los días')).toMatch(/VENCIDO/)
    expect(lineaCon(fichasEnTexto([f], '2026-11-15'), 'está abierta todos los días')).not.toMatch(/VENCIDO/)
  })
  it('🔴 cierre SIN fecha: lo que el lector afirmaba de esa oferta no se afirma (sale) y se declara; las demás ofertas no se tocan', () => {
    const base = [...lector(), ...leerFichasDelLector({ fichas: [{ ...vacia('of-2'), se_puede_afirmar: [D('otra cosa', 'web')] }] }).fichas]
    const [f, otra] = fichasConHechos(base, [h({})])
    expect(f.para_quien_y_donde).toBeUndefined()
    expect(f.como_se_compra).toBeUndefined()
    expect(f.se_puede_afirmar).toBeUndefined()
    expect(f.no_se_puede_afirmar!.some((d) => /choque con el cerebro: esta oferta cierra desde \(sin fecha: ya cerrada\) · .* no se afirma/.test(d.valor))).toBe(true)
    expect(otra.se_puede_afirmar!.map((d) => d.valor)).toEqual(['otra cosa'])
  })
  it('🔴 «todavía no existe» hasta E: lo afirmado vale desde E+1 (antes AÚN NO VIGENTE); lo que dice el cerebro no se toca', () => {
    const f = fichasConHechos(lector(), [h({ tipo: 'aun_no_existe', valor: 'la oferta aún no abre', vigente_hasta: '2026-12-31' }), h({ tipo: 'sede', valor: 'local del cerebro' })])[0]
    expect(f.para_quien_y_donde).toMatchObject({ valor: 'local del cerebro' })
    expect(f.para_quien_y_donde!.vigente_desde).toBeUndefined()
    expect(f.se_puede_afirmar!.find((d) => d.valor === 'está abierta todos los días')!.vigente_desde).toBe('2027-01-01')
    expect(lineaCon(fichasEnTexto([f], '2026-12-15'), 'está abierta todos los días')).toMatch(/AÚN NO VIGENTE/)
  })
})

describe('🟡 3 de CC6 · los sobrevivientes', () => {
  it('🔴 (l11) un hecho del cerebro SIN fuente no entra a la ficha', () => {
    const r = fichasConHechos([], [{ oferta: 'of-1', sede_id: null, tipo: 'apertura', valor: 'abre de noche', vigente_desde: null, vigente_hasta: null, fuente: '  ', fecha_de_la_fuente: null, confianza: null } as unknown as HechoDelNegocioPorOferta])
    expect(JSON.stringify(r)).not.toContain('abre de noche')
  })
  it('🔴 (l12) un hecho con vigente_hasta de ayer sale VENCIDO en el bloque (una sede retirada no llega como vigente)', () => {
    const f = fichasConHechos([], [{ oferta: 'of-1', sede_id: null, tipo: 'sede', valor: 'la sede de la costa', vigente_desde: null, vigente_hasta: '2026-11-10', fuente: 'manual', fecha_de_la_fuente: '2026-11-01', confianza: 'alta' } as HechoDelNegocioPorOferta])
    expect(f[0].para_quien_y_donde?.vigente_hasta).toBe('2026-11-10')
    expect((fichasEnTexto(f, '2026-11-11').split('\n').find((l) => l.includes('la sede de la costa')) ?? '')).toMatch(/VENCIDO/)
  })
  it('🔴 (l15) el lector va sin la revisión del editor, igual que dice su cabecera', async () => {
    expect(PASOS_SIN_REVISION).toContain('fichas')
    const c = clienteA(), al = almacen(c), id = await conEstrategia(al, c)
    const p = await fichasPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect(p.cuerpo.headers).toEqual({ 'x-skip-editor-middleware': '1' })
    expect(al.corridas.find((x) => x.paso === 'fichas')?.revision_editor).toBe('saltada_por_diseno')
  })
})
