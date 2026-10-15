/**
 * PLAN v3 · V9 · los nodos del pre-vuelo y la espera en el flujo de planeación (CC#2 · 15-oct). US$ 0, sin red, sin modelo.
 * Se prueba con el código REAL de los nodos y el n8n en miniatura de F4, sobre el ARREGLADO de F4 v2.1 (63 nodos):
 *  · APAGADO = IDÉNTICO A HOY: sin `plan_v3` el sobre va de «⓪ Llave» a «① Cargar el manual» sin tocar el pre-vuelo; ningún nodo existente cambia;
 *  · correr / correr_con_lo_del_alta siguen; esperar vuelve a preguntar con la MISMA corrida cada 5 min; lo demás NO corre y lo dice;
 *  · FALLA CERRADO: una respuesta ilegible, un 5xx o un 409 con «correr» NUNCA es seguir; la espera tiene tope de vueltas;
 *  · el cierre de la corrida cuelga de los dos finales (plan entregado → hecha · repetida → fallida) y no hace nada si V9 no actuó.
 */
import { describe, expect, it } from 'vitest'
import { antesDeV9, CANAL_ALERTAS, ESPERA_S, MAX_VUELTAS, RAMA_APIFY, enganchaV9, NODOS, NOMBRES_NUEVOS, V9 } from '../scripts/worker-staging/planeacion-v3-v9/construir-v9.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const antes = antesDeV9() as Flujo
const despues = enganchaV9(antes) as Flujo
const CLIENTE = '11111111-2222-4333-8444-555555555555'
const sobre = (extra: Record<string, unknown> = {}) => ({ body: { client_id: CLIENTE, corrida: 'plan-v3-2026-10-15-a', plan_v3: true, _sala_correlation_id: 'corr-1', ...extra } })

/** el flujo cortado en «① Cargar el manual» (lo de después es el plan de siempre y no es de V9) */
const cortado = () => {
  const f = JSON.parse(JSON.stringify(despues)) as Flujo
  f.connections[NODOS.manual] = { main: [[]] }
  return f
}
const CABLE_OK = async () => ({ statusCode: 200, body: { ok: true, event_id: 'ev-1' }, ok: true, event_id: 'ev-1' })
const correrDesdeLaLlave = async (body: Record<string, unknown>, prevuelo: (n: number) => unknown, opciones: { dry?: boolean } = {}) => {
  let n = 0
  const r = await correr(cortado(), {
    inicio: NODOS.llave,
    itemsDeInicio: [{ json: body }],
    previos: { [NODOS.hook]: body },
    http: {
      [V9.prevuelo]: async () => prevuelo(n++) as never,
      [NODOS.manual]: async () => ({}),
      [V9.aviso]: async () => ({ ok: true }),
      [V9.cable]: CABLE_OK,
    },
    env: { INTERNAL_API_KEY: 'k-interna' },
    maxPasos: 500,
  })
  void opciones
  return r
}
const llamadas = (r: { llamadasHttp: Array<{ nodo: string; cuerpo: any; cabeceras: Record<string, string>; url: string }> }, nodo: string) => r.llamadasHttp.filter((l) => l.nodo === nodo)
const resp = (decision: string, extra: Record<string, unknown> = {}, statusCode = 200) => ({ statusCode, body: { decision, motivo: decision, relleno_permitido: false, huecos_tipos: [], declara: [], corrida: 'plan-v3-2026-10-15-a', ...extra } })

describe('estructura', () => {
  it('ningún nodo que ya existía cambia; se suman exactamente 17 (15 del pre-vuelo + 2 del permiso de relleno) con nombres únicos', () => {
    const a = new Map(antes.nodes.map((n) => [n.name, JSON.stringify(n)]))
    expect(despues.nodes.filter((n) => a.has(n.name) && a.get(n.name) !== JSON.stringify(n))).toEqual([])
    expect(antes.nodes.length).toBe(63)
    expect(despues.nodes.length).toBe(antes.nodes.length + NOMBRES_NUEVOS.length)
    expect(NOMBRES_NUEVOS.length).toBe(17)
    expect(new Set(despues.nodes.map((n) => n.name)).size).toBe(despues.nodes.length)
  })
  it('los enlaces que cambian son solo «⓪ Llave» (ahora a «¿pide?»), «elegir brazos» (Apify pasa por el permiso) y una salida más en los dos cables finales', () => {
    const cambios: string[] = []
    for (const [de, v] of Object.entries(despues.connections)) {
      const antesV = JSON.stringify(antes.connections[de] ?? null)
      if (antesV !== JSON.stringify(v) && !NOMBRES_NUEVOS.includes(de)) cambios.push(de)
    }
    expect(cambios.sort()).toEqual([NODOS.cablePlan, NODOS.cableRepetida, NODOS.llave, RAMA_APIFY.elegir].sort())
    const salenDeElegir = despues.connections[RAMA_APIFY.elegir].main[0].map((x) => x.node)
    expect(salenDeElegir).toContain(V9.rellenoSi)
    expect(salenDeElegir).not.toContain(RAMA_APIFY.brazo)
    expect(salenDeElegir).toEqual(antes.connections[RAMA_APIFY.elegir].main[0].map((x) => (x.node === RAMA_APIFY.brazo ? V9.rellenoSi : x.node)))
    expect(despues.connections[NODOS.llave].main[0].map((x) => x.node)).toEqual([V9.pide])
    for (const c of [NODOS.cablePlan, NODOS.cableRepetida]) {
      const viejo = (antes.connections[c]?.main?.[0] ?? []).map((x) => x.node)
      expect(despues.connections[c].main[0].map((x) => x.node)).toEqual([...viejo, V9.armarCierre])
    }
  })
  it('el pre-vuelo y el cierre usan la llave interna y las rutas de V8/V13 (nunca la de despacho)', () => {
    const pv = despues.nodes.find((n) => n.name === V9.prevuelo)!
    const ci = despues.nodes.find((n) => n.name === V9.cerrar)!
    expect(pv.parameters.url).toContain('/api/planeacion/prevuelo')
    expect(ci.parameters.url).toContain('/api/planeacion/corrida')
    const todo = JSON.stringify(NOMBRES_NUEVOS.map((n) => despues.nodes.find((x) => x.name === n)!.parameters))
    expect(todo).toContain('INTERNAL_API_KEY')
    expect(todo).not.toContain('SALA_DISPATCH_KEY')
  })
  it('el flujo no gasta: ninguno de los nodos nuevos llama a Apify ni a un modelo (los dos del permiso solo CIERRAN la rama, no tienen URL)', () => {
    const permiso = [V9.rellenoSi, V9.sinRelleno]
    const todo = JSON.stringify(NOMBRES_NUEVOS.filter((n) => !permiso.includes(n)).map((n) => despues.nodes.find((x) => x.name === n)!.parameters)).toLowerCase()
    for (const p of ['apify', 'run-sdk', '/api/agents', 'anthropic', 'openai']) expect(todo).not.toContain(p)
    for (const n of permiso) {
      const par = despues.nodes.find((x) => x.name === n)!
      expect(par.type).not.toBe('n8n-nodes-base.httpRequest')
      expect(JSON.stringify(par.parameters).toLowerCase()).not.toMatch(/https?:|\/api\//)
    }
  })
})

describe('apagado = idéntico a hoy', () => {
  for (const [que, body] of [
    ['sin plan_v3', { client_id: CLIENTE, corrida: 'c1' }],
    ['plan_v3 en false', { client_id: CLIENTE, corrida: 'c1', plan_v3: false }],
    ['plan_v3 como texto', { client_id: CLIENTE, corrida: 'c1', plan_v3: 'true' }],
    ['sin corrida', { client_id: CLIENTE, plan_v3: true }],
    ['corrida vacía', { client_id: CLIENTE, corrida: '', plan_v3: true }],
    ['sin client_id', { corrida: 'c1', plan_v3: true }],
  ] as const) {
    it(`${que}: va directo a «① Cargar el manual» y no llama al pre-vuelo`, async () => {
      const r = await correrDesdeLaLlave({ body }, () => { throw new Error('no debía llamarse') })
      expect(r.nombres).toEqual([V9.pide, NODOS.manual])
      expect(llamadas(r, V9.prevuelo)).toHaveLength(0)
    })
  }
})

describe('el pre-vuelo decide a dónde sigue', () => {
  it('correr: llama con la corrida y la llave interna, y sigue a «① Cargar el manual» con el sobre ORIGINAL', async () => {
    const r = await correrDesdeLaLlave(sobre(), () => resp('correr', { relleno_permitido: true }))
    expect(r.nombres).toEqual([V9.pide, V9.prevuelo, V9.decidir, V9.seguir, V9.devolver, NODOS.manual])
    const l = llamadas(r, V9.prevuelo)
    expect(l).toHaveLength(1)
    expect(l[0].cuerpo).toEqual({ client_id: CLIENTE, corrida: 'plan-v3-2026-10-15-a' })
    expect(l[0].cabeceras['x-api-key']).toBe('k-interna')
    expect(l[0].url).toBe('https://zero-risk-platform.vercel.app/api/planeacion/prevuelo')
    const dev = r.visitas.find((v) => v.nodo === V9.devolver)!
    expect(dev.salida[0]).toEqual(sobre())
    const dec = r.visitas.find((v) => v.nodo === V9.decidir)!.salida[0] as Record<string, unknown>
    expect(dec).toMatchObject({ ruta: 'seguir', decision: 'correr', relleno_permitido: true })
  })
  it('correr_con_lo_del_alta también sigue y conserva lo que el plan debe declarar', async () => {
    const r = await correrDesdeLaLlave(sobre(), () => resp('correr_con_lo_del_alta', { declara: ['el cerebro no estaba listo a los 45 min'] }))
    expect(r.nombres).toContain(NODOS.manual)
    const dec = r.visitas.find((v) => v.nodo === V9.decidir)!.salida[0] as { declara: string[]; relleno_permitido: boolean }
    expect(dec.declara).toEqual(['el cerebro no estaba listo a los 45 min'])
    expect(dec.relleno_permitido).toBe(false)
  })
  it('dry_run: solo viaja si el sobre lo trae (ausente = real, como hoy); un valor raro viaja tal cual y el pre-vuelo lo rechaza', async () => {
    const a = await correrDesdeLaLlave(sobre({ dry_run: true }), () => resp('correr'))
    expect(llamadas(a, V9.prevuelo)[0].cuerpo.dry_run).toBe(true)
    const b = await correrDesdeLaLlave(sobre({ dry_run: false }), () => resp('correr'))
    expect(llamadas(b, V9.prevuelo)[0].cuerpo.dry_run).toBe(false)
    const c = await correrDesdeLaLlave(sobre({ dry_run: 'si' }), () => resp('no_corre', { motivo: 'dry_run_no_booleano' }, 400))
    expect(llamadas(c, V9.prevuelo)[0].cuerpo.dry_run).toBe('si')
    expect(c.nombres).not.toContain(NODOS.manual)
  })
  it('esperar: espera 5 min y vuelve a preguntar con la MISMA corrida hasta que diga correr', async () => {
    const r = await correrDesdeLaLlave(sobre(), (n) => (n < 3 ? resp('esperar', { reintentar_en_s: 300 }) : resp('correr')))
    expect(llamadas(r, V9.prevuelo)).toHaveLength(4)
    expect(new Set(llamadas(r, V9.prevuelo).map((l) => l.cuerpo.corrida))).toEqual(new Set(['plan-v3-2026-10-15-a']))
    expect(r.nombres.filter((x) => x === V9.esperar)).toHaveLength(3)
    expect(r.reloj - 1_700_000_000_000).toBe(3 * ESPERA_S * 1000)
    expect(r.nombres.at(-1)).toBe(NODOS.manual)
  })
  it('espera sin fin: PARA en el tope de vueltas y lo dice (nunca queda en bucle)', async () => {
    const r = await correrDesdeLaLlave(sobre(), () => resp('esperar'))
    expect(llamadas(r, V9.prevuelo)).toHaveLength(MAX_VUELTAS)
    expect(r.nombres).not.toContain(NODOS.manual)
    const fin = r.visitas.find((v) => v.nodo === V9.noCorrio)!.salida[0] as Record<string, unknown>
    expect(fin).toMatchObject({ corrio: false, motivo: 'espera_excedida', avisar: true })
  })
})

describe('lo que NO corre, no gasta y lo dice', () => {
  it('falta_cupo: avisa a #alertas con QUÉ HACER, vuelve a la sala con «no_corrio_prevuelo» y no toca el manual', async () => {
    const r = await correrDesdeLaLlave(sobre(), () => resp('no_corre', { motivo: 'falta_cupo', detalle: 'libre 1 < 3,4', sube_la_ficha_a: 6 }))
    expect(r.nombres).not.toContain(NODOS.manual)
    expect(r.nombres).toEqual([V9.pide, V9.prevuelo, V9.decidir, V9.seguir, V9.esperarSi, V9.noCorrio, V9.avisarSi, V9.aviso, V9.cable, V9.volvio])
    const av = llamadas(r, V9.aviso)
    expect(av).toHaveLength(1)
    const msg = r.visitas.find((v) => v.nodo === V9.noCorrio)!.salida[0] as { slack: { channel: string; text: string } }
    expect(msg.slack.channel).toBe(CANAL_ALERTAS)
    expect(msg.slack.text).toContain('no se gastó nada')
    expect(msg.slack.text).toContain('a 6')
    const cab = llamadas(r, V9.cable)[0].cuerpo
    expect(cab).toMatchObject({ resultado: 'no_corrio_prevuelo', motivo: 'falta_cupo', client_id: CLIENTE, _sala_correlation_id: 'corr-1', worker_id: 'X9F0zp6LQ2xGEYVS' })
    const fin = r.visitas.find((v) => v.nodo === V9.volvio)!.salida[0]
    expect(fin).toMatchObject({ cierre: 'no_corrio_prevuelo', vuelta_ok: true })
  })
  for (const d of ['ya_en_marcha', 'terminada']) {
    it(`${d}: otro re-disparo lleva la corrida → no hace nada, no molesta al canal, y avisa a la sala`, async () => {
      const r = await correrDesdeLaLlave(sobre(), () => resp(d))
      expect(r.nombres).not.toContain(NODOS.manual)
      expect(llamadas(r, V9.aviso)).toHaveLength(0)
      expect(llamadas(r, V9.cable)).toHaveLength(1)
    })
  }
  it('FALLA CERRADO: un 409 con «correr», una respuesta ilegible o un 5xx nunca siguen', async () => {
    const malas: unknown[] = [
      resp('correr', {}, 409),
      { statusCode: 200, body: 'no es json' },
      { statusCode: 200, body: {} },
      { statusCode: 502, body: { error: 'x' } },
      { statusCode: 400, body: { decision: 'no_corre', motivo: 'entrada_invalida' } },
      {},
    ]
    for (const m of malas) {
      const r = await correrDesdeLaLlave(sobre(), () => m)
      expect(r.nombres, JSON.stringify(m)).not.toContain(NODOS.manual)
      expect(r.nombres, JSON.stringify(m)).not.toContain(V9.devolver)
    }
  })
  it('una caída del pre-vuelo se reintenta 3 veces (5 min) y luego PARA con «prevuelo_sin_respuesta»', async () => {
    const r = await correrDesdeLaLlave(sobre(), () => ({ statusCode: 502, body: { error: 'x' } }))
    expect(llamadas(r, V9.prevuelo)).toHaveLength(3)
    const fin = r.visitas.find((v) => v.nodo === V9.noCorrio)!.salida[0] as Record<string, unknown>
    expect(fin).toMatchObject({ corrio: false, motivo: 'prevuelo_sin_respuesta', avisar: true })
  })
  it('una caída que se arregla en la 2.ª lectura sigue normal', async () => {
    const r = await correrDesdeLaLlave(sobre(), (n) => (n === 0 ? { statusCode: 502, body: {} } : resp('correr')))
    expect(llamadas(r, V9.prevuelo)).toHaveLength(2)
    expect(r.nombres.at(-1)).toBe(NODOS.manual)
  })
  it('el cable de vuelta mudo hace fallar la ejecución cuando la sala la despachó', async () => {
    await expect(
      correr(cortado(), {
        inicio: NODOS.llave, itemsDeInicio: [{ json: sobre() }], previos: { [NODOS.hook]: sobre() },
        http: { [V9.prevuelo]: async () => resp('no_corre', { motivo: 'sin_manual_vigente' }) as never, [V9.aviso]: async () => ({ ok: true }), [V9.cable]: async () => ({ ok: false, code: 'timeout' }) },
        env: { INTERNAL_API_KEY: 'k' },
      }),
    ).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
  })
})

describe('el cierre de la corrida', () => {
  const soloV9 = (f: Flujo, cable: string) => {
    const g = JSON.parse(JSON.stringify(f)) as Flujo
    g.connections[cable].main[0] = g.connections[cable].main[0].filter((x) => x.node === V9.armarCierre)
    return g
  }
  const cerrarDesde = async (cable: string, body: Record<string, unknown>) => {
    const previos: Record<string, unknown> = { [NODOS.hook]: { body } }
    if (cable === NODOS.cableRepetida) previos[NODOS.cableRepetida] = { cierre: 'no_corrio_repetida' }
    return correr(soloV9(despues, cable), {
      inicio: cable, itemsDeInicio: [{ json: { cierre: 'x' } }], previos: previos as never,
      http: { [V9.cerrar]: async () => ({ statusCode: 200, body: { accion: 'avanzada' } }) },
      env: { INTERNAL_API_KEY: 'k-interna' },
    })
  }
  it('plan entregado → cierra la corrida como «hecha» con la llave interna', async () => {
    const r = await cerrarDesde(NODOS.cablePlan, sobre().body)
    const l = llamadas(r, V9.cerrar)
    expect(l).toHaveLength(1)
    expect(l[0].cuerpo).toEqual({ accion: 'cerrar', client_id: CLIENTE, corrida: 'plan-v3-2026-10-15-a', estado: 'hecha', motivo: 'plan entregado' })
    expect(l[0].cabeceras['x-api-key']).toBe('k-interna')
    expect(l[0].url).toBe('https://zero-risk-platform.vercel.app/api/planeacion/corrida')
  })
  it('corrida repetida (el cliente ya tenía plan) → «fallida» con el motivo, para que no bloquee la siguiente', async () => {
    const r = await cerrarDesde(NODOS.cableRepetida, sobre().body)
    expect(llamadas(r, V9.cerrar)[0].cuerpo).toMatchObject({ estado: 'fallida', motivo: expect.stringContaining('ya tenía un plan') })
  })
  it('sin plan_v3 (V9 no actuó) no cierra nada', async () => {
    const r = await cerrarDesde(NODOS.cablePlan, { client_id: CLIENTE, corrida: 'c1' })
    expect(llamadas(r, V9.cerrar)).toHaveLength(0)
    expect(r.nombres).toEqual([V9.armarCierre, V9.cerrarSi])
  })
})

describe('el relleno de Apify solo con el permiso del pre-vuelo', () => {
  const PEDIDOS = { pedidos: [{ brazo: 'apify', objetivo: 'sitio_propio', orden: 1 }, { brazo: 'posthog', objetivo: 'trafico', orden: 2 }, { brazo: 'apify', objetivo: 'redes_sociales', orden: 3 }], descartados: [] }
  /** desde «elegir brazos» hasta la firma de la rama de Apify (lo de después es el plan de siempre) */
  const rama = async (body: Record<string, unknown>, decidir?: Record<string, unknown>) => {
    const g = JSON.parse(JSON.stringify(despues)) as Flujo
    g.connections[RAMA_APIFY.elegir].main[0] = g.connections[RAMA_APIFY.elegir].main[0].filter((x) => x.node === V9.rellenoSi)
    g.connections[RAMA_APIFY.firma] = { main: [[]] }
    g.connections[RAMA_APIFY.brazo] = { main: [[{ node: RAMA_APIFY.firma }]] }
    const previos: Record<string, unknown> = { [NODOS.hook]: { body } }
    if (decidir) previos[V9.decidir] = decidir
    return correr(g, {
      inicio: RAMA_APIFY.elegir, itemsDeInicio: [{ json: PEDIDOS }], previos: previos as never,
      http: { [RAMA_APIFY.brazo]: async () => ({ statusCode: 200, body: { respuestas: [] } }) },
      stubs: { [RAMA_APIFY.firma]: async (items: unknown[]) => items as never } as never,
      env: {},
    })
  }
  const llamo = (r: { nombres: string[] }) => r.nombres.includes(RAMA_APIFY.brazo)
  it('sin plan_v3 el IF deja pasar: «Brazo · Apify» se llama igual que hoy', async () => {
    const r = await rama({ client_id: CLIENTE, corrida: 'c1' })
    expect(llamo(r)).toBe(true)
    expect(r.nombres).not.toContain(V9.sinRelleno)
  })
  it('plan_v3 con relleno_permitido=true: «Brazo · Apify» se llama', async () => {
    const r = await rama(sobre().body, { ruta: 'seguir', relleno_permitido: true })
    expect(llamo(r)).toBe(true)
  })
  for (const [que, dec] of [['relleno_permitido=false', { ruta: 'seguir', relleno_permitido: false }], ['relleno_permitido ausente', { ruta: 'seguir' }], ['como texto «true»', { ruta: 'seguir', relleno_permitido: 'true' }]] as const) {
    it(`plan_v3 con ${que}: NO se llama a Apify y la rama sale como pasamanos declarado`, async () => {
      const r = await rama(sobre().body, { ...dec, huecos_tipos: ['precio_competencia'] })
      expect(llamo(r)).toBe(false)
      expect(r.llamadasHttp).toHaveLength(0)
      const sal = r.visitas.find((v) => v.nodo === V9.sinRelleno)!.salida[0] as { pedidos: unknown[]; descartados: Array<{ objetivo: string; motivo: string }> }
      expect(sal.pedidos).toEqual([])
      expect(sal.descartados.map((d) => d.objetivo)).toEqual(['sitio_propio', 'redes_sociales'])
      expect(sal.descartados[0].motivo).toContain('sin_relleno')
      expect(sal.descartados[0].motivo).toContain('precio_competencia')
    })
  }
  it('plan_v3 y la decisión de V9 no se puede leer: falla cerrado (no se llama a Apify)', async () => {
    const r = await rama(sobre().body)
    expect(llamo(r)).toBe(false)
  })
  it('el pasamanos es de verdad lo que la rama reconoce como «apagada» (sin estado, con pedidos/descartados)', async () => {
    const r = await rama(sobre().body, { relleno_permitido: false })
    const sal = r.visitas.find((v) => v.nodo === V9.sinRelleno)!.salida[0] as Record<string, unknown>
    expect(Object.keys(sal).sort()).toEqual(['descartados', 'pedidos'])
    expect('estado' in sal).toBe(false)
  })
})
