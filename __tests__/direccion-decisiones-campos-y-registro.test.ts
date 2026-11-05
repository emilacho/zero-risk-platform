/**
 * Lo que Tu oficina enseña de cada decisión (04-nov · pedido de CC5): quién pregunta, para qué, qué se destraba, qué se puede hacer, lo contestado y qué hizo el sistema. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { DIAS_DEL_REGISTRO, esperaDeLaRespuesta, pasosDelPlan, TITULO_NO_VOLVIO, TOPE_DEL_REGISTRO, yaLoSuperoOtroPlan, noVolvio } from '../src/lib/direccion/decisiones-registro'
import { cifrasDelBloque, unidadDeDinero } from '../src/lib/direccion/decisiones-firma'
import { MAX_INTENTOS_DE_DESPERTAR } from '../src/lib/finanzas/conversa/pausa'
import { TIPO_PLAN } from '../src/lib/oficina/tablero/plan'

const AHORA = new Date('2026-11-04T20:00:00Z')
const MS = AHORA.getTime()
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
    expect(r.decisiones[0].para_que).toMatch(/no dejó firmado/)
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
    const c = (await leerDecisiones(ctx(conPlan({ estado: 'reemplazada', actualizado_en: hace(0.4) })))).contestadas[0]
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
  it('sin espera no afirma nada', () => { expect(pasosDelPlan(null, null, MS)).toEqual({ pasos: [], resultado: null, motivo: null }) })
  const corrida = (estado: string, x: Record<string, unknown> = {}) => ({ client_id: C1, corrida: 'corr-1', estado, actualizado_en: hace(0.1), ...x })
  const despierta = { estado: 'soltada', despertado: true, soltada_en: hace(0.4) }
  it('🔴 una corrida vencida también es un plan que no terminó', () => {
    expect(pasosDelPlan(despierta, corrida('vencida', { motivo: 'venció' }), MS)).toMatchObject({ resultado: 'fallo', motivo: 'venció' })
    expect(pasosDelPlan(despierta, corrida('vencida'), MS).motivo).toBe('El plan no terminó.')
  })
  it('🔴 sigue en pausa: lo dice aunque su corrida diga otra cosa, y sin inventar hora', () => {
    const p = pasosDelPlan({ estado: 'esperando', despertado: true }, corrida('hecha'), MS)
    expect(p.resultado).toBe('espera'); expect(p.pasos).toHaveLength(1); expect(p.pasos[0]).toMatchObject({ cuando: null, quien: 'sistema', estado: 'espera' }); expect(p.pasos[0].texto).toMatch(/sigue en pausa/)
  })
  it('🔴 soltada y todavía sin despertar: no afirma que arrancó ni que falló', () => {
    for (const e of [{ estado: 'soltada', despertado: false, despertar_intentos: MAX_INTENTOS_DE_DESPERTAR - 1, soltada_en: hace(0.4) }, { estado: 'soltada', despertado: null, soltada_en: hace(0.4) }]) {
      const p = pasosDelPlan(e, corrida('hecha'), MS)
      expect(p.resultado).toBe('espera'); expect(p.pasos[0].texto).toMatch(/todavía no vuelve/)
    }
  })
  it('🔴 despertó: con la corrida en marcha arrancó; sin verla, no se afirma', () => {
    expect(pasosDelPlan(despierta, corrida('corriendo'), MS).pasos[0].texto).toMatch(/volvió a arrancar/); const p = pasosDelPlan(despierta, null, MS); expect(p.resultado).toBe('retomada'); expect(p.pasos[0].texto).toMatch(/no consta/)
  })
  it('🔴 un secreto en el motivo de la corrida no sale', () => {
    expect(JSON.stringify(pasosDelPlan(despierta, corrida('fallida', { motivo: 'fallo sk-ant-api03-ABCDEFGHIJKLMN' }), MS))).not.toContain('ABCDEFGHIJKLMN')
  })
})

describe('05-nov · a qué pausa pertenece una respuesta (corrección 1 y 2 de CC7)', () => {
  const respondida = (x: Record<string, unknown> = {}) => pregunta({ estado: 'respondida', respondida_en: hace(0.5), ficha_id: 'f1', ...x })
  const E2 = '88888888-8888-4888-8888-888888888888'
  /** dos pausas del mismo tema, por encargos distintos: la vieja con corrida fallida y la nueva con corrida hecha */
  const pausaVieja = espera({ id: 'vieja', estado: 'soltada', despertado: true, creado_en: hace(6.5), soltada_en: hace(6), actualizado_en: hace(6), sobre: { corrida: 'corr-vieja' } })
  const pausaNueva = espera({ id: 'nueva', clave: `finanzas:${E2}`, estado: 'soltada', despertado: true, creado_en: hace(1), soltada_en: hace(0.4), actualizado_en: hace(0.4), sobre: { corrida: 'corr-nueva' } })
  const corridas = [{ client_id: C1, corrida: 'corr-vieja', estado: 'fallida', motivo: 'se agotó el tope', actualizado_en: hace(5.9) }, { client_id: C1, corrida: 'corr-nueva', estado: 'hecha', actualizado_en: hace(0.3) }]
  const buzones = [buzon([{ clave: 'cupo_diario', pregunta_id: null }], 1, ENC), buzon([{ clave: 'cupo_diario', pregunta_id: null }], 1, E2)]

  it('🔴 CC7-1: una pregunta suelta de hoy no hereda el fallo de la pausa de hace 6 días del mismo tema', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [pausaVieja]).semilla('finanzas_artefactos', [buzones[0]]).semilla('plan_corridas', [corridas[0]])
    const c = (await leerDecisiones(ctx(db))).contestadas[0]
    expect(c).toMatchObject({ resultado: 'guardada', motivo: null }); expect(c.registro.map((p) => p.estado)).toEqual(['pregunto', 'respondiste', 'guardado'])
  })
  it('🔴 CC7-2: con dos pausas del mismo tema da la que corresponde, en cualquier orden', async () => {
    for (const esperas of [[pausaVieja, pausaNueva], [pausaNueva, pausaVieja]]) for (const arts of [buzones, [...buzones].reverse()]) {
      const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', esperas).semilla('finanzas_artefactos', arts).semilla('plan_corridas', corridas)
      expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('terminada')
    }
  })
  it('🔴 CC7-2: la respuesta de aquella semana da la pausa de aquella semana', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida({ respondida_en: hace(6.2) })]).semilla('esperas_del_dueno', [pausaNueva, pausaVieja]).semilla('finanzas_artefactos', buzones).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0]).toMatchObject({ resultado: 'fallo', motivo: 'se agotó el tope' })
  })
  it('🔴 la que llegó después de soltarse no se usó, aunque traiga su id: no dice que el plan arrancó con ella', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida({ respondida_en: hace(0.2) })]).semilla('esperas_del_dueno', [pausaNueva]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }], 1, E2)]).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('guardada')
  })
  it('🔴 por tema: enlaza si la pausa estaba abierta, aunque la pregunta fuera anterior', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida({ creado_en: hace(3) })]).semilla('esperas_del_dueno', [pausaNueva]).semilla('finanzas_artefactos', [buzones[1]]).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('terminada')
  })
  it('🔴 por tema: la pausa de otro cliente no cuenta', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida({ client_id: C2 })]).semilla('esperas_del_dueno', [pausaNueva]).semilla('finanzas_artefactos', [buzones[1]]).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('guardada')
  })
  it('🔴 por id: enlaza aunque el tema sea distinto', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida({ tema: 'otro tema del todo' })]).semilla('esperas_del_dueno', [pausaNueva]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }], 1, E2)]).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('terminada')
  })
  it('🔴 una pausa vieja que sigue abierta recibe la respuesta de hoy: no la corta la semana', async () => {
    const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [espera({ creado_en: hace(DIAS_DEL_REGISTRO + 3) })]).semilla('finanzas_artefactos', [buzones[0]])
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('espera')
  })
  it('🔴 si la lectura de esperas se recorta, se queda con las más nuevas', async () => {
    const viejas = Array.from({ length: TOPE_DEL_REGISTRO }, (_, i) => espera({ id: `v${i}`, clave: `finanzas:v${i}`, estado: 'soltada', despertado: true, creado_en: hace(30), soltada_en: hace(29), actualizado_en: hace(29) }))
    const db = base().semilla('cerebro_dueno_preguntas', [respondida()]).semilla('esperas_del_dueno', [...viejas, pausaNueva]).semilla('finanzas_artefactos', [buzones[1]]).semilla('plan_corridas', corridas)
    expect((await leerDecisiones(ctx(db))).contestadas[0].resultado).toBe('terminada')
  })
  describe('esperaDeLaRespuesta', () => {
    const a = { id: 'a', estado: 'esperando', creado_en: hace(3) }, b = { id: 'b', estado: 'esperando', creado_en: hace(1) }
    it('🔴 sin fecha de respuesta no adivina', () => { expect(esperaDeLaRespuesta(null, [a], [a])).toBeNull() })
    it('🔴 dos abiertas: la más nueva, en cualquier orden', () => { expect(esperaDeLaRespuesta(hace(0.5), [], [a, b])?.id).toBe('b'); expect(esperaDeLaRespuesta(hace(0.5), [], [b, a])?.id).toBe('b') })
    it('🔴 mismo instante: desempata igual en cualquier orden', () => { const c = { id: 'c', estado: 'esperando', creado_en: hace(1) }; expect(esperaDeLaRespuesta(hace(0.5), [], [b, c])?.id).toBe('c'); expect(esperaDeLaRespuesta(hace(0.5), [], [c, b])?.id).toBe('c') })
    it('🔴 el id gana al tema', () => { expect(esperaDeLaRespuesta(hace(0.5), [a], [b])?.id).toBe('a') })
    it('🔴 por tema no enlaza con una pausa posterior a la respuesta', () => { expect(esperaDeLaRespuesta(hace(2), [], [b])).toBeNull() })
    it('🔴 por id sí: se pregunta justo antes de guardar la pausa', () => { expect(esperaDeLaRespuesta(hace(2), [b], [])?.id).toBe('b') })
    it('🔴 por id con la respuesta antes de dos pausas: la primera que llegó', () => { const c = { id: 'c', estado: 'esperando', creado_en: hace(1.5) }; expect(esperaDeLaRespuesta(hace(2), [b, c], [])?.id).toBe('c') })
    it('🔴 cerrada sin fecha de cierre: no afirma que la usó', () => { expect(esperaDeLaRespuesta(hace(0.5), [], [{ id: 'x', estado: 'soltada', creado_en: hace(1) }])).toBeNull() })
    it('🔴 justo a la hora de soltarse, todavía cuenta', () => { const h = hace(0.5); expect(esperaDeLaRespuesta(h, [], [{ id: 'x', estado: 'soltada', creado_en: hace(1), soltada_en: h }])?.id).toBe('x') })
  })
})

describe('05-nov · la tarjeta del plan que no volvió se va sola (corrección 3 de CC7)', () => {
  const soltada = (x: Record<string, unknown> = {}) => espera({ estado: 'soltada', despertado: false, despertar_intentos: MAX_INTENTOS_DE_DESPERTAR, soltada_en: hace(3), creado_en: hace(4), ...x })
  const corrida = (x: Record<string, unknown> = {}) => ({ client_id: C1, corrida: 'corr-2', estado: 'hecha', espera_desde: hace(1), ...x })
  const con = (...corridas: Record<string, unknown>[]) => leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada()]).semilla('plan_corridas', corridas)))
  it('🔴 un plan posterior terminado la quita, y queda contada', async () => {
    const r = await con(corrida()); expect(r.total).toBe(0); expect(r.omitidas.planes_ya_superados).toBe(1)
  })
  it('🔴 también si ese plan está corriendo o en pausa', async () => {
    for (const estado of ['corriendo', 'en_pausa']) expect((await con(corrida({ estado }))).total).toBe(0)
  })
  it('🔴 sigue si el posterior no consta que corriera', async () => {
    for (const estado of ['esperando', 'vencida', 'fallida']) expect((await con(corrida({ estado }))).total).toBe(1)
  })
  it('🔴 sigue si la corrida es anterior', async () => { expect((await con(corrida({ espera_desde: hace(5) }))).total).toBe(1) })
  it('🔴 sigue si la corrida es de otro cliente', async () => { const r = await con(corrida({ client_id: C2 })); expect(r.total).toBe(1); expect(r.omitidas.planes_ya_superados).toBe(0) })
  it('🔴 su propia corrida en marcha no la quita; terminada, sí', async () => {
    expect((await con(corrida({ corrida: 'corr-1', estado: 'corriendo' }))).total).toBe(1)
    expect((await con(corrida({ corrida: 'corr-1', estado: 'hecha', espera_desde: hace(5) }))).total).toBe(0)
  })
  it('🔴 si las corridas no se leen, la tarjeta se queda y la lista sigue completa', async () => {
    const db = base().semilla('esperas_del_dueno', [soltada()]).semilla('plan_corridas', [corrida()]); db.fallar['plan_corridas'] = 'se cayó'
    const r = await leerDecisiones(ctx(db)); expect(r.total).toBe(1); expect(r.completo).toBe(true)
  })
  it('🔴 con dos clientes, el plan de uno no le quita la tarjeta al otro', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada(), soltada({ id: 'e2', client_id: C2, clave: 'finanzas:otro' })]).semilla('plan_corridas', [corrida()])))
    expect(r.decisiones.map((d) => d.client_id)).toEqual([C2]); expect(r.omitidas.planes_ya_superados).toBe(1)
  })
  it('🔴 una corrida fallida no consta que corriera, aunque llegue a la cuenta', () => {
    expect(yaLoSuperoOtroPlan({ client_id: C1, corrida: 'corr-1', creado_en: hace(4) }, [corrida({ estado: 'fallida' })])).toBe(false)
  })
  it('🔴 trae quién preguntaba', async () => { expect((await con()).decisiones[0].pregunta_de).toEqual({ oficina: 'financiera', agente: null }) })
  it('🔴 sin soltada_en mide desde que se creó', () => {
    expect(yaLoSuperoOtroPlan({ client_id: C1, corrida: 'corr-1', creado_en: hace(4) }, [corrida()])).toBe(true)
    expect(yaLoSuperoOtroPlan({ client_id: C1, corrida: 'corr-1' }, [corrida()])).toBe(false)
  })
})

describe('05-nov · reservas de CC7: nada de promesas ni motivos falsos', () => {
  const conPausa = () => base().semilla('esperas_del_dueno', [espera()])
  const tarjeta = (r: { decisiones: { subtipo: string; destraba?: string }[] }) => r.decisiones.find((d) => d.subtipo === 'plan_en_pausa')
  const tres = [pregunta(), pregunta({ id: 'p2', tema: 'dias abiertos' }), pregunta({ id: 'p3', tema: 'ticket' })]
  it('🔴 con el buzón sin leer no promete «apenas contestes»', async () => {
    const db = conPausa().semilla('cerebro_dueno_preguntas', tres); db.fallar['finanzas_artefactos'] = 'se cayó'
    const r = await leerDecisiones(ctx(db)); expect(tarjeta(r)).not.toHaveProperty('destraba'); expect(r.decisiones.find((x) => x.id === 'p1')).not.toHaveProperty('destraba')
  })
  it('🔴 sin preguntas por contestar no promete nada', async () => {
    const r = await leerDecisiones(ctx(conPausa().semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    expect(tarjeta(r)).not.toHaveProperty('destraba')
  })
  it('🔴 cuenta solo las de esta pausa y este cliente', async () => {
    const db = conPausa().semilla('cerebro_dueno_preguntas', [pregunta(), pregunta({ id: 'p2', tema: 'color del logo' }), pregunta({ id: 'p3', client_id: C2 })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])
    expect(tarjeta(await leerDecisiones(ctx(db)))?.destraba).toMatch(/apenas contestes/)
  })
  it('🔴 con dos clientes en pausa, cada uno cuenta las suyas', async () => {
    const E2 = '88888888-8888-4888-8888-888888888888'
    const db = base().semilla('esperas_del_dueno', [espera(), espera({ id: 'e2', client_id: C2, clave: `finanzas:${E2}` })])
      .semilla('cerebro_dueno_preguntas', [pregunta(), pregunta({ id: 'q2', client_id: C2 }), pregunta({ id: 'q3', client_id: C2, tema: 'dias abiertos' })])
      .semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }]), buzon([{ clave: 'cupo_diario', pregunta_id: 'q2' }, { clave: 'dias_abiertos', pregunta_id: 'q3' }], 1, E2)])
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.find((x) => x.id === 'p1')?.destraba).toMatch(/apenas contestes/); expect(r.decisiones.find((x) => x.id === 'q2')?.destraba).toMatch(/las 2 preguntas/)
  })
  const tablero = (x: Record<string, unknown> = {}) => ({ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1), workflow_execution_id: `conversa:${ENC}`, ...x })
  const cierre = (contenido: Record<string, unknown>, version = 1) => ({ encargo_id: ENC, tipo: 'cierre', version, contenido })
  const firma = async (t: Record<string, unknown>, ...arts: Record<string, unknown>[]) => (await leerDecisiones(ctx(base().semilla('finanzas_tableros', [t]).semilla('finanzas_artefactos', arts)))).decisiones[0].para_que
  it('🔴 la firma nombra los críticos que constan en su cierre', async () => {
    expect(await firma(tablero(), cierre({ finanzas_id: 't', criticos_abiertos: 3 }))).toMatch(/dejó 3 hallazgos críticos abiertos/)
    expect(await firma(tablero(), cierre({ finanzas_id: 't', criticos_abiertos: 1 }))).toMatch(/dejó 1 hallazgo crítico abierto/)
  })
  it('🔴 sin firma por otro motivo no habla de críticos', async () => {
    expect(await firma(tablero(), cierre({ finanzas_id: 't', criticos_abiertos: 0 }))).toMatch(/no dejó firmado/)
    expect(await firma(tablero())).toMatch(/no dejó firmado/)
    expect(await firma(tablero({ workflow_execution_id: null }), cierre({ finanzas_id: 't', criticos_abiertos: 3 }))).toMatch(/no dejó firmado/)
  })
  it('🔴 el cierre de otro tablero no cuenta; de los suyos, el último', async () => {
    expect(await firma(tablero(), cierre({ finanzas_id: 'otro', criticos_abiertos: 3 }))).toMatch(/no dejó firmado/)
    expect(await firma(tablero(), cierre({ finanzas_id: 't', criticos_abiertos: 5 }, 1), cierre({ finanzas_id: 't', criticos_abiertos: 2 }, 2))).toMatch(/dejó 2 hallazgos/)
  })
  it('🔴 solo el artefacto de cierre cuenta', async () => {
    expect(await firma(tablero(), { encargo_id: ENC, tipo: 'acuerdo', version: 9, contenido: { finanzas_id: 't', criticos_abiertos: 7 } })).toMatch(/no dejó firmado/)
  })
  it('🔴 si el cierre no se lee, el texto sigue siendo cierto y la lista completa', async () => {
    const db = base().semilla('finanzas_tableros', [tablero()]); db.fallar['finanzas_artefactos'] = 'se cayó'
    const r = await leerDecisiones(ctx(db)); expect(r.decisiones[0].para_que).toMatch(/no dejó firmado/); expect(r.completo).toBe(true)
  })
})

describe('05-nov · lo que los mutantes de CC7 dejaron sin sostener', () => {
  const de = (x: Record<string, unknown>) => pregunta({ estado: 'obsoleta', obsoleta_en: hace(0.2), motivo_descarte: 'Emilio la descartó', ...x })
  const firmada = (x: Record<string, unknown> = {}) => ({ id: 't', client_id: C1, version: 1, estado: 'firmado', dry_run: false, firmado_en: hace(0.2), creado_en: hace(1), ...x })
  const CB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const conBaja = () => new DbFalsa().semilla('clients', [...CLIENTES, { id: CB, name: 'Baja', industry: 'x', status: 'churned' }])
  it('🔴 el cliente de práctica no sale ni en descartes ni en firmas', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [de({ client_id: CP })]).semilla('finanzas_tableros', [firmada({ client_id: CP })])))
    expect(r.contestadas).toEqual([])
  })
  it('🔴 el cliente de baja no sale en ninguno', async () => {
    const r = await leerDecisiones(ctx(conBaja().semilla('cerebro_dueno_preguntas', [de({ client_id: CB }), pregunta({ id: 'r', client_id: CB, estado: 'respondida', respondida_en: hace(0.3) })]).semilla('finanzas_tableros', [firmada({ client_id: CB })])))
    expect(r.contestadas).toEqual([])
  })
  it('🔴 descartes y firmas de más de 7 días no salen', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [de({ obsoleta_en: hace(DIAS_DEL_REGISTRO + 1) })]).semilla('finanzas_tableros', [firmada({ firmado_en: hace(DIAS_DEL_REGISTRO + 1) })])))
    expect(r.contestadas).toEqual([])
  })
  it('🔴 un secreto en el motivo del descarte no sale', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [de({ motivo_descarte: 'Emilio: sk-ant-api03-ABCDEFGHIJKLMN' })])))
    expect(JSON.stringify(r.contestadas)).not.toContain('ABCDEFGHIJKLMN')
  })
  it('🔴 mezcla los tres tipos de más nuevo a más viejo', async () => {
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [de({ id: 'd', obsoleta_en: hace(0.3) }), pregunta({ id: 'r', estado: 'respondida', respondida_en: hace(0.1) })]).semilla('finanzas_tableros', [firmada({ firmado_en: hace(0.2) })])))
    expect(r.contestadas.map((c) => c.id)).toEqual(['r', 't', 'd'])
  })
  it('🔴 recorta al tope entre los tres tipos y lo declara, aunque ninguna lectura se haya recortado', async () => {
    const n = TOPE_DEL_REGISTRO - 20
    const filas = [...Array.from({ length: n }, (_, i) => pregunta({ id: `r${i}`, estado: 'respondida', respondida_en: new Date(AHORA.getTime() - i * 60_000).toISOString() })), ...Array.from({ length: n }, (_, i) => de({ id: `d${i}`, obsoleta_en: new Date(AHORA.getTime() - (i + n) * 60_000).toISOString() }))]
    const r = await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', filas)))
    expect(r.contestadas).toHaveLength(TOPE_DEL_REGISTRO); expect(r.contestadas[0].id).toBe('r0'); expect(r.registro_completo).toBe(false)
  })
  it('🔴 sin recortar, el registro está completo', async () => {
    expect((await leerDecisiones(ctx(base().semilla('cerebro_dueno_preguntas', [de({})])))).registro_completo).toBe(true)
  })
})

describe('05-nov · corrección de CC7 sobre #917: recibió el pedido no es arrancó', () => {
  const soltada = (x: Record<string, unknown> = {}) => espera({ estado: 'soltada', despertado: true, actualizado_en: hace(0.2), despertar_intentos: MAX_INTENTOS_DE_DESPERTAR, soltada_en: hace(1), creado_en: hace(2), ...x })
  const enPausa = (x: Record<string, unknown> = {}) => ({ client_id: C1, corrida: 'corr-1', estado: 'en_pausa', espera_desde: hace(2), ...x })
  const respondida = pregunta({ estado: 'respondida', respondida_en: hace(1.5), ficha_id: 'f1' })
  const con = (e: Record<string, unknown>, ...corridas: Record<string, unknown>[]) => base().semilla('cerebro_dueno_preguntas', [respondida]).semilla('esperas_del_dueno', [e]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])]).semilla('plan_corridas', corridas)
  it('🔴 CC7-4: agotados los intentos con la corrida en pausa, vuelve la tarjeta y el registro dice que falló', async () => {
    const r = await leerDecisiones(ctx(con(soltada(), enPausa())))
    expect(r.decisiones.find((d) => d.subtipo === 'plan_no_volvio')).toMatchObject({ detiene: true, volvio: { motivo: expect.stringMatching(/no arrancó/) } })
    expect(r.contestadas[0]).toMatchObject({ resultado: 'fallo', motivo: expect.stringMatching(/no arrancó/) }); expect(JSON.stringify(r.contestadas[0].registro)).not.toMatch(/volvió a arrancar con/)
  })
  it('🔴 con intentos por delante no molesta, y el registro no dice que arrancó', async () => {
    const r = await leerDecisiones(ctx(con(soltada({ despertar_intentos: MAX_INTENTOS_DE_DESPERTAR - 1 }), enPausa())))
    expect(r.decisiones.some((d) => d.subtipo === 'plan_no_volvio')).toBe(false)
    expect(r.contestadas[0].resultado).toBe('espera'); expect(r.contestadas[0].registro.at(-1)?.texto).toMatch(/todavía no arranca/)
  })
  it('🔴 dentro del margen tampoco: puede estar arrancando', () => {
    const e = soltada({ actualizado_en: new Date(MS - 60_000).toISOString() })
    expect(noVolvio(e, enPausa(), MS)).toBe(false)
    expect(noVolvio(soltada({ actualizado_en: new Date(MS - 5 * 60_000).toISOString() }), enPausa(), MS)).toBe(true)
  })
  it('🔴 sin el dato de si despertó, aunque la corrida siga en pausa, no afirma que falló', () => { expect(noVolvio(soltada({ despertado: null }), enPausa(), MS)).toBe(false) })
  it('🔴 la corrida en pausa de otro cliente con el mismo nombre no enciende la tarjeta', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [soltada(), soltada({ id: 'e2', client_id: C2, clave: 'finanzas:otro' })]).semilla('plan_corridas', [enPausa({ client_id: C2 })])))
    expect(r.decisiones.filter((d) => d.subtipo === 'plan_no_volvio').map((d) => d.client_id)).toEqual([C2])
  })
  it('🔴 sin saber cuándo se despertó no afirma que falló', () => { expect(noVolvio(soltada({ actualizado_en: null }), enPausa(), MS)).toBe(false) })
  it('🔴 con la corrida en marcha o sin verla, no hay tarjeta', async () => {
    expect((await leerDecisiones(ctx(con(soltada(), enPausa({ estado: 'corriendo' }))))).decisiones.some((d) => d.subtipo === 'plan_no_volvio')).toBe(false)
    expect((await leerDecisiones(ctx(con(soltada())))).decisiones.some((d) => d.subtipo === 'plan_no_volvio')).toBe(false)
  })
  it('🔴 su propia corrida en pausa no la cuenta como superada; otro plan posterior sí', async () => {
    expect((await leerDecisiones(ctx(con(soltada(), enPausa())))).omitidas.planes_ya_superados).toBe(0)
    const r = await leerDecisiones(ctx(con(soltada(), enPausa(), enPausa({ corrida: 'corr-2', estado: 'hecha', espera_desde: hace(0.1) }))))
    expect(r.decisiones.some((d) => d.subtipo === 'plan_no_volvio')).toBe(false); expect(r.omitidas.planes_ya_superados).toBe(1)
  })
  it('🔴 no se le pregunta a una espera con intentos por delante', async () => {
    expect((await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [espera({ estado: 'soltada', despertado: false, despertar_intentos: 1, soltada_en: hace(1) })])))).total).toBe(0)
  })
})

describe('05-nov · corrección de Lenovo: la firma trae qué se firma', () => {
  const cifra = (valor: number | null, x: Record<string, unknown> = {}) => ({ valor, tipo: 'supuesto', fuente: 'calculadora', ...x })
  const bloque = { cifras: { meta_por_semana: cifra(10, { tipo: 'dato' }), total_mes: cifra(1000), pauta_diaria: cifra(20), costo_por_venta: cifra(5, { min: 4, max: 6 }), meta_de_equilibrio_semana: cifra(8), techo_por_resultado: cifra(99) }, reparto: { total_mes: 1000 }, costo_por_venta: 5 }
  const tablero = (x: Record<string, unknown> = {}) => ({ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1), workflow_execution_id: `conversa:${ENC}`, bloque, ...x })
  const decision = async (t: Record<string, unknown>, arts: Record<string, unknown>[] = [], encs: Record<string, unknown>[] = []) => (await leerDecisiones(ctx(base().semilla('finanzas_tableros', [t]).semilla('finanzas_artefactos', arts).semilla('finanzas_encargos', encs)))).decisiones[0]
  const cierre = (x: Record<string, unknown> = {}) => ({ encargo_id: ENC, tipo: 'cierre', version: 1, contenido: { finanzas_id: 't', criticos_abiertos: 2, ronda_2: false, ronda_2_incompleta: false, ...x } })
  const acuerdo = (que: string, tipo = 'acuerdo', x: Record<string, unknown> = {}) => ({ encargo_id: ENC, tipo, version: 1, contenido: { hallazgos: [{ que, severidad: 'critico', estado: 'abierto', ...x }, { que: 'menor', severidad: 'alto', estado: 'abierto' }] } })
  it('🔴 trae las cifras propuestas, con su nombre, unidad y si son supuesto', async () => {
    const d = await decision(tablero(), [], [{ id: ENC, semilla: { pais: 'EC' } }])
    expect(d.cifras?.map((c) => c.clave)).toEqual(['meta_por_semana', 'total_mes', 'pauta_diaria', 'costo_por_venta', 'costo_por_venta_plan_completo', 'meta_de_equilibrio_semana'])
    expect(d.cifras?.find((c) => c.clave === 'total_mes')).toEqual({ clave: 'total_mes', nombre: 'Presupuesto total al mes', valor: 1000, unidad: 'US$', nota: 'Supuesto' })
    expect(d.cifras?.find((c) => c.clave === 'meta_por_semana')).toMatchObject({ unidad: 'ventas', nota: 'Dato' })
    expect(d.cifras?.find((c) => c.clave === 'costo_por_venta')?.nota).toBe('Supuesto · entre 4 y 6')
  })
  it('🔴 los dos costos por venta van juntos: 1000 al mes entre 10 por semana', async () => {
    const c = (await decision(tablero())).cifras?.find((x) => x.clave === 'costo_por_venta_plan_completo')
    expect(c?.valor).toBeCloseTo(1000 / (10 * 52 / 12), 1)
  })
  it('🔴 una cifra sin base no se inventa', async () => {
    const d = await decision(tablero({ bloque: { cifras: { total_mes: cifra(null, { tipo: 'sin_base' }), pauta_diaria: cifra(20) } } }))
    expect(d.cifras?.map((c) => c.clave)).toEqual(['pauta_diaria'])
  })
  it('🔴 sin cifras legibles no viene el campo: la pantalla no ofrece firmar', async () => {
    for (const b of [null, {}, { cifras: {} }, { cifras: { total_mes: cifra(null) } }]) expect(await decision(tablero({ bloque: b }))).not.toHaveProperty('cifras')
  })
  it('🔴 dice qué destraba, sin inventar que el plan espera', async () => {
    const d = await decision(tablero()); expect(d.destraba).toMatch(/no espera esta firma/); expect(d.detiene).toBe(false)
  })
  it('🔴 trae los críticos abiertos en palabras de la oficina, solo los críticos abiertos', async () => {
    const d = await decision(tablero(), [cierre(), acuerdo('falta medir el ticket')])
    expect(d.criticos).toEqual(['falta medir el ticket']); expect(d.para_que).toMatch(/dejó 2 hallazgos/)
    expect(await decision(tablero(), [cierre(), acuerdo('ya está', 'acuerdo', { estado: 'resuelto' })])).not.toHaveProperty('criticos')
  })
  it('🔴 del acuerdo que usó el cierre: ronda 2 completa, sí; a medias, no', async () => {
    expect((await decision(tablero(), [cierre({ ronda_2: true }), acuerdo('uno'), acuerdo('dos', 'acuerdo_2')])).criticos).toEqual(['dos'])
    expect((await decision(tablero(), [cierre({ ronda_2: true, ronda_2_incompleta: true }), acuerdo('uno'), acuerdo('dos', 'acuerdo_2')])).criticos).toEqual(['uno'])
    expect((await decision(tablero(), [cierre(), acuerdo('uno'), acuerdo('dos', 'acuerdo_2')])).criticos).toEqual(['uno'])
  })
  it('🔴 el cierre de otro tablero no presta sus críticos', async () => {
    const d = await decision(tablero(), [cierre({ finanzas_id: 'otro' }), acuerdo('ajeno')]); expect(d).not.toHaveProperty('criticos'); expect(d.para_que).toMatch(/no dejó firmado/)
  })
  it('🔴 un secreto en un hallazgo no sale', async () => { expect(JSON.stringify(await decision(tablero(), [cierre(), acuerdo('fallo sk-ant-api03-ABCDEFGHIJKLMN')]))).not.toContain('ABCDEFGHIJKLMN') })
  it('🔴 si críticos no es un número, no se afirma', async () => {
    expect((await decision(tablero(), [cierre({ criticos_abiertos: '3' })])).para_que).toMatch(/no dejó firmado/)
  })
  it('🔴 un encargo con otra forma no se consulta: la columna es uuid y rompería la lectura', async () => {
    const db = base().semilla('finanzas_tableros', [tablero({ workflow_execution_id: 'conversa:no-es-uuid' })])
    const pedidos: string[] = []; const f = db.from.bind(db); db.from = ((t: string) => { pedidos.push(t); return f(t) }) as typeof db.from
    const r = await leerDecisiones(ctx(db)); expect(pedidos).not.toContain('finanzas_encargos'); expect(r.decisiones[0].cifras?.length).toBeGreaterThan(0)
  })
  it('🔴 si encargo o artefactos no se leen, las cifras siguen y la lista está completa', async () => {
    const db = base().semilla('finanzas_tableros', [tablero()]); db.fallar['finanzas_artefactos'] = 'x'; db.fallar['finanzas_encargos'] = 'x'
    const r = await leerDecisiones(ctx(db)); expect(r.completo).toBe(true); expect(r.decisiones[0].cifras?.find((c) => c.clave === 'total_mes')?.unidad).toBeNull()
  })
  it('🔴 la moneda: la del encargo; sin ella solo Ecuador; sin saberla, ninguna', () => {
    expect(unidadDeDinero('USD', 'MX')).toBe('US$'); expect(unidadDeDinero('MXN', 'EC')).toBe('MXN'); expect(unidadDeDinero(null, 'ec')).toBe('US$'); expect(unidadDeDinero(null, 'MX')).toBeNull(); expect(unidadDeDinero(null, null)).toBeNull()
  })
  it('🔴 un bloque roto no tumba la lista', () => { expect(cifrasDelBloque({ cifras: { total_mes: 'x' } }, null)).toEqual([]) })
  it('🔴 la moneda del encargo llega a las cifras de dinero, y a las de ventas no', async () => {
    const d = await decision(tablero(), [], [{ id: ENC, semilla: { moneda: 'USD' } }])
    expect(d.cifras?.find((c) => c.clave === 'pauta_diaria')?.unidad).toBe('US$'); expect(d.cifras?.find((c) => c.clave === 'meta_de_equilibrio_semana')?.unidad).toBe('ventas')
  })
})

describe('05-nov · lo superado no pide firma', () => {
  const compuerta = { id: 'a', client_id: C1, plan_id: 'plan-viejo', version: 1, estado: 'pendiente', creado_en: hace(2) }
  const plan = (id: string, x: Record<string, unknown> = {}) => ({ id, client_id: C1, output_type: TIPO_PLAN, status: 'approved', provenance_tag: {}, created_at: hace(1), ...x })
  it('🔴 la aprobación de un plan ya superado no sale, y queda contada', async () => {
    const r = await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [compuerta]).semilla('client_historical_outputs', [plan('plan-nuevo')])))
    expect(r.decisiones.some((d) => d.id === 'plan-viejo')).toBe(false); expect(r.omitidas.reemplazadas).toBe(1)
  })
  it('🔴 la del plan vigente sí', async () => {
    const r = await leerDecisiones(ctx(base().semilla('plan_aprobaciones', [compuerta]).semilla('client_historical_outputs', [plan('plan-viejo')])))
    expect(r.decisiones.some((d) => d.id === 'plan-viejo')).toBe(true)
  })
  it('🔴 si los planes no se leen, se muestra', async () => {
    const db = base().semilla('plan_aprobaciones', [compuerta]).semilla('client_historical_outputs', [plan('plan-nuevo')]); db.fallar['client_historical_outputs'] = 'x'
    expect((await leerDecisiones(ctx(db))).decisiones.some((d) => d.id === 'plan-viejo')).toBe(true)
  })
})

describe('05-nov · los 4 mutantes que CC7 dejó vivos en 02046bf', () => {
  it('🔴 una pregunta de la pausa se reconoce por su id aunque el tema sea otro', async () => {
    const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', [espera()]).semilla('cerebro_dueno_preguntas', [pregunta({ tema: 'otro tema del todo' })]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])))
    expect(r.decisiones.find((d) => d.id === 'p1')?.detiene).toBe(true)
  })
  it('🔴 por id con dos pausas abiertas: la más nueva, en cualquier orden', () => {
    const a = { id: 'a', estado: 'esperando', creado_en: hace(3) }, b = { id: 'b', estado: 'esperando', creado_en: hace(1) }
    expect(esperaDeLaRespuesta(hace(0.5), [a, b], [])?.id).toBe('b'); expect(esperaDeLaRespuesta(hace(0.5), [b, a], [])?.id).toBe('b')
  })
  it('🔴 con dos pausas abiertas del cliente, manda la más nueva en cualquier orden', async () => {
    const E2 = '88888888-8888-4888-8888-888888888888'
    const vieja = espera({ id: 'vieja', creado_en: hace(3) }), nueva = espera({ id: 'nueva', clave: `finanzas:${E2}`, creado_en: hace(1) })
    for (const esperas of [[vieja, nueva], [nueva, vieja]]) {
      const r = await leerDecisiones(ctx(base().semilla('esperas_del_dueno', esperas).semilla('cerebro_dueno_preguntas', [pregunta()]).semilla('finanzas_artefactos', [buzon([{ clave: 'otra_cosa', pregunta_id: 'x' }], 1, ENC), buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }], 1, E2)])))
      expect(r.decisiones.find((d) => d.id === 'p1')?.detiene).toBe(true)
    }
  })
})
