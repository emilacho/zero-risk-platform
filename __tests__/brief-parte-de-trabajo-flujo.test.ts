/**
 * EL FLUJO `zero-risk/brief` v2 (POR TANDAS) · pruebas a costo cero · CC#1 · 2026-09-29.
 * Corre el CÓDIGO EXACTO de cada nodo (`codigoDeNodo`, lo mismo que el constructor pega en n8n, con sus textos inyectados) con `$`,
 * `$input`, `$env` simulados, y comprueba el grafo. Reglas que NO se negocian:
 *   · el dry_run LLEGA hasta CADA nodo que paga (la lista y cada tanda) · §1.3 del encargo
 *   · SIN VUELTA NO SE GUARDA NADA (Emilio 29-sep) · la guardia de «repetido» ignora partes ilegibles
 *   · cada llamada cabe en los 800 s de la función de Vercel (corrida 157555: 32 min en una sola llamada ⇒ el callback nunca volvió)
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const { construirFlujo, N, codigoDeNodo, ESPERA_SEGUNDOS } = await import(pathToFileURL(join(DIR, 'construir-brief.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string>; workflowId?: string; executionId?: string }
async function correrNodo(clave: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (nombre: string) => {
    if (!(ctx.refs && nombre in ctx.refs)) throw new Error('nodo no ejecutado: ' + nombre)
    return { first: () => ({ json: ctx.refs![nombre] }), all: () => [{ json: ctx.refs![nombre] }] }
  }
  const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave))
  return fn($input, $, ctx.env ?? {}, items[0]?.json, { id: ctx.workflowId ?? 'WF-1' }, { id: ctx.executionId ?? '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const LLAVE = 'llave-de-despacho-de-prueba-0123456789abcdef'
const sobre = (body: Record<string, unknown> = {}, llave = LLAVE) => ({
  input: [{ body: { client_id: CID, plan_id: 'plan-1', dry_run: true, ...body }, headers: { 'x-sala-dispatch-key': llave } }],
  env: { SALA_DISPATCH_KEY: LLAVE },
})

describe('⓪ el sobre · la llave · el modo seco · el tamaño de la tanda', () => {
  it('con llave correcta y dry_run explícito ⇒ pasa y NORMALIZA el sobre (tanda por defecto 2)', async () => {
    const [{ json }] = await correrNodo('sobre', sobre({ _journey_id: 'j1', _sala_correlation_id: 'c1', forzar: true }))
    expect(json).toMatchObject({ client_id: CID, dry_run: true, forzar: true, tanda: 2, _journey_id: 'j1', _sala_correlation_id: 'c1' })
  })
  it('la tanda solo puede ser 1, 2 o 3; cualquier otra cosa vuelve a 2 (nunca una llamada enorme)', async () => {
    for (const [pedida, esperada] of [[1, 1], [3, 3], [4, 2], [0, 2], ['3', 3], [2.5, 2], [null, 2], [undefined, 2], ['mil', 2]] as const) {
      const [{ json }] = await correrNodo('sobre', sobre({ tanda: pedida }))
      expect(json.tanda, String(pedida)).toBe(esperada)
    }
  })
  it('ROJO · sin dry_run explícito (ausente, string «true», null, 0) ⇒ BRIEF_DRY_RUN_AUSENTE: no se asume', async () => {
    for (const malo of [undefined, 'true', null, 0]) await expect(correrNodo('sobre', sobre({ dry_run: malo }))).rejects.toThrow(/BRIEF_DRY_RUN_AUSENTE/)
  })
  it('ROJO · llave ausente/incorrecta/de otro largo ⇒ BRIEF_PROCEDENCIA_INVALIDA · motor sin llave ⇒ BRIEF_CERRADO', async () => {
    for (const l of ['', 'otra-llave', LLAVE + 'x']) await expect(correrNodo('sobre', sobre({}, l))).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    await expect(correrNodo('sobre', { ...sobre(), env: {} })).rejects.toThrow(/BRIEF_CERRADO/)
  })
  it('ROJO · client_id ausente o que no es uuid ⇒ se DETIENE', async () => {
    await expect(correrNodo('sobre', sobre({ client_id: undefined }))).rejects.toThrow(/BRIEF_SIN_CLIENTE/)
    await expect(correrNodo('sobre', sobre({ client_id: 'x/../?select=*' }))).rejects.toThrow(/BRIEF_CLIENTE_INVALIDO/)
  })
  it('el simulacro ({lista, tandas}) SOLO existe en modo seco: con dry_run:false se ignora por completo', async () => {
    const sim = { lista: '{}', tandas: ['{}'] }
    const [{ json: seco }] = await correrNodo('sobre', sobre({ dry_run: true, _simulacro: sim }))
    expect(seco.simulacro).toEqual(sim)
    const [{ json: real }] = await correrNodo('sobre', sobre({ dry_run: false, _simulacro: sim }))
    expect(real.simulacro).toBeNull()
  })
})

describe('① y ② las GUARDA · y la guardia de repetido', () => {
  const N0 = '⓪ Sobre · llave · modo seco'
  const env = { client_id: CID, dry_run: true, plan_id: null, forzar: false }
  it('ROJO · consulta vacía ⇒ BRIEF_SIN_MANUAL · sin aprobar ⇒ BRIEF_MANUAL_NO_APROBADO', async () => {
    await expect(correrNodo('guardaManual', { input: [{}], refs: { [N0]: env } })).rejects.toThrow(/BRIEF_SIN_MANUAL/)
    await expect(correrNodo('guardaManual', { input: [{ id: 'm1', gate_outcome: 'no_paso', version: 1 }], refs: { [N0]: env } })).rejects.toThrow(/BRIEF_MANUAL_NO_APROBADO/)
    const [{ json }] = await correrNodo('guardaManual', { input: [{ id: 'm1', gate_outcome: 'paso_la_vara', version: 3, forbidden_words: ['premium'], content_text: 'T' }], refs: { [N0]: env } })
    expect(json).toMatchObject({ manual_id: 'm1', manual_version: 3, forbidden_words: ['premium'], manual_texto: 'T' })
  })
  it('ROJO · sin plan ⇒ BRIEF_SIN_PLAN · plan sin texto ⇒ BRIEF_PLAN_VACIO · plan distinto del sobre ⇒ se usa el vigente y se DECLARA', async () => {
    const prev = { ...env, manual_id: 'm1' }
    await expect(correrNodo('guardaPlan', { input: [{}], refs: { [N.guardaManual]: prev } })).rejects.toThrow(/BRIEF_SIN_PLAN/)
    await expect(correrNodo('guardaPlan', { input: [{ id: 'p1', content_text: '  ' }], refs: { [N.guardaManual]: prev } })).rejects.toThrow(/BRIEF_PLAN_VACIO/)
    const [{ json }] = await correrNodo('guardaPlan', { input: [{ id: 'p2', content_text: 'PLAN' }], refs: { [N.guardaManual]: { ...prev, plan_id: 'p1' } } })
    expect(json).toMatchObject({ plan_id: 'p2', plan_del_sobre: 'p1', plan_del_sobre_distinto: true })
  })
  it('ROJO · el mismo plan dos veces NO corre (BRIEF_REPETIDO); forzar o modo seco lo permiten y lo declaran', async () => {
    const base = { ...env, plan_id: 'p1', dry_run: false, forzar: false }
    const previo = [{ id: 'parte-viejo', created_at: 't' }]
    await expect(correrNodo('guardaRepetido', { input: previo, refs: { [N.guardaPlan]: base } })).rejects.toThrow(/BRIEF_REPETIDO/)
    const [{ json: f }] = await correrNodo('guardaRepetido', { input: previo, refs: { [N.guardaPlan]: { ...base, forzar: true } } })
    expect(f.repetido_declarado).toBe(true)
    const [{ json: s }] = await correrNodo('guardaRepetido', { input: previo, refs: { [N.guardaPlan]: { ...base, dry_run: true } } })
    expect(s.repetido_declarado).toBe(true)
  })
  it('🔴 la guardia de repetido IGNORA partes ilegibles: la consulta pide provenance_tag->>legible=eq.true (un parte roto no impide reintentar)', () => {
    const f = construirFlujo()
    const url = f.nodes.find((n: { name: string }) => n.name === N.repetido).parameters.url as string
    expect(url).toContain('provenance_tag->>legible=eq.true')
    expect(url).toContain('provenance_tag->>plan_id=eq.')
  })
})

const LISTA = {
  lista: {
    entregables: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'BRF-000' + n, plataforma: 'Instagram', tipo_de_pieza: 'imagen', que_es: 'pieza ' + n, de_que_parte_del_plan: "Sección 5 — 'algo del plan'" })),
    pendientes_declarados: [{ entregable: 'Reel', plataforma: 'Instagram', motivo: 'video' }],
    huecos: ['presupuesto'],
    contradicciones_plan_vs_manual: [],
    dependencias: ['BRF-0001 antes de BRF-0002'],
  },
}
const briefCompleto = (id: string) => ({
  id, plataforma: 'Instagram', tipo_de_pieza: 'imagen', que_es: 'q ' + id, de_que_parte_del_plan: "Sección 5 — 'algo del plan'", objetivo: 'o', segmento: 'Adulto urbano guayaquileño de 25 a 45 años; NO es el turista.',
  protagonista: 'p', mensaje: 'Mensaje de ' + id + '.', hipotesis: 'h', limites: 'l', vocabulario_obligatorio: ['Olón'], prohibido: ['premium'], sintaxis: 's',
  visual: { capa_que_manda: 'producto', descripcion: 'd', muestra: 'm' }, llamado_a_la_accion: 'c', variantes: 'v', negativos: ['n'], aprueba_y_para_cuando: 'a', presupuesto: null,
})

describe('③a la LISTA · 🔴 el dry_run llega al nodo que paga', () => {
  const prev = (dry: boolean, extra: Record<string, unknown> = {}) => ({ client_id: CID, dry_run: dry, plan_id: 'p1', plan_texto: 'PLAN DE 90 DIAS', manual_id: 'm1', manual_version: 2, manual_texto: '{"visual":{}}', tanda: 2, simulacro: null, ...extra })
  const N2b = '② ¿Ya hay parte de este plan? · guarda'
  it('ROJO · dry_run:true ⇒ cuerpo.dry_run === true · dry_run:false ⇒ false EXPLÍCITO (nunca ausente)', async () => {
    const [{ json: a }] = await correrNodo('listaPedido', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(true) } })
    expect(a.cuerpo.dry_run).toBe(true)
    const [{ json: b }] = await correrNodo('listaPedido', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(false) } })
    expect(b.cuerpo.dry_run).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(b.cuerpo, 'dry_run')).toBe(true)
  })
  it('el cuerpo trae lo que exige el corredor: agente, force_restart, workflow_id/ejecución, callback, cliente', async () => {
    const [{ json }] = await correrNodo('listaPedido', { input: [{ name: 'X' }], refs: { [N2b]: prev(true) }, workflowId: 'WFX', executionId: '777' })
    expect(json.cuerpo).toMatchObject({ agent: 'campaign-brief-agent', client_id: CID, workflow_id: 'WFX', workflow_execution_id: '777', force_restart: true, callback_url: 'https://n8n.test/webhook-waiting/999' })
  })
  it('el pedido pide SOLO la lista (no los briefs), con manual, plan, referencia, reglas de contradicción/video/centinelas y la orden de ser conciso', async () => {
    const [{ json }] = await correrNodo('listaPedido', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(true) } })
    const t: string = json.cuerpo.task
    for (const s of ['SOLO LA LISTA CERRADA', 'NO escribas los briefs completos', 'PLAN DE 90 DIAS', '{"visual":{}}', 'CONTRADICE al manual', 'NO video ni audio', 'CENTINELAS', 'EL BRIEF DE UN ENTREGABLE', 'Sé CONCISO', 'comillas simples', 'Náufrago']) expect(t, s).toContain(s)
    expect(t).not.toContain('__REGLAS__')
    expect(t).not.toContain('__REFERENCIA__')
  })
  const arm = { '③a Armar el pedido de la lista': { ...prev(true), cuerpo: { dry_run: true }, client_name: 'x', paso: 'lista' } }
  it('la vuelta de la lista: JSON legible ⇒ lista_ok; el simulacro solo en modo seco', async () => {
    const [{ json: real }] = await correrNodo('listaVuelta', { input: [{ body: { response: '```json\n' + JSON.stringify(LISTA) + '\n```' } }], refs: arm })
    expect(real).toMatchObject({ lista_llego: true, lista_ok: true, simulacro_usado: false })
    expect(real.lista.entregables).toHaveLength(7)
    const conSim = { '③a Armar el pedido de la lista': { ...arm['③a Armar el pedido de la lista'], simulacro: { lista: JSON.stringify(LISTA) } } }
    const [{ json: seco }] = await correrNodo('listaVuelta', { input: [{ body: { response: 'FALSA' } }], refs: conSim })
    expect(seco).toMatchObject({ lista_ok: true, simulacro_usado: true, lista_real: true })
    const realConSim = { '③a Armar el pedido de la lista': { ...arm['③a Armar el pedido de la lista'], dry_run: false, simulacro: { lista: JSON.stringify(LISTA) } } }
    const [{ json: r2 }] = await correrNodo('listaVuelta', { input: [{ body: { response: 'FALSA' } }], refs: realConSim })
    expect(r2).toMatchObject({ lista_ok: false, simulacro_usado: false })
  })
  it('ROJO · espera agotada ⇒ lista_llego:false con motivo · texto sin JSON ⇒ lista_ok:false con motivo y muestra', async () => {
    const [{ json: a }] = await correrNodo('listaVuelta', { input: [{}], refs: arm })
    expect(a).toMatchObject({ lista_llego: false, lista_ok: false })
    expect(a.motivo).toMatch(/no llegó/i)
    const [{ json: b }] = await correrNodo('listaVuelta', { input: [{ body: { response: 'Éstos son los entregables: 1) anuncio' } }], refs: arm })
    expect(b).toMatchObject({ lista_llego: true, lista_ok: false })
    expect(b.motivo).toMatch(/no es legible/)
  })
})

describe('③b las TANDAS · cada llamada cabe en el tope', () => {
  const ctx = { client_id: CID, dry_run: true, client_name: 'X', plan_id: 'p1', plan_texto: 'PLAN', manual_id: 'm1', manual_version: 1, manual_texto: 'M', lista: LISTA.lista, tanda: 2, simulacro: null }
  it('7 entregables en tandas de 2 ⇒ 4 tandas (2,2,2,1) · de 3 ⇒ 3 tandas · de 1 ⇒ 7', async () => {
    for (const [tanda, esperado] of [[2, [2, 2, 2, 1]], [3, [3, 3, 1]], [1, [1, 1, 1, 1, 1, 1, 1]]] as const) {
      const out = await correrNodo('armarTandas', { input: [{ ...ctx, tanda }] })
      expect(out.map((o: { json: { ids: string[] } }) => o.json.ids.length)).toEqual(esperado)
      expect(out.map((o: { json: { tandas_total: number } }) => o.json.tandas_total).every((t: number) => t === esperado.length)).toBe(true)
    }
    const todos = (await correrNodo('armarTandas', { input: [ctx] })).flatMap((o: { json: { ids: string[] } }) => o.json.ids)
    expect(todos).toEqual(LISTA.lista.entregables.map((e) => e.id)) // ni uno perdido, ni repetido, en el orden de la lista
  })
  it('ROJO · el pedido de la tanda lleva dry_run del sobre y pide SOLO los ids de su tanda', async () => {
    const t = { tanda_n: 2, tandas_total: 4, ids: ['BRF-0003', 'BRF-0004'], entregables_lista: LISTA.lista.entregables.slice(2, 4) }
    const [{ json: seco }] = await correrNodo('tandaPedido', { input: [t], refs: { '③a ¿Llegó la lista?': ctx } })
    expect(seco.cuerpo.dry_run).toBe(true)
    const [{ json: real }] = await correrNodo('tandaPedido', { input: [t], refs: { '③a ¿Llegó la lista?': { ...ctx, dry_run: false } } })
    expect(real.cuerpo.dry_run).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(real.cuerpo, 'dry_run')).toBe(true)
    expect(seco.cuerpo).toMatchObject({ agent: 'campaign-brief-agent', force_restart: true, client_id: CID })
    const task: string = seco.cuerpo.task
    expect(task).toContain('BRF-0003, BRF-0004')
    expect(task).toContain('tanda 2 de 4')
    expect(task).toContain('NO la reescribas')
    expect(task).toContain('EL BRIEF DE UN ENTREGABLE')
    expect(task).not.toContain('__REGLAS__')
  })
  const pedido = { '③b Armar el pedido de la tanda': { tanda_n: 1, tandas_total: 2, ids: ['BRF-0001', 'BRF-0002'], cuerpo: { dry_run: true } }, '③a ¿Llegó la lista?': ctx }
  it('la vuelta de la tanda: legible ⇒ sus briefs · simulacro por número de tanda solo en seco · ilegible ⇒ se guarda el texto CRUDO', async () => {
    const ok = JSON.stringify({ tanda: { entregables: [briefCompleto('BRF-0001'), briefCompleto('BRF-0002')] } })
    const [{ json: a }] = await correrNodo('tandaVuelta', { input: [{ body: { response: ok } }], refs: pedido })
    expect(a).toMatchObject({ tanda_n: 1, llego: true, legible: true, dry_run_enviado: true })
    expect(a.entregables).toHaveLength(2)
    const conSim = { ...pedido, '③a ¿Llegó la lista?': { ...ctx, simulacro: { tandas: [ok] } } }
    const [{ json: b }] = await correrNodo('tandaVuelta', { input: [{ body: { response: 'FALSA' } }], refs: conSim })
    expect(b).toMatchObject({ legible: true, simulacro_usado: true })
    const [{ json: c }] = await correrNodo('tandaVuelta', { input: [{ body: { response: 'texto roto {"tanda": {' } }], refs: pedido })
    expect(c).toMatchObject({ llego: true, legible: false, texto_crudo: 'texto roto {"tanda": {' })
    const [{ json: d }] = await correrNodo('tandaVuelta', { input: [{}], refs: pedido })
    expect(d).toMatchObject({ llego: false, legible: false })
    expect(d.motivo).toMatch(/NO llegó/)
  })
})

describe('③c juntar · llegó TODO o no llegó', () => {
  const N3a = '③a ¿Llegó la lista?'
  const c0 = { client_id: CID, dry_run: true, client_name: 'X', plan_id: 'p1', plan_texto: 'PLAN', manual_id: 'm1', manual_version: 1, tanda: 2, lista: LISTA.lista, lista_llego: true, lista_real: true, lista_ok: true, cuerpo: { dry_run: true }, simulacro_usado: false, lista_costo_usd: 0.1, lista_modelo: 'm' }
  const tandaOk = (n: number, ids: string[]) => ({ tanda_n: n, tandas_total: 4, ids_pedidos: ids, llego: true, llego_real: true, legible: true, entregables: ids.map(briefCompleto), texto_crudo: null, costo_usd: 0.4, dry_run_enviado: true })
  const tandas = [tandaOk(2, ['BRF-0003', 'BRF-0004']), tandaOk(1, ['BRF-0001', 'BRF-0002']), tandaOk(4, ['BRF-0007']), tandaOk(3, ['BRF-0005', 'BRF-0006'])]
  it('todas las tandas volvieron (aunque lleguen en desorden) ⇒ llego_la_vuelta:true y los briefs salen en el ORDEN de la lista, con costo sumado y todos los dry_run enviados', async () => {
    const [{ json }] = await correrNodo('juntar', { input: tandas, refs: { [N3a]: c0 } })
    expect(json.llego_la_vuelta).toBe(true)
    const p = JSON.parse(json.texto).parte
    expect(p.entregables.map((e: { id: string }) => e.id)).toEqual(LISTA.lista.entregables.map((e) => e.id))
    expect(p.pendientes_declarados).toHaveLength(1)
    expect(p.huecos).toEqual(['presupuesto'])
    expect(json.vuelta_costo_usd).toBeCloseTo(0.1 + 0.4 * 4)
    expect(json.dry_runs_enviados).toEqual([true, true, true, true, true])
    expect(json.lista_ids).toHaveLength(7)
  })
  it('ROJO · falta la vuelta de UNA tanda ⇒ llego_la_vuelta:false con motivo que dice cuál · NO se da por exitosa', async () => {
    const faltante = { ...tandas[0], llego: false, legible: false, entregables: [], motivo: 'x' }
    const [{ json }] = await correrNodo('juntar', { input: [faltante, tandas[1], tandas[2], tandas[3]], refs: { [N3a]: c0 } })
    expect(json.llego_la_vuelta).toBe(false)
    expect(json.tandas_sin_vuelta).toEqual([2])
    expect(json.motivo).toMatch(/tandas sin llegar \[2\]/)
  })
  it('una tanda que llegó pero es ilegible: llegó todo, pero sus ids quedan sin brief (④ lo declara) y su texto crudo se conserva', async () => {
    const rota = { ...tandas[0], legible: false, entregables: [], texto_crudo: 'CRUDO' }
    const [{ json }] = await correrNodo('juntar', { input: [rota, tandas[1], tandas[2], tandas[3]], refs: { [N3a]: c0 } })
    expect(json.llego_la_vuelta).toBe(true)
    expect(json.tandas_ilegibles).toEqual([2])
    expect(JSON.parse(json.texto).parte.entregables).toHaveLength(5)
    expect(json.respuestas_crudas_ilegibles.join(' ')).toContain('CRUDO')
  })
  it('ids de briefs que la lista NO tiene se declaran (ids_extra_no_pedidos), no se cuelan', async () => {
    const extra = { ...tandas[2], entregables: [briefCompleto('BRF-0007'), briefCompleto('BRF-0099')] }
    const [{ json }] = await correrNodo('juntar', { input: [tandas[0], tandas[1], extra, tandas[3]], refs: { [N3a]: c0 } })
    expect(json.ids_extra_no_pedidos).toEqual(['BRF-0099'])
    expect(JSON.parse(json.texto).parte.entregables.map((e: { id: string }) => e.id)).not.toContain('BRF-0099')
  })
})

describe('④ chequeos con la lista · ⑤ ⑥ el cierre · SIN VUELTA NO SE GUARDA NADA', () => {
  const N3a = '③a ¿Llegó la lista?'
  const base = { client_id: CID, dry_run: false, client_name: 'X', plan_id: 'p1', plan_texto: "Sección 5 algo del plan", manual_id: 'm1', manual_version: 1, tanda: 2, forbidden_words: [], required_terminology: [], llego_la_vuelta: true, vuelta_real: true, simulacro_usado: false, tandas_total: 2, tandas_ilegibles: [], respuestas_crudas_ilegibles: [], dry_runs_enviados: [false, false, false], vuelta_costo_usd: 1, vuelta_modelo: 'm', lista_ids: ['BRF-0001', 'BRF-0002'], ids_extra_no_pedidos: [], _sala_correlation_id: null, _journey_id: null }
  const conTexto = (ids: string[], extra: Record<string, unknown> = {}) => ({ ...base, texto: JSON.stringify({ parte: { entregables: ids.map(briefCompleto), pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [] } }), ...extra })
  it('parte completo ⇒ ok, legible:true, provenance_tag.legible:true (cuenta para la guardia de repetido)', async () => {
    const [{ json }] = await correrNodo('chequeos', { input: [conTexto(['BRF-0001', 'BRF-0002'])] })
    expect(json).toMatchObject({ parte_legible: true, chequeos_ok: true, entregables: 2, todas_las_llamadas_con_el_dry_run_del_sobre: true, llamadas_al_redactor: 3 })
    expect(json.fila_parte.provenance_tag).toMatchObject({ legible: true, tandas: 2 })
  })
  it('ROJO · un id de la lista SIN brief ⇒ hallazgo entregable_sin_brief (se declara, no se rellena)', async () => {
    const [{ json }] = await correrNodo('chequeos', { input: [conTexto(['BRF-0001'], { tandas_ilegibles: [1] })] })
    expect(json.hallazgos.map((h: { chequeo: string }) => h.chequeo)).toContain('entregable_sin_brief')
    expect(json.hallazgos.find((h: { chequeo: string }) => h.chequeo === 'entregable_sin_brief').entregable).toBe('BRF-0002')
  })
  it('ROJO · ningún brief legible (0 entregables) ⇒ parte_legible:false y provenance_tag.legible:false (un parte roto NO bloquea el reintento) y se guardan las respuestas crudas', async () => {
    const [{ json }] = await correrNodo('chequeos', { input: [conTexto([], { respuestas_crudas_ilegibles: ['CRUDO 1'] })] })
    expect(json.parte_legible).toBe(false)
    expect(json.fila_parte.provenance_tag).toMatchObject({ legible: false, respuestas_crudas_ilegibles: ['CRUDO 1'] })
    expect(json.fila_parte.content).toContain('CRUDO 1')
  })
  it('⑤ un parte ilegible se guarda CRUDO pero NO va a Drive y NO sale «exitoso»; uno legible con guardado + PDF sí', async () => {
    const ch = (legible: boolean) => ({ parte_legible: legible, chequeos_ok: true, hallazgos: [], entregables: 2, pendientes_declarados: 0, client_id: CID, payload_cable: { resultado: 'x' } })
    const [{ json: mal }] = await correrNodo('cierre', { refs: { '④ Chequeos': ch(false), '⑤ Guardar el parte': { body: [{ id: 'fila-1' }] } } })
    expect(mal.ok).toBe(false)
    expect(mal.problemas.join(' ')).toMatch(/NO es legible/)
    expect(mal.problemas.join(' ')).not.toMatch(/Drive no devolvió/)
    expect(mal.payload_cable.resultado).toBe('parte_con_problemas')
    const [{ json: bien }] = await correrNodo('cierre', { refs: { '④ Chequeos': ch(true), '⑤ Guardar el parte': { body: [{ id: 'fila-1' }] }, '⑤ Parte a Drive': { body: { ok: true, file_id: 'F1', url: 'u' } } } })
    expect(bien).toMatchObject({ ok: true, parte_guardado_id: 'fila-1', file_id: 'F1' })
    expect(bien.payload_cable.resultado).toBe('parte_terminado')
    const [{ json: sinGuardar }] = await correrNodo('cierre', { refs: { '④ Chequeos': ch(true), '⑤ Guardar el parte': { body: {} }, '⑤ Parte a Drive': { body: { ok: true, file_id: 'F1' } } } })
    expect(sinGuardar.ok).toBe(false)
    expect(sinGuardar.problemas.join(' ')).toMatch(/NO quedó guardado/)
  })
  it('🔴 SIN VUELTA: declara y avisa a la sala «parte_sin_vuelta», y NO escribe nada (escribio_algo:false)', async () => {
    const env = { client_id: CID, dry_run: false, tenant_id: CID, _sala_correlation_id: 'corr-1', _journey_id: 'j1' }
    const [{ json }] = await correrNodo('sinVuelta', { input: [{ motivo: 'faltan vueltas: tandas sin llegar [2]', tandas_sin_vuelta: [2] }], refs: { [N.sobre]: env, [N3a]: { motivo: 'm', lista_llego: true, lista_ok: true } } })
    expect(json).toMatchObject({ sin_vuelta: true, escribio_algo: false, dry_run: false })
    expect(json.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'brief', resultado: 'parte_sin_vuelta', _sala_correlation_id: 'corr-1' })
    expect(json.detalle.tandas_sin_vuelta).toEqual([2])
    // y en modo seco, el reporte valida la forma sin avisar ni escribir
    const [{ json: seco }] = await correrNodo('secoSinVueltaCierre', { input: [json] })
    expect(seco).toMatchObject({ seco: true, sin_vuelta: true, escrituras_reales: 0, formas_validas: true })
  })
  it('⑥ el cable de vuelta NO puede ser mudo si la sala despachó; un disparo a mano no falla', async () => {
    await expect(correrNodo('volvio', { input: [{ ok: false, code: 'HTTP 500' }], refs: { [N.sobre]: { _sala_correlation_id: 'corr-1' } } })).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
    const [{ json }] = await correrNodo('volvio', { input: [{ ok: false }], refs: { [N.sobre]: { _sala_correlation_id: null } } })
    expect(json.despachado_por_la_sala).toBe(false)
  })
})

describe('el corredor RECHAZA el trabajo (tope de gasto §150, saldo, fallo): se DICE la causa, no un «no llegó» genérico', () => {
  const rechazo = { body: { success: false, error: 'cost_cap_exceeded', inner: { code: 'E-CAP-150', detail: '§150 spend cap · client cumulative $8.01 >= cap $8.00 (24h window) · invocation blocked' } } }
  it('lista: success:false ⇒ lista_llego:false y el motivo trae el error del corredor', async () => {
    const refs = { '③a Armar el pedido de la lista': { client_id: CID, dry_run: false, simulacro: null, cuerpo: { dry_run: false } } }
    const [{ json }] = await correrNodo('listaVuelta', { input: [rechazo], refs })
    expect(json).toMatchObject({ lista_llego: false, lista_ok: false })
    expect(json.error_del_corredor).toContain('cost_cap_exceeded')
    expect(json.motivo).toMatch(/RECHAZÓ/)
    expect(json.motivo).toContain('E-CAP-150')
  })
  it('tanda: igual · y ③c junta los motivos por tanda; ⑥ sin vuelta los lleva al aviso', async () => {
    const pedido = { '③b Armar el pedido de la tanda': { tanda_n: 3, tandas_total: 4, ids: ['BRF-0005'], cuerpo: { dry_run: false } }, '③a ¿Llegó la lista?': { dry_run: false, simulacro: null } }
    const [{ json: t }] = await correrNodo('tandaVuelta', { input: [rechazo], refs: pedido })
    expect(t).toMatchObject({ llego: false })
    expect(t.motivo).toMatch(/RECHAZÓ la tanda 3/)
    const c0 = { client_id: CID, dry_run: false, plan_id: 'p', tanda: 2, lista: { entregables: [{ id: 'BRF-0005' }] }, lista_llego: true, lista_real: true, lista_ok: true, cuerpo: { dry_run: false }, simulacro_usado: false }
    const [{ json: j }] = await correrNodo('juntar', { input: [t], refs: { '③a ¿Llegó la lista?': c0 } })
    expect(j.llego_la_vuelta).toBe(false)
    expect(j.motivo).toContain('cost_cap_exceeded')
    const [{ json: sv }] = await correrNodo('sinVuelta', { input: [j], refs: { [N.sobre]: { client_id: CID, dry_run: false }, '③a ¿Llegó la lista?': { ...c0, motivo: null } } })
    expect(sv.motivo).toContain('cost_cap_exceeded')
    expect(sv.payload_cable.motivo).toContain('cost_cap_exceeded')
  })
})

describe('el grafo del flujo v2', () => {
  const f = construirFlujo()
  const nodo = (n: string) => f.nodes.find((x: { name: string }) => x.name === n)
  const salidas = (n: string, i = 0) => (f.connections[n]?.main?.[i] ?? []).map((t: { node: string }) => t.node)
  const alcanzables = (desde: string, sin?: string): Set<string> => {
    const vis = new Set<string>()
    const pila = [desde]
    while (pila.length) {
      const n = pila.pop()!
      for (const s of f.connections[n]?.main ?? []) for (const t of s) if (t.node !== sin && !vis.has(t.node)) { vis.add(t.node); pila.push(t.node) }
    }
    return vis
  }
  it('el webhook es zero-risk/brief, POST, responde al recibir', () => {
    expect(nodo(N.webhook).parameters).toMatchObject({ httpMethod: 'POST', path: 'zero-risk/brief', responseMode: 'onReceived' })
  })
  it('la cadena hasta la lista, en orden: sobre → manual → GUARDA → plan → GUARDA → repetido → guarda → ficha → pedido de la lista → redactor → espera → ¿llegó? → ¿hay lista?', () => {
    const c = [N.webhook, N.sobre, N.manual, N.guardaManual, N.plan, N.guardaPlan, N.repetido, N.guardaRepetido, N.ficha, N.listaPedido, N.listaRedactor, N.listaEspera, N.listaVuelta, N.hayLista]
    for (let i = 0; i < c.length - 1; i++) expect(salidas(c[i])[0]).toBe(c[i + 1])
  })
  it('el bucle de tandas: lista → armar tandas → recorrer; «bucle» → pedido → redactor → espera → ¿llegó? → VUELVE a recorrer; «terminado» → juntar', () => {
    expect(salidas(N.hayLista, 0)).toEqual([N.armarTandas])
    expect(salidas(N.armarTandas)).toEqual([N.recorrer])
    expect(salidas(N.recorrer, 0)).toEqual([N.juntar]) // terminado
    expect(salidas(N.recorrer, 1)).toEqual([N.tandaPedido]) // bucle
    expect([N.tandaPedido, N.tandaRedactor, N.tandaEspera, N.tandaVuelta].map((n) => salidas(n)[0])).toEqual([N.tandaRedactor, N.tandaEspera, N.tandaVuelta, N.recorrer])
    expect(nodo(N.recorrer)).toMatchObject({ type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 })
    expect(nodo(N.recorrer).parameters.batchSize).toBe(1)
  })
  it('🔴 CADA nodo que paga (la lista y cada tanda) manda EXACTAMENTE el cuerpo armado donde viaja dry_run', () => {
    for (const n of [N.listaRedactor, N.tandaRedactor]) {
      expect(nodo(n).parameters.jsonBody).toBe('={{ JSON.stringify($json.cuerpo) }}')
      expect(nodo(n).parameters.url).toMatch(/\/api\/agents\/run-sdk$/)
    }
    // y los dos nodos que arman el cuerpo lo llenan con dry_run (probado arriba con el código exacto)
    expect(codigoDeNodo('listaPedido')).toMatch(/dry_run: prev\.dry_run === true/)
    expect(codigoDeNodo('tandaPedido')).toMatch(/dry_run: c\.dry_run === true/)
  })
  it('🔴 cada espera tiene tope MENOR que los 800 s de la función de Vercel (780 s) y reanuda por webhook', () => {
    expect(ESPERA_SEGUNDOS).toBeLessThan(800)
    for (const n of [N.listaEspera, N.tandaEspera]) expect(nodo(n).parameters).toMatchObject({ resume: 'webhook', limitWaitTime: true, resumeAmount: ESPERA_SEGUNDOS, resumeUnit: 'seconds' })
  })
  it('🔴 SIN VUELTA NO SE GUARDA NADA: «sin vuelta» viene de «¿hay lista?» y «¿llegó todo?», y NO alcanza guardar ni Drive (solo el aviso a la sala)', () => {
    expect(salidas(N.hayLista, 1)).toEqual([N.sinVuelta])
    expect(salidas(N.llegoTodo, 1)).toEqual([N.sinVuelta])
    const desde = alcanzables(N.sinVuelta)
    expect(desde.has(N.guardar)).toBe(false)
    expect(desde.has(N.drive)).toBe(false)
    expect(desde.has(N.cable)).toBe(true)
    // modo seco: ni siquiera el aviso
    const seco = alcanzables(N.secoSinVueltaCierre)
    for (const escribe of [N.guardar, N.drive, N.cable]) expect(seco.has(escribe)).toBe(false)
  })
  it('🔴 guardar y Drive SOLO son alcanzables pasando por «¿llegó todo?» (verdadero): quitado ese nodo, desde el webhook no se llega a ninguno de los dos', () => {
    expect(alcanzables(N.webhook).has(N.guardar)).toBe(true)
    expect(alcanzables(N.webhook, N.llegoTodo).has(N.guardar)).toBe(false)
    expect(alcanzables(N.webhook, N.llegoTodo).has(N.drive)).toBe(false)
    expect(salidas(N.llegoTodo, 0)).toEqual([N.chequeos])
  })
  it('el interruptor de seco está ANTES de todo lo que escribe: el ramal seco no alcanza guardar, Drive ni el cable', () => {
    const desde = alcanzables(N.secoCierre)
    for (const escribe of [N.guardar, N.drive, N.cable]) expect(desde.has(escribe)).toBe(false)
    expect(salidas(N.seco, 0)).toEqual([N.secoCierre])
    expect(salidas(N.seco, 1)).toEqual([N.guardar])
  })
  it('un parte ilegible se guarda pero NO va a Drive: «¿legible?» → Drive (sí) · → cierre (no)', () => {
    expect(salidas(N.legible, 0)).toEqual([N.drive])
    expect(salidas(N.legible, 1)).toEqual([N.cierre])
    expect(nodo(N.guardar).parameters.jsonBody).toBe('={{ JSON.stringify($json.fila_parte) }}')
  })
  it('ROJO · toda consulta a la base entrega salida aunque vuelva VACÍA (alwaysOutputData)', () => {
    for (const n of [N.manual, N.plan, N.repetido, N.ficha]) expect(nodo(n).alwaysOutputData).toBe(true)
  })
  it('todos los nodos de código compilan y toda referencia $(…) apunta a un nodo que existe', () => {
    const nombres = new Set(f.nodes.map((n: { name: string }) => n.name))
    for (const n of f.nodes.filter((x: { type: string }) => x.type.endsWith('.code'))) expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode)).not.toThrow()
    for (const n of f.nodes) {
      const s = JSON.stringify(n.parameters)
      for (const m of s.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)) if (m[1] !== 'nodo') expect(nombres.has(m[1]), m[1]).toBe(true)
    }
  })
})
