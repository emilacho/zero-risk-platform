/**
 * Lo que Tu oficina enseña de cada decisión (04-nov · pedido de CC5): quién pregunta, para qué, qué se destraba, qué se puede hacer, lo contestado y qué hizo el sistema. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { DIAS_DEL_REGISTRO, pasosDelPlan, TITULO_NO_VOLVIO, TOPE_DEL_REGISTRO } from '../src/lib/direccion/decisiones-registro'
import { MAX_INTENTOS_DE_DESPERTAR } from '../src/lib/finanzas/conversa/pausa'

const AHORA = new Date('2026-11-04T20:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ENC = '99999999-9999-4999-8999-999999999999'
const CLIENTES = [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'active' }, { id: C2, name: 'Dos', industry: 'software', status: 'active' }, { id: CP, name: 'zz prueba', industry: 'x', status: 'onboarding' }]
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString()
const base = () => new DbFalsa().semilla('clients', CLIENTES)
const ctx = (db: DbFalsa): Contexto => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return { db, ahora: () => AHORA, env: {} }
}
const pregunta = (x: Record<string, unknown> = {}) => ({ id: 'p1', client_id: C1, tema: 'cupo diario', tema_norm: 'cupo', pregunta: '¿Cuántas mesas?', estado: 'pendiente', canal: 'x', preguntado_por_oficina: 'financiera', preguntado_por_agente: 'jefe-financiero', creado_en: hace(1), ...x })
const espera = (x: Record<string, unknown> = {}) => ({ id: 'e1', client_id: C1, tipo: 'finanzas', clave: `finanzas:${ENC}`, estado: 'esperando', despertado: null, despertar_intentos: 0, creado_en: hace(1), sobre: { corrida: 'corr-1', material: 'pesado' }, ...x })
const buzon = (preguntas: Record<string, unknown>[], version = 1, encargo_id = ENC) => ({ encargo_id, tipo: 'buzon_respuestas', version, contenido: { preguntas } })

describe('campos de cada decisión', () => {
  it('🔴 una pregunta dice quién pregunta y qué se puede hacer', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [pregunta()])))
    expect(r.decisiones[0]).toMatchObject({ pregunta_de: { oficina: 'financiera', agente: 'jefe-financiero' }, permite: ['responder', 'descartar'], detiene: false })
  })
  it('🔴 una pregunta sin pausa no inventa para qué ni qué se destraba', async () => {
    const d = (await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [pregunta()])))).decisiones[0]
    expect(d.para_que).toBeUndefined(); expect(d.destraba).toBeUndefined()
  })
  it('🔴 la firma de finanzas solo permite aceptar: editar cifras no tiene ruta', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [{ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1) }])))
    expect(r.decisiones[0].permite).toEqual(['aceptar'])
    expect(r.decisiones[0].pregunta_de?.oficina).toBe('financiera')
    expect(r.decisiones[0].para_que).toMatch(/hallazgos críticos/)
  })
  it('🔴 la tarjeta de la pausa solo avisa: no permite nada', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [espera()])))
    expect(r.decisiones[0]).toMatchObject({ subtipo: 'plan_en_pausa', permite: [], detiene: true })
  })
  it('una pregunta de finanzas por el canal viejo no se contesta aquí', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_preguntas', [{ id: 'f', client_id: C1, clave: 'x', texto: 'y', estado: 'enviada', creado_en: hace(1) }])))
    expect(r.decisiones[0]).toMatchObject({ permite: [], pregunta_de: { oficina: 'financiera', agente: null } })
  })
  it('🔴 un plan por aprobar dice qué arranca y que detiene el trabajo; su decisión sigue en su panel', async () => {
    const r = await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [{ id: 'a', client_id: C1, plan_id: 'plan-1', version: 1, estado: 'pendiente', creado_en: hace(1) }])))
    const d = r.decisiones.find((x) => x.id === 'plan-1')
    expect(d).toMatchObject({ detiene: true }); expect(d?.destraba).toMatch(/PDF/); expect(d?.permite).toBeUndefined()
  })
})

describe('¿esta pregunta es de la pausa?', () => {
  const conPausa = () => base().semilla('esperas_del_dueno', [espera()])
  it('🔴 la que pertenece: detiene, con su para qué y su destraba', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta()]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    const d = r.decisiones.find((x) => x.id === 'p1')
    expect(d).toMatchObject({ detiene: true }); expect(d?.para_que).toMatch(/redactor/); expect(d?.destraba).toMatch(/apenas contestes/)
  })
  it('🔴 la que se enlaza por tema aunque le falte el id', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta()]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: null }])])))
    expect(r.decisiones.find((x) => x.id === 'p1')?.detiene).toBe(true)
  })
  it('🔴 otra pregunta del mismo cliente NO detiene: la pausa no se la apropia', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta({ id: 'p2', tema: 'color del logo' })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    const d = r.decisiones.find((x) => x.id === 'p2')
    expect(d?.detiene).toBe(false); expect(d?.para_que).toBeUndefined()
  })
  it('🔴 con la pausa de OTRO cliente, no detiene', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta({ client_id: C2 })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    expect(r.decisiones.find((x) => x.id === 'p1')?.detiene).toBe(false)
  })
  it('🔴 si no se pudo leer qué preguntas son de la pausa, no se afirma nada y la lista sigue entera', async () => {
    const db = conPausa().semilla('cerebro_dueno_preguntas', [pregunta()]); db.fallar['finanzas_artefactos'] = 'se cayó'
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.find((x) => x.id === 'p1')).not.toHaveProperty('detiene')
    expect(r.completo).toBe(true)
  })
  it('🔴 usa la última versión del buzón, no la primera', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta()]).semilla('finanzas_artefactos', [buzon([{ clave: 'otra', pregunta_id: 'x' }], 1), buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }], 2)])))
    expect(r.decisiones.find((x) => x.id === 'p1')?.detiene).toBe(true)
  })
  it('🔴 con varias, dice cuántas y el margen real', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('cerebro_dueno_preguntas', [pregunta(), pregunta({ id: 'p2', tema: 'dias abiertos' })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }, { clave: 'dias_abiertos', pregunta_id: 'p2' }])])))
    expect(r.decisiones.find((x) => x.id === 'p1')?.destraba).toMatch(/las 2 preguntas.*15 minutos/)
  })
})

describe('el plan que no volvió', () => {
  const soltada = (x: Record<string, unknown> = {}) => espera({ estado: 'soltada', despertado: false, despertar_intentos: MAX_INTENTOS_DE_DESPERTAR, despertar_detalle: 'fallo 3: el plan contestó 503', soltada_en: hace(1), ...x })
  it('🔴 agotados los intentos, vuelve a la lista con su motivo', async () => {
    const d = (await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada()])))).decisiones[0]
    expect(d).toMatchObject({ subtipo: 'plan_no_volvio', titulo: TITULO_NO_VOLVIO, permite: [], detiene: true, volvio: { motivo: 'fallo 3: el plan contestó 503' } })
  })
  it('🔴 mientras el vigía sigue reintentando no molesta al dueño', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ despertar_intentos: MAX_INTENTOS_DE_DESPERTAR - 1 })])))).total).toBe(0)
  })
  it('🔴 si despertó, no vuelve', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ despertado: true })])))).total).toBe(0)
  })
  it('🔴 sin el dato de si despertó, no se afirma que falló', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ despertado: null })])))).total).toBe(0)
  })
  it('🔴 la de un cliente de práctica no sale', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ client_id: CP })])))).total).toBe(0)
  })
  it('🔴 pasada la semana ya no sale', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ creado_en: hace(DIAS_DEL_REGISTRO + 1) })])))).total).toBe(0)
  })
  it('🔴 no se filtra un secreto en el motivo', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada({ despertar_detalle: 'fallo sk-ant-api03-ABCDEFGHIJKLMN' })])))
    expect(JSON.stringify(r)).not.toContain('ABCDEFGHIJKLMN')
  })
})

describe('el registro de lo contestado', () => {
  const respondida = (x: Record<string, unknown> = {}) => pregunta({ estado: 'respondida', respondida_en: hace(0.5), ficha_id: 'f1', ...x })
  const estados = (r: { registro: { estado: string }[] }) => r.registro.map((p) => p.estado)
  it('🔴 sin pausa: pregunto, respondiste, guardado', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [respondida()])))
    const c = r.contestadas[0]
    expect(estados(c)).toEqual(['pregunto', 'respondiste', 'guardado'])
    expect(c).toMatchObject({ resultado: 'guardada', cliente: 'Uno', tipo: 'pregunta_al_dueno' })
    expect(c.registro[0].texto).toBe('La oficina financiera preguntó')
  })
  it('🔴 sin ficha no dice «guardado»', async () => {
    const c = (await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [respondida({ ficha_id: null })])))).contestadas[0]
    expect(estados(c)).toEqual(['pregunto', 'respondiste'])
  })
  const conPlan = (e: Record<string, unknown>, corrida?: Record<string, unknown>) => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [espera(e)]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])
    if (corrida) db.semilla('plan_corridas', [{ client_id: C1, corrida: 'corr-1', actualizado_en: hace(0.1), ...corrida }])
    return db
  }
  it('🔴 retomado: el plan arrancó y la corrida sigue', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'soltada', despertado: true, soltada_en: hace(0.4) }, { estado: 'corriendo' })))).contestadas[0]
    expect(estados(c)).toEqual(['pregunto', 'respondiste', 'guardado', 'retomado']); expect(c.resultado).toBe('retomada')
  })
  it('🔴 terminado: la corrida quedó hecha', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'soltada', despertado: true, soltada_en: hace(0.4) }, { estado: 'hecha' })))).contestadas[0]
    expect(estados(c).at(-1)).toBe('terminado'); expect(c.resultado).toBe('terminada')
  })
  it('🔴 falló: la corrida falló, con su motivo', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'soltada', despertado: true, soltada_en: hace(0.4) }, { estado: 'fallida', motivo: 'se agotó el tope' })))).contestadas[0]
    expect(estados(c).at(-1)).toBe('fallo'); expect(c).toMatchObject({ resultado: 'fallo', motivo: 'se agotó el tope' })
  })
  it('🔴 una corrida de otro cliente con el mismo nombre no cuenta', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'soltada', despertado: true, soltada_en: hace(0.4) }).semilla('plan_corridas', [{ client_id: C2, corrida: 'corr-1', estado: 'hecha', actualizado_en: hace(0.1) }])))).contestadas[0]
    expect(c.resultado).toBe('retomada')
  })
  it('🔴 falló: el plan no volvió', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'soltada', despertado: false, despertar_intentos: MAX_INTENTOS_DE_DESPERTAR, despertar_detalle: 'el plan contestó 503', soltada_en: hace(0.4) })))).contestadas[0]
    expect(c).toMatchObject({ resultado: 'fallo', motivo: 'el plan contestó 503' })
  })
  it('🔴 sigue en pausa: lo dice sin dar por hecho que arrancó', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'esperando' })))).contestadas[0]
    expect(estados(c).at(-1)).toBe('espera'); expect(c.resultado).toBe('espera')
  })
  it('🔴 reemplazada: tu respuesta no llegó a usarse', async () => {
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'reemplazada' })))).contestadas[0]
    expect(c.resultado).toBe('fallo'); expect(c.motivo).toMatch(/reemplazó/)
  })
  it('🔴 la pregunta de otra espera no se confunde', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [espera({ estado: 'soltada', despertado: true })]).semilla('finanzas_artefactos', [buzon([{ clave: 'otra_cosa', pregunta_id: 'otra' }])])
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('guardada')
  })
  it('🔴 descartada por Emilio y archivada por el sistema se distinguen', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [pregunta({ id: 'a', estado: 'obsoleta', obsoleta_en: hace(0.2), motivo_descarte: 'Emilio la descartó en Tu oficina: ya no aplica' }), pregunta({ id: 'b', estado: 'obsoleta', obsoleta_en: hace(0.3), motivo_descarte: 'preguntas viejas archivadas' })])))
    const a = r.contestadas.find((x) => x.id === 'a')!, b = r.contestadas.find((x) => x.id === 'b')!
    expect(a.registro[1]).toMatchObject({ quien: 'tu', texto: 'La descartaste' }); expect(b.registro[1]).toMatchObject({ quien: 'sistema', texto: 'Se archivó' })
    expect(a.resultado).toBe('descartada')
  })
  it('🔴 la firma queda; el ensayo no', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [{ id: 't1', client_id: C1, version: 3, estado: 'firmado', dry_run: false, firmado_en: hace(0.2), creado_en: hace(1) }, { id: 't2', client_id: C1, version: 4, estado: 'firmado', dry_run: true, firmado_en: hace(0.2), creado_en: hace(1) }])))
    expect(r.contestadas.map((c) => c.id)).toEqual(['t1'])
    expect(estados(r.contestadas[0])).toEqual(['pregunto', 'firmaste']); expect(r.contestadas[0].resultado).toBe('firmada')
  })
  it('🔴 fuera de los 7 días no sale; la práctica tampoco', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [respondida({ id: 'vieja', respondida_en: hace(DIAS_DEL_REGISTRO + 1) }), respondida({ id: 'practica', client_id: CP })])))
    expect(r.contestadas).toEqual([])
  })
  it('🔴 lo más nuevo primero, con el tope declarado', async () => {
    const filas = Array.from({ length: TOPE_DEL_REGISTRO + 1 }, (_, i) => respondida({ id: `p${i}`, ficha_id: null, respondida_en: new Date(AHORA.getTime() - i * 60_000).toISOString() }))
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', filas)))
    expect(r.contestadas).toHaveLength(TOPE_DEL_REGISTRO); expect(r.contestadas[0].id).toBe('p0'); expect(r.registro_completo).toBe(false)
  })
  it('🔴 si el registro falla, lo dice y los pendientes siguen enteros', async () => {
    const db = base().semilla('finanzas_tableros', [{ id: 't', client_id: C1, version: 1, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1) }]); db.fallar['finanzas_artefactos'] = 'se cayó'
    db.semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [espera({ estado: 'soltada', despertado: true })])
    const r = await leerDecisiones(ctx(db))
    expect(r.registro_completo).toBe(false); expect(r.completo).toBe(true); expect(r.total).toBe(1)
    expect(estados(r.contestadas[0])).toEqual(['pregunto', 'respondiste', 'guardado'])
  })
  it('🔴 el título sale en lenguaje claro y sin secretos', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [respondida({ ficha_id: null, pregunta: 'P3 · ¿Cuánto? sk-ant-api03-ABCDEFGHIJKLMN' })])))
    expect(r.contestadas[0].titulo).not.toMatch(/P3|ABCDEFGHIJKLMN/)
  })
  it('nada de esto escribe: la base revienta si alguien lo intenta', async () => {
    await expect(leerDecisiones(ctx(conPlan({ estado: 'esperando' })))).resolves.toBeTruthy()
  })
})

describe('pasosDelPlan', () => {
  it('sin espera no afirma nada', () => { expect(pasosDelPlan(null, null)).toEqual({ pasos: [], resultado: null, motivo: null }) })
})
