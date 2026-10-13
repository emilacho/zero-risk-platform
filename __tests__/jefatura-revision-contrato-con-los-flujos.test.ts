/**
 * JEFATURA como oficina propia · J2 · el CONTRATO entre el núcleo (esta rama) y los flujos de n8n de J4 (CC#2, ya en main): se EJECUTA el código real de los nodos de J4
 * (`scripts/worker-staging/jefatura/*.js`) contra lo que entrega el orquestador, con los globales de n8n simulados. Así un desajuste de nombres o de formato se ve aquí y no en el seco.
 * US$ 0: ningún nodo sale a la red (los globales son de mentira).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { procesarSalidaDeRevision } from '../src/lib/jefatura/revision/formatos'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'

process.env.N8N_WEBHOOK_BASE = 'https://n8n.invalid/webhook' // el n8n «propio» de estas pruebas (la ruta y los flujos de J4 usan la misma lista de destinos)
const DIR = resolve(__dirname, '..', 'scripts', 'worker-staging', 'jefatura')
const codigo = (f: string) => readFileSync(resolve(DIR, f), 'utf8')
type Json = Record<string, any>
const LLAVE = 'llave-de-prueba'

/** ejecuta un nodo Code de n8n con sus globales simulados */
function correrNodo(f: string, o: { entrada: Json | Json[]; nodos?: Record<string, Json>; env?: Record<string, string> }): Json[] {
  const entradas = (Array.isArray(o.entrada) ? o.entrada : [o.entrada]).map((json) => ({ json }))
  const input = { first: () => entradas[0], all: () => entradas }
  const nodos = o.nodos ?? {}
  const $ = (n: string) => ({ first: () => ({ json: nodos[n] }), itemMatching: () => ({ json: nodos[n] }) })
  const fn = new Function('$input', '$env', '$', '$execution', '$workflow', codigo(f))
  const r = fn(input, { SALA_DISPATCH_KEY: LLAVE, ...(o.env ?? {}) }, $, { id: 'exec-1', resumeUrl: 'https://n8n.invalid/resume' }, { id: 'wf-1' }) as Array<{ json: Json }>
  return r.map((x) => x.json)
}

const entradaDelTurno = (turno: Json, revision_id = '00000000-0000-4000-8000-000000000001') => ({ body: { revision_id, turno }, headers: { 'x-sala-dispatch-key': LLAVE } })

describe('lo que entrega el orquestador lo acepta el nodo ⓪ de J4 (validación de la entrada del turno)', () => {
  it('cada turno de agente de los 5 tipos pasa el nodo de entrada tal cual', async () => {
    for (const tipo of ['plan', 'estrategia', 'calendario', 'brief', 'pieza'] as const) {
      const { P } = puertosDePrueba()
      const c = await correr(P, sobre(tipo, { id: `${tipo}-j4`, simulacion: { fichas: 'bloquea', toma: 'algo' } }))
      expect(c.turnos.length, tipo).toBeGreaterThan(0)
      for (const t of c.turnos) {
        const turno = { n: t.n, tipo: 'agente', paso: t.paso, agente: t.agente, dispatch_key: `x:${t.n}`, pedido: t.pedido }
        const [salida] = correrNodo('turno-n0-entrada.js', { entrada: entradaDelTurno(turno) })
        expect(salida.dry_run, `${tipo} ${t.paso}`).toBe(true)
        expect(salida.turno.pedido.agent_name).toBeTruthy()
      }
    }
  })
  it('el nodo ⓪ rechaza lo que el orquestador JAMÁS debe mandar: sin dry_run booleano, sin esquema, sin llave', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('brief'))
    const t = c.turnos[0]
    const turno = { n: t.n, tipo: 'agente', paso: t.paso, agente: t.agente, dispatch_key: 'x', pedido: t.pedido }
    expect(() => correrNodo('turno-n0-entrada.js', { entrada: entradaDelTurno({ ...turno, pedido: { ...t.pedido, dry_run: 'true' } }) })).toThrow(/SIN_DRY_RUN/)
    expect(() => correrNodo('turno-n0-entrada.js', { entrada: entradaDelTurno({ ...turno, pedido: { ...t.pedido, esquema: '' } }) })).toThrow(/SIN_ESQUEMA/)
    expect(() => correrNodo('turno-n0-entrada.js', { entrada: { ...entradaDelTurno(turno), headers: {} } })).toThrow(/PROCEDENCIA_INVALIDA/)
  })
})

describe('el molde de J4 (nodo ② en seco) contesta lo que el orquestador sabe leer', () => {
  const armar = (turno: Json, entradaDeJ4: Json) => correrNodo('turno-n1-armar.js', { entrada: { revision_id: '00000000-0000-4000-8000-000000000001', turno, dry_run: true, ...entradaDeJ4 } })[0]
  it('para cada esquema que pide la jefatura, el molde de J4 produce una respuesta que el contrato de formato ACEPTA', async () => {
    const vistos = new Set<string>()
    for (const tipo of ['plan', 'estrategia', 'calendario', 'brief', 'pieza'] as const) {
      const { P } = puertosDePrueba()
      const c = await correr(P, sobre(tipo, { id: `${tipo}-molde`, simulacion: { fichas: 'bloquea', toma: 'todo' } }))
      for (const t of c.turnos) {
        const esquema = String(t.pedido.esquema)
        vistos.add(esquema)
        const turno = { n: t.n, tipo: 'agente', paso: t.paso, dispatch_key: 'x', pedido: t.pedido }
        const salida = armar(turno, {})
        const cuerpo = salida.resultado_body as Json
        expect(cuerpo.accion).toBe('resultado')
        // TODO esquema que la jefatura pide tiene molde en J4 (un esquema sin molde sería un error visible, pero aquí se exige que no haya ninguno)
        expect(cuerpo.error, `${tipo} ${esquema}: ${String(cuerpo.error)}`).toBeUndefined()
        const r = procesarSalidaDeRevision(String(cuerpo.texto), esquema, 0, 1)
        expect(r.ok, `${tipo} ${t.paso} (${esquema}): ${String(cuerpo.texto).slice(0, 120)}`).toBe(true)
      }
    }
    expect([...vistos].sort()).toEqual(expect.arrayContaining(['fichas.v1', 'plan_texto_y_resolucion.v1', 'resolucion.v1', 'resolucion_objeto.v1', 'resolucion_parcial.v1', 'resolucion_solo.v1']))
  })
  it('el molde de J4 lee los ids de las fichas con el MISMO formato que escribe el orquestador (`- [id] (gravedad) en …`)', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea' } }))
    const corr = c.turnos.find((t) => t.paso === 'correccion:content-creator')!
    const idEsperado = /^- \[([^\]\n]+)\]/m.exec(String(corr.pedido.task))![1]
    const cuerpo = armar({ n: corr.n, tipo: 'agente', paso: corr.paso, dispatch_key: 'x', pedido: corr.pedido }, {}).resultado_body as Json
    const r = JSON.parse(String(cuerpo.texto)) as Json
    expect(r.respuestas.map((x: Json) => x.id)).toEqual([idEsperado])
    // y el orquestador acepta esa respuesta tal cual
    expect(procesarSalidaDeRevision(String(cuerpo.texto), 'resolucion.v1', 0, 1).ok).toBe(true)
  })
  it('la simulación llega al molde de J4 dentro del pedido, y `formato_roto` rompe solo el primer intento', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { simulacion: { fichas: 'bloquea', productor: 'formato_roto' } }))
    const corr = c.turnos.filter((t) => t.paso === 'correccion:content-creator')
    expect(corr).toHaveLength(2)
    expect(corr[0].pedido.simulacion).toEqual({ fichas: 'bloquea', productor: 'formato_roto' })
    const roto = armar({ n: corr[0].n, tipo: 'agente', paso: corr[0].paso, dispatch_key: 'x', pedido: corr[0].pedido }, {}).resultado_body as Json
    const bien = armar({ n: corr[1].n, tipo: 'agente', paso: corr[1].paso, dispatch_key: 'x', pedido: corr[1].pedido }, {}).resultado_body as Json
    expect(procesarSalidaDeRevision(String(roto.texto), 'resolucion.v1', 1, 1).ok).toBe(false)
    expect(procesarSalidaDeRevision(String(bien.texto), 'resolucion.v1', 0, 1).ok).toBe(true)
  })
  it('un pedido REAL (dry_run false) arma el cuerpo de run-sdk con la lista cerrada de `extra`, force_restart y SIN `workflow_execution_id` en `extra`', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { dry_run: false }), () => ({ texto: '{"fichas":[]}' }))
    expect(c.aperturas[0].cuerpo.accion).toBe('esperar')
    const t = c.aperturas[0].cuerpo.turno as Json
    const salida = armar({ n: t.n, tipo: 'agente', paso: t.paso, dispatch_key: t.dispatch_key, pedido: t.pedido }, { dry_run: false })
    expect(salida.simulado).toBe(false)
    expect(Object.keys(salida.cuerpo.extra).sort()).toEqual(['dispatch_key', 'indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id'])
    expect(salida.cuerpo.force_restart).toBe(true)
    expect(salida.cuerpo.agent).toBe('jefe-marketing')
    expect(salida.cuerpo.workflow_execution_id).toBe('exec-1')
    expect(salida.cuerpo.extra.workflow_execution_id).toBeUndefined()
  })
})

describe('lo que entrega el orquestador al CERRAR lo lee el nodo ③ de J4 (entrega al llamador)', () => {
  const sigue = (cuerpo: Json, c: Json = {}) => correrNodo('turno-n4-sigue.js', { entrada: { statusCode: 200, body: cuerpo }, nodos: { '⓪ Entrada · llave': { revision_id: 'r1', ...c } }, env: { N8N_WEBHOOK_BASE: 'https://n8n.invalid/webhook' } })[0]
  async function cierreDe(devolver_a: Json, journey = 'journey-1') {
    const { P } = puertosDePrueba()
    const s = sobre('brief') as Json
    s.payload.devolver_a = devolver_a
    s.journey_id = journey
    const c = await correr(P, s)
    return c.final.cuerpo as Json
  }
  it('webhook: el flujo entrega `devolver.cuerpo` a `devolver.url` con el resultado', async () => {
    const cuerpo = await cierreDe({ tipo: 'webhook', destino: 'https://n8n.invalid/webhook/jefatura-llamador' })
    expect(cuerpo.devolver.tipo).toBe('webhook')
    expect(cuerpo.devolver.url).toBe('https://n8n.invalid/webhook/jefatura-llamador')
    const r = sigue(cuerpo)
    expect(r.ruta).toBe('webhook')
    expect(r.entrega_url).toBe('https://n8n.invalid/webhook/jefatura-llamador')
    expect(r.entrega_cuerpo).toMatchObject({ revision_id: 'r1', resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false } })
    expect(r.entrega_cuerpo.salida.trace_id).toBeTruthy()
  })
  it('sala_ref: el flujo arma el cable con la correlación y el viaje de la sala', async () => {
    const cuerpo = await cierreDe({ tipo: 'sala_ref', destino: 'corr-123' }, 'viaje-9')
    expect(cuerpo.sala_ref).toEqual({ _sala_correlation_id: 'corr-123', _journey_id: 'viaje-9' })
    const r = sigue(cuerpo)
    expect(r.ruta).toBe('cable')
    expect(r.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'jefatura', resultado: 'revision_limpia', _sala_correlation_id: 'corr-123', _journey_id: 'viaje-9', con_desacuerdo: false })
  })
  it('ninguno: no se entrega nada', async () => {
    const cuerpo = await cierreDe({ tipo: 'ninguno', destino: '' })
    expect(sigue(cuerpo).ruta).toBe('nada')
  })
  it('un webhook que no es de nuestro n8n ni de nuestro Vercel NO se acepta al ABRIR (la ruta lo rechaza antes de guardarlo) y, aunque alguien forjara el cierre, el nodo de J4 se detiene', async () => {
    const { P, mem } = puertosDePrueba()
    const s = sobre('brief') as Json
    s.payload.devolver_a = { tipo: 'webhook', destino: 'https://tercero.example/hook' }
    const { abrirRevision } = await import('../src/lib/jefatura/revision/orquestador')
    const r = await abrirRevision(P, s)
    expect(r.status).toBe(400)
    expect(String(r.cuerpo.errores)).toMatch(/no es de nuestro n8n ni de nuestro Vercel/)
    expect(mem.revisiones.size).toBe(0)
    expect(() => sigue({ accion: 'cerrado', resultado: 'limpia', devolver: { tipo: 'webhook', url: 'https://tercero.example/hook', cuerpo: {} } })).toThrow(/DESTINO_NO_PERMITIDO/)
  })
  it('un paso siguiente (`esperar`) vuelve a despertar el flujo con el turno', async () => {
    const { P } = puertosDePrueba()
    const a = await (await import('./_helpers/jefatura-revision')).abrirRevision(P, sobre('pieza'))
    const r = sigue(a.cuerpo, { revision_id: String(a.cuerpo.revision_id) })
    expect(r.ruta).toBe('esperar')
    expect(r.turno_body.turno.pedido.agent_name).toBe('jefe-marketing')
  })
  it('el resultado se dice también en el idioma de la sala (`resultado_para_la_sala`)', async () => {
    const { P } = puertosDePrueba()
    const mapa: Record<string, string> = {}
    for (const [sim, esperado] of [[{ fichas: 'bloquea', toma: 'nada' }, 'con_desacuerdo'], [{ gpt: 'falla_red' }, 'sin_segunda_mirada'], [{ tope: 'exceso', fichas: 'bloquea' }, 'cerrado_por_tope'], [{ fichas: 'bloquea', productor: 'muerto' }, 'fallido']] as const) {
      const c = await correr(P, sobre('pieza', { id: `p-${esperado}`, simulacion: sim as never }))
      mapa[esperado] = String(c.final.cuerpo.resultado_para_la_sala)
    }
    expect(mapa).toEqual({ con_desacuerdo: 'con_desacuerdo', sin_segunda_mirada: 'sin_segunda_mirada', cerrado_por_tope: 'cerrado_por_tope', fallido: 'fallido' })
  })
})

describe('el vigía de J4 entrega por webhook también', () => {
  it('una revisión que muere dos veces cierra fallida y el vigía de J4 arma la entrega al webhook del llamador (con `devolver.url` y el cuerpo)', async () => {
    const { P } = puertosDePrueba()
    const s = sobre('brief') as Json
    s.payload.devolver_a = { tipo: 'webhook', destino: 'https://n8n.invalid/webhook/jefatura-llamador' }
    const { abrirRevision, avanzar, vigiar } = await import('../src/lib/jefatura/revision/orquestador')
    const a = await abrirRevision(P, s)
    const id = String(a.cuerpo.revision_id)
    await vigiar(P, P.ahora())
    await avanzar(P, id)
    const v2 = await vigiar(P, P.ahora())
    expect(v2.cierres[0].devolver).toMatchObject({ tipo: 'webhook', url: 'https://n8n.invalid/webhook/jefatura-llamador' })
    const items = correrNodo('vigia-n1-reanudar.js', { entrada: { statusCode: 200, body: { accion: 'vigilado', reanudar: [], cierres: v2.cierres } }, env: { N8N_WEBHOOK_BASE: 'https://n8n.invalid/webhook' } })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ tipo: 'webhook', entrega_url: 'https://n8n.invalid/webhook/jefatura-llamador' })
    expect(items[0].entrega_cuerpo).toMatchObject({ revision_id: id, resultado: 'fallida' })
  })
})

describe('el vigía de J4 lee lo que entrega `vigiar` (nodo ① del vigía)', () => {
  it('reanudar + cierres con `devolver` y `sala_ref`: un ítem por trabajo', async () => {
    const { P } = puertosDePrueba()
    const s = sobre('brief') as Json
    s.payload.devolver_a = { tipo: 'sala_ref', destino: 'corr-7' }
    const { abrirRevision, vigiar } = await import('../src/lib/jefatura/revision/orquestador')
    const a = await abrirRevision(P, s)
    const id = String(a.cuerpo.revision_id)
    const v1 = await vigiar(P, P.ahora())
    const [item] = correrNodo('vigia-n1-reanudar.js', { entrada: { statusCode: 200, body: { accion: 'vigilado', reanudar: v1.reanudar, cierres: v1.cierres } } })
    expect(item).toMatchObject({ tipo: 'reanudar', revision_id: id })
    const { avanzar } = await import('../src/lib/jefatura/revision/orquestador')
    await avanzar(P, id)
    const v2 = await vigiar(P, P.ahora())
    const items = correrNodo('vigia-n1-reanudar.js', { entrada: { statusCode: 200, body: { accion: 'vigilado', reanudar: v2.reanudar, cierres: v2.cierres } } })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ tipo: 'cable' })
    expect(items[0].payload_cable).toMatchObject({ worker_name: 'jefatura', resultado: 'fallido', revision_id: id, _sala_correlation_id: 'corr-7', _journey_id: 'journey-1' })
  })
})

describe('UNA sola fuente de moldes (reparo de CC#3): el molde de J4 y el que entrega el orquestador dicen LO MISMO', () => {
  const armarJ4 = (turno: Json) => correrNodo('turno-n1-armar.js', { entrada: { revision_id: '00000000-0000-4000-8000-000000000001', turno, dry_run: true } })[0].resultado_body as Json
  /** lo que importa del molde, sin el texto libre: las respuestas por id y qué partes opcionales trae */
  const forma = (texto: string, esquema: string) => {
    const r = procesarSalidaDeRevision(texto, esquema, 1, 1)
    expect(r.ok, `${esquema}: ${texto.slice(0, 100)}`).toBe(true)
    const v = (r.ok ? r.valor : {}) as Json
    return {
      respuestas: (v.respuestas ?? []).map((x: Json) => [x.id, x.estado]),
      fichas: (v.fichas ?? []).map((x: Json) => x.gravedad),
      partes: ['pieza', 'objeto', 'filas', 'texto_plan'].filter((k) => k in v),
    }
  }
  it.each([
    ['plan', { fichas: 'bloquea', toma: 'todo' }], ['plan', { fichas: 'bloquea', toma: 'nada' }], ['plan', { fichas: 'sugerencia', toma: 'todo' }],
    ['estrategia', { fichas: 'bloquea', toma: 'todo' }], ['estrategia', { fichas: 'bloquea', toma: 'nada' }],
    ['calendario', { fichas: 'bloquea', toma: 'todo' }], ['calendario', { fichas: 'bloquea', toma: 'nada' }],
    ['brief', { fichas: 'bloquea' }], ['pieza', { fichas: 'bloquea', toma: 'todo' }], ['pieza', { fichas: 'bloquea', toma: 'nada' }],
  ] as const)('%s con %j: mismas respuestas, mismas fichas y mismas partes opcionales', async (tipo, sim) => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre(tipo, { id: `${tipo}-fuente-${JSON.stringify(sim)}`, simulacion: sim as never }))
    expect(c.turnos.length).toBeGreaterThan(0)
    for (const t of c.turnos) {
      const mio = (t.pedido.molde as { texto: string }).texto
      const suyo = String(armarJ4({ n: t.n, tipo: 'agente', paso: t.paso, dispatch_key: 'x', pedido: t.pedido }).texto)
      expect(forma(suyo, String(t.pedido.esquema)), `${tipo} ${t.paso}`).toEqual(forma(mio, String(t.pedido.esquema)))
    }
  })
})
