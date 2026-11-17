/**
 * «PRODUCIR ESTAS FILAS» (CC1 · 17-nov · RESPUESTA de Lenovo, opción A) · en seco: sin base, sin red, sin modelo (US$ 0). La SALA es la de verdad en memoria.
 *   · solo una campaña PAUSADA · solo filas listas (validada / lista_para_brief), con fecha por venir y con familia · todo o nada
 *   · deja un permiso por fila y UN sobre de lote igual al del reloj (`cadena/vigia · briefear`) · la campaña sigue pausada
 *   · `listar` devuelve los permisos vigentes (la guarda del flujo de brief los lee) · `autoproducir` en pausa suelta SOLO un parte cuyas filas tengan permiso
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCIONES } from '../acciones'
import { filasProducir, filasPermitidas, loteElegido, HORAS_DE_VIDA_DEL_PERMISO, MAXIMO_DE_FILAS_ELEGIDAS } from '../elegidas'
import { filasAutoproducir, type Campana, type Fila, type ParteGuardada } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'

const CLIENTE = '96864e88-79bc-47ff-8f8e-5bf88610ec7d'
const PARTE = '22222222-2222-4222-8222-222222222222'
const AHORA = '2026-11-17T11:30:00.000Z'
const WF = { workflow_id: 'tablero', workflow_execution_id: 'tablero:dale:11:30' }

const fila = (id: string, extra: Partial<Fila> = {}): Fila & { campana_id: string; calendario_version: number } =>
  ({ id, tanda: 1, semana: 2, dia_semana: 5, fecha: '2099-11-20', hora: '10:00', red: 'instagram', formato: 'historia', pilar: null, tema: null, estado: 'validada', avisos: [], campana_id: '', calendario_version: 1, ...extra }) as unknown as Fila & { campana_id: string; calendario_version: number }

const campanaBase = (extra: Partial<Campana> = {}): Omit<Campana, 'id'> => ({
  client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: '2026-11-10', fecha_inicio_origen: 'regla', fecha_fin: '2026-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'pausada', estado_motivo: null,
  presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: true, ...extra,
})

async function montar(o: { campana?: Partial<Campana>; filas?: Array<ReturnType<typeof fila>>; parte?: Partial<ParteGuardada> } = {}) {
  const parte: ParteGuardada = { id: PARTE, client_id: CLIENTE, valido: true, briefs: [{ brief_id: 'B1', fila_id: 'f1', familia: 'kit_historias' }], ...(o.parte ?? {}) }
  const al = new AlmacenMemoria({ partes: [parte], config: { flujos: ['wf-cadena'] } })
  const c = await al.insertarCampana(campanaBase(o.campana))
  for (const f of o.filas ?? [fila('f1'), fila('f2', { fecha: '2099-11-23', formato: 'reel' }), fila('f3', { estado: 'briefeada' })]) al.filasGuardadas.push({ ...f, campana_id: c.id })
  return { al, c }
}
const producir = (al: AlmacenMemoria, c: Campana, extra: Record<string, unknown> = {}, ahora = AHORA) =>
  filasProducir(al, { campana_id: c.id, fila_ids: ['f1', 'f2'], dry_run: true, ...WF, ...extra }, ahora)

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('producir estas filas · la acción', () => {
  it('campaña pausada: deja un permiso por fila (24 h), UN sobre de lote igual al del reloj, y la campaña sigue pausada', async () => {
    const { al, c } = await montar()
    const r = await producir(al, c)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'producir', lote: loteElegido(AHORA), fila_ids: ['f1', 'f2'], version: 1, sobre: 'aceptado' })
    expect(loteElegido(AHORA)).toBe('elegidas-20261117T1130')
    expect(al.permisosDeFilas.map((p) => p.fila_id)).toEqual(['f1', 'f2'])
    expect(al.permisosDeFilas[0].vence_en).toBe(new Date(Date.parse(AHORA) + HORAS_DE_VIDA_DEL_PERMISO * 3_600_000).toISOString())
    expect(al.permisosDeFilas[0].workflow_execution_id).toBe('tablero:dale:11:30')
    expect(al.sobresEmitidos).toHaveLength(1)
    expect(al.sobresEmitidos[0]).toMatchObject({ source: 'cadena/vigia', intent: 'briefear', payload: { modo: 'parte', campana_id: c.id, lote: 'elegidas-20261117T1130', fila_ids: ['f1', 'f2'], dry_run: true, client_id: CLIENTE } })
    expect((await al.campana(c.id))!.estado).toBe('pausada')
  })

  it('por la ruta de la cadena (`filas · producir`) llega a la misma acción', async () => {
    const { al, c } = await montar()
    const r = await ACCIONES.filas.producir(al, { campana_id: c.id, fila_ids: ['f1'], dry_run: true, ...WF }, AHORA)
    expect(r.status).toBe(200); expect(al.permisosDeFilas).toHaveLength(1)
  })

  it.each([
    ['activa', 409, 'E-CAMPANA-NO-PAUSADA'], ['calendario', 409, 'E-CAMPANA-NO-PAUSADA'], ['cerrada', 409, 'E-CAMPANA-NO-PAUSADA'],
  ] as const)('campaña %s: no suelta nada (una activa la suelta el reloj)', async (estado, status, code) => {
    const { al, c } = await montar({ campana: { estado } })
    const r = await producir(al, c)
    expect(r.status).toBe(status); expect(r.cuerpo.code).toBe(code)
    expect(al.permisosDeFilas).toHaveLength(0); expect(al.sobresEmitidos).toHaveLength(0)
  })

  it('TODO O NADA: una fila ya briefeada, inexistente o vencida frena el lote entero, dice por qué, y no deja permisos ni sobre', async () => {
    const { al, c } = await montar({ filas: [fila('f1'), fila('f3', { estado: 'briefeada' }), fila('f4', { fecha: '2026-11-16' })] })
    const r = await producir(al, c, { fila_ids: ['f1', 'f3', 'f4', 'f9'] })
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-FILAS-NO-PRODUCIBLES')
    const motivos = Object.fromEntries((r.cuerpo.filas as Array<{ fila_id: string; motivo: string }>).map((m) => [m.fila_id, m.motivo]))
    expect(Object.keys(motivos).sort()).toEqual(['f3', 'f4', 'f9'])
    expect(motivos.f3).toMatch(/briefeada.*rehace por pieza/)
    expect(motivos.f4).toMatch(/ya pasó/)
    expect(motivos.f9).toMatch(/no existe/)
    expect(al.permisosDeFilas).toHaveLength(0); expect(al.sobresEmitidos).toHaveLength(0)
  })

  it('el seco lo decide la campaña: una campaña real no se ensaya por esta puerta ni una de ensayo se corre en real', async () => {
    const a = await montar({ campana: { seco: false } })
    expect((await producir(a.al, a.c, { dry_run: true })).cuerpo.code).toBe('E-SECO-NO-COINCIDE')
    const b = await montar({ campana: { seco: true } })
    expect((await producir(b.al, b.c, { dry_run: false })).cuerpo.code).toBe('E-SECO-NO-COINCIDE')
    expect(a.al.sobresEmitidos.length + b.al.sobresEmitidos.length).toBe(0)
  })

  it('lo real pasa la compuerta de la cadena (apagada = no sale nada)', async () => {
    const { al, c } = await montar({ campana: { seco: false } })
    await al.escribirConfig('estado_cadena', 'apagada')
    const r = await producir(al, c, { dry_run: false })
    expect(r.cuerpo.code).toBe('E-CADENA-APAGADA'); expect(al.sobresEmitidos).toHaveLength(0)
  })

  it('pide el contexto de la llamada, una lista limpia y un tope de filas', async () => {
    const { al, c } = await montar()
    expect((await filasProducir(al, { campana_id: c.id, fila_ids: ['f1'], dry_run: true }, AHORA)).cuerpo.code).toBe('E-WORKFLOW-CTX')
    expect((await producir(al, c, { fila_ids: [] })).cuerpo.code).toBe('E-CAMPOS')
    expect((await producir(al, c, { fila_ids: ['f1', 'f1'] })).cuerpo.code).toBe('E-FILAS-REPETIDAS')
    expect((await producir(al, c, { fila_ids: Array.from({ length: MAXIMO_DE_FILAS_ELEGIDAS + 1 }, (_, i) => `x${i}`) })).cuerpo.code).toBe('E-DEMASIADAS-FILAS')
    expect(al.sobresEmitidos).toHaveLength(0)
  })

  it('la sala rechaza el sobre: lo dice (502) con el lote', async () => {
    const { c } = await montar()
    const al = new AlmacenMemoria({ partes: [], intakeApagado: true, config: { flujos: ['wf-cadena'] } })
    const c2 = await al.insertarCampana(campanaBase()); al.filasGuardadas.push({ ...fila('f1'), campana_id: c2.id })
    const r = await producir(al, c2, { fila_ids: ['f1'] })
    expect(c.id).toBeTruthy(); expect(r.status).toBe(502); expect(r.cuerpo.code).toBe('E-SALA-RECHAZO')
  })
})

describe('producir estas filas · los candados que lo leen', () => {
  it('`filasPermitidas`: activa siempre; pausada solo si TODAS tienen permiso vigente; vencido = no; otro estado = nunca', async () => {
    const { al, c } = await montar()
    expect(await filasPermitidas(al, c, ['f1'], AHORA)).toBe(false)
    await producir(al, c, { fila_ids: ['f1'] })
    expect(await filasPermitidas(al, c, ['f1'], AHORA)).toBe(true)
    expect(await filasPermitidas(al, c, ['f1', 'f2'], AHORA)).toBe(false)
    expect(await filasPermitidas(al, c, [], AHORA)).toBe(false)
    const despues = new Date(Date.parse(AHORA) + (HORAS_DE_VIDA_DEL_PERMISO + 1) * 3_600_000).toISOString()
    expect(await filasPermitidas(al, c, ['f1'], despues)).toBe(false)
    expect(await filasPermitidas(al, { ...c, estado: 'activa' }, ['zz'], AHORA)).toBe(true)
    expect(await filasPermitidas(al, { ...c, estado: 'cerrada' }, ['f1'], AHORA)).toBe(false)
  })

  it('`filas · listar` devuelve los permisos vigentes de una campaña pausada (la guarda del flujo de brief los lee); sin pausa, lista vacía', async () => {
    const { al, c } = await montar()
    expect((await ACCIONES.filas.listar(al, { campana_id: c.id, workflow_id: 'wf-cadena', workflow_execution_id: 'ex' }, AHORA)).cuerpo.elegidas).toEqual([])
    await producir(al, c, { fila_ids: ['f1'] }, new Date().toISOString())
    expect((await ACCIONES.filas.listar(al, { campana_id: c.id, workflow_id: 'wf-cadena', workflow_execution_id: 'ex' }, AHORA)).cuerpo.elegidas).toEqual(['f1'])
    const activa = await montar({ campana: { estado: 'activa' } })
    expect((await ACCIONES.filas.listar(activa.al, { campana_id: activa.c.id, workflow_id: 'wf-cadena', workflow_execution_id: 'ex' }, AHORA)).cuerpo.elegidas).toEqual([])
  })

  it('`autoproducir` en pausa: SIN permiso no suelta nada (como antes); CON permiso de todas las filas del parte, suelta', async () => {
    const { al, c } = await montar()
    const llamar = () => filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    const sin = await llamar()
    expect(sin.status).toBe(409); expect(sin.cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA'); expect(al.sobresEmitidos).toHaveLength(0)
    await producir(al, c, { fila_ids: ['f1'] }, new Date().toISOString())
    const antes = al.sobresEmitidos.length
    const con = await llamar()
    expect(con.status).toBe(200); expect(con.cuerpo.emitidos).toBe(1); expect(al.sobresEmitidos.length).toBe(antes + 1)
  })

  it('`autoproducir` en pausa: un parte con una fila SIN permiso (o sin fila) no suelta ninguna', async () => {
    const otra = await montar({ parte: { briefs: [{ brief_id: 'B1', fila_id: 'f1', familia: 'kit_historias' }, { brief_id: 'B2', fila_id: 'f2', familia: 'video_mesa' }] } })
    await producir(otra.al, otra.c, { fila_ids: ['f1'] }, new Date().toISOString())
    const r = await filasAutoproducir(otra.al, { campana_id: otra.c.id, parte_id: PARTE, dry_run: true, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
    const sinFila = await montar({ parte: { briefs: [{ brief_id: 'B1', fila_id: null, familia: 'kit_historias' }] } })
    await producir(sinFila.al, sinFila.c, { fila_ids: ['f1'] }, new Date().toISOString())
    const r2 = await filasAutoproducir(sinFila.al, { campana_id: sinFila.c.id, parte_id: PARTE, dry_run: true, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    expect(r2.cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
  })

  it('`autoproducir` con la campaña en otro estado (no activa ni pausada) sigue igual que antes', async () => {
    const { al, c } = await montar({ campana: { estado: 'cerrada' } })
    const r = await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
  })
})

describe('producir estas filas · la tabla de permisos (migración 202611171500)', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const RAIZ = join(__dirname, '..', '..', '..', '..')
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '202611171500_cadena_filas_elegidas.sql'), 'utf8')
  const reversa = readFileSync(join(RAIZ, 'supabase', 'reversas', '202611171500_cadena_filas_elegidas_REVERSA.sql'), 'utf8')
  it('el nombre de lote que arma la acción cumple el chequeo de la tabla', () => {
    const re = new RegExp(sql.match(/lote ~ '([^']+)'/)![1])
    expect(re.test(loteElegido(AHORA))).toBe(true)
    expect(re.test('2026-W47')).toBe(false)
  })
  it('solo el servidor lee e inserta (sin borrar ni reescribir); anon y authenticated sin nada; recarga el catálogo', () => {
    expect(sql).toMatch(/revoke all on public\.cadena_filas_elegidas from anon, authenticated/)
    expect(sql).toMatch(/grant select, insert on public\.cadena_filas_elegidas to service_role/)
    expect(sql).not.toMatch(/grant [^;]*(update|delete|truncate)/i)
    expect(sql).toMatch(/notify pgrst, 'reload schema'/)
  })
  it('la reversa se niega con permisos vigentes y quita la tabla', () => {
    expect(reversa).toMatch(/vence_en > now\(\)/)
    expect(reversa).toMatch(/drop table if exists public\.cadena_filas_elegidas/)
  })
})

describe('producir estas filas · 1.ª corrida real (17-nov 11:23Z): el kit agrupa sus historias en UN brief sin fila propia', () => {
  /** la forma real del parte `009abba3`: el reel con su fila y el kit de historias sin `fila_id`; las filas del lote en `fila_ids` */
  const parteReal = { briefs: [{ brief_id: 'f2', fila_id: 'f2', familia: 'video_mesa' }, { brief_id: 'kit-K', fila_id: null, familia: 'kit_historias' }], fila_ids: ['f1', 'f2'] }
  const llamar = (al: AlmacenMemoria, c: Campana) => filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' })
  it('con permiso de TODAS las filas del lote, el kit y el reel salen', async () => {
    const { al, c } = await montar({ parte: parteReal })
    await producir(al, c, { fila_ids: ['f1', 'f2'] }, new Date().toISOString())
    const r = await llamar(al, c)
    expect(r.status).toBe(200); expect(r.cuerpo.emitidos).toBe(2)
  })
  it('si una fila del LOTE no tiene permiso (aunque el kit no la nombre), no sale nada', async () => {
    const { al, c } = await montar({ parte: parteReal })
    await producir(al, c, { fila_ids: ['f2'] }, new Date().toISOString())
    const r = await llamar(al, c)
    expect(r.status).toBe(409); expect(r.cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
  })
  it('un brief sin fila en un parte que NO declara las filas de su lote sigue sin salir', async () => {
    const { al, c } = await montar({ parte: { briefs: parteReal.briefs } })
    await producir(al, c, { fila_ids: ['f1', 'f2'] }, new Date().toISOString())
    expect((await llamar(al, c)).cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
  })
  it('una fila de brief FUERA del lote declarado también necesita permiso', async () => {
    const { al, c } = await montar({ parte: { briefs: [{ brief_id: 'f9', fila_id: 'f9', familia: 'post_img' }], fila_ids: ['f1'] } })
    await producir(al, c, { fila_ids: ['f1'] }, new Date().toISOString())
    expect((await llamar(al, c)).cuerpo.code).toBe('E-CAMPANA-NO-ACTIVA')
  })
})
