/**
 * LA PUERTA DEL DUEÑO DESPUÉS DE LA ADENDA (06-nov · firmada por Emilio) · US$ 0 · base falsa · los diez clientes de práctica.
 * Las preguntas viven en la plataforma (`dueno_preguntas`, CC1). El cerebro solo recibe lo que el dueño decidió:
 *   · `asumir`: la plataforma manda pregunta, oficina, id, quién y cuándo; queda una ficha «supuesto aceptado por el dueño» (nunca dato del dueño), fija por pregunta_id.
 *   · `respuesta` con `pregunta_id`: una ficha por pregunta (reintentar es seguro) y retira el supuesto aceptado de esa pregunta (la palabra del dueño manda · CC6).
 *   · `pregunta` y `descartar`: 410 + alarma. La lectura ya no trae pendientes. Nada lee ni escribe `cerebro_dueno_preguntas`.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../../cerebro/lista-corta'
import { entregarContenido } from '../../cerebro/portero/entregar'
import { A, AHORA as AHORA_CEREBRO, crearBaseFalsa as baseDelCerebro } from '../../cerebro/__tests__/casos'
import { tablasConFichas } from '../../cerebro/__tests__/fichas-casos'
import { rutaConsultar } from '../consultar'
import { adjuntoDelCliente } from '../contexto-del-cliente'
import { CLAVE_DE_EVENTOS_RETIRADOS, rutaDueno, rutaLeerDueno, supuestosQueRetira, type DepsDeDueno } from '../dueno'
import { rutaLeerPedido } from '../pedidos'
import { ATRIBUCION_DEL_SUPUESTO, CLASE_DEL_SUPUESTO_ACEPTADO, refDelSupuesto, supuestoDeLaEntrada, textoDelSupuesto } from '../supuestos-del-dueno'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-plataforma', workflow_execution_id: 'ex-1' }
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const PEDIDO = '44444444-4444-4444-8444-444444444444'
const SUPUESTO = { texto: 'se asume lo del mes pasado mientras no conteste', nombre: 'Gastos fijos al mes', valor: 1200, unidad: 'USD' }
const ANTES = '2026-10-15T10:00:00.000Z'
const DESPUES = '2026-10-15T18:00:00.000Z'

type Fila = Record<string, unknown>
const montar = (c: ClienteSintetico, activo = true, opciones: Parameters<typeof crearBaseFalsa>[1] = {}) => {
  // SIN `cerebro_dueno_preguntas`: si algo la leyera o escribiera, `lecturas`/`escrituras` lo dirían
  const t: T = { ...tablasDe(c) }
  ;(t as Record<string, unknown[]>).cerebro_pedidos = [{ id: PEDIDO, client_id: c.id, pedido: 'p', estado: 'hecho', resultado: {}, creado_en: AHORA.toISOString(), pedido_por_oficina: 'estrategia', pedido_por_agente: 'a' }]
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString(), ...opciones })
  let n = 0
  const alarmas: Array<{ texto: string; clave: string }> = []
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, avisarIncidente: async (texto, clave) => { alarmas.push({ texto, clave }) } }
  return { t, deps, base, alarmas }
}
// lo que manda la plataforma (contrato del AVISO de CC1)
const asumir = (deps: DepsDeDueno, c: ClienteSintetico, o: Fila = {}) => rutaDueno(deps, { evento: 'asumir', dry_run: false, ...WF, client_id: c.id, pregunta_id: P1, oficina: 'financiera', agente: 'cfo', tema: 'gastos fijos', pregunta: '¿Cuánto pagas de gastos fijos al mes?', supuesto: SUPUESTO, decidido_por: 'dueno', decidido_en: ANTES, canal: 'dashboard · Decisiones', ...o })
const responder = (deps: DepsDeDueno, c: ClienteSintetico, o: Fila = {}) => rutaDueno(deps, { evento: 'respuesta', dry_run: false, ...WF, client_id: c.id, pregunta_id: P1, oficina: 'financiera', agente: 'cfo', tema: 'gastos fijos', pregunta: '¿Cuánto pagas de gastos fijos al mes?', respuesta: 'Unos 1.500 al mes.', decidido_por: 'dueno', decidido_en: DESPUES, canal: 'dashboard · Decisiones', ...o })
const supuestosEn = (t: T) => (t.cerebro_fichas as Fila[]).filter((f) => f.clase === CLASE_DEL_SUPUESTO_ACEPTADO)
const delDueno = (t: T) => (t.cerebro_fichas as Fila[]).filter((f) => f.clase === 'dato_del_dueno')
const nadieTocaLaTablaVieja = (base: ReturnType<typeof crearBaseFalsa>) => {
  expect(base.lecturas).not.toContain('cerebro_dueno_preguntas')
  expect(base.escrituras.map((e) => e.tabla)).not.toContain('cerebro_dueno_preguntas')
}

describe('asumir · la plataforma manda el supuesto que el dueño eligió', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: ficha «supuesto aceptado por el dueño», no confiable y de origen plataforma; con la pregunta, quién la propuso, quién decidió y cuándo; devuelve su ref`, async () => {
      const { t, deps, base } = montar(c)
      const fichas = t.cerebro_fichas.length
      const seco = await asumir(deps, c, { dry_run: true })
      expect(seco.body).toMatchObject({ ok: true, dry_run: true, supuesto: SUPUESTO })
      expect(t.cerebro_fichas.length).toBe(fichas)

      const r = await asumir(deps, c)
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, pregunta_id: P1, supuesto: SUPUESTO, decidido_por: 'dueno', decidido_en: ANTES, atribucion: ATRIBUCION_DEL_SUPUESTO })
      const [f] = supuestosEn(t)
      expect(r.body.ficha_id).toBe(f.id)
      expect(f).toMatchObject({ ref: refDelSupuesto(P1), origen: 'plataforma', clase: CLASE_DEL_SUPUESTO_ACEPTADO, retirada_en: null, descartada: false, observado_en: ANTES })
      const pt = f.provenance_tag as Fila
      // CC6 (a): lo que el dueño aceptó sin decirlo NUNCA sube de confianza
      expect(pt).toMatchObject({ trust_level: 'untrusted', source: 'oficina', aceptado_por: 'dueno', atribucion: ATRIBUCION_DEL_SUPUESTO })
      expect(pt.confirmado_por).toBeUndefined()
      expect(pt.datos).toMatchObject({ evento: 'asumir', pregunta_id: P1, tema: 'gastos fijos', pregunta: '¿Cuánto pagas de gastos fijos al mes?', supuesto: SUPUESTO, propuesto_por: { oficina: 'financiera', agente: 'cfo' }, asumido_por: 'dueno', asumida_en: ANTES, canal: 'dashboard · Decisiones' })
      expect(String(f.contenido)).toContain('NO es dato del dueño')
      expect(String(f.contenido)).toContain('Gastos fijos al mes: 1200 USD')
      expect(delDueno(t)).toHaveLength(0)

      const lec = await rutaLeerDueno(deps, { client_id: c.id })
      expect(lec.body.respuestas).toEqual([]) // asumir no es responder
      nadieTocaLaTablaVieja(base)
    })
  }

  it('reintentar con el mismo pregunta_id devuelve la misma ficha y no escribe nada', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    const r1 = await asumir(deps, c)
    const antes = { fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length }
    const r2 = await asumir(deps, c)
    expect(r2.body).toMatchObject({ ok: true, repetida: true, ficha_id: r1.body.ficha_id })
    expect({ fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length }).toEqual(antes)
  })

  it('CC6 · si esa pregunta ya tiene respuesta del dueño: 409 ya_respondida y no se guarda el supuesto', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    const r1 = await responder(deps, c)
    const fichas = t.cerebro_fichas.length
    const r = await asumir(deps, c)
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ error: 'ya_respondida', ficha_id: r1.body.ficha_id, pregunta_id: P1 })
    expect(t.cerebro_fichas.length).toBe(fichas)
    expect(supuestosEn(t)).toHaveLength(0)
    // otra pregunta sin respuesta se asume normal
    expect((await asumir(deps, c, { pregunta_id: P2 })).status).toBe(200)
  })

  it('sin supuesto: 422 claro y no se escribe nada; un supuesto mal formado es 400', async () => {
    const c = DIEZ_CLIENTES[0]
    for (const sin of [{ supuesto: null }, { supuesto: undefined }]) {
      const { t, deps } = montar(c)
      const fichas = t.cerebro_fichas.length, ingresos = t.cerebro_ingresos.length
      const r = await asumir(deps, c, sin)
      expect([r.status, r.body.error]).toEqual([422, 'sin_supuesto'])
      expect(String(r.body.detalle)).toContain('No se guardó nada')
      expect([t.cerebro_fichas.length, t.cerebro_ingresos.length]).toEqual([fichas, ingresos])
    }
    const { deps } = montar(c)
    for (const mal of [{ texto: '' }, { texto: '   ' }, { texto: 'x'.repeat(301) }, { texto: 'a', valor: 'mil' }, { texto: 'a', unidad: '' }, ['a'], 12]) expect((await asumir(deps, c, { supuesto: mal })).status).toBe(400)
  })

  it('entrada: id de la plataforma, oficina, tema y pregunta obligatorios; otro cliente 404; apagado no escribe; sin flujo 403', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    for (const o of [{ pregunta_id: 'no-es-uuid' }, { pregunta_id: undefined }, { oficina: undefined }, { agente: '' }, { oficina: 'x'.repeat(81) }, { tema: '' }, { tema: 'x'.repeat(81) }, { pregunta: '' }, { pregunta: 'x'.repeat(601) }, { decidido_en: 'ayer' }, { decidido_por: 'x'.repeat(81) }]) {
      expect((await asumir(deps, c, o)).status, JSON.stringify(o)).toBe(400)
    }
    expect((await asumir(deps, c, { client_id: '99999999-9999-4999-8999-999999999999' })).status).toBe(404)
    const off = montar(c, false)
    expect((await asumir(off.deps, c)).body).toMatchObject({ apagado: true })
    expect(supuestosEn(off.t)).toHaveLength(0)
    expect((await rutaDueno(deps, { evento: 'asumir', client_id: c.id, pregunta_id: P1, dry_run: false })).status).toBe(403)
    expect(supuestosEn(t)).toHaveLength(0)
  })

  it('quién y cuándo: por omisión el dueño y ahora; acepta `asumido_por` y `preguntado_por` del contrato anterior', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c, { decidido_por: undefined, decidido_en: undefined })
    expect((supuestosEn(t)[0].provenance_tag as { datos: Fila }).datos).toMatchObject({ asumido_por: 'dueno', asumida_en: AHORA.toISOString() })
    await asumir(deps, c, { pregunta_id: P2, decidido_por: undefined, asumido_por: 'dueno · Decisiones', oficina: undefined, agente: undefined, preguntado_por: { oficina: 'comercial', agente: 'ventas' } })
    expect((supuestosEn(t)[1].provenance_tag as { datos: Fila }).datos).toMatchObject({ asumido_por: 'dueno · Decisiones', propuesto_por: { oficina: 'comercial', agente: 'ventas' } })
  })
})

describe('respuesta del dueño a una pregunta de la plataforma', () => {
  it('una ficha por pregunta_id: reintentar devuelve la misma ficha_id y no duplica; guarda pregunta_id, quién y cuándo', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps, base } = montar(c)
    const r1 = await responder(deps, c)
    expect(r1.status).toBe(200)
    expect(r1.body).toMatchObject({ ok: true, guardada: true })
    const [f] = delDueno(t)
    expect(r1.body.ficha_id).toBe(f.id)
    expect(f).toMatchObject({ ref: `dueno:pregunta:${P1}`, origen: 'dueno', observado_en: DESPUES })
    expect((f.provenance_tag as { datos: Fila }).datos).toMatchObject({ pregunta_id: P1, decidido_por: 'dueno', respondido_en: DESPUES, respuesta: 'Unos 1.500 al mes.', preguntado_por: { oficina: 'financiera', agente: 'cfo' } })
    const antes = { fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length }
    // la plataforma reintenta (otra hora de envío, mismo pregunta_id): la misma ficha
    const r2 = await responder(deps, c, { decidido_en: '2026-10-15T19:00:00.000Z' })
    expect(r2.body).toMatchObject({ ok: true, repetida: true, ficha_id: f.id })
    expect({ fichas: t.cerebro_fichas.length, ingresos: t.cerebro_ingresos.length }).toEqual(antes)
    nadieTocaLaTablaVieja(base)
  })

  it('pregunta_id que no es uuid es 400; sin pregunta_id (las notas que se suman) sigue entrando como siempre', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    expect((await responder(deps, c, { pregunta_id: 'abc' })).status).toBe(400)
    const nota = await rutaDueno(deps, { client_id: c.id, dry_run: false, ...WF, tema: 'comentario de una pieza', pregunta: 'Comentario del dueño', respuesta: 'El logo se ve chico.', canal: 'dashboard · pieza', respondido_en: DESPUES, preguntado_por: { oficina: 'creativa', agente: 'dueno' }, acumula: true })
    expect(nota.body).toMatchObject({ ok: true, guardada: true, acumula: true })
    expect(String(delDueno(t)[0].ref)).toMatch(/^dueno:/)
    expect(String(delDueno(t)[0].ref)).not.toContain('pregunta:')
  })

  it('CC6 (c) · la palabra del dueño manda: la respuesta retira el supuesto aceptado de esa pregunta, con fecha, motivo y quién lo reemplaza', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c)
    const r = await responder(deps, c)
    const [s] = supuestosEn(t), [f] = delDueno(t)
    expect(r.body.supuestos_retirados).toEqual([s.id])
    expect(s).toMatchObject({ retirada_en: AHORA.toISOString(), reemplazada_por: f.id })
    expect(String(s.motivo_retirada)).toContain('el dueño respondió')
    // y los lectores ya no lo traen
    const adj = await adjuntoDelCliente(deps.db, c.id, AHORA)
    expect(adj.supuestos_aceptados_por_el_dueno ?? []).toEqual([])
    expect(adj.hechos_del_dueno?.map((h) => h.tema)).toEqual(['gastos fijos'])
  })

  it('también retira el supuesto de OTRA pregunta del mismo tema y sede si se aceptó antes; no el aceptado después, ni el de otro tema, ni con una nota que se suma', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c, { pregunta_id: P2 }) // mismo tema, aceptado ANTES de la respuesta
    await asumir(deps, c, { pregunta_id: '55555555-5555-4555-8555-555555555555', tema: 'ticket promedio', supuesto: { texto: '18 USD' } }) // otro tema
    await asumir(deps, c, { pregunta_id: '66666666-6666-4666-8666-666666666666', decidido_en: '2026-10-16T09:00:00.000Z' }) // mismo tema, aceptado DESPUÉS
    const nota = await rutaDueno(deps, { client_id: c.id, dry_run: false, ...WF, tema: 'gastos fijos', pregunta: 'Nota', respuesta: 'Ojo con los gastos fijos.', canal: 'dashboard · pieza', respondido_en: DESPUES, preguntado_por: { oficina: 'creativa', agente: 'dueno' }, acumula: true })
    expect(nota.body.supuestos_retirados).toEqual([])
    expect(supuestosEn(t).every((s) => s.retirada_en === null)).toBe(true)
    await responder(deps, c)
    const retirado = (p: string) => supuestosEn(t).find((s) => (s.provenance_tag as { datos: Fila }).datos.pregunta_id === p)?.retirada_en
    expect(retirado(P2)).toBe(AHORA.toISOString())
    expect(retirado('55555555-5555-4555-8555-555555555555')).toBeNull()
    expect(retirado('66666666-6666-4666-8666-666666666666')).toBeNull()
  })

  it('#921 · solo el MISMO tema (otra escritura vale) retira el supuesto de otra pregunta; un tema parecido no', () => {
    const s = (tema: string): Fila => ({ id: `s-${tema}`, sede: null, observado_en: ANTES, provenance_tag: { datos: { tema, pregunta_id: P2, asumida_en: ANTES } } })
    const n = { pregunta_id: P1, tema: 'gastos fijos', respondido_en: DESPUES }
    expect(supuestosQueRetira([s('Gastos  FIJOS'), s('gastos fijos mensuales'), s('fijos: gastos')], n, '').map((x) => x.id)).toEqual(['s-Gastos  FIJOS'])
  })
  it('regla de sede: una respuesta de una sede no retira el supuesto de otra; una para todas las sedes sí', () => {
    const s = (sede: string | null, pregunta_id = P2): Fila => ({ id: `s-${sede}`, sede, observado_en: ANTES, provenance_tag: { datos: { tema: 'gastos fijos', pregunta_id, asumida_en: ANTES, ...(sede ? { sedes: [sede] } : {}) } } })
    const n = { pregunta_id: P1, tema: 'gastos fijos', respondido_en: DESPUES }
    expect(supuestosQueRetira([s('norte'), s('sur')], n, 'norte').map((x) => x.id)).toEqual(['s-norte'])
    expect(supuestosQueRetira([s('norte'), s('sur')], n, '').map((x) => x.id)).toEqual(['s-norte', 's-sur'])
    // el de la MISMA pregunta se retira sin mirar tema ni fecha
    expect(supuestosQueRetira([{ ...s('sur', P1), provenance_tag: { datos: { tema: 'otro', pregunta_id: P1, asumida_en: '2027-01-01T00:00:00Z' } } }], n, 'norte')).toHaveLength(1)
    // una nota (tema vacío) sin pregunta_id no retira nada
    expect(supuestosQueRetira([s(null)], { pregunta_id: null, tema: '', respondido_en: DESPUES }, '')).toEqual([])
  })

  it('si el retiro falló en un intento, el reintento (repetida) lo completa', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c)
    await responder(deps, c)
    const [s] = supuestosEn(t)
    Object.assign(s, { retirada_en: null, motivo_retirada: null, reemplazada_por: null }) // como si el retiro hubiera fallado
    const r = await responder(deps, c)
    expect(r.body).toMatchObject({ ok: true, repetida: true, supuestos_retirados: [s.id] })
    expect(s.retirada_en).toBe(AHORA.toISOString())
  })

  it('CC6 · si retirar el supuesto falla, la respuesta NO sale 200: 502 con `errores`, y el reintento lo completa', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c)
    const [s] = supuestosEn(t)
    // solo el retiro del supuesto falla; lo demás de la base funciona
    const real = deps.db
    const fallaElRetiro = { from: (tabla: string) => {
      const q = real.from(tabla) as unknown as Record<string, unknown>
      if (tabla !== 'cerebro_fichas') return q
      return new Proxy(q, { get: (o, k) => {
        if (k === 'update') return (cambio: Fila) => {
          if (!String(cambio.motivo_retirada ?? '').startsWith('el dueño respondió')) return (o.update as (x: Fila) => unknown)(cambio)
          const roto: Record<string, unknown> = { eq: () => roto, is: () => roto, then: (ok: (r: unknown) => unknown) => ok({ data: null, error: { message: 'falla simulada del retiro' } }) }
          return roto
        }
        const x = o[k as string]
        return typeof x === 'function' ? (x as (...a: unknown[]) => unknown).bind(o) : x
      } })
    } } as unknown as DepsDeDueno['db']
    const r = await responder({ ...deps, db: fallaElRetiro }, c)
    expect(r.status).toBe(502)
    expect(r.body.ok).toBe(false)
    expect((r.body.errores as string[]).join(' ')).toContain('retiro del supuesto')
    expect(s.retirada_en).toBeNull() // sigue vivo: por eso no puede salir 200
    // el reintento con la base sana completa el retiro
    const otra = await responder(deps, c)
    expect(otra.body).toMatchObject({ ok: true, repetida: true, supuestos_retirados: [s.id] })
    expect(s.retirada_en).toBe(AHORA.toISOString())
  })

  it('CC6 · con más supuestos vivos que una página de la base (1.100 > 1.000), la respuesta igual retira el suyo (sin recorte silencioso)', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c, true, { topeDeFilas: 1000 })
    for (let i = 0; i < 1100; i++) (t.cerebro_fichas as Fila[]).push({ id: `00000000-0000-0000-${String(i).padStart(4, '0')}-000000000000`, client_id: c.id, clase: CLASE_DEL_SUPUESTO_ACEPTADO, ref: `supuesto:otro-${i}`, sede: null, retirada_en: null, descartada: false, observado_en: ANTES, provenance_tag: { datos: { tema: `otro tema ${i}`, pregunta_id: `otra-${i}`, asumida_en: ANTES } } })
    await asumir(deps, c)
    const s = supuestosEn(t).find((f) => f.ref === refDelSupuesto(P1))!
    expect(supuestosEn(t).map((f) => String(f.id)).sort().at(-1)).toBe(s.id) // ordenado por id queda al final, más allá de cualquier primera página
    const r = await responder(deps, c)
    expect(r.status).toBe(200)
    expect(r.body.supuestos_retirados).toEqual([s.id])
    expect(s.retirada_en).toBe(AHORA.toISOString())
  })

  it('si no se pueden leer los supuestos vivos, no se guarda la respuesta a medias: 502', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c, true, { fallaEn: 'cerebro_fichas', saltar: 2, fallaVeces: 1 })
    const fichas = t.cerebro_fichas.length
    const r = await responder(deps, c)
    expect(r.status).toBe(502)
    expect(t.cerebro_fichas.length).toBe(fichas)
  })
})

describe('lo que salió del cerebro: error claro + alarma', () => {
  for (const evento of ['pregunta', 'descartar']) {
    it(`«${evento}» → 410 con la ruta nueva, una alarma con clave única, y no se lee ni escribe nada`, async () => {
      const c = DIEZ_CLIENTES[0]
      const { t, deps, base, alarmas } = montar(c)
      const fichas = t.cerebro_fichas.length
      const r = await rutaDueno(deps, { evento, client_id: c.id, dry_run: false, ...WF, tema: 'gastos fijos', pregunta: '¿?', canal: 'x', preguntado_por: { oficina: 'financiera', agente: 'cfo' }, pregunta_id: P1, motivo: 'm' })
      expect(r.status).toBe(410)
      expect(r.body).toMatchObject({ error: 'evento_retirado', evento, usar: '/api/dueno/preguntas' })
      expect(alarmas).toEqual([{ texto: expect.stringContaining(`«${evento}»`), clave: CLAVE_DE_EVENTOS_RETIRADOS }])
      expect(alarmas[0].texto).toContain('financiera')
      expect(t.cerebro_fichas.length).toBe(fichas)
      expect(base.lecturas).toEqual([])
      expect(base.escrituras).toEqual([])
    })
  }
  it('si la alarma falla, la respuesta sigue siendo el 410 claro', async () => {
    const c = DIEZ_CLIENTES[0]
    const { deps } = montar(c)
    const r = await rutaDueno({ ...deps, avisarIncidente: async () => { throw new Error('slack caído') } }, { evento: 'pregunta', client_id: c.id, dry_run: true })
    expect(r.status).toBe(410)
  })
  it('la lectura sigue trayendo `respuestas` (la usa el flujo del plan) y las pendientes salen null con dónde leerlas', async () => {
    const c = DIEZ_CLIENTES[0]
    const { deps, base } = montar(c)
    await responder(deps, c)
    const lec = await rutaLeerDueno(deps, { client_id: c.id, limite: 30 })
    expect(lec.status).toBe(200)
    expect(lec.body).toMatchObject({ ok: true, pendientes: null, pendientes_se_leen_en: 'GET /api/dueno/preguntas' })
    expect((lec.body.respuestas as Array<{ respuesta: string }>).map((x) => x.respuesta)).toEqual(['Unos 1.500 al mes.'])
    nadieTocaLaTablaVieja(base)
  })
})

describe('cada lector entrega lo asumido como «supuesto aceptado por el dueño», nunca como dato del dueño', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: contexto_del_cliente, consulta y pedido`, async () => {
      const { deps } = montar(c)
      // una respuesta real del dueño, de otro tema, para ver que no se mezclan
      await rutaDueno(deps, { client_id: c.id, dry_run: false, ...WF, tema: 'horario de atención', pregunta: '¿Qué horario tienen?', respuesta: 'De 12 a 16.', canal: 'MD de Slack', mensaje_ref: 'slack:1', respondido_en: '2026-10-15T14:00:00Z', preguntado_por: { oficina: 'comercial', agente: 'a' } })
      await asumir(deps, c)
      const db = deps.db

      const adj = await adjuntoDelCliente(db, c.id, AHORA)
      expect(adj.hechos_del_dueno?.map((h) => h.tema)).toEqual(['horario de atención'])
      expect(adj.supuestos_aceptados_por_el_dueno).toEqual([expect.objectContaining({ pregunta_id: P1, tema: 'gastos fijos', supuesto: SUPUESTO, texto: textoDelSupuesto(SUPUESTO), atribucion: ATRIBUCION_DEL_SUPUESTO, propuesto_por: { oficina: 'financiera', agente: 'cfo' }, aceptado_en: ANTES })])

      const q = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: CLASE_DEL_SUPUESTO_ACEPTADO, contenido_completo: true })).body as { resultados: Array<{ procedencia: Fila; contenido: string }>; contexto_del_cliente: typeof adj }
      expect(q.resultados).toHaveLength(1)
      expect(q.resultados[0].procedencia).toMatchObject({ atribucion: ATRIBUCION_DEL_SUPUESTO, aceptado_por: 'dueno', origen: 'plataforma', pregunta_id: P1 })
      expect(q.resultados[0].procedencia.confirmado_por).toBeUndefined()
      expect(q.resultados[0].contenido).toContain('NO es dato del dueño')
      expect(q.contexto_del_cliente.supuestos_aceptados_por_el_dueno).toHaveLength(1)
      const soloDueno = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'dato_del_dueno' })).body as { resultados: Array<{ clase: string }> }
      expect(soloDueno.resultados.map((x) => x.clase)).toEqual(['dato_del_dueno'])

      const p = (await rutaLeerPedido({ db, ahora: AHORA }, PEDIDO)).body as { contexto_del_cliente?: typeof adj }
      expect(p.contexto_del_cliente?.supuestos_aceptados_por_el_dueno?.map((s) => s.atribucion)).toEqual([ATRIBUCION_DEL_SUPUESTO])
      expect(p.contexto_del_cliente?.hechos_del_dueno?.map((h) => h.tema)).toEqual(['horario de atención'])
    })
  }

  it('aunque la ficha del supuesto viniera alterada (con «confirmado_por: dueno» y una «respuesta»), ningún lector la da como dato del dueño', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c)
    const [f] = supuestosEn(t)
    const pt = f.provenance_tag as Record<string, Fila>
    f.provenance_tag = { ...pt, confirmado_por: 'dueno', datos: { ...pt.datos, respuesta: 'un texto que parece respuesta' } }
    const q = (await rutaConsultar({ db: deps.db, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: CLASE_DEL_SUPUESTO_ACEPTADO })).body as { resultados: Array<{ procedencia: Fila }> }
    expect(q.resultados[0].procedencia.confirmado_por).toBeUndefined()
    expect(q.resultados[0].procedencia.atribucion).toBe(ATRIBUCION_DEL_SUPUESTO)
    const adj = await adjuntoDelCliente(deps.db, c.id, AHORA)
    expect(adj.hechos_del_dueno).toBeUndefined()
    expect(adj.supuestos_aceptados_por_el_dueno).toHaveLength(1)
  })

  it('lista corta y pedido al portero: estado «supuesto_aceptado_por_dueno», nunca «dicho_por_dueno»', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    await asumir(deps, c)
    const [f] = supuestosEn(t)
    const tablas = tablasConFichas()
    tablas.cerebro_fichas = [...(tablas.cerebro_fichas as Fila[]), { ...f, client_id: A, creado_en: AHORA_CEREBRO.toISOString(), prueba: false, residual: false }]
    const consulta = baseDelCerebro(tablas).consulta
    const linea = (await construirListaCorta(consulta, A, { ahora: AHORA_CEREBRO })).lineas.find((x) => x.ref === `cerebro_fichas:${String(f.id)}`)
    expect(linea).toMatchObject({ estado: 'supuesto_aceptado_por_dueno', origen: 'plataforma', clase: CLASE_DEL_SUPUESTO_ACEPTADO })
    expect(linea?.que_es).toMatch(/^Supuesto aceptado por el dueño \(no lo dijo él\)/)
    const e = await entregarContenido(consulta, { cliente: A, refs: [`cerebro_fichas:${String(f.id)}`] }, { ahora: AHORA_CEREBRO })
    const m = (e.cuerpo.material as Fila[])[0]
    expect(m.estado).toBe('supuesto_aceptado_por_dueno')
    expect(String(m.texto)).toContain('NO es dato del dueño')
    expect((await construirListaCorta(consulta, A, { ahora: AHORA_CEREBRO })).lineas.find((x) => x.ref === 'cerebro_fichas:fa-1')?.estado).toBe('dicho_por_dueno')
  })

  it('la línea legible junta la cifra y el texto', () => {
    expect(textoDelSupuesto(SUPUESTO)).toBe('Gastos fijos al mes: 1200 USD · se asume lo del mes pasado mientras no conteste')
    expect(textoDelSupuesto({ texto: 'solo texto' })).toBe('solo texto')
    expect(supuestoDeLaEntrada(undefined)).toEqual({ ok: true, supuesto: null })
  })
})
