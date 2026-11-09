/**
 * TEMAS PARECIDOS (05-nov) · US$ 0 · base falsa · sin modelo.
 * «Mismo tema» = el mismo texto normalizado. Un tema parecido no reemplaza una respuesta ni cuenta como respondido: se muestra APARTE para que el agente razone. Desde #940 las preguntas viven en la plataforma (aquí 410).
 */
import { describe, expect, it } from 'vitest'
import { esElMismoTema, esExactamenteElMismoTema, esTemaParecido, parecidaDeLaFicha, rutaDueno, rutaLeerDueno, temaNormal, type DepsDeDueno } from '../dueno'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }
const OF = { oficina: 'financiera', agente: 'jefe-financiero' }
const OTRA = { oficina: 'estrategia', agente: 'planning-director' }
const UUID_PREGUNTA = 'aaaaaaaa-0000-4000-8000-000000000001'
const montar = (c: ClienteSintetico, ahora = AHORA) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => ahora.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora, activo: true, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, base, deps }
}
let msg = 0
const responder = (c: ClienteSintetico, tema: string, respuesta: string, o: Record<string, unknown> = {}) => ({ client_id: c.id, dry_run: false, ...WF, tema, pregunta: `¿${tema}?`, respuesta, canal: 'dashboard · Tu oficina', mensaje_ref: `m:${++msg}`, respondido_en: '2026-10-15T14:00:00Z', preguntado_por: OF, ...o })
const preguntar = (c: ClienteSintetico, tema: string, o: Record<string, unknown> = {}) => ({ client_id: c.id, dry_run: false, ...WF, evento: 'pregunta', tema, pregunta: `¿${tema}?`, canal: 'dashboard · Tu oficina', preguntado_por: OF, ...o })
const vivas = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && !f.retirada_en)
const fila = (t: T, c: ClienteSintetico, id: string, tema: string, o: Record<string, unknown> = {}) => t.cerebro_dueno_preguntas.push({ id, client_id: c.id, sede_clave: null, tema, tema_norm: temaNormal(tema), pregunta: `¿${tema}?`, canal: 'x', preguntado_por_oficina: 'financiera', preguntado_por_agente: 'a', estado: 'pendiente', creado_en: AHORA.toISOString(), ...o })

describe('la tabla del aviso: parecido no es el mismo', () => {
  const PARECIDOS = [['ventas', 'ventas temporada baja'], ['costo', 'costo de envio'], ['ticket', 'ticket real'], ['clientes', 'clientes turistas vs locales'], ['comision pedidosya', 'comision pedidosya temporada baja'], ['presupuesto semanal pauta', 'presupuesto de pauta']]
  for (const [a, b] of PARECIDOS) {
    it(`«${a}» y «${b}»: parecidos, no el mismo (en los dos sentidos)`, () => {
      expect(esExactamenteElMismoTema(a, b)).toBe(false); expect(esExactamenteElMismoTema(b, a)).toBe(false)
      expect(esTemaParecido(a, b)).toBe(true); expect(esTemaParecido(b, a)).toBe(true)
    })
  }
  for (const [a, b] of [['presupuesto de pauta', 'presupuesto de sueldos'], ['ventas temporada baja', 'ventas temporada alta']]) {
    it(`«${a}» y «${b}»: ni el mismo ni parecidos`, () => { expect(esExactamenteElMismoTema(a, b)).toBe(false); expect(esTemaParecido(a, b)).toBe(false) })
  }
  it('el mismo tema normalizado no se ofrece como parecido; un tema vacío no es nada', () => {
    expect(esExactamenteElMismoTema('Ventas  Temporada BAJA', 'ventas temporada baja')).toBe(true)
    expect(esTemaParecido('Ventas  Temporada BAJA', 'ventas temporada baja')).toBe(false)
    expect(esExactamenteElMismoTema('', '')).toBe(false); expect(esExactamenteElMismoTema('···', '---')).toBe(false); expect(esTemaParecido('', 'x')).toBe(false)
  })
  it('la forma de una parecida: tema, respuesta y fecha; sin fecha propia usa la de la ficha', () => {
    expect(parecidaDeLaFicha({ id: 'f', observado_en: '2026-01-01', provenance_tag: { datos: { tema: 't', respuesta: 'r', respondido_en: '2026-02-02' } } })).toEqual({ ficha_id: 'f', tema: 't', respuesta: 'r', fecha: '2026-02-02' })
    expect(parecidaDeLaFicha({ id: 'f', observado_en: '2026-01-01', provenance_tag: {} })).toEqual({ ficha_id: 'f', tema: '', respuesta: '', fecha: '2026-01-01' })
  })
})

describe('para los diez clientes', () => {
  for (const c of DIEZ_CLIENTES) {
    describe(`${c.nombre} (${c.pais})`, () => {
      const leer = (m: ReturnType<typeof montar>, q: Record<string, string>) => rutaLeerDueno({ db: m.base.db as never, ahora: AHORA }, { client_id: c.id, ...q })
      it('un tema parecido no cuenta como respondido: la lectura lo trae aparte', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ventas', 'unas 80 por semana'))
        const l = await leer(m, { tema: 'ventas temporada baja' })
        expect(l.body).toMatchObject({ ok: true, respondida: false, total: 0, respuestas: [] })
        expect(l.body.parecidas).toEqual([expect.objectContaining({ tema: 'ventas', respuesta: 'unas 80 por semana', fecha: '2026-10-15T14:00:00.000Z' })])
      })
      it('una respuesta de tema parecido convive: no retira la otra ficha', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ticket', 'unos 12'))
        const r = await rutaDueno(m.deps, responder(c, 'ticket real', 'unos 15', { respondido_en: '2026-10-16T14:00:00Z' }))
        expect(r.body).toMatchObject({ ok: true, guardada: true, reemplaza: null })
        expect(vivas(m.t).map((f) => (f.provenance_tag as { datos: { tema: string } }).datos.tema).sort()).toEqual(['ticket', 'ticket real'])
        expect(vivas(m.t).every((f) => f.decision === 'suma')).toBe(true)
      })
      it('el mismo tema con otra escritura sigue siendo el mismo; lo parecido va aparte', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'costo de envío', '3 dólares'))
        await rutaDueno(m.deps, responder(c, 'costo', '5 dólares'))
        const l = await leer(m, { tema: 'COSTO  de envio' })
        expect(l.body).toMatchObject({ respondida: true, total: 1 })
        expect((l.body.respuestas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['3 dólares'])
        expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['5 dólares'])
      })
      it('`pregunta` y `descartar` ya no viven en el cerebro: 410 y no se toca nada', async () => {
        const m = montar(c)
        fila(m.t, c, 'p1', 'ventas')
        expect((await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja'))).status).toBe(410)
        expect((await rutaDueno(m.deps, { evento: 'descartar', client_id: c.id, tema: 'ventas', motivo: 'm', dry_run: false, ...WF })).status).toBe(410)
        expect(m.t.cerebro_dueno_preguntas.map((p) => [p.id, p.estado])).toEqual([['p1', 'pendiente']])
      })
      it('la lectura por tema: el mismo arriba; los parecidos aparte; las pendientes salen null (viven en la plataforma)', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ventas', 'unas 80'))
        await rutaDueno(m.deps, responder(c, 'ventas temporada baja', 'unas 30'))
        fila(m.t, c, 'p1', 'ventas'); fila(m.t, c, 'p2', 'ventas de diciembre')
        const l = await leer(m, { tema: 'Ventas' })
        expect(l.body).toMatchObject({ respondida: true, total: 1, pendientes: null, pendientes_parecidas: null })
        expect((l.body.respuestas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['unas 80'])
        expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['unas 30'])
        const solo = await leer(m, { tema: 'ventas de enero' })
        expect(solo.body).toMatchObject({ respondida: false, total: 0, respuestas: [] })
        expect((solo.body.parecidas as unknown[]).length).toBe(1)
        const sinTema = await leer(m, {})
        expect(sinTema.body.parecidas).toBeUndefined(); expect(sinTema.body.pendientes_parecidas).toBeUndefined()
        expect((sinTema.body.respuestas as unknown[]).length).toBe(2)
      })
    })
  }
})

describe('con `pregunta_id` (la pregunta vive en la plataforma)', () => {
  const c = DIEZ_CLIENTES[0]
  it('la respuesta no lee ni toca las preguntas del cerebro', async () => {
    const m = montar(c)
    fila(m.t, c, UUID_PREGUNTA, 'horario de cocina')
    const r = await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22', { pregunta_id: UUID_PREGUNTA }))
    expect(r.body).toMatchObject({ ok: true, guardada: true })
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'pendiente' })
  })
  it('un texto de tema parecido no reemplaza, con o sin `pregunta_id`', async () => {
    for (const o of [{}, { pregunta_id: UUID_PREGUNTA }]) {
      const m = montar(c)
      await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22'))
      const r = await rutaDueno(m.deps, responder(c, 'cocina', 'hasta las 23', { respondido_en: '2026-10-16T14:00:00Z', ...o }))
      expect(r.body.reemplaza).toBeNull()
      expect(vivas(m.t)).toHaveLength(2)
    }
  })
  it('el mismo tema con otra escritura sí reemplaza', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22'))
    const r = await rutaDueno(m.deps, responder(c, 'Horario  de COCINA', 'hasta las 23', { pregunta_id: UUID_PREGUNTA, respondido_en: '2026-10-16T14:00:00Z' }))
    expect(r.body.reemplaza).toBeTruthy()
    expect(vivas(m.t)).toHaveLength(1)
    expect(String(vivas(m.t)[0].contenido)).toContain('hasta las 23')
  })
})

describe('los límites de lo parecido', () => {
  const c = DIEZ_CLIENTES[1] // clínica de 3 sedes
  const leer = (m: ReturnType<typeof montar>, q: Record<string, string>) => rutaLeerDueno({ db: m.base.db as never, ahora: AHORA }, { client_id: c.id, ...q })
  it('lo parecido de otra sede no se ofrece', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas', 'norte 80', { sede_clave: 'norte' }))
    await rutaDueno(m.deps, responder(c, 'ventas', 'centro 50', { sede_clave: 'centro' }))
    const l = await leer(m, { tema: 'ventas temporada baja', sede_clave: 'norte' })
    expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['norte 80'])
  })
  it('varias parecidas: la más nueva primero; sin parecidas la lista va vacía', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas de enero', 'vieja', { respondido_en: '2026-09-01T00:00:00Z' }))
    await rutaDueno(m.deps, responder(c, 'ventas de marzo', 'nueva', { respondido_en: '2026-10-01T00:00:00Z' }))
    expect(((await leer(m, { tema: 'ventas' })).body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['nueva', 'vieja'])
    expect((await leer(m, { tema: 'horario de cocina' })).body).toMatchObject({ parecidas: [], pendientes_parecidas: null })
  })
  it('la lectura con `canal`: los parecidos también respetan ese filtro', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas de enero', 'por el tablero'))
    await rutaDueno(m.deps, responder(c, 'ventas de marzo', 'por Slack', { canal: 'MD de Slack' }))
    const l = await leer(m, { tema: 'ventas', canal: 'MD de Slack' })
    expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['por Slack'])
  })
  it('un dato del manual no lo reemplaza una respuesta de tema parecido', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'manual · eslogan', 'el de siempre', { canal: 'dashboard · manual' }))
    const r = await rutaDueno(m.deps, responder(c, 'eslogan', 'otro', { respondido_en: '2026-10-16T14:00:00Z' }))
    expect(r.body.reemplaza).toBeNull()
    expect(vivas(m.t)).toHaveLength(2)
  })
  it('una respuesta con la clave del catálogo de finanzas (guion bajo) es el mismo tema que su texto', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'frecuencia_visita', 'una vez por semana'))
    expect((await leer(m, { tema: 'frecuencia visita' })).body).toMatchObject({ respondida: true, total: 1 })
  })
})

describe('la regla de la plataforma (#939) no cambia con la puerta del cerebro', () => {
  it('esElMismoTema sigue siendo «palabras en común»; la puerta usa la exacta', () => {
    expect(esElMismoTema('presupuesto de pauta', 'Pauta: presupuesto')).toBe(true)
    expect(esExactamenteElMismoTema('presupuesto de pauta', 'Pauta: presupuesto')).toBe(false)
    expect(esElMismoTema('presupuesto de pauta', 'presupuesto de sueldos')).toBe(false)
    expect(esElMismoTema('', 'x')).toBe(false)
  })
})
