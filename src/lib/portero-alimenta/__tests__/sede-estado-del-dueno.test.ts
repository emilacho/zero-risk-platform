/**
 * LO QUE EL DUEÑO DICE DEL ESTADO DE UNA SEDE ES TAMBIÉN UN DATO DE ESA SEDE (21-oct · firma de Emilio «dale»). «Guayaquil sin abrir», «ya abrió», «cerrada»:
 * además de la ficha del dueño, queda una fila de `client_sede_datos` (campo `estado_de_la_sede`, fuente `dueno`, con su cita), para que el resumen y la lista corta lo vean igual.
 * General: los diez clientes (con una, varias o ninguna sede). US$ 0 · base falsa · sin modelo.
 */
import { describe, expect, it } from 'vitest'
import { estadoDeSedeDichoPorElDueno, rutaDueno, type DepsDeDueno } from '../dueno'
import { armarResumen, cargarEntradaDelResumen } from '../resumen-vivo'
import { estadoDeApertura, estadoDeLasSedes, esTemaDeEstadoDeSede, sedeQueNombra } from '../../sedes/por-abrir'
import { construirListaCorta } from '../../cerebro/lista-corta'
import { crearBaseFalsa as baseDelCerebro } from '../../cerebro/__tests__/casos'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }
const OF = { oficina: 'estrategia', agente: 'planning-director' }
const montar = (c: ClienteSintetico) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo: true, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, deps }
}
const dice = (c: ClienteSintetico, respuesta: string, o: Record<string, unknown> = {}, en = '2026-10-16T10:00:00Z') => ({
  client_id: c.id, dry_run: false, ...WF, tema: 'apertura de la sede', pregunta: '¿Cómo está la sede?', respuesta, canal: 'chat con Lenovo', mensaje_ref: `chat:${respuesta}:${en}`, respondido_en: en, preguntado_por: OF, ...o,
})
const estados = (t: T) => t.client_sede_datos.filter((r) => r.campo === 'estado_de_la_sede')

describe('qué dice un texto sobre el estado (ahora también «cerrada»)', () => {
  it('cerrada', () => { for (const x of ['Guayaquil cerrada', 'cerramos la sede', 'cerrada definitivamente', 'ya no abre', 'la cerraron']) expect(estadoDeApertura(x), x).toBe('cerrada') })
  it('un horario no es un estado', () => { for (const x of ['cerrada los martes', 'cierra a las 22', 'cerrado de lunes a miércoles', 'cerrada hasta las 10']) expect(estadoDeApertura(x), x).not.toBe('cerrada') })
  it('lo de antes sigue igual', () => { expect(estadoDeApertura('Guayaquil sin abrir')).toBe('por_abrir'); expect(estadoDeApertura('ya abrió')).toBe('abierta') })
  it('el tema decide si es del estado de una sede', () => {
    for (const x of ['apertura de la sede', 'estado de Guayaquil', 'ya abrió', 'sede cerrada']) expect(esTemaDeEstadoDeSede(x), x).toBe(true)
    for (const x of ['costo por plato', 'presupuesto de pauta', 'horario de atención']) expect(esTemaDeEstadoDeSede(x), x).toBe(false)
  })
  it('de qué sede habla: solo si nombra exactamente una', () => {
    const s = [{ clave: 'guayaquil', ciudad: 'Guayaquil' }, { clave: 'olon', ciudad: 'Olón' }]
    expect(sedeQueNombra('Guayaquil sin abrir', s)).toBe('guayaquil')
    expect(sedeQueNombra('Olón abierta y Guayaquil sin abrir', s)).toBeNull()
    expect(sedeQueNombra('todavía no abre', s)).toBeNull()
  })
})

describe('el estado que dice el dueño queda como dato de la sede, con los diez clientes', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}, ${c.sedes.length} sede(s))`, async () => {
      const m = montar(c)
      const antes = m.t.client_sede_datos.length
      const sede = c.sedes[c.sedes.length - 1]
      const r = await rutaDueno(m.deps, dice(c, 'Todavía no abre', sede ? { sede_clave: sede.clave } : {}))
      expect(r.status).toBe(200)
      if (!sede) { expect(m.t.client_sede_datos).toHaveLength(antes); return }
      const fila = estados(m.t)
      expect(fila).toHaveLength(1)
      expect(fila[0]).toMatchObject({ client_id: c.id, sede_id: `${c.id}-${sede.clave}`, campo: 'estado_de_la_sede', valor_texto: 'por abrir', fuente: 'dueno', alcance: 'sede', observado_en: '2026-10-16T10:00:00.000Z' })
      expect(String(fila[0].fuente_ref)).toMatch(/cerebro_fichas:.*chat con Lenovo.*2026-10-16.*«Todavía no abre»/) // origen dueño y su cita
      expect((r.body as { estado_de_sede: { sede: string; estado: string } }).estado_de_sede).toEqual({ sede: sede.clave, estado: 'por_abrir' })
      // lo ve el resumen vivo, igual que lo vería de la ficha del dueño: se prueba SIN la ficha para que cuente solo el dato de la sede
      m.t.cerebro_fichas.length = 0
      const lectura = await cargarEntradaDelResumen(crearBaseFalsa(m.t as never).db as never, { client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, zonas: [], sedes: c.sedes.map((s) => ({ clave: s.clave, ciudad: s.ciudad, id: `${c.id}-${s.clave}` })) })
      expect(lectura.ok && lectura.entrada.sedes_por_abrir).toEqual([sede.clave])
      // y la lista corta del cerebro
      const ls = await construirListaCorta(baseDelCerebro(m.t as never).consulta, c.id, { ahora: AHORA })
      expect(ls.lineas.find((l) => l.ref === `client_sedes:${c.id}-${sede.clave}`)?.que_es).toMatch(/POR ABRIR/)
    })
  }
})

describe('cómo se decide la sede y qué se guarda', () => {
  const guayaquil = [{ id: 's1', clave: 'guayaquil', ciudad: 'Guayaquil' }, { id: 's2', clave: 'olon', ciudad: 'Olón' }]
  it('sin sede en el pedido: la que nombra la respuesta; una sola sede: esa; dos o más sin nombre: ninguna (no se adivina)', () => {
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura', sede_clave: null }, 'Guayaquil sin abrir', guayaquil)).toMatchObject({ sede: { clave: 'guayaquil' }, estado: 'por_abrir' })
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura', sede_clave: null }, 'sin abrir', [guayaquil[0]])).toMatchObject({ sede: { clave: 'guayaquil' } })
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura', sede_clave: null }, 'sin abrir', guayaquil)).toBeNull()
    expect(estadoDeSedeDichoPorElDueno({ tema: 'apertura', sede_clave: 'olon' }, 'ya abrió', guayaquil)).toMatchObject({ sede: { clave: 'olon' }, estado: 'abierta' })
  })
  const c = DIEZ_CLIENTES.find((x) => x.sedes.length >= 1)!
  const s = c.sedes[0]
  it('otro tema del dueño (costo, pauta, horario) no escribe un estado de sede', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, dice(c, 'todavía no abre el segundo local; el plato cuesta 2,10', { tema: 'costo por plato', sede_clave: s.clave }))
    expect(estados(m.t)).toHaveLength(0)
  })
  it('«ya abrió» después de «por abrir»: suma una fila más nueva y la anterior se queda; el estado vigente es el último', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, dice(c, 'sin abrir', { sede_clave: s.clave }, '2026-10-16T10:00:00Z'))
    await rutaDueno(m.deps, dice(c, 'ya abrió', { sede_clave: s.clave }, '2026-10-30T10:00:00Z'))
    expect(estados(m.t).map((r) => r.valor_texto)).toEqual(['por abrir', 'abierta'])
    const e = estadoDeLasSedes({ datosDeSede: estados(m.t).map((r) => ({ clave: s.clave, campo: String(r.campo), valor_texto: String(r.valor_texto), observado_en: String(r.observado_en) })) })
    expect(e.get(s.clave)).toBe('abierta')
  })
  it('«cerrada» se guarda y el resumen la rotula igual que una por abrir (sin tocar los precios)', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, dice(c, 'cerrada', { sede_clave: s.clave }))
    expect(estados(m.t)[0].valor_texto).toBe('cerrada')
    const texto = armarResumen({ client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, zona: [], sedes: [{ clave: s.clave, ciudad: s.ciudad }, { clave: 'otra', ciudad: 'Otra' }], sedes_cerradas: [s.clave], fichas: [
      { id: 'h1111111', clase: 'horario', titulo: 'h', contenido: 'abierto hasta 3pm', atributo: 'horario:1', observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: '2026-12-01T00:00:00Z', retirada_en: null, provenance_tag: { datos: { sede: s.clave, sedes: [s.clave] } } },
      { id: 'p2222222', clase: 'precio', titulo: 'p', contenido: 'producto cafe precio 2 00 usd', atributo: 'precio:1', observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: '2026-12-01T00:00:00Z', retirada_en: null, provenance_tag: { datos: { sede: s.clave, sedes: [s.clave] } } },
    ] }).texto
    expect(texto).toMatch(new RegExp(`sede ${s.clave}[^\\]]* · cerrada\\] abierto hasta 3pm — sede cerrada: no atiende al público`))
    expect(texto).toMatch(/producto cafe precio 2 00 usd \[ficha:p2222222/)
    expect(texto.split('\n').find((l) => /producto cafe/.test(l))).not.toMatch(/no atiende/)
  })
  it('en seco avisa lo que haría y no escribe', async () => {
    const m = montar(c)
    const r = await rutaDueno(m.deps, dice(c, 'sin abrir', { sede_clave: s.clave, dry_run: true }))
    expect(r.body).toMatchObject({ dry_run: true, estado_de_sede: { sede: s.clave, estado: 'por_abrir' } })
    expect(estados(m.t)).toHaveLength(0)
  })
  it('si la fila de la sede no se puede escribir, se dice (la ficha del dueño sí quedó)', async () => {
    const m = montar(c)
    const db = m.deps.db as { from: (t: string) => unknown }
    const original = db.from.bind(db)
    ;(m.deps.db as { from: unknown }).from = (t: string) => (t === 'client_sede_datos' ? { select: (...a: unknown[]) => (original(t) as { select: (...x: unknown[]) => unknown }).select(...a), insert: async () => ({ error: { message: 'check violation' } }) } : original(t))
    const r = await rutaDueno(m.deps, dice(c, 'sin abrir', { sede_clave: s.clave }))
    expect(r.status).toBe(502)
    expect((r.body as { errores: string[] }).errores.join(' ')).toMatch(/estado de la sede: check violation/)
    expect(m.t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno')).toHaveLength(1)
  })
})
