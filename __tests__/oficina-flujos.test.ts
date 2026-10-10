/**
 * OFICINA · SALA 1 · PR 5 · los 3 flujos de n8n (creados INACTIVOS): su FORMA, y el código de cada nodo ejecutado con un entorno falso (sin n8n, sin red, sin modelo).
 * Más la prueba que une las dos mitades: el pedido que arma el orquestador pasa por los nodos del flujo de turnos (modo seco) y su respuesta simulada vuelve al orquestador y cierra el encargo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirPuerta, construirTurno, construirVigia, FLUJOS } from '../scripts/worker-staging/oficina/construir-oficina.mjs'
import { abrirEncargo, recibirResultado, avanzar } from '../src/lib/oficina/orquestador'
import { procesarSalida } from '../src/lib/oficina/salida'
import { TARGET_STEP_PRODUCIR } from '../src/lib/oficina/sobre'
import { CLIENTE, PARTE, crearMemoria } from '../src/lib/oficina/__tests__/memoria'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/oficina')
type Nodo = { name: string; type: string; parameters: Record<string, any>; retryOnFail?: boolean; onError?: string }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean; settings: Record<string, unknown> }
const flujos = { puerta: construirPuerta(), turno: construirTurno(), vigia: construirVigia() } as unknown as Record<string, Flujo>

// ───────── el entorno falso de un nodo de código de n8n
interface Entorno { input?: unknown[]; nodos?: Record<string, unknown[]>; env?: Record<string, string>; workflow?: string; execution?: { id: string; resumeUrl: string } }
function ejecutar(archivo: string, e: Entorno): any[] {
  const codigo = fs.readFileSync(path.join(DIR, archivo), 'utf8')
  const items = (xs: unknown[]) => xs.map((j) => ({ json: j }))
  const entrada = items(e.input ?? [])
  const $input = { first: () => entrada[0], all: () => entrada }
  const $ = (nombre: string) => {
    const xs = items(e.nodos?.[nombre] ?? [])
    if (!e.nodos?.[nombre]) throw new Error(`nodo inexistente en la prueba: ${nombre}`)
    return { first: () => xs[0], all: () => xs, itemMatching: (i: number) => xs[i] ?? xs[0] }
  }
  const fn = new Function('$input', '$', '$env', '$workflow', '$execution', codigo)
  return fn($input, $, e.env ?? {}, { id: e.workflow ?? 'wf-oficina' }, e.execution ?? { id: 'ex-1', resumeUrl: 'https://n8n.test/resume/ex-1' })
}
const json = (xs: any[]) => xs.map((x) => x.json)

describe('la FORMA de los 3 flujos: inactivos, sin reintentos que paguen, sin llaves escritas, sin salidas inesperadas', () => {
  for (const [k, f] of Object.entries(flujos)) {
    describe(k, () => {
      it('es JSON serializable, con nombres de nodo únicos y todas las conexiones apuntando a nodos que existen', () => {
        expect(JSON.parse(JSON.stringify(f)).nodes).toHaveLength(f.nodes.length)
        const nombres = f.nodes.map((n) => n.name)
        expect(new Set(nombres).size).toBe(nombres.length)
        for (const [de, c] of Object.entries(f.connections)) {
          expect(nombres).toContain(de)
          for (const salida of c.main) for (const to of salida) expect(nombres).toContain(to.node)
        }
      })
      it('se crea INACTIVO: el JSON no trae `active: true`', () => { expect(f.active).not.toBe(true) })
      it('NINGÚN nodo tiene `retryOnFail` (los que pagan no se reintentan)', () => { expect(f.nodes.filter((n) => n.retryOnFail)).toEqual([]) })
      it('toda llamada HTTP entrega SIEMPRE salida (neverError) y una guarda decide', () => {
        for (const n of f.nodes.filter((x) => x.type.endsWith('httpRequest'))) expect(n.parameters.options.response.response.neverError, n.name).toBe(true)
      })
      it('ninguna llave, token ni contraseña escrita en el JSON', () => {
        expect(JSON.stringify(f)).not.toMatch(/sk-[A-Za-z0-9_-]{10,}|xox[abp]-|eyJ[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9]{12,}/)
      })
      it('toda llave viaja por expresión ($json.llave o $env), nunca como valor', () => {
        for (const n of f.nodes.filter((x) => x.type.endsWith('httpRequest'))) for (const h of n.parameters.headerParameters.parameters) if (/key|auth/i.test(h.name)) expect(String(h.value), n.name).toMatch(/^=\{\{.*(\$json\.llave|\$env\.)/)
      })
    })
  }

  it('la PUERTA: webhook `zero-risk/oficina`; sin `familia` y en la pasarela el cuerpo sigue INTACTO a la pieza simple', () => {
    const f = flujos.puerta
    const web = f.nodes.find((n) => n.type.endsWith('webhook'))!
    expect(web.parameters.path).toBe('zero-risk/oficina')
    const pas = f.nodes.find((n) => n.name === 'Pasarela · pieza simple')!
    expect(pas.parameters.url).toMatch(/\/zero-risk\/pieza$/)
    expect(pas.parameters.jsonBody).toBe('={{ JSON.stringify($json.cuerpo_original || $json.body) }}')
    // «¿Trae familia?» falso ⇒ pasarela directa
    expect(f.connections['⓪ ¿Trae familia?'].main[1][0].node).toBe('Pasarela · pieza simple')
  })
  it('el TURNO: webhook `zero-risk/oficina-turno`; el agente se llama UNA vez (sin reintento), con espera, y el modo seco no llama a nadie', () => {
    const f = flujos.turno
    expect(f.nodes.find((n) => n.type.endsWith('webhook'))!.parameters.path).toBe('zero-risk/oficina-turno')
    const agente = f.nodes.find((n) => n.name === '② Agente (run-sdk)')!
    expect(agente.parameters.url).toMatch(/\/api\/agents\/run-sdk$/); expect(agente.retryOnFail).toBeUndefined()
    expect(f.nodes.some((n) => n.type.endsWith('wait'))).toBe(true)
    // el modo seco del agente va DIRECTO a registrar (no pasa por run-sdk)
    expect(f.connections['② ¿Modo seco?'].main[0][0].node).toBe('③ Registrar el resultado')
    expect(f.connections['① ¿Modo seco? (portero)'].main[0][0].node).toBe('① Portero · resultado')
  })
  it('el VIGÍA: reloj de 10 min', () => {
    const t = flujos.vigia.nodes.find((n) => n.type.endsWith('scheduleTrigger'))!
    expect(t.parameters.rule.interval[0]).toEqual({ field: 'minutes', minutesInterval: 10 })
  })
  it('las ÚNICAS direcciones a las que llaman son las de la oficina, la pieza simple, el portero, run-sdk y la vuelta a la sala (nada de Meta, Slack ni publicar)', () => {
    const permitidas = [/\/api\/oficina\/(encargos|turnos|vigia)$/, /\/zero-risk\/(pieza|oficina-turno|portero)$/, /\/api\/agents\/run-sdk$/, /api\/sala\/callback/]
    for (const [k, f] of Object.entries(flujos)) for (const n of f.nodes.filter((x) => x.type.endsWith('httpRequest'))) {
      expect(permitidas.some((re) => re.test(String(n.parameters.url))), `${k} · ${n.name} · ${n.parameters.url}`).toBe(true)
    }
  })
  it('no se toca el mapa de viajes, ni la pieza simple, ni el alta: ningún flujo los nombra por id', () => {
    const todo = JSON.stringify(flujos)
    expect(todo).not.toMatch(/lVCLzxQCKNkd3uS0|LyVoKcrypS5uLyuu|alias_workflow_ids|journey-workflow-map/)
  })
  it('FLUJOS exporta los tres', () => { expect(Object.keys(FLUJOS)).toEqual(['puerta', 'turno', 'vigia']) })
})

describe('puerta · ⓪ sobre y llave', () => {
  const llave = 'la-llave'
  const entrada = (body: unknown, headers: Record<string, string> = { 'x-sala-dispatch-key': llave }) => ({ input: [{ body, headers }], env: { SALA_DISPATCH_KEY: llave } })
  it('sin la variable de entorno queda CERRADA', () => { expect(() => ejecutar('puerta-n0-sobre.js', { input: [{ body: {}, headers: {} }], env: {} })).toThrow(/OFICINA_CERRADA/) })
  it('llave ausente o incorrecta ⇒ se detiene', () => {
    expect(() => ejecutar('puerta-n0-sobre.js', entrada({}, {}))).toThrow(/PROCEDENCIA_INVALIDA/)
    expect(() => ejecutar('puerta-n0-sobre.js', entrada({}, { 'x-sala-dispatch-key': 'otra' }))).toThrow(/PROCEDENCIA_INVALIDA/)
  })
  it('con la llave pasa el cuerpo TAL CUAL y dice si trae familia', () => {
    const cuerpo = { client_id: 'c', parte_id: 'p', brief_id: 'B', dry_run: true, extra: { x: 1 } }
    expect(json(ejecutar('puerta-n0-sobre.js', entrada(cuerpo)))[0]).toEqual({ body: cuerpo, llave, tiene_familia: false })
    expect(json(ejecutar('puerta-n0-sobre.js', entrada({ ...cuerpo, familia: 'post_img' })))[0].tiene_familia).toBe(true)
    expect(json(ejecutar('puerta-n0-sobre.js', entrada({ ...cuerpo, familia: '  ' })))[0].tiene_familia).toBe(false)
  })
})

describe('puerta · ① qué pasó al abrir', () => {
  const sobre = { body: { client_id: 'c1', tenant_id: 't1', brief_id: 'BRF-0003', parte_id: 'p', dry_run: true, familia: 'post_img', _sala_correlation_id: 'cor', _journey_id: 'jou' }, llave: 'k', tiene_familia: true }
  const correr = (statusCode: number, body: unknown, extra: Record<string, unknown> = {}) => json(ejecutar('puerta-n1-ruta.js', { input: [{ statusCode, body, ...extra }], nodos: { '⓪ Sobre · llave': [sobre] } }))[0]
  it('409 `oficina_no_abre` ⇒ PASARELA con el cuerpo original intacto', () => {
    const r = correr(409, { error: 'oficina_no_abre', motivo: 'oficina_apagada' })
    expect(r).toMatchObject({ ruta: 'pasarela', motivo: 'oficina_apagada', llave: 'k' }); expect(r.cuerpo_original).toEqual(sobre.body)
  })
  it('200 `esperar` ⇒ TURNO con el encargo y el primer paso', () => {
    expect(correr(200, { accion: 'esperar', encargo_id: 'e1', turno: { n: 2, tipo: 'portero' } })).toMatchObject({ ruta: 'turno', turno_body: { encargo_id: 'e1', turno: { n: 2, tipo: 'portero' } } })
  })
  it('200 `cerrado` ⇒ CABLE con el resultado REAL y la referencia de la sala', () => {
    const r = correr(200, { accion: 'cerrado', estado: 'fallido', resultado_para_la_sala: 'fallido', motivo: 'la parte no existe' })
    expect(r.ruta).toBe('cable')
    expect(r.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'oficina', resultado: 'fallido', brief_id: 'BRF-0003', client_id: 'c1', tenant_id: 't1', _sala_correlation_id: 'cor', _journey_id: 'jou' })
  })
  it('200 `ya_existia` ⇒ nada (idempotente)', () => { expect(correr(200, { accion: 'ya_existia', encargo_id: 'e1' })).toMatchObject({ ruta: 'nada', encargo_id: 'e1' }) })
  it('cualquier otra respuesta se DETIENE con su motivo (no se manda a la pasarela por duda)', () => {
    expect(() => correr(400, { error: 'dry_run_ausente' })).toThrow(/ABRIR_RECHAZADO.*400.*dry_run_ausente/)
    expect(() => correr(500, { error: 'oficina_error' })).toThrow(/ABRIR_RECHAZADO/)
    expect(() => correr(409, { error: 'otra_cosa' })).toThrow(/ABRIR_RECHAZADO/)
    expect(() => ejecutar('puerta-n1-ruta.js', { input: [{ error: { message: 'timeout' } }], nodos: { '⓪ Sobre · llave': [sobre] } })).toThrow(/ABRIR_NO_LLEGO/)
  })
})

describe('turno · entrada, pedido, aceptación y vuelta', () => {
  const llave = 'k'
  const turnoAgente = (o: Record<string, unknown> = {}) => ({ n: 3, tipo: 'agente', paso: 'prompts', agente: 'design-image-prompt-engineer', dispatch_key: 'e:3', pedido: { agent_name: 'design-image-prompt-engineer', task: 'tarea', client_id: 'c1', esquema: 'prompts.v1', max_budget_usd: 0.2, thinking_mode: 'disabled', dry_run: false, extra: { indicacion_oficina: 'reglas' }, images: [], ...o } })
  const ENC = '11111111-1111-4111-8111-111111111111'
  const entrada = (turno: unknown, encargo_id: string = ENC, headers: Record<string, string> = { 'x-sala-dispatch-key': llave }) => ({ input: [{ body: { encargo_id, turno }, headers }], env: { SALA_DISPATCH_KEY: llave } })
  it('⓪ valida llave, uuid, número, tipo y pedido', () => {
    expect(() => ejecutar('turno-n0-entrada.js', { input: [{ body: {}, headers: {} }], env: {} })).toThrow(/TURNO_CERRADO/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada(turnoAgente(), ENC, {}))).toThrow(/PROCEDENCIA_INVALIDA/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada(turnoAgente(), 'x'))).toThrow(/SIN_ENCARGO/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada({ ...turnoAgente(), n: 0 }))).toThrow(/SIN_NUMERO/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada({ ...turnoAgente(), tipo: 'codigo' }))).toThrow(/TIPO_INVALIDO/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada({ ...turnoAgente(), pedido: undefined }))).toThrow(/SIN_PEDIDO/)
    expect(() => ejecutar('turno-n0-entrada.js', entrada(turnoAgente({ task: '' })))).toThrow(/PEDIDO_INVALIDO/)
    expect(json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente())))[0]).toMatchObject({ llave, encargo_id: ENC, dry_run: false })
  })
  it('② armar (real): el cuerpo de run-sdk lleva workflow_id, callback, force_restart, tope, razonamiento apagado y NO `callback_mode`; nunca dry_run true', () => {
    const e = json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente())))[0]
    const r = json(ejecutar('turno-n1-armar.js', { input: [e], env: { }, workflow: 'wf-turno', execution: { id: 'ex-9', resumeUrl: 'https://n8n.test/resume/ex-9' } }))[0]
    expect(r.simulado).toBe(false)
    expect(r.cuerpo).toMatchObject({ agent: 'design-image-prompt-engineer', task: 'tarea', client_id: 'c1', workflow_id: 'wf-turno', workflow_execution_id: 'ex-9', callback_url: 'https://n8n.test/resume/ex-9', force_restart: true, dry_run: false, max_budget_usd: 0.2, thinking_mode: 'disabled' })
    expect(r.cuerpo).not.toHaveProperty('callback_mode'); expect(r.cuerpo).not.toHaveProperty('images')
    expect(r.cuerpo.extra).toMatchObject({ indicacion_oficina: 'reglas', dispatch_key: 'e:3' })
  })
  it('② armar sin thinking_mode en el pedido: el razonamiento queda APAGADO por omisión', () => {
    const t = turnoAgente(); delete (t.pedido as Record<string, unknown>).thinking_mode
    const e = json(ejecutar('turno-n0-entrada.js', entrada(t)))[0]
    expect(json(ejecutar('turno-n1-armar.js', { input: [e] }))[0].cuerpo.thinking_mode).toBe('disabled')
  })
  it('② armar con imágenes: las manda en base64', () => {
    const e = json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente({ images: [{ url: 'https://x/a.png' }] }))))[0]
    const r = json(ejecutar('turno-n1-armar.js', { input: [e] }))[0]
    expect(r.cuerpo).toMatchObject({ images: [{ url: 'https://x/a.png' }], images_mode: 'base64' })
  })
  it('② armar en MODO SECO: NO arma llamada a ningún proveedor; devuelve la respuesta simulada, con costo 0', () => {
    const e = json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente({ dry_run: true, esquema: 'prompts.v1' }))))[0]
    const r = json(ejecutar('turno-n1-armar.js', { input: [e] }))[0]
    expect(r.simulado).toBe(true); expect(r).not.toHaveProperty('cuerpo')
    expect(r.resultado_body).toMatchObject({ accion: 'resultado', encargo_id: ENC, n: 3, costo_usd: 0 })
  })
  it('② el modelo simulado de CADA esquema es válido contra el contrato de formato de la sala', () => {
    for (const esquema of ['visual_direction.v1', 'prompts.v1', 'observacion_imagen.v1', 'pieza_post.v1', 'fichas.v1', 'resolucion.v1']) {
      const e = json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente({ dry_run: true, esquema, task: '- imagen 1: índice 0\n- imagen 2: índice 1' }))))[0]
      const r = json(ejecutar('turno-n1-armar.js', { input: [e] }))[0]
      const p = procesarSalida(r.resultado_body.texto, esquema, 0, 1)
      expect(p.ok, `${esquema}: ${p.ok ? '' : JSON.stringify(p)}`).toBe(true)
    }
    const e = json(ejecutar('turno-n0-entrada.js', entrada(turnoAgente({ dry_run: true, esquema: 'x.v9' }))))[0]
    expect(() => ejecutar('turno-n1-armar.js', { input: [e] })).toThrow(/SIN_MOLDE_SIMULADO/)
  })
  it('② ¿aceptó? run-sdk 202 ⇒ sigue; un rechazo o una red caída ⇒ resultado con error YA (no se espera una hora)', () => {
    const c = { encargo_id: ENC, turno: { n: 3 }, llave }
    const f = (input: unknown) => json(ejecutar('turno-n2-acepto.js', { input: [input], nodos: { '② Armar el pedido': [c] } }))[0]
    expect(f({ accepted: true })).toMatchObject({ aceptado: true })
    expect(f({ error: 'agent_not_allowed', code: 'E-X', detail: 'no' })).toMatchObject({ aceptado: false, resultado_body: { accion: 'resultado', n: 3, error: expect.stringMatching(/PEDIDO_RECHAZADO.*agent_not_allowed/) } })
    expect(f({ error: { message: 'ETIMEDOUT' } })).toMatchObject({ aceptado: false, resultado_body: { error: expect.stringMatching(/PEDIDO_NO_LLEGO.*ETIMEDOUT/) } })
    expect(f({})).toMatchObject({ aceptado: false })
  })
  it('② la vuelta: texto ⇒ resultado con el costo del corredor; fallo declarado (tope) o vacía ⇒ error, el texto parcial NO se usa', () => {
    const c = { encargo_id: ENC, turno: { n: 3 }, llave }
    const f = (input: unknown) => json(ejecutar('turno-n3-vuelta.js', { input: [input], nodos: { '② Armar el pedido': [c] } }))[0].resultado_body
    expect(f({ body: { response: '{"a":1}', cost_usd: 0.07, tokens_in: 10, tokens_out: 20 } })).toEqual({ accion: 'resultado', encargo_id: ENC, n: 3, costo_usd: 0.07, workflow_execution_id: 'ex-1', texto: '{"a":1}', tokens_in: 10, tokens_out: 20 })
    const tope = f({ success: false, error: 'error_max_budget_usd', partial: true, response: 'texto a medias' })
    expect(tope.error).toMatch(/FALLÓ.*error_max_budget_usd/); expect(tope).not.toHaveProperty('texto')
    expect(f({ body: { response: '   ' } }).error).toMatch(/llegó vacía/)
  })
  it('① portero: modo seco no llama a nadie; error, rechazo y vacío son errores; lo demás va como texto', () => {
    const e = { llave, encargo_id: ENC, turno: { n: 2 }, dry_run: false }
    const f = (input: unknown, ent = e) => json(ejecutar('turno-n3p-portero.js', { input: [input], nodos: { '⓪ Entrada · llave': [ent] } }))[0].resultado_body
    expect(f({}, { ...e, dry_run: true })).toMatchObject({ n: 2, texto: expect.stringMatching(/simulado/), costo_usd: 0 })
    expect(f({ error: { message: 'timeout' } }).error).toMatch(/no respondió/)
    expect(f({ rechazo: { status: 401 } }).error).toMatch(/rechazó/)
    expect(f({}).error).toMatch(/vacío/)
    expect(f({ lista: [1, 2], costo_usd: 0.02 })).toMatchObject({ texto: '{"lista":[1,2],"costo_usd":0.02}', costo_usd: 0.02 })
  })
  it('③ ¿y ahora? esperar ⇒ despierta el siguiente paso; cerrado ⇒ cable con el resultado REAL; otra cosa ⇒ se detiene', () => {
    const c = { llave, encargo_id: ENC }
    const f = (input: unknown) => json(ejecutar('turno-n4-sigue.js', { input: [input], nodos: { '⓪ Entrada · llave': [c] } }))[0]
    expect(f({ statusCode: 200, body: { accion: 'esperar', turno: { n: 4 } } })).toEqual({ llave, ruta: 'esperar', turno_body: { encargo_id: ENC, turno: { n: 4 } } })
    const cab = f({ statusCode: 200, body: { accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false, sala_ref: { _journey_id: 'j', _sala_correlation_id: 'c' } } })
    expect(cab.ruta).toBe('cable'); expect(cab.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'oficina', resultado: 'encargo_en_bandeja', _journey_id: 'j', _sala_correlation_id: 'c', encargo_id: ENC })
    expect(() => f({ statusCode: 409, body: { error: 'turno_no_esperado' } })).toThrow(/TURNO_RECHAZADO.*409/)
    expect(() => f({ error: { message: 'x' } })).toThrow(/NO_LLEGO/)
  })
})

describe('vigía · qué hacer con cada pendiente', () => {
  const f = (statusCode: number, body: unknown, env: Record<string, string> = { SALA_DISPATCH_KEY: 'k' }) => json(ejecutar('vigia-n1-reanudar.js', { input: [{ statusCode, body }], env }))
  it('apagada o dry_run ⇒ no sale nada', () => { expect(f(200, { accion: 'apagada' })).toEqual([]); expect(f(200, { accion: 'dry_run' })).toEqual([]) })
  it('un ítem por encargo a reanudar y uno por cable de los que cerraron fallidos', () => {
    const r = f(200, { accion: 'vigilado', vencidas: ['h1'], reanudar: ['e1', 'e2'], fallidos: ['e3'], cierres: [{ encargo_id: 'e3', resultado_para_la_sala: 'fallido', sala_ref: { _journey_id: 'j', _sala_correlation_id: 'c' }, client_id: 'c1', brief_id: 'BRF-1' }] })
    expect(r.map((x) => x.tipo)).toEqual(['reanudar', 'reanudar', 'cable'])
    expect(r[2].payload_cable).toMatchObject({ resultado: 'fallido', brief_id: 'BRF-1', client_id: 'c1', _journey_id: 'j' })
  })
  it('un error de la ruta se DETIENE (no se lee como «nada que hacer»)', () => { expect(() => f(500, { error: 'oficina_error' })).toThrow(/VIGIA_RECHAZADO/); expect(() => f(401, {})).toThrow(/VIGIA_RECHAZADO/) })
  it('re-armar: empareja cada respuesta con su encargo; cerrado ⇒ nada; rechazo ⇒ se detiene', () => {
    const pend = [{ tipo: 'reanudar', llave: 'k', encargo_id: 'e1' }, { tipo: 'reanudar', llave: 'k', encargo_id: 'e2' }]
    const g = (resp: unknown[]) => json(ejecutar('vigia-n2-rearmar.js', { input: resp, nodos: { '① Qué hacer con cada pendiente': pend } }))
    const turno = { n: 2, pedido: { task: 'x' } }
    expect(g([{ statusCode: 200, body: { accion: 'esperar', turno } }, { statusCode: 200, body: { accion: 'cerrado' } }])).toEqual([{ llave: 'k', turno_body: { encargo_id: 'e1', turno } }])
    // el orden importa: la respuesta 1 es del encargo 2
    expect(g([{ statusCode: 200, body: { accion: 'cerrado' } }, { statusCode: 200, body: { accion: 'esperar', turno } }])).toEqual([{ llave: 'k', turno_body: { encargo_id: 'e2', turno } }])
    expect(() => g([{ statusCode: 500, body: { error: 'x' } }, { statusCode: 200, body: { accion: 'cerrado' } }])).toThrow(/REARMAR_RECHAZADO/)
  })
})

describe('UNIÓN · el pedido del orquestador pasa por los nodos del flujo (modo seco) y el encargo cierra', () => {
  it('portero y agentes simulados por los NODOS del flujo de turnos: el orquestador acepta cada respuesta y cierra sin desacuerdo', async () => {
    const M = crearMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    let r = a
    const vistos: string[] = []
    for (let i = 0; i < 30 && r.cuerpo.accion === 'esperar'; i++) {
      const t = r.cuerpo.turno as { n: number; paso: string; tipo: string; pedido: Record<string, unknown> }
      vistos.push(t.paso)
      const entrada = json(ejecutar('turno-n0-entrada.js', { input: [{ body: { encargo_id: id, turno: t }, headers: { 'x-sala-dispatch-key': 'k' } }], env: { SALA_DISPATCH_KEY: 'k' } }))[0]
      let cuerpo: any
      if (t.tipo === 'portero') cuerpo = json(ejecutar('turno-n3p-portero.js', { input: [entrada], nodos: { '⓪ Entrada · llave': [entrada] } }))[0].resultado_body
      else cuerpo = json(ejecutar('turno-n1-armar.js', { input: [entrada] }))[0].resultado_body
      expect(cuerpo.texto, `el nodo no entregó texto en «${t.paso}»`).toBeTruthy()
      r = await recibirResultado(M.P, id, cuerpo.n, { texto: cuerpo.texto, costo_usd: cuerpo.costo_usd })
    }
    expect(vistos).toEqual(['paquete', 'direccion_visual', 'prompts', 'mirar', 'texto', 'revision_jefe'])
    expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true, resultado_para_la_sala: 'encargo_en_bandeja' })
    expect(M.llamadas.imagenReal + M.llamadas.revisorReal + M.llamadas.salida).toBe(0)
    void avanzar
  })
})
