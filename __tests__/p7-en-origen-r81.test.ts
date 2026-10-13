/**
 * Ronda 81 · P7 del chequeo del plan, corregido en el ORIGEN: el redactor no recibe nombres propios de personas que la ficha no declare para mostrar.
 * 3 rubros / monedas de práctica; el plan v2 REAL como «antes». Nada con modelo. Agnóstico: ningún nombre ni lista de nombres en el módulo ni en el constructor. P4 no se toca.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiarB4, construirFlujo, MODULO_R80, MODULO_R81, NODOS } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r81.mjs'
import { barrerTexto } from '../scripts/ops/barrer-voseo.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-ANTES-r81-2026-10-13.json'), 'utf8')) as Flujo
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-ARREGLADO-r81-2026-10-13.json'), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(MODULO_R81 + '\nreturn { revisarPlan, personasDeLaFicha, personasEnElInsumo, personasAProteger, sinPersonas, nombresVisibles, bloquePrimerNivel }')() as Record<string, (...a: any[]) => any>
const REAL = readFileSync(join(process.cwd(), '__tests__/fixtures/ronda78/plan-v2-811b9e94.md'), 'utf8')
const CTX0 = { identidad: { colores: [], tipografias: [] }, moneda: { codigo: null } }
const codigos = (r: any) => r.marcas.map((m: any) => m.codigo)

/** tres negocios de práctica: rubro, moneda y persona distintos (los nombres son de PRÁCTICA, viven solo en esta prueba) */
const clientes = [
  { nombre: 'Consultora Alfa', rubro: 'consultoría', moneda: 'COP', dueno: 'Rosario Villamar', rol: 'propietaria' },
  { nombre: 'Tienda Beta', rubro: 'comercio', moneda: 'MXN', dueno: 'Teodoro Quiroga', rol: 'dueño' },
  { nombre: 'Estudio Gamma', rubro: 'reservas', moneda: 'EUR', dueno: 'Ingrid Salgado Mora', rol: 'fundadora' },
]
const fichaDe = (c: (typeof clientes)[number], config: Record<string, unknown> = {}) => ({ id: 'x-1', name: c.nombre, country: 'Colombia', industry: c.rubro, config: { spend_cap_usd: 9, ...config } })
const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], typography: ['Lato'] } }
const entradaDe = (c: (typeof clientes)[number], extra: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => ({
  ficha: fichaDe(c, config), manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {},
  hechos_del_dueno: [`Solo reparte a domicilio. (Fuente: corrección del ${c.rol}, ${c.dueno}, 12 de octubre.)`, 'No tiene local físico.'], ...extra,
})
const b4 = async (ent: Record<string, unknown>, flujo: Flujo = HOY) => (await new AsyncFunction('$input', String(nodo(flujo, NODOS.b4).parameters.jsCode))({ first: () => ({ json: ent }) }))[0].json as Record<string, any>

describe('encontrar a las personas por los datos, sin lista de nombres', () => {
  it.each(clientes)('$nombre: halla a la persona junto a su rol, en las cuatro formas', (c) => {
    const n = c.dueno
    expect(M.personasEnElInsumo(`Fuente: corrección del ${c.rol}, ${n}, 12 de octubre`)).toContain(n)
    expect(M.personasEnElInsumo(`${n} (${c.rol}) aprueba el presupuesto`)).toContain(n)
    expect(M.personasEnElInsumo(`Dueño del resultado: ${n}`)).toContain(n)
    expect(M.personasEnElInsumo(`según el ${c.rol} ${n}`)).toContain(n)
  })
  it('no confunde roles sin nombre, artículos ni palabras comunes con personas', () => {
    expect(M.personasEnElInsumo('el dueño del negocio aprueba. El propietario: la agencia ejecuta. El gerente, con su equipo, decide')).toEqual([])
    expect(M.personasEnElInsumo('el dueño decide; la propietaria, con el equipo, revisa')).toEqual([])
  })
  it('un lugar con «propietarios» en plural NO es una persona (ni en el redactor ni en el chequeo)', () => {
    expect(M.personasEnElInsumo('Cocina de autor en Lugarejo (propietarios extranjeros), con jardín. Restaurante de propietarios locales.')).toEqual([])
    expect(codigos(M.revisarPlan('# Plan\nCompetidor: Lugarejo (propietarios extranjeros).', CTX0))).not.toContain('P7')
    expect(codigos(M.revisarPlan('# Plan\nAprueba Rosario Villamar (propietaria del negocio).', CTX0))).toContain('P7')
    expect(M.personasEnElInsumo('Rosario Villamar (propietaria del negocio)')).toEqual(['Rosario Villamar'])
  })
  it('los nombres que la ficha declara para MOSTRAR no se protegen (ni en el redactor ni en el chequeo)', () => {
    const c = clientes[0]
    expect(M.nombresVisibles(fichaDe(c, { nombres_visibles: [c.dueno] }))).toEqual([c.dueno])
    expect(M.nombresVisibles(fichaDe(c, { nombre_para_mostrar: c.dueno }))).toEqual([c.dueno])
    expect(M.nombresVisibles(fichaDe(c))).toEqual([])
    const t = `corrección del ${c.rol}, ${c.dueno}, 12 de octubre`
    expect(M.personasAProteger(fichaDe(c), t, [c.dueno])).toEqual([])
    expect(M.personasAProteger(fichaDe(c), t, [])).toContain(c.dueno)
    expect(M.personasAProteger(fichaDe(c, { personas: ['Otra Persona'] }), t, [c.dueno])).toEqual(['Otra Persona'])
  })
  it('las palabras del nombre del negocio nunca pasan por persona', () => {
    const t = M.sinPersonas('Consultora Alfa atiende; Alfa Romero (propietario) aprueba', ['Alfa Romero'], 'Consultora Alfa')
    expect(t).toContain('Consultora Alfa atiende'); expect(t).toContain('quien lleva el negocio (propietario)')
  })
})

describe('el redactor NO recibe los nombres (B4 sobre el flujo construido)', () => {
  it.each(clientes)('$nombre: el pedido no trae el nombre de la persona ni completo ni por partes; sí trae el dato como hecho', async (c) => {
    const j = await b4(entradaDe(c))
    for (const p of c.dueno.split(' ')) expect(j.pedido, p).not.toContain(p)
    expect(j.pedido).toContain('Solo reparte a domicilio'); expect(j.pedido).toContain('No tiene local físico')
    expect(j.pedido).toContain('quien lleva el negocio')
  })
  it.each(clientes)('$nombre: el nombre dentro de la ficha, el manual y el material también se quita', async (c) => {
    const ent = entradaDe(c, {
      manual: { ...MANUAL, notas: `Habla ${c.dueno} (${c.rol})` },
      material: [{ objetivo: 'resenas', brazo: 'a', estado: 'trajo', datos: { texto: `lo dijo ${c.dueno.split(' ')[0]}`, otro: `${c.rol}: ${c.dueno}` } }],
    }, { contacto: c.dueno })
    const j = await b4(ent)
    for (const p of c.dueno.split(' ')) expect(j.pedido, p).not.toContain(p)
  })
  it('lo declarado para mostrar SÍ llega, con nombre, y el redactor sabe que solo esos se pueden escribir', async () => {
    const c = clientes[1]
    const j = await b4(entradaDe(c, {}, { nombres_visibles: [c.dueno] }))
    expect(j.pedido).toContain(c.dueno); expect(j.pedido).toContain('Solo se pueden escribir, con nombre propio, estas personas')
    expect(j.contexto_chequeo.personas).toEqual([]) // lo visible no se vigila
  })
  it.each(clientes)('$nombre: el chequeo del plan vigila el mismo nombre aunque la ficha no lo declare (y no marca lo visible)', async (c) => {
    const j = await b4(entradaDe(c))
    expect(j.contexto_chequeo.personas).toContain(c.dueno)
    const plan = `# Plan\nEl dueño del resultado es ${c.dueno.split(' ')[0]}.`
    expect(codigos(M.revisarPlan(plan, { ...CTX0, ...j.contexto_chequeo }))).toContain('P7')
    const v = await b4(entradaDe(c, {}, { nombres_visibles: [c.dueno] }))
    expect(codigos(M.revisarPlan(plan, { ...CTX0, ...v.contexto_chequeo }))).not.toContain('P7')
  })
  it('un plan escrito por función («el dueño del negocio aprueba») pasa P7 sin nombres', async () => {
    const c = clientes[2]
    const j = await b4(entradaDe(c))
    expect(codigos(M.revisarPlan('# Plan\nUn solo responsable del resultado: el dueño del negocio aprueba el presupuesto y la agencia ejecuta.', { ...CTX0, ...j.contexto_chequeo }))).not.toContain('P7')
  })
  it('el plan v2 REAL: con el nombre que sus insumos traen, el chequeo lo ve; P4 no se toca', () => {
    const r = M.revisarPlan(REAL, { ...CTX0, moneda: { codigo: 'USD' }, personas: M.personasEnElInsumo(REAL) })
    expect(codigos(r)).toEqual(expect.arrayContaining(['P4', 'P7']))
    expect(r.marcas.find((m: any) => m.codigo === 'P7').ejemplos.join(' ')).toMatch(/nombre de una persona/)
  })
})

describe('la instrucción nueva', () => {
  it('pide nombrar a las personas por su función y no decir quién dio un dato', () => {
    const t = M.bloquePrimerNivel({ identidad: { colores: [], tipografias: [] }, moneda: { codigo: 'USD', fuente: 'x' } }).join('\n')
    expect(t).toMatch(/No escribas el nombre propio de ninguna persona/); expect(t).toMatch(/por su función/); expect(t).not.toMatch(/Solo se pueden escribir/)
  })
  it('la línea del «dueño único del resultado» lo pide por función en el pedido', async () => {
    const j = await b4(entradaDe(clientes[0]))
    expect(j.pedido).toMatch(/Un dueno unico del resultado \(nombrado por su funcion/)
  })
  it('TUTEO: ni el módulo ni el constructor tienen voseo (el barrido no cambia nada)', () => {
    const nuevo = MODULO_R81.slice(MODULO_R81.indexOf('// ronda 81'), MODULO_R81.indexOf('/** las celdas de las tablas'))
    expect(barrerTexto(nuevo).texto).toBe(nuevo)
    const pedido = String(nodo(HOY, NODOS.b4).parameters.jsCode)
    expect(barrerTexto(pedido).texto).toBe(pedido)
  })
})

describe('los nodos del flujo', () => {
  it('cambian SOLO «Redactor (B4)» y «¿Llegó la vuelta?»; las conexiones y el resto (incluido el nodo de CC#2) quedan iguales', () => {
    const cambian = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name)
    expect(cambian.sort()).toEqual([NODOS.b4, NODOS.vuelta].sort())
    expect(HOY.nodes.length).toBe(ANTES.nodes.length); expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
  })
  it('se reconstruye igual desde el respaldo; no se aplica a ciegas ni dos veces', () => {
    expect(JSON.stringify(construirFlujo(ANTES as any))).toBe(JSON.stringify(HOY))
    expect(() => construirFlujo(HOY as any)).toThrow()
    expect(() => cambiarB4('const x = 1')).toThrow(/aparece 0 veces/)
  })
  it('P4 no se tocó: la parte del presupuesto del módulo es idéntica a la de r80', () => {
    const corte = (s: string) => s.slice(s.indexOf('function revisarPlan'))
    expect(corte(MODULO_R81)).toBe(corte(MODULO_R80))
    const sec = (s: string) => s.slice(s.indexOf('var RE_CELDA_SIN_CIFRA'), s.indexOf('var RE_COSTO_CON_CIFRA'))
    expect(sec(MODULO_R81)).toBe(sec(MODULO_R80))
  })
})

describe('agnóstico', () => {
  it('GREP: el módulo y el constructor no nombran ninguna persona, cliente, lugar ni rubro', () => {
    const textos = MODULO_R81 + readFileSync(join(W, 'construir-r81.mjs'), 'utf8')
    expect(textos).not.toMatch(/Emilio|P[eé]rez|N[aá]ufrago|Olón|Olon|Guayaquil|Xavier|restaurante|mariscos/i)
  })
})
