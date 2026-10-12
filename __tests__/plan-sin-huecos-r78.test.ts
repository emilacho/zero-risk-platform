/**
 * Ronda 78 · el plan sin huecos ni fugas. Pruebas con el plan v2 REAL de la corrida del 12-oct como «antes» (el chequeo marca sus huecos y sus fugas) y 3 clientes de práctica de rubros distintos.
 * Nada con modelo. Agnóstico: ni el módulo ni las instrucciones nombran un cliente, un lugar ni un rubro.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cambiarB4, cambiarVuelta, construirFlujo, MODULO_R78, NODOS } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r78.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-ANTES-r78-2026-10-12.json'), 'utf8')) as Flujo
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-ARREGLADO-r78-2026-10-12.json'), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(MODULO_R78 + '\nreturn { bloquePrimerNivel, bloqueDelDueno, revisarPlan }')() as Record<string, (...a: any[]) => any>
const REAL = readFileSync(join(process.cwd(), '__tests__/fixtures/ronda78/plan-v2-811b9e94.md'), 'utf8')
const CTX = { identidad: { colores: ['#1a0828', '#663772', '#2d1135', '#51d4b4', '#38154b', '#4b2855'], tipografias: ['Caveat', 'Inter', 'Alfa Slab One', 'Bebas Neue', 'Permanent Marker'] }, moneda: { codigo: 'USD' } }
const codigos = (r: any) => r.marcas.map((m: any) => m.codigo)

interface Cli { nombre: string; unidad: string; meta: number; cpaMin: number; cpaMax: number; moneda: string }
const clientes: Cli[] = [
  { nombre: 'Consultora Alfa', unidad: 'contratos', meta: 12, cpaMin: 700, cpaMax: 1100, moneda: 'COP' },
  { nombre: 'Tienda Beta', unidad: 'pedidos', meta: 400, cpaMin: 6, cpaMax: 11, moneda: 'MXN' },
  { nombre: 'Estudio Gamma', unidad: 'reservas', meta: 90, cpaMin: 4, cpaMax: 8, moneda: 'EUR' },
]
/** un plan que cumple: cifra de costo por cliente (rango de mercado con fuente), escenarios con TODAS las celdas llenas, reparto con su razón */
const planBueno = (c: Cli) => [
  `# Plan de 90 días de ${c.nombre}`, '## 7 · EL PRESUPUESTO',
  `La meta a 90 días es conseguir ${c.meta} ${c.unidad} nuevos; las ventas necesarias del periodo son ${c.meta} ${c.unidad}.`,
  `El costo por cliente estimado va de ${c.cpaMin} a ${c.cpaMax} ${c.moneda} (rango de mercado, fuente: promedio del sector en la plataforma de anuncios; estimación, no dato propio).`,
  'Escenario prudente y escenario ambicioso, con todas sus cifras:',
  '| Escenario | Inversión del mes | Costo por cliente | Clientes que necesita para cubrirse |', '|---|---|---|---|',
  `| Prudente | ${c.meta * c.cpaMin} ${c.moneda} | ${c.cpaMax} ${c.moneda} | ${c.meta} |`, `| Ambicioso | ${c.meta * c.cpaMax * 2} ${c.moneda} | ${c.cpaMin} ${c.moneda} | ${c.meta * 2} |`,
  '| Renglón | Peso | Razón |', '|---|---|---|',
  '| Pauta | 55 % | porque la meta es de ventas y el canal propio ya tiene demanda |', '| Contenido | 30 % | porque cada semana necesita piezas nuevas |', '| Marca | 15 % | porque la recordación no la da la pauta sola |',
  '## 8 · OTRA SECCIÓN',
].join('\n')

describe('P4 · el presupuesto sin huecos', () => {
  it('el plan v2 REAL (antes): marca P4 por la cifra que falta, las celdas «A calcular» y el reparto sin razón; P7 por la fuga del dueño', () => {
    const r = M.revisarPlan(REAL, CTX)
    expect(r.ok).toBe(false); expect(codigos(r)).toEqual(expect.arrayContaining(['P4', 'P7']))
    const p4 = r.marcas.find((m: any) => m.codigo === 'P4')
    expect(p4.que).toMatch(/la cifra del costo por cliente/); expect(p4.que).toMatch(/celdas del presupuesto sin cifra/); expect(p4.que).toMatch(/reparto por porcentajes sin la razón/)
    expect(p4.ejemplos.join(' ')).toMatch(/A calcular|A confirmar|aún no calculable/i)
    expect(r.marcas.find((m: any) => m.codigo === 'P7').ejemplos.join(' ')).toMatch(/corrección del propietario|instrucción manda/i)
  })
  it.each(clientes)('$nombre: un plan con cifra, rango con fuente, celdas llenas y reparto razonado PASA limpio', (c) => {
    expect(M.revisarPlan(planBueno(c), { identidad: { colores: [], tipografias: [] }, moneda: { codigo: c.moneda } }).ok).toBe(true)
  })
  it.each(clientes)('$nombre: cada hueco marca P4 y solo P4', (c) => {
    const base = planBueno(c)
    const ctx = { identidad: { colores: [], tipografias: [] }, moneda: { codigo: c.moneda } }
    for (const [que, plan] of [
      ['una celda A calcular', base.replace(`| Prudente | ${c.meta * c.cpaMin} ${c.moneda} |`, '| Prudente | A calcular |')],
      ['una celda A confirmar con la plataforma', base.replace(`| ${c.cpaMax} ${c.moneda} | ${c.meta} |`, '| A confirmar con la plataforma | 12 |')],
      ['sin dato', base.replace('| Marca | 15 % |', '| Marca | sin dato |')],
      ['no calculable', base.replace('El costo por cliente estimado', 'El costo por cliente aún no calculable; estimado')],
    ] as Array<[string, string]>) {
      const r = M.revisarPlan(plan, ctx)
      expect(codigos(r), que).toContain('P4')
    }
    // el reparto fijo sin razón
    const fijo = base.replace(/\| (Pauta|Contenido|Marca) \| (\d\d) % \|[^|]*\|/g, (_m, n, p) => `| ${n} | ${p} % | para trabajar |`)
    const r = M.revisarPlan(fijo, ctx)
    expect(codigos(r)).toContain('P4'); expect(r.marcas.find((m: any) => m.codigo === 'P4').que).toMatch(/reparto por porcentajes sin la razón/)
  })
  it('un presupuesto sin cifra de costo por cliente (aunque nombre «costo por cliente») se marca; con la cifra no', () => {
    const sin = '# P\n## 7 · EL PRESUPUESTO\nMeta de 40 pedidos; ventas necesarias 160 pedidos. El costo por cliente se estima en la semana 2. Escenario prudente y escenario ambicioso.\n## 8 · X'
    expect(M.revisarPlan(sin, CTX).marcas.find((m: any) => m.codigo === 'P4').que).toMatch(/la cifra del costo por cliente/)
  })
})

describe('P7 · la fuga del dueño y de lo interno', () => {
  it.each([
    'Fuente: corrección del propietario, 12 de octubre.', 'Esta instrucción manda sobre cualquier otra fuente.', 'Lo dijo la corrección del dueño y prevalece sobre cualquier otra fuente.',
  ])('«%s» se marca', (frase) => { expect(codigos(M.revisarPlan(`# P\n${frase}`, CTX))).toContain('P7') })
  it('decir el hecho a secas NO se marca', () => {
    expect(codigos(M.revisarPlan('# P\nEn la sede de la costa hay restaurante y servicio a domicilio; en la capital, solo servicio a domicilio.', CTX))).not.toContain('P7')
  })
})

describe('instrucciones al redactor', () => {
  const t = M.bloquePrimerNivel(CTX).join('\n')
  it('exigen costo por cliente con rango de mercado y fuente, ninguna celda vacía, y un reparto razonado (nada fijo)', () => {
    expect(t).toMatch(/SIEMPRE con una cifra/); expect(t).toMatch(/RANGO DE MERCADO/); expect(t).toMatch(/FUENTE/); expect(t).toMatch(/Nunca «aún no calculable», «a calcular», «a confirmar» ni «sin dato»/)
    expect(t).toMatch(/no uses un reparto fijo por costumbre/); expect(t).toMatch(/lleva escrita su RAZÓN/)
  })
  it('el bloque del dueño dice los datos como hechos, sin nombrar al dueño ni «manda»', () => {
    const b = M.bloqueDelDueno(['sede de la costa · tipo de atencion: restaurante (local) y domicilio', 'sede de la capital · tipo de atencion: solo domicilio (sin local)']).join('\n')
    expect(b).toContain('LO QUE SABE EL NEGOCIO'); expect(b).toContain('solo domicilio (sin local)'); expect(b).toMatch(/sin decir quién los dijo/); expect(b).toMatch(/sin nombrar al dueño/)
    expect(b).not.toMatch(/corrección del dueño \(/)
    expect(M.bloqueDelDueno([])).toEqual([]); expect(M.bloqueDelDueno(undefined)).toEqual([])
  })
  it('GREP AGNÓSTICO: ni el módulo ni el constructor nombran un cliente, un lugar o un rubro', () => {
    const prohibidos = /n[aá]ufrago|ol[oó]n\b|santa elena|guayaquil|montañita|p[eé]rez|peniche|restaurante|cevich|encebollado|marisc|surf|\bfoil|cafeter[ií]a|veterinari|cl[ií]nica|hotel|hosteler|gimnasio|inmobiliari/i
    const fuente = readFileSync(join(W, 'plan-primer-nivel-r78.js'), 'utf8') + '\n' + readFileSync(join(W, 'construir-r78.mjs'), 'utf8')
    expect(fuente).not.toMatch(prohibidos)
  })
})

describe('los nodos del flujo', () => {
  it('solo cambian los 3 nodos previstos, más 2 nuevos; las conexiones solo cambian en la guarda y los nuevos', () => {
    const cambian = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name)
    expect(cambian.sort()).toEqual([NODOS.b4, NODOS.vuelta, NODOS.guardar].sort())
    expect(HOY.nodes.length).toBe(ANTES.nodes.length + 2)
    for (const k of Object.keys(ANTES.connections)) if (k !== NODOS.guarda2) expect(JSON.stringify(HOY.connections[k]), k).toBe(JSON.stringify(ANTES.connections[k]))
    expect(HOY.connections[NODOS.guarda2].main[0].map((x) => x.node)).toEqual([NODOS.dueno]); expect(HOY.connections[NODOS.dueno].main[0].map((x) => x.node)).toEqual([NODOS.unir]); expect(HOY.connections[NODOS.unir].main[0].map((x) => x.node)).toEqual([NODOS.b4])
  })
  it('se reconstruye igual desde el respaldo; no se aplica a ciegas ni dos veces', () => {
    expect(JSON.stringify(construirFlujo(ANTES as any))).toBe(JSON.stringify(HOY))
    expect(() => construirFlujo(HOY as any)).toThrow()
    expect(() => cambiarB4('const x = 1')).toThrow(/aparece 0 veces/); expect(() => cambiarVuelta('const x = 1')).toThrow(/aparece 0 veces/)
  })
  it('la lectura del dueño va por la ruta compartida, con la llave por variable de entorno y sin ninguna llave pegada', () => {
    const h = nodo(HOY, NODOS.dueno).parameters
    expect(h.url).toContain('/api/cliente/datos-del-dueno'); expect(JSON.stringify(h)).toContain('$env.INTERNAL_API_KEY'); expect(JSON.stringify(HOY.nodes.filter((n) => [NODOS.dueno, NODOS.unir].includes(n.name)))).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|[0-9a-f]{64}/)
  })

  const FICHA = { id: 'x-1', name: 'Cliente X', country: 'Colombia', industry: 'servicio', config: { spend_cap_usd: 9 } }
  const entrada = (extra: Record<string, unknown>) => ({ ficha: FICHA, manual: { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], typography: ['Lato'] } }, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {}, ...extra })
  const correrB4 = async (e: Record<string, unknown>) => (await new AsyncFunction('$input', String(nodo(HOY, NODOS.b4).parameters.jsCode))({ first: () => ({ json: e }) }))[0].json as Record<string, any>
  it('B4: con datos del dueño el pedido los lleva como hechos, ANTES de las secciones; sin ellos no hay bloque', async () => {
    const con = await correrB4(entrada({ hechos_del_dueno: ['sede de la costa · tipo de atencion: restaurante (local) y domicilio'] }))
    expect(con.pedido).toContain('LO QUE SABE EL NEGOCIO'); expect(con.pedido).toContain('restaurante (local) y domicilio'); expect(con.pedido.indexOf('LO QUE SABE EL NEGOCIO')).toBeLessThan(con.pedido.indexOf('SECCIONES QUE NO PUEDES OMITIR'))
    expect(con.hechos_del_dueno_usados).toBe(1); expect(con.pedido).not.toContain('spend_cap')
    const sin = await correrB4(entrada({}))
    expect(sin.pedido).not.toContain('LO QUE SABE EL NEGOCIO'); expect(sin.hechos_del_dueno_usados).toBe(0)
  })
  const unir = async (base: any, d: any) => {
    const $ = (n: string) => { if (n === NODOS.guarda2) return { first: () => ({ json: base }) }; throw new Error('nodo ' + n) }
    return await new AsyncFunction('$', '$input', String(nodo(HOY, NODOS.unir).parameters.jsCode))($, { first: () => ({ json: d }) })
  }
  it('Unir: pasa el paquete con los hechos; si la lectura FALLA se DETIENE (un error no es «no dijo nada»)', async () => {
    const ok = await unir({ referencia: 'R', material: [1] }, { ok: true, hechos: ['h1'] })
    expect(ok[0].json).toMatchObject({ referencia: 'R', hechos_del_dueno: ['h1'] })
    expect((await unir({ referencia: 'R' }, { ok: true, hechos: [] }))[0].json.hechos_del_dueno).toEqual([])
    await expect(unir({ referencia: 'R' }, { ok: false, error: 'lectura_fallida', detail: 'la base no contestó' })).rejects.toThrow(/PLANEACION_SIN_LECTURA_DE_LO_DEL_DUENO[\s\S]*la base no contestó/)
    await expect(unir({ referencia: 'R' }, {})).rejects.toThrow(/PLANEACION_SIN_LECTURA/)
  })

  async function correrVuelta(respuesta: string) {
    const $ = (n: string) => {
      if (n === 'elegir brazos') return { first: () => ({ json: { descartados: [{ objetivo: 'competidores_precio', motivo: 'el rubro no lo requiere' }] } }) }
      if (n === 'Redactor (B4)') return { first: () => ({ json: { registro_usado: { registro: 'tuteo' }, cliente_id: 'c1', contexto_chequeo: CTX } }) }
      if (n === 'Ficha del cliente') return { first: () => ({ json: { name: 'Cliente' } }) }
      throw new Error('nodo ' + n)
    }
    return (await new AsyncFunction('$input', '$', String(nodo(HOY, NODOS.vuelta).parameters.jsCode))({ first: () => ({ json: { body: { response: respuesta } } }) }, $))[0].json as Record<string, any>
  }
  it('con el plan v2 REAL: el texto del cliente NO lleva la revisión del registro, ni el aviso del chequeo, ni el bloque «Lo que NO se buscó» del sistema; todo eso va al registro interno', async () => {
    const j = await correrVuelta(REAL.split('\n## Revisión del registro')[0])
    expect(j.texto).not.toMatch(/Revisión del registro \(la hace el sistema\)|Revisión del plan \(la hace el sistema\)|lo declara el sistema, no el redactor/)
    expect(j.texto.match(/Lo que NO se buscó y por qué/gi)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(j.registro_interno).toBeTruthy(); expect(j.registro_interno.no_se_busco_del_sistema).toMatch(/Lo que NO se buscó y por qué/); expect(j.registro_interno.aviso_del_chequeo).toMatch(/Revisión del plan/)
    expect(j.chequeo_del_plan.marcas.map((m: any) => m.codigo)).toEqual(expect.arrayContaining(['P4', 'P7']))
  })
  it('si la vuelta no llegó: sin registro interno y el motivo dicho', async () => {
    const j = await correrVuelta('')
    expect(j.llego_la_vuelta).toBe(false); expect(j.registro_interno).toBeNull()
  })
  it('«Guardar el plan» guarda el registro interno junto al plan', () => {
    expect(nodo(HOY, NODOS.guardar).parameters.jsonBody).toContain('registro_interno: $json.registro_interno || null')
  })
  it('falso positivo del voseo: «escríbenos», «llámanos», «cuéntanos» son tuteo; el voseo real SÍ se marca', async () => {
    const plan = 'Escríbenos por WhatsApp y llámanos si prefieres. Cuéntanos qué necesitas y dímelo cuando quieras.\nPedime la lista y mirá el menú.'
    const j = await correrVuelta(plan)
    const restantes: string[] = j.registro_revisado?.restantes ?? []
    for (const f of ['escríbenos', 'llámanos', 'cuéntanos']) expect(restantes.join(' ').toLowerCase(), f).not.toContain(f)
    expect(j.registro_revisado.corregidas + restantes.length).toBeGreaterThan(0) // el voseo real («pedime», «mirá») se corrigió o se marcó
  })
})
