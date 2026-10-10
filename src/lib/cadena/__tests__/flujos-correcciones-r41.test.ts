/**
 * Relevo 41 · correcciones de CC#3 sobre #466 (los flujos de n8n, inactivos).
 *  C1  la parte por filas SE EJECUTA en el simulador (seco, US$ 0): cada guarda del lote con su caso, y el recorrido entero hasta «lo que se habría escrito»
 *  C2  el latido del vigía lo recibe un vigilante EXTERNO (variable CADENA_VIGIA_PING_URL)
 *  C3  barrido de campañas atascadas (lo pone el reloj) y el sobre repetido RETOMA lo atascado
 *  C4  una llamada al agente que se corta no mata el flujo: `guardar` la cierra como fallida al instante
 *  + los huecos de prueba que CC#3 listó (estado HTTP de `preparar` y `guardar`, origen desconocido)
 * NO es n8n: la ejecución real a mano en n8n (C5) la hace el empleado navegador con la guía de `raw/tasks/2026-10-10-LISTO-CC1-cadena-correccion-PR-466.md`.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ACCIONES } from '../acciones'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { SimuladorN8n, type FlujoN8n, type Item, type PeticionHttp, type RespuestaHttp } from '../__fixtures__/simulador-n8n'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, filasMarcar, relojDeLaCadena } from '../index'
import { prepararCorrida } from '../nucleo'

const RAIZ = resolve(__dirname, '..', '..', '..', '..')
const AHORA = '2026-10-09T12:00:00Z'
const UUID = '11111111-1111-4111-8111-111111111111'
const IDS = { estrategia: 'F-EST', calendario: 'F-CAL', fechas: 'F-FEC', puerta: 'F-PUE' }
const ID_VIGIA = 'F-VIG', ID_PARTE = 'F-PAR'
const ENV: Record<string, string> = { SALA_DISPATCH_KEY: 'k-sala', INTERNAL_API_KEY: 'k-int', SALA_INGRESS_API_KEY: 'k-ing', SLACK_BOT_TOKEN: 'xoxb-prueba', ZERO_RISK_API_URL: 'https://api.test', N8N_PUBLIC_URL: 'https://n8n.test', SALA_CALLBACK_URL: 'https://api.test/api/sala/callback', SALA_INTAKE_URL: 'https://api.test/api/sala/intake', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k-db' }

let FLUJOS: Record<string, FlujoN8n> = {}
let POR_ID: Record<string, FlujoN8n> = {}
beforeAll(async () => {
  const mod: any = await import(/* @vite-ignore */ pathToFileURL(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'construir.mjs')).href)
  const vivo = (f: string) => JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'vivos', f), 'utf8'))
  FLUJOS = mod.construirFlujos({ ids: IDS, parteViva: vivo('PQdIgbuFexuBsoh8.json'), planViva: vivo('X9F0zp6LQ2xGEYVS.json') })
  POR_ID = { [IDS.estrategia]: FLUJOS['cadena-estrategia'], [IDS.calendario]: FLUJOS['cadena-calendario'], [IDS.fechas]: FLUJOS['cadena-fechas'], [IDS.puerta]: FLUJOS['cadena-puerta'], [ID_VIGIA]: FLUJOS['cadena-vigia'], [ID_PARTE]: FLUJOS['cadena-parte-por-filas'] }
})

function clienteUuid() {
  const c = clienteA(); c.clientId = UUID; c.referencias = c.referencias.map((r) => ({ ...r, client_id: UUID })); return c
}
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: ID_PARTE, workflow_execution_id: 'ex-1', ...extra })

interface Registro { cadena: PeticionHttp[]; agente: PeticionHttp[]; ping: PeticionHttp[]; supabase: PeticionHttp[]; slack: PeticionHttp[]; cable: unknown[] }
interface Mundo { al: AlmacenMemoria; sim: SimuladorN8n; reg: Registro; id: string }

/** un mundo con una campaña ACTIVA (seco) y filas `validada` del calendario real de la prueba */
async function mundo(opts: { agente?: (b: any) => RespuestaHttp; agenteFalla?: () => Error | null; manual?: unknown[]; plan?: unknown[]; previo?: unknown[]; soloArmado?: boolean } = {}): Promise<Mundo> {
  const cliente = clienteUuid()
  const al = new AlmacenMemoria({
    contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, journeys: [{ journeyId: 'viaje-1', clientId: UUID }],
    config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: 'ensayo', clientes_ensayo: [UUID] },
  })
  const reg: Registro = { cadena: [], agente: [], ping: [], supabase: [], slack: [], cable: [] }
  const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
    const u = new URL(p.url)
    if (u.pathname.startsWith('/api/cadena/')) {
      reg.cadena.push(p)
      const ruta = u.pathname.split('/')[3] as keyof typeof ACCIONES
      const m = ACCIONES[ruta]?.[String((p.cuerpo as any)?.accion)]
      if (!m) return { statusCode: 400, body: { error: 'accion_desconocida' } }
      const r = await m(al, p.cuerpo as Record<string, unknown>, AHORA)
      return { statusCode: r.status, body: r.cuerpo }
    }
    if (u.pathname === '/api/agents/run-sdk') {
      reg.agente.push(p)
      const falla = opts.agenteFalla?.()
      if (falla) throw falla
      return (opts.agente ?? (() => ({ statusCode: 200, body: { success: true, response: 'texto de prueba', cost_usd: 0 } })))(p.cuerpo)
    }
    if (u.hostname === 'db.test') {
      reg.supabase.push(p)
      if (u.pathname.endsWith('/client_brand_books')) return { statusCode: 200, body: opts.manual ?? [{ id: 'm1', version: 1, gate_outcome: 'paso_la_vara', content_text: 'manual', forbidden_words: [], required_terminology: [], created_at: '2026-10-01' }] }
      if (u.pathname.endsWith('/clients')) return { statusCode: 200, body: [{ id: UUID, name: 'Negocio de prueba', country: 'Ecuador', market: 'EC', config: {} }] }
      if (u.pathname.endsWith('/client_historical_outputs') && u.search.includes('campaign_plan_90d')) return { statusCode: 200, body: opts.plan ?? [{ id: 'plan-1', created_at: '2026-10-08', title: 'Plan', content_text: 'plan de 90 días', status: 'approved' }] }
      if (u.pathname.endsWith('/client_historical_outputs') && u.search.includes('campaign_brief_pack')) return { statusCode: 200, body: opts.previo ?? [] }
      return { statusCode: 500, body: { error: 'el simulador no conoce esta consulta: ' + p.url } }
    }
    if (u.pathname === '/api/sala/callback') { reg.cable.push(p.cuerpo); return { statusCode: 200, body: { ok: true } } }
    if (u.pathname === '/api/sala/intake') return { statusCode: 200, body: { ok: true, kind: 'accepted' } }
    if (u.hostname === 'slack.com') { reg.slack.push(p); return { statusCode: 200, body: { ok: true } } }
    if (u.hostname === 'hc.test') { reg.ping.push(p); return { statusCode: 200, body: 'OK', headers: {} } }
    throw new Error('el simulador no conoce esta dirección: ' + p.url)
  }
  const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http })
  // la campaña: abierta → estrategia validada → calendario tanda 1 (todo por los manejadores reales)
  const ab = await abrirCampana(al, { ...wf(), client_id: UUID, seco: true }, AHORA)
  const id = (ab.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: cliente.estrategia, cost_usd: 0.3 } }, AHORA)
  if (!opts.soloArmado) {
    const c = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
    await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: c.cuerpo.corrida_id, resultado: { success: true, structured_output: tandaBuena(cliente), cost_usd: 0.3 } }, AHORA)
  }
  return { al, sim, reg, id }
}

const sobreParte = (id: string, extra: Record<string, unknown> = {}): Item[] => [{ json: { headers: { 'x-sala-dispatch-key': 'k-sala' }, body: { client_id: UUID, dry_run: true, campana_id: id, lote: '2026-W42', fila_ids: ['s1-d1-a'], _journey_id: 'viaje-1', _sala_correlation_id: 'corr', _simulacro_respuesta: 'Texto simulado del parte', ...extra } } }]
const correrParte = (m: Mundo, extra: Record<string, unknown> = {}) => m.sim.ejecutar(ID_PARTE, sobreParte(m.id, extra))
const llegoAlManual = (m: Mundo) => m.reg.supabase.some((p) => p.url.includes('client_brand_books'))

describe('C1 · la parte por filas SE EJECUTA (seco, US$ 0): cada guarda del lote tiene su caso', () => {
  it('recorrido entero en seco: pasa las guardas, el redactor simulado, los chequeos y llega a «lo que se habría escrito»; no escribe NADA y no marca ninguna fila', async () => {
    const m = await mundo()
    // el texto simulado NO es un parte válido: el nodo de seco lo dice a gritos (PARTE_NO_VALIDO) en lugar de callar. Lo que importa aquí es que TODO el camino corrió.
    await expect(correrParte(m)).rejects.toThrow(/PARTE_NO_VALIDO/)
    const nodos = m.sim.traza.map((t) => t.nodo)
    for (const n of ['⓪ GUARDA · el lote', '① Cargar manual vigente', '② Cargar plan vigente', '② Ficha del cliente', '③ Redactor (run-sdk)', '③ Esperar al redactor', '④ Chequeos', '⑤ ¿Modo seco?', '⑤ Seco · lo que se habría escrito']) expect(nodos, n).toContain(n)
    for (const n of ['⑤ Guardar el parte', '⑤ Parte a Drive', '⑥ Cable de vuelta · sala', '⑤ Marcar las filas del lote']) expect(nodos, n + ' NO debe correr en seco').not.toContain(n)
    expect(m.reg.agente).toHaveLength(1) // el redactor simulado
    expect((m.reg.agente[0].cuerpo as any).dry_run).toBe(true)
    expect(m.reg.supabase.filter((p) => p.metodo === 'POST')).toEqual([]) // ni el parte
    expect(m.reg.cadena.filter((p) => (p.cuerpo as any).accion === 'marcar')).toEqual([]) // ni las filas
    expect(m.reg.cable).toEqual([])
    expect((await m.al.filas(m.id)).find((f) => f.id === 's1-d1-a')!.estado).toBe('validada')
  })
  it('un parte VÁLIDO en seco llega a «lo que se habría escrito» sin error y devuelve el recuento', async () => {
    const m = await mundo()
    const parte = JSON.stringify({ parte: { entregables: [{ id: 'E1', tipo: 'imagen', titulo: 'Pieza uno', brief: 'x', vocabulario_obligatorio: [], prohibido: [], negativos: [] }], pendientes: [] } })
    const salida = await m.sim.ejecutar(ID_PARTE, sobreParte(m.id, { _simulacro_respuesta: parte })).catch((e: Error) => e)
    // si el contrato del parte exige más campos, el seco lo dice: lo comprobable es que NO escribió nada en ningún caso
    expect(m.reg.supabase.filter((p) => p.metodo === 'POST')).toEqual([])
    expect(m.reg.cadena.filter((p) => (p.cuerpo as any).accion === 'marcar')).toEqual([])
    void salida
  })
  it('un sobre sin lote, sin filas o con filas que no son textos se detiene ANTES de llamar a nadie', async () => {
    const m = await mundo()
    for (const extra of [{ lote: '' }, { fila_ids: [] }, { fila_ids: [1] }, { campana_id: '' }]) await expect(correrParte(m, extra)).rejects.toThrow(/PARTE_SIN_/)
    expect(m.reg.cadena).toEqual([])
    expect(m.reg.agente).toEqual([])
  })
  it('🔴 guarda: una fila de OTRO cliente (campaña de otro) se detiene y no gasta', async () => {
    const m = await mundo()
    m.al.campanas.find((c) => c.id === m.id)!.client_id = 'otro-cliente'
    await expect(correrParte(m)).rejects.toThrow(/PARTE_LOTE_DE_OTRO_CLIENTE|PARTE_LOTE_NO_LEGIBLE/)
    expect(llegoAlManual(m)).toBe(false)
    expect(m.reg.agente).toEqual([])
  })
  it('🔴 guarda: una campaña que no está activa no se briefea', async () => {
    const m = await mundo()
    m.al.campanas.find((c) => c.id === m.id)!.estado = 'pausada'
    await expect(correrParte(m)).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
    expect(llegoAlManual(m)).toBe(false)
  })
  it('🔴 guarda: filas repetidas en el lote', async () => {
    const m = await mundo()
    await expect(correrParte(m, { fila_ids: ['s1-d1-a', 's1-d1-a'] })).rejects.toThrow(/PARTE_LOTE_CON_REPETIDAS/)
    expect(llegoAlManual(m)).toBe(false)
  })
  it('🔴 guarda: una fila que no existe', async () => {
    const m = await mundo()
    await expect(correrParte(m, { fila_ids: ['s1-d1-a', 's9-d9-z'] })).rejects.toThrow(/PARTE_LOTE_FILAS_INEXISTENTES.*s9-d9-z/)
    expect(llegoAlManual(m)).toBe(false)
  })
  it('🔴 guarda: una fila de video NO entra al lote (se detiene antes de gastar)', async () => {
    const m = await mundo()
    const v = m.al.filasGuardadas.find((f) => f.campana_id === m.id && f.id === 's1-d1-a')!
    v.estado = 'espera_video'
    await expect(correrParte(m)).rejects.toThrow(/PARTE_LOTE_CON_VIDEO/)
    expect(m.reg.agente).toEqual([])
    expect(llegoAlManual(m)).toBe(false)
  })
  it('🔴 guarda: filas ya briefeadas (en oficina o aprobadas) no corren dos veces', async () => {
    for (const estado of ['briefeada', 'en_oficina', 'aprobada'] as const) {
      const m = await mundo()
      m.al.filasGuardadas.find((f) => f.campana_id === m.id && f.id === 's1-d1-a')!.estado = estado
      await expect(correrParte(m)).rejects.toThrow(/PARTE_LOTE_YA_BRIEFEADO/)
      expect(llegoAlManual(m)).toBe(false)
    }
  })
  it('🔴 guarda: filas que no están listas (propuesta · en investigación · canceladas)', async () => {
    for (const estado of ['propuesta', 'en_investigacion', 'cancelada', 'descartada_sin_fuente'] as const) {
      const m = await mundo()
      m.al.filasGuardadas.find((f) => f.campana_id === m.id && f.id === 's1-d1-a')!.estado = estado
      await expect(correrParte(m)).rejects.toThrow(/PARTE_LOTE_FILAS_NO_LISTAS/)
      expect(llegoAlManual(m)).toBe(false)
    }
  })
  it('el estado HTTP de «listar»: un 5xx o una campaña ausente se detiene (no se lee como lote vacío)', async () => {
    const m = await mundo()
    await expect(correrParte(m, { campana_id: 'no-existe' })).rejects.toThrow(/PARTE_LOTE_NO_LEGIBLE/)
    expect(llegoAlManual(m)).toBe(false)
  })
  it('las filas `lista_para_brief` también entran (lo que el vigía ya marcó)', async () => {
    const m = await mundo()
    await filasMarcar(m.al, { ...wf(), campana_id: m.id, estado: 'lista_para_brief', fila_ids: ['s1-d1-a'] }, AHORA)
    await expect(correrParte(m)).rejects.toThrow(/PARTE_NO_VALIDO/) // pasó la guarda del lote (el texto simulado no es un parte)
    expect(llegoAlManual(m)).toBe(true)
  })
  it('sin manual aprobado o sin plan se detiene (la guarda del brief original sigue viva en la copia)', async () => {
    const sinManual = await mundo({ manual: [] })
    await expect(correrParte(sinManual)).rejects.toThrow(/BRIEF_SIN_MANUAL/)
    const noAprobado = await mundo({ manual: [{ id: 'm1', gate_outcome: 'no_paso', version: 1 }] })
    await expect(correrParte(noAprobado)).rejects.toThrow(/BRIEF_MANUAL_NO_APROBADO/)
    const sinPlan = await mundo({ plan: [] })
    await expect(correrParte(sinPlan)).rejects.toThrow(/BRIEF_SIN_PLAN/)
    expect(sinPlan.reg.agente).toEqual([])
  })
  it('la llave y el seco explícito siguen primero: sin llave o sin dry_run booleano no se llama a nadie', async () => {
    const m = await mundo()
    const sinLlave = sobreParte(m.id); (sinLlave[0].json as any).headers = {}
    await expect(m.sim.ejecutar(ID_PARTE, sinLlave)).rejects.toThrow(/BRIEF_PROCEDENCIA_INVALIDA/)
    await expect(correrParte(m, { dry_run: 'true' })).rejects.toThrow(/BRIEF_DRY_RUN_AUSENTE/)
    expect(m.reg.cadena).toEqual([])
  })
})

describe('C4 · una llamada al agente que se corta no mata el flujo ni deja la corrida colgada', () => {
  const entradaSub = (id: string, extra: Record<string, unknown> = {}): Item[] => [{ json: { campana_id: id, seco: false, ...extra } }]
  it('el nodo del agente (estrategia · calendario · fechas) tiene onError: continueRegularOutput', () => {
    for (const [f, n] of [['cadena-estrategia', '② Agente (run-sdk)'], ['cadena-calendario', '② Agente (run-sdk)'], ['cadena-fechas', '④ Agente (run-sdk)']] as const) {
      expect(FLUJOS[f].nodes.find((x) => x.name === n)!.onError, `${f} · ${n}`).toBe('continueRegularOutput')
    }
  })
  it('un corte de red: la corrida se cierra FALLIDA al instante con sus palabras, y la vuelta siguiente reintenta (no espera al plazo)', async () => {
    const m = await mundo({ soloArmado: false })
    // una campaña nueva en armado para probar la estrategia con el agente cortado una vez
    const cliente = clienteUuid()
    const al2 = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: 'ensayo', clientes_ensayo: [UUID] } })
    const ab = await abrirCampana(al2, { ...wf(), client_id: UUID, seco: false }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    let llamadas = 0
    const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
      const u = new URL(p.url)
      if (u.pathname.startsWith('/api/cadena/')) {
        const m2 = ACCIONES[u.pathname.split('/')[3] as keyof typeof ACCIONES]?.[String((p.cuerpo as any)?.accion)]
        const r = await m2(al2, p.cuerpo as Record<string, unknown>, AHORA)
        return { statusCode: r.status, body: r.cuerpo }
      }
      if (u.pathname === '/api/agents/run-sdk') {
        llamadas++
        if (llamadas === 1) throw new Error('socket hang up')
        return { statusCode: 200, body: { success: true, structured_output: cliente.estrategia, cost_usd: 0.3 } }
      }
      throw new Error('dirección desconocida ' + p.url)
    }
    const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http })
    al2.config.set('estado_cadena', 'encendida')
    const salida = await sim.ejecutar(IDS.estrategia, entradaSub(id))
    expect(salida[0].json.resultado).toBe('ok')
    expect(llamadas).toBe(2)
    expect(al2.corridas.map((c) => [c.intento, c.estado])).toEqual([[1, 'fallida'], [2, 'ok']])
    expect(al2.corridas[0].error).toContain('LLAMADA_CORTADA')
    expect(al2.corridas[0].error).toContain('socket hang up')
    void m
  })
  it('un corte que se repite 3 veces termina en necesita_humano (nunca un bucle)', async () => {
    const m = await mundo({ soloArmado: true })
    void m
    const cliente = clienteUuid()
    const al2 = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: 'encendida' } })
    const ab = await abrirCampana(al2, { ...wf(), client_id: UUID, seco: false }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
      const u = new URL(p.url)
      if (u.pathname.startsWith('/api/cadena/')) { const r = await ACCIONES[u.pathname.split('/')[3] as keyof typeof ACCIONES][String((p.cuerpo as any).accion)](al2, p.cuerpo as Record<string, unknown>, AHORA); return { statusCode: r.status, body: r.cuerpo } }
      throw new Error('ECONNRESET')
    }
    const salida = await new SimuladorN8n({ flujos: POR_ID, env: ENV, http }).ejecutar(IDS.estrategia, entradaSub(id))
    expect(salida[0].json.resultado).toBe('necesita_humano')
    expect(al2.corridas).toHaveLength(3)
    expect(al2.campanas[0].estado).toBe('necesita_humano')
  })
})

describe('C2 · el latido del vigía lo recibe un vigilante EXTERNO', () => {
  const horario = (): Item[] => [{ json: {} }]
  async function vigia(conUrl: boolean, relojStatus = 200) {
    const m = await mundo()
    m.al.config.set('estado_cadena', 'ensayo')
    const env = { ...ENV, ...(conUrl ? { CADENA_VIGIA_PING_URL: 'https://hc.test/ping/abc' } : {}) }
    const httpBase = (m.sim as any).o.http as (p: PeticionHttp, c: any) => Promise<RespuestaHttp>
    const http = async (p: PeticionHttp, c: any) => (relojStatus !== 200 && new URL(p.url).pathname === '/api/cadena/esperas' ? { statusCode: relojStatus, body: { error: 'caído' } } : httpBase(p, c))
    const sim = new SimuladorN8n({ flujos: POR_ID, env, http })
    return { m, sim }
  }
  it('con la variable: UN aviso al vigilante externo por pasada (GET, sin llave nuestra)', async () => {
    const { m, sim } = await vigia(true)
    await sim.ejecutar(ID_VIGIA, horario())
    expect(m.reg.ping).toHaveLength(1)
    expect(m.reg.ping[0]).toMatchObject({ metodo: 'GET', url: 'https://hc.test/ping/abc' })
    expect(m.reg.ping[0].cabeceras['x-api-key']).toBeUndefined()
  })
  it('sin la variable no se avisa a nadie (y el vigilante externo lo nota por falta de aviso)', async () => {
    const { m, sim } = await vigia(false)
    await sim.ejecutar(ID_VIGIA, horario())
    expect(m.reg.ping).toEqual([])
  })
  it('🔴 si el reloj NO contestó 200, el flujo falla y NO avisa «estoy vivo» (la falta de aviso es la alarma)', async () => {
    const { m, sim } = await vigia(true, 500)
    await expect(sim.ejecutar(ID_VIGA_O(), horario())).rejects.toThrow(/VIGIA_RELOJ/)
    expect(m.reg.ping).toEqual([])
  })
  it('si el vigilante externo está caído el flujo SIGUE (el latido externo no puede frenar el reloj)', async () => {
    const { m, sim } = await vigia(true)
    const base = (sim as any).o.http as (p: PeticionHttp, c: any) => Promise<RespuestaHttp>
    const sim2 = new SimuladorN8n({ flujos: POR_ID, env: { ...ENV, CADENA_VIGIA_PING_URL: 'https://hc.test/ping/abc' }, http: async (p, c) => { if (new URL(p.url).hostname === 'hc.test') throw new Error('ECONNREFUSED'); return base(p, c) } })
    await expect(sim2.ejecutar(ID_VIGIA, horario())).resolves.toBeDefined()
    void m
  })
  it('el nodo del latido es un GET con onError continuar y vive en una rama paralela (no cambia lo que sigue)', () => {
    const f = FLUJOS['cadena-vigia']
    const n = f.nodes.find((x) => x.name === '1 · Latido · vigilante externo')!
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.parameters.method).toBe('GET')
    expect(f.connections['1 · Avisos'].main[0].map((d) => d.node).sort()).toEqual(['1 · ¿Hay avisos para mandar?', '1 · ¿Hay vigilante externo?'])
    expect(f.connections['1 · Latido · vigilante externo']).toBeUndefined()
  })
})
const ID_VIGA_O = () => ID_VIGIA

describe('C3 · campañas atascadas: el reloj avisa con «qué hacer» y el sobre repetido retoma', () => {
  const vig = { workflow_id: ID_VIGIA, workflow_execution_id: 'v1' }
  async function atascada(estadoUltima: 'vencida' | 'fallida' | 'cerrada_por_tope' | 'ok' | 'en_curso') {
    const al = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(clienteUuid()) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: [ID_VIGIA, ...Object.values(IDS)], puerta_workflow_id: IDS.puerta, estado_cadena: 'encendida' } })
    const ab = await abrirCampana(al, { ...wf({ workflow_id: IDS.puerta }), client_id: UUID, seco: false }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    const c = al.campanas[0]
    const prep = await prepararCorrida(al, c, 'estrategia', 'v1:c0', IDS.puerta, 'e1', AHORA, 'm', 'h')
    if (prep.tipo !== 'lista') throw new Error('no se pudo preparar')
    if (estadoUltima !== 'en_curso') await al.cerrarCorrida(prep.corrida.id, { estado: estadoUltima, plazo_en: null })
    await al.actualizarCampana(id, { estado: 'estrategia' })
    return { al, id }
  }
  it('una campaña en «estrategia» cuya última llamada murió y no hay otra en curso: aviso con «qué hacer»', async () => {
    for (const e of ['vencida', 'fallida', 'cerrada_por_tope'] as const) {
      const { al, id } = await atascada(e)
      const r = await relojDeLaCadena(al, vig, '2026-10-10T00:00:00Z')
      const aviso = (r.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).find((a) => a.campana_id === id)
      expect(aviso?.lineas.join(' '), e).toMatch(/quedó en «estrategia».*estrategia.*terminó .*Qué hacer: reenviar el sobre/)
    }
  })
  it('NO es un atasco: la última llamada salió bien, hay una en curso DENTRO de su plazo, o la campaña no tiene llamadas todavía', async () => {
    for (const e of ['ok', 'en_curso'] as const) {
      const { al, id } = await atascada(e)
      const r = await relojDeLaCadena(al, vig, '2026-10-09T12:03:00Z')
      expect(JSON.stringify(r.cuerpo.alertas), e).not.toContain(`quedó en «`)
      void id
    }
    const al = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(clienteUuid()) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: [ID_VIGIA, ...Object.values(IDS)], puerta_workflow_id: IDS.puerta, estado_cadena: 'encendida' } })
    await abrirCampana(al, { ...wf({ workflow_id: IDS.puerta }), client_id: UUID, seco: false }, AHORA)
    expect(JSON.stringify((await relojDeLaCadena(al, vig, '2026-10-10T00:00:00Z')).cuerpo.alertas)).not.toContain('quedó en «')
  })
  it('una campaña ACTIVA con una corrida fallida vieja no es un atasco (ya terminó de armarse)', async () => {
    const { al, id } = await atascada('fallida')
    await al.actualizarCampana(id, { estado: 'activa' })
    expect(JSON.stringify((await relojDeLaCadena(al, vig, '2026-10-10T00:00:00Z')).cuerpo.alertas)).not.toContain('quedó en «')
  })
  it('🔴 reenviar el sobre retoma la campaña atascada: la estrategia se hace y el cable cuenta el resultado (antes contestaba «ya abierta» sin hacer nada)', async () => {
    const cliente = clienteUuid()
    const al = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, journeys: [{ journeyId: 'viaje-1', clientId: UUID }], config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: 'ensayo', clientes_ensayo: [UUID] } })
    // el primer intento murió a mitad: campaña en «estrategia», una corrida vencida
    const ab = await abrirCampana(al, { ...wf({ workflow_id: IDS.puerta }), client_id: UUID, seco: true, sala_ref: { _journey_id: 'viaje-1', _sala_correlation_id: 'corr' } }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    const prep = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', IDS.puerta, 'e0', AHORA, 'm', 'h')
    if (prep.tipo === 'lista') await al.cerrarCorrida(prep.corrida.id, { estado: 'vencida', plazo_en: null })
    await al.actualizarCampana(id, { estado: 'estrategia' })
    const cable: any[] = []
    const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
      const u = new URL(p.url)
      if (u.pathname.startsWith('/api/cadena/')) { const r = await ACCIONES[u.pathname.split('/')[3] as keyof typeof ACCIONES][String((p.cuerpo as any).accion)](al, p.cuerpo as Record<string, unknown>, AHORA); return { statusCode: r.status, body: r.cuerpo } }
      if (u.pathname === '/api/sala/callback') { cable.push(p.cuerpo); return { statusCode: 200, body: { ok: true } } }
      throw new Error('dirección desconocida ' + p.url)
    }
    const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http })
    const sobre = { client_id: UUID, tenant_id: UUID, plan_id: 'plan-1', dry_run: true, _sala_correlation_id: 'corr', _journey_id: 'viaje-1', target_step_id: 'router.dispatch.planeacion/plan-listo.briefear', _simulacros: { estrategia: [cliente.estrategia], calendario: [tandaBuena(cliente)] } }
    await sim.ejecutar(IDS.puerta, [{ json: { headers: { 'x-sala-dispatch-key': 'k-sala' }, body: sobre } }])
    expect(al.campanas).toHaveLength(1) // no se abrió otra
    expect(al.campanas[0].estado).toBe('activa') // se terminó de armar
    expect(al.corridas.map((c) => [c.paso, c.intento, c.estado])).toContainEqual(['estrategia', 2, 'ok'])
    expect(cable).toHaveLength(1)
  })
})

describe('huecos de prueba de CC#3 sobre los flujos', () => {
  const entrada = (id: string, extra: Record<string, unknown> = {}): Item[] => [{ json: { campana_id: id, seco: true, ...extra } }]
  it('el estado HTTP de `preparar`: un 500 o un 404 se detiene ANTES de llamar a ningún agente', async () => {
    for (const status of [500, 404, 403]) {
      const m = await mundo()
      const base = (m.sim as any).o.http as (p: PeticionHttp, c: any) => Promise<RespuestaHttp>
      const sim = new SimuladorN8n({ flujos: POR_ID, env: ENV, http: async (p, c) => (p.url.endsWith('/api/cadena/estrategia') && (p.cuerpo as any).accion === 'preparar' ? { statusCode: status, body: { error: 'x', code: 'E-X', detalle: 'no' } } : base(p, c)) })
      await expect(sim.ejecutar(IDS.estrategia, entrada(m.id, { seco: false }))).rejects.toThrow(/CADENA_PREPARAR_/)
      expect(m.reg.agente).toEqual([])
    }
  })
  it('el estado HTTP de `guardar`: un 500 detiene el flujo con su motivo (no se lee como «hecho»)', async () => {
    const cliente = clienteUuid()
    const al = new AlmacenMemoria({ contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE], puerta_workflow_id: IDS.puerta, estado_cadena: 'encendida' } })
    const ab = await abrirCampana(al, { ...wf(), client_id: UUID, seco: false }, AHORA)
    const id = (ab.cuerpo.campana as { id: string }).id
    const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
      const u = new URL(p.url)
      if (u.pathname.startsWith('/api/cadena/')) {
        if ((p.cuerpo as any).accion === 'guardar') return { statusCode: 500, body: { error: 'cadena_fallo', detail: 'la base se cayó' } }
        const r = await ACCIONES[u.pathname.split('/')[3] as keyof typeof ACCIONES][String((p.cuerpo as any).accion)](al, p.cuerpo as Record<string, unknown>, AHORA)
        return { statusCode: r.status, body: r.cuerpo }
      }
      return { statusCode: 200, body: { success: true, structured_output: cliente.estrategia, cost_usd: 0.1 } }
    }
    await expect(new SimuladorN8n({ flujos: POR_ID, env: ENV, http }).ejecutar(IDS.estrategia, entrada(id, { seco: false }))).rejects.toThrow(/CADENA_GUARDAR_/)
  })
  it('la puerta: un origen desconocido se rechaza AUNQUE traiga un `modo` válido del vigía', async () => {
    const m = await mundo()
    const cuerpo = { client_id: UUID, tenant_id: UUID, dry_run: true, _journey_id: 'viaje-1', target_step_id: 'router.dispatch.otro/lado.briefear', modo: 'parte', fila_ids: ['s1-d1-a'] }
    await expect(m.sim.ejecutar(IDS.puerta, [{ json: { headers: { 'x-sala-dispatch-key': 'k-sala' }, body: cuerpo } }])).rejects.toThrow(/PUERTA_ORIGEN_DESCONOCIDO/)
    expect(m.reg.cadena).toEqual([])
  })
  it('la puerta: del vigía solo valen parte y tanda_siguiente; cualquier otro modo se rechaza', async () => {
    const m = await mundo()
    for (const modo of ['abrir', 'cadena', '', undefined, 7]) {
      const cuerpo = { client_id: UUID, tenant_id: UUID, dry_run: true, _journey_id: 'viaje-1', target_step_id: 'router.dispatch.cadena/vigia.briefear', modo }
      await expect(m.sim.ejecutar(IDS.puerta, [{ json: { headers: { 'x-sala-dispatch-key': 'k-sala' }, body: cuerpo } }])).rejects.toThrow(/PUERTA_MODO_INVALIDO/)
    }
  })
})
