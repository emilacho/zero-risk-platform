/**
 * TEMAS PARECIDOS (05-nov) · US$ 0 · base falsa · sin modelo.
 * «Mismo tema» = mismo `pregunta_id` o el mismo texto normalizado. Un tema parecido no frena una pregunta, no reemplaza una respuesta y no se archiva por tema: se muestra APARTE para que el agente razone.
 */
import { describe, expect, it } from 'vitest'
import { esElMismoTema, esTemaParecido, parecidaDeLaFicha, rutaDueno, rutaLeerDueno, temaNormal, type DepsDeDueno } from '../dueno'
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
      expect(esElMismoTema(a, b)).toBe(false); expect(esElMismoTema(b, a)).toBe(false)
      expect(esTemaParecido(a, b)).toBe(true); expect(esTemaParecido(b, a)).toBe(true)
    })
  }
  for (const [a, b] of [['presupuesto de pauta', 'presupuesto de sueldos'], ['ventas temporada baja', 'ventas temporada alta']]) {
    it(`«${a}» y «${b}»: ni el mismo ni parecidos`, () => { expect(esElMismoTema(a, b)).toBe(false); expect(esTemaParecido(a, b)).toBe(false) })
  }
  it('el mismo tema normalizado no se ofrece como parecido; un tema vacío no es nada', () => {
    expect(esElMismoTema('Ventas  Temporada BAJA', 'ventas temporada baja')).toBe(true)
    expect(esTemaParecido('Ventas  Temporada BAJA', 'ventas temporada baja')).toBe(false)
    expect(esElMismoTema('', '')).toBe(false); expect(esElMismoTema('···', '---')).toBe(false); expect(esTemaParecido('', 'x')).toBe(false)
  })
  it('la forma de una parecida: tema, respuesta y fecha; sin fecha propia usa la de la ficha', () => {
    expect(parecidaDeLaFicha({ id: 'f', observado_en: '2026-01-01', provenance_tag: { datos: { tema: 't', respuesta: 'r', respondido_en: '2026-02-02' } } })).toEqual({ ficha_id: 'f', tema: 't', respuesta: 'r', fecha: '2026-02-02' })
    expect(parecidaDeLaFicha({ id: 'f', observado_en: '2026-01-01', provenance_tag: {} })).toEqual({ ficha_id: 'f', tema: '', respuesta: '', fecha: '2026-01-01' })
  })
})

describe('para los diez clientes', () => {
  for (const c of DIEZ_CLIENTES) {
    describe(`${c.nombre} (${c.pais})`, () => {
      it('una pregunta de tema parecido SE REGISTRA y trae aparte lo parecido', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ventas', 'unas 80 por semana'))
        const r = await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja'))
        expect(r.body).toMatchObject({ ok: true, registrada: true })
        expect(r.body.ya_respondida).toBeUndefined()
        expect(r.body.respuestas).toBeUndefined()
        expect(r.body.parecidas).toEqual([expect.objectContaining({ tema: 'ventas', respuesta: 'unas 80 por semana', fecha: '2026-10-15T14:00:00.000Z' })])
        expect(m.t.cerebro_dueno_preguntas.map((p) => [p.tema, p.estado])).toEqual([['ventas temporada baja', 'pendiente']])
      })
      it('una respuesta de tema parecido convive: no retira la otra ficha', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ticket', 'unos 12'))
        const r = await rutaDueno(m.deps, responder(c, 'ticket real', 'unos 15', { respondido_en: '2026-10-16T14:00:00Z' }))
        expect(r.body).toMatchObject({ ok: true, guardada: true, reemplaza: null })
        expect(vivas(m.t).map((f) => (f.provenance_tag as { datos: { tema: string } }).datos.tema).sort()).toEqual(['ticket', 'ticket real'])
        expect(vivas(m.t).every((f) => f.decision === 'suma')).toBe(true)
      })
      it('la misma pregunta con otra escritura sigue frenándose, y aparte trae lo parecido', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'costo de envío', '3 dólares'))
        await rutaDueno(m.deps, responder(c, 'costo', '5 dólares'))
        const r = await rutaDueno(m.deps, preguntar(c, 'COSTO  de envio'))
        expect(r.body).toMatchObject({ registrada: false, ya_respondida: true })
        expect((r.body.respuestas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['3 dólares'])
        expect((r.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['5 dólares'])
        expect(m.t.cerebro_dueno_preguntas).toHaveLength(0)
      })
      it('otra oficina con un tema parecido pendiente: registra, ve la pendiente aparte, y responder una no cierra la otra', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, preguntar(c, 'ventas'))
        const r = await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja', { preguntado_por: OTRA }))
        expect(r.body).toMatchObject({ registrada: true })
        expect(r.body.ya_preguntada).toBeUndefined()
        expect(r.body.pendientes_parecidas).toEqual([expect.objectContaining({ tema: 'ventas', oficina: 'financiera' })])
        await rutaDueno(m.deps, responder(c, 'ventas', '80'))
        expect(Object.fromEntries(m.t.cerebro_dueno_preguntas.map((p) => [p.tema, p.estado]))).toEqual({ ventas: 'respondida', 'ventas temporada baja': 'pendiente' })
      })
      it('`descartar` por tema solo toca el mismo tema', async () => {
        const m = montar(c)
        fila(m.t, c, 'p1', 'ventas'); fila(m.t, c, 'p2', 'ventas temporada baja'); fila(m.t, c, 'p3', 'VENTAS')
        const seco = await rutaDueno(m.deps, { evento: 'descartar', client_id: c.id, tema: 'ventas', motivo: 'm', dry_run: true, ...WF })
        expect((seco.body.preguntas as Array<Record<string, unknown>>).map((p) => p.pregunta_id).sort()).toEqual(['p1', 'p3'])
        expect((await rutaDueno(m.deps, { evento: 'descartar', client_id: c.id, tema: 'ventas', motivo: 'm', dry_run: false, ...WF })).body).toMatchObject({ descartadas: 2 })
        expect(m.t.cerebro_dueno_preguntas.map((p) => [p.id, p.estado])).toEqual([['p1', 'obsoleta'], ['p2', 'pendiente'], ['p3', 'obsoleta']])
      })
      it('la lectura por tema: el mismo arriba; los parecidos aparte; solo un parecido no cuenta como respondida', async () => {
        const m = montar(c)
        await rutaDueno(m.deps, responder(c, 'ventas', 'unas 80'))
        await rutaDueno(m.deps, responder(c, 'ventas temporada baja', 'unas 30'))
        fila(m.t, c, 'p1', 'ventas'); fila(m.t, c, 'p2', 'ventas de diciembre')
        const db = m.base.db as never
        const l = await rutaLeerDueno({ db, ahora: AHORA }, { client_id: c.id, tema: 'Ventas' })
        expect(l.body).toMatchObject({ respondida: true, total: 1 })
        expect((l.body.respuestas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['unas 80'])
        expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['unas 30'])
        expect((l.body.pendientes as Array<Record<string, unknown>>).map((x) => x.pregunta_id)).toEqual(['p1'])
        expect((l.body.pendientes_parecidas as Array<Record<string, unknown>>).map((x) => x.pregunta_id)).toEqual(['p2'])
        const solo = await rutaLeerDueno({ db, ahora: AHORA }, { client_id: c.id, tema: 'ventas de enero' })
        expect(solo.body).toMatchObject({ respondida: false, total: 0, respuestas: [] })
        expect((solo.body.parecidas as unknown[]).length).toBe(1)
        const sinTema = await rutaLeerDueno({ db, ahora: AHORA }, { client_id: c.id })
        expect(sinTema.body.parecidas).toBeUndefined(); expect(sinTema.body.pendientes_parecidas).toBeUndefined()
        expect((sinTema.body.respuestas as unknown[]).length).toBe(2)
      })
    })
  }
})

/** la base con la SEGUNDA lectura de preguntas caída (la primera es la de pendientes; la segunda, la de la pregunta contestada por su id) */
const conLecturaCaida = (m: ReturnType<typeof montar>) => {
  let lecturas = 0
  return { from: (t: string) => {
    const q = m.base.db.from(t)
    if (t !== 'cerebro_dueno_preguntas') return q
    return new Proxy(q as object, { get: (o, k) => {
      if (k !== 'select') return (o as Record<string | symbol, unknown>)[k]
      return (...a: unknown[]) => {
        lecturas++
        const s = (q as unknown as { select: (...x: unknown[]) => unknown }).select(...a)
        return lecturas === 1 ? s : { eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'caída' } }) }) }) }
      }
    } })
  } } as unknown as DepsDeDueno['db']
}

describe('el mismo `pregunta_id` cuenta como el mismo tema', () => {
  const c = DIEZ_CLIENTES[0]
  it('la respuesta reemplaza la ficha del tema de ESA pregunta aunque el texto del tema venga distinto, y la cierra', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22'))
    fila(m.t, c, UUID_PREGUNTA, 'horario de cocina')
    const r = await rutaDueno(m.deps, responder(c, 'cocina', 'hasta las 23', { pregunta_id: UUID_PREGUNTA, respondido_en: '2026-10-16T14:00:00Z' }))
    expect(r.body.reemplaza).toBeTruthy()
    expect(vivas(m.t)).toHaveLength(1)
    expect(String(vivas(m.t)[0].contenido)).toContain('hasta las 23')
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'respondida', ficha_id: vivas(m.t)[0].id })
  })
  it('sin `pregunta_id`, ese mismo texto parecido no reemplaza', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22'))
    fila(m.t, c, UUID_PREGUNTA, 'horario de cocina')
    const r = await rutaDueno(m.deps, responder(c, 'cocina', 'hasta las 23', { respondido_en: '2026-10-16T14:00:00Z' }))
    expect(r.body.reemplaza).toBeNull()
    expect(vivas(m.t)).toHaveLength(2)
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'pendiente' })
  })
  it('una pregunta de más de 72 h también se cierra por su id; por tema no', async () => {
    const m = montar(c)
    const vieja = new Date(AHORA.getTime() - 200 * 3_600_000).toISOString()
    fila(m.t, c, UUID_PREGUNTA, 'tema viejo', { creado_en: vieja })
    await rutaDueno(m.deps, responder(c, 'tema viejo', 'sí'))
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'pendiente' })
    await rutaDueno(m.deps, responder(c, 'tema viejo', 'sí, de verdad', { pregunta_id: UUID_PREGUNTA }))
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'respondida' })
  })
  it('con `pregunta_id` se cierra solo esa, aunque otra pendiente tenga el mismo tema', async () => {
    const m = montar(c)
    fila(m.t, c, UUID_PREGUNTA, 'ventas'); fila(m.t, c, 'p2', 'ventas')
    await rutaDueno(m.deps, responder(c, 'ventas', '80', { pregunta_id: UUID_PREGUNTA }))
    expect(m.t.cerebro_dueno_preguntas.map((p) => p.estado)).toEqual(['respondida', 'pendiente'])
  })
  it('una pregunta ya cerrada, de otro cliente o inexistente no se toca, y la respuesta se guarda', async () => {
    const m = montar(c)
    fila(m.t, c, UUID_PREGUNTA, 'ventas', { estado: 'obsoleta' })
    fila(m.t, DIEZ_CLIENTES[1], 'bbbbbbbb-0000-4000-8000-000000000002', 'ventas')
    for (const pregunta_id of [UUID_PREGUNTA, 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003', 'no-es-uuid']) {
      const r = await rutaDueno(m.deps, responder(c, 'ventas', `80 ${pregunta_id}`, { pregunta_id }))
      expect(r.body).toMatchObject({ ok: true, guardada: true })
    }
    expect(m.t.cerebro_dueno_preguntas.map((p) => p.estado)).toEqual(['obsoleta', 'pendiente'])
  })
  it('si no se puede leer la pregunta contestada: error claro y nada guardado', async () => {
    const m = montar(c)
    const r = await rutaDueno({ ...m.deps, db: conLecturaCaida(m) }, responder(c, 'ventas', '80', { pregunta_id: UUID_PREGUNTA }))
    expect(r.status).toBe(502)
    expect(vivas(m.t)).toHaveLength(0)
  })
  it('un `pregunta_id` que no es uuid no se busca en la base (allá sería un error): la respuesta se guarda', async () => {
    const m = montar(c)
    const r = await rutaDueno({ ...m.deps, db: conLecturaCaida(m) }, responder(c, 'ventas', '80', { pregunta_id: 'no-es-uuid' }))
    expect(r.body).toMatchObject({ ok: true, guardada: true })
  })
  it('una PREGUNTA que trae `pregunta_id` no toma el tema de esa fila: se juzga por su propio tema', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'horario de cocina', 'hasta las 22'))
    fila(m.t, c, UUID_PREGUNTA, 'horario de cocina', { estado: 'respondida' })
    const r = await rutaDueno(m.deps, preguntar(c, 'afluencia', { pregunta_id: UUID_PREGUNTA }))
    expect(r.body).toMatchObject({ registrada: true })
    // lo mismo si esa fila sigue pendiente (la hallada entre las pendientes tampoco presta su tema a una pregunta)
    const m2 = montar(c)
    await rutaDueno(m2.deps, responder(c, 'horario de cocina', 'hasta las 22'))
    fila(m2.t, c, UUID_PREGUNTA, 'horario de cocina')
    const r2 = await rutaDueno(m2.deps, preguntar(c, 'afluencia', { pregunta_id: UUID_PREGUNTA }))
    expect(r2.body).toMatchObject({ registrada: true })
  })
})

describe('los límites de lo parecido', () => {
  const c = DIEZ_CLIENTES[1] // clínica de 3 sedes
  it('lo parecido de otra sede no se ofrece; `forzar` registra y también lo trae', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas', 'norte 80', { sede_clave: 'norte' }))
    await rutaDueno(m.deps, responder(c, 'ventas', 'centro 50', { sede_clave: 'centro' }))
    const r = await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja', { sede_clave: 'norte', forzar: true }))
    expect(r.body).toMatchObject({ registrada: true })
    expect((r.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['norte 80'])
  })
  it('la pendiente parecida de otra sede tampoco', async () => {
    const m = montar(c)
    fila(m.t, c, 'p1', 'ventas', { sede_clave: 'centro' })
    const r = await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja', { sede_clave: 'norte' }))
    expect(r.body.pendientes_parecidas).toEqual([])
  })
  it('varias parecidas: la más nueva primero; sin parecidas la lista va vacía', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas de enero', 'vieja', { respondido_en: '2026-09-01T00:00:00Z' }))
    await rutaDueno(m.deps, responder(c, 'ventas de marzo', 'nueva', { respondido_en: '2026-10-01T00:00:00Z' }))
    const r = await rutaDueno(m.deps, preguntar(c, 'ventas'))
    expect((r.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['nueva', 'vieja'])
    expect((await rutaDueno(m.deps, preguntar(c, 'horario de cocina'))).body).toMatchObject({ parecidas: [], pendientes_parecidas: [] })
  })
  it('«ya preguntada» y «repetida» también traen lo parecido', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas de enero', '80'))
    await rutaDueno(m.deps, preguntar(c, 'ventas'))
    const otra = await rutaDueno(m.deps, preguntar(c, 'ventas', { preguntado_por: OTRA }))
    expect(otra.body).toMatchObject({ ya_preguntada: true })
    expect((otra.body.parecidas as unknown[]).length).toBe(1)
    const misma = await rutaDueno(m.deps, preguntar(c, 'ventas'))
    expect(misma.body).toMatchObject({ repetida: true })
    expect((misma.body.parecidas as unknown[]).length).toBe(1)
  })
  it('la lectura con `canal`: los parecidos también respetan ese filtro', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas de enero', 'por el tablero'))
    await rutaDueno(m.deps, responder(c, 'ventas de marzo', 'por Slack', { canal: 'MD de Slack' }))
    const l = await rutaLeerDueno({ db: m.base.db as never, ahora: AHORA }, { client_id: c.id, tema: 'ventas', canal: 'MD de Slack' })
    expect((l.body.parecidas as Array<Record<string, unknown>>).map((x) => x.respuesta)).toEqual(['por Slack'])
  })
  it('dry_run: dice lo parecido y no guarda la pregunta', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'ventas', '80'))
    const r = await rutaDueno(m.deps, preguntar(c, 'ventas temporada baja', { dry_run: true }))
    expect(r.body).toMatchObject({ registrada: false, dry_run: true })
    expect((r.body.parecidas as unknown[]).length).toBe(1)
    expect(m.t.cerebro_dueno_preguntas).toHaveLength(0)
  })
  it('un dato del manual no lo reemplaza una respuesta de tema parecido', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, responder(c, 'manual · eslogan', 'el de siempre', { canal: 'dashboard · manual' }))
    const r = await rutaDueno(m.deps, responder(c, 'eslogan', 'otro', { respondido_en: '2026-10-16T14:00:00Z' }))
    expect(r.body.reemplaza).toBeNull()
    expect(vivas(m.t)).toHaveLength(2)
  })
  it('una respuesta y su pregunta del catálogo de finanzas (clave con guion bajo) son el mismo tema', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, preguntar(c, 'frecuencia visita'))
    await rutaDueno(m.deps, responder(c, 'frecuencia_visita', 'una vez por semana'))
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'respondida' })
  })
})
