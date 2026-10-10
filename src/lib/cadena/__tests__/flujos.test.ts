/**
 * LOS FLUJOS n8n DE LA CADENA · pruebas a costo cero.
 *
 * Parte 1 · ESTRUCTURA (estática): el grafo cierra, los nodos de código compilan, la cabecera de saltar el editor está SOLO donde debe, todo llamado lleva sus workflow ids, la llave va antes del cuerpo, nada secreto en el JSON.
 * Parte 2 · COMPORTAMIENTO: un simulador de n8n ejecuta los flujos CONTRA LOS MANEJADORES REALES de las rutas (almacén en memoria) con un agente simulado: pasarela, llave, ciclo completo, idempotencia, correcciones, fechas, vigía, cable.
 * NO es n8n: la prueba en vivo (E2/E3) corre en el ensayo por la sala real, con la cadena apagada y todo en seco.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ACCIONES } from '../acciones'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { SimuladorN8n, type FlujoN8n, type Item, type PeticionHttp, type RespuestaHttp } from '../__fixtures__/simulador-n8n'
import { clienteA, contextoDe, piezaBuena, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

const RAIZ = resolve(__dirname, '..', '..', '..', '..')
const AHORA = '2026-10-09T12:00:00Z'
const UUID = '11111111-1111-4111-8111-111111111111'
const IDS = { estrategia: 'F-EST', calendario: 'F-CAL', fechas: 'F-FEC', puerta: 'F-PUE' }
const ID_VIGIA = 'F-VIG', ID_PARTE = 'F-PAR'
const ENV = { SALA_DISPATCH_KEY: 'k-sala', INTERNAL_API_KEY: 'k-int', SALA_INGRESS_API_KEY: 'k-ing', SLACK_BOT_TOKEN: 'xoxb-prueba', ZERO_RISK_API_URL: 'https://api.test', N8N_PUBLIC_URL: 'https://n8n.test', SALA_CALLBACK_API_KEY: 'k-cb' }

let FLUJOS: Record<string, FlujoN8n> = {}
let POR_ID: Record<string, FlujoN8n> = {}
const codigoDe = (f: FlujoN8n) => f.nodes.filter((n) => n.type === 'n8n-nodes-base.code')

beforeAll(async () => {
  const mod: any = await import(/* @vite-ignore */ pathToFileURL(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'construir.mjs')).href)
  const vivo = (f: string) => JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'vivos', f), 'utf8'))
  FLUJOS = mod.construirFlujos({ ids: IDS, parteViva: vivo('PQdIgbuFexuBsoh8.json'), planViva: vivo('X9F0zp6LQ2xGEYVS.json') })
  POR_ID = { [IDS.estrategia]: FLUJOS['cadena-estrategia'], [IDS.calendario]: FLUJOS['cadena-calendario'], [IDS.fechas]: FLUJOS['cadena-fechas'], [IDS.puerta]: FLUJOS['cadena-puerta'], [ID_VIGIA]: FLUJOS['cadena-vigia'], [ID_PARTE]: FLUJOS['cadena-parte-por-filas'] }
})

const NUEVOS = ['cadena-estrategia', 'cadena-calendario', 'cadena-fechas', 'cadena-vigia', 'cadena-puerta']

describe('ESTRUCTURA · los flujos nuevos y la copia', () => {
  it('se construyen los 7 flujos pedidos (5 nuevos + la parte por filas + la copia de planeación), TODOS sin `active` (nacen apagados)', () => {
    expect(Object.keys(FLUJOS).sort()).toEqual([...NUEVOS, 'cadena-parte-por-filas', 'copia-plan-X9F0'].sort())
    for (const f of Object.values(FLUJOS)) expect((f as unknown as { active?: boolean }).active).not.toBe(true)
  })
  it('el grafo cierra: toda conexión apunta a un nodo que existe, todo nodo existe en el grafo y es alcanzable desde su entrada', () => {
    for (const [k, f] of Object.entries(FLUJOS)) {
      const nombres = new Set(f.nodes.map((n) => n.name))
      expect(nombres.size, `${k}: nombres repetidos`).toBe(f.nodes.length)
      for (const [de, c] of Object.entries(f.connections)) {
        expect(nombres.has(de), `${k}: conexión desde ${de}`).toBe(true)
        for (const salida of c.main) for (const d of salida) expect(nombres.has(d.node), `${k}: ${de} → ${d.node}`).toBe(true)
      }
      const entrada = f.nodes.find((n) => /Trigger$|webhook$/.test(n.type))!
      const vistos = new Set([entrada.name]); const pila = [entrada.name]
      while (pila.length) for (const salida of f.connections[pila.pop()!]?.main ?? []) for (const d of salida) if (!vistos.has(d.node)) { vistos.add(d.node); pila.push(d.node) }
      const sueltos = f.nodes.filter((n) => !vistos.has(n.name) && !/Trigger$|webhook$/.test(n.type)).map((n) => n.name)
      expect(sueltos, `${k}: nodos sin camino desde la entrada`).toEqual([])
    }
  })
  it('todos los nodos de código compilan y toda referencia `$(\'nodo\')` apunta a un nodo del MISMO flujo', () => {
    for (const [k, f] of Object.entries(FLUJOS).filter(([k]) => k !== 'copia-plan-X9F0')) {
      const nombres = new Set(f.nodes.map((n) => n.name))
      for (const n of codigoDe(f)) {
        expect(() => new (Object.getPrototypeOf(async function () {}).constructor)('$input', '$json', '$', '$env', '$workflow', '$execution', n.parameters.jsCode), `${k} · ${n.name}`).not.toThrow()
        for (const m of String(n.parameters.jsCode).matchAll(/\$\('([^']+)'\)/g)) expect(nombres.has(m[1]), `${k} · ${n.name} lee «${m[1]}» que no existe`).toBe(true)
      }
    }
  })
  it('🔴 la cabecera de saltar la revisión del editor está SOLO en el agente de estrategia, calendario y fechas; en ningún otro flujo ni nodo', () => {
    const con: string[] = []
    for (const [k, f] of Object.entries(FLUJOS)) for (const n of f.nodes) if (JSON.stringify(n.parameters).toLowerCase().includes('x-skip-editor-middleware')) con.push(`${k}|${n.name}`)
    expect(con.sort()).toEqual(['cadena-calendario|② Agente (run-sdk)', 'cadena-estrategia|② Agente (run-sdk)', 'cadena-fechas|④ Agente (run-sdk)'])
  })
  it('🔴 toda llamada a /api/cadena/* y a run-sdk lleva workflow_id y workflow_execution_id (la causa del 403 conocido)', () => {
    for (const k of NUEVOS) for (const n of FLUJOS[k].nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
      const url = String(n.parameters.url)
      if (!/\/api\/cadena\/|\/api\/agents\/run-sdk/.test(url)) continue
      const cuerpo = String(n.parameters.jsonBody)
      // el cuerpo lo arma un nodo de código (`$json.pedido` / `.guardar` / `.llamada`) o la expresión trae los dos campos
      const delCodigo = /\$json\.(pedido|guardar|llamada|pedido_cierre)\b/.test(cuerpo)
      expect(delCodigo || (/workflow_id/.test(cuerpo) && /workflow_execution_id/.test(cuerpo)), `${k} · ${n.name}`).toBe(true)
    }
    for (const k of ['cadena-estrategia', 'cadena-calendario']) {
      const armar = codigoDe(FLUJOS[k]).filter((n) => /pedido|guardar|llamada/.test(n.name))
      for (const n of armar) expect(String(n.parameters.jsCode)).toMatch(/workflow_execution_id/)
    }
  })
  it('🔴 condición 1 de CC#3: la puerta exige la llave ANTES de leer el cuerpo, y el primer nodo tras el webhook es el de la llave', () => {
    const p = FLUJOS['cadena-puerta']
    expect(p.connections['Webhook · cadena'].main[0][0].node).toBe('⓪ Llave y origen')
    const js = String(p.nodes.find((n) => n.name === '⓪ Llave y origen')!.parameters.jsCode).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const iLlave = js.indexOf("headers['x-sala-dispatch-key']")
    const iCuerpo = js.indexOf('const body = w.body')
    expect(iLlave).toBeGreaterThan(0)
    expect(iCuerpo).toBeGreaterThan(iLlave)
    expect(js.indexOf('target_step_id')).toBeGreaterThan(iLlave)
    expect(js).toMatch(/SALA_DISPATCH_KEY/)
  })
  it('🔴 la copia por filas manda el cable con el id de la PUERTA y no con el suyo; el webhook es propio; el original no se menciona como destino', () => {
    const c = FLUJOS['cadena-parte-por-filas']
    expect(c.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')!.parameters.path).toBe('zero-risk/cadena-parte')
    const chequeos = String(c.nodes.find((n) => n.name === '④ Chequeos')!.parameters.jsCode)
    expect(chequeos).toContain("worker_id: 'F-PUE'")
    expect(chequeos).not.toMatch(/worker_id: \$workflow\.id/)
    expect(chequeos).toContain("'lote_briefeado'")
    expect(chequeos).toContain("'fila_sin_brief', 'fila_repetida', 'fila_ajena'")
    expect(chequeos).toContain('aviso_brief_repetido')
    expect(String(c.nodes.find((n) => n.name === '② ¿Ya hay parte de este plan?')!.parameters.url)).toContain('lote_key')
    expect(String(c.nodes.find((n) => n.name === '② Cargar plan vigente')!.parameters.url)).toContain("plan_id }}&limit=1")
    expect(c.nodes.some((n) => n.name === '⓪ GUARDA · el lote')).toBe(true)
    expect(c.nodes.some((n) => n.name === '⑤ Marcar las filas del lote')).toBe(true)
    // lo que NO cambió de la parte original (REGLAS n.º 5 y la lista de tipos sin brief) sigue idéntico
    const armar = String(c.nodes.find((n) => n.name === '③ Armar el cuerpo del redactor')!.parameters.jsCode)
    expect(armar).toContain('NO video ni audio')
    expect(chequeos).toContain("TIPOS_QUE_NO_SE_BRIEFEAN = ['video', 'audio', 'reel']")
  })
  it('la copia de planeación es idéntica al original salvo el nombre y la ruta de su webhook', () => {
    const vivo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'vivos', 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
    const c = FLUJOS['copia-plan-X9F0']
    expect(c.nodes).toHaveLength(vivo.nodes.length)
    for (const n of vivo.nodes) {
      const x = c.nodes.find((y) => y.name === n.name)!
      expect(x, n.name).toBeDefined()
      if (n.type === 'n8n-nodes-base.webhook') expect(x.parameters.path).toBe(n.parameters.path + '-copia-inactiva')
      else expect(x.parameters).toEqual(n.parameters)
    }
    expect(c.connections).toEqual(vivo.connections)
  })
  it('nada secreto en los JSON generados (llaves, tokens, huellas largas)', () => {
    for (const k of NUEVOS) expect(JSON.stringify(FLUJOS[k])).not.toMatch(/eyJ[\w-]{10,}|sk-[A-Za-z0-9]{16,}|xox[bp]-[0-9A-Za-z-]{8,}|[a-f0-9]{40,}/)
  })
  it('agnósticos: los nodos NUEVOS no nombran un cliente, una ciudad ni un rubro', () => {
    const src = NUEVOS.map((k) => JSON.stringify(FLUJOS[k])).join('\n')
    for (const re of [/n[aá]ufrago/i, /p[eé]rez/i, /guayaquil/i, /\bol[oó]n\b/i, /cuenca/i, /restaurante/i, /cafeter[ií]a/i, /veterinari/i, /marisco/i]) expect(src).not.toMatch(re)
  })
  it('cero contacto con el cliente: ningún nodo nuevo manda recados, correos ni WhatsApp a nadie del negocio', () => {
    const src = NUEVOS.map((k) => JSON.stringify(FLUJOS[k])).join('\n')
    expect(src).not.toMatch(/sala[_]recados|api\/sala\/recados|whatsapp|resend|twilio|due[nñ]o/i)
  })
})

// ───────────────────────────────────────────── COMPORTAMIENTO

interface Mundo { al: AlmacenMemoria; sim: SimuladorN8n; reg: Registro; cliente: ClienteFixture }
interface Registro { cable: any[]; intake: any[]; slack: any[]; pasarela: PeticionHttp[]; parte: PeticionHttp[]; agente: PeticionHttp[]; cadena: PeticionHttp[] }

function clienteUuid(): ClienteFixture {
  const c = clienteA()
  c.clientId = UUID
  c.referencias = c.referencias.map((r) => ({ ...r, client_id: UUID }))
  return c
}

function mundo(opts: { estado?: string; clientesEnsayo?: string[]; cliente?: ClienteFixture; agente?: (b: any) => RespuestaHttp; paginas?: Record<string, string>; cableFalla?: boolean; config?: Record<string, unknown> } = {}): Mundo {
  const cliente = opts.cliente ?? clienteUuid()
  const al = new AlmacenMemoria({
    contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, journeys: [{ journeyId: 'viaje-1', clientId: UUID }],
    config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: opts.estado ?? 'ensayo', clientes_ensayo: opts.clientesEnsayo ?? [UUID], ...opts.config },
  })
  const reg: Registro = { cable: [], intake: [], slack: [], pasarela: [], parte: [], agente: [], cadena: [] }
  const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
    const u = new URL(p.url)
    if (u.pathname.startsWith('/api/cadena/')) {
      reg.cadena.push(p)
      if (p.cabeceras['x-api-key'] !== ENV.INTERNAL_API_KEY) return { statusCode: 401, body: { error: 'unauthorized' } }
      const ruta = u.pathname.split('/')[3] as keyof typeof ACCIONES
      const accion = String((p.cuerpo as any)?.accion)
      const m = ACCIONES[ruta]?.[accion]
      if (!m) return { statusCode: 400, body: { error: 'accion_desconocida', accion } }
      const r = await m(al, p.cuerpo as Record<string, unknown>, AHORA)
      return { statusCode: r.status, body: r.cuerpo }
    }
    if (u.pathname === '/api/agents/run-sdk') { reg.agente.push(p); return (opts.agente ?? (() => ({ statusCode: 500, body: { error: 'sin agente simulado' } })))(p.cuerpo) }
    if (u.pathname === '/api/sala/callback') { reg.cable.push(p.cuerpo); return opts.cableFalla ? { statusCode: 500, body: { error: 'caído' } } : { statusCode: 200, body: { ok: true, event_id: 'ev-1' } } }
    if (u.pathname === '/api/sala/intake') { reg.intake.push(p.cuerpo); return { statusCode: 200, body: { ok: true, kind: 'accepted' } } }
    if (u.hostname === 'slack.com') { reg.slack.push(p.cuerpo); return { statusCode: 200, body: { ok: true } } }
    if (u.pathname === '/webhook/zero-risk/brief') { reg.pasarela.push(p); return { statusCode: 200, body: {} } }
    if (u.pathname === '/webhook/zero-risk/cadena-parte') { reg.parte.push(p); return { statusCode: 200, body: {} } }
    if (opts.paginas && opts.paginas[p.url] === null) return { statusCode: 404, body: 'no encontrada' }
    if (opts.paginas && opts.paginas[p.url] !== undefined) return { statusCode: 200, body: opts.paginas[p.url] }
    throw new Error('el simulador no conoce esta dirección: ' + p.url)
  }
  return { al, sim: new SimuladorN8n({ flujos: POR_ID, env: ENV, http }), reg, cliente }
}

const sobreAbrir = (extra: Record<string, unknown> = {}) => ({
  client_id: UUID, tenant_id: UUID, plan_id: 'plan-1', dry_run: true, desde_worker: 'X9F0zp6LQ2xGEYVS', _sala_correlation_id: 'corr-1', _journey_id: 'viaje-1',
  target_step_id: 'router.dispatch.planeacion/plan-listo.briefear', ...extra,
})
const sobreVigia = (extra: Record<string, unknown> = {}) => ({ client_id: UUID, tenant_id: UUID, dry_run: true, _sala_correlation_id: 'corr-2', _journey_id: 'viaje-1', target_step_id: 'router.dispatch.cadena/vigia.briefear', ...extra })
const entrada = (cuerpo: Record<string, unknown>, llave = 'k-sala'): Item[] => [{ json: { headers: { 'x-sala-dispatch-key': llave }, body: cuerpo } }]
const correr = (m: Mundo, cuerpo: Record<string, unknown>, llave?: string) => m.sim.ejecutar(IDS.puerta, entrada(cuerpo, llave))
const simulacros = (c: ClienteFixture, extra: Record<string, unknown> = {}) => ({ estrategia: [c.estrategia], calendario: [tandaBuena(c)], ...extra })
const agenteQueDevuelve = (objetos: Record<string, any>): ((b: any) => RespuestaHttp) => (b) => {
  const k = b.extra?.contrato === 'estrategia.v1' ? 'estrategia' : b.extra?.contrato === 'calendario_tanda.v1' ? 'calendario' : 'fechas'
  const o = objetos[k]
  return { statusCode: 200, body: { success: true, structured_output: Array.isArray(o) ? o.shift() : o, cost_usd: 0.31 } }
}

describe('COMPORTAMIENTO · la llave y el origen (condición 1)', () => {
  it('🔴 sin la llave, con una llave equivocada o sin la variable en el entorno: falla ANTES de leer el cuerpo y no se llama a nadie', async () => {
    for (const llave of [undefined, '', 'otra']) {
      const m = mundo()
      await expect(m.sim.ejecutar(IDS.puerta, [{ json: { headers: llave === undefined ? {} : { 'x-sala-dispatch-key': llave }, body: sobreAbrir() } }])).rejects.toThrow(/PUERTA_PROCEDENCIA_INVALIDA/)
      expect(m.reg.cadena).toHaveLength(0)
    }
    const sinVar = mundo()
    sinVar.sim = new SimuladorN8n({ flujos: POR_ID, env: { ...ENV, SALA_DISPATCH_KEY: '' }, http: async () => { throw new Error('no debía llamar a nadie') } })
    await expect(correr(sinVar, sobreAbrir())).rejects.toThrow(/PUERTA_CERRADA/)
  })
  it('🔴 un target_step_id falsificado o desconocido se rechaza sin escribir nada; un cuerpo del vigía con modo fuera de la lista cerrada también', async () => {
    const m = mundo()
    await expect(correr(m, sobreAbrir({ target_step_id: 'router.dispatch.otra/cosa.briefear' }))).rejects.toThrow(/PUERTA_ORIGEN_DESCONOCIDO/)
    await expect(correr(m, sobreVigia({ modo: 'reabrir' }))).rejects.toThrow(/PUERTA_MODO_INVALIDO/)
    expect(m.al.campanas).toHaveLength(0)
    expect(m.reg.cadena).toHaveLength(0)
  })
  it('un sobre sin dry_run booleano, con client_id que no es uuid o sin viaje se detiene antes de cualquier llamada', async () => {
    const m = mundo()
    await expect(correr(m, sobreAbrir({ dry_run: 'true' }))).rejects.toThrow(/PUERTA_DRY_RUN_AUSENTE/)
    await expect(correr(m, sobreAbrir({ client_id: "1 or 1=1" }))).rejects.toThrow(/PUERTA_CLIENTE_INVALIDO/)
    await expect(correr(m, sobreAbrir({ _journey_id: '' }))).rejects.toThrow(/PUERTA_SIN_VIAJE/)
    expect(m.reg.cadena).toHaveLength(0)
  })
  it('🔴 un viaje que NO existe para ese cliente en la sala se rechaza (la sala no firma el cuerpo): no se abre ninguna campaña', async () => {
    const m = mundo()
    await expect(correr(m, sobreAbrir({ _journey_id: 'viaje-inventado' }))).rejects.toThrow(/PUERTA_VIAJE_NO_EXISTE/)
    expect(m.al.campanas).toHaveLength(0)
  })
})

describe('COMPORTAMIENTO · la pasarela es NEUTRAL', () => {
  it('🔴 apagada: reenvía el cuerpo ENTERO, byte a byte, a la parte original con la llave; no abre campaña, no llama al agente, no manda cable propio', async () => {
    const m = mundo({ estado: 'apagada' })
    const cuerpo = sobreAbrir({ campo_raro: { a: [1, 2, { b: '«ñ»' }] } })
    const r = await correr(m, cuerpo)
    expect(r[0].json.resultado).toBe('pasarela_ok')
    expect(m.reg.pasarela).toHaveLength(1)
    expect(m.reg.pasarela[0].cuerpoCrudo).toBe(JSON.stringify(cuerpo))
    expect(m.reg.pasarela[0].cabeceras['x-sala-dispatch-key']).toBe('k-sala')
    expect(m.al.campanas).toHaveLength(0)
    expect(m.reg.agente).toHaveLength(0)
    expect(m.reg.cable).toHaveLength(0) // el cable lo manda la parte original, con su propio id (alias del mapa)
  })
  it('ensayo con un cliente que NO está en la lista: también pasarela', async () => {
    const m = mundo({ estado: 'ensayo', clientesEnsayo: ['otro-cliente'] })
    await correr(m, sobreAbrir())
    expect(m.reg.pasarela).toHaveLength(1)
    expect(m.al.campanas).toHaveLength(0)
  })
  it('si la parte original rechaza el sobre, la pasarela FALLA RUIDOSO (el sobre no se pierde en silencio)', async () => {
    const m = mundo({ estado: 'apagada' })
    const original = m.sim as SimuladorN8n
    const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http: async (p, ctx) => (new URL(p.url).pathname === '/webhook/zero-risk/brief' ? { statusCode: 500, body: {} } : (original as any).o.http(p, ctx)) })
    await expect(sim.ejecutar(IDS.puerta, entrada(sobreAbrir()))).rejects.toThrow(/PUERTA_PASARELA_FALLO/)
  })
  it('un sobre del vigía con la cadena apagada se DETIENE: no se reenvía a la parte original (no es suyo)', async () => {
    const m = mundo({ estado: 'apagada' })
    await expect(correr(m, sobreVigia({ modo: 'parte', campana_id: 'c', lote: '2026-W42', fila_ids: ['a'] }))).rejects.toThrow(/PUERTA_CADENA_APAGADA/)
    expect(m.reg.pasarela).toHaveLength(0)
  })
})

describe('COMPORTAMIENTO · la cadena en seco con agente simulado (ensayo por la sala)', () => {
  it('🔴 sobre de plan-listo → campaña → estrategia → fechas → calendario tanda 1 → UN cable cadena_abierta con el worker_id de la puerta; US$ 0 y cero llamadas al modelo', async () => {
    const m = mundo()
    const r = await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    expect(r[0].json).toMatchObject({ cierre: 'cadena_terminada', resultado: 'cadena_abierta', vuelta_ok: true, despachado_por_la_sala: true })
    expect(m.reg.cable).toHaveLength(1)
    expect(m.reg.cable[0]).toMatchObject({ worker_id: IDS.puerta, _journey_id: 'viaje-1', _sala_correlation_id: 'corr-1', client_id: UUID, resultado: 'cadena_abierta' })
    expect(m.reg.agente).toHaveLength(0) // simulacro: el modelo no se llamó ni una vez
    expect(m.reg.pasarela).toHaveLength(0)
    const c = m.al.campanas[0]
    expect(c).toMatchObject({ estado: 'activa', seco: true, client_id: UUID })
    const filas = await m.al.filas(c.id)
    expect(filas.filter((f) => f.estado === 'validada')).toHaveLength(16)
    expect(filas.filter((f) => f.estado === 'esquema')).toHaveLength(32)
    expect(m.al.corridas.every((x) => x.estado === 'ok' && x.seco === true)).toBe(true)
    expect(m.al.corridas.reduce((s, x) => s + (x.costo_usd ?? 0), 0)).toBe(0)
  })
  it('la cadena escribe SOLO tablas cadena_* (en el almacén) y toda corrida lleva workflow_id y workflow_execution_id', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    for (const c of m.al.corridas) { expect(c.workflow_id).toMatch(/^F-/); expect(c.workflow_execution_id).toMatch(/^\d+$/) }
    for (const p of m.reg.cadena) {
      const cuerpo = p.cuerpo as Record<string, unknown>
      expect(typeof cuerpo.workflow_id, JSON.stringify(cuerpo).slice(0, 80)).toBe('string')
      expect(typeof cuerpo.workflow_execution_id).toBe('string')
    }
  })
  it('🔴 idempotencia: el MISMO sobre otra vez no abre otra campaña, no repite filas ni corridas y cuenta cadena_abierta', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const corridas = m.al.corridas.length, filas = (await m.al.filas(m.al.campanas[0].id)).length
    const r = await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.al.campanas).toHaveLength(1)
    expect(m.al.corridas).toHaveLength(corridas)
    expect((await m.al.filas(m.al.campanas[0].id)).length).toBe(filas)
  })
  it('🔴 condición 6: un plan NUEVO del mismo cliente reemplaza a la campaña anterior y la abre', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    ;(m.al as any).semilla.planes[UUID].push({ plan_id: 'plan-2', fecha: '2026-10-20' })
    const r = await correr(m, sobreAbrir({ plan_id: 'plan-2', _simulacros: simulacros(m.cliente) }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.al.campanas.map((c) => [c.plan_id, c.estado]).sort()).toEqual([['plan-1', 'reemplazada'], ['plan-2', 'activa']])
  })
  it('un plan que no es de este cliente: cable plan_no_coincide y NO se abre nada', async () => {
    const m = mundo()
    const r = await correr(m, sobreAbrir({ plan_id: 'plan-ajeno' }))
    expect(r[0].json.resultado).toBe('plan_no_coincide')
    expect(m.reg.cable[0]).toMatchObject({ resultado: 'plan_no_coincide', worker_id: IDS.puerta })
    expect(m.al.campanas).toHaveLength(0)
    expect(m.al.corridas).toHaveLength(0)
  })
  it('🔴 un dato sin fuente en la tanda: UNA corrección y, si no se arregla, la FILA sale (nadie del cliente recibe nada) y la cadena abre igual', async () => {
    const m = mundo()
    const t = tandaBuena(m.cliente)
    const mala = { ...t, piezas: t.piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, tema: 'Nuestro pan de 45 g' } : p)) }
    const sigueMala = { piezas: [{ ...piezaBuena(m.cliente, 1, 'a', 'x'), tema: 'Nuestro pan de 45 g' }], ajustes_al_patron: [] }
    const r = await correr(m, sobreAbrir({ _simulacros: { estrategia: [m.cliente.estrategia], calendario: [mala, sigueMala] } }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    const filas = await m.al.filas(m.al.campanas[0].id)
    expect(filas.find((f) => f.id === 's1-d1-a')!.estado).toBe('descartada_sin_fuente')
    expect(filas.filter((f) => f.estado === 'validada')).toHaveLength(15)
    expect(m.reg.cadena.filter((p) => String((p.cuerpo as any).accion) === 'guardar' && /calendario/.test(p.url)).length).toBe(2) // exactamente UNA corrección
  })
  it('🔴 una estrategia inválida dos veces: la campaña necesita a Emilio y el cable lo cuenta (la sala se entera, nada queda colgado)', async () => {
    const m = mundo()
    const mala = { ...m.cliente.estrategia, pilares: [{ clave: 'x', nombre: 'x', pct: 90 }] }
    const r = await correr(m, sobreAbrir({ _simulacros: { estrategia: [mala, mala] } }))
    expect(r[0].json.resultado).toBe('necesita_humano')
    expect(m.reg.cable[0]).toMatchObject({ resultado: 'necesita_humano', worker_id: IDS.puerta })
    expect(m.al.campanas[0].estado).toBe('necesita_humano')
    expect(m.al.esperas.some((e) => e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')).toBe(true)
    expect(m.al.estrategias).toHaveLength(0)
  })
  it('sin simulacro, el agente se llama con el cuerpo COMPLETO: esquema, tope, modelo, razonamiento, workflow ids, dry_run booleano y la cabecera de saltar el editor', async () => {
    const m = mundo({ agente: agenteQueDevuelve({ estrategia: clienteUuid().estrategia, calendario: tandaBuena(clienteUuid()) }) })
    const r = await correr(m, sobreAbrir())
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.reg.agente).toHaveLength(2) // estrategia + tanda 1
    for (const p of m.reg.agente) {
      const b = p.cuerpo as any
      expect(p.cabeceras['x-skip-editor-middleware']).toBe('1')
      expect(p.cabeceras['x-api-key']).toBe('k-int')
      expect(b).toMatchObject({ agent: 'social-media-strategist', dry_run: true, force_restart: true, model_override: 'claude-opus-5-5', thinking_mode: 'low' })
      expect(b.output_schema.type).toBe('object')
      expect(b.max_budget_usd).toBeGreaterThanOrEqual(1)
      expect(typeof b.workflow_id).toBe('string'); expect(typeof b.workflow_execution_id).toBe('string')
      expect(p.timeout).toBe(290000)
    }
    expect(m.al.corridas.map((c) => c.costo_usd)).toEqual([0.31, 0.31])
  })
  it('una llamada al agente que NO entrega el objeto se reintenta (máx. 3) y luego es necesita_humano: nunca un bucle', async () => {
    const m = mundo({ agente: () => ({ statusCode: 500, body: { error: 'E-OUTPUT-SCHEMA-MISSING', cost_usd: 0.2 } }) })
    const r = await correr(m, sobreAbrir())
    expect(r[0].json.resultado).toBe('necesita_humano')
    expect(m.reg.agente).toHaveLength(3)
    expect(m.al.corridas.every((c) => c.estado === 'fallida')).toBe(true)
  })
  it('un cable de vuelta que no llega NO es mudo: la corrida falla ruidosa si la sala lo despachó', async () => {
    const m = mundo({ cableFalla: true })
    await expect(correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
  })
})

describe('COMPORTAMIENTO · las fechas especiales las declara el cliente', () => {
  it('declara «feriados locales»: se pide uno por año (2026 y 2027); sin lista de dominios queda sin fuente y la campaña SIGUE (nada bloquea la apertura)', async () => {
    const m = mundo()
    const r = await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.al.coberturas.map((c) => [c.anio, c.estado]).sort()).toEqual([[2026, 'sin_fuente'], [2027, 'sin_fuente']])
    expect(m.al.campanas[0].estado).toBe('activa')
  })
  it('🔴 un cliente que NO declara ningún tipo: el sub-flujo de fechas NO corre (lista vacía = nada se investiga, nada se bloquea)', async () => {
    const m = mundo()
    const e = { ...m.cliente.estrategia, fechas_que_importan: [] }
    const r = await correr(m, sobreAbrir({ _simulacros: { estrategia: [e], calendario: [tandaBuena(m.cliente)] } }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.sim.traza.filter((t) => t.flujo === IDS.fechas)).toHaveLength(0)
    expect(m.al.coberturas).toHaveLength(0)
  })
  it('con dominios permitidos y páginas simuladas: la cita se comprueba POR CÓDIGO contra la página y la fecha verificada queda guardada', async () => {
    const m = mundo({ config: { dominios_fechas: { 'feriados_locales|pais-de-practica': ['https://fuente.test'] } }, paginas: { 'https://fuente.test': '<html><body><p>El 3 de noviembre se celebra la fiesta de la ciudad.</p></body></html>' } })
    const respuesta = (anio: number) => ({ tipo: 'feriados locales', ambito: 'ciudad', anio, fechas: [{ fecha: `${anio}-11-03`, nombre: 'Fiesta', alcance: 'local', fuente_url: 'https://fuente.test', cita_literal: 'El 3 de noviembre se celebra la fiesta' }], no_encontrado: [] })
    const pagina = { url: 'https://fuente.test', texto: 'El 3 de noviembre se celebra la fiesta de la ciudad.' }
    const r = await correr(m, sobreAbrir({ _simulacros: { ...simulacros(m.cliente), fechas: { paginas: [pagina], respuesta: respuesta(2026) } } }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.al.fechas.filter((f) => f.estado === 'verificada').map((f) => f.fecha)).toContain('2026-11-03')
    expect(m.reg.agente).toHaveLength(0)
  })
  it('🔴 sin simulacro: el CÓDIGO descarga la página (nodo HTTP, nunca el agente), la limpia a texto y se la pasa al agente; la cita se comprueba contra ESE texto', async () => {
    const respuesta = { tipo: 'feriados locales', ambito: 'ciudad', anio: 2026, fechas: [{ fecha: '2026-11-03', nombre: 'Fiesta', alcance: 'local', fuente_url: 'https://fuente.test', cita_literal: 'El 3 de noviembre se celebra la fiesta' }, { fecha: '2026-12-25', nombre: 'Inventada', alcance: 'local', fuente_url: 'https://fuente.test', cita_literal: 'El 25 de diciembre es fiesta' }], no_encontrado: [] }
    const cl = clienteUuid()
    const m = mundo({ config: { dominios_fechas: { 'feriados_locales|pais-de-practica': ['https://fuente.test'] } }, paginas: { 'https://fuente.test': '<html><script>var x=1</script><body><p>El 3 de noviembre se celebra la fiesta de la ciudad.</p></body></html>' }, agente: agenteQueDevuelve({ estrategia: cl.estrategia, calendario: tandaBuena(cl), fechas: respuesta }) })
    const r = await correr(m, sobreAbrir())
    expect(r[0].json.resultado).toBe('cadena_abierta')
    const deFechas = m.reg.agente.filter((p) => (p.cuerpo as any).extra?.contrato === 'fechas_especiales.v1')
    expect(deFechas.length).toBeGreaterThan(0)
    expect((deFechas[0].cuerpo as any).task).toContain('El 3 de noviembre se celebra la fiesta de la ciudad.')
    expect((deFechas[0].cuerpo as any).task).not.toContain('var x=1')
    expect(deFechas[0].cabeceras['x-skip-editor-middleware']).toBe('1')
    expect(m.al.fechas.filter((f) => f.estado === 'verificada').map((f) => f.fecha)).toEqual(['2026-11-03'])
  })
})

describe('COMPORTAMIENTO · el vigía', () => {
  it('sin campañas: termina limpio (un ítem «ninguna», sin error), deja su latido y no manda sobres', async () => {
    const m = mundo({ estado: 'encendida' })
    await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
    expect(m.al.config.get('ultimo_latido')).toBe(AHORA)
    expect(m.reg.intake).toHaveLength(0)
  })
  it('🔴 con una campaña activa: un sobre por lote (clave campana:semana:version), con las filas que tocan hoy; las de más adelante no', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const id = m.al.campanas[0].id
    await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
    const lotes = m.reg.intake.filter((s: any) => s.payload.modo === 'parte')
    expect(lotes).toHaveLength(1)
    expect(lotes[0]).toMatchObject({ source: 'cadena/vigia', intent: 'briefear', client_id: UUID, idempotency_key: `${id}:2026-W42:1`, logical_period: '2026-W42' })
    expect(lotes[0].payload).toMatchObject({ modo: 'parte', campana_id: id, dry_run: true })
    expect(lotes[0].payload.fila_ids).toEqual(expect.arrayContaining(['s1-d1-a', 's1-d4-b']))
    expect(lotes[0].payload.fila_ids).not.toContain('s4-d1-a')
    expect(m.reg.intake.filter((x: any) => x.payload.modo === 'tanda_siguiente')).toHaveLength(0) // la tanda 1 termina en 30 días: todavía no toca
  })
  it('🔴 cerca del final de la tanda, un sobre de tanda siguiente con su clave campana:tanda-N', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const id = m.al.campanas[0].id
    m.al.campanas[0].fecha_inicio = '2026-09-14' // la tanda 1 termina el 11-oct: faltan 2 días
    await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
    const tandas = m.reg.intake.filter((s: any) => s.payload.modo === 'tanda_siguiente')
    expect(tandas).toHaveLength(1)
    expect(tandas[0]).toMatchObject({ idempotency_key: `${id}:tanda-2`, logical_period: 'tanda-2' })
    expect(tandas[0].payload).toMatchObject({ tanda: 2, campana_id: id })
  })
  it('los avisos van agregados por campaña y, en ensayo, se REGISTRAN y no se mandan a Slack; encendida, sale UN mensaje con «qué hacer»', async () => {
    const m = mundo({ estado: 'ensayo' })
    const mala = { ...m.cliente.estrategia, pilares: [{ clave: 'x', nombre: 'x', pct: 90 }] }
    await correr(m, sobreAbrir({ _simulacros: { estrategia: [mala, mala] } }))
    await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
    expect(m.reg.slack).toHaveLength(0)
    m.al.config.set('estado_cadena', 'encendida')
    for (const e of m.al.esperas) { e.alerta_en = '2026-10-01T00:00:00.000Z'; e.rung_enviado = 0 }
    await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
    expect(m.reg.slack).toHaveLength(1)
    expect(m.reg.slack[0].channel).toBe('C0B7XUUEBHA')
    expect(m.reg.slack[0].text).toContain('Qué hacer')
  })
  it('🔴 un sobre del vigía por la puerta: modo parte → la copia por filas con el lote; modo tanda_siguiente → el calendario de esa tanda', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const id = m.al.campanas[0].id
    const parte = await correr(m, sobreVigia({ modo: 'parte', campana_id: id, lote: '2026-W42', fila_ids: ['s1-d1-a', 's1-d4-b'] }))
    expect(parte[0].json.resultado).toBe('pasarela_ok')
    expect(m.reg.parte).toHaveLength(1)
    expect(m.reg.parte[0].cabeceras['x-sala-dispatch-key']).toBe('k-sala')
    expect(m.reg.parte[0].cuerpo).toMatchObject({ campana_id: id, lote: '2026-W42', fila_ids: ['s1-d1-a', 's1-d4-b'], dry_run: true })
    const antes = m.al.corridas.length
    const t = tandaBuena(m.cliente)
    const t2 = { ...t, piezas: t.piezas.map((p) => ({ ...p, semana: p.semana + 4 })) }
    const tanda = await correr(m, sobreVigia({ modo: 'tanda_siguiente', campana_id: id, tanda: 2, _simulacros: { calendario: [t2] } }))
    expect(tanda[0].json).toMatchObject({ resultado: 'cadena_abierta' })
    expect(m.al.corridas.length).toBe(antes + 1)
    expect((await m.al.filas(id)).filter((f) => f.tanda === 2 && f.estado === 'validada')).toHaveLength(16)
  })
})

describe('afinando lo que las mutaciones dejaron vivo (flujos)', () => {
  const sub = (m: Mundo, id: string, json: Record<string, unknown>) => m.sim.ejecutar(id, [{ json }])
  const abrirYa = async (m: Mundo) => {
    const res = await ACCIONES.campanas.abrir(m.al, { workflow_id: IDS.puerta, workflow_execution_id: 'x', client_id: UUID, seco: true, sala_ref: { _journey_id: 'viaje-1', _sala_correlation_id: 'c' } }, AHORA)
    return (res.cuerpo.campana as { id: string }).id
  }

  it('🔴 los simulacros SOLO existen en seco: con dry_run:false se ignoran, el agente se llama de verdad y `dry_run:false` llega al run-sdk', async () => {
    const cl = clienteUuid()
    const m = mundo({ estado: 'encendida', agente: agenteQueDevuelve({ estrategia: cl.estrategia, calendario: tandaBuena(cl) }) })
    const malos = { estrategia: [{ ...cl.estrategia, pilares: [] }], calendario: [{ piezas: [], ajustes_al_patron: [] }] }
    const r = await correr(m, sobreAbrir({ dry_run: false, _simulacros: malos }))
    expect(r[0].json.resultado).toBe('cadena_abierta')
    expect(m.reg.agente.length).toBeGreaterThanOrEqual(2)
    for (const p of m.reg.agente) expect((p.cuerpo as any).dry_run).toBe(false)
    expect(m.al.campanas[0].seco).toBe(false)
  })
  it('🔴 el tope de presupuesto de planificación detiene antes de llamar al agente y el cable le cuenta a la sala que la campaña necesita a Emilio', async () => {
    const m = mundo({ agente: () => { throw new Error('no debía llamar al agente') } })
    await abrirYa(m)
    m.al.campanas[0].presupuesto_planificacion_usd = 0.5
    const e = await sub(m, IDS.estrategia, { campana_id: m.al.campanas[0].id, seco: true })
    expect(e[0].json.resultado).toBe('necesita_humano')
    expect(m.reg.agente).toHaveLength(0)
    expect(m.al.campanas[0].estado).toBe('necesita_humano')
  })
  it('🔴 si el calendario no queda, el cable cuenta necesita_humano (no «cadena_abierta»)', async () => {
    const m = mundo()
    const t = tandaBuena(m.cliente)
    const rev = { ...t, piezas: t.piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, tema: 'Ritual de revisión de la semana' } : p)) }
    const sigue = { piezas: [{ ...piezaBuena(m.cliente, 4, 'b', 'x'), tema: 'Ritual de revisión de la semana' }], ajustes_al_patron: [] }
    const r = await correr(m, sobreAbrir({ _simulacros: { estrategia: [m.cliente.estrategia], calendario: [rev, sigue] } }))
    expect(r[0].json.resultado).toBe('necesita_humano')
    expect(m.reg.cable[0].resultado).toBe('necesita_humano')
    expect(m.al.campanas[0].estado).toBe('necesita_humano')
  })
  it('el sobre del vigía en modo parte sin lote o sin filas se detiene antes de llamar a nadie; la tanda siguiente exige tanda ≥ 2', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const id = m.al.campanas[0].id
    const antes = m.reg.parte.length
    await expect(correr(m, sobreVigia({ modo: 'parte', campana_id: id, fila_ids: ['a'] }))).rejects.toThrow(/PUERTA_PARTE_SIN_LOTE/)
    await expect(correr(m, sobreVigia({ modo: 'parte', campana_id: id, lote: '2026-W42', fila_ids: [] }))).rejects.toThrow(/PUERTA_PARTE_SIN_LOTE/)
    await expect(correr(m, sobreVigia({ modo: 'tanda_siguiente', campana_id: id, tanda: 1 }))).rejects.toThrow(/PUERTA_TANDA_INVALIDA/)
    expect(m.reg.parte).toHaveLength(antes)
  })
  it('🔴 los sub-flujos exigen `seco` explícito y booleano: sin él, se detienen antes de gastar (estrategia, calendario y fechas)', async () => {
    const m = mundo()
    const id = await abrirYa(m)
    for (const flujo of [IDS.estrategia, IDS.calendario]) {
      await expect(sub(m, flujo, { campana_id: id })).rejects.toThrow(/CADENA_SECO_AUSENTE/)
      await expect(sub(m, flujo, { campana_id: id, seco: 'false' })).rejects.toThrow(/CADENA_SECO_AUSENTE/)
    }
    await expect(sub(m, IDS.fechas, { campana_id: id, pais: 'p', tipo: 't', ambito: 'a', anio: 2026 })).rejects.toThrow(/CADENA_SECO_AUSENTE/)
    expect(m.reg.cadena).toHaveLength(0)
  })
  it('el simulacro de un sub-flujo se ignora con seco:false (el agente se llama de verdad)', async () => {
    const cl = clienteUuid()
    const m = mundo({ estado: 'encendida', agente: agenteQueDevuelve({ estrategia: cl.estrategia }) })
    const res = await ACCIONES.campanas.abrir(m.al, { workflow_id: IDS.puerta, workflow_execution_id: 'x', client_id: UUID, seco: false, sala_ref: {} }, AHORA)
    const id = (res.cuerpo.campana as { id: string }).id
    const e = await sub(m, IDS.estrategia, { campana_id: id, seco: false, simulacro: [{ ...cl.estrategia, pilares: [] }] })
    expect(e[0].json.resultado).toBe('ok')
    expect(m.reg.agente).toHaveLength(1)
  })
  it('un sub-flujo repetido sobre algo ya hecho NO vuelve a llamar al agente (ya_hecha)', async () => {
    const m = mundo()
    await correr(m, sobreAbrir({ _simulacros: simulacros(m.cliente) }))
    const id = m.al.campanas[0].id
    const corridas = m.al.corridas.length
    const e = await sub(m, IDS.estrategia, { campana_id: id, seco: true, simulacro: [m.cliente.estrategia] })
    expect(e[0].json.resultado).toBe('ya_hecha')
    expect(m.al.corridas).toHaveLength(corridas)
    expect(m.reg.agente).toHaveLength(0)
  })
  it('🔴 un tope propio de vueltas: si el servidor pidiera correcciones sin fin, el flujo se detiene a las 6 (nunca un bucle)', async () => {
    const m = mundo()
    const original = (m.sim as any).o.http
    // el servidor simulado pide una corrección TRAS OTRA (defensa en profundidad: el servidor real no lo haría, su idempotencia lo corta antes)
    const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http: async (p, ctx) => {
      if (/\/api\/cadena\/estrategia/.test(p.url) && (p.cuerpo as any).accion === 'preparar') return { statusCode: 200, body: { corrida_id: 1, headers: { 'x-skip-editor-middleware': '1' }, run_sdk: { agent: 'x', task: 't' } } }
      if (/\/api\/cadena\/estrategia/.test(p.url) && (p.cuerpo as any).accion === 'guardar') return { statusCode: 200, body: { correccion: true, modo: 'tanda', fichas: [] } }
      return original(p, ctx)
    } })
    const id = await abrirYa(m)
    await expect(sim.ejecutar(IDS.estrategia, [{ json: { campana_id: id, seco: true, simulacro: Array.from({ length: 10 }, () => m.cliente.estrategia) } }])).rejects.toThrow(/CADENA_DEMASIADAS_VUELTAS/)
  })
  it('fechas: una página que NO bajó (404) no se le pasa al agente: el tipo queda sin fuente y la campaña sigue', async () => {
    const m = mundo({ config: { dominios_fechas: { 'feriados_locales|pais-de-practica': ['https://caida.test'] } }, paginas: { 'https://caida.test': null as never }, agente: () => { throw new Error('no debía llamar al agente') } })
    const id = await abrirYa(m)
    const r = await sub(m, IDS.fechas, { campana_id: id, seco: true, pais: 'pais-de-practica', tipo: 'feriados locales', ambito: 'ciudad', anio: 2026 })
    expect(r[0].json.resultado).toBe('sin_fuente')
    expect(m.reg.agente).toHaveLength(0)
  })
})
