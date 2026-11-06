/**
 * ASUMIR UNA PREGUNTA DEL DUEÑO (06-nov · encargo firmado por Emilio) · US$ 0 · base falsa · los diez clientes de práctica.
 * La pregunta trae el supuesto con que seguiría la oficina; `asumir` la cierra como «asumida» con ese supuesto exacto, quién y cuándo.
 * Repetir no duplica. Sin supuesto: error claro y la pregunta sigue abierta. Y cada lector lo entrega como «supuesto aceptado por el dueño», NUNCA como dato del dueño.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../../cerebro/lista-corta'
import { entregarContenido } from '../../cerebro/portero/entregar'
import { A, AHORA as AHORA_CEREBRO, crearBaseFalsa as baseDelCerebro } from '../../cerebro/__tests__/casos'
import { tablasConFichas } from '../../cerebro/__tests__/fichas-casos'
import { rutaConsultar } from '../consultar'
import { adjuntoDelCliente } from '../contexto-del-cliente'
import { rutaDueno, rutaLeerDueno, temaNormal, type DepsDeDueno } from '../dueno'
import { rutaLeerPedido } from '../pedidos'
import { ATRIBUCION_DEL_SUPUESTO, CLASE_DEL_SUPUESTO_ACEPTADO, refDelSupuesto, supuestoDeLaEntrada, textoDelSupuesto } from '../supuestos-del-dueno'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-plan', workflow_execution_id: 'ex-plan-1' }
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'
const PEDIDO = '44444444-4444-4444-8444-444444444444'
const SUPUESTO = { texto: 'se asume lo del mes pasado mientras no conteste', nombre: 'Gastos fijos al mes', valor: 1200, unidad: 'USD' }

const montar = (c: ClienteSintetico, activo = true) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  ;(t as Record<string, unknown[]>).cerebro_pedidos = [{ id: PEDIDO, client_id: c.id, pedido: 'p', estado: 'hecho', resultado: {}, creado_en: AHORA.toISOString(), pedido_por_oficina: 'estrategia', pedido_por_agente: 'a' }]
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, deps }
}
const pendiente = (t: T, c: ClienteSintetico, id: string, tema: string, extra: Record<string, unknown> = {}) => t.cerebro_dueno_preguntas.push({ id, client_id: c.id, sede_clave: null, tema, tema_norm: temaNormal(tema), pregunta: `¿${tema}?`, canal: 'dashboard · Decisiones', preguntado_por_oficina: 'financiera', preguntado_por_agente: 'cfo', estado: 'pendiente', creado_en: AHORA.toISOString(), workflow_execution_id: 'ex-plan-1', supuesto: SUPUESTO, ...extra })
const pregunta = (t: T, id: string) => t.cerebro_dueno_preguntas.find((p) => p.id === id) as Record<string, unknown>
const asumir = (deps: DepsDeDueno, c: ClienteSintetico, o: Record<string, unknown> = {}) => rutaDueno(deps, { evento: 'asumir', client_id: c.id, pregunta_id: P1, dry_run: false, ...WF, ...o })
const supuestosEn = (t: T) => (t.cerebro_fichas as Array<Record<string, unknown>>).filter((f) => f.clase === CLASE_DEL_SUPUESTO_ACEPTADO)

describe('la pregunta trae su supuesto', () => {
  it('se guarda tal cual (texto, o texto + nombre, valor y unidad) y la lectura de pendientes lo muestra; uno mal formado es 400', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    const base = { evento: 'pregunta', client_id: c.id, canal: 'dashboard · Decisiones', preguntado_por: { oficina: 'financiera', agente: 'cfo' }, dry_run: false, ...WF }
    const r = await rutaDueno(deps, { ...base, tema: 'gastos fijos', pregunta: '¿Cuánto pagas de gastos fijos al mes?', supuesto: SUPUESTO })
    expect(r.body).toMatchObject({ registrada: true, supuesto: SUPUESTO })
    expect(t.cerebro_dueno_preguntas[0].supuesto).toEqual(SUPUESTO)
    await rutaDueno(deps, { ...base, tema: 'ticket promedio', pregunta: '¿Cuál es tu ticket promedio?', supuesto: '  18 USD por mesa  ' })
    expect(t.cerebro_dueno_preguntas[1].supuesto).toEqual({ texto: '18 USD por mesa' })
    // sin supuesto: la columna ni se nombra (la pregunta sigue valiendo, solo que no se podrá asumir)
    await rutaDueno(deps, { ...base, tema: 'horario de cocina', pregunta: '¿Hasta qué hora cocinan?' })
    expect('supuesto' in t.cerebro_dueno_preguntas[2]).toBe(false)
    for (const mal of [{ texto: '' }, { texto: 'x'.repeat(301) }, { texto: 'a', valor: 'mil' }, { texto: 'a', unidad: '' }, ['a'], 12]) {
      expect((await rutaDueno(deps, { ...base, tema: 'otro tema cualquiera', pregunta: '¿?', supuesto: mal })).status).toBe(400)
    }
    const lec = await rutaLeerDueno(deps, { client_id: c.id })
    expect((lec.body.pendientes as Array<Record<string, unknown>>).map((p) => p.supuesto)).toEqual([SUPUESTO, { texto: '18 USD por mesa' }, null])
  })
  it('la línea legible junta la cifra y el texto', () => {
    expect(textoDelSupuesto(SUPUESTO)).toBe('Gastos fijos al mes: 1200 USD · se asume lo del mes pasado mientras no conteste')
    expect(textoDelSupuesto({ texto: 'solo texto' })).toBe('solo texto')
    expect(supuestoDeLaEntrada(undefined)).toEqual({ ok: true, supuesto: null })
  })
})

describe('asumir', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: cierra la pregunta como «asumida» con el supuesto exacto, quién y cuándo; pendientes ya no la trae; ficha de supuesto, no de dueño`, async () => {
      const { t, deps } = montar(c)
      pendiente(t, c, P1, 'gastos fijos'); pendiente(t, c, P2, 'ticket promedio')
      const fichas = t.cerebro_fichas.length
      const seco = await asumir(deps, c, { dry_run: true })
      expect(seco.body).toMatchObject({ ok: true, dry_run: true, supuesto: SUPUESTO })
      expect([pregunta(t, P1).estado, t.cerebro_fichas.length]).toEqual(['pendiente', fichas])

      const r = await asumir(deps, c)
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, asumida: true, pregunta_id: P1, supuesto: SUPUESTO, asumido_por: 'dueno', atribucion: ATRIBUCION_DEL_SUPUESTO })
      expect(pregunta(t, P1)).toMatchObject({ estado: 'asumida', supuesto_asumido: SUPUESTO, asumida_por: 'dueno', asumida_en: AHORA.toISOString(), ficha_id: r.body.ficha_id })
      expect(pregunta(t, P2).estado).toBe('pendiente')
      const [f] = supuestosEn(t)
      expect(f).toMatchObject({ ref: refDelSupuesto(P1), origen: 'plataforma', clase: CLASE_DEL_SUPUESTO_ACEPTADO, retirada_en: null, descartada: false })
      expect(String(f.contenido)).toContain('NO es dato del dueño')
      expect(String(f.contenido)).toContain('Gastos fijos al mes: 1200 USD')
      expect((f.provenance_tag as Record<string, unknown>).confirmado_por).toBeUndefined()
      expect((t.cerebro_fichas as Array<Record<string, unknown>>).filter((x) => x.clase === 'dato_del_dueno')).toHaveLength(0)

      const lec = await rutaLeerDueno(deps, { client_id: c.id })
      expect((lec.body.pendientes as Array<{ pregunta_id: string }>).map((p) => p.pregunta_id)).toEqual([P2])
      expect(lec.body.respuestas).toEqual([]) // asumir no es responder
    })
  }

  it('repetir el evento no duplica nada: ni ficha, ni registro de entrada, ni cambio en la pregunta', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    const r1 = await asumir(deps, c)
    const antes = { fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length, p: { ...pregunta(t, P1) } }
    const r2 = await asumir(deps, c)
    expect(r2.body).toMatchObject({ ok: true, repetida: true, ficha_id: r1.body.ficha_id, supuesto: SUPUESTO })
    expect({ fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length, p: pregunta(t, P1) }).toEqual(antes)
  })

  it('si un intento guardó la ficha pero no cerró la pregunta, el siguiente reusa la ficha (no la duplica) y cierra', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    await asumir(deps, c)
    const fichaId = pregunta(t, P1).ficha_id
    Object.assign(pregunta(t, P1), { estado: 'pendiente', ficha_id: null }) // como si el cierre hubiera fallado
    const r = await asumir(deps, c)
    expect(r.body).toMatchObject({ asumida: true, ficha_id: fichaId })
    expect(supuestosEn(t)).toHaveLength(1)
    expect(pregunta(t, P1)).toMatchObject({ estado: 'asumida', ficha_id: fichaId })
  })

  it('sin supuesto: error claro, la pregunta sigue abierta y no se escribe nada', async () => {
    const c = DIEZ_CLIENTES[0]
    for (const sin of [{ supuesto: null }, { supuesto: { texto: '   ' } }, { supuesto: undefined }]) {
      const { t, deps } = montar(c)
      pendiente(t, c, P1, 'gastos fijos', sin)
      const fichas = t.cerebro_fichas.length, ingresos = t.cerebro_ingresos.length
      const r = await asumir(deps, c)
      expect(r.status).toBe(422)
      expect(r.body).toMatchObject({ error: 'sin_supuesto' })
      expect(String(r.body.detalle)).toContain('sigue abierta')
      expect(pregunta(t, P1).estado).toBe('pendiente')
      expect([t.cerebro_fichas.length, t.cerebro_ingresos.length]).toEqual([fichas, ingresos])
    }
  })

  it('solo una pendiente se asume; otra de otro cliente no existe para este; sin id es 400; apagado no lee ni escribe', async () => {
    const c = DIEZ_CLIENTES[0], o = DIEZ_CLIENTES[1]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos', { estado: 'respondida' }); pendiente(t, c, P2, 'ticket', { estado: 'obsoleta' }); pendiente(t, o, P3, 'gastos fijos')
    for (const id of [P1, P2]) {
      const r = await asumir(deps, c, { pregunta_id: id })
      expect([r.status, r.body.error]).toEqual([409, 'pregunta_cerrada'])
    }
    expect((await asumir(deps, c, { pregunta_id: P3 })).status).toBe(404)
    expect(pregunta(t, P3).estado).toBe('pendiente')
    expect((await asumir(deps, c, { pregunta_id: 'no-es-uuid' })).status).toBe(400)
    expect((await asumir(deps, c, { pregunta_id: undefined })).status).toBe(400)
    const off = montar(c, false); pendiente(off.t, c, P1, 'gastos fijos')
    expect((await asumir(off.deps, c)).body).toMatchObject({ apagado: true })
    expect(pregunta(off.t, P1).estado).toBe('pendiente')
    // con dry_run=false hace falta el flujo
    expect((await rutaDueno(deps, { evento: 'asumir', client_id: c.id, pregunta_id: P1, dry_run: false })).status).toBe(403)
  })

  it('quién: por omisión el dueño; si lo dice otro (p. ej. el panel), se guarda ese nombre', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    await asumir(deps, c, { asumido_por: 'dueno · Decisiones' })
    expect(pregunta(t, P1).asumida_por).toBe('dueno · Decisiones')
    expect((await asumir(deps, c, { pregunta_id: P1, asumido_por: 'x'.repeat(81) })).status).toBe(400)
  })
})

describe('cada lector lo entrega como «supuesto aceptado por el dueño», nunca como dato del dueño', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: contexto_del_cliente, consulta y pedido`, async () => {
      const { t, deps } = montar(c)
      pendiente(t, c, P1, 'gastos fijos')
      // y una respuesta real del dueño, para ver que no se mezclan
      await rutaDueno(deps, { client_id: c.id, dry_run: false, ...WF, tema: 'horario de atención', pregunta: '¿Qué horario tienen?', respuesta: 'De 12 a 16.', canal: 'MD de Slack', mensaje_ref: 'slack:1', respondido_en: '2026-10-15T14:00:00Z', preguntado_por: { oficina: 'comercial', agente: 'a' } })
      await asumir(deps, c)
      const db = deps.db

      const adj = await adjuntoDelCliente(db, c.id, AHORA)
      expect(adj.hechos_del_dueno?.map((h) => h.tema)).toEqual(['horario de atención'])
      expect(adj.supuestos_aceptados_por_el_dueno).toEqual([expect.objectContaining({ pregunta_id: P1, tema: 'gastos fijos', supuesto: SUPUESTO, texto: textoDelSupuesto(SUPUESTO), atribucion: ATRIBUCION_DEL_SUPUESTO, propuesto_por: { oficina: 'financiera', agente: 'cfo' }, aceptado_en: AHORA.toISOString() })])

      const q = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: CLASE_DEL_SUPUESTO_ACEPTADO, contenido_completo: true })).body as { resultados: Array<{ procedencia: Record<string, unknown>; contenido: string }>; contexto_del_cliente: typeof adj }
      expect(q.resultados).toHaveLength(1)
      expect(q.resultados[0].procedencia).toMatchObject({ atribucion: ATRIBUCION_DEL_SUPUESTO, aceptado_por: 'dueno', origen: 'plataforma', pregunta_id: P1 })
      expect(q.resultados[0].procedencia.confirmado_por).toBeUndefined()
      expect(q.resultados[0].contenido).toContain('NO es dato del dueño')
      expect(q.contexto_del_cliente.supuestos_aceptados_por_el_dueno).toHaveLength(1)
      // pedir lo del dueño NO trae el supuesto
      const delDueno = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'dato_del_dueno' })).body as { resultados: Array<{ clase: string }> }
      expect(delDueno.resultados.map((x) => x.clase)).toEqual(['dato_del_dueno'])

      const p = (await rutaLeerPedido({ db, ahora: AHORA }, PEDIDO)).body as { contexto_del_cliente?: typeof adj }
      expect(p.contexto_del_cliente?.supuestos_aceptados_por_el_dueno?.map((s) => s.atribucion)).toEqual([ATRIBUCION_DEL_SUPUESTO])
      expect(p.contexto_del_cliente?.hechos_del_dueno?.map((h) => h.tema)).toEqual(['horario de atención'])
    })
  }

  it('aunque la ficha del supuesto viniera alterada (con «confirmado_por: dueno» y una «respuesta»), ningún lector la da como dato del dueño', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    await asumir(deps, c)
    const [f] = supuestosEn(t)
    const pt = f.provenance_tag as Record<string, Record<string, unknown>>
    f.provenance_tag = { ...pt, confirmado_por: 'dueno', datos: { ...pt.datos, respuesta: 'un texto que parece respuesta' } }
    const q = (await rutaConsultar({ db: deps.db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: CLASE_DEL_SUPUESTO_ACEPTADO })).body as { resultados: Array<{ procedencia: Record<string, unknown> }> }
    expect(q.resultados[0].procedencia.confirmado_por).toBeUndefined()
    expect(q.resultados[0].procedencia.atribucion).toBe(ATRIBUCION_DEL_SUPUESTO)
    const adj = await adjuntoDelCliente(deps.db, c.id, AHORA)
    expect(adj.hechos_del_dueno).toBeUndefined()
    expect(adj.supuestos_aceptados_por_el_dueno).toHaveLength(1)
  })

  it('lista corta y pedido al portero: estado «supuesto_aceptado_por_dueno», nunca «dicho_por_dueno»', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    await asumir(deps, c)
    const [f] = supuestosEn(t)
    const tablas = tablasConFichas()
    tablas.cerebro_fichas = [...(tablas.cerebro_fichas as Array<Record<string, unknown>>), { ...f, client_id: A, creado_en: AHORA_CEREBRO.toISOString(), prueba: false, residual: false }]
    const consulta = baseDelCerebro(tablas).consulta
    const linea = (await construirListaCorta(consulta, A, { ahora: AHORA_CEREBRO })).lineas.find((x) => x.ref === `cerebro_fichas:${String(f.id)}`)
    expect(linea).toMatchObject({ estado: 'supuesto_aceptado_por_dueno', origen: 'plataforma', clase: CLASE_DEL_SUPUESTO_ACEPTADO })
    expect(linea?.que_es).toMatch(/^Supuesto aceptado por el dueño \(no lo dijo él\)/)
    const e = await entregarContenido(consulta, { cliente: A, refs: [`cerebro_fichas:${String(f.id)}`] }, { ahora: AHORA_CEREBRO })
    const m = (e.cuerpo.material as Array<Record<string, unknown>>)[0]
    expect(m.estado).toBe('supuesto_aceptado_por_dueno')
    expect(String(m.texto)).toContain('NO es dato del dueño')
    // una ficha del dueño de verdad sigue siendo «dicho_por_dueno»
    expect((await construirListaCorta(consulta, A, { ahora: AHORA_CEREBRO })).lineas.find((x) => x.ref === 'cerebro_fichas:fa-1')?.estado).toBe('dicho_por_dueno')
  })
})

describe('los supuestos elegidos por el dueño de un encargo (la lista del redactor)', () => {
  it('solo lo asumido, por encargo y/o por pregunta_ids; ni respuestas ni pendientes; ids malos son 400', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, P1, 'gastos fijos')
    pendiente(t, c, P2, 'ticket promedio', { supuesto: { texto: '18 USD por mesa' } })
    pendiente(t, c, P3, 'meta de ventas', { workflow_execution_id: 'otro-encargo', supuesto: { texto: '300 platos por semana' } })
    t.cerebro_dueno_preguntas.push({ ...pregunta(t, P1), id: '55555555-5555-4555-8555-555555555555', estado: 'respondida' })
    await asumir(deps, c, { pregunta_id: P1 }); await asumir(deps, c, { pregunta_id: P3 })
    const leer = async (o: Record<string, string>) => ((await rutaLeerDueno(deps, { client_id: c.id, asumidas: '1', ...o })).body.supuestos_elegidos_por_el_dueno as Array<{ pregunta_id: string; atribucion: string }>)
    expect((await leer({ encargo: 'ex-plan-1' })).map((s) => s.pregunta_id)).toEqual([P1])
    expect((await leer({ pregunta_ids: `${P2},${P3}` })).map((s) => s.pregunta_id)).toEqual([P3])
    expect((await leer({})).map((s) => s.pregunta_id).sort()).toEqual([P1, P3].sort())
    expect((await leer({ encargo: 'ex-plan-1' }))[0].atribucion).toBe(ATRIBUCION_DEL_SUPUESTO)
    expect((await rutaLeerDueno(deps, { client_id: c.id, asumidas: '1', pregunta_ids: 'malo' })).status).toBe(400)
    // sin pedirlos, la lectura de siempre no cambia
    expect((await rutaLeerDueno(deps, { client_id: c.id })).body.supuestos_elegidos_por_el_dueno).toBeUndefined()
  })
})
