/**
 * LA PUERTA DEL DUEÑO (16-oct) · US$ 0 · base falsa · sin modelo. Con los diez clientes de prueba (cualquier rubro, país y canal) y la mecánica completa:
 * respuesta → ficha «confirmada por el dueño» · reemplazo por tema · sede · tarde/repetida · privacidad · preguntas pendientes que no se repiten · lectura · resumen vivo.
 */
import { describe, expect, it } from 'vitest'
import { descripcionDeRespuesta, esElMismoTema, palabrasDelTema, rutaDueno, rutaLeerDueno, sinDatosPersonales, temaNormal, type DepsDeDueno } from '../dueno'
import { armarResumen, cargarEntradaDelResumen } from '../resumen-vivo'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina-financiera', workflow_execution_id: 'ex-1' }
const OF = { oficina: 'financiera', agente: 'chief-financial-officer' }
const OTRA = { oficina: 'estrategia', agente: 'planning-director' }
const montar = (c: ClienteSintetico, ahora = AHORA, activo = true) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => ahora.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora, activo, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, base, deps }
}
const respuesta = (c: ClienteSintetico, o: Record<string, unknown> = {}) => ({
  client_id: c.id, dry_run: false, ...WF, tema: 'presupuesto de pauta', pregunta: '¿Cuánto quieres gastar en pauta?', respuesta: '200 por semana', canal: 'MD de Slack', mensaje_ref: 'slack:1', respondido_en: '2026-10-15T14:00:00Z', preguntado_por: OF, ...o,
})
const vivas = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && !f.retirada_en)

describe('el tema es texto libre: «el mismo tema» se decide por palabras significativas', () => {
  it('conectores, orden y plural no cambian el tema; otro tema no se confunde', () => {
    expect(palabrasDelTema('Presupuesto de pauta')).toEqual(['pauta', 'presupuesto'])
    expect(temaNormal('pauta, presupuesto')).toBe('pauta-presupuesto')
    expect(esElMismoTema('presupuesto de pauta', 'Pauta: presupuesto')).toBe(true)
    expect(esElMismoTema('costo por plato', 'costo del plato')).toBe(true)
    expect(esElMismoTema('presupuesto de pauta', 'presupuesto de sueldos')).toBe(false)
    expect(esElMismoTema('afluencia', 'herramientas')).toBe(false)
    expect(esElMismoTema('', 'x')).toBe(false)
  })
  it('privacidad: correos, teléfonos y @usuarios se omiten; las cifras del negocio no', () => {
    const r = sinDatosPersonales('Escríbele a juan.perez@mail.com o al +593 99 123 4567, su cuenta es @juanp. Gasto 200 por semana, costo 2,10')
    expect(r.redactado).toBe(true)
    expect(r.texto).not.toMatch(/juan\.perez|123 4567|@juanp/)
    expect(r.texto).toContain('200 por semana, costo 2,10')
    expect(sinDatosPersonales('unos 20 clientes al mediodía').redactado).toBe(false)
  })
})

describe('entrada: lo que se exige', () => {
  const c = DIEZ_CLIENTES[0]
  it('apagado por omisión: no lee ni escribe', async () => {
    const m = montar(c, AHORA, false)
    const r = await rutaDueno(m.deps, respuesta(c))
    expect(r.body).toMatchObject({ apagado: true })
    expect(m.t.cerebro_fichas).toHaveLength(0)
  })
  it('dry_run obligatorio; con false exige workflow; falta quién preguntó, el tema, el canal o la fecha', async () => {
    const m = montar(c)
    expect((await rutaDueno(m.deps, { ...respuesta(c), dry_run: undefined })).status).toBe(400)
    expect((await rutaDueno(m.deps, { ...respuesta(c), workflow_id: undefined })).status).toBe(403)
    expect((await rutaDueno(m.deps, respuesta(c, { preguntado_por: { oficina: 'x' } }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { tema: '' }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { tema: 'de la' }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { canal: '' }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { respondido_en: 'ayer' }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { respuesta: '' }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { respuesta: 'x'.repeat(2001) }))).status).toBe(400)
    expect((await rutaDueno(m.deps, respuesta(c, { client_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }))).status).toBe(404)
    expect(m.t.cerebro_fichas).toHaveLength(0)
  })
  it('dry_run no guarda nada y dice qué haría', async () => {
    const m = montar(c)
    const r = await rutaDueno(m.deps, respuesta(c, { dry_run: true }))
    expect(r.body).toMatchObject({ ok: true, dry_run: true, reemplaza: null })
    expect(m.t.cerebro_fichas).toHaveLength(0)
    expect(m.t.cerebro_ingresos).toHaveLength(0)
  })
})

describe('para los diez clientes: la respuesta queda «confirmada por el dueño»', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais})`, async () => {
      const m = montar(c)
      const r = await rutaDueno(m.deps, respuesta(c, { respuesta: `unos 20 clientes ${c.nombre}`.slice(0, 60) }))
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, guardada: true, reemplaza: null })
      const f = vivas(m.t)
      expect(f).toHaveLength(1)
      expect(f[0]).toMatchObject({ origen: 'dueno', clase: 'dato_del_dueno', atributo: 'dueno:pauta-presupuesto', propiedad: 'propia', alcance: 'cliente', decision: 'suma', sede: null })
      expect(String(f[0].contenido)).toMatch(/Confirmado por el dueño \(MD de Slack, 2026-10-15\)/)
      expect(String(f[0].contenido)).toContain('«unos 20 clientes')
      expect((f[0].provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ tema: 'presupuesto de pauta', canal: 'MD de Slack', mensaje_ref: 'slack:1', respondido_en: '2026-10-15T14:00:00.000Z', preguntado_por: OF })
      expect(m.t.cerebro_ingresos[0]).toMatchObject({ origen: 'dueno', client_id: c.id })
      // y el resumen vivo la muestra con fecha y canal
      const ent = await cargarEntradaDelResumen(crearBaseFalsa(m.t as never).db as never, { client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, zonas: [], sedes: c.sedes.map((s) => ({ clave: s.clave, ciudad: s.ciudad })) })
      expect(ent.ok).toBe(true)
      if (!ent.ok) return
      const texto = armarResumen(ent.entrada).texto
      expect(texto).toMatch(/## Lo que dijo el dueño \(confirmado por él\)\n- presupuesto de pauta: «unos 20 clientes/)
      expect(texto).toMatch(/\(dueño · MD de Slack · 2026-10-15\)/)
    })
  }
})

describe('una respuesta nueva al mismo tema reemplaza; otro tema o otra sede, no', () => {
  const c = DIEZ_CLIENTES[1] // clínica de 3 sedes
  it('mismo tema (aunque cambie el orden o los conectores): la vieja queda archivada con su motivo; el historial se conserva', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c))
    const r = await rutaDueno(m.deps, respuesta(c, { tema: 'Pauta: presupuesto', respuesta: '300 por semana', mensaje_ref: 'slack:2', respondido_en: '2026-10-16T09:00:00Z' }))
    expect(r.body).toMatchObject({ ok: true, guardada: true })
    expect(r.body.reemplaza).toBeTruthy()
    expect(vivas(m.t)).toHaveLength(1)
    expect(String(vivas(m.t)[0].contenido)).toContain('300 por semana')
    expect(vivas(m.t)[0]).toMatchObject({ decision: 'reemplaza' })
    const vieja = m.t.cerebro_fichas.find((f) => String(f.contenido).includes('200 por semana'))!
    expect(vieja.retirada_en).toBeTruthy()
    expect(String(vieja.motivo_retirada)).toMatch(/reemplazada por .* \(nueva respuesta del dueño/)
    expect(vieja.reemplazada_por).toBe(vivas(m.t)[0].id)
    expect(m.t.cerebro_fichas).toHaveLength(2)
  })
  it('otro tema convive; otra sede convive (cada sede su respuesta)', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c))
    await rutaDueno(m.deps, respuesta(c, { tema: 'costo por insumo', respuesta: '2,10', mensaje_ref: 'slack:3' }))
    await rutaDueno(m.deps, respuesta(c, { sede_clave: 'norte', respuesta: '100 por semana', mensaje_ref: 'slack:4' }))
    await rutaDueno(m.deps, respuesta(c, { sede_clave: 'centro', respuesta: '80 por semana', mensaje_ref: 'slack:5' }))
    await rutaDueno(m.deps, respuesta(c, { sede_clave: 'norte', respuesta: '120 por semana', mensaje_ref: 'slack:6', respondido_en: '2026-10-16T10:00:00Z' }))
    const v = vivas(m.t)
    expect(v.map((f) => `${f.atributo}|${f.sede ?? '-'}`).sort()).toEqual(['dueno:costo-insumo|-', 'dueno:pauta-presupuesto|-', 'dueno:pauta-presupuesto|centro', 'dueno:pauta-presupuesto|norte'])
    expect(String(v.find((f) => f.sede === 'norte')!.contenido)).toContain('120 por semana')
    expect(String(v.find((f) => f.sede === null && f.atributo === 'dueno:pauta-presupuesto')!.contenido)).toContain('200 por semana')
  })
  it('una sede que no existe se rechaza; en un cliente de UNA sola sede la sede se ignora (todo es de esa sede)', async () => {
    const m = montar(c)
    expect((await rutaDueno(m.deps, respuesta(c, { sede_clave: 'luna' }))).status).toBe(400)
    const uno = DIEZ_CLIENTES[0]
    const m1 = montar(uno)
    await rutaDueno(m1.deps, respuesta(uno, { sede_clave: 'quito' }))
    expect(vivas(m1.t)[0].sede).toBeNull()
  })
  it('la misma respuesta (mismo mensaje) no se guarda dos veces; una respuesta más vieja que la vigente llega «tarde» y queda archivada', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c))
    const dos = await rutaDueno(m.deps, respuesta(c))
    expect(dos.body).toMatchObject({ repetida: true })
    expect(m.t.cerebro_fichas).toHaveLength(1)
    const tarde = await rutaDueno(m.deps, respuesta(c, { respuesta: '50 por semana', mensaje_ref: 'slack:0', respondido_en: '2026-10-10T08:00:00Z' }))
    expect(tarde.body).toMatchObject({ llego_tarde: true, reemplaza: null })
    expect(vivas(m.t)).toHaveLength(1)
    expect(String(vivas(m.t)[0].contenido)).toContain('200 por semana')
    expect(m.t.cerebro_fichas.find((f) => String(f.contenido).includes('50 por semana'))!.retirada_en).toBeTruthy()
  })
  it('privacidad: lo guardado no trae correos, teléfonos ni usuarios de terceros', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c, { respuesta: 'Pregúntale a ana@proveedor.com o al 0991234567; sale 12 por caja' }))
    const f = vivas(m.t)[0]
    expect(JSON.stringify(f)).not.toMatch(/ana@proveedor|0991234567/)
    expect(String(f.contenido)).toContain('sale 12 por caja')
    expect((f.provenance_tag as { datos: Record<string, unknown> }).datos.datos_personales_omitidos).toBe(true)
  })
})

describe('que nadie repita la pregunta', () => {
  const c = DIEZ_CLIENTES[3]
  const pregunta = (o: Record<string, unknown> = {}) => ({ client_id: c.id, dry_run: false, ...WF, evento: 'pregunta', tema: 'presupuesto de pauta', pregunta: '¿Cuánto quieres gastar en pauta?', canal: 'MD de Slack', preguntado_por: OF, ...o })
  it('la primera oficina registra; otra oficina del mismo tema recibe «ya preguntada»; la misma oficina, «repetida»', async () => {
    const m = montar(c)
    const a = await rutaDueno(m.deps, pregunta())
    expect(a.body).toMatchObject({ ok: true, registrada: true })
    const b = await rutaDueno(m.deps, pregunta({ preguntado_por: OTRA, tema: 'pauta: presupuesto' }))
    expect(b.body).toMatchObject({ registrada: false, ya_preguntada: true, pendiente: { oficina: 'financiera', agente: 'chief-financial-officer' } })
    expect((await rutaDueno(m.deps, pregunta())).body).toMatchObject({ registrada: false, repetida: true })
    expect(m.t.cerebro_dueno_preguntas).toHaveLength(1)
    // otro tema no se bloquea
    expect((await rutaDueno(m.deps, pregunta({ preguntado_por: OTRA, tema: 'afluencia al mediodía' }))).body).toMatchObject({ registrada: true })
    // `forzar` registra igual (el agente decidió que hay que volver a preguntar)
    expect((await rutaDueno(m.deps, pregunta({ preguntado_por: OTRA, forzar: true }))).body).toMatchObject({ registrada: true })
  })
  it('una pregunta pendiente de hace más de 72 h ya no bloquea', async () => {
    const m = montar(c, new Date(AHORA.getTime() - 80 * 3_600_000))
    await rutaDueno(m.deps, pregunta())
    const despues = montar(c, AHORA)
    despues.t.cerebro_dueno_preguntas.push(...m.t.cerebro_dueno_preguntas)
    expect((await rutaDueno(despues.deps, pregunta({ preguntado_por: OTRA }))).body).toMatchObject({ registrada: true })
  })
  it('`forzar` registra la pregunta aunque ya esté respondida (el agente decidió que ya no vale)', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c))
    expect((await rutaDueno(m.deps, pregunta({ forzar: true }))).body).toMatchObject({ registrada: true })
  })
  it('la pregunta guardada tampoco trae datos personales', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c, { pregunta: 'Confirma con ana@proveedor.com cuánto gastas en pauta' }))
    expect(JSON.stringify(vivas(m.t))).not.toMatch(/ana@proveedor/)
  })
  it('la respuesta cierra lo pendiente; después, quien pregunta recibe lo respondido (con fecha) en vez de registrar', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, pregunta())
    await rutaDueno(m.deps, respuesta(c))
    expect(m.t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'respondida' })
    expect(m.t.cerebro_dueno_preguntas[0].ficha_id).toBe(vivas(m.t)[0].id)
    const otra = await rutaDueno(m.deps, pregunta({ preguntado_por: OTRA }))
    expect(otra.body).toMatchObject({ registrada: false, ya_respondida: true })
    expect((otra.body.respuestas as Array<Record<string, unknown>>)[0]).toMatchObject({ respuesta: '200 por semana', canal: 'MD de Slack', confirmado_por_el_dueno: true })
    expect(m.t.cerebro_dueno_preguntas).toHaveLength(1)
  })
  it('lectura: ¿ya se respondió? cuándo y por qué canal; qué sigue pendiente; sin tema, lo último que dijo', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, respuesta(c))
    await rutaDueno(m.deps, respuesta(c, { tema: 'afluencia al mediodía', respuesta: 'unos 20 clientes', mensaje_ref: 'slack:9' }))
    await rutaDueno(m.deps, pregunta({ tema: 'herramientas que usa', pregunta: '¿Qué herramientas usas?' }))
    const l = await rutaLeerDueno({ db: m.base.db as never, ahora: new Date(AHORA.getTime() + 3 * 86_400_000) }, { client_id: c.id, tema: 'pauta presupuesto' })
    expect(l.body).toMatchObject({ ok: true, respondida: true, modelos_llamados: 0 })
    expect((l.body.respuestas as Array<Record<string, unknown>>)).toHaveLength(1)
    expect((l.body.respuestas as Array<Record<string, unknown>>)[0]).toMatchObject({ respuesta: '200 por semana', canal: 'MD de Slack', hace_dias: 3, respondido_en: '2026-10-15T14:00:00.000Z' })
    expect((await rutaLeerDueno({ db: m.base.db as never, ahora: AHORA }, { client_id: c.id, tema: 'sueldos del personal' })).body).toMatchObject({ respondida: false, respuestas: [] })
    const sin = await rutaLeerDueno({ db: m.base.db as never, ahora: AHORA }, { client_id: c.id })
    expect(sin.body.respondida).toBeNull()
    expect((sin.body.respuestas as unknown[]).length).toBe(2)
    expect((sin.body.pendientes as Array<Record<string, unknown>>).map((p) => p.tema)).toEqual(['herramientas que usa'])
    expect((await rutaLeerDueno({ db: m.base.db as never }, { client_id: 'no-uuid' })).status).toBe(400)
  })
  it('descripción: el agente recibe la fecha, no un veredicto de vigencia', () => {
    const d = descripcionDeRespuesta({ id: 'f1', sede: 'norte', observado_en: '2026-10-01T00:00:00Z', provenance_tag: { datos: { tema: 't', respuesta: 'r', canal: 'c', respondido_en: '2026-10-01T00:00:00.000Z' } } }, AHORA)
    expect(d).toMatchObject({ hace_dias: 15, sede: 'norte' })
    expect(d).not.toHaveProperty('vigente')
  })
})

describe('el código no sabe de ningún cliente', () => {
  it('la lectura y el registro no nombran a un cliente real', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const src = fs.readFileSync(`${__dirname}/../dueno.ts`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '')
    expect(src).not.toMatch(/n[aá]ufrago|ol[oó]n|guayaquil|peniche/i)
  })
})
