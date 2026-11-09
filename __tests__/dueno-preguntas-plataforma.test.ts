/**
 * 06-nov · las preguntas al dueño salen del cerebro y viven en la plataforma (`dueno_preguntas`) · firma de Emilio vía Lenovo · diseño de Cerebro.
 * Base falsa con filtros reales (eq / gte / limit) y un cerebro falso que registra lo que se le manda.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rutaPendientes, rutaPreguntas, TABLA, type PuertoDelCerebro } from '../src/lib/dueno-preguntas/preguntas'
import { cerebroPorHttp } from '../src/lib/dueno-preguntas/cerebro-http'

const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const OTRO = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-11-06T12:00:00Z')
const WF = { workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '230001' }
const FIN = { oficina: 'financiera', agente: 'chief-financial-officer' }
type Fila = Record<string, unknown>

function baseFalsa(semilla: Fila[] = [], opc: { sedes?: string[]; errorEn?: string; carrera?: boolean } = {}) {
  const filas: Fila[] = semilla.map((f) => ({ ...f }))
  const tablas: string[] = []
  const escrituras: Array<{ op: string; datos: Fila }> = []
  const db = {
    from(t: string) {
      tablas.push(t)
      const fs_: Array<[string, string, unknown]> = []
      let op = 'select', datos: Fila = {}, lim = Infinity
      const filtrar = (d: Fila[]) => d.filter((r) => fs_.every(([o, a, b]) => (o === 'eq' ? r[a] === b : o === 'gte' ? String(r[a]) >= String(b) : true)))
      const q: any = {
        select: () => q, eq: (a: string, b: unknown) => (fs_.push(['eq', a, b]), q), gte: (a: string, b: unknown) => (fs_.push(['gte', a, b]), q), limit: (n: number) => ((lim = n), q),
        insert: (d: Fila) => ((op = 'insert'), (datos = d), q), update: (d: Fila) => ((op = 'update'), (datos = d), q),
        then(ok: (v: unknown) => void) {
          if (opc.errorEn === `${t}:${op}`) return ok({ data: null, error: { message: 'permission denied' } })
          if (t === 'client_sedes') return ok({ data: (opc.sedes ?? []).map((clave) => ({ clave })), error: null })
          if (op === 'insert') { filas.push({ creado_en: AHORA.toISOString(), ...datos }); escrituras.push({ op, datos }); return ok({ data: null, error: null }) }
          if (op === 'update') {
            if (opc.carrera) for (const r of filtrar(filas)) r.estado = 'respondida' // otro la cerró justo antes
            const hit = filtrar(filas)
            for (const r of hit) Object.assign(r, datos)
            escrituras.push({ op, datos })
            return ok({ data: hit.map((r) => ({ id: r.id })), error: null })
          }
          ok({ data: filtrar(filas).slice(0, lim), error: null })
        },
      }
      return q
    },
  }
  return { db, filas, tablas, escrituras }
}

function cerebroFalso(opc: { respuestas?: Fila[]; falla?: boolean; noLee?: boolean } = {}) {
  const guardados: Array<{ evento: string; cuerpo: Fila }> = []
  const cerebro: PuertoDelCerebro = {
    async respuestas() { return opc.noLee ? { ok: false, error: 'http_503' } : { ok: true, respuestas: opc.respuestas ?? [] } },
    async guardar(evento, cuerpo) { if (opc.falla) return { ok: false, status: 503, error: 'caido' }; guardados.push({ evento, cuerpo }); return { ok: true, ficha_id: 'f1c4a000-0000-4000-8000-000000000001' } },
  }
  return { cerebro, guardados }
}

const PEND = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', client_id: C, sede_clave: null, tema: 'costos fijos mensuales', tema_norm: 'costo-fijo-mensual', pregunta: '¿cuánto pagas al mes en sueldos, luz y arriendo?', supuesto: 'unos US$ 3.000 al mes', canal: 'Tu oficina › Decisiones', oficina: 'financiera', agente: 'chief-financial-officer', estado: 'pendiente', workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '220399', creado_en: '2026-11-06T02:00:00Z' }

describe('preguntar', () => {
  it('registra la pregunta en la PLATAFORMA (nunca en una tabla del cerebro) con quién preguntó, el supuesto y la corrida', async () => {
    const b = baseFalsa(), k = cerebroFalso()
    const r = await rutaPreguntas({ db: b.db, cerebro: k.cerebro, ahora: AHORA, nuevoId: () => 'nuevo-id' }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos mensuales', pregunta: '¿cuánto pagas?', supuesto: 'unos US$ 3.000', canal: 'Tu oficina › Decisiones' })
    expect(r).toEqual({ status: 200, body: { ok: true, registrada: true, pregunta_id: 'nuevo-id' } })
    expect(b.tablas.every((t) => !t.startsWith('cerebro_'))).toBe(true)
    expect(b.escrituras[0].datos).toMatchObject({ id: 'nuevo-id', client_id: C, estado: 'pendiente', oficina: 'financiera', agente: 'chief-financial-officer', supuesto: 'unos US$ 3.000', workflow_execution_id: '230001', tema_norm: expect.any(String) })
    expect(k.guardados).toEqual([]) // una pregunta no es canon: al cerebro no entra nada
  })
  it('si el cerebro ya tiene la respuesta, no se pregunta; si no puedo leerlo, tampoco se pregunta a ciegas (502)', async () => {
    const ya = await rutaPreguntas({ db: baseFalsa().db, cerebro: cerebroFalso({ respuestas: [{ respuesta: 'US$ 2.800' }] }).cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos', pregunta: '¿?', canal: 'x' })
    expect(ya.body).toMatchObject({ registrada: false, ya_respondida: true, respuestas: [{ respuesta: 'US$ 2.800' }] })
    const b = baseFalsa()
    const ciega = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso({ noLee: true }).cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos', pregunta: '¿?', canal: 'x' })
    expect(ciega.status).toBe(502)
    expect(b.escrituras).toEqual([])
  })
  it('otra oficina ya lo preguntó en las últimas 72 h → «ya_preguntada»; la misma oficina → «repetida» con su id; más vieja que 72 h no cuenta', async () => {
    const otra = await rutaPreguntas({ db: baseFalsa([{ ...PEND, oficina: 'marketing', agente: 'cmo' }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costo fijo', pregunta: '¿?', canal: 'x' })
    expect(otra.body).toMatchObject({ registrada: false, ya_preguntada: true, pendiente: { pregunta_id: PEND.id, oficina: 'marketing' } })
    const misma = await rutaPreguntas({ db: baseFalsa([PEND]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos mensuales', pregunta: '¿?', canal: 'x' })
    expect(misma.body).toMatchObject({ registrada: false, repetida: true, pregunta_id: PEND.id })
    const vieja = await rutaPreguntas({ db: baseFalsa([{ ...PEND, creado_en: '2026-11-03T11:00:00Z' }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos mensuales', pregunta: '¿?', canal: 'x' })
    expect(vieja.body).toMatchObject({ registrada: true })
    const otroCliente = await rutaPreguntas({ db: baseFalsa([{ ...PEND, client_id: OTRO }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos fijos mensuales', pregunta: '¿?', canal: 'x' })
    expect(otroCliente.body).toMatchObject({ registrada: true })
  })
  it('exige la corrida, quién pregunta y un tema; una sede que no existe → 400', async () => {
    const d = { db: baseFalsa([], { sedes: ['quito', 'guayaquil'] }).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }
    const base = { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'costos', pregunta: '¿?', canal: 'x' }
    expect((await rutaPreguntas(d, { ...base, workflow_id: '' })).status).toBe(403)
    expect((await rutaPreguntas(d, { ...base, preguntado_por: {} })).status).toBe(400)
    expect((await rutaPreguntas(d, { ...base, tema: '' })).status).toBe(400)
    expect((await rutaPreguntas(d, { ...base, sede_clave: 'cuenca' })).status).toBe(400)
    expect((await rutaPreguntas(d, { ...base, accion: 'pregunta' })).status).toBe(400)
  })
})

describe('responder', () => {
  it('el cerebro guarda la respuesta (con la pregunta, la oficina y el id de la plataforma) y la fila queda respondida con la ref de la ficha', async () => {
    const b = baseFalsa([PEND]), k = cerebroFalso()
    const r = await rutaPreguntas({ db: b.db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, workflow_id: 'tablero-tu-oficina', workflow_execution_id: 'decision-1', pregunta_id: PEND.id, respuesta: 'US$ 2.800 al mes', decidido_por: 'Emilio' })
    expect(r).toEqual({ status: 200, body: { ok: true, guardada: true, ficha_ref: 'f1c4a000-0000-4000-8000-000000000001', preguntas_cerradas: 1 } })
    expect(k.guardados).toEqual([{ evento: 'respuesta', cuerpo: expect.objectContaining({ client_id: C, pregunta_id: PEND.id, oficina: 'financiera', agente: 'chief-financial-officer', pregunta: PEND.pregunta, tema: PEND.tema, respuesta: 'US$ 2.800 al mes', decidido_por: 'Emilio', decidido_en: AHORA.toISOString(), workflow_id: 'tablero-tu-oficina' }) }])
    expect(b.filas[0]).toMatchObject({ estado: 'respondida', respuesta: 'US$ 2.800 al mes', decidido_por: 'Emilio', ficha_ref: 'f1c4a000-0000-4000-8000-000000000001' })
  })
  it('si el cerebro falla → 502 y la fila SIGUE pendiente (reintentar es seguro)', async () => {
    const b = baseFalsa([PEND])
    const r = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso({ falla: true }).cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'Emilio' })
    expect(r.status).toBe(502)
    expect(b.filas[0].estado).toBe('pendiente')
    expect(b.escrituras).toEqual([])
  })
  it('🟡 de CC6: si otro la cerró entre la lectura y el cierre (0 filas cambiadas) → 409, nunca «ok»', async () => {
    const r = await rutaPreguntas({ db: baseFalsa([PEND], { carrera: true }).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'Emilio' })
    expect(r.status).toBe(409)
    expect(r.body.ok).toBe(false)
    // señal fija para el tablero (#298): lo del dueño YA está en el cerebro, no se repite
    expect(r.body).toMatchObject({ error: 'ya_cerrada', guardada_en_cerebro: true, ficha_ref: 'f1c4a000-0000-4000-8000-000000000001' })
    const a = await rutaPreguntas({ db: baseFalsa([PEND], { carrera: true }).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'asumir', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'Emilio' })
    expect(a).toMatchObject({ status: 409, body: { error: 'ya_cerrada', guardada_en_cerebro: true, ficha_ref: 'f1c4a000-0000-4000-8000-000000000001' } })
  })
  it('una pregunta ya cerrada ANTES de guardar dice `guardada_en_cerebro: false` y su estado (el tablero la manda como dato suelto)', async () => {
    const r = await rutaPreguntas({ db: baseFalsa([{ ...PEND, estado: 'asumida' }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'Emilio' })
    expect(r).toMatchObject({ status: 409, body: { ok: false, error: 'ya_cerrada', guardada_en_cerebro: false, estado: 'asumida' } })
  })
  it('sin `pregunta_id`, cierra las pendientes recientes del mismo tema; una ya cerrada → 409; de otro cliente → 404', async () => {
    const b = baseFalsa([PEND, { ...PEND, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tema: 'ventas temporada baja' }])
    const r = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, tema: 'costo fijo', respuesta: 'x', decidido_por: 'Emilio' })
    expect(r.body).toMatchObject({ ok: true, preguntas_cerradas: 1 })
    expect(b.filas.map((f) => f.estado)).toEqual(['respondida', 'pendiente'])
    expect((await rutaPreguntas({ db: baseFalsa([{ ...PEND, estado: 'respondida' }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'E' })).status).toBe(409)
    expect((await rutaPreguntas({ db: baseFalsa([{ ...PEND, client_id: OTRO }]).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'E' })).status).toBe(404)
  })
  it('una pregunta ya cerrada se rechaza ANTES de llamar al cerebro (no guarda una respuesta a algo cerrado)', async () => {
    const k = cerebroFalso()
    for (const accion of ['responder', 'asumir']) {
      const r = await rutaPreguntas({ db: baseFalsa([{ ...PEND, estado: 'respondida' }]).db, cerebro: k.cerebro, ahora: AHORA }, { accion, client_id: C, ...WF, pregunta_id: PEND.id, respuesta: 'x', decidido_por: 'E' })
      expect(r.status).toBe(409)
    }
    expect(k.guardados).toEqual([])
  })
  it('más de 500 pendientes: no se recorta en silencio (502), ni al preguntar ni al listar', async () => {
    const muchas = Array.from({ length: 501 }, (_, i) => ({ ...PEND, id: `m${i}`, tema: `tema ${i}` }))
    expect((await rutaPreguntas({ db: baseFalsa(muchas).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'preguntar', client_id: C, ...WF, preguntado_por: FIN, tema: 'otro asunto', pregunta: '¿?', canal: 'x' })).status).toBe(502)
    expect((await rutaPendientes({ db: baseFalsa(muchas).db, ahora: AHORA }, { client_id: C })).status).toBe(502)
    expect((await rutaPendientes({ db: baseFalsa(muchas.slice(0, 500)).db, ahora: AHORA }, { client_id: C })).status).toBe(200)
  })
  it('una respuesta del dueño sin pregunta pendiente igual va al cerebro (es su palabra), pero exige el texto de la pregunta', async () => {
    const k = cerebroFalso()
    const sin = await rutaPreguntas({ db: baseFalsa().db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, tema: 'horario', respuesta: 'de 12 a 22', decidido_por: 'Emilio' })
    expect(sin.status).toBe(400)
    const con = await rutaPreguntas({ db: baseFalsa().db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'responder', client_id: C, ...WF, tema: 'horario', pregunta: '¿qué horario?', respuesta: 'de 12 a 22', decidido_por: 'Emilio' })
    expect(con.body).toMatchObject({ ok: true, preguntas_cerradas: 0 })
    expect(k.guardados[0].cuerpo).toMatchObject({ pregunta_id: null, pregunta: '¿qué horario?' })
  })
})

describe('asumir y descartar', () => {
  it('asumir manda al cerebro el supuesto PROPUESTO tal cual (evento «asumir») y la fila queda asumida con su ficha', async () => {
    const b = baseFalsa([PEND]), k = cerebroFalso()
    const r = await rutaPreguntas({ db: b.db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'asumir', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'Emilio' })
    expect(r.body).toMatchObject({ ok: true, asumida: true, supuesto: 'unos US$ 3.000 al mes' })
    expect(k.guardados).toEqual([{ evento: 'asumir', cuerpo: expect.objectContaining({ pregunta_id: PEND.id, supuesto: 'unos US$ 3.000 al mes', pregunta: PEND.pregunta, oficina: 'financiera', decidido_por: 'Emilio' }) }])
    expect(b.filas[0]).toMatchObject({ estado: 'asumida', decidido_en: AHORA.toISOString(), ficha_ref: 'f1c4a000-0000-4000-8000-000000000001' })
  })
  it('sin supuesto propuesto no hay nada que asumir (422, nunca se inventa); con carrera → 409', async () => {
    const k = cerebroFalso()
    expect((await rutaPreguntas({ db: baseFalsa([{ ...PEND, supuesto: null }]).db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'asumir', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'E' })).status).toBe(422)
    expect(k.guardados).toEqual([])
    expect((await rutaPreguntas({ db: baseFalsa([PEND], { carrera: true }).db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'asumir', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'E' })).status).toBe(409)
  })
  it('descartar solo cambia la fila, con motivo y quién; al cerebro no entra nada', async () => {
    const b = baseFalsa([PEND]), k = cerebroFalso()
    const r = await rutaPreguntas({ db: b.db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'descartar', client_id: C, ...WF, pregunta_id: PEND.id, motivo: 'ya no aplica', decidido_por: 'Emilio' })
    expect(r.body).toMatchObject({ ok: true, descartada: true })
    expect(b.filas[0]).toMatchObject({ estado: 'descartada', motivo: 'ya no aplica', decidido_por: 'Emilio' })
    expect(k.guardados).toEqual([])
    expect((await rutaPreguntas({ db: baseFalsa([PEND]).db, cerebro: k.cerebro, ahora: AHORA }, { accion: 'descartar', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'E' })).status).toBe(400)
  })
  it('si la cierra el SISTEMA (otra respuesta ya la cubrió) queda «obsoleta», no «descartada»: no es decisión del dueño', async () => {
    const b = baseFalsa([PEND])
    const r = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'descartar', por_el_sistema: true, client_id: C, ...WF, pregunta_id: PEND.id, motivo: 'el dueño ya contestó esta pregunta', decidido_por: 'sistema · financiera' })
    expect(r.body).toMatchObject({ ok: true, estado: 'obsoleta' })
    expect(b.filas[0]).toMatchObject({ estado: 'obsoleta', motivo: 'el dueño ya contestó esta pregunta' })
  })
  it('🟡 de CC7: si el cerebro no guarda el supuesto → 502 y la fila SIGUE pendiente (nunca «asumida» sin ficha)', async () => {
    const b = baseFalsa([PEND])
    const r = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso({ falla: true }).cerebro, ahora: AHORA }, { accion: 'asumir', client_id: C, ...WF, pregunta_id: PEND.id, decidido_por: 'Emilio' })
    expect(r.status).toBe(502)
    expect(b.filas[0].estado).toBe('pendiente')
    expect(b.escrituras).toEqual([])
  })
  it('🟡 de CC7: descartar sin quién decide → 400 y la fila no cambia', async () => {
    for (const extra of [{}, { decidido_por: '   ' }]) {
      const b = baseFalsa([PEND])
      const r = await rutaPreguntas({ db: b.db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'descartar', client_id: C, ...WF, pregunta_id: PEND.id, motivo: 'ya no aplica', ...extra })
      expect(r.status).toBe(400)
      expect(b.filas[0].estado).toBe('pendiente')
      expect(b.escrituras).toEqual([])
    }
  })
  it('un error de la base al cerrar no se lee como «ok» (502)', async () => {
    const r = await rutaPreguntas({ db: baseFalsa([PEND], { errorEn: `${TABLA}:update` }).db, cerebro: cerebroFalso().cerebro, ahora: AHORA }, { accion: 'descartar', client_id: C, ...WF, pregunta_id: PEND.id, motivo: 'x', decidido_por: 'E' })
    expect(r.status).toBe(502)
  })
})

describe('pendientes (GET)', () => {
  it('09-nov · opción A: con `tema` devuelve también las pendientes PARECIDAS (no la idéntica, no de otro cliente, no viejas ni cerradas); sin `tema` no trae el campo', async () => {
    const b = baseFalsa([PEND, { ...PEND, id: 'p', tema: 'costos fijos', oficina: 'marketing' }, { ...PEND, id: 'n', tema: 'ventas temporada baja' }, { ...PEND, id: 'o', tema: 'costos fijos', client_id: OTRO }, { ...PEND, id: 'v', tema: 'costos fijos', creado_en: '2026-11-01T00:00:00Z' }, { ...PEND, id: 'r', tema: 'costos fijos', estado: 'respondida' }])
    const r = await rutaPendientes({ db: b.db, ahora: AHORA }, { client_id: C, tema: 'costos fijos mensuales' })
    expect((r.body.pendientes_parecidas as Fila[]).map((p) => p.pregunta_id)).toEqual(['p'])
    expect((r.body.pendientes_parecidas as Fila[])[0]).toMatchObject({ tema: 'costos fijos', oficina: 'marketing', pregunta: PEND.pregunta })
    expect((await rutaPendientes({ db: b.db, ahora: AHORA }, { client_id: C })).body).not.toHaveProperty('pendientes_parecidas')
  })
  it('lista las pendientes de las últimas 72 h del cliente, con su supuesto; un error de la base no es «ninguna»', async () => {
    const b = baseFalsa([PEND, { ...PEND, id: 'v', creado_en: '2026-11-01T00:00:00Z' }, { ...PEND, id: 'o', client_id: OTRO }, { ...PEND, id: 'r', estado: 'respondida' }])
    const r = await rutaPendientes({ db: b.db, ahora: AHORA }, { client_id: C })
    expect((r.body.pendientes as Fila[]).map((p) => p.pregunta_id)).toEqual([PEND.id])
    expect((r.body.pendientes as Fila[])[0]).toMatchObject({ supuesto: 'unos US$ 3.000 al mes', oficina: 'financiera' })
    expect((await rutaPendientes({ db: baseFalsa([], { errorEn: `${TABLA}:select` }).db, ahora: AHORA }, { client_id: C })).status).toBe(502)
    expect((await rutaPendientes({ db: b.db, ahora: AHORA }, { client_id: 'x' })).status).toBe(400)
  })
})

describe('el puerto HTTP hacia el cerebro', () => {
  it('manda `evento` y `dry_run:false` a la puerta del dueño, con la llave en la cabecera, y devuelve la ref de la ficha', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = []
    const f = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return new Response(JSON.stringify({ ok: true, ficha_id: 'abc' }), { status: 200 }) }) as unknown as typeof fetch
    const g = await cerebroPorHttp({ base: 'https://x.test/', llave: 'k', fetch: f }).guardar('asumir', { pregunta_id: 'p' })
    expect(g).toEqual({ ok: true, ficha_id: 'abc' })
    expect(llamadas[0].url).toBe('https://x.test/api/brain/alimentar/dueno')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ pregunta_id: 'p', evento: 'asumir', dry_run: false })
    expect((llamadas[0].init.headers as Record<string, string>)['x-api-key']).toBe('k')
  })
  it('una puerta apagada, un 500 o la red caída son fallo (nunca «guardado»)', async () => {
    const resp = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    expect((await cerebroPorHttp({ base: 'b', llave: 'k', fetch: resp({ apagado: true }) }).guardar('respuesta', {})).ok).toBe(false)
    expect((await cerebroPorHttp({ base: 'b', llave: 'k', fetch: resp({ error: 'x' }, 500) }).guardar('respuesta', {})).ok).toBe(false)
    expect((await cerebroPorHttp({ base: 'b', llave: 'k', fetch: (async () => { throw new Error('red') }) as unknown as typeof fetch }).guardar('respuesta', {})).ok).toBe(false)
    expect((await cerebroPorHttp({ base: 'b', llave: 'k', fetch: resp({ apagado: true }) }).respuestas({ client_id: C, tema: 't', sede_clave: null })).ok).toBe(false)
  })
})

describe('la migración', () => {
  const sql = fs.readFileSync('supabase/migrations/202611061200_dueno_preguntas.sql', 'utf8')
  it('es tabla de la plataforma con RLS, permisos solo para el servidor, sin borrar, y sin llave hacia tablas del cerebro', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.dueno_preguntas/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.dueno_preguntas TO service_role/)
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*dueno_preguntas/)
    expect(sql).not.toMatch(/REFERENCES public\.cerebro_/)
    expect(sql).toMatch(/'pendiente','respondida','asumida','descartada','vencida','obsoleta'/)
  })
})
