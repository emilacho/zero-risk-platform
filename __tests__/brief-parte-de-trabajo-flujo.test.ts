/**
 * EL FLUJO `zero-risk/brief` · pruebas a costo cero · CC#1 · 2026-09-29 · encargo Lenovo §1.
 * Corre el CÓDIGO EXACTO de cada nodo (los mismos archivos que el constructor pega en n8n) con `$`, `$input`, `$env`
 * simulados, y comprueba el grafo del flujo. La regla no negociable (§1.3): el dry_run LLEGA hasta el nodo que paga.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const leer = (f: string) => readFileSync(join(DIR, f), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

type Ctx = {
  input?: unknown[]
  refs?: Record<string, unknown>
  env?: Record<string, string>
  workflowId?: string
  executionId?: string
}
/** Ejecuta el código de un nodo con el contexto simulado de n8n. */
async function correrNodo(archivo: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (nombre: string) => {
    if (!(ctx.refs && nombre in ctx.refs)) throw new Error('nodo no ejecutado: ' + nombre)
    return { first: () => ({ json: ctx.refs![nombre] }), all: () => [{ json: ctx.refs![nombre] }] }
  }
  // el constructor pega la referencia dentro del nodo ③ en lugar del marcador · aquí igual
  const codigo = leer(archivo).replace('__REFERENCIA__', JSON.stringify(leer('referencia-el-brief-de-un-entregable.md')))
  const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo)
  return fn($input, $, ctx.env ?? {}, items[0]?.json, { id: ctx.workflowId ?? 'WF-1' }, { id: ctx.executionId ?? '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const LLAVE = 'llave-de-despacho-de-prueba-0123456789abcdef'
const N0 = '⓪ Sobre · llave · modo seco'
const sobre = (body: Record<string, unknown> = {}, llave = LLAVE) => ({
  input: [{ body: { client_id: CID, plan_id: 'plan-1', dry_run: true, ...body }, headers: { 'x-sala-dispatch-key': llave } }],
  env: { SALA_DISPATCH_KEY: LLAVE },
})

describe('⓪ el sobre · la llave · el modo seco', () => {
  it('con llave correcta y dry_run explícito ⇒ pasa y NORMALIZA el sobre', async () => {
    const [{ json }] = await correrNodo('n0-sobre.js', sobre({ _journey_id: 'j1', _sala_correlation_id: 'c1', forzar: true }))
    expect(json).toMatchObject({ client_id: CID, dry_run: true, forzar: true, _journey_id: 'j1', _sala_correlation_id: 'c1' })
  })
  it('ROJO · sin dry_run explícito (ausente, string «true», null) ⇒ BRIEF_DRY_RUN_AUSENTE: no se asume', async () => {
    for (const malo of [undefined, 'true', null, 0]) {
      const s = sobre({ dry_run: malo })
      await expect(correrNodo('n0-sobre.js', s)).rejects.toThrow(/BRIEF_DRY_RUN_AUSENTE/)
    }
  })
  it('ROJO · llave ausente, incorrecta o de otro largo ⇒ BRIEF_PROCEDENCIA_INVALIDA (E67: este flujo paga)', async () => {
    await expect(correrNodo('n0-sobre.js', sobre({}, ''))).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    await expect(correrNodo('n0-sobre.js', sobre({}, 'otra-llave'))).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    await expect(correrNodo('n0-sobre.js', sobre({}, LLAVE + 'x'))).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
  })
  it('ROJO · el motor sin SALA_DISPATCH_KEY ⇒ BRIEF_CERRADO (queda cerrado, no abierto)', async () => {
    const s = sobre()
    await expect(correrNodo('n0-sobre.js', { ...s, env: {} })).rejects.toThrow(/BRIEF_CERRADO/)
  })
  it('ROJO · client_id ausente o que no es uuid (inyección en la dirección de la base) ⇒ se DETIENE', async () => {
    await expect(correrNodo('n0-sobre.js', sobre({ client_id: undefined }))).rejects.toThrow(/BRIEF_SIN_CLIENTE/)
    await expect(correrNodo('n0-sobre.js', sobre({ client_id: 'x/../?select=*' }))).rejects.toThrow(/BRIEF_CLIENTE_INVALIDO/)
  })
  it('el simulacro SOLO existe en modo seco: con dry_run:false se ignora por completo', async () => {
    const [{ json: seco }] = await correrNodo('n0-sobre.js', sobre({ dry_run: true, _simulacro_respuesta: '{"parte":{}}' }))
    expect(seco.simulacro_respuesta).toBe('{"parte":{}}')
    const [{ json: real }] = await correrNodo('n0-sobre.js', sobre({ dry_run: false, _simulacro_respuesta: '{"parte":{}}' }))
    expect(real.simulacro_respuesta).toBeNull()
    expect(real.dry_run).toBe(false)
  })
})

describe('① y ② las GUARDA · sin manual aprobado o sin plan, se DETIENE y no se escribe nada', () => {
  const env = { client_id: CID, dry_run: true, plan_id: null, forzar: false }
  const N1 = '① GUARDA · sin manual aprobado se DETIENE'
  const N2 = '② GUARDA · sin plan se DETIENE'
  it('ROJO · consulta vacía (la fila «vacía» que entrega alwaysOutputData) o sin id ⇒ BRIEF_SIN_MANUAL', async () => {
    await expect(correrNodo('n1-guarda-manual.js', { input: [{}], refs: { [N0]: env } })).rejects.toThrow(/BRIEF_SIN_MANUAL/)
    await expect(correrNodo('n1-guarda-manual.js', { input: [], refs: { [N0]: env } })).rejects.toThrow()
  })
  it('ROJO · manual que no pasó la vara ⇒ BRIEF_MANUAL_NO_APROBADO', async () => {
    await expect(correrNodo('n1-guarda-manual.js', { input: [{ id: 'm1', gate_outcome: 'no_paso', version: 1 }], refs: { [N0]: env } })).rejects.toThrow(/BRIEF_MANUAL_NO_APROBADO/)
  })
  it('manual aprobado ⇒ pasa con sus palabras prohibidas y su texto', async () => {
    const [{ json }] = await correrNodo('n1-guarda-manual.js', { input: [{ id: 'm1', gate_outcome: 'paso_la_vara', version: 3, created_at: 't', forbidden_words: ['premium'], required_terminology: ['Olón'], content_text: 'TEXTO' }], refs: { [N0]: env } })
    expect(json).toMatchObject({ manual_id: 'm1', manual_version: 3, forbidden_words: ['premium'], manual_texto: 'TEXTO', client_id: CID })
  })
  it('ROJO · sin plan (fila vacía) ⇒ BRIEF_SIN_PLAN · plan sin texto ⇒ BRIEF_PLAN_VACIO', async () => {
    const prev = { ...env, manual_id: 'm1' }
    await expect(correrNodo('n2-guarda-plan.js', { input: [{}], refs: { [N1]: prev } })).rejects.toThrow(/BRIEF_SIN_PLAN/)
    await expect(correrNodo('n2-guarda-plan.js', { input: [{ id: 'p1', content_text: '  ' }], refs: { [N1]: prev } })).rejects.toThrow(/BRIEF_PLAN_VACIO/)
  })
  it('plan vigente distinto del que nombra el sobre ⇒ se usa el vigente y se DECLARA', async () => {
    const [{ json }] = await correrNodo('n2-guarda-plan.js', { input: [{ id: 'p2', created_at: 't', title: 'x', content_text: 'PLAN' }], refs: { [N1]: { ...env, plan_id: 'p1' } } })
    expect(json).toMatchObject({ plan_id: 'p2', plan_del_sobre: 'p1', plan_del_sobre_distinto: true })
  })
  it('ROJO · el mismo plan dos veces NO corre: BRIEF_REPETIDO (decisión de Emilio 09-sep); forzar o modo seco lo permiten y lo declaran', async () => {
    const N2b = '② GUARDA · sin plan se DETIENE'
    const base = { ...env, plan_id: 'p1', dry_run: false, forzar: false }
    await expect(correrNodo('n2b-repetido.js', { input: [{ id: 'parte-viejo', created_at: 't' }], refs: { [N2b]: base } })).rejects.toThrow(/BRIEF_REPETIDO/)
    const [{ json: forz }] = await correrNodo('n2b-repetido.js', { input: [{ id: 'parte-viejo', created_at: 't' }], refs: { [N2b]: { ...base, forzar: true } } })
    expect(forz.repetido_declarado).toBe(true)
    const [{ json: seco }] = await correrNodo('n2b-repetido.js', { input: [{ id: 'parte-viejo', created_at: 't' }], refs: { [N2b]: { ...base, dry_run: true } } })
    expect(seco.repetido_declarado).toBe(true)
    const [{ json: nuevo }] = await correrNodo('n2b-repetido.js', { input: [{}], refs: { [N2b]: base } })
    expect(nuevo.repetido_declarado).toBe(false)
  })
})

describe('③ el nodo que paga · 🔴 el dry_run LLEGA al cuerpo que se manda a run-sdk', () => {
  const N2b = '② ¿Ya hay parte de este plan? · guarda'
  const prev = (dry: boolean) => ({ client_id: CID, dry_run: dry, plan_id: 'p1', plan_texto: 'PLAN DE 90 DIAS', manual_id: 'm1', manual_version: 2, manual_texto: '{"visual":{}}', forbidden_words: [], required_terminology: [], simulacro_respuesta: null })
  it('ROJO · dry_run:true en el sobre ⇒ cuerpo.dry_run === true (el campo que el corredor lee)', async () => {
    const [{ json }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ id: CID, name: 'Náufrago' }], refs: { [N2b]: prev(true) } })
    expect(json.cuerpo.dry_run).toBe(true)
  })
  it('dry_run:false ⇒ cuerpo.dry_run === false EXPLÍCITO (nunca ausente): no depende de un valor por defecto', async () => {
    const [{ json }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(false) } })
    expect(json.cuerpo.dry_run).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(json.cuerpo, 'dry_run')).toBe(true)
  })
  it('el cuerpo trae lo que exige el corredor: agente, force_restart, workflow_id/ejecución (agentes solo vía workflows), callback, cliente', async () => {
    const [{ json }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(true) }, workflowId: 'WFX', executionId: '777' })
    expect(json.cuerpo).toMatchObject({ agent: 'campaign-brief-agent', client_id: CID, workflow_id: 'WFX', workflow_execution_id: '777', force_restart: true, callback_url: 'https://n8n.test/webhook-waiting/999' })
  })
  it('el pedido lleva manual, plan, la referencia entera, la regla de contradicciones, el aviso de video y los centinelas', async () => {
    const [{ json }] = await correrNodo('n3-armar-cuerpo.js', { input: [{ name: 'Náufrago' }], refs: { [N2b]: prev(true) } })
    const t: string = json.cuerpo.task
    expect(t).toContain('PLAN DE 90 DIAS')
    expect(t).toContain('{"visual":{}}')
    expect(t).toContain('CONTRADICE al manual')
    expect(t).toContain('NO video ni audio')
    expect(t).toContain('CENTINELAS')
    expect(t).toContain('EL BRIEF DE UN ENTREGABLE') // la referencia, pegada
    expect(t).toContain('Náufrago')
  })
  it('la vuelta: el simulacro solo se aplica en modo seco', async () => {
    const N3 = '③ Armar el cuerpo del redactor'
    const base = { ...prev(true), cuerpo: {}, client_name: 'x' }
    const [{ json: seco }] = await correrNodo('n3-llego-la-vuelta.js', { input: [{ body: { response: 'REAL' } }], refs: { [N3]: { ...base, simulacro_respuesta: 'SIMULADA' } } })
    expect(seco).toMatchObject({ texto: 'SIMULADA', simulacro_usado: true, vuelta_real: true })
    const [{ json: real }] = await correrNodo('n3-llego-la-vuelta.js', { input: [{ body: { response: 'REAL' } }], refs: { [N3]: { ...base, dry_run: false, simulacro_respuesta: 'SIMULADA' } } })
    expect(real).toMatchObject({ texto: 'REAL', simulacro_usado: false })
  })
  it('ROJO · una espera agotada (sin texto) NO se da por exitosa: llego_la_vuelta:false con motivo', async () => {
    const N3 = '③ Armar el cuerpo del redactor'
    const [{ json }] = await correrNodo('n3-llego-la-vuelta.js', { input: [{}], refs: { [N3]: { ...prev(false), cuerpo: {}, client_name: 'x', simulacro_respuesta: null } } })
    expect(json.llego_la_vuelta).toBe(false)
    expect(json.motivo).toMatch(/NO llegó/)
  })
})

describe('⑤ ⑥ el cierre · lo que se declara y lo que no puede callar', () => {
  it('⑤ seco: valida las formas y afirma escrituras_reales:0', async () => {
    const ok = { dry_run: true, fila_parte: { client_id: CID, title: 't', output_type: 'campaign_brief_pack', content: 'x', content_text: 'x', producing_agent: 'campaign-brief-agent', status: 'draft', provenance_tag: {} }, payload_cable: { event_type: 'run_completed', worker_id: 'w', worker_name: 'brief', resultado: 'parte_terminado', client_id: CID }, cuerpo_dry_run_enviado: true }
    const [{ json }] = await correrNodo('n5-seco.js', { input: [ok] })
    expect(json).toMatchObject({ seco: true, escrituras_reales: 0, formas_validas: true, dry_run_enviado_al_nodo_que_paga: true })
    const [{ json: roto }] = await correrNodo('n5-seco.js', { input: [{ ...ok, fila_parte: { ...ok.fila_parte, output_type: 'otro' } }] })
    expect(roto.formas_validas).toBe(false)
  })
  it('⑤ una corrida sin parte guardado o sin PDF NO sale exitosa', async () => {
    const [{ json }] = await correrNodo('n5-cierre.js', { refs: { '④ Chequeos': { llego_la_vuelta: true, chequeos_ok: true, hallazgos: [], entregables: 2, pendientes_declarados: 1, client_id: CID, payload_cable: { resultado: 'parte_terminado' } }, '⑤ Guardar el parte': { body: {} }, '⑤ Parte a Drive': { body: { ok: false, motivo: 'sin cuota' } } } })
    expect(json.ok).toBe(false)
    expect(json.problemas.join(' ')).toMatch(/NO quedó guardado/)
    expect(json.problemas.join(' ')).toMatch(/Drive no devolvió/)
    expect(json.payload_cable.resultado).toBe('parte_con_problemas')
  })
  it('⑤ guardado + PDF ⇒ ok y la sala se entera de «parte_terminado»', async () => {
    const [{ json }] = await correrNodo('n5-cierre.js', { refs: { '④ Chequeos': { llego_la_vuelta: true, chequeos_ok: true, hallazgos: [], entregables: 2, pendientes_declarados: 1, client_id: CID, payload_cable: { resultado: 'x' } }, '⑤ Guardar el parte': { body: [{ id: 'fila-1' }] }, '⑤ Parte a Drive': { body: { ok: true, file_id: 'F1', url: 'u' } } } })
    expect(json).toMatchObject({ ok: true, parte_guardado_id: 'fila-1', file_id: 'F1' })
    expect(json.payload_cable.resultado).toBe('parte_terminado')
  })
  it('ROJO · ⑥ el cable de vuelta NO puede ser mudo si la sala despachó; un disparo a mano no falla', async () => {
    await expect(correrNodo('n6-volvio.js', { input: [{ ok: false, code: 'HTTP 500' }], refs: { [N0]: { _sala_correlation_id: 'corr-1' } } })).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
    const [{ json }] = await correrNodo('n6-volvio.js', { input: [{ ok: false }], refs: { [N0]: { _sala_correlation_id: null } } })
    expect(json.despachado_por_la_sala).toBe(false)
  })
})

describe('el grafo del flujo', async () => {
  const { construirFlujo, N } = await import(pathToFileURL(join(DIR, 'construir-brief.mjs')).href)
  const f = construirFlujo()
  const nodo = (n: string) => f.nodes.find((x: { name: string }) => x.name === n)
  const alcanzables = (desde: string): Set<string> => {
    const vis = new Set<string>()
    const pila = [desde]
    while (pila.length) {
      const n = pila.pop()!
      for (const s of f.connections[n]?.main ?? []) for (const t of s) if (!vis.has(t.node)) { vis.add(t.node); pila.push(t.node) }
    }
    return vis
  }
  it('el webhook es zero-risk/brief, POST, responde al recibir (la sala no espera al agente)', () => {
    expect(nodo(N.webhook).parameters).toMatchObject({ httpMethod: 'POST', path: 'zero-risk/brief', responseMode: 'onReceived' })
  })
  it('las etapas van en orden: sobre → manual → GUARDA → plan → GUARDA → redactor → espera → chequeos → seco/real', () => {
    const cadena = [N.webhook, N.sobre, N.manual, N.guardaManual, N.plan, N.guardaPlan, N.repetido, N.guardaRepetido, N.ficha, N.cuerpo, N.redactor, N.espera, N.vuelta, N.chequeos, N.seco]
    for (let i = 0; i < cadena.length - 1; i++) expect(f.connections[cadena[i]].main[0][0].node).toBe(cadena[i + 1])
  })
  it('🔴 el interruptor está ANTES de todo lo que escribe: el ramal seco NO puede alcanzar guardar, Drive ni el cable', () => {
    const desdeSeco = alcanzables(N.secoCierre)
    for (const escribe of [N.guardar, N.drive, N.cable]) expect(desdeSeco.has(escribe)).toBe(false)
    expect(f.connections[N.seco].main[0][0].node).toBe(N.secoCierre) // verdadero ⇒ seco
    expect(f.connections[N.seco].main[1][0].node).toBe(N.guardar) // falso ⇒ real
  })
  it('🔴 el nodo que paga manda EXACTAMENTE el cuerpo armado (donde viaja dry_run), sin campos añadidos a mano', () => {
    expect(nodo(N.redactor).parameters.jsonBody).toBe('={{ JSON.stringify($json.cuerpo) }}')
    expect(nodo(N.redactor).parameters.url).toMatch(/\/api\/agents\/run-sdk$/)
  })
  it('todo lo que escribe manda la fila que armó ④ (la misma que validó el ramal seco)', () => {
    expect(nodo(N.guardar).parameters.jsonBody).toBe('={{ JSON.stringify($json.fila_parte) }}')
    expect(nodo(N.cable).parameters.jsonBody).toBe('={{ JSON.stringify($json.payload_cable) }}')
    expect(nodo(N.guardar).parameters.url).toMatch(/client_historical_outputs$/)
  })
  it('ROJO · toda consulta a la base entrega salida aunque vuelva VACÍA (alwaysOutputData): si no, las GUARDA nunca corren y la corrida sale «exitosa» sin haber llegado al redactor', () => {
    for (const n of [N.manual, N.plan, N.repetido, N.ficha]) expect(nodo(n).alwaysOutputData).toBe(true)
  })
  it('la espera del agente usa el reanudar por webhook con tope (no espera para siempre)', () => {
    expect(nodo(N.espera).parameters).toMatchObject({ resume: 'webhook', limitWaitTime: true, resumeAmount: 3600, resumeUnit: 'seconds' })
    // 🔴 la espera NO puede ser menor que lo MEDIDO del redactor del brief (la única corrida real: 1.923 s · 30-sep corrida 158667: 900 s no alcanzaron) ni infinita
    const seg = (nodo(N.espera).parameters as { resumeAmount: number }).resumeAmount
    expect(seg).toBeGreaterThanOrEqual(2400)
    expect(seg).toBeLessThanOrEqual(7200)
  })
  it('las consultas piden el manual más reciente y el plan de 90 días más reciente, y el brief previo del mismo plan', () => {
    expect(nodo(N.manual).parameters.url).toContain('client_brand_books')
    expect(nodo(N.manual).parameters.url).toContain('order=version.desc&limit=1')
    expect(nodo(N.plan).parameters.url).toContain('output_type=eq.campaign_plan_90d')
    expect(nodo(N.plan).parameters.url).toContain('order=created_at.desc&limit=1')
    expect(nodo(N.repetido).parameters.url).toContain('output_type=eq.campaign_brief_pack')
  })
  it('todos los nodos de código compilan y toda referencia $(…) apunta a un nodo que existe', () => {
    const nombres = new Set(f.nodes.map((n: { name: string }) => n.name))
    for (const n of f.nodes.filter((x: { type: string }) => x.type.endsWith('.code'))) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode)).not.toThrow()
    }
    for (const n of f.nodes) {
      const s = JSON.stringify(n.parameters)
      for (const m of s.matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)) expect(nombres.has(m[1])).toBe(true)
    }
  })
})
