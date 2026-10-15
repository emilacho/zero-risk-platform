/**
 * PLAN v3 · LA CONEXIÓN EN EL FLUJO (CC#1 · 15-oct) · US$ 0: n8n en miniatura con el código REAL de los nodos y la ruta REAL `armarDatoV1` sobre una base en memoria.
 *  · APAGADO = IDÉNTICO: sin `plan_v3`/`corrida`/`client_id` (o con la ruta caída) la salida de B4 es la de hoy, byte por byte;
 *  · con `plan_v3`: el pedido lleva la TABLA dato.v1 con citas, el contexto del chequeo lleva los datos, la oficina recibe la semilla compacta, P10 marca (nunca bloquea);
 *  · estructura: +4 nodos, solo cambian B4, «¿Llegó la vuelta?» y «FIN · armar la semilla».
 */
import { describe, expect, it } from 'vitest'
import { antesDeLaConexion, conectaPlanV3, moduloConP10, NODOS, NOMBRES_NUEVOS, PV } from '../scripts/worker-staging/planeacion-v3-conexion/construir-conexion.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'
import { moduloConFinanzas } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { MODULO_R81 } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r81.mjs'
import { fichasOroPiloto, FILAS, PLAN_V2_TRAMPA, planQueCita } from '../scripts/ops/plan-v3-seco/corredor'
import { armarDatoV1 } from '../src/lib/planeacion/dato-v1/armar'

type Json = Record<string, any>
const antes = antesDeLaConexion() as Json
const despues = conectaPlanV3(antes) as Json
const ID = 'cliente-practica-1'

// ───────────────────────── una base en memoria (cualquier cadena de consulta termina en `{ data, error }`)
function baseEnMemoria(o: { falta?: string; error?: string; fichas?: unknown[]; cliente?: Json | null } = {}) {
  const tablas: Record<string, unknown[]> = {
    plan_catalogo_fuentes: FILAS.fuentes, plan_catalogo_tipos: FILAS.tipos, plan_catalogo_reglas: FILAS.reglas, plan_catalogo_lexico: FILAS.lexico, plan_catalogo_topes: FILAS.topes,
    cerebro_fichas: o.fichas ?? fichasOroPiloto(),
    clients: o.cliente === null ? [] : [o.cliente ?? { id: ID, name: 'Negocio de práctica', website_url: 'https://practica.test', industry: 'restaurante', country: 'Ecuador', config: {}, canonical_client_id: null }],
    client_sedes: [], apify_raw: [],
  }
  return {
    from(t: string) {
      const q: any = new Proxy({}, {
        get: (_o, k) => {
          if (k === 'then') return (res: (v: unknown) => void) => res(
            o.falta === t ? { data: null, error: { message: `relation "${t}" does not exist`, code: '42P01' } }
            : o.error === t ? { data: null, error: { message: 'boom' } } : { data: tablas[t] ?? [], error: null })
          return () => q
        },
      })
      return q
    },
  }
}

const MANUAL = { client_id: ID, manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], tone: 'cercano' } }
const paquete = { ficha: { id: ID, name: 'Negocio de práctica', country: 'Ecuador', industry: 'restaurante', config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {}, hechos_del_dueno: ['Atiende por cita previa.'] }

/** corre el flujo desde «Unir…» con B4 y los nodos FIN/PV3 REALES; todo lo demás, pasa-todo */
async function ejecutar(flujo: Json, body: Json, o: { db?: ReturnType<typeof baseEnMemoria>; v9?: Json; oficina?: 'apagada' } = {}) {
  const real = (n: string) => n === NODOS.b4 || n.startsWith('FIN · ') || NOMBRES_NUEVOS.includes(n) || n === 'Webhook · planeacion'
  const stubs = Object.fromEntries(flujo.nodes.filter((n: Json) => !real(n.name)).map((n: Json) => [n.name, (items: unknown[]) => items]))
  const db = o.db ?? baseEnMemoria()
  const http: Record<string, (c: Json) => Promise<Json> | Json> = {
    [PV.dato]: async (c) => {
      const r = await armarDatoV1(db as never, c as never, new Date('2026-10-15T15:00:00Z'))
      return { statusCode: r.ok ? 200 : r.error === 'catalogo_no_aplicado' ? 503 : r.error === 'lectura_fallida' ? 502 : 400, body: r }
    },
    'FIN · abrir la conversación': () => ({ statusCode: 409, body: { error: 'conversa_apagada' } }),
    'FIN · leer el bloque': () => ({ statusCode: 404, body: { error: 'tablero_inexistente' } }),
  }
  const previos: Json = { 'Webhook · planeacion': { body } }
  if (o.v9) previos['V9 · decidir'] = o.v9
  const r = await correr(flujo, { inicio: NODOS.unir, itemsDeInicio: [{ json: paquete }], previos, stubs, http, env: { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'llave-de-prueba' }, maxPasos: 400 })
  const b4 = r.visitas.find((v: Json) => v.nodo === NODOS.b4)
  return { r, b4: b4?.salida?.[0] as Json | undefined, llamadas: r.llamadasHttp as Json[] }
}
const SOBRE = { plan_v3: true, corrida: 'corrida-1', client_id: ID, dry_run: false }

describe('estructura', () => {
  it('84 nodos: +4 `PV3 ·`; solo cambian B4, «¿Llegó la vuelta?» y «FIN · armar la semilla»', () => {
    expect(antes.nodes.length).toBe(80)
    expect(despues.nodes.length).toBe(84)
    const a = new Map(antes.nodes.map((n: Json) => [n.name, JSON.stringify(n)]))
    const cambiados = despues.nodes.filter((n: Json) => a.has(n.name) && a.get(n.name) !== JSON.stringify(n)).map((n: Json) => n.name).sort()
    expect(cambiados).toEqual([NODOS.b4, NODOS.vuelta, NODOS.armarOficina].sort())
    expect(despues.nodes.filter((n: Json) => !a.has(n.name)).map((n: Json) => n.name).sort()).toEqual([...NOMBRES_NUEVOS].sort())
    expect(new Set(despues.nodes.map((n: Json) => n.name)).size).toBe(84)
  })
  it('los enlaces cambian SOLO en «Unir…» y en los nodos nuevos', () => {
    for (const [de, v] of Object.entries(antes.connections)) { if (de !== NODOS.unir) expect(JSON.stringify(despues.connections[de]), de).toBe(JSON.stringify(v)) }
    expect(despues.connections[NODOS.unir].main[0]).toEqual([{ node: PV.si, type: 'main', index: 0 }])
    expect(despues.connections[PV.si].main[1].map((x: Json) => x.node)).toEqual([NODOS.abreOficina])
    expect(despues.connections[PV.paquete].main[0].map((x: Json) => x.node)).toEqual([NODOS.abreOficina])
  })
  it('el nodo de la ruta usa la llave INTERNA por $env y nunca la de despacho', () => {
    const n = despues.nodes.find((x: Json) => x.name === PV.dato)
    const t = JSON.stringify(n.parameters)
    expect(t).toContain('$env.INTERNAL_API_KEY')
    expect(t).not.toContain('SALA_DISPATCH_KEY')
    expect(n.onError).toBe('continueRegularOutput')
  })
  it('el constructor se detiene si el flujo cambió', () => {
    const roto = JSON.parse(JSON.stringify(antes))
    roto.connections[NODOS.unir].main[0] = []
    expect(() => conectaPlanV3(roto)).toThrow(/ya no va directo/)
    expect(() => conectaPlanV3(despues)).toThrow(/ya tiene/)
  })
})

describe('APAGADO = IDÉNTICO a hoy (byte por byte)', () => {
  it.each([
    ['sin plan_v3', { client_id: ID, dry_run: false }],
    ['plan_v3 falso', { plan_v3: false, corrida: 'c', client_id: ID }],
    ['plan_v3 sin corrida', { plan_v3: true, client_id: ID }],
    ['plan_v3 sin client_id', { plan_v3: true, corrida: 'c' }],
    ['plan_v3 como texto', { plan_v3: 'true', corrida: 'c', client_id: ID }],
  ])('%s: B4 sale igual y la ruta del dato ni se llama', async (_n, body) => {
    const hoy = await ejecutar(antes, body)
    const ahora = await ejecutar(despues, body)
    expect(hoy.b4).toBeTruthy()
    expect(JSON.stringify(ahora.b4)).toBe(JSON.stringify(hoy.b4))
    expect(ahora.llamadas.some((l) => String(l.url).includes('/api/planeacion/dato'))).toBe(false)
  })
  it.each([
    ['catálogo sin aplicar (503)', baseEnMemoria({ falta: 'plan_catalogo_fuentes' })],
    ['la lectura de las fichas falla (502)', baseEnMemoria({ error: 'cerebro_fichas' })],
    ['la ficha del cliente no existe', baseEnMemoria({ cliente: null })],
  ])('con plan_v3 pero %s: el plan v3 NO se activa y B4 sale como hoy', async (_n, db) => {
    const hoy = await ejecutar(antes, SOBRE)
    const ahora = await ejecutar(despues, SOBRE, { db })
    expect(ahora.llamadas.some((l) => String(l.url).includes('/api/planeacion/dato'))).toBe(true)
    // lo único que difiere es la marca de que se intentó (ninguna): B4 igual
    expect(JSON.stringify(ahora.b4)).toBe(JSON.stringify(hoy.b4))
    expect(ahora.b4!.plan_v3_usado).toBeUndefined()
  })
})

describe('con plan_v3: el dato v1 llega al redactor, al chequeo y a la oficina', () => {
  it('el pedido lleva la TABLA dato.v1 con citas [D#], el contexto lleva los datos y la marca de qué se usó', async () => {
    const hoy = await ejecutar(antes, SOBRE)
    const { b4, llamadas } = await ejecutar(despues, SOBRE, { v9: { relleno_permitido: false, huecos_tipos: [] } })
    expect(b4!.pedido).toContain('TABLA DE DATOS dato.v1')
    expect(b4!.pedido).toContain('[D#]')
    expect(b4!.pedido).toMatch(/^D\d+ \| /m)
    expect(b4!.pedido.length).toBeGreaterThan(hoy.b4!.pedido.length)
    // el pedido de hoy sigue entero ahí dentro (las líneas v3 se SUMAN antes del cierre del documento)
    expect(b4!.pedido.startsWith(hoy.b4!.pedido.split('══════ FIN DEL DOCUMENTO DE REFERENCIA ══════')[0])).toBe(true)
    expect(b4!.plan_v3_usado.datos).toBeGreaterThan(0)
    expect(b4!.plan_v3_usado.catalogo_huella).toMatch(/^[0-9a-f]{16,}$/)
    expect(b4!.contexto_chequeo.plan_v3.datos.length).toBe(b4!.plan_v3_usado.datos)
    expect(b4!.contexto_chequeo.plan_v3.op.lexico.verificacion.length).toBeGreaterThan(0)
    // la ruta recibió el cliente y NO mandó `dry_run` inventado: el sobre lo traía en false
    const c = llamadas.find((l) => String(l.url).endsWith('/api/planeacion/dato'))!
    expect(c.cuerpo).toMatchObject({ client_id: ID, dry_run: false, relleno_permitido: false })
    expect(c.cabeceras['x-api-key']).toBe('llave-de-prueba')
  })
  it('dry_run:true ⇒ encabezado «BORRADOR DE ENSAYO» y TODO el dato es de ensayo', async () => {
    const { b4 } = await ejecutar(despues, { ...SOBRE, dry_run: true })
    expect(b4!.pedido).toContain('BORRADOR DE ENSAYO')
    expect(b4!.contexto_chequeo.plan_v3.datos.every((d: Json) => d.origen === 'de_ensayo')).toBe(true)
  })
  it('dry_run AUSENTE en el sobre ⇒ la ruta no lo recibe (ausente = real, como la sala): nada de ensayo', async () => {
    const { b4, llamadas } = await ejecutar(despues, { plan_v3: true, corrida: 'c', client_id: ID })
    const c = llamadas.find((l) => String(l.url).endsWith('/api/planeacion/dato'))!
    expect('dry_run' in c.cuerpo).toBe(false)
    expect(b4!.pedido).not.toContain('BORRADOR DE ENSAYO')
  })
  it('la oficina (si se abre) recibe la semilla COMPACTA con procedencia', async () => {
    const { llamadas } = await ejecutar(despues, SOBRE)
    const abrir = llamadas.find((l) => l.nodo === 'FIN · abrir la conversación')!
    expect(Array.isArray(abrir.cuerpo.semilla.datos)).toBe(true)
    expect(abrir.cuerpo.semilla.datos.length).toBeGreaterThan(0)
    expect(abrir.cuerpo.semilla.datos.every((d: Json) => typeof d.id === 'string' && typeof d.procedencia === 'string')).toBe(true)
    expect(JSON.stringify(abrir.cuerpo.semilla).length).toBeLessThan(40_000)
    expect(typeof abrir.cuerpo.semilla.datos_omitidos).toBe('number')
  })
  it('sin el dato v1, la oficina recibe lo de hoy (sin `datos`)', async () => {
    const { llamadas } = await ejecutar(despues, SOBRE, { db: baseEnMemoria({ falta: 'plan_catalogo_tipos' }) })
    const abrir = llamadas.find((l) => l.nodo === 'FIN · abrir la conversación')!
    expect(abrir.cuerpo.semilla.datos).toBeUndefined()
  })
})

describe('P10 dentro de revisarPlan (marca, nunca bloquea; sin plan_v3 = hoy)', () => {
  const base = moduloConFinanzas()
  const conP10 = new Function(moduloConP10(base) + '\nreturn { revisarPlan }')() as { revisarPlan: (t: string, c: unknown) => Json }
  const sinP10 = new Function(base + '\nreturn { revisarPlan }')() as { revisarPlan: (t: string, c: unknown) => Json }
  it('sin `plan_v3` en el contexto la salida es la de F4, igual', () => {
    for (const t of ['# Plan\n\nTiene 9999 seguidores y 1234 pedidos.', MODULO_R81.length ? '# Plan\n\n## 7 · El presupuesto\nUS$ 300 al mes.' : '']) {
      expect(JSON.stringify(conP10.revisarPlan(t, { identidad: { colores: [], tipografias: [] }, moneda: { codigo: 'USD' } }))).toBe(JSON.stringify(sinP10.revisarPlan(t, { identidad: { colores: [], tipografias: [] }, moneda: { codigo: 'USD' } })))
    }
  })
  it('con la tabla: un plan que cita no marca alto; una cifra inventada marca; las leves no marcan (van en avisos_p10)', async () => {
    const { b4 } = await ejecutar(despues, SOBRE)
    const ctx = b4!.contexto_chequeo
    const datos = ctx.plan_v3.datos
    const limpio = conP10.revisarPlan(planQueCita(datos), ctx)
    expect(limpio.marcas.filter((m: Json) => /^P10/.test(m.codigo))).toEqual([])
    const malo = conP10.revisarPlan(PLAN_V2_TRAMPA, ctx)
    expect(malo.marcas.some((m: Json) => /^P10/.test(m.codigo))).toBe(true)
    expect(malo.ok).toBe(false)
    // nunca revienta con un contexto raro
    expect(() => conP10.revisarPlan('texto', { plan_v3: { datos: 'no es lista' } })).not.toThrow()
    expect(() => conP10.revisarPlan('texto', { plan_v3: { datos: [{}], op: null } })).not.toThrow()
  })
})

describe('la ruta armarDatoV1 (lecturas, US$ 0)', () => {
  const ahora = new Date('2026-10-15T15:00:00Z')
  it('entrada: client_id obligatorio; dry_run solo booleano (ausente = real)', async () => {
    expect((await armarDatoV1(baseEnMemoria() as never, { client_id: '' }, ahora))).toMatchObject({ ok: false, error: 'entrada_invalida' })
    expect((await armarDatoV1(baseEnMemoria() as never, { client_id: ID, dry_run: 'true' }, ahora))).toMatchObject({ ok: false, error: 'dry_run_no_booleano' })
    const real = await armarDatoV1(baseEnMemoria() as never, { client_id: ID }, ahora)
    expect(real).toMatchObject({ ok: true, dry_run: false })
    const seco = await armarDatoV1(baseEnMemoria() as never, { client_id: ID, dry_run: true }, ahora)
    expect(seco.ok && seco.datos.every((d) => d.origen === 'de_ensayo')).toBe(true)
  })
  it('falla CERRADO: una lectura que falla no es «no hay nada»', async () => {
    expect(await armarDatoV1(baseEnMemoria({ falta: 'plan_catalogo_fuentes' }) as never, { client_id: ID }, ahora)).toMatchObject({ ok: false, error: 'catalogo_no_aplicado' })
    expect(await armarDatoV1(baseEnMemoria({ error: 'cerebro_fichas' }) as never, { client_id: ID }, ahora)).toMatchObject({ ok: false, error: 'lectura_fallida' })
    expect(await armarDatoV1(baseEnMemoria({ error: 'apify_raw' }) as never, { client_id: ID }, ahora)).toMatchObject({ ok: false, error: 'lectura_fallida' })
    expect(await armarDatoV1(baseEnMemoria({ cliente: null }) as never, { client_id: ID }, ahora)).toMatchObject({ ok: false, error: 'lectura_fallida' })
  })
  it('no sale a Apify ni a un modelo: el relleno es INFORMACIÓN y sin la señal «permitido» no autoriza nada', async () => {
    const sin = await armarDatoV1(baseEnMemoria({ fichas: [] }) as never, { client_id: ID }, ahora)
    expect(sin.ok && sin.relleno_plan.pedidos).toEqual([])
    const con = await armarDatoV1(baseEnMemoria({ fichas: [] }) as never, { client_id: ID, relleno_permitido: true }, ahora)
    expect(con.ok).toBe(true)
    if (con.ok) expect(con.relleno_plan.comprometido_usd).toBeLessThanOrEqual(con.relleno_plan.tope_recoleccion_usd + 1e-9)
  })
})
