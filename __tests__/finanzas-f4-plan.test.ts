/**
 * OFICINA FINANCIERA · F4 · el bloque financiero en el flujo del plan (CC#1 · 14-oct) · diseño v2 rev. 8 §5.
 * Se prueba con el código REAL de los nodos (`Redactor (B4)` y `¿Llegó la vuelta?`) sobre el flujo vivo respaldado, sin red, sin modelo, US$ 0:
 *  · APAGADO = IDÉNTICO A HOY: sin `finanzas_id` (o con una respuesta que no es un bloque firmado) la salida de B4 es la misma, byte por byte;
 *  · estructura: solo cambian B4 y «¿Llegó la vuelta?» (por el módulo común) y se suman 3 nodos; los enlaces cambian solo en «Unir lo del dueño al paquete»;
 *  · con un bloque FIRMADO el pedido lo trae y el contexto del chequeo lleva `finanzas`; P8/P9 marcan una cifra que no es la firmada o un supuesto sin declarar;
 *  · P1–P7 no cambian; el plan NUNCA se bloquea (solo marcas).
 */
import { describe, expect, it } from 'vitest'
import { antesDeF4, cambiarB4, cambiarVuelta, enganchaFinanzas, FIN, moduloConFinanzas, NODOS, NOMBRES_NUEVOS } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { MODULO_R81 } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r81.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const antes = antesDeF4() as Flujo
const despues = enganchaFinanzas(antes) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(moduloConFinanzas() + '\nreturn { revisarPlan, revisarCifrasFinanzas, lineasDeFinanzas }')() as Record<string, (...a: any[]) => any>
const M0 = new Function(MODULO_R81 + '\nreturn { revisarPlan }')() as Record<string, (...a: any[]) => any>

const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], typography: ['Lato'] } }
const clientes = [
  { nombre: 'Consultora Alfa', rubro: 'consultoría', pais: 'Colombia' },
  { nombre: 'Tienda Beta', rubro: 'comercio', pais: 'México' },
  { nombre: 'Estudio Gamma', rubro: 'reservas', pais: 'España' },
]
const entradaDe = (c: (typeof clientes)[number]) => ({
  ficha: { id: 'x-1', name: c.nombre, country: c.pais, industry: c.rubro, config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {},
  hechos_del_dueno: ['Atiende por cita previa.'],
})
const b4 = async (flujo: Flujo, ent: Record<string, unknown>, nodoFin?: Record<string, unknown>) => {
  const dolar = (n: string) => { if (n === FIN.leer && nodoFin) return { first: () => ({ json: nodoFin }) }; throw new Error(`Node '${n}' hasn't been executed`) }
  const f = new AsyncFunction('$input', '$', String(nodo(flujo, NODOS.b4).parameters.jsCode))
  return (await f({ first: () => ({ json: ent }) }, dolar))[0].json as Record<string, any>
}

const NUMEROS = [
  { clave: 'meta_por_semana', valor: 15, minimo: null, maximo: null, tipo: 'dato' },
  { clave: 'costo_por_resultado_arranque', valor: 1.04, minimo: 0.48, maximo: 1.68, tipo: 'supuesto' },
  { clave: 'pauta_rendimiento_semana', valor: 52, minimo: 24, maximo: 84, tipo: 'supuesto' },
  { clave: 'pauta_rendimiento_mes', valor: 225.33, minimo: null, maximo: null, tipo: 'supuesto' },
  { clave: 'total_mes', valor: 375.56, minimo: null, maximo: null, tipo: 'supuesto' },
  { clave: 'produccion_mes', valor: 93.89, minimo: null, maximo: null, tipo: 'dato' },
  { clave: 'techo_por_resultado', valor: 0.73, minimo: null, maximo: null, tipo: 'supuesto' },
]
const FIRMADO = {
  statusCode: 200,
  body: {
    finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', estado: 'firmado', huella: 'abc', numeros: NUMEROS, semanas: 12,
    resumen: { lineas: ['Meta: 15 ventas por semana.', 'Costo por resultado esperado al arrancar: 1,04 (supuesto).', 'Reparto del mes (375,56 en total): Meta+Instagram 281,67, producción de contenido 93,89 (monto fijo).'], alertas: ['dilución: con 10,4 diarios no se llega al mínimo'] },
  },
}

describe('estructura', () => {
  it('solo cambian «Redactor (B4)» y «¿Llegó la vuelta?»; se suman exactamente 3 nodos con nombres únicos', () => {
    const a = new Map(antes.nodes.map((n) => [n.name, JSON.stringify(n)]))
    const cambiados = despues.nodes.filter((n) => a.has(n.name) && a.get(n.name) !== JSON.stringify(n)).map((n) => n.name).sort()
    expect(cambiados).toEqual([NODOS.b4, NODOS.vuelta].sort())
    expect(despues.nodes.filter((n) => !a.has(n.name)).map((n) => n.name).sort()).toEqual([...NOMBRES_NUEVOS].sort())
    expect(new Set(despues.nodes.map((n) => n.name)).size).toBe(despues.nodes.length)
    expect(despues.nodes.length).toBe(antes.nodes.length + 3)
  })
  it('los enlaces cambian SOLO en «Unir lo del dueño al paquete» y en los nodos nuevos', () => {
    for (const [de, v] of Object.entries(antes.connections)) {
      if (de === NODOS.unir) continue
      expect(JSON.stringify(despues.connections[de])).toBe(JSON.stringify(v))
    }
    expect(despues.connections[NODOS.unir].main[0]).toEqual([{ node: FIN.si, type: 'main', index: 0 }])
    expect(despues.connections[FIN.si].main[0].map((x) => x.node)).toEqual([FIN.leer])
    expect(despues.connections[FIN.si].main[1].map((x) => x.node)).toEqual([NODOS.b4])
    expect(despues.connections[FIN.leer].main[0].map((x) => x.node)).toEqual([FIN.devolver])
    expect(despues.connections[FIN.devolver].main[0].map((x) => x.node)).toEqual([NODOS.b4])
  })
  it('el nodo de lectura usa la llave INTERNA (variable de entorno, nunca un valor escrito) y nunca la de despacho', () => {
    const h = nodo(despues, FIN.leer)
    const texto = JSON.stringify(h.parameters)
    expect(texto).toContain('$env.INTERNAL_API_KEY')
    expect(texto).not.toContain('SALA_DISPATCH_KEY')
    expect(texto).not.toMatch(/x-sala-dispatch-key/i)
    expect(h.onError).toBe('continueRegularOutput')
    expect(h.parameters.options.response.response.neverError).toBe(true)
    expect(h.parameters.options.timeout).toBeLessThanOrEqual(60000)
  })
  it('el módulo común conserva P1–P7 TAL CUAL y suma P8/P9 en los dos nodos; el constructor se detiene si el flujo cambió', () => {
    for (const n of [NODOS.b4, NODOS.vuelta]) {
      const c = String(nodo(despues, n).parameters.jsCode)
      expect(c).toContain('function revisarCifrasFinanzas(')
      expect(c).toContain('if (ctx && ctx.finanzas)')
    }
    expect(() => enganchaFinanzas(JSON.parse(JSON.stringify(despues)))).toThrow(/ya tiene/)
    const roto = JSON.parse(JSON.stringify(antes)) as Flujo
    roto.connections[NODOS.unir].main[0] = []
    expect(() => enganchaFinanzas(roto)).toThrow(/ya no va directo/)
    expect(() => cambiarB4('nada que ver')).toThrow(/se esperaba 1 aparición/)
    expect(() => cambiarVuelta('nada que ver')).toThrow(/se esperaba 1 aparición/)
  })
})

describe('APAGADO = IDÉNTICO A HOY (B4 con el código real)', () => {
  it.each(clientes)('$nombre: sin bloque la salida de B4 es la MISMA, campo por campo', async (c) => {
    const a = await b4(antes, entradaDe(c))
    const d = await b4(despues, entradaDe(c))
    expect(JSON.stringify(d)).toBe(JSON.stringify(a))
    expect(d.finanzas_id_usado).toBeUndefined()
    expect(d.contexto_chequeo.finanzas).toBeUndefined()
  })
  it.each([
    ['la ruta contestó 409 (apagada)', { statusCode: 409, body: { error: 'finanzas_apagada' } }],
    ['la ruta contestó 404', { statusCode: 404, body: { error: 'tablero_inexistente' } }],
    ['el tablero no está firmado', { statusCode: 200, body: { ...FIRMADO.body, estado: 'borrador' } }],
    ['sin números', { statusCode: 200, body: { ...FIRMADO.body, numeros: [] } }],
    ['sin resumen', { statusCode: 200, body: { ...FIRMADO.body, resumen: undefined } }],
    ['cuerpo ilegible', { statusCode: 200, body: 'no es json' }],
    ['la llamada falló', {}],
  ])('%s: el pedido sigue idéntico (el bloque NO entra)', async (_n, resp) => {
    const a = await b4(antes, entradaDe(clientes[0]))
    const d = await b4(despues, entradaDe(clientes[0]), resp as Record<string, unknown>)
    expect(JSON.stringify(d)).toBe(JSON.stringify(a))
  })
})

describe('con un bloque FIRMADO', () => {
  it('el pedido lleva los números (en lenguaje llano), el aviso, y la marca de qué bloque se usó', async () => {
    const a = await b4(antes, entradaDe(clientes[0]))
    const d = await b4(despues, entradaDe(clientes[0]), FIRMADO)
    expect(d.pedido.length).toBeGreaterThan(a.pedido.length)
    expect(d.pedido).toContain('NÚMEROS DE LA OFICINA FINANCIERA (firmados)')
    expect(d.pedido).toContain('Meta: 15 ventas por semana.')
    expect(d.pedido).toContain('dilución: con 10,4 diarios no se llega al mínimo')
    expect(d.pedido).toContain('Todo número marcado «supuesto» se escribe como estimación o rango')
    expect(d.finanzas_id_usado).toBe(FIRMADO.body.finanzas_id)
    expect(d.contexto_chequeo.finanzas).toEqual({ numeros: NUMEROS, semanas: 12 })
    // el resto del pedido es el mismo: quitando el bloque, queda lo de hoy
    const sinBloque = d.pedido.replace(/══════ NÚMEROS DE LA OFICINA FINANCIERA[\s\S]*?\n\n/, '')
    expect(sinBloque).toBe(a.pedido)
  })
  it('el bloque entra ANTES del cierre del documento de referencia y sin jerga interna', async () => {
    const d = await b4(despues, entradaDe(clientes[1]), FIRMADO)
    expect(d.pedido.indexOf('NÚMEROS DE LA OFICINA FINANCIERA')).toBeLessThan(d.pedido.indexOf('FIN DEL DOCUMENTO DE REFERENCIA'))
    const bloque = d.pedido.slice(d.pedido.indexOf('NÚMEROS DE LA OFICINA FINANCIERA'), d.pedido.indexOf('FIN DEL DOCUMENTO DE REFERENCIA'))
    for (const jerga of ['finanzas_', 'dry_run', 'huella', 'workflow', 'endpoint', 'json']) expect(bloque.toLowerCase()).not.toContain(jerga)
  })
})

describe('P8 · cifras_firmadas y P9 · supuestos_declarados (módulo común)', () => {
  const FIN_CTX = { numeros: NUMEROS, semanas: 12 }
  const PLAN_BIEN = [
    '# Plan', '## 7 · El presupuesto',
    'Inversión de pauta: 225,33 USD al mes (52 USD por semana), un estimado según el rango de referencia.',
    'Producción de contenido: 93,89 USD al mes. Total del mes: 375,56 USD.',
    'Costo por resultado esperado: 1,04 USD (supuesto, entre 0,48 y 1,68).',
    '## 8 · La regla de revisión', 'Sin cifras aquí: 4.000 USD no deben marcarse.',
  ].join('\n')
  it('un plan con las cifras firmadas (y las derivadas permitidas) y los supuestos declarados: sin P8 ni P9', () => {
    const r = M.revisarCifrasFinanzas(PLAN_BIEN, FIN_CTX)
    expect(r).toEqual([])
  })
  it('una derivada permitida: total ÷ semanas y suma de partes no marcan', () => {
    const t = '# Plan\n## Presupuesto\nPor semana: 31,3 USD (el total del mes entre 12 semanas, estimado). Producción más pauta: 319,22 USD (estimado).'
    // 375,56 ÷ 12 = 31,30 · 225,33 + 93,89 = 319,22
    expect(M.revisarCifrasFinanzas(t, FIN_CTX).map((m: any) => m.codigo)).not.toContain('P8')
  })
  it('derivada permitida con SOLO dos números firmados: la suma de las partes no marca y una suma equivocada sí', () => {
    const dos = { numeros: [{ clave: 'pauta_rendimiento_mes', valor: 100, minimo: null, maximo: null, tipo: 'dato' }, { clave: 'produccion_mes', valor: 40, minimo: null, maximo: null, tipo: 'dato' }], semanas: 12 }
    const bien = ['# Plan', '## Presupuesto', 'Pauta 100 USD, producción 40 USD, total 140 USD.'].join('\n')
    expect(M.revisarCifrasFinanzas(bien, dos)).toEqual([])
    expect(M.revisarCifrasFinanzas(bien.replace('140 USD', '171 USD'), dos).map((m: any) => m.codigo)).toContain('P8')
  })
  it('P8: una cifra del presupuesto que NO es la firmada marca, con el ejemplo', () => {
    const t = PLAN_BIEN.replace('225,33 USD', '980 USD')
    const r = M.revisarCifrasFinanzas(t, FIN_CTX)
    expect(r.map((m: any) => m.codigo)).toContain('P8')
    expect(r.find((m: any) => m.codigo === 'P8').ejemplos.join(' ')).toContain('980')
  })
  it('P8 no mira fuera de la sección de presupuesto', () => {
    const t = '# Plan\n## Oferta\nCuesta 4.000 USD.\n## El presupuesto\nTotal: 375,56 USD.'
    expect(M.revisarCifrasFinanzas(t, FIN_CTX).map((m: any) => m.codigo)).not.toContain('P8')
    expect(M.revisarCifrasFinanzas(t.replace('Total:', 'Total estimado:'), FIN_CTX)).toEqual([])
  })
  it('P9: un supuesto presentado como dato (sin palabra que lo declare) marca', () => {
    const t = '# Plan\n## 7 · El presupuesto\nCada resultado cuesta exactamente 1,04 USD en la campaña.'
    const r = M.revisarCifrasFinanzas(t, FIN_CTX)
    expect(r.map((m: any) => m.codigo)).toContain('P9')
  })
  it('P9: el mismo supuesto con «estimado», «supuesto» o «rango» al lado NO marca', () => {
    for (const w of ['Cada resultado cuesta unos 1,04 USD (estimado).', 'Costo por resultado (supuesto): 1,04 USD.', 'Dentro del rango de referencia, 1,04 USD por resultado.']) {
      expect(M.revisarCifrasFinanzas('# Plan\n## Presupuesto\n' + w, FIN_CTX).map((m: any) => m.codigo), w).not.toContain('P9')
    }
  })
  it('sin bloque (o con un bloque sin números) no marca nada: P8/P9 solo existen con `finanzas`', () => {
    expect(M.revisarCifrasFinanzas(PLAN_BIEN.replace('225,33', '9999'), null)).toEqual([])
    expect(M.revisarCifrasFinanzas(PLAN_BIEN, { numeros: [] })).toEqual([])
  })
  it('revisarPlan: SIN `ctx.finanzas` es EXACTAMENTE el de hoy; CON él suma P8/P9 y el plan sigue (solo marcas)', () => {
    const ctx0 = { identidad: { colores: [], tipografias: [] }, moneda: { codigo: null } }
    const t = PLAN_BIEN.replace('225,33 USD', '980 USD')
    expect(JSON.stringify(M.revisarPlan(t, ctx0))).toBe(JSON.stringify(M0.revisarPlan(t, ctx0)))
    const con = M.revisarPlan(t, { ...ctx0, finanzas: FIN_CTX })
    expect(con.marcas.map((m: any) => m.codigo)).toContain('P8')
    expect(con.ok).toBe(false)
    // las marcas de siempre siguen donde estaban
    const base = M0.revisarPlan(t, ctx0).marcas.map((m: any) => m.codigo)
    for (const k of base) expect(con.marcas.map((m: any) => m.codigo)).toContain(k)
  })
  it('lineasDeFinanzas: sin bloque, vacío; con bloque, encabezado + líneas + avisos', () => {
    expect(M.lineasDeFinanzas(null)).toEqual([])
    expect(M.lineasDeFinanzas({ estado: 'borrador', numeros: NUMEROS, resumen: FIRMADO.body.resumen })[0]).toContain('sin firma')
    expect(M.lineasDeFinanzas({ numeros: NUMEROS })).toEqual([])
    const l = M.lineasDeFinanzas({ estado: 'firmado', numeros: NUMEROS, resumen: FIRMADO.body.resumen })
    expect(l[0]).toContain('firmados')
    expect(l.some((x: string) => x.startsWith('- Meta: 15'))).toBe(true)
  })
})

describe('el flujo completo del enganche (con el n8n en miniatura)', () => {
  const stubsOriginales = (f: Flujo) => Object.fromEntries(f.nodes.filter((n) => n.name !== FIN.si && n.name !== FIN.leer && n.name !== FIN.devolver && (n.type === 'n8n-nodes-base.code' || n.type === 'n8n-nodes-base.httpRequest')).map((n) => [n.name, (items: any[]) => [{ json: { _nodo: n.name, _recibio: items.map((i) => i.json) } }]]))
  const unir = [{ json: { paquete: 'x', ficha: { id: 'x-1' } } }]
  const previos = { 'Webhook · planeacion': { body: { client_id: 'x-1', dry_run: true } } }
  it('sin finanzas_id: va DIRECTO a B4 (la rama falso) y no se llama a ninguna ruta de finanzas', async () => {
    const r = await correr(despues, { inicio: NODOS.unir, itemsDeInicio: unir, previos, stubs: stubsOriginales(despues), http: {}, env: { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid' } })
    expect(r.nombres.slice(0, 2)).toEqual([FIN.si, NODOS.b4])
    expect(r.llamadasHttp.filter((l: any) => String(l.url).includes('finanzas'))).toEqual([])
  })
  it('con finanzas_id: lee el bloque con la llave interna, devuelve el paquete ORIGINAL a B4', async () => {
    const p = { 'Webhook · planeacion': { body: { client_id: 'x-1', dry_run: true, finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10' } } }
    const r = await correr(despues, {
      inicio: NODOS.unir, itemsDeInicio: unir, previos: p, stubs: stubsOriginales(despues), env: { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'llave-de-prueba' },
      http: { [FIN.leer]: () => FIRMADO },
    })
    expect(r.nombres.slice(0, 4)).toEqual([FIN.si, FIN.leer, FIN.devolver, NODOS.b4])
    const l = r.llamadasHttp.find((x: any) => x.nodo === FIN.leer)!
    expect(l.url).toBe('https://api.ejemplo.invalid/api/finanzas/tablero')
    expect(l.cuerpo).toEqual({ accion: 'leer', finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', client_id: 'x-1' })
    expect(l.cabeceras['x-api-key']).toBe('llave-de-prueba')
    const entradaB4 = r.visitas.find((v: any) => v.nodo === NODOS.b4)!.entrada[0]
    expect(entradaB4).toEqual(unir[0].json)
  })
})
