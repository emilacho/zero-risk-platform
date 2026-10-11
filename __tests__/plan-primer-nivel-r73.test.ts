/**
 * Ronda 73 · el plan de 90 días a primer nivel · v2 AGNÓSTICA.
 * Pruebas con TRES clientes de práctica de rubros distintos (servicio B2B · tienda online · negocio local) + el plan REAL del paso 2 como «antes» (el chequeo marca sus 4 errores).
 * Ni el módulo ni las instrucciones nombran un cliente, un lugar ni un rubro: un grep lo comprueba.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiarB4, cambiarVuelta, construirFlujo, MODULO, NODOS } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-primer-nivel-r73.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const FX = join(process.cwd(), '__tests__/fixtures/ronda73')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-primer-nivel-r73-ANTES.json'), 'utf8')) as Flujo
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-primer-nivel-r73-ARREGLADO.json'), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

const M = new Function(MODULO + '\nreturn { fichaLimpia, identidadDeclarada, monedaDelCliente, bloquePrimerNivel, revisarPlan, bloqueDeRevisionDelPlan }')() as Record<string, (...a: any[]) => any>

// ───────────────────────── tres clientes de práctica, de rubros distintos
interface Cli { nombre: string; rubro: string; ficha: Record<string, any>; manual: Record<string, any>; unidad: string; meta: number; cpa: number; moneda: string; colores: string[]; fuentes: string[] }
const clientes: Cli[] = [
  { nombre: 'Consultora Alfa', rubro: 'servicio B2B', unidad: 'contratos', meta: 12, cpa: 900, moneda: 'COP', colores: ['#0a3d62', '#f6b93b'], fuentes: ['Lato', 'Merriweather'],
    ficha: { id: 'a-1', name: 'Consultora Alfa', country: 'Colombia', industry: 'consultoría para empresas', brand_colors: ['#0a3d62'], brand_fonts: ['Lato'], config: { tope_diario_interno: 40, business_model: { text: 'venta de proyectos a empresas' } } },
    manual: { primary_colors: ['#f6b93b'], typography: ['Merriweather'] } },
  { nombre: 'Tienda Beta', rubro: 'tienda online', unidad: 'pedidos', meta: 400, cpa: 8, moneda: 'MXN', colores: ['#e84393', '#2d3436'], fuentes: ['Poppins'],
    ficha: { id: 'b-1', name: 'Tienda Beta', country: 'México', industry: 'tienda en línea de accesorios', brand_colors: ['#e84393', '#2d3436'], brand_fonts: ['Poppins'], config: { currency: 'mxn', spend_cap_usd: 25, api_key_x: 'no-debe-viajar' } },
    manual: { primary_colors: ['#e84393'], typography: [] } },
  { nombre: 'Estudio Gamma', rubro: 'negocio local', unidad: 'reservas', meta: 90, cpa: 6, moneda: 'EUR', colores: ['#00b894'], fuentes: ['Nunito'],
    ficha: { id: 'c-1', name: 'Estudio Gamma', country: 'España', industry: 'estudio de servicios en un barrio', brand_colors: [], brand_fonts: [], config: { limite_mensual: 300 } },
    manual: { primary_colors: ['#00b894'], typography: ['Nunito'] } },
]
const identidadDe = (c: Cli) => ({ ficha: c.ficha, manual: c.manual })

/** un plan que cumple, armado con los datos del cliente (cada uno distinto) */
const planBueno = (c: Cli) => [
  `# Plan de 90 días de ${c.nombre}`,
  '## La meta',
  `La meta a 90 días es conseguir ${c.meta} ${c.unidad} nuevos, cifra que fijó el cliente.`,
  '## El presupuesto sale de la meta',
  `Para esa meta se necesitan ${c.meta} ${c.unidad} en total: son las ventas necesarias del periodo.`,
  `El costo por cliente estimado es ${c.cpa} ${c.moneda}; la fuente es un rango de mercado declarado para este sector (estimación, no dato propio).`,
  `Presupuesto que alcanza la meta: ${c.meta * c.cpa} ${c.moneda}.`,
  `Escenario prudente: se cumple el 70 % de la meta con ${Math.round(c.meta * c.cpa * 0.7)} ${c.moneda}. Escenario ambicioso: se supera la meta con ${Math.round(c.meta * c.cpa * 1.4)} ${c.moneda}.`,
  '## Capacidad',
  'No sabemos cuántos pedidos puede atender el negocio por semana: ¿cuál es su capacidad real?',
  '## Identidad visual',
  `Colores de la marca: ${c.colores.join(', ')}. Tipografías: ${c.fuentes.join(', ')}.`,
  '## Calendario',
  'Semana 1: presentación de la propuesta. Semana 2: primeras piezas.',
].join('\n')

const REAL = readFileSync(join(FX, 'plan-52529141.md'), 'utf8')
const FICHA_REAL = JSON.parse(readFileSync(join(FX, 'ficha-piloto.json'), 'utf8'))
const MANUAL_REAL = JSON.parse(readFileSync(join(FX, 'manual-piloto-v4.json'), 'utf8'))
const ctxDe = (c: { ficha: any; manual: any }) => ({ identidad: M.identidadDeclarada(c.ficha, c.manual), moneda: M.monedaDelCliente(c.ficha, c.manual) })

describe('1 · la ficha que ve el redactor: sin topes ni claves internas (cualquier nivel)', () => {
  it.each(clientes)('$rubro: quita sus topes y claves, conserva el resto, y solo devuelve NOMBRES de clave', (c) => {
    const r = M.fichaLimpia(c.ficha)
    const txt = JSON.stringify(r.ficha)
    expect(txt).not.toMatch(/tope|spend|limite|api_key|no-debe-viajar/i)
    expect(r.ficha.name).toBe(c.nombre); expect(r.ficha.config).toBeDefined()
    expect(r.quitadas.length).toBeGreaterThan(0); for (const q of r.quitadas) expect(q).not.toMatch(/\d|no-debe-viajar/)
  })
  it('anidado y en listas; no toca el original; ficha vacía o nula no revienta', () => {
    const original = { a: { spend_cap: 1, ok: 2, b: [{ token_x: 'z', v: 3 }] } }
    const r = M.fichaLimpia(original)
    expect(r.ficha).toEqual({ a: { ok: 2, b: [{ v: 3 }] } }); expect(original.a.spend_cap).toBe(1)
    expect(M.fichaLimpia(null).ficha).toEqual({}); expect(M.fichaLimpia(undefined).quitadas).toEqual([])
  })
  it('el plan REAL: la ficha del piloto pierde `config.spend_cap_usd` (lo que el redactor convirtió en «presupuesto de 6 USD/día»)', () => {
    const r = M.fichaLimpia(FICHA_REAL)
    expect(r.quitadas).toEqual(['config.spend_cap_usd']); expect(JSON.stringify(r.ficha)).not.toContain('spend_cap')
  })
})

describe('2 · identidad visual y moneda: salen de la ficha y del manual', () => {
  it.each(clientes)('$rubro: la unión de ficha y manual, sin repetir', (c) => {
    const id = M.identidadDeclarada(c.ficha, c.manual)
    expect([...id.colores].sort()).toEqual([...c.colores].sort()); expect([...id.tipografias].sort()).toEqual([...c.fuentes].sort())
  })
  it('moneda: la declarada gana; si no, la del país (declarada como omisión); sin país conocido, sin dato', () => {
    expect(M.monedaDelCliente(clientes[1].ficha, clientes[1].manual)).toMatchObject({ codigo: 'MXN', fuente: 'declarada en la ficha o el manual' })
    expect(M.monedaDelCliente(clientes[0].ficha, clientes[0].manual)).toMatchObject({ codigo: 'COP' }); expect(M.monedaDelCliente(clientes[0].ficha, clientes[0].manual).fuente).toMatch(/omisión/)
    expect(M.monedaDelCliente(clientes[2].ficha, clientes[2].manual).codigo).toBe('EUR')
    expect(M.monedaDelCliente({ country: 'País inventado' }, {})).toEqual({ codigo: null, fuente: 'sin dato' })
    expect(M.monedaDelCliente({ config: { moneda: 'dólares' } }, {}).codigo).toBe('USD')
  })
  it('sin colores ni tipografías declarados: no se inventa ninguno', () => {
    expect(M.identidadDeclarada({}, {})).toEqual({ colores: [], tipografias: [] })
    expect(M.identidadDeclarada(null, null)).toEqual({ colores: [], tipografias: [] })
  })
  it('los colores del texto del manual también cuentan; uno de tres dígitos no es un color', () => {
    expect(M.identidadDeclarada({}, { content_text: JSON.stringify({ brand_book_draft: { tipografias: [{ nombre: 'Zeta' }], nota: 'usar #ABCDEF' } }) })).toEqual({ colores: ['#abcdef'], tipografias: ['Zeta'] })
  })
})

describe('3 · el chequeo del plan que volvió', () => {
  it.each(clientes)('$rubro: un plan que cumple pasa limpio', (c) => {
    const r = M.revisarPlan(planBueno(c), ctxDe(identidadDe(c)))
    expect(r.marcas).toEqual([]); expect(r.ok).toBe(true); expect(M.bloqueDeRevisionDelPlan(r)).toBe('')
  })
  const defectos: Array<[string, string, (t: string, c: Cli) => string]> = [
    ['P1', 'un tope interno de gasto', (t) => t + '\nBase de cálculo: un tope diario interno registrado en la configuración del cliente.'],
    ['P2', 'una regla interna de la agencia', (t) => t + '\nEl porcentaje lo fijó la casa y no se discute.'],
    ['P3', 'nombres internos', (t) => t + '\nFuente: ficha_mapa y analitica_propia.'],
    ['P4', 'presupuesto sin escenarios', (t) => t.replace(/Escenario prudente[^\n]*/, 'Un único presupuesto.')],
    ['P4', 'presupuesto sin costo por cliente', (t) => t.replace(/El costo por cliente[^\n]*/, '')],
    ['P4', 'presupuesto que es un gasto diario por días', (t, c) => t + `\nPresupuesto: 6 ${c.moneda}/día × 90 días.`],
    ['P5', 'un color fuera del manual', (t) => t + '\nAcento adicional: #123456.'],
    ['P5', 'una tipografía fuera del manual', (t) => t + '\nTipografías: Comic Neue.'],
    ['P6', 'otra moneda', (t, c) => t + `\nUn complemento de 500 ${c.moneda === 'EUR' ? 'USD' : 'EUR'}.`],
  ]
  for (const c of clientes) for (const [codigo, que, mutar] of defectos) {
    it(`${c.rubro} · ${que} ⇒ marca ${codigo} (y solo lo que corresponde)`, () => {
      const r = M.revisarPlan(mutar(planBueno(c), c), ctxDe(identidadDe(c)))
      expect(r.marcas.map((m: any) => m.codigo)).toContain(codigo)
      // el defecto añadido no dispara marcas ajenas (excepto P4 por gasto×días, que a la vez es un tope)
      expect(r.marcas.map((m: any) => m.codigo).filter((k: string) => k !== codigo)).toEqual([])
    })
  }
  it('el bloque que añade el sistema NO cita lo marcado (ni un tope ni un nombre interno) y dice qué revisar', () => {
    const t = planBueno(clientes[0]) + '\nBase: spend_cap_usd.\nFuente: ficha_mapa.'
    const b = M.bloqueDeRevisionDelPlan(M.revisarPlan(t, ctxDe(identidadDe(clientes[0]))))
    expect(b).toContain('## Revisión del plan (la hace el sistema)'); expect(b).not.toMatch(/spend|ficha_mapa|_/); expect(b).toMatch(/tope interno/)
  })
  it('sin presupuesto en el plan: lo dice (P4); sin moneda declarada no se marca la moneda', () => {
    expect(M.revisarPlan('# Plan\nNada de dinero aquí.', { identidad: { colores: [], tipografias: [] }, moneda: { codigo: null } }).marcas.map((m: any) => m.codigo)).toEqual(['P4'])
    expect(M.revisarPlan(planBueno(clientes[0]) + '\n300 EUR', { identidad: ctxDe(identidadDe(clientes[0])).identidad, moneda: { codigo: null } }).marcas).toEqual([])
  })
  it('las URL y los correos no cuentan como nombres internos; los escapes de markdown se leen como texto', () => {
    const t = planBueno(clientes[1]) + '\nMás en https://tienda.example/mi_pagina_uno y escribe a pedidos_ventas@tienda.example.'
    expect(M.revisarPlan(t, ctxDe(identidadDe(clientes[1]))).marcas).toEqual([])
    const e = planBueno(clientes[1]) + '\nFuente: ficha\\_mapa.'
    expect(M.revisarPlan(e, ctxDe(identidadDe(clientes[1]))).marcas.map((m: any) => m.codigo)).toEqual(['P3'])
  })
})

describe('4 · el plan REAL del paso 2 como «antes»: el chequeo marca sus 4 errores', () => {
  const r = M.revisarPlan(REAL, ctxDe({ ficha: FICHA_REAL, manual: MANUAL_REAL }))
  it('P1 tope interno · P2 regla de la casa · P3 nombres internos · P4 presupuesto desde un tope por días, sin escenarios ni ventas necesarias', () => {
    expect(r.marcas.map((m: any) => m.codigo)).toEqual(['P1', 'P2', 'P3', 'P4']); expect(r.ok).toBe(false)
    const p4 = r.marcas.find((m: any) => m.codigo === 'P4')
    expect(p4.que).toContain('escenarios'); expect(p4.que).toContain('ventas o clientes necesarios'); expect(p4.que).toContain('gasto diario × días')
    expect(r.marcas.find((m: any) => m.codigo === 'P1').ejemplos.join(' ')).toMatch(/spend_cap/)
    expect(r.marcas.find((m: any) => m.codigo === 'P3').ejemplos.join(' ')).toMatch(/ficha_mapa|analitica_propia/)
  })
  it('lo que el plan hacía BIEN no se marca: sus colores y tipografías están en el manual y su moneda es la declarada', () => {
    const id = ctxDe({ ficha: FICHA_REAL, manual: MANUAL_REAL })
    expect(id.moneda.codigo).toBe('USD'); expect(id.identidad.colores).toContain('#663772'); expect(id.identidad.tipografias).toContain('Bebas Neue')
    expect(r.marcas.map((m: any) => m.codigo)).not.toContain('P5'); expect(r.marcas.map((m: any) => m.codigo)).not.toContain('P6')
  })
})

describe('5 · las instrucciones al redactor (generales)', () => {
  const texto = (c: Cli) => M.bloquePrimerNivel(ctxDe(identidadDe(c))).join('\n')
  it('cubren los nueve puntos del encargo: presupuesto desde la meta con escenarios, momentos de compra, idea de marca, disponibilidad, 12 semanas y recompra, agencia agéntica, identidad y moneda', () => {
    const t = texto(clientes[0])
    for (const re of [/NO SALE DE UN TOPE|SALE DE LA META/, /DOS ESCENARIOS/, /capacidad operativa/, /PREGUNTA/, /MOMENTOS DE COMPRA/, /No uses un calendario fijo de ning/, /IDEA DE MARCA/, /meta de recordaci/, /DISPONIBILIDAD/, /CALENDARIO DE 12 SEMANAS/, /RECOMPRA Y RETENCI/, /AGÉNTICA/, /variantes creativas/, /IDENTIDAD VISUAL Y MONEDA/]) expect(t).toMatch(re)
    expect(t).toMatch(/no escribas en él reglas ni topes internos/i)
    expect(t).toMatch(/Este bloque MANDA sobre el documento de referencia/); expect(t).toMatch(/no hay un reparto fijo del presupuesto entre canales/)
  })
  it.each(clientes)('$rubro: lleva SUS colores, tipografías y moneda, y no los de otro', (c) => {
    const t = texto(c)
    for (const x of c.colores) expect(t).toContain(x); for (const f of c.fuentes) expect(t).toContain(f); expect(t).toContain(c.moneda)
    for (const o of clientes.filter((y) => y !== c)) { for (const x of o.colores) expect(t).not.toContain(x); for (const f of o.fuentes) expect(t).not.toContain(f) }
  })
  it('sin manual ni ficha: dice que falta, no inventa nada', () => {
    const t = M.bloquePrimerNivel({ identidad: { colores: [], tipografias: [] }, moneda: { codigo: null, fuente: 'sin dato' } }).join('\n')
    expect(t).toMatch(/no declara colores/); expect(t).toMatch(/no declara tipografías/); expect(t).toMatch(/no está declarada/)
  })
  it('GREP AGNÓSTICO: ni el módulo, ni las instrucciones, ni el constructor nombran un cliente, un lugar o un rubro', () => {
    const prohibidos = /n[aá]ufrago|ol[oó]n\b|santa elena|guayaquil|montañita|p[eé]rez|peniche|restaurante|cevich|encebollado|marisc|surf|\bfoil|cafeter[ií]a|veterinari|cl[ií]nica|hotel|hosteler|gimnasio|inmobiliari/i
    const fuente = readFileSync(join(W, 'plan-primer-nivel.js'), 'utf8') + '\n' + readFileSync(join(W, 'construir-primer-nivel-r73.mjs'), 'utf8')
    expect(fuente).not.toMatch(prohibidos)
    expect(texto(clientes[0]) + texto(clientes[1]) + texto(clientes[2])).not.toMatch(prohibidos)
  })
})

describe('6 · los nodos del flujo de planeación', () => {
  it('SOLO cambian los 4 nodos previstos; conexiones idénticas', () => {
    const cambian = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name)
    expect(cambian.sort()).toEqual([NODOS.manual, NODOS.guarda, NODOS.b4, NODOS.vuelta].sort()); expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
  })
  it('se reconstruye igual desde el respaldo; no se aplica a ciegas ni dos veces', () => {
    expect(JSON.stringify(construirFlujo(ANTES as any).nodes)).toBe(JSON.stringify(HOY.nodes))
    expect(() => construirFlujo(HOY as any)).toThrow()
    expect(() => cambiarB4('const x = 1')).toThrow(/aparece 0 veces/); expect(() => cambiarVuelta('const x = 1')).toThrow(/aparece 0 veces/)
  })
  it('la consulta del manual trae los colores y tipografías, y la guarda los pasa', () => {
    expect(nodo(HOY, NODOS.manual).parameters.url).toContain('primary_colors,typography'); expect(nodo(HOY, NODOS.guarda).parameters.jsCode).toContain('identidad_del_manual')
  })

  async function correrB4(f: Flujo, ficha: any, manualRow: any) {
    const entrada = { ficha, manual: { client_id: ficha.id, manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: manualRow.primary_colors, typography: manualRow.typography } }, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {} }
    return (await new AsyncFunction('$input', String(nodo(f, NODOS.b4).parameters.jsCode))({ first: () => ({ json: entrada }) }))[0].json as Record<string, any>
  }
  it.each(clientes)('$rubro: el pedido NO lleva el tope ni claves internas, SÍ lleva el bloque y su identidad; el contexto del chequeo sale del nodo', async (c) => {
    const j = await correrB4(HOY, c.ficha, c.manual)
    expect(j.pedido).not.toMatch(/spend_cap|tope_diario|limite_mensual|no-debe-viajar|api_key/i)
    expect(j.pedido).toContain('EL PLAN A PRIMER NIVEL'); for (const x of c.colores) expect(j.pedido).toContain(x)
    expect(j.pedido).not.toMatch(/META E INSTAGRAM SON EL 60/); expect(j.pedido).not.toMatch(/es el reparto de la casa/)
    expect(j.contexto_chequeo.moneda.codigo).toBe(c.moneda); expect(j.claves_internas_quitadas_de_la_ficha.length).toBeGreaterThan(0)
  })
  it('rojo (antes): con el nodo de antes el pedido SÍ llevaba el tope del piloto y la regla fija del 60 %; verde: ya no', async () => {
    const antes = await correrB4(ANTES, FICHA_REAL, MANUAL_REAL); const hoy = await correrB4(HOY, FICHA_REAL, MANUAL_REAL)
    expect(antes.pedido).toContain('spend_cap_usd'); expect(antes.pedido).toMatch(/META E INSTAGRAM SON EL 60/)
    expect(hoy.pedido).not.toContain('spend_cap_usd'); expect(hoy.pedido).not.toMatch(/META E INSTAGRAM SON EL 60/)
  })
  it('las frases «la casa lo fija / lo discutas» ya no mandan al redactor a atribuir la regla', async () => {
    const hoy = await correrB4(HOY, { ...FICHA_REAL }, MANUAL_REAL)
    expect(hoy.pedido).not.toMatch(/di en el plan que lo fija la casa|LA CASA LO FIJA ASI/)
  })

  async function correrVuelta(f: Flujo, respuesta: string, ctx: any) {
    const $ = (n: string) => {
      if (n === 'elegir brazos') return { first: () => ({ json: { descartados: [] } }) }
      if (n === 'Redactor (B4)') return { first: () => ({ json: { registro_usado: { registro: 'tuteo' }, cliente_id: 'c1', contexto_chequeo: ctx } }) }
      if (n === 'Ficha del cliente') return { first: () => ({ json: { name: 'Cliente' } }) }
      throw new Error('nodo ' + n)
    }
    return (await new AsyncFunction('$input', '$', String(nodo(f, NODOS.vuelta).parameters.jsCode))({ first: () => ({ json: { body: { response: respuesta } } }) }, $))[0].json as Record<string, any>
  }
  it('con el plan REAL: el texto guardado lleva el aviso neutro de revisión y la salida del nodo trae las 4 marcas con sus ejemplos', async () => {
    const j = await correrVuelta(HOY, REAL, ctxDe({ ficha: FICHA_REAL, manual: MANUAL_REAL }))
    expect(j.chequeo_del_plan.marcas.map((m: any) => m.codigo)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(j.texto).toContain('## Revisión del plan (la hace el sistema)'); expect(j.texto.startsWith('# PLAN DE CAMPAÑA')).toBe(true)
    const aviso = j.texto.split('## Revisión del plan (la hace el sistema)')[1].split('## Lo que NO se buscó')[0]
    expect(aviso).not.toMatch(/spend|ficha_mapa|_/)
  })
  it.each(clientes)('$rubro: con un plan que cumple NO hay aviso y el chequeo sale limpio', async (c) => {
    const j = await correrVuelta(HOY, planBueno(c), ctxDe(identidadDe(c)))
    expect(j.chequeo_del_plan).toMatchObject({ ok: true, marcas: [] }); expect(j.texto).not.toContain('Revisión del plan (la hace el sistema)')
  })
  it('sin contexto del chequeo (corrida vieja) o sin vuelta: no revienta', async () => {
    const j = await correrVuelta(HOY, planBueno(clientes[0]), null)
    expect(j.llego_la_vuelta).toBe(true); expect(Array.isArray(j.chequeo_del_plan.marcas)).toBe(true)
    const v = await correrVuelta(HOY, '', null); expect(v.llego_la_vuelta).toBe(false); expect(v.chequeo_del_plan).toBeNull()
  })
})
