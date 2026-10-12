/**
 * Ronda 80 · cierre del capítulo del plan: el chequeo no se esquiva (TBD, por determinar, pendiente, n/d, guiones, celda vacía, nombres de personas) y, si marca, el plan queda «con pendientes» y la bandeja recibe el aviso.
 * Pruebas con el plan v2 REAL como «antes» y 3 clientes de práctica de rubros y monedas distintos. Nada con modelo. Agnóstico: ningún nombre de persona, cliente ni lugar en el módulo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiarB4, construirFlujo, MODULO_R80, NODOS } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r80.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-ANTES-r80-2026-10-12.json'), 'utf8')) as Flujo
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-ARREGLADO-r80-2026-10-12.json'), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(MODULO_R80 + '\nreturn { revisarPlan, personasDeLaFicha, pendientesDelPlan }')() as Record<string, (...a: any[]) => any>
const REAL = readFileSync(join(process.cwd(), '__tests__/fixtures/ronda78/plan-v2-811b9e94.md'), 'utf8')
const CTX = { identidad: { colores: ['#1a0828', '#663772', '#2d1135', '#51d4b4', '#38154b', '#4b2855'], tipografias: ['Caveat', 'Inter', 'Alfa Slab One', 'Bebas Neue', 'Permanent Marker'] }, moneda: { codigo: null }, personas: ['Lucía Ortega', 'Marco'], nombre_cliente: 'Negocio de Práctica' }
const codigos = (r: any) => r.marcas.map((m: any) => m.codigo)

interface Cli { nombre: string; unidad: string; meta: number; cpaMin: number; cpaMax: number; moneda: string }
const clientes: Cli[] = [
  { nombre: 'Consultora Alfa', unidad: 'contratos', meta: 12, cpaMin: 700, cpaMax: 1100, moneda: 'COP' },
  { nombre: 'Tienda Beta', unidad: 'pedidos', meta: 400, cpaMin: 6, cpaMax: 11, moneda: 'MXN' },
  { nombre: 'Estudio Gamma', unidad: 'reservas', meta: 90, cpaMin: 4, cpaMax: 8, moneda: 'EUR' },
]
const FILA = (c: Cli) => `| Prudente | ${c.meta * c.cpaMin} ${c.moneda} | ${c.cpaMax} ${c.moneda} | ${c.meta} |`
const planBueno = (c: Cli, cambio?: (fila: string) => string, extra = '') => [
  `# Plan de 90 días de ${c.nombre}`, '## 7 · EL PRESUPUESTO',
  `La meta a 90 días es conseguir ${c.meta} ${c.unidad} nuevos; las ventas necesarias del periodo son ${c.meta} ${c.unidad}. ${extra}`,
  `El costo por cliente estimado va de ${c.cpaMin} a ${c.cpaMax} ${c.moneda} (rango de mercado, fuente: promedio del sector en la plataforma de anuncios; estimación, no dato propio).`,
  'Escenario prudente y escenario ambicioso, con todas sus cifras:',
  '| Escenario | Inversión del mes | Costo por cliente | Clientes que necesita para cubrirse |', '|---|---|---|---|',
  cambio ? cambio(FILA(c)) : FILA(c), `| Ambicioso | ${c.meta * c.cpaMax * 2} ${c.moneda} | ${c.cpaMin} ${c.moneda} | ${c.meta * 2} |`,
  '| Renglón | Peso | Razón |', '|---|---|---|',
  '| Pauta | 55 % | porque la meta es de ventas y el canal propio ya tiene demanda |', '| Contenido | 30 % | porque cada semana necesita piezas nuevas |', '| Marca | 15 % | porque la recordación no la da la pauta sola |',
  '## 8 · OTRA SECCIÓN',
].join('\n')

describe('P4 · el chequeo no se esquiva con otra palabra', () => {
  it.each(clientes)('$nombre: el plan bueno PASA limpio', (c) => { expect(M.revisarPlan(planBueno(c), CTX).ok).toBe(true) })
  const evasiones: Array<[string, (f: string) => string]> = [
    ['TBD', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| TBD |')],
    ['por determinar', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| por determinar |')],
    ['a determinar', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| a determinar |')],
    ['pendiente', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| pendiente |')],
    ['n/d', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| n/d |')],
    ['n/a', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| N/A |')],
    ['raya larga', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| — |')],
    ['guion', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| - |')],
    ['interrogación', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| ? |')],
    ['celda vacía', (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '|  |')],
    ['fila sin un dígito', () => '| Prudente | según la meta | según el plan | lo que alcance |'],
  ]
  for (const c of clientes) it.each(evasiones)(`${c.nombre} · «%s» marca P4`, (_n, cambio) => {
    const r = M.revisarPlan(planBueno(c, cambio), CTX)
    expect(r.ok).toBe(false); expect(codigos(r)).toContain('P4'); expect(r.marcas.find((m: any) => m.codigo === 'P4').que).toMatch(/celdas del presupuesto sin cifra/)
  })
  it('el plan v2 REAL (con sus «A calcular» / «A confirmar»): sigue marcado', () => { expect(codigos(M.revisarPlan(REAL, { ...CTX, personas: [] }))).toEqual(expect.arrayContaining(['P4', 'P7'])) })
  it('sin falsos positivos: «pendiente»/«a confirmar» fuera del presupuesto y tablas con cifras no marcan', () => {
    const c = clientes[0]
    expect(M.revisarPlan(planBueno(c) + '\nLa aprobación del dueño sigue pendiente y el horario está a confirmar.', CTX).ok).toBe(true)
  })
})

describe('P7 · nombres de personas y «según indicó el dueño»', () => {
  const c = clientes[1]
  const con = (frase: string, ctx: any = CTX) => M.revisarPlan(planBueno(c, undefined, frase), ctx)
  it.each([
    ['nombre completo de la ficha', 'La revisa Lucía Ortega cada semana.'],
    ['solo el nombre de pila', 'Lo decide Marco.'],
    ['solo el apellido', 'Lo firma Ortega.'],
    ['en minúsculas', 'lo aprueba marco.'],
    ['persona con su rol entre paréntesis', 'Carlos (propietario) decide el presupuesto.'],
    ['rol y dos puntos', 'Responsable: Lucía Ortiz.'],
    ['dueño del resultado', 'Un solo dueño del resultado: Andrea.'],
    ['según indicó el dueño', 'Según indicó el dueño, el local es solo domicilio.'],
    ['el propietario confirmó', 'El propietario confirmó que no hay delivery.'],
  ])('%s → marca P7', (_n, frase) => {
    const r = con(frase); expect(codigos(r)).toContain('P7')
  })
  it('un nombre de la ficha que es parte del nombre del negocio NO se marca', () => {
    const r = M.revisarPlan(planBueno(c, undefined, 'En Negocio de Práctica los pedidos crecen.'), { ...CTX, personas: ['Práctica Pérez'] }); expect(codigos(r)).not.toContain('P7')
  })
  it('sin falsos positivos: el dueño aprueba, palabras que contienen el nombre, y el rol sin nombre', () => {
    expect(codigos(con('El dueño aprueba el presupuesto y el propietario del local confirma el horario.'))).not.toContain('P7')
    expect(codigos(con('Hay marcos de fotos, marcación y Marcopolo no aparece.', { ...CTX, personas: ['Marco'] }))).not.toContain('P7') // «marcos», «marcación» y «Marcopolo» son otras palabras: solo marca «Marco» entero
  })
  it('personasDeLaFicha toma los nombres que la ficha declara y NINGUNO de lo demás', () => {
    const ficha = { name: 'X', config: { personas: ['Ana Ruiz', { nombre: 'Luis' }], owner: 'Eva Soto', apify: { own_handles: { instagram: 'x.ec' } }, contacto: 'a@b.com', spend_cap_usd: 6 } }
    expect(M.personasDeLaFicha(ficha)).toEqual(['Ana Ruiz', 'Luis', 'Eva Soto'])
    expect(M.personasDeLaFicha({ name: 'X' })).toEqual([]); expect(M.personasDeLaFicha(null)).toEqual([])
  })
})

describe('los nodos del flujo', () => {
  it('cambian los 4 nodos previstos y se suman 3; solo cambia la conexión de «Guardar el plan» y las nuevas', () => {
    const cambian = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name)
    expect(cambian.sort()).toEqual([NODOS.b4, NODOS.vuelta, NODOS.guardar, NODOS.drive].sort())
    expect(HOY.nodes.length).toBe(ANTES.nodes.length + 3)
    for (const k of Object.keys(ANTES.connections)) if (k !== NODOS.guardar) expect(JSON.stringify(HOY.connections[k]), k).toBe(JSON.stringify(ANTES.connections[k]))
    expect(HOY.connections[NODOS.guardar].main[0].map((x) => x.node)).toEqual([NODOS.drive, NODOS.aviso]) // el aviso va SEGUNDO: el PDF y la vuelta a la sala no esperan
    expect(HOY.connections[NODOS.aviso].main[0].map((x) => x.node)).toEqual([NODOS.bandeja]); expect(HOY.connections[NODOS.bandeja].main[0].map((x) => x.node)).toEqual([NODOS.comprobar])
  })
  it('se reconstruye igual desde el respaldo; no se aplica a ciegas ni dos veces', () => {
    expect(JSON.stringify(construirFlujo(ANTES as any))).toBe(JSON.stringify(HOY))
    expect(() => construirFlujo(HOY as any)).toThrow()
    expect(() => cambiarB4('const x = 1')).toThrow(/aparece 0 veces/)
  })
  it('el aviso va a la bandeja de revisión humana con la llave por variable de entorno y sin ninguna llave pegada', () => {
    const h = nodo(HOY, NODOS.bandeja).parameters
    expect(h.url).toContain('/api/hitl/queue'); expect(JSON.stringify(h)).toContain('$env.INTERNAL_API_KEY')
    expect(JSON.stringify(HOY.nodes.filter((n) => [NODOS.aviso, NODOS.bandeja, NODOS.comprobar].includes(n.name)))).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|[0-9a-f]{64}/)
  })

  const FICHA = { id: 'x-1', name: 'Negocio de Práctica', country: 'Colombia', industry: 'servicio', config: { spend_cap_usd: 9, personas: ['Lucía Ortega'] } }
  const entrada = { ficha: FICHA, manual: { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], typography: ['Lato'] } }, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {} }
  const b4 = async () => (await new AsyncFunction('$input', String(nodo(HOY, NODOS.b4).parameters.jsCode))({ first: () => ({ json: entrada }) }))[0].json as Record<string, any>
  it('B4: el contexto del chequeo lleva las personas de la ficha y el nombre del negocio, y la ficha que ve el redactor sigue sin topes', async () => {
    const j = await b4()
    expect(j.contexto_chequeo.personas).toEqual(['Lucía Ortega']); expect(j.contexto_chequeo.nombre_cliente).toBe('Negocio de Práctica'); expect(j.pedido).not.toContain('spend_cap')
  })

  async function vuelta(respuesta: string, ctxChequeo: any = CTX) {
    const $ = (n: string) => {
      if (n === 'elegir brazos') return { first: () => ({ json: { descartados: [] } }) }
      if (n === 'Redactor (B4)') return { first: () => ({ json: { registro_usado: { registro: 'tuteo' }, cliente_id: 'c1', contexto_chequeo: ctxChequeo } }) }
      if (n === 'Ficha del cliente') return { first: () => ({ json: { name: 'Negocio de Práctica' } }) }
      throw new Error('nodo ' + n)
    }
    return (await new AsyncFunction('$input', '$', String(nodo(HOY, NODOS.vuelta).parameters.jsCode))({ first: () => ({ json: { body: { response: respuesta } } }) }, $))[0].json as Record<string, any>
  }
  it('el plan con marcas queda «con_pendientes» con la línea de qué falta; el limpio, «sin_marcas»; si no llegó la vuelta, sin estado', async () => {
    const mal = await vuelta(planBueno(clientes[2], (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| TBD |'), 'La revisa Lucía Ortega.'))
    expect(mal.estado_del_plan).toBe('con_pendientes'); expect(mal.con_pendientes).toBe(true); expect(mal.pendientes).toMatch(/P4 · [\s\S]*celdas del presupuesto sin cifra[\s\S]*P7 · /)
    const bien = await vuelta(planBueno(clientes[2]))
    expect(bien.estado_del_plan).toBe('sin_marcas'); expect(bien.con_pendientes).toBe(false); expect(bien.pendientes).toBeNull()
    const nada = await vuelta('')
    expect(nada.estado_del_plan).toBeNull(); expect(nada.con_pendientes).toBe(false)
  })
  it('lo que llega al cliente sigue sin lo interno aunque el chequeo marque', async () => {
    const mal = await vuelta(planBueno(clientes[0], (f) => f.replace(/\| \d+ [A-Z]{3} \|/, '| TBD |')))
    expect(mal.texto).not.toMatch(/Revisión del plan \(la hace el sistema\)/); expect(mal.registro_interno.aviso_del_chequeo).toMatch(/Revisión del plan/)
  })
  it('«Guardar el plan» guarda el estado y los pendientes; el estado de la fila sigue siendo «draft»; el PDF lleva «CON PENDIENTES · » solo si marcó', () => {
    const g = nodo(HOY, NODOS.guardar).parameters.jsonBody
    expect(g).toContain('estado_del_plan: $json.estado_del_plan || null'); expect(g).toContain('pendientes: $json.pendientes || null'); expect(g).toContain("status: 'draft'")
    expect(nodo(HOY, NODOS.drive).parameters.jsonBody).toContain("con_pendientes ? 'CON PENDIENTES · ' : ''")
  })

  const aviso = async (v: Record<string, unknown>, guardado: unknown = [{ id: '11111111-1111-4111-8111-111111111111' }]) => {
    const $ = (n: string) => {
      if (n === NODOS.vuelta) return { first: () => ({ json: v }) }
      if (n === NODOS.guardar) return { first: () => ({ json: guardado }) }
      throw new Error('nodo ' + n)
    }
    return await new AsyncFunction('$', String(nodo(HOY, NODOS.aviso).parameters.jsCode))($)
  }
  it('Aviso: con pendientes arma UNA línea para la bandeja atada al plan guardado; sin pendientes no sale nada', async () => {
    const v = { con_pendientes: true, estado_del_plan: 'con_pendientes', pendientes: 'P4 · falta la cifra · P7 · nombra a una persona', client_id: 'c1', client_name: 'Negocio de Práctica', chequeo_del_plan: { marcas: [{ codigo: 'P4' }] } }
    const out = await aviso(v)
    expect(out).toHaveLength(1)
    const c = out[0].json.cuerpo
    expect(c).toMatchObject({ type: 'plan_con_pendientes', client_id: 'c1', priority: 'high', output_id: '11111111-1111-4111-8111-111111111111' })
    expect(c.title).toMatch(/^Plan de 90 días de Negocio de Práctica con pendientes: P4/); expect(c.title).not.toContain('\n'); expect(c.title.length).toBeLessThanOrEqual(480)
    expect(c.payload).toMatchObject({ para_el_cliente: false, estado_del_plan: 'con_pendientes' })
    expect(await aviso({ con_pendientes: false })).toEqual([])
    const sinGuardar = await aviso(v, {}); expect(sinGuardar[0].json.cuerpo.output_id).toBeUndefined() // si el plan no quedó guardado, el aviso sale igual, sin atarlo
  })
  it('Comprobar: si la bandeja no recibió el aviso la corrida sale en ERROR (no se calla)', async () => {
    const comprobar = (r: unknown) => new AsyncFunction('$input', String(nodo(HOY, NODOS.comprobar).parameters.jsCode))({ first: () => ({ json: r }) })
    expect((await comprobar({ ok: true, id: 'abc' }))[0].json.aviso_en_bandeja).toBe(true)
    await expect(comprobar({ error: 'unauthorized' })).rejects.toThrow(/PLAN_CON_PENDIENTES_SIN_AVISO/)
    await expect(comprobar({})).rejects.toThrow(/PLAN_CON_PENDIENTES_SIN_AVISO/)
  })
})

describe('agnóstico', () => {
  it('GREP: el módulo y el constructor no nombran ninguna persona, cliente, lugar ni rubro', () => {
    const textos = MODULO_R80 + readFileSync(join(W, 'construir-r80.mjs'), 'utf8')
    expect(textos).not.toMatch(/Emilio|P[eé]rez|N[aá]ufrago|Olón|Olon|Guayaquil|Xavier|restaurante|mariscos/i)
  })
})
