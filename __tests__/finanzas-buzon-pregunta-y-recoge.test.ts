/**
 * EL BUZÓN PREGUNTA Y RECOGE (CC#2 · 20-oct · parte 5). US$ 0 · Slack, cerebro y base SIMULADOS · los nodos de n8n se ejecutan tal cual salen del constructor.
 * Lo que se prueba: (1) el tuteo antes de enviar (el acuerdo del CFO llegó en voseo y se habría frenado en silencio), (2) la lista de MD abiertos que lee el vigía,
 * (3) la ruta `buzon_abiertos`, (4) la rama lateral de la planeación (1 nodo y 1 cable, nada más) y (5) el flujo nuevo del vigía.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { listarAbiertos, preguntarAlDueno, tutearPregunta, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { voseoEn } from '../src/lib/finanzas/preguntas'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import type { CerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import type { AlmacenDeConversa, EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { agregarPreguntar, flujoDelVigia, NODO_PREGUNTAR } from '../scripts/worker-staging/finanzas-buzon/construir-buzon-2026-10-20.mjs'
import ANTES from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ANTES-buzon-2026-10-20.json'
import ARREGLADO from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ARREGLADO-buzon-2026-10-20.json'

const DUENO = 'U_DUENO', MD = 'D123ABC'
const VOSEO = { clave: 'presupuesto_mensual', texto: '¿Cuánto podés invertir al mes y qué manejás hoy?', recomendacion: 'Decime la cifra real que tenés', supuesto_si_no_responde: 'se supone que no tenés pauta' }

function slackFalso() {
  const llamadas: Array<{ metodo: string; cuerpo?: any }> = []
  const f = (async (url: string, init?: any) => {
    const metodo = new URL(url).pathname.replace('/api/', '')
    llamadas.push({ metodo, cuerpo: init?.body ? JSON.parse(init.body) : undefined })
    const json = (j: unknown) => ({ status: 200, json: async () => j })
    if (metodo === 'chat.postMessage') return json({ ok: true, ts: '1700000000.000100', channel: MD })
    return json({ ok: true, messages: [], has_more: false })
  }) as unknown as typeof fetch
  return { f, llamadas }
}
function mundo(preguntas: unknown[], extra: Partial<AlmacenDeConversa> = {}) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'cliente-prueba', estado: 'cerrado', estado_del_motor: estadoInicial(), gasto_usd: 1.2, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: {} }
  const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: preguntas } }
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { return { ok: true, encargo: e, nuevo: false } },
    async leerEncargo() { return structuredClone(e) },
    async guardar() { throw new Error('el buzón no debe tocar el motor') },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return [] },
    async guardarBuzon(c) { if (c.slack_ts !== undefined) e.slack_ts = c.slack_ts; if (c.slack_canal !== undefined) e.slack_canal = c.slack_canal },
    ...extra,
  }
  return { e, almacen }
}
const cerebro = () => { const registradas: any[] = []; const c: CerebroDelDueno = { async registrarPregunta(p) { registradas.push(p); return { ok: true, estado: 'registrada', pregunta_id: 'pid' } }, async registrarRespuesta() { return { ok: true } } }; return { c, registradas } }
const puertos = (almacen: AlmacenDeConversa, s: ReturnType<typeof slackFalso>, c: CerebroDelDueno, modo: PuertosDelBuzon['modo'] = 'envia'): PuertosDelBuzon =>
  ({ almacen, slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: DUENO, fetch: s.f }), cerebro: c, modo, ahora: () => new Date(1_700_000_000_000) })

describe('TUTEO antes de enviar', () => {
  it('el voseo del acuerdo pasa a tuteo y la pregunta queda limpia en los tres campos', () => {
    const r = tutearPregunta(VOSEO)
    expect(r.cambiada).toBe(true)
    for (const v of [r.q.texto, r.q.recomendacion, r.q.supuesto_si_no_responde]) expect(voseoEn(v)).toEqual([])
    expect(r.q.texto).toContain('puedes'); expect(r.q.texto).toContain('manejas'); expect(r.q.recomendacion).toContain('tienes'); expect(r.q.supuesto_si_no_responde).toContain('tienes')
    expect(r.q.clave).toBe(VOSEO.clave)
  })
  it('un texto que ya está en tuteo no cambia (misma referencia)', () => {
    const q = { clave: 'a', texto: '¿Cuánto puedes invertir?', recomendacion: 'Responde la cifra', supuesto_si_no_responde: 'se supone cero' }
    const r = tutearPregunta(q); expect(r.cambiada).toBe(false); expect(r.q).toBe(q)
  })
  it('si tras la barrida aún queda voseo (forma que la tabla no conoce), se conserva el ORIGINAL entero: nunca sale a medias', () => {
    const q = { clave: 'a', texto: '¿Cuánto podés invertir? ¿Qué invertís hoy?', recomendacion: 'Responde', supuesto_si_no_responde: 'cero' }
    const r = tutearPregunta(q); expect(r.cambiada).toBe(false); expect(r.q).toBe(q)
  })
  it('PREGUNTAR con voseo que no se puede limpiar: NO sale nada y lo dice (el filtro de siempre)', async () => {
    const m = mundo([{ clave: 'a', texto: '¿Qué invertís hoy?', recomendacion: 'Responde', supuesto_si_no_responde: 'cero' }]), s = slackFalso(), c = cerebro()
    const r = await preguntarAlDueno(puertos(m.almacen, s, c.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: false, motivo: 'pregunta_mal_formada' }); expect(s.llamadas).toEqual([]); expect(c.registradas).toEqual([])
  })
  it('PREGUNTAR con voseo en el acuerdo: SALE un MD en tuteo (antes no salía nada), registra la pregunta tuteada en el cerebro y lo dice', async () => {
    const m = mundo([VOSEO]), s = slackFalso(), c = cerebro()
    const r = await preguntarAlDueno(puertos(m.almacen, s, c.c), 'enc-1')
    expect(r.cuerpo).toMatchObject({ enviado: true, tuteadas: ['presupuesto_mensual'] })
    const texto: string = s.llamadas.find((l) => l.metodo === 'chat.postMessage')!.cuerpo.text
    expect(voseoEn(texto)).toEqual([]); expect(texto).toContain('puedes')
    expect(voseoEn(c.registradas[0].pregunta)).toEqual([])
  })
  it('🔴 el «queda limpio» mira los TRES campos: si el voseo que sobra está solo en la recomendación o en el «si no respondes», se conserva el original entero', () => {
    for (const campo of ['recomendacion', 'supuesto_si_no_responde'] as const) {
      const q = { clave: 'a', texto: '¿Cuánto podés invertir?', recomendacion: 'Responde la cifra', supuesto_si_no_responde: 'se supone cero', [campo]: 'Contá con que invertís' }
      const r = tutearPregunta(q as any); expect(r.cambiada, campo).toBe(false); expect(r.q, campo).toBe(q)
    }
  })
  it('una pregunta sin voseo no trae la marca `tuteadas`', async () => {
    const m = mundo([{ clave: 'a', texto: '¿Cuánto inviertes al mes?', recomendacion: 'Responde la cifra', supuesto_si_no_responde: 'se supone cero' }]), s = slackFalso()
    const r = await preguntarAlDueno(puertos(m.almacen, s, cerebro().c), 'enc-1')
    expect(r.cuerpo.enviado).toBe(true); expect(r.cuerpo).not.toHaveProperty('tuteadas')
  })
})

describe('LISTA de MD abiertos (la que lee el vigía)', () => {
  const con = (ids: string[] | null | 'lanza') => mundo([], { async buzonAbiertos(_a, horas) { if (ids === 'lanza') throw new Error('x'); expect(horas).toBe(72); return ids } })
  it('apagado ⇒ lista vacía y NO consulta la base', async () => {
    let llamado = false
    const m = mundo([], { async buzonAbiertos() { llamado = true; return ['x'] } })
    const r = await listarAbiertos(puertos(m.almacen, slackFalso(), cerebro().c, 'apagado'))
    expect(r).toMatchObject({ status: 200, cuerpo: { abiertos: [], motivo: 'buzon_apagado' } }); expect(llamado).toBe(false)
    expect((await listarAbiertos(puertos(m.almacen, slackFalso(), cerebro().c, 'borrador'))).cuerpo.abiertos).toEqual([])
  })
  it('encendido ⇒ los ids, con el tope de 72 h', async () => {
    expect(await listarAbiertos(puertos(con(['a', 'b']).almacen, slackFalso(), cerebro().c))).toMatchObject({ status: 200, cuerpo: { abiertos: ['a', 'b'], total: 2 } })
    expect((await listarAbiertos(puertos(con([]).almacen, slackFalso(), cerebro().c))).cuerpo).toMatchObject({ abiertos: [], total: 0 })
  })
  it('una lista que no se pudo leer es 503 (no «ninguno»): el vigía lo tiene que ver', async () => {
    expect((await listarAbiertos(puertos(con(null).almacen, slackFalso(), cerebro().c))).status).toBe(503)
    expect((await listarAbiertos(puertos(con('lanza').almacen, slackFalso(), cerebro().c))).status).toBe(503)
  })
  it('un almacén sin el método responde «sin_lista», no revienta', async () => {
    expect((await listarAbiertos(puertos(mundo([]).almacen, slackFalso(), cerebro().c))).cuerpo).toMatchObject({ abiertos: [], motivo: 'sin_lista' })
  })
})

describe('LA PLANEACIÓN · una rama lateral (1 nodo y 1 cable)', () => {
  const A = ANTES as any, B = ARREGLADO as any
  it('el archivo ARREGLADO es EXACTAMENTE lo que produce el constructor sobre el ANTES', () => { expect(JSON.stringify(agregarPreguntar(A))).toBe(JSON.stringify(B)) })
  it('+1 nodo, ningún nodo existente cambia, ningún cable existente desaparece', () => {
    expect(B.nodes.length).toBe(A.nodes.length + 1)
    const antes = new Map(A.nodes.map((n: any) => [n.name, JSON.stringify(n)]))
    expect(B.nodes.filter((n: any) => antes.has(n.name) && antes.get(n.name) !== JSON.stringify(n))).toEqual([])
    expect(B.nodes.filter((n: any) => !antes.has(n.name)).map((n: any) => n.name)).toEqual([NODO_PREGUNTAR])
    for (const k of Object.keys(A.connections)) if (k !== 'FIN · cerrar la oficina') expect(B.connections[k]).toEqual(A.connections[k])
    expect(B.connections['FIN · cerrar la oficina'].main[0].map((x: any) => x.node)).toEqual([NODO_PREGUNTAR, 'FIN · sobre'])
    expect(B.connections[NODO_PREGUNTAR]).toBeUndefined() // sin salida: nada depende de lo que conteste
  })
  it('el nodo NUNCA frena: continúa ante error, nunca revienta con una respuesta mala, 30 s, y va ANTES del sobre', () => {
    const n = B.nodes.find((x: any) => x.name === NODO_PREGUNTAR)
    expect(n.onError).toBe('continueRegularOutput'); expect(n.parameters.options.timeout).toBe(30000); expect(n.parameters.options.response.response.neverError).toBe(true)
    expect(n.retryOnFail).toBeFalsy() // un reintento no puede mandar dos MD
  })
  it('el cuerpo que arma pide `preguntar` del encargo de la oficina, con el id de flujo y de ejecución', () => {
    const n = B.nodes.find((x: any) => x.name === NODO_PREGUNTAR)
    const expr = String(n.parameters.jsonBody).replace(/^=\{\{/, '').replace(/\}\}$/, '')
    const cuerpo = JSON.parse(vm.runInNewContext(expr, { JSON, String, $: () => ({ first: () => ({ json: { encargo_id: 'enc-9' } }) }), $workflow: { id: 'wf-1' }, $execution: { id: 77 } }))
    expect(cuerpo).toEqual({ accion: 'preguntar', encargo_id: 'enc-9', workflow_id: 'wf-1', workflow_execution_id: '77' })
  })
  it('🔴 la pregunta va POR ENCIMA del sobre (n8n v1 corre las ramas hermanas de arriba hacia abajo: si va debajo, sale cuando el redactor termina, ~15-20 min, y no sale si la ejecución muere en la espera)', () => {
    const p = B.nodes.find((x: any) => x.name === NODO_PREGUNTAR), sobre = B.nodes.find((x: any) => x.name === 'FIN · sobre')
    expect(p.position[1]).toBeLessThan(sobre.position[1])
    expect(B.nodes.filter((x: any) => x.position[0] === p.position[0] && x.position[1] === p.position[1])).toHaveLength(1) // no pisa a otro nodo
    // y entre las ramas hermanas de «cerrar la oficina», la de arriba es la primera que corre: ordenadas por y, la pregunta antes que el sobre
    const hermanas = B.connections['FIN · cerrar la oficina'].main[0].map((c: any) => B.nodes.find((x: any) => x.name === c.node)).sort((a: any, b: any) => a.position[1] - b.position[1])
    expect(hermanas.map((x: any) => x.name)).toEqual([NODO_PREGUNTAR, 'FIN · sobre'])
  })
  it('aplicarlo dos veces falla (no duplica el nodo)', () => { expect(() => agregarPreguntar(B)).toThrow() })
})

describe('EL VIGÍA `finanzas · buzón`', () => {
  const W = flujoDelVigia() as any
  const codigo = (nombre: string) => W.nodes.find((n: any) => n.name === nombre).parameters.jsCode as string
  const correr = (nombre: string, entrada: any[]) => vm.runInNewContext(`(function(){${codigo(nombre)}})()`, { $input: { first: () => entrada[0], all: () => entrada }, Number, Array, JSON, Error })
  it('nace con un reloj de 10 minutos y el recorrido abiertos → uno por encargo → recoger → resumen', () => {
    expect(W.nodes.find((n: any) => n.type.endsWith('scheduleTrigger')).parameters.rule.interval[0].expression).toBe('*/10 * * * *')
    expect(Object.keys(W.connections)).toEqual(['Cada 10 minutos', 'Buzón · abiertos', 'Buzón · uno por encargo', 'Buzón · recoger'])
    expect(W.nodes.every((n: any) => !('active' in n))).toBe(true)
  })
  it('las dos llamadas a la plataforma llevan workflow_id, workflow_execution_id y la llave interna', () => {
    for (const nombre of ['Buzón · abiertos', 'Buzón · recoger']) {
      const n = W.nodes.find((x: any) => x.name === nombre)
      expect(String(n.parameters.jsonBody)).toContain('workflow_id'); expect(String(n.parameters.jsonBody)).toContain('workflow_execution_id')
      expect(n.parameters.headerParameters.parameters.find((h: any) => h.name === 'x-api-key').value).toContain('INTERNAL_API_KEY')
    }
  })
  it('lista con 2 abiertos ⇒ 2 ítems; apagada (409) ⇒ 0; vacía ⇒ 0', () => {
    expect(correr('Buzón · uno por encargo', [{ json: { statusCode: 200, body: { abiertos: ['a', 'b'] } } }]).map((i: any) => i.json.encargo_id)).toEqual(['a', 'b'])
    expect(correr('Buzón · uno por encargo', [{ json: { statusCode: 409, body: { error: 'conversa_apagada' } } }])).toEqual([])
    expect(correr('Buzón · uno por encargo', [{ json: { statusCode: 200, body: { abiertos: [] } } }])).toEqual([])
  })
  it('un fallo al leer la lista NO se calla: lanza (ejecución en rojo); tampoco se traga una respuesta rara', () => {
    for (const r of [{ statusCode: 503, body: { error: 'abiertos_ilegibles' } }, { statusCode: 500, body: {} }, { body: {} }, {}])
      expect(() => correr('Buzón · uno por encargo', [{ json: r }])).toThrow()
    expect(correr('Buzón · uno por encargo', [{ json: { statusCode: 200, body: { abiertos: [1, null, '', 'ok'] } } }]).map((i: any) => i.json.encargo_id)).toEqual(['ok'])
  })
  it('máximo 20 encargos por vuelta', () => {
    const ids = Array.from({ length: 30 }, (_, i) => 'e' + i)
    expect(correr('Buzón · uno por encargo', [{ json: { statusCode: 200, body: { abiertos: ids } } }]).length).toBe(20)
  })
  it('el resumen cuenta lo aplicado y lanza si alguna recogida falló en el servidor (después de intentarlas todas)', () => {
    expect(correr('Buzón · resumen', [{ json: { statusCode: 200, body: { aplicadas: ['1', '2'] } } }, { json: { statusCode: 200, body: { recogido: false } } }])[0].json).toEqual({ encargos: 2, respuestas_aplicadas: 2 })
    expect(() => correr('Buzón · resumen', [{ json: { statusCode: 200, body: {} } }, { json: { statusCode: 502 } }])).toThrow()
    expect(() => correr('Buzón · resumen', [{ json: {} }])).toThrow()
    expect(correr('Buzón · resumen', [{ json: { statusCode: 409, body: {} } }])[0].json.encargos).toBe(1) // un 4xx es respuesta, no caída
  })
})

describe('buzonAbiertos · el almacén real (base falsa con eq/gte/in)', () => {
  const AHORA = new Date('2026-10-20T18:00:00Z')
  const hace = (h: number) => new Date(AHORA.getTime() - h * 3600_000).toISOString()
  function base(t: Record<string, any[]>, falla?: string) {
    const from = (tabla: string) => {
      const filtros: Array<(f: any) => boolean> = []
      const api: any = {
        select: () => api,
        eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return api },
        gte: (c: string, v: string) => { filtros.push((f) => String(f[c]) >= v); return api },
        in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return api },
        then: (ok: any) => ok(falla === tabla ? { data: null, error: { message: 'caída' } } : { data: t[tabla].filter((f) => filtros.every((fn) => fn(f))).map((f) => structuredClone(f)), error: null }),
      }
      return api
    }
    return { from } as any
  }
  const art = (encargo_id: string, h: number, version = 1) => ({ encargo_id, tipo: 'buzon_respuestas', version, creado_en: hace(h) })
  const enc = (id: string, o: Record<string, unknown> = {}) => ({ id, slack_canal: 'D1', slack_ts: '1.2', dry_run: false, ...o })
  it('devuelve los de hace menos de 72 h, no en seco, con canal y marca; descarta lo viejo, lo de la versión 2 y lo incompleto', async () => {
    const t = {
      finanzas_artefactos: [art('a', 1), art('b', 10), art('viejo', 80), art('v2', 1, 2), art('seco', 2), art('sinmd', 2), art('a', 1)],
      finanzas_encargos: [enc('a'), enc('b'), enc('viejo'), enc('v2'), enc('seco', { dry_run: true }), enc('sinmd', { slack_ts: null })],
    }
    expect((await almacenDeConversa(base(t)).buzonAbiertos!(AHORA, 72))!.sort()).toEqual(['a', 'b'])
  })
  it('sin ninguno ⇒ lista vacía (no null); una caída de la base ⇒ null (el vigía lo ve como 503)', async () => {
    const t = { finanzas_artefactos: [], finanzas_encargos: [] }
    expect(await almacenDeConversa(base(t)).buzonAbiertos!(AHORA, 72)).toEqual([])
    expect(await almacenDeConversa(base({ ...t, finanzas_artefactos: [art('a', 1)] }, 'finanzas_artefactos')).buzonAbiertos!(AHORA, 72)).toBeNull()
    expect(await almacenDeConversa(base({ finanzas_artefactos: [art('a', 1)], finanzas_encargos: [enc('a')] }, 'finanzas_encargos')).buzonAbiertos!(AHORA, 72)).toBeNull()
  })
  it('🔴 un error de lectura NUNCA se devuelve como lista vacía: null en cualquiera de las dos lecturas y también si la base lanza', async () => {
    const t = { finanzas_artefactos: [art('a', 1)], finanzas_encargos: [enc('a')] }
    expect(await almacenDeConversa(base(t, 'finanzas_artefactos')).buzonAbiertos!(AHORA, 72)).toBeNull()
    expect(await almacenDeConversa(base(t, 'finanzas_encargos')).buzonAbiertos!(AHORA, 72)).toBeNull()
    expect(await almacenDeConversa({ from() { throw new Error('base caída') } } as any).buzonAbiertos!(AHORA, 72)).toBeNull()
  })
  it('🔴 solo la versión 1 del registro cuenta como «un MD enviado» (las recogidas son versiones 2, 3…)', async () => {
    const t = { finanzas_artefactos: [art('solo-v2', 1, 2), art('con-v1', 1, 1), art('con-v1', 0.5, 3)], finanzas_encargos: [enc('solo-v2'), enc('con-v1')] }
    expect(await almacenDeConversa(base(t)).buzonAbiertos!(AHORA, 72)).toEqual(['con-v1'])
  })
  it('🔴 con más de 20 abiertos, el tope deja los 20 MÁS RECIENTES (no unos cualesquiera)', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => 'e' + String(i).padStart(2, '0'))
    const t = { finanzas_artefactos: ids.map((i, k) => art(i, 60 - k)), finanzas_encargos: [...ids].reverse().map((i) => enc(i)) } // e29 es el más reciente (hace 31 h); e00 el más viejo (hace 60 h)
    const r = (await almacenDeConversa(base(t)).buzonAbiertos!(AHORA, 72))!
    expect(r).toHaveLength(20); expect(r[0]).toBe('e29'); expect(r).toContain('e10'); expect(r).not.toContain('e09')
  })
  it('máximo 20 por vuelta', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => 'e' + i)
    const t = { finanzas_artefactos: ids.map((i) => art(i, 1)), finanzas_encargos: ids.map((i) => enc(i)) }
    expect((await almacenDeConversa(base(t)).buzonAbiertos!(AHORA, 72))!.length).toBe(20)
  })
})

describe('LA RUTA · buzon_abiertos pasa por las MISMAS guardas que preguntar y recoger', () => {
  const ruta = fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8').split('\r\n').join('\n')
  it('comparte la rama (config legible, oficina encendida, workflow_id y workflow_execution_id obligatorios) y se anuncia en las acciones válidas', () => {
    const rama = ruta.slice(ruta.indexOf("c.accion === 'buzon_abiertos'"), ruta.indexOf("else r = { status: 400, cuerpo: { error: 'accion_invalida'"))
    for (const guarda of ["error: 'config_ilegible'", "error: 'conversa_apagada'", "typeof c.workflow_id !== 'string'", "typeof c.workflow_execution_id !== 'string'", 'listarAbiertos(B)', 'modo: cfg.preguntas_slack'])
      expect(rama, guarda).toContain(guarda)
    expect(ruta).toContain("'recoger', 'buzon_abiertos']")
  })
  it('no exige encargo_id para listar (no hay uno) pero sí para preguntar y recoger', () => {
    expect(ruta).toContain("(c.accion === 'buzon_abiertos' || ((c.accion === 'preguntar' || c.accion === 'recoger') && typeof c.encargo_id === 'string'))")
  })
})
