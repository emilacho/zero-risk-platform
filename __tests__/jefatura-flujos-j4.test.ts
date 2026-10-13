/**
 * J4 · los 2 flujos de la `jefatura` (turno y vigía), construidos INACTIVOS: su forma, la cabecera del editor, los moldes del modelo simulado de TODOS los esquemas, y el código de cada nodo ejecutado con un entorno falso.
 * Todo a US$ 0: sin n8n, sin red, sin modelo. El contrato que se asume de las rutas de CC#1 (J3) está en la cabecera de `construir-jefatura.mjs`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirTurno, construirVigia, CABECERA_DEL_EDITOR, FLUJOS } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'
import { ESQUEMAS, procesarSalida } from '../src/lib/oficina/salida'
import { EDITOR_WHITELIST } from '../src/lib/editor-routing'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/jefatura')
type Nodo = { name: string; type: string; parameters: Record<string, any>; retryOnFail?: boolean; onError?: string }
type Flujo = { name: string; nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean; settings: Record<string, unknown> }
const flujos = { turno: construirTurno(), vigia: construirVigia() } as unknown as Record<string, Flujo>
const nodoDe = (f: Flujo, nombre: string) => f.nodes.find((n) => n.name === nombre)!

// ───────── el entorno falso de un nodo de código de n8n
interface Entorno { input?: unknown[]; nodos?: Record<string, unknown[]>; env?: Record<string, string>; execution?: { id: string; resumeUrl: string } }
function ejecutar(archivo: string, e: Entorno): any[] {
  const codigo = fs.readFileSync(path.join(DIR, archivo), 'utf8')
  const items = (xs: unknown[]) => xs.map((j) => ({ json: j }))
  const entrada = items(e.input ?? [])
  const $input = { first: () => entrada[0], all: () => entrada }
  const $ = (nombre: string) => {
    if (!e.nodos?.[nombre]) throw new Error(`nodo inexistente en la prueba: ${nombre}`)
    const xs = items(e.nodos[nombre])
    return { first: () => xs[0], all: () => xs, itemMatching: (i: number) => xs[i] ?? xs[0] }
  }
  return new Function('$input', '$', '$env', '$workflow', '$execution', codigo)($input, $, e.env ?? {}, { id: 'wf-jefatura' }, e.execution ?? { id: 'ex-1', resumeUrl: 'https://n8n.test/resume/ex-1' })
}
const json = (xs: any[]) => xs.map((x) => x.json)

const LLAVE = 'llave-de-prueba-123'
const REV = '11111111-2222-3333-4444-555555555555'
const ENV = { SALA_DISPATCH_KEY: LLAVE }
const turnoBase = (pedido: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ n: 3, tipo: 'agente', paso: 'revision_fondo', dispatch_key: `${REV}:revision_fondo:1`, pedido: { agent_name: 'jefe-marketing', task: 'estás revisando la pieza', client_id: 'c1', esquema: 'fichas.v1', max_budget_usd: 0.2, dry_run: true, ...pedido }, ...extra })
const entradaOk = (pedido: Record<string, unknown> = {}) => ({ headers: { 'x-sala-dispatch-key': LLAVE }, body: { revision_id: REV, turno: turnoBase(pedido) } })
const armar = (pedido: Record<string, unknown>) => {
  const e = json(ejecutar('turno-n0-entrada.js', { input: [entradaOk(pedido)], env: ENV }))[0]
  return json(ejecutar('turno-n1-armar.js', { input: [e] }))
}
const textoDe = (r: any[]) => JSON.parse(r[0].resultado_body.texto)

describe('la FORMA de los 2 flujos: inactivos, sin reintentos que paguen, sin llaves escritas', () => {
  for (const [k, f] of Object.entries(flujos)) {
    describe(k, () => {
      it('JSON serializable, nombres únicos y todas las conexiones apuntan a nodos que existen', () => {
        expect(JSON.parse(JSON.stringify(f)).nodes).toHaveLength(f.nodes.length)
        const nombres = f.nodes.map((n) => n.name)
        expect(new Set(nombres).size).toBe(nombres.length)
        for (const [de, c] of Object.entries(f.connections)) { expect(nombres).toContain(de); for (const salida of c.main) for (const a of salida) expect(nombres, `${de} → ${a.node}`).toContain(a.node) }
      })
      it('nace sin `active` (el POST de n8n lo deja inactivo) y nada tiene reintento automático', () => {
        expect(f.active).toBeUndefined()
        for (const n of f.nodes) expect(n.retryOnFail, n.name).toBeUndefined()
      })
      it('toda llamada HTTP entrega siempre salida (neverError + continueRegularOutput)', () => {
        for (const n of f.nodes.filter((x) => x.type.endsWith('httpRequest'))) {
          expect(n.parameters.options.response.response.neverError, n.name).toBe(true)
          expect(n.onError, n.name).toBe('continueRegularOutput')
        }
      })
      it('no lleva ninguna llave escrita: las llaves van por variable de entorno', () => {
        const t = JSON.stringify(f)
        expect(t).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/)
        expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./)
        for (const n of f.nodes.filter((x) => x.type.endsWith('httpRequest'))) for (const h of n.parameters.headerParameters.parameters) if (/key/i.test(h.name)) expect(h.value, `${n.name}/${h.name}`).toMatch(/^=\{\{ \$env\.[A-Z_]+/)
      })
    })
  }
  it('no toca la oficina: sus rutas y su webhook son propios de la jefatura', () => {
    const t = JSON.stringify(flujos)
    expect(t).not.toMatch(/api\/oficina|zero-risk\/oficina/)
    expect(t).toMatch(/api\/jefatura\/turnos/); expect(t).toMatch(/api\/jefatura\/vigia/); expect(t).toMatch(/zero-risk\/jefatura-turno/)
    expect(nodoDe(flujos.turno, 'Webhook · jefatura turno').parameters.path).toBe('zero-risk/jefatura-turno')
  })
  it('el nodo «Agente» manda SIEMPRE x-skip-editor-middleware: 1 (prueba (a) del diseño §9.4) y es el único que llama a run-sdk', () => {
    const agentes = flujos.turno.nodes.filter((n) => String(n.parameters.url).includes('/api/agents/run-sdk'))
    expect(agentes.map((n) => n.name)).toEqual(['② Agente (run-sdk)'])
    expect(CABECERA_DEL_EDITOR).toEqual({ name: 'x-skip-editor-middleware', value: '1' })
    expect(agentes[0].parameters.headerParameters.parameters).toContainEqual({ name: 'x-skip-editor-middleware', value: '1' })
    // el vigía no llama a ningún agente
    expect(flujos.vigia.nodes.some((n) => String(n.parameters.url).includes('run-sdk'))).toBe(false)
  })
  it('el vigía corre cada 10 min y el turno espera la vuelta como máximo 30 min', () => {
    expect(nodoDe(flujos.vigia, 'Reloj · cada 10 min').parameters.rule.interval[0]).toEqual({ field: 'minutes', minutesInterval: 10 })
    const e = nodoDe(flujos.turno, '② Esperar al agente').parameters
    expect(e.limitWaitTime).toBe(true); expect(e.resumeAmount * (e.resumeUnit === 'seconds' ? 1 : 60)).toBe(1800)
  })
  it('FLUJOS exporta solo turno y vigía (la puerta de la jefatura es una RUTA, no un flujo)', () => { expect(Object.keys(FLUJOS)).toEqual(['turno', 'vigia']) })
})

describe('⓪ Entrada · llave', () => {
  it('con la llave bien y un pedido completo deja pasar; dry_run sale del pedido', () => {
    const r = json(ejecutar('turno-n0-entrada.js', { input: [entradaOk()], env: ENV }))[0]
    expect(r.revision_id).toBe(REV); expect(r.dry_run).toBe(true); expect(r.turno.n).toBe(3)
  })
  it.each([
    ['sin llave en el motor', { input: [entradaOk()], env: {} }, /JEFATURA_TURNO_CERRADO/],
    ['llave equivocada', { input: [{ ...entradaOk(), headers: { 'x-sala-dispatch-key': 'otra' } }], env: ENV }, /PROCEDENCIA_INVALIDA/],
    ['sin llave en la llamada', { input: [{ ...entradaOk(), headers: {} }], env: ENV }, /PROCEDENCIA_INVALIDA/],
  ])('%s → se DETIENE', (_n, entorno, re) => { expect(() => ejecutar('turno-n0-entrada.js', entorno as Entorno)).toThrow(re as RegExp) })
  it('revision_id no uuid, turno sin número, tipo que no es agente, sin esquema o sin dry_run booleano → se DETIENE', () => {
    const con = (cambio: (b: any) => void) => { const e = entradaOk(); cambio(e.body); return { input: [e], env: ENV } }
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { b.revision_id = 'x' }))).toThrow(/SIN_REVISION/)
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { b.turno.n = 0 }))).toThrow(/SIN_NUMERO/)
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { b.turno.tipo = 'portero' }))).toThrow(/TIPO_INVALIDO/)
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { delete b.turno.pedido.esquema }))).toThrow(/SIN_ESQUEMA/)
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { delete b.turno.pedido.dry_run }))).toThrow(/SIN_DRY_RUN/)
    expect(() => ejecutar('turno-n0-entrada.js', con((b) => { b.turno.pedido.dry_run = 'false' }))).toThrow(/SIN_DRY_RUN/)
  })
})

describe('② Armar el pedido · moldes del modelo simulado', () => {
  const KIT = '## Elementos del kit:\n- e01: historia\n- e02: estado'
  const CARRUSEL = '## Roles de lámina posibles (el ref de una imagen es un rol): hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre'
  const FICHAS = '- [jefe-3-0] (bloquea) en texto: algo · contra: manual · propuesta: cambia\n- [jefe-3-1] (sugerencia) en imagen: otro · contra: brief · propuesta: ajusta'
  const NUEVOS = ['resolucion_objeto.v1', 'resolucion_parcial.v1', 'resolucion_plan.v1']
  const codigoArmar = fs.readFileSync(path.join(DIR, 'turno-n1-armar.js'), 'utf8')

  it('todo esquema de la oficina (menos la opinión libre de GPT, que va dentro de la ruta) tiene molde válido contra SU contrato de formato', () => {
    for (const esquema of Object.keys(ESQUEMAS).filter((k) => k !== 'opinion_libre.v1')) {
      const task = ['direccion_imagenes.v1', 'estructura.v1', 'copy_kit.v1'].includes(esquema) ? KIT : esquema === 'prompts_por_ref.v1' ? `${KIT}\n\n## Imágenes que hay que GENERAR (ref → para qué)\n- e01: el plato` : esquema.startsWith('observacion') ? 'imagen 1: índice 0' : esquema === 'laminas.v1' || esquema === 'copy_base.v1' ? CARRUSEL : FICHAS
      const r = armar({ esquema, task })
      expect(r[0].simulado, esquema).toBe(true); expect(r[0].resultado_body.error, esquema).toBeUndefined()
      const v = procesarSalida(r[0].resultado_body.texto, esquema, 1, 0)
      expect(v.ok, `${esquema} · ${JSON.stringify(v)}`).toBe(true)
    }
  })
  it('los esquemas de re-entrega por tipo (estrategia, calendario, plan) tienen molde y devuelven JSON', () => {
    for (const esquema of NUEVOS) { const j = textoDe(armar({ esquema, task: FICHAS })); expect(Array.isArray(j.respuestas), esquema).toBe(true); expect(j.respuestas).toHaveLength(2) }
  })
  it('BARRIDO moldes↔esquemas: ningún esquema nombrado en el código de la jefatura queda sin molde (un esquema sin molde sería un error visible, pero aquí se prueba que no haya ninguno)', () => {
    const buscar = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? buscar(path.join(dir, d.name)) : d.name.endsWith('.ts') && !d.name.endsWith('.test.ts') ? [path.join(dir, d.name)] : [])) : [])
    const nombrados = new Set<string>(NUEVOS)
    for (const f of buscar(path.join(process.cwd(), 'src/lib/jefatura/revision'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/'((?:[a-z]+_)*[a-z]+\.v\d+)'/g)) nombrados.add(m[1])
    for (const k of Object.keys(ESQUEMAS)) if (k !== 'opinion_libre.v1') nombrados.add(k)
    const sinMolde = [...nombrados].filter((k) => !codigoArmar.includes(`'${k}'`))
    expect(sinMolde).toEqual([])
  })
  it('un esquema SIN molde devuelve un error visible al motor (no mata la ejecución ni la deja corriendo)', () => {
    const r = armar({ esquema: 'esquema_inventado.v1' })
    expect(r[0].resultado_body.texto).toBeUndefined(); expect(r[0].resultado_body.error).toMatch(/JEFATURA_SIN_MOLDE_SIMULADO/); expect(r[0].resultado_body.n).toBe(3); expect(r[0].resultado_body.revision_id).toBe(REV)
  })
  it('simulacion.fichas fuerza ninguna / sugerencia / bloquea en la revisión de fondo', () => {
    expect(textoDe(armar({ esquema: 'fichas.v1', simulacion: { fichas: 'ninguna' } })).fichas).toEqual([])
    expect(textoDe(armar({ esquema: 'fichas.v1' })).fichas).toEqual([])
    const b = textoDe(armar({ esquema: 'fichas.v1', simulacion: { fichas: 'bloquea', donde: 'imagen' } })).fichas
    expect(b).toHaveLength(1); expect(b[0].gravedad).toBe('bloquea'); expect(b[0].donde).toBe('imagen')
    expect(textoDe(armar({ esquema: 'fichas.v1', simulacion: { fichas: 'sugerencia' } })).fichas[0].gravedad).toBe('sugerencia')
    expect(procesarSalida(JSON.stringify({ fichas: b }), 'fichas.v1', 1, 0).ok).toBe(true)
  })
  it('simulacion.toma fuerza tomada / no_tomada sobre los ids REALES del pedido; la pieza corregida solo viene si tomó algo', () => {
    const todo = textoDe(armar({ esquema: 'resolucion.v1', task: FICHAS }))
    expect(todo.respuestas.map((r: any) => [r.id, r.estado])).toEqual([['jefe-3-0', 'tomada'], ['jefe-3-1', 'tomada']]); expect(todo.pieza.pie_de_foto).toMatch(/corregido/)
    const nada = textoDe(armar({ esquema: 'resolucion.v1', task: FICHAS, simulacion: { toma: 'nada' } }))
    expect(nada.respuestas.every((r: any) => r.estado === 'no_tomada' && r.razon.length > 0)).toBe(true); expect(nada.pieza).toBeUndefined()
    expect(procesarSalida(JSON.stringify(todo), 'resolucion.v1', 1, 0).ok).toBe(true)
  })
  it('simulacion.productor: formato_roto falla una vez y pasa en el reintento; formato_roto_siempre nunca; muerto no contesta', () => {
    const roto = armar({ esquema: 'fichas.v1', simulacion: { productor: 'formato_roto' } })
    expect(procesarSalida(roto[0].resultado_body.texto, 'fichas.v1', 1, 0).ok).toBe(false)
    expect(procesarSalida(armar({ esquema: 'fichas.v1', simulacion: { productor: 'formato_roto' }, reintento_formato: true })[0].resultado_body.texto, 'fichas.v1', 1, 0).ok).toBe(true)
    expect(procesarSalida(armar({ esquema: 'fichas.v1', simulacion: { productor: 'formato_roto_siempre' }, reintento_formato: true })[0].resultado_body.texto, 'fichas.v1', 1, 0).ok).toBe(false)
    expect(armar({ esquema: 'fichas.v1', simulacion: { productor: 'muerto' } })).toEqual([])
  })
  it('el plan simulado: mejora = el largo de A; demasiado_corta = 30 % (bajo el umbral de 60 %); empeora lleva marcas que el chequeo por código detecta; sin tomar nada no hay texto', () => {
    const largo = (sim: Record<string, unknown>) => textoDe(armar({ esquema: 'resolucion_plan.v1', task: FICHAS, simulacion: { largo_a: 20000, ...sim } })).texto_completo
    expect(largo({ version_nueva: 'mejora' }).length).toBe(20000)
    expect(largo({ version_nueva: 'demasiado_corta' }).length).toBeLessThan(20000 * 0.6)
    expect(largo({ version_nueva: 'empeora' })).toMatch(/A calcular/)
    expect(largo({ version_nueva: 'mejora' })).not.toMatch(/A calcular|TBD/)
    expect(textoDe(armar({ esquema: 'resolucion_plan.v1', task: FICHAS, simulacion: { toma: 'nada' } })).texto_completo).toBeUndefined()
  })
  it('la simulación solo vale con dry_run=true: en real se ignora', () => {
    const e = json(ejecutar('turno-n0-entrada.js', { input: [entradaOk({ dry_run: false, simulacion: { fichas: 'bloquea' }, max_budget_usd: 0.2 })], env: ENV }))[0]
    const r = json(ejecutar('turno-n1-armar.js', { input: [e] }))[0]
    expect(r.simulado).toBe(false); expect(r.cuerpo.agent).toBe('jefe-marketing')
  })
})

describe('② Armar el pedido · el pedido REAL a run-sdk', () => {
  const real = (pedido: Record<string, unknown> = {}) => {
    const e = json(ejecutar('turno-n0-entrada.js', { input: [entradaOk({ dry_run: false, ...pedido })], env: ENV }))[0]
    return json(ejecutar('turno-n1-armar.js', { input: [e] }))[0]
  }
  it('lleva el flujo y la ejecución ARRIBA del cuerpo, force_restart, vuelta por el corredor, el tope del paso y la clave del paso', () => {
    const c = real({ thinking_mode: undefined }).cuerpo
    expect(c).toMatchObject({ agent: 'jefe-marketing', client_id: 'c1', workflow_id: 'wf-jefatura', workflow_execution_id: 'ex-1', callback_url: 'https://n8n.test/resume/ex-1', callback_mode: 'runner', force_restart: true, dry_run: false, max_budget_usd: 0.2, thinking_mode: 'disabled' })
    expect(c.extra.dispatch_key).toBe(`${REV}:revision_fondo:1`)
  })
  it('REGLA DURA del editor: `extra` solo lleva claves de la lista cerrada; jamás workflow_execution_id (aunque el pedido lo traiga)', () => {
    const c = real({ extra: { workflow_execution_id: 'robado', indicacion_jefatura: 'x', paso_de_la_jefatura: 'revision_fondo', revision_id: REV, cualquier_otra: 1, dispatch_key: 'falsa' } }).cuerpo
    expect(Object.keys(c.extra).sort()).toEqual(['dispatch_key', 'indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id'])
    expect(c.extra.workflow_execution_id).toBeUndefined(); expect(c.extra.dispatch_key).toBe(`${REV}:revision_fondo:1`)
  })
  it('sin tope de gasto del paso NO se paga: se DETIENE', () => {
    expect(() => real({ max_budget_usd: undefined })).toThrow(/JEFATURA_SIN_TOPE_DEL_PASO/)
    expect(() => real({ max_budget_usd: 0 })).toThrow(/JEFATURA_SIN_TOPE_DEL_PASO/)
  })
  it('las imágenes viajan en base64 solo si hay', () => {
    expect(real({ images: ['https://x/1.png'] }).cuerpo).toMatchObject({ images: ['https://x/1.png'], images_mode: 'base64' })
    expect(real().cuerpo.images).toBeUndefined()
  })
  it('hay agentes de la lista del editor entre los que la jefatura llamará (por eso la cabecera no es opcional)', () => {
    for (const a of ['content-creator', 'social-media-strategist']) expect(Object.keys(EDITOR_WHITELIST)).toContain(a)
  })
})

describe('② ¿Aceptó el pedido? y ② Vuelta (heredados de la oficina, con revision_id)', () => {
  const c = { revision_id: REV, turno: { n: 3 } }
  it('aceptado = 202 accepted; un rechazo o una caída llevan su error a la ruta con el número del turno', () => {
    expect(json(ejecutar('turno-n2-acepto.js', { input: [{ body: { accepted: true } }], nodos: { '② Armar el pedido': [c] } }))[0].aceptado).toBe(true)
    const r = json(ejecutar('turno-n2-acepto.js', { input: [{ body: { error: 'gasto', code: 'SPEND' } }], nodos: { '② Armar el pedido': [c] } }))[0]
    expect(r.aceptado).toBe(false); expect(r.resultado_body).toMatchObject({ accion: 'resultado', revision_id: REV, n: 3 }); expect(r.resultado_body.error).toMatch(/JEFATURA_PEDIDO_RECHAZADO/)
    expect(json(ejecutar('turno-n2-acepto.js', { input: [{ error: { message: 'timeout' } }], nodos: { '② Armar el pedido': [c] } }))[0].resultado_body.error).toMatch(/JEFATURA_PEDIDO_NO_LLEGO/)
  })
  it('la vuelta: texto y costo; un fallo declarado no se manda como respuesta; vacío es error', () => {
    const v = (cuerpo: unknown) => json(ejecutar('turno-n3-vuelta.js', { input: [{ body: cuerpo }], nodos: { '② Armar el pedido': [c] } }))[0].resultado_body
    expect(v({ response: '{"fichas":[]}', cost_usd: 0.07, tokens_in: 10, tokens_out: 5 })).toMatchObject({ accion: 'resultado', revision_id: REV, n: 3, texto: '{"fichas":[]}', costo_usd: 0.07, tokens_in: 10, tokens_out: 5 })
    expect(v({ success: false, error: 'tope', response: 'parcial', partial: true }).texto).toBeUndefined()
    expect(v({ success: false, error: 'tope' }).error).toMatch(/FALLÓ/)
    expect(v({ response: '  ' }).error).toMatch(/vacía/)
  })
})

describe('③ ¿Y ahora? · qué sigue y a quién se entrega', () => {
  const c = { revision_id: REV, turno: { n: 3 } }
  const sigue = (respuesta: unknown, env: Record<string, string> = {}) => json(ejecutar('turno-n4-sigue.js', { input: [respuesta], nodos: { '⓪ Entrada · llave': [c] }, env }))[0]
  it('`esperar` despierta el siguiente turno de la MISMA revisión', () => {
    const r = sigue({ statusCode: 200, body: { accion: 'esperar', turno: { n: 4, tipo: 'agente' } } })
    expect(r).toEqual({ ruta: 'esperar', turno_body: { revision_id: REV, turno: { n: 4, tipo: 'agente' } } })
  })
  it('`cerrado` con webhook: entrega a NUESTRO n8n o a NUESTRO Vercel, con el resultado y lo que pida el llamador', () => {
    const r = sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'con_desacuerdo', devolver: { tipo: 'webhook', url: 'https://n8n-production-72be.up.railway.app/webhook/resume/abc', cuerpo: { texto_B: 'x' } } } })
    expect(r.ruta).toBe('webhook'); expect(r.entrega_url).toMatch(/^https:\/\/n8n-production-72be/); expect(r.entrega_cuerpo).toEqual({ revision_id: REV, resultado: 'con_desacuerdo', texto_B: 'x' })
    expect(sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'limpia', devolver: { tipo: 'webhook', url: 'https://zero-risk-platform.vercel.app/api/x' } } }).ruta).toBe('webhook')
    expect(sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'limpia', devolver: { tipo: 'webhook', url: 'https://n8n.test/webhook/resume/z' } } }, { N8N_WEBHOOK_BASE: 'https://n8n.test/webhook' }).ruta).toBe('webhook')
  })
  it('NUNCA entrega a un tercero: una dirección ajena (o con el prefijo parecido) se DETIENE', () => {
    for (const url of ['https://malo.example.com/hook', 'https://n8n-production-72be.up.railway.app.malo.com/webhook/x', 'http://zero-risk-platform.vercel.app/x', '']) {
      expect(() => sigue({ statusCode: 200, body: { accion: 'cerrado', devolver: { tipo: 'webhook', url } } }), url).toThrow(/JEFATURA_DESTINO_NO_PERMITIDO/)
    }
  })
  it('`cerrado` por sala_ref manda el cable con el resultado y las dos marcas; sin destino no entrega nada', () => {
    const r = sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: true }, devolver: { tipo: 'sala_ref' }, sala_ref: { _sala_correlation_id: 'cc', _journey_id: 'jj' } } })
    expect(r.ruta).toBe('cable'); expect(r.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'jefatura', revision_id: REV, con_desacuerdo: true, sin_segunda_mirada: true, _sala_correlation_id: 'cc', _journey_id: 'jj' })
    expect(sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'limpia', devolver: { tipo: 'ninguno' } } })).toEqual({ ruta: 'nada' })
    expect(sigue({ statusCode: 200, body: { accion: 'cerrado', resultado: 'limpia' } })).toEqual({ ruta: 'nada' })
  })
  it('cualquier otra respuesta (409, 5xx, caída) se DETIENE con su motivo: nunca se da por bien', () => {
    expect(() => sigue({ statusCode: 409, body: { error: 'turno no esperado' } })).toThrow(/JEFATURA_TURNO_RECHAZADO.*409/)
    expect(() => sigue({ statusCode: 500, body: {} })).toThrow(/JEFATURA_TURNO_RECHAZADO/)
    expect(() => sigue({ error: { message: 'ECONNRESET' } })).toThrow(/JEFATURA_RESULTADO_NO_LLEGO/)
  })
})

describe('el vigía', () => {
  const vigia = (respuesta: unknown, env: Record<string, string> = { SALA_DISPATCH_KEY: LLAVE }) => json(ejecutar('vigia-n1-reanudar.js', { input: [respuesta], env }))
  it('apagada o sin trabajo: ningún ítem; un error de la ruta se DETIENE', () => {
    expect(vigia({ statusCode: 200, body: { accion: 'apagada' } })).toEqual([])
    expect(vigia({ statusCode: 200, body: { accion: 'vigilado', reanudar: [], cierres: [] } })).toEqual([])
    expect(() => vigia({ statusCode: 500, body: { error: 'x' } })).toThrow(/JEFATURA_VIGIA_RECHAZADO/)
    expect(() => vigia({ error: { message: 'timeout' } })).toThrow(/JEFATURA_VIGIA_NO_LLEGO/)
  })
  it('un ítem por revisión a reanudar y uno por cierre a entregar (webhook propio o cable)', () => {
    const r = vigia({ statusCode: 200, body: { accion: 'vigilado', reanudar: [REV], cierres: [
      { revision_id: 'r2', resultado: 'fallida', devolver: { tipo: 'webhook', url: 'https://zero-risk-platform.vercel.app/api/x' } },
      { revision_id: 'r3', resultado: 'fallida', devolver: { tipo: 'sala_ref' }, sala_ref: { _sala_correlation_id: 'cc' }, client_id: 'c9' },
      { revision_id: 'r4', resultado: 'fallida', devolver: { tipo: 'ninguno' } },
    ] } })
    expect(r.map((x) => x.tipo)).toEqual(['reanudar', 'webhook', 'cable'])
    expect(r[0]).toMatchObject({ revision_id: REV, llave: LLAVE }); expect(r[1].entrega_cuerpo).toEqual({ revision_id: 'r2', resultado: 'fallida' }); expect(r[2].payload_cable).toMatchObject({ worker_name: 'jefatura', revision_id: 'r3', client_id: 'c9' })
  })
  it('tampoco entrega a un tercero', () => {
    expect(() => vigia({ statusCode: 200, body: { accion: 'vigilado', cierres: [{ revision_id: 'r', devolver: { tipo: 'webhook', url: 'https://malo.example.com/x' } }] } })).toThrow(/JEFATURA_DESTINO_NO_PERMITIDO/)
  })
  it('re-armar: pasa el turno de la ruta al flujo; cerrado por otro camino = nada; rechazo = se DETIENE', () => {
    const pend = [{ revision_id: REV, llave: LLAVE }]
    const r = (resp: unknown) => json(ejecutar('vigia-n2-rearmar.js', { input: [resp], nodos: { '① Qué hacer con cada pendiente': pend } }))
    expect(r({ statusCode: 200, body: { accion: 'esperar', turno: { n: 5, pedido: { agent_name: 'x' } } } })).toEqual([{ turno_body: { revision_id: REV, turno: { n: 5, pedido: { agent_name: 'x' } } } }])
    expect(r({ statusCode: 200, body: { accion: 'cerrado' } })).toEqual([])
    expect(() => r({ statusCode: 409, body: { error: 'x' } })).toThrow(/JEFATURA_VIGIA_REARMAR_RECHAZADO/)
  })
})
